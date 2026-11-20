import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Resume, IResume } from '../models/Resume';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';
import * as aiService from '../services/aiService';
import { analyzeJobMatch } from '../services/jobMatchService';
import { captureServerEvent } from '../services/telemetryService';
import {
  build30DayViewsSeries,
  recordPublicResumeViewIfEligible,
  validateCustomSlug
} from '../utils/shareUtils';
import {
  MAX_HISTORY_SNAPSHOTS,
  buildHistorySummaryList,
  cloneSnapshotValue,
  shouldCreateSnapshot
} from '../utils/resumeHistory';
import {
  buildSafeExportFilename,
  renderResumePlainText
} from '../services/exportService';

const EDITABLE_RESUME_FIELDS = ['title', 'summary', 'templateId', 'themeConfig', 'content'] as const;

// Restrict client input to editable fields so ownership, sharing and history can't be overwritten.
const pickEditableFields = (body: Record<string, unknown> = {}) =>
  EDITABLE_RESUME_FIELDS.reduce<Record<string, unknown>>((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

export function isTemporaryAiDraft(title: unknown, content: unknown): boolean {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const sections = Array.isArray((content as { sections?: unknown[] } | undefined)?.sections)
    ? ((content as { sections: unknown[] }).sections)
    : [];
  return normalizedTitle === 'AI Draft' && sections.length === 0;
}

export function isResumeCompleted(
  title: unknown,
  summary: unknown,
  content: unknown
): boolean {
  if (isTemporaryAiDraft(title, content)) {
    return false;
  }

  const contentObj = (content || {}) as {
    basics?: { name?: unknown; email?: unknown; summary?: unknown };
    sections?: Array<{ content?: unknown[] }>;
  };
  const basics = contentObj.basics || {};
  const hasBasicsIdentity = Boolean(
    (typeof basics.name === 'string' && basics.name.trim()) ||
      (typeof basics.email === 'string' && basics.email.trim())
  );
  if (!hasBasicsIdentity) {
    return false;
  }

  const hasSummary = Boolean(
    (typeof summary === 'string' && summary.trim().length > 0) ||
      (typeof basics.summary === 'string' && basics.summary.trim().length > 0)
  );
  const sections = Array.isArray(contentObj.sections) ? contentObj.sections : [];
  const populatedSectionCount = sections.filter(
    (sec) => Array.isArray(sec?.content) && sec.content.length > 0
  ).length;

  return hasSummary || populatedSectionCount > 0;
}

function canRunModelQuery(model: unknown, method: string): boolean {
  const fn = (model as Record<string, unknown>)?.[method] as
    | { _isMockFunction?: boolean }
    | undefined;
  return mongoose.connection.readyState === 1 || Boolean(fn?._isMockFunction);
}

async function emitFirstResumeTimingIfEligible(
  user: AuthenticatedRequest['user'],
  resume: { _id?: unknown; templateId?: string; createdAt?: Date | string }
): Promise<void> {
  if (!user?._id) return;

  let priorCount: number | null = null;
  if (canRunModelQuery(Resume, 'countDocuments')) {
    try {
      const filter: Record<string, unknown> = {
        userId: user._id,
        title: { $ne: 'AI Draft' }
      };
      if (resume._id !== undefined) {
        filter._id = { $ne: resume._id };
      }
      priorCount = await Resume.countDocuments(filter);
    } catch {
      priorCount = null;
    }
  }

  const userCreatedRaw = (user as unknown as { createdAt?: Date | string }).createdAt;
  if (priorCount !== null && priorCount > 0) {
    return;
  }
  if (priorCount === null && !userCreatedRaw) {
    return;
  }

  const userCreatedMs = userCreatedRaw ? new Date(userCreatedRaw).getTime() : NaN;
  const resumeCreatedMs = resume.createdAt
    ? new Date(resume.createdAt).getTime()
    : Date.now();
  const durationMs = Number.isFinite(userCreatedMs)
    ? Math.max(0, resumeCreatedMs - userCreatedMs)
    : 0;

  captureServerEvent(user._id, 'time_to_first_resume', {
    resume_id: resume._id ? String(resume._id) : undefined,
    template_id: resume.templateId || 'modern',
    duration_ms: durationMs,
    duration_seconds: Math.round(durationMs / 1000)
  });
}

// @desc    Create a new resume
// @route   POST /api/resumes
// @access  Private (Needs Auth Middleware)
export const createResume = async (
  req: AuthenticatedRequest<{ body: IResume }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    if (!req.body) {
      throw new AppError('Missing resume data', 400);
    }

    const resume = await Resume.create({
      ...pickEditableFields(req.body),
      userId: req.user._id
    });

    const isTempDraft =
      Boolean((req.body as Record<string, unknown>).isTemporaryDraft) ||
      isTemporaryAiDraft(resume.title, resume.content);

    if (!isTempDraft) {
      const sectionCount = Array.isArray(resume.content?.sections)
        ? resume.content.sections.length
        : 0;

      captureServerEvent(req.user._id, 'resume_created', {
        resume_id: resume._id ? String(resume._id) : undefined,
        template_id: resume.templateId || 'modern',
        section_count: sectionCount,
        creation_mode: 'direct'
      });

      await emitFirstResumeTimingIfEligible(req.user, resume);

      if (isResumeCompleted(resume.title, resume.summary, resume.content)) {
        captureServerEvent(req.user._id, 'resume_completed', {
          resume_id: resume._id ? String(resume._id) : undefined,
          template_id: resume.templateId || 'modern',
          section_count: sectionCount
        });
      }
    }

    res.status(201).json({
      success: true,
      data: resume
    });
  } catch (error) {
    next(error);
  }

};

// @desc    Get all resumes for the logged-in user
// @route   GET /api/resumes/my
// @access  Private (Needs Auth Middleware)
export const getResumes = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resumes = await Resume.find({ userId: req.user?._id });
    res.json({
      success: true,
      data: resumes
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Get a single resume by its ID
// @route   GET /api/resumes/:resumeId
// @access  Private (Needs Auth Middleware)
export const getResumeById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.resumeId, // Changed from id to resumeId
      userId: req.user?._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    res.json({
      success: true,
      data: resume
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate resume content from prompt using AI
// @route   POST /api/resumes/:resumeId/generate
// @access  Private (Needs Auth Middleware)
export const generateResumeFromPrompt = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?._id;
  const { prompt } = req.body;

  if (!prompt) {
    return next(new AppError('Missing required field (prompt)', 400));
  }
  if (!userId) {
    return next(new AppError('Not authorized, user ID missing', 401));
  }

  try {
    const resume = await Resume.findOne({ _id: req.params.resumeId, userId });

    if (!resume) {
      return next(new AppError('Resume not found', 404));
    }

    const aiResponse = await aiService.analyzeResumePrompt(prompt);

    resume.summary = aiResponse.summary;
    if (aiResponse.title) resume.title = aiResponse.title;
    if (aiResponse.content) resume.content = aiResponse.content as IResume['content'];
    const updatedResume = await resume.save();

    res.json({
      success: true,
      data: updatedResume
    });

  } catch (error: any) {
    console.error('Generate resume from prompt error:', error.message);
    if (error.message.includes('AI Service')) {
      return next(new AppError(`AI Service Error: ${error.message}`, 502));
    }
    next(error);
  }
};

// @desc    Update specific fields of a resume
// @route   PATCH /api/resumes/:resumeId
// @access  Private (Needs Auth Middleware)
export const updateResume = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const existingResume = await Resume.findOne({ _id: req.params.resumeId, userId: req.user?._id });
    if (!existingResume) {
      throw new AppError('Resume not found', 404);
    }

    // Save current content and themeConfig to history only when previous snapshot is >10 min old or content changed substantially
    const summaryChanged = Boolean(
      req.body.summary !== undefined &&
      (existingResume.summary ?? '') !== (req.body.summary ?? '')
    );
    const contentChanged = Boolean(
      (req.body.content &&
        JSON.stringify(existingResume.content) !== JSON.stringify(req.body.content)) ||
      summaryChanged
    );
    const themeChanged = Boolean(
      req.body.themeConfig !== undefined &&
      JSON.stringify(existingResume.themeConfig) !== JSON.stringify(req.body.themeConfig)
    );

    const now = new Date();
    const nextContent = req.body.content !== undefined ? req.body.content : existingResume.content;
    const nextSummary = req.body.summary !== undefined ? req.body.summary : existingResume.summary;

    if (
      shouldCreateSnapshot({
        history: existingResume.history,
        prevContent: existingResume.content,
        nextContent,
        prevSummary: existingResume.summary,
        nextSummary,
        contentChanged,
        themeChanged,
        now
      })
    ) {
      if (!existingResume.history) {
        existingResume.history = [];
      }
      existingResume.history.push({
        title: existingResume.title,
        ...(existingResume.summary !== undefined ? { summary: existingResume.summary } : {}),
        content: cloneSnapshotValue(existingResume.content),
        themeConfig: cloneSnapshotValue(existingResume.themeConfig),
        updatedAt: now
      });
      // Keep at most the last 30 snapshots
      if (existingResume.history.length > MAX_HISTORY_SNAPSHOTS) {
        existingResume.history.splice(
          0,
          existingResume.history.length - MAX_HISTORY_SNAPSHOTS
        );
      }
      if (typeof (existingResume as any).markModified === 'function') {
        existingResume.markModified('history');
      }
    }

    const wasTempDraft = isTemporaryAiDraft(
      existingResume.title,
      existingResume.content
    );
    const wasCompleted = isResumeCompleted(
      existingResume.title,
      existingResume.summary,
      existingResume.content
    );
    const confirmingAiDraft = Boolean(req.body?.confirmAiDraft);

    Object.assign(existingResume, pickEditableFields(req.body));
    const resume = await existingResume.save();

    const isNowTempDraft = isTemporaryAiDraft(resume.title, resume.content);
    const isNowCompleted = isResumeCompleted(
      resume.title,
      resume.summary,
      resume.content
    );
    const sectionCount = Array.isArray(resume.content?.sections)
      ? resume.content.sections.length
      : 0;

    if ((wasTempDraft || confirmingAiDraft) && !isNowTempDraft) {
      captureServerEvent(req.user?._id, 'resume_created', {
        resume_id: resume._id ? String(resume._id) : undefined,
        template_id: resume.templateId || 'modern',
        section_count: sectionCount,
        creation_mode: confirmingAiDraft ? 'ai_accepted' : 'draft_promoted'
      });

      await emitFirstResumeTimingIfEligible(req.user, resume);
    }

    if (isNowCompleted && (!wasCompleted || confirmingAiDraft)) {
      captureServerEvent(req.user?._id, 'resume_completed', {
        resume_id: resume._id ? String(resume._id) : undefined,
        template_id: resume.templateId || 'modern',
        section_count: sectionCount
      });
    }

    res.json({
      success: true,
      data: resume
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a resume
// @route   DELETE /api/resumes/:id
// @access  Private (Needs Auth Middleware)
export const deleteResume = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOneAndDelete({
      _id: req.params.resumeId, // Changed from id to resumeId
      userId: req.user?._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Undo the last resume change
// @route   POST /api/resumes/:resumeId/undo
// @access  Private (Needs Auth Middleware)
export const undoResume = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.resumeId, userId: req.user?._id });
    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    if (!resume.history || resume.history.length === 0) {
      throw new AppError('No history available to undo', 400);
    }

    // Pop the last history state
    const lastState = resume.history.pop();
    
    // Restore the content and themeConfig
    resume.content = lastState!.content;
    if (lastState && 'themeConfig' in lastState) {
      resume.themeConfig = lastState.themeConfig;
    }

    const updatedResume = await resume.save();

    res.json({
      success: true,
      data: updatedResume
    });
  } catch (error) {
    next(error);
  }
};

const formatPublicResumePayload = (resume: IResume | Record<string, any>) => {
  const resumeObj =
    typeof (resume as IResume).toObject === 'function'
      ? (resume as IResume).toObject()
      : JSON.parse(JSON.stringify(resume));
  const rawContent = resumeObj.content || { basics: {}, sections: [], sectionOrder: [] };
  const sanitizedContent = {
    ...rawContent,
    basics: {
      ...(rawContent.basics || {})
    }
  };

  const privacy = resume.sharing?.privacy || {
    hideEmail: false,
    hidePhone: false,
    hideAddress: false
  };

  if (privacy.hideEmail) {
    delete sanitizedContent.basics.email;
  }
  if (privacy.hidePhone) {
    delete sanitizedContent.basics.phone;
  }
  if (privacy.hideAddress) {
    if (sanitizedContent.basics.location) {
      delete sanitizedContent.basics.location.address;
    }
  }

  return {
    _id: resume._id,
    title: resume.title,
    summary: resume.summary,
    templateId: resume.templateId,
    themeConfig: resume.themeConfig,
    content: sanitizedContent,
    sharing: {
      isPublic: true,
      ...(resume.sharing?.slug ? { slug: resume.sharing.slug } : {}),
      privacy: {
        hideEmail: !!privacy.hideEmail,
        hidePhone: !!privacy.hidePhone,
        hideAddress: !!privacy.hideAddress
      }
    },
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt
  };
};

// @desc    Get a publicly shared resume by its share token
// @route   GET /api/resumes/share/:shareToken
// @access  Public (Unauthenticated)
export const getPublicResumeByToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { shareToken } = req.params;
    if (!shareToken) {
      throw new AppError('Share token is required', 400);
    }

    const resume = await Resume.findOne({
      'sharing.shareToken': shareToken,
      'sharing.isPublic': true
    });

    if (!resume) {
      throw new AppError('Resume not found or share link is inactive or revoked', 404);
    }

    await recordPublicResumeViewIfEligible(resume, req);

    res.json({
      success: true,
      data: formatPublicResumePayload(resume)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a publicly shared resume by its custom slug
// @route   GET /api/public/r/:slug
// @access  Public (Unauthenticated)
export const getPublicResumeBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawSlug = req.params.slug;
    if (!rawSlug || typeof rawSlug !== 'string') {
      throw new AppError('Slug is required', 400);
    }

    const normalizedSlug = rawSlug.trim().toLowerCase();
    const check = validateCustomSlug(normalizedSlug);
    if (!check.valid) {
      throw new AppError('Resume not found or share link is inactive or revoked', 404);
    }

    const resume = await Resume.findOne({
      'sharing.slug': normalizedSlug,
      'sharing.isPublic': true
    });

    if (!resume) {
      throw new AppError('Resume not found or share link is inactive or revoked', 404);
    }

    await recordPublicResumeViewIfEligible(resume, req);

    res.json({
      success: true,
      data: formatPublicResumePayload(resume)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sharing settings for a resume
// @route   GET /api/resumes/:resumeId/share
// @access  Private (Needs Auth Middleware)
export const getShareSettings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user?._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const sharing = resume.sharing || {
      isPublic: false,
      shareToken: null,
      slug: null,
      viewCount: 0,
      lastViewedAt: null,
      dailyViews: [],
      privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
    };

    res.json({
      success: true,
      data: sharing
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update sharing settings for a resume
// @route   PATCH /api/resumes/:resumeId/share
// @access  Private (Needs Auth Middleware)
export const updateShareSettings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user?._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    if (!resume.sharing) {
      resume.sharing = {
        isPublic: false,
        shareToken: null,
        viewCount: 0,
        lastViewedAt: null,
        dailyViews: [],
        privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
      };
    }

    const { isPublic, privacy, regenerateToken } = req.body;

    if (typeof isPublic === 'boolean') {
      resume.sharing.isPublic = isPublic;
      if (isPublic) {
        // If enabling public sharing and no token exists or regenerate requested
        if (!resume.sharing.shareToken || regenerateToken) {
          resume.sharing.shareToken = crypto.randomBytes(16).toString('hex');
        }
      } else {
        // When toggling off public sharing, revoke token
        resume.sharing.shareToken = null;
      }
    } else if (regenerateToken) {
      resume.sharing.shareToken = crypto.randomBytes(16).toString('hex');
      resume.sharing.isPublic = true;
    }

    if (privacy) {
      resume.sharing.privacy = {
        hideEmail: typeof privacy.hideEmail === 'boolean' ? privacy.hideEmail : (resume.sharing.privacy?.hideEmail ?? false),
        hidePhone: typeof privacy.hidePhone === 'boolean' ? privacy.hidePhone : (resume.sharing.privacy?.hidePhone ?? false),
        hideAddress: typeof privacy.hideAddress === 'boolean' ? privacy.hideAddress : (resume.sharing.privacy?.hideAddress ?? false)
      };
    }

    await resume.save();

    res.json({
      success: true,
      data: resume.sharing
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check availability of a custom sharing slug for the owner's resume
// @route   GET /api/resumes/:resumeId/sharing/slug/check
// @access  Private (Needs Auth Middleware)
export const checkSharingSlugAvailability = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const rawSlug = typeof req.query.slug === 'string' ? req.query.slug : '';
    const check = validateCustomSlug(rawSlug);
    if (!check.valid) {
      return res.json({
        success: true,
        data: {
          slug: rawSlug,
          available: false,
          reason: check.reason
        }
      });
    }

    const existing = await Resume.findOne({
      'sharing.slug': rawSlug,
      _id: { $ne: resume._id }
    });

    if (existing) {
      return res.json({
        success: true,
        data: {
          slug: rawSlug,
          available: false,
          reason: 'This custom URL slug is already taken'
        }
      });
    }

    return res.json({
      success: true,
      data: {
        slug: rawSlug,
        available: true
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set or clear a custom sharing slug for the owner's resume
// @route   PATCH /api/resumes/:resumeId/sharing/slug
// @access  Private (Needs Auth Middleware)
export const updateSharingSlug = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    if (!resume.sharing) {
      resume.sharing = {
        isPublic: false,
        shareToken: null,
        viewCount: 0,
        lastViewedAt: null,
        dailyViews: [],
        privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
      };
    }

    const rawSlug = req.body?.slug;

    if (rawSlug === null || rawSlug === '') {
      resume.sharing.slug = undefined;
    } else {
      const check = validateCustomSlug(rawSlug);
      if (!check.valid) {
        throw new AppError(check.reason || 'Invalid custom slug', 400);
      }

      const existing = await Resume.findOne({
        'sharing.slug': rawSlug,
        _id: { $ne: resume._id }
      });

      if (existing) {
        throw new AppError('This custom URL slug is already taken', 409);
      }

      resume.sharing.slug = rawSlug;
    }

    if (typeof resume.markModified === 'function') {
      resume.markModified('sharing');
    }

    try {
      await resume.save();
    } catch (saveError: any) {
      if (saveError?.code === 11000) {
        throw new AppError('This custom URL slug is already taken', 409);
      }
      throw saveError;
    }

    const sharingData =
      typeof (resume as any).toObject === 'function'
        ? (resume as any).toObject().sharing
        : resume.sharing;

    res.json({
      success: true,
      data: {
        ...sharingData,
        slug: resume.sharing.slug ?? null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sharing view stats for the owner's resume
// @route   GET /api/resumes/:resumeId/sharing/stats
// @access  Private (Needs Auth Middleware)
export const getSharingStats = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const sharing = resume.sharing;
    const dailyViews = build30DayViewsSeries(sharing?.dailyViews);

    res.json({
      success: true,
      data: {
        viewCount: Number(sharing?.viewCount) || 0,
        lastViewedAt: sharing?.lastViewedAt ?? null,
        dailyViews,
        isPublic: Boolean(sharing?.isPublic),
        slug: sharing?.slug ?? null
      }
    });
  } catch (error) {
    next(error);
  }
};


const MAX_JOB_DESCRIPTION_LENGTH = 20000;

// @desc    Score a resume against a job description
// @route   POST /api/resumes/:resumeId/job-match
// @access  Private (Needs Auth Middleware)
export const analyzeResumeJobMatch = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { jobDescription, jobTitle } = req.body || {};

    if (typeof jobDescription !== 'string' || jobDescription.trim().length < 30) {
      throw new AppError('Job description must be at least 30 characters', 400);
    }
    if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
      throw new AppError(`Job description must be under ${MAX_JOB_DESCRIPTION_LENGTH} characters`, 400);
    }
    if (jobTitle !== undefined && typeof jobTitle !== 'string') {
      throw new AppError('Job title must be a string', 400);
    }

    const resume = await Resume.findOne({ _id: req.params.resumeId, userId: req.user?._id });
    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const resumeData = resume.toObject ? resume.toObject() : resume;
    const matchResult = analyzeJobMatch(resumeData, jobDescription, jobTitle);
    const trimmedLength = jobDescription.trim().length;
    const jdLengthBucket =
      trimmedLength < 500 ? 'short' : trimmedLength < 2000 ? 'medium' : 'long';

    captureServerEvent(req.user?._id, 'jd_analyzed', {
      resume_id: resume._id ? String(resume._id) : undefined,
      template_id: resumeData.templateId || 'modern',
      match_score: matchResult.score,
      matched_keyword_count: matchResult.totals.matched,
      missing_keyword_count: matchResult.missingKeywords.length,
      required_keyword_count: matchResult.totals.required,
      jd_length_bucket: jdLengthBucket,
      has_job_title: Boolean(typeof jobTitle === 'string' && jobTitle.trim())
    });

    captureServerEvent(req.user?._id, 'ats_analysis_completed', {
      resume_id: resume._id ? String(resume._id) : undefined,
      template_id: resumeData.templateId || 'modern',
      score: matchResult.score,
      skills_score: matchResult.breakdown.skills,
      experience_score: matchResult.breakdown.experience,
      title_score: matchResult.breakdown.title,
      suggestion_count: matchResult.suggestions.length
    });

    res.json({
      success: true,
      data: matchResult
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export a resume as an ATS-safe UTF-8 plain text file
// @route   GET /api/resumes/:resumeId/export.txt
// @access  Private (Needs Auth Middleware)
export const exportResumeTxt = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const resume = await Resume.findOne({
      _id: req.params.resumeId,
      userId: req.user._id
    });

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const resumeData = resume.toObject ? resume.toObject() : resume;
    const plainText = renderResumePlainText(resumeData);
    const txtBuffer = Buffer.from(plainText, 'utf-8');
    const filename = buildSafeExportFilename(resumeData);

    const createdAtRaw = (resumeData as { createdAt?: Date | string }).createdAt;
    const createdAtMs = createdAtRaw ? new Date(createdAtRaw).getTime() : NaN;
    const exportDurationMs = Number.isFinite(createdAtMs)
      ? Math.max(0, Date.now() - createdAtMs)
      : 0;

    captureServerEvent(req.user._id, 'resume_exported', {
      resume_id: resume._id ? String(resume._id) : undefined,
      template_id: resumeData.templateId || 'modern',
      format: 'txt',
      byte_length: txtBuffer.length
    });

    captureServerEvent(req.user._id, 'time_to_export', {
      resume_id: resume._id ? String(resume._id) : undefined,
      template_id: resumeData.templateId || 'modern',
      format: 'txt',
      duration_ms: exportDurationMs,
      duration_seconds: Math.round(exportDurationMs / 1000)
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(txtBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(txtBuffer);
  } catch (error) {
    next(error);
  }
};

// @desc    List version history summaries for a resume (newest first)
// @route   GET /api/resumes/:resumeId/history
// @access  Private (Needs Auth Middleware)
export const getResumeHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('Not authorized', 401);
    }

    const resumeId = req.params.resumeId || req.params.id;
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const items = buildHistorySummaryList(resume.history, resume.title);
    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single full snapshot from resume history by index
// @route   GET /api/resumes/:resumeId/history/:index
// @access  Private (Needs Auth Middleware)
export const getResumeHistorySnapshot = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('Not authorized', 401);
    }

    const rawIndex = String(req.params.index ?? '');
    if (!/^\d+$/.test(rawIndex)) {
      throw new AppError('Invalid history index', 400);
    }
    const index = Number(rawIndex);

    const resumeId = req.params.resumeId || req.params.id;
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const history = resume.history || [];
    if (index < 0 || index >= history.length) {
      throw new AppError('History snapshot not found', 404);
    }

    const snapshotRaw = history[index] as any;
    const snapshot = snapshotRaw?.toObject ? snapshotRaw.toObject() : snapshotRaw;

    res.json({
      success: true,
      data: {
        index,
        title:
          (typeof snapshot?.title === 'string' && snapshot.title.trim()) ||
          resume.title ||
          'Untitled Resume',
        ...(snapshot?.summary !== undefined ? { summary: snapshot.summary } : {}),
        content: snapshot?.content,
        themeConfig: snapshot?.themeConfig,
        updatedAt: snapshot?.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Snapshot current state first, then restore a resume history snapshot by index
// @route   POST /api/resumes/:resumeId/history/:index/restore
// @access  Private (Needs Auth Middleware)
export const restoreResumeHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('Not authorized', 401);
    }

    const rawIndex = String(req.params.index ?? '');
    if (!/^\d+$/.test(rawIndex)) {
      throw new AppError('Invalid history index', 400);
    }
    const index = Number(rawIndex);

    const resumeId = req.params.resumeId || req.params.id;
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const history = resume.history || [];
    if (index < 0 || index >= history.length) {
      throw new AppError('History snapshot not found', 404);
    }

    const rawTarget = history[index] as any;
    const targetSnapshot = cloneSnapshotValue(
      rawTarget?.toObject ? rawTarget.toObject() : rawTarget
    );

    if (!resume.history) {
      resume.history = [];
    }

    // Snapshot current state first before restoring
    resume.history.push({
      title: resume.title,
      ...(resume.summary !== undefined ? { summary: resume.summary } : {}),
      content: cloneSnapshotValue(resume.content),
      themeConfig: cloneSnapshotValue(resume.themeConfig),
      updatedAt: new Date()
    });

    if (resume.history.length > MAX_HISTORY_SNAPSHOTS) {
      resume.history.splice(0, resume.history.length - MAX_HISTORY_SNAPSHOTS);
    }

    const previousSnapshotIndex = resume.history.length - 1;

    // Restore target snapshot fields
    resume.content = targetSnapshot.content;
    if ('themeConfig' in targetSnapshot) {
      resume.themeConfig = targetSnapshot.themeConfig;
    }
    if (typeof targetSnapshot.title === 'string' && targetSnapshot.title.trim()) {
      resume.title = targetSnapshot.title;
    }
    if (targetSnapshot.summary !== undefined) {
      resume.summary = targetSnapshot.summary;
    } else if (targetSnapshot.content?.basics?.summary !== undefined) {
      resume.summary = targetSnapshot.content.basics.summary;
    }

    if (typeof (resume as any).markModified === 'function') {
      resume.markModified('content');
      resume.markModified('themeConfig');
      resume.markModified('history');
    }

    const saved = await resume.save();
    const updatedResume = saved && typeof saved === 'object' ? saved : resume;

    res.json({
      success: true,
      data: updatedResume,
      previousSnapshotIndex
    });
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Resume, IResume } from '../models/Resume';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';
import * as aiService from '../services/aiService';
import { analyzeJobMatch } from '../services/jobMatchService';
import {
  build30DayViewsSeries,
  recordPublicResumeViewIfEligible,
  validateCustomSlug
} from '../utils/shareUtils';
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

    // Save current content and themeConfig to history if there are changes
    const contentChanged = Boolean(req.body.content && JSON.stringify(existingResume.content) !== JSON.stringify(req.body.content));
    const themeChanged = Boolean(req.body.themeConfig !== undefined && JSON.stringify(existingResume.themeConfig) !== JSON.stringify(req.body.themeConfig));

    if (contentChanged || themeChanged) {
      if (!existingResume.history) {
        existingResume.history = [];
      }
      existingResume.history.push({
        content: existingResume.content,
        themeConfig: existingResume.themeConfig,
        updatedAt: new Date()
      });
      // Keep only the last 20 revisions to prevent document from growing indefinitely
      if (existingResume.history.length > 20) {
        existingResume.history.shift();
      }
    }

    Object.assign(existingResume, pickEditableFields(req.body));
    const resume = await existingResume.save();

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
    res.json({
      success: true,
      data: analyzeJobMatch(resumeData, jobDescription, jobTitle)
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

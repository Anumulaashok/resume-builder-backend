import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { CoverLetter, ICoverLetterRecipient } from '../models/CoverLetter';
import { Resume, IResume } from '../models/Resume';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';
import * as aiService from '../services/aiService';

const EDITABLE_COVER_LETTER_FIELDS = [
  'title',
  'resumeId',
  'recipient',
  'jobTitle',
  'jobDescription',
  'date',
  'greeting',
  'body',
  'closing',
  'templateId',
  'themeConfig'
] as const;

const pickEditableCoverLetterFields = (body: Record<string, unknown> = {}) =>
  EDITABLE_COVER_LETTER_FIELDS.reduce<Record<string, unknown>>((acc, key) => {
    if (body[key] !== undefined) {
      acc[key] = body[key];
    }
    return acc;
  }, {});

const sanitizeRecipient = (
  incoming: Partial<ICoverLetterRecipient> | undefined,
  existing?: Partial<ICoverLetterRecipient>
): ICoverLetterRecipient => ({
  name:
    typeof incoming?.name === 'string'
      ? incoming.name
      : typeof existing?.name === 'string'
        ? existing.name
        : '',
  company:
    typeof incoming?.company === 'string'
      ? incoming.company
      : typeof existing?.company === 'string'
        ? existing.company
        : '',
  address:
    typeof incoming?.address === 'string'
      ? incoming.address
      : typeof existing?.address === 'string'
        ? existing.address
        : ''
});

const resolveOwnedResume = async (
  rawResumeId: unknown,
  userId: mongoose.Types.ObjectId | string
): Promise<{ resumeId: mongoose.Types.ObjectId | null; resume: IResume | null }> => {
  if (rawResumeId === undefined || rawResumeId === null || rawResumeId === '') {
    return { resumeId: null, resume: null };
  }

  const resumeIdStr = String(rawResumeId).trim();
  if (!mongoose.Types.ObjectId.isValid(resumeIdStr)) {
    throw new AppError('Invalid resume ID', 400);
  }

  const resume = await Resume.findOne({ _id: resumeIdStr, userId });
  if (!resume) {
    throw new AppError('Linked resume not found', 404);
  }

  return {
    resumeId: resume._id as mongoose.Types.ObjectId,
    resume
  };
};

// @desc    List all cover letters for the authenticated user
// @route   GET /api/cover-letters
// @access  Private
export const getCoverLetters = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const coverLetters = await CoverLetter.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json({
      success: true,
      data: coverLetters
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single cover letter by ID
// @route   GET /api/cover-letters/:id
// @access  Private
export const getCoverLetterById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const coverLetter = await CoverLetter.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!coverLetter) {
      throw new AppError('Cover letter not found', 404);
    }

    res.json({
      success: true,
      data: coverLetter
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new cover letter
// @route   POST /api/cover-letters
// @access  Private
export const createCoverLetter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const editable = pickEditableCoverLetterFields(req.body || {});
    const { resumeId, resume } = await resolveOwnedResume(editable.resumeId, req.user._id);

    const payload: Record<string, unknown> = {
      ...editable,
      title: String(editable.title || '').trim(),
      resumeId,
      recipient: sanitizeRecipient(editable.recipient as Partial<ICoverLetterRecipient> | undefined),
      userId: req.user._id
    };

    if (resume) {
      if (payload.templateId === undefined && resume.templateId) {
        payload.templateId = resume.templateId;
      }
      if (payload.themeConfig === undefined && resume.themeConfig) {
        payload.themeConfig = resume.themeConfig;
      }
    }

    const coverLetter = await CoverLetter.create(payload);

    res.status(201).json({
      success: true,
      data: coverLetter
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a cover letter (strict field allowlist)
// @route   PUT/PATCH /api/cover-letters/:id
// @access  Private
export const updateCoverLetter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const existing = await CoverLetter.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!existing) {
      throw new AppError('Cover letter not found', 404);
    }

    const editable = pickEditableCoverLetterFields(req.body || {});

    if ('resumeId' in editable) {
      const incomingResumeId = editable.resumeId;
      if (incomingResumeId === null || incomingResumeId === '') {
        existing.resumeId = null;
      } else {
        const currentResumeIdStr = existing.resumeId ? String(existing.resumeId) : '';
        if (String(incomingResumeId) !== currentResumeIdStr) {
          const { resumeId } = await resolveOwnedResume(incomingResumeId, req.user._id);
          existing.resumeId = resumeId;
        }
      }
      delete editable.resumeId;
    }

    if ('recipient' in editable && editable.recipient !== undefined) {
      existing.recipient = sanitizeRecipient(
        editable.recipient as Partial<ICoverLetterRecipient>,
        existing.recipient
      );
      delete editable.recipient;
    }

    if (typeof editable.title === 'string') {
      editable.title = editable.title.trim();
    }

    Object.assign(existing, editable);
    const saved = await existing.save();

    res.json({
      success: true,
      data: saved
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a cover letter
// @route   DELETE /api/cover-letters/:id
// @access  Private
export const deleteCoverLetter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const deleted = await CoverLetter.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deleted) {
      throw new AppError('Cover letter not found', 404);
    }

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Duplicate an existing cover letter
// @route   POST /api/cover-letters/:id/duplicate
// @access  Private
export const duplicateCoverLetter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const source = await CoverLetter.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!source) {
      throw new AppError('Cover letter not found', 404);
    }

    let linkedResumeId: mongoose.Types.ObjectId | null = null;
    if (source.resumeId) {
      const ownedResume = await Resume.findOne({ _id: source.resumeId, userId: req.user._id });
      linkedResumeId = ownedResume ? (ownedResume._id as mongoose.Types.ObjectId) : null;
    }

    const duplicated = await CoverLetter.create({
      userId: req.user._id,
      title: `${source.title || 'Untitled Cover Letter'} (Copy)`,
      resumeId: linkedResumeId,
      recipient: sanitizeRecipient(source.recipient),
      jobTitle: source.jobTitle || '',
      jobDescription: source.jobDescription || '',
      date: source.date || new Date().toISOString().slice(0, 10),
      greeting: source.greeting || 'Dear Hiring Manager,',
      body: source.body || '',
      closing: source.closing || 'Sincerely,',
      templateId: source.templateId || 'modern',
      themeConfig: source.themeConfig
    });

    res.status(201).json({
      success: true,
      data: duplicated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Draft cover letter body from linked resume + jobDescription via aiService
// @route   POST /api/cover-letters/:id/generate
// @access  Private
export const generateCoverLetter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const coverLetter = await CoverLetter.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!coverLetter) {
      throw new AppError('Cover letter not found', 404);
    }

    let linkedResume: IResume | null = null;
    if (coverLetter.resumeId) {
      linkedResume = await Resume.findOne({
        _id: coverLetter.resumeId,
        userId: req.user._id
      });
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : undefined;
    const resumeData = linkedResume
      ? linkedResume.toObject
        ? linkedResume.toObject()
        : linkedResume
      : null;

    const generatedBody = await aiService.generateCoverLetterBody({
      resume: resumeData,
      recipient: coverLetter.recipient,
      jobTitle: coverLetter.jobTitle,
      jobDescription: coverLetter.jobDescription,
      prompt
    });

    coverLetter.body = generatedBody;
    const saved = await coverLetter.save();

    res.json({
      success: true,
      data: saved
    });
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Resume, IResume } from '../models/Resume';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';
import * as aiService from '../services/aiService';

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

    const newResume: IResume = {
      ...req.body,
      userId: req.user._id
    };

    const resume = await Resume.create(newResume);

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

// @desc    Generate resume summary from prompt using AI
// @route   POST /api/resumes/generate
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
    const aiResponse: { summary: string } = await aiService.analyzeResumePrompt(prompt);

    const resume = await Resume.findOne({ userId: userId });

    if (!resume) {
      return next(
        new AppError(
          `No resume found for user ${userId}. Create one first via POST /api/resumes.`,
          404
        )
      );
    }

    resume.summary = aiResponse.summary;
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
    next(new AppError('Server error during resume generation', 500));
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

    // Save current content to history if there are changes to content
    if (req.body.content && JSON.stringify(existingResume.content) !== JSON.stringify(req.body.content)) {
      if (!existingResume.history) {
        existingResume.history = [];
      }
      existingResume.history.push({
        content: existingResume.content,
        updatedAt: new Date()
      });
      // Keep only the last 20 revisions to prevent document from growing indefinitely
      if (existingResume.history.length > 20) {
        existingResume.history.shift();
      }
    }

    // Apply updates
    Object.assign(existingResume, req.body);
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
    
    // Restore the content
    resume.content = lastState!.content;

    const updatedResume = await resume.save();

    res.json({
      success: true,
      data: updatedResume
    });
  } catch (error) {
    next(error);
  }
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

    // Prepare public payload with privacy redaction
    const resumeObj = resume.toObject ? resume.toObject() : JSON.parse(JSON.stringify(resume));
    const rawContent = resumeObj.content || { basics: {}, sections: [], sectionOrder: [] };
    const sanitizedContent = {
      ...rawContent,
      basics: {
        ...(rawContent.basics || {})
      }
    };

    const privacy = resume.sharing?.privacy || { hideEmail: false, hidePhone: false, hideAddress: false };

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

    res.json({
      success: true,
      data: {
        _id: resume._id,
        title: resume.title,
        summary: resume.summary,
        templateId: resume.templateId,
        themeConfig: resume.themeConfig,
        content: sanitizedContent,
        sharing: {
          isPublic: true,
          privacy: {
            hideEmail: !!privacy.hideEmail,
            hidePhone: !!privacy.hidePhone,
            hideAddress: !!privacy.hideAddress
          }
        },
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt
      }
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


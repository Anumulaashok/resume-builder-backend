import { Request, Response, NextFunction } from 'express';
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
    const resume = await Resume.findOneAndUpdate(
      { _id: req.params.resumeId, userId: req.user?._id }, // Changed from id to resumeId
      req.body,
      { new: true, runValidators: true }
    );

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

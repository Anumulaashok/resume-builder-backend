import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { AppError } from '../utils/appError';
import resumeService from '../services/resumeService';

class ResumeController {
  // @desc    Create a new resume
  // @route   POST /api/resumes
  // @access  Private
  async createResume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const resume = await resumeService.createResume(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: resume
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Get all resumes for the logged-in user
  // @route   GET /api/resumes
  // @access  Private
  async getResumes(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const resumes = await resumeService.getResumes(req.user.id);

      res.json({
        success: true,
        data: resumes
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Get a single resume by its ID
  // @route   GET /api/resumes/:resumeId
  // @access  Private
  async getResumeById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const resume = await resumeService.getResumeById(req.params.resumeId, req.user.id);

      res.json({
        success: true,
        data: resume
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Generate resume summary from prompt using AI
  // @route   POST /api/resumes/generate
  // @access  Private
  async generateResumeFromPrompt(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const { prompt } = req.body;

      if (!prompt) {
        throw new AppError('Missing required field (prompt)', 400);
      }

      const updatedResume = await resumeService.generateResumeFromPrompt(req.user.id, prompt);

      res.json({
        success: true,
        data: updatedResume
      });
    } catch (error: any) {
      console.error('Generate resume from prompt error:', error.message);
      if (error.message.includes('AI Service')) {
        next(new AppError(`AI Service Error: ${error.message}`, 502));
      } else {
        next(error);
      }
    }
  }

  // @desc    Update specific fields of a resume
  // @route   PUT /api/resumes/:resumeId
  // @access  Private
  async updateResume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const resume = await resumeService.updateResume(
        req.params.resumeId,
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        data: resume
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Delete a resume
  // @route   DELETE /api/resumes/:resumeId
  // @access  Private
  async deleteResume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      await resumeService.deleteResume(req.params.resumeId, req.user.id);

      res.json({
        success: true,
        data: null
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Get basic information from a resume
  // @route   GET /api/resumes/:resumeId/basics
  // @access  Private
  async getBasicInfo(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const basicInfo = await resumeService.getBasicInfo(req.params.resumeId, req.user.id);

      res.json({
        success: true,
        data: basicInfo
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Update basic information of a resume
  // @route   PUT /api/resumes/:resumeId/basics
  // @access  Private
  async updateBasicInfo(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const basicInfo = await resumeService.updateBasicInfo(
        req.params.resumeId,
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        data: basicInfo
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Get all sections from a resume
  // @route   GET /api/resumes/:resumeId/sections
  // @access  Private
  async getSections(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const sections = await resumeService.getSections(req.params.resumeId, req.user.id);

      res.json({
        success: true,
        data: sections
      });
    } catch (error) {
      next(error);
    }
  }

  // @desc    Update the order of sections
  // @route   PUT /api/resumes/:resumeId/sections/order
  // @access  Private
  async updateSectionOrder(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401);
      }

      const { sectionOrder } = req.body;

      const updatedOrder = await resumeService.updateSectionOrder(
        req.params.resumeId,
        sectionOrder,
        req.user.id
      );

      res.json({
        success: true,
        data: updatedOrder
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ResumeController();

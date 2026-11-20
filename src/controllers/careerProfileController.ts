import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { CareerProfile } from '../models/CareerProfile';
import { AppError } from '../utils/appError';
import {
  mergeCareerProfileData,
  normalizeCareerProfilePayload
} from '../services/careerProfileService';

// @desc    Get the authenticated user's approved Career Profile (or null if none saved yet)
// @route   GET /api/career-profile
// @access  Private
export const getCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const profile = await CareerProfile.findOne({ userId: req.user._id });
    res.json({
      success: true,
      data: profile || null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save or replace the authenticated user's approved Career Profile
// @route   PUT /api/career-profile | PATCH /api/career-profile
// @access  Private
export const upsertCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const normalized = normalizeCareerProfilePayload(req.body);
    const existing = await CareerProfile.findOne({ userId: req.user._id });

    if (existing) {
      existing.basics = normalized.basics;
      existing.experiences = normalized.experiences;
      existing.projects = normalized.projects;
      existing.skills = normalized.skills;
      existing.education = normalized.education;
      existing.certifications = normalized.certifications;
      existing.lastApprovedAt = new Date();
      const saved = await existing.save();

      res.json({
        success: true,
        data: saved
      });
      return;
    }

    const created = await CareerProfile.create({
      userId: req.user._id,
      ...normalized,
      lastApprovedAt: new Date()
    });

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Merge user-approved career facts into the user's Career Profile
// @route   POST /api/career-profile/merge
// @access  Private
export const mergeCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const existing = await CareerProfile.findOne({ userId: req.user._id });
    const existingPlain = existing
      ? existing.toObject
        ? existing.toObject()
        : existing
      : null;

    const merged = mergeCareerProfileData(existingPlain, req.body);

    if (existing) {
      existing.basics = merged.basics;
      existing.experiences = merged.experiences;
      existing.projects = merged.projects;
      existing.skills = merged.skills;
      existing.education = merged.education;
      existing.certifications = merged.certifications;
      existing.lastApprovedAt = new Date();
      const saved = await existing.save();

      res.json({
        success: true,
        data: saved
      });
      return;
    }

    const created = await CareerProfile.create({
      userId: req.user._id,
      ...merged,
      lastApprovedAt: new Date()
    });

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete the authenticated user's Career Profile
// @route   DELETE /api/career-profile
// @access  Private
export const deleteCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    await CareerProfile.findOneAndDelete({ userId: req.user._id });

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

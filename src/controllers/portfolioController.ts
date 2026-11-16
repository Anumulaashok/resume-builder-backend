import { Request, Response, NextFunction } from 'express';
import { Portfolio, IPortfolio } from '../models/Portfolio';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';

const cleanSlug = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// @desc    Create a new portfolio
// @route   POST /api/portfolios
// @access  Private
export const createPortfolio = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const { title, slug, basics, sections, sectionOrder, themeConfig, isPublished } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new AppError('Portfolio title is required', 400);
    }

    const rawSlug = slug || title;
    const formattedSlug = cleanSlug(rawSlug);

    if (!formattedSlug) {
      throw new AppError('Valid vanity URL slug is required', 400);
    }

    const existingSlug = await Portfolio.findOne({ slug: formattedSlug });
    if (existingSlug) {
      throw new AppError(`The vanity URL slug "${formattedSlug}" is already in use. Please choose a different one.`, 400);
    }

    const defaultSections = [
      {
        id: 'about',
        type: 'about',
        title: 'About Me',
        content: [],
        enabled: true
      },
      {
        id: 'projects',
        type: 'projects',
        title: 'Featured Projects',
        content: [],
        enabled: true
      },
      {
        id: 'skills',
        type: 'skills',
        title: 'Skills & Expertise',
        content: [],
        enabled: true
      },
      {
        id: 'experience',
        type: 'experience',
        title: 'Experience',
        content: [],
        enabled: true
      },
      {
        id: 'contact',
        type: 'contact',
        title: 'Get In Touch',
        content: [],
        enabled: true
      }
    ];

    const defaultOrder = ['about', 'projects', 'skills', 'experience', 'contact'];

    const portfolio = await Portfolio.create({
      userId: req.user._id,
      title: title.trim(),
      slug: formattedSlug,
      isPublished: Boolean(isPublished),
      themeConfig: themeConfig || { theme: 'modern', primaryColor: '#3B82F6', layout: 'standard' },
      basics: {
        name: basics?.name || '',
        title: basics?.title || '',
        email: basics?.email || req.user.email || '',
        phone: basics?.phone || '',
        location: basics?.location || '',
        bio: basics?.bio || '',
        avatarUrl: basics?.avatarUrl || '',
        socialLinks: basics?.socialLinks || {}
      },
      sections: sections && sections.length > 0 ? sections : defaultSections,
      sectionOrder: sectionOrder && sectionOrder.length > 0 ? sectionOrder : defaultOrder
    });

    res.status(201).json({
      success: true,
      data: portfolio
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all portfolios for current user
// @route   GET /api/portfolios
// @access  Private
export const getPortfolios = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const portfolios = await Portfolio.find({ userId: req.user._id }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: portfolios.length,
      data: portfolios
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single portfolio by ID
// @route   GET /api/portfolios/:portfolioId
// @access  Private
export const getPortfolioById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const portfolio = await Portfolio.findOne({
      _id: req.params.portfolioId,
      userId: req.user._id
    });

    if (!portfolio) {
      throw new AppError('Portfolio not found', 404);
    }

    res.json({
      success: true,
      data: portfolio
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a portfolio
// @route   PUT /api/portfolios/:portfolioId
// @access  Private
export const updatePortfolio = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const portfolio = await Portfolio.findOne({
      _id: req.params.portfolioId,
      userId: req.user._id
    });

    if (!portfolio) {
      throw new AppError('Portfolio not found', 404);
    }

    const updates = req.body || {};

    if (updates.slug !== undefined) {
      const formattedSlug = cleanSlug(updates.slug);
      if (!formattedSlug) {
        throw new AppError('Valid vanity URL slug is required', 400);
      }

      if (formattedSlug !== portfolio.slug) {
        const slugExists = await Portfolio.findOne({
          slug: formattedSlug,
          _id: { $ne: portfolio._id }
        });
        if (slugExists) {
          throw new AppError(`The vanity URL slug "${formattedSlug}" is already in use. Please choose a different one.`, 400);
        }
        portfolio.slug = formattedSlug;
      }
    }

    if (updates.title !== undefined) portfolio.title = updates.title.trim();
    if (updates.isPublished !== undefined) portfolio.isPublished = Boolean(updates.isPublished);
    if (updates.themeConfig !== undefined) portfolio.themeConfig = updates.themeConfig;
    if (updates.basics !== undefined) portfolio.basics = updates.basics;
    if (updates.sections !== undefined) portfolio.sections = updates.sections;
    if (updates.sectionOrder !== undefined) portfolio.sectionOrder = updates.sectionOrder;

    const savedPortfolio = await portfolio.save();

    res.json({
      success: true,
      data: savedPortfolio
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a portfolio
// @route   DELETE /api/portfolios/:portfolioId
// @access  Private
export const deletePortfolio = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const portfolio = await Portfolio.findOneAndDelete({
      _id: req.params.portfolioId,
      userId: req.user._id
    });

    if (!portfolio) {
      throw new AppError('Portfolio not found', 404);
    }

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get published portfolio by public slug
// @route   GET /api/portfolios/public/:slug
// @access  Public (Unauthenticated, Read-Only)
export const getPublicPortfolio = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawSlug = req.params.slug;
    if (!rawSlug) {
      throw new AppError('Portfolio slug is required', 400);
    }

    const slug = cleanSlug(rawSlug);
    const portfolio = await Portfolio.findOne({ slug, isPublished: true });

    if (!portfolio) {
      throw new AppError('Portfolio not found or is not currently published.', 404);
    }

    // Return safe public fields
    res.json({
      success: true,
      data: {
        _id: portfolio._id,
        title: portfolio.title,
        slug: portfolio.slug,
        isPublished: portfolio.isPublished,
        themeConfig: portfolio.themeConfig,
        basics: portfolio.basics,
        sections: portfolio.sections,
        sectionOrder: portfolio.sectionOrder,
        createdAt: portfolio.createdAt,
        updatedAt: portfolio.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload media file for portfolio project showcase
// @route   POST /api/portfolios/upload
// @access  Private
export const uploadPortfolioMedia = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const file = req.file;
    if (!file) {
      throw new AppError('No image file uploaded', 400);
    }

    const fileUrl = `/uploads/${file.filename}`;

    res.status(201).json({
      success: true,
      url: fileUrl,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size
    });
  } catch (error) {
    next(error);
  }
};

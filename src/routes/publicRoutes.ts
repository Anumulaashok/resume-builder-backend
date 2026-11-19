import express from 'express';
import { publicShareLimiter } from '../middleware/rateLimiter';
import { validate, publicSlugParamValidation } from '../middleware/validate';
import { getPublicResumeBySlug } from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Public custom slug share route - Unauthenticated, strictly GET only, rate limited
router
  .route('/r/:slug')
  .get(
    publicShareLimiter,
    validate(publicSlugParamValidation),
    asyncHandler(getPublicResumeBySlug)
  )
  .all((req, res) => {
    res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed on public share endpoint`
    });
  });

export default router;

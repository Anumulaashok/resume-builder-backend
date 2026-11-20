import express from 'express';
import { publicShareLimiter } from '../middleware/rateLimiter';
import { validate, publicSlugParamValidation } from '../middleware/validate';
import {
  getPublicResumeBySlug,
  exportSharedResumeBySlugPdf,
  exportSharedResumeBySlugDocx,
  exportSharedResumeBySlugTxt
} from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

const disallowNonGetOnPublicSlug = (req: express.Request, res: express.Response) => {
  res.status(405).json({
    success: false,
    message: `Method ${req.method} not allowed on public share endpoint`
  });
};

// Public custom slug share export routes - Unauthenticated, strictly GET only, rate limited
router
  .route('/r/:slug/export.pdf')
  .get(
    publicShareLimiter,
    validate(publicSlugParamValidation),
    asyncHandler(exportSharedResumeBySlugPdf)
  )
  .all(disallowNonGetOnPublicSlug);

router
  .route('/r/:slug/export.docx')
  .get(
    publicShareLimiter,
    validate(publicSlugParamValidation),
    asyncHandler(exportSharedResumeBySlugDocx)
  )
  .all(disallowNonGetOnPublicSlug);

router
  .route('/r/:slug/export.txt')
  .get(
    publicShareLimiter,
    validate(publicSlugParamValidation),
    asyncHandler(exportSharedResumeBySlugTxt)
  )
  .all(disallowNonGetOnPublicSlug);

// Public custom slug share route - Unauthenticated, strictly GET only, rate limited
router
  .route('/r/:slug')
  .get(
    publicShareLimiter,
    validate(publicSlugParamValidation),
    asyncHandler(getPublicResumeBySlug)
  )
  .all(disallowNonGetOnPublicSlug);

export default router;

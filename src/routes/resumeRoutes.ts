import express from 'express';
import { protect } from '../middleware/auth';
import { validate, resumeValidation } from '../middleware/validate';
import { publicShareLimiter } from '../middleware/rateLimiter';
import {
  createResume,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume,
  undoResume,
  generateResumeFromPrompt,
  analyzeResumeJobMatch,
  getPublicResumeByToken,
  getShareSettings,
  updateShareSettings,
  exportResume,
  exportResumePdf,
  exportResumeTxt
} from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Public share route - Unauthenticated, strictly GET only, rate limited
router.route('/share/:shareToken')
  .get(publicShareLimiter, asyncHandler(getPublicResumeByToken))
  .all((req, res) => {
    res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed on public share endpoint`
    });
  });

// Protect all following resume routes
router.use(protect);

router.route('/')
  .get(getResumes)
  .post(validate(resumeValidation), asyncHandler(createResume));

// Share settings management for resume owner
router.route('/:resumeId/share')
  .get(asyncHandler(getShareSettings))
  .patch(asyncHandler(updateShareSettings))
  .put(asyncHandler(updateShareSettings));

// Authenticated server-side resume export endpoints (vector PDF & ATS plain text)
router.get('/:resumeId/export/pdf', asyncHandler(exportResumePdf));
router.get('/:resumeId/export/txt', asyncHandler(exportResumeTxt));
router.get('/:resumeId/export', asyncHandler(exportResume));

router.route('/:resumeId')
  .get(getResumeById)
  .put(validate(resumeValidation), asyncHandler(updateResume))
  .patch(validate(resumeValidation), asyncHandler(updateResume))
  .delete(asyncHandler(deleteResume));

router.post('/:resumeId/undo', asyncHandler(undoResume));
router.post('/:resumeId/generate', asyncHandler(generateResumeFromPrompt));
router.post('/:resumeId/job-match', asyncHandler(analyzeResumeJobMatch));

export default router;

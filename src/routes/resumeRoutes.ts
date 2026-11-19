import express from 'express';
import { protect } from '../middleware/auth';
import {
  validate,
  resumeValidation,
  sharingSlugValidation,
  sharingSlugQueryValidation,
  resumeIdParamValidation,
  historyIndexValidation
} from '../middleware/validate';
import { publicShareLimiter } from '../middleware/rateLimiter';
import {
  createResume,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume,
  undoResume,
  getResumeHistory,
  getResumeHistorySnapshot,
  restoreResumeHistory,
  generateResumeFromPrompt,
  analyzeResumeJobMatch,
  getPublicResumeByToken,
  getShareSettings,
  updateShareSettings,
  checkSharingSlugAvailability,
  updateSharingSlug,
  getSharingStats,
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

// Share settings, custom slug & view stats management for resume owner
router.route('/:resumeId/share')
  .get(asyncHandler(getShareSettings))
  .patch(asyncHandler(updateShareSettings))
  .put(asyncHandler(updateShareSettings));

router.get(
  '/:resumeId/sharing/stats',
  asyncHandler(getSharingStats)
);

router.get(
  '/:resumeId/sharing/slug/check',
  validate(sharingSlugQueryValidation),
  asyncHandler(checkSharingSlugAvailability)
);

router.patch(
  '/:resumeId/sharing/slug',
  validate(sharingSlugValidation),
  asyncHandler(updateSharingSlug)
);

// Authenticated ATS plain-text resume export endpoint
router.get('/:resumeId/export.txt', asyncHandler(exportResumeTxt));

router.route('/:resumeId')
  .get(getResumeById)
  .put(validate(resumeValidation), asyncHandler(updateResume))
  .patch(validate(resumeValidation), asyncHandler(updateResume))
  .delete(asyncHandler(deleteResume));

router.get('/:resumeId/history', validate(resumeIdParamValidation), asyncHandler(getResumeHistory));
router.get('/:resumeId/history/:index', validate(historyIndexValidation), asyncHandler(getResumeHistorySnapshot));
router.post('/:resumeId/history/:index/restore', validate(historyIndexValidation), asyncHandler(restoreResumeHistory));

router.post('/:resumeId/undo', asyncHandler(undoResume));
router.post('/:resumeId/generate', asyncHandler(generateResumeFromPrompt));
router.post('/:resumeId/job-match', asyncHandler(analyzeResumeJobMatch));

export default router;

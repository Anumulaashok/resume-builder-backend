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
import { publicShareLimiter, aiGenerationLimiter } from '../middleware/rateLimiter';
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
  optimizeResumeBullet,
  generateResumeSummary,
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

// Private AI generation & authoring routes (rate-limited to 10 req/min/user)
router.post('/generate', aiGenerationLimiter, asyncHandler(generateResumeFromPrompt));
router.post('/optimize-bullet', aiGenerationLimiter, asyncHandler(optimizeResumeBullet));
router.post('/generate-summary', aiGenerationLimiter, asyncHandler(generateResumeSummary));

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
router.post('/:resumeId/generate', aiGenerationLimiter, asyncHandler(generateResumeFromPrompt));
router.post('/:resumeId/optimize-bullet', aiGenerationLimiter, asyncHandler(optimizeResumeBullet));
router.post('/:resumeId/generate-summary', aiGenerationLimiter, asyncHandler(generateResumeSummary));
router.post('/:resumeId/job-match', asyncHandler(analyzeResumeJobMatch));

export default router;

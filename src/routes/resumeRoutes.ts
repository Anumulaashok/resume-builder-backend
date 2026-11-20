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
  exportResumeTxt,
  exportResumePdf,
  exportResumeDocx,
  exportSharedResumeByTokenPdf,
  exportSharedResumeByTokenDocx,
  exportSharedResumeByTokenTxt
} from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

const disallowNonGetOnPublicShare = (req: express.Request, res: express.Response) => {
  res.status(405).json({
    success: false,
    message: `Method ${req.method} not allowed on public share endpoint`
  });
};

// Public share routes - Unauthenticated, strictly GET only, rate limited
router.route('/share/:shareToken/export.pdf')
  .get(publicShareLimiter, asyncHandler(exportSharedResumeByTokenPdf))
  .all(disallowNonGetOnPublicShare);

router.route('/share/:shareToken/export.docx')
  .get(publicShareLimiter, asyncHandler(exportSharedResumeByTokenDocx))
  .all(disallowNonGetOnPublicShare);

router.route('/share/:shareToken/export.txt')
  .get(publicShareLimiter, asyncHandler(exportSharedResumeByTokenTxt))
  .all(disallowNonGetOnPublicShare);

router.route('/share/:shareToken')
  .get(publicShareLimiter, asyncHandler(getPublicResumeByToken))
  .all(disallowNonGetOnPublicShare);

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

// Authenticated resume export endpoints (.pdf, .docx, .txt)
router.get('/:resumeId/export.pdf', asyncHandler(exportResumePdf));
router.get('/:resumeId/export.docx', asyncHandler(exportResumeDocx));
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

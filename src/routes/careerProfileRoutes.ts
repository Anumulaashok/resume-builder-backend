import express from 'express';
import { protect } from '../middleware/auth';
import { handleResumeImportUpload } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import {
  approveCareerProfileImport,
  confirmSkillInCareerProfile,
  extractCareerProfileImport,
  getCareerProfile,
  seedPortfolioFromCareerProfile,
  seedResumeFromCareerProfile,
  upsertCareerProfile,
} from '../controllers/careerProfileController';

const router = express.Router();

// All Career Profile endpoints strictly enforce user authentication
router.use(protect);

router
  .route('/')
  .get(asyncHandler(getCareerProfile))
  .put(asyncHandler(upsertCareerProfile))
  .patch(asyncHandler(upsertCareerProfile));

router.post(
  '/import/extract',
  handleResumeImportUpload(),
  asyncHandler(extractCareerProfileImport)
);

router.post('/import/approve', asyncHandler(approveCareerProfileImport));
router.post('/seed-resume', asyncHandler(seedResumeFromCareerProfile));
router.post('/seed-portfolio', asyncHandler(seedPortfolioFromCareerProfile));
router.post('/skills/confirm', asyncHandler(confirmSkillInCareerProfile));

export default router;

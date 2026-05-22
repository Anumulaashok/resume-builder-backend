import express from 'express';
import { protect } from '../middleware/auth';
import { validate, resumeValidation } from '../middleware/validate';
import {
  createResume,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume,
  generateResumeFromPrompt
} from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Protect all resume routes
router.use(protect);

router.post('/generate', asyncHandler(generateResumeFromPrompt));

router.route('/')
  .get(getResumes)
  .post(validate(resumeValidation), asyncHandler(createResume));

router.route('/:resumeId')
  .get(getResumeById)
  .put(validate(resumeValidation), asyncHandler(updateResume))
  .delete(asyncHandler(deleteResume));

export default router;

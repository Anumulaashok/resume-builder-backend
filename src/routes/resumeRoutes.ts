import express from 'express';
import { protect } from '../middleware/auth';
import { validate, resumeValidation } from '../middleware/validate';
import {
  createResume,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume
} from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Protect all resume routes
router.use(protect);

router.route('/')
  .get(getResumes)
  .post(validate(resumeValidation), asyncHandler(createResume));

router.route('/:id')
  .get(getResumeById)
  .put(validate(resumeValidation), asyncHandler(updateResume))
  .delete(asyncHandler(deleteResume));

export default router;

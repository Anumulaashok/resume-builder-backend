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

const router = express.Router();

// Protect all resume routes
router.use(protect);

router.route('/')
  .get(getResumes)
  .post(validate(resumeValidation), createResume);

router.route('/:id')
  .get(getResumeById)
  .put(validate(resumeValidation), updateResume)
  .delete(deleteResume);

export default router;

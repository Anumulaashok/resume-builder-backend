import express from 'express';
import { protect } from '../middleware/auth';
import {
  validate,
  coverLetterCreateValidation,
  coverLetterUpdateValidation,
  coverLetterGenerateValidation
} from '../middleware/validate';
import {
  getCoverLetters,
  getCoverLetterById,
  createCoverLetter,
  updateCoverLetter,
  deleteCoverLetter,
  duplicateCoverLetter,
  generateCoverLetter
} from '../controllers/coverLetterController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Protect all cover letter routes
router.use(protect);

router
  .route('/')
  .get(asyncHandler(getCoverLetters))
  .post(validate(coverLetterCreateValidation), asyncHandler(createCoverLetter));

router
  .route('/:id')
  .get(asyncHandler(getCoverLetterById))
  .put(validate(coverLetterUpdateValidation), asyncHandler(updateCoverLetter))
  .patch(validate(coverLetterUpdateValidation), asyncHandler(updateCoverLetter))
  .delete(asyncHandler(deleteCoverLetter));

router.post('/:id/duplicate', asyncHandler(duplicateCoverLetter));
router.post(
  '/:id/generate',
  validate(coverLetterGenerateValidation),
  asyncHandler(generateCoverLetter)
);

export default router;

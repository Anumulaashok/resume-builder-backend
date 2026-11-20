import express from 'express';
import { protect } from '../middleware/auth';
import { validate, careerProfilePayloadValidation } from '../middleware/validate';
import {
  deleteCareerProfile,
  getCareerProfile,
  mergeCareerProfile,
  upsertCareerProfile
} from '../controllers/careerProfileController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(asyncHandler(getCareerProfile))
  .put(validate(careerProfilePayloadValidation), asyncHandler(upsertCareerProfile))
  .patch(validate(careerProfilePayloadValidation), asyncHandler(upsertCareerProfile))
  .delete(asyncHandler(deleteCareerProfile));

router.post(
  '/merge',
  validate(careerProfilePayloadValidation),
  asyncHandler(mergeCareerProfile)
);

export default router;

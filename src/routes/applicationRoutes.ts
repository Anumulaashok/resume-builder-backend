import express from 'express';
import { protect } from '../middleware/auth';
import {
  validate,
  listApplicationsValidation,
  createApplicationValidation,
  updateApplicationValidation,
  reorderApplicationsValidation
} from '../middleware/validate';
import {
  getApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  deleteApplication,
  reorderApplications
} from '../controllers/applicationController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// All application tracker routes require authentication and scope queries by req.user
router.use(protect);

router
  .route('/')
  .get(validate(listApplicationsValidation), asyncHandler(getApplications))
  .post(validate(createApplicationValidation), asyncHandler(createApplication));

// Batch reorder route must precede /:id so '/reorder' is never matched as an ID parameter
router.patch(
  '/reorder',
  validate(reorderApplicationsValidation),
  asyncHandler(reorderApplications)
);

router
  .route('/:id')
  .get(asyncHandler(getApplicationById))
  .put(validate(updateApplicationValidation), asyncHandler(updateApplication))
  .patch(validate(updateApplicationValidation), asyncHandler(updateApplication))
  .delete(asyncHandler(deleteApplication));

export default router;

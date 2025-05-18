import express from 'express';
import { authenticate } from '../middleware/auth';
import { validate, resumeValidation } from '../middleware/validate';
import resumeController from '../controllers/resumeController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Protect all resume routes
router.use(authenticate);

// Get all resumes for the authenticated user
router.get('/', asyncHandler(resumeController.getResumes.bind(resumeController)));

// Create a new resume
router.post('/', validate(resumeValidation), asyncHandler(resumeController.createResume.bind(resumeController)));

// Get a specific resume by ID
router.get('/:resumeId', asyncHandler(resumeController.getResumeById.bind(resumeController)));

// Update a resume
router.put('/:resumeId', validate(resumeValidation), asyncHandler(resumeController.updateResume.bind(resumeController)));

// Delete a resume
router.delete('/:resumeId', asyncHandler(resumeController.deleteResume.bind(resumeController)));

// AI generation
router.post('/generate', asyncHandler(resumeController.generateResumeFromPrompt.bind(resumeController)));

// Resume content management
router.get('/:resumeId/basics', asyncHandler(resumeController.getBasicInfo.bind(resumeController)));
router.put('/:resumeId/basics', asyncHandler(resumeController.updateBasicInfo.bind(resumeController)));

// Resume section management (higher-level operations)
router.get('/:resumeId/sections', asyncHandler(resumeController.getSections.bind(resumeController)));
router.put('/:resumeId/sections/order', asyncHandler(resumeController.updateSectionOrder.bind(resumeController)));

export default router;

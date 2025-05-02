import express from 'express'; // Use import syntax
import {
  createResume,
  // getResumesByUserId, // Removed
  getMyResumes, // Added
  getResumeById,
  generateResumeFromPrompt,
  updateResumeField,
} from '../controllers/resumeController'; // Use import syntax
import { protect } from '../middleware/authMiddleware'; // Import protect middleware

const router = express.Router();

// Apply protect middleware to all routes below
router.use(protect);

// @route   POST api/resumes
// @desc    Create a resume
// @access  Private
router.post('/', createResume);

// @route   GET api/resumes/my
// @desc    Get all resumes for the logged-in user
// @access  Private
router.get('/my', getMyResumes); // Changed route and handler

// @route   GET api/resumes/:resumeId
// @desc    Get a single resume by its ID
// @access  Private
router.get('/:resumeId', getResumeById);

// @route   POST api/resumes/generate
// @desc    Generate resume summary from prompt using AI
// @access  Private
router.post('/generate', generateResumeFromPrompt);

// @route   PATCH api/resumes/:resumeId
// @desc    Update specific fields of a resume
// @access  Private
router.patch('/:resumeId', updateResumeField);

export default router; // Use export default syntax

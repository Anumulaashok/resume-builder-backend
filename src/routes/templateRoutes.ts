import express from 'express';
import {
  createTemplate,
  getMyTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from '../controllers/templateController';
import { protect } from '../middleware/authMiddleware'; // Import protect middleware

const router = express.Router();

// Apply protect middleware to all routes defined in this file
router.use(protect);

// Define CRUD routes for templates
router.post('/', createTemplate); // Create a new template
router.get('/my', getMyTemplates); // Get templates owned by the logged-in user
router.get('/:templateId', getTemplateById); // Get a specific template by ID
router.patch('/:templateId', updateTemplate); // Update a specific template by ID
router.delete('/:templateId', deleteTemplate); // Delete a specific template by ID

export default router;

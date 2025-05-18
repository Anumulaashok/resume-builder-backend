import express from 'express';
import sectionController from '../controllers/sectionController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Protect all routes with authentication middleware
router.use(authenticate);

// Get all available section types
router.get('/types', sectionController.getSectionTypes);

// Section CRUD operations
router.get('/:resumeId/:sectionId', sectionController.getSection);
router.post('/:resumeId', sectionController.addSection);
router.put('/:resumeId/:sectionId', sectionController.updateSection);
router.delete('/:resumeId/:sectionId', sectionController.deleteSection);

// Section item operations
router.post('/:resumeId/:sectionId/items', sectionController.addSectionItem);
router.put('/:resumeId/:sectionId/items/:itemId', sectionController.updateSectionItem);
router.delete('/:resumeId/:sectionId/items/:itemId', sectionController.deleteSectionItem);
router.patch('/:resumeId/:sectionId/items/:itemId/status', sectionController.toggleItemStatus);

// Section order
router.put('/:resumeId/order', sectionController.updateSectionOrder);

export default router;

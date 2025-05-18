import { Request, Response } from 'express';
import sectionService from '../services/sectionService';

class SectionController {
    // Get all available section types
    async getSectionTypes(req: Request, res: Response) {
        try {
            const sectionTypes = await sectionService.getAvailableSectionTypes();
            return res.status(200).json(sectionTypes);
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Get a section by ID
    async getSection(req: Request, res: Response) {
        try {
            const { resumeId, sectionId } = req.params;
            const userId = (req as any).user.id;

            const section = await sectionService.getSectionById(resumeId, sectionId, userId);
            return res.status(200).json(section);
        } catch (error: any) {
            return res.status(404).json({ error: error.message });
        }
    }

    // Add a new section
    async addSection(req: Request, res: Response) {
        try {
            const { resumeId } = req.params;
            const userId = (req as any).user.id;
            const sectionData = req.body;

            const newSection = await sectionService.addSection(resumeId, sectionData, userId);
            return res.status(201).json(newSection);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    // Update a section
    async updateSection(req: Request, res: Response) {
        try {
            const { resumeId, sectionId } = req.params;
            const userId = (req as any).user.id;
            const sectionData = req.body;

            const updatedSection = await sectionService.updateSection(resumeId, sectionId, sectionData, userId);
            return res.status(200).json(updatedSection);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    // Delete a section
    async deleteSection(req: Request, res: Response) {
        try {
            const { resumeId, sectionId } = req.params;
            const userId = (req as any).user.id;

            await sectionService.deleteSection(resumeId, sectionId, userId);
            return res.status(200).json({ message: 'Section deleted successfully' });
        } catch (error: any) {
            return res.status(404).json({ error: error.message });
        }
    }

    // Add an item to a section
    async addSectionItem(req: Request, res: Response) {
        try {
            const { resumeId, sectionId } = req.params;
            const userId = (req as any).user.id;
            const itemData = req.body;

            const newItem = await sectionService.addSectionItem(resumeId, sectionId, itemData, userId);
            return res.status(201).json(newItem);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    // Update a section item
    async updateSectionItem(req: Request, res: Response) {
        try {
            const { resumeId, sectionId, itemId } = req.params;
            const userId = (req as any).user.id;
            const itemData = req.body;

            const updatedItem = await sectionService.updateSectionItem(resumeId, sectionId, itemId, itemData, userId);
            return res.status(200).json(updatedItem);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    // Delete a section item
    async deleteSectionItem(req: Request, res: Response) {
        try {
            const { resumeId, sectionId, itemId } = req.params;
            const userId = (req as any).user.id;

            await sectionService.deleteSectionItem(resumeId, sectionId, itemId, userId);
            return res.status(200).json({ message: 'Item deleted successfully' });
        } catch (error: any) {
            return res.status(404).json({ error: error.message });
        }
    }

    // Enable or disable a section item
    async toggleItemStatus(req: Request, res: Response) {
        try {
            const { resumeId, sectionId, itemId } = req.params;
            const { enabled } = req.body;
            const userId = (req as any).user.id;

            if (enabled === undefined) {
                return res.status(400).json({ error: 'Enabled status is required' });
            }

            const updatedItem = await sectionService.toggleSectionItemStatus(resumeId, sectionId, itemId, enabled, userId);
            return res.status(200).json(updatedItem);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    // Update section order
    async updateSectionOrder(req: Request, res: Response) {
        try {
            const { resumeId } = req.params;
            const { sectionOrder } = req.body;
            const userId = (req as any).user.id;

            if (!Array.isArray(sectionOrder)) {
                return res.status(400).json({ error: 'Section order must be an array of section IDs' });
            }

            const result = await sectionService.updateSectionOrder(resumeId, sectionOrder, userId);
            return res.status(200).json(result);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }
}

export default new SectionController();

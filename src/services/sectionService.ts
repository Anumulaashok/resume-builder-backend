import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Resume, ISection, IResume, SectionType } from '../models/Resume';
import { SECTION_CONFIGS } from '../constants/sections';
import { validateSectionItem, validateSection } from '../validation/sectionValidation';

class SectionService {
    // Get all available section types
    async getAvailableSectionTypes() {
        return SECTION_CONFIGS;
    }

    // Get a resume section by ID
    async getSectionById(resumeId: string, sectionId: string, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const section = resume.content.sections.find(s => s.id === sectionId);
        if (!section) {
            throw new Error('Section not found');
        }

        return section;
    }

    // Add a new section to a resume
    async addSection(resumeId: string, sectionData: Partial<ISection>, userId: string) {
        const { error } = validateSection(sectionData);
        if (error) {
            throw new Error(`Invalid section data: ${error.message}`);
        }

        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        // Generate unique ID if not provided
        if (!sectionData.id) {
            sectionData.id = uuidv4();
        }

        // Check if section already exists
        const sectionExists = resume.content.sections.some(s => s.id === sectionData.id);
        if (sectionExists) {
            throw new Error('Section with this ID already exists');
        }

        // Add new section
        const section = {
            id: sectionData.id,
            type: sectionData.type,
            title: sectionData.title,
            content: sectionData.content || [],
            enabled: sectionData.enabled !== undefined ? sectionData.enabled : true,
            isCustom: sectionData.isCustom || false
        } as ISection;

        resume.content.sections.push(section);
        resume.content.sectionOrder.push(section.id);

        await resume.save();
        return section;
    }

    // Update a section
    async updateSection(resumeId: string, sectionId: string, sectionData: Partial<ISection>, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const sectionIndex = resume.content.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex === -1) {
            throw new Error('Section not found');
        }

        // Update section properties
        if (sectionData.title) {
            resume.content.sections[sectionIndex].title = sectionData.title;
        }

        if (sectionData.enabled !== undefined) {
            resume.content.sections[sectionIndex].enabled = sectionData.enabled;
        }

        // If content is provided, validate and update
        if (sectionData.content) {
            resume.content.sections[sectionIndex].content = sectionData.content;
        }

        await resume.save();
        return resume.content.sections[sectionIndex];
    }

    // Delete a section
    async deleteSection(resumeId: string, sectionId: string, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        // Remove from sections
        resume.content.sections = resume.content.sections.filter(s => s.id !== sectionId);

        // Remove from section order
        resume.content.sectionOrder = resume.content.sectionOrder.filter(id => id !== sectionId);

        await resume.save();
        return { success: true };
    }

    // Add an item to a section's content
    async addSectionItem(resumeId: string, sectionId: string, itemData: any, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const sectionIndex = resume.content.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex === -1) {
            throw new Error('Section not found');
        }

        const sectionType = resume.content.sections[sectionIndex].type as SectionType;

        // Validate the item data based on section type
        const { error } = validateSectionItem(sectionType, itemData);
        if (error) {
            throw new Error(`Invalid item data: ${error.message}`);
        }

        // Add ID if not provided
        if (!itemData.id) {
            itemData.id = uuidv4();
        }

        // Add new item to content
        resume.content.sections[sectionIndex].content.push(itemData);
        await resume.save();

        return itemData;
    }

    // Update a section item
    async updateSectionItem(resumeId: string, sectionId: string, itemId: string, itemData: any, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const sectionIndex = resume.content.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex === -1) {
            throw new Error('Section not found');
        }

        const itemIndex = resume.content.sections[sectionIndex].content.findIndex((item: any) => item.id === itemId);
        if (itemIndex === -1) {
            throw new Error('Item not found');
        }

        // Ensure we're keeping the same ID
        itemData.id = itemId;

        // Validate the updated item
        const sectionType = resume.content.sections[sectionIndex].type as SectionType;
        const { error } = validateSectionItem(sectionType, itemData);
        if (error) {
            throw new Error(`Invalid item data: ${error.message}`);
        }

        // Update the item
        resume.content.sections[sectionIndex].content[itemIndex] = itemData;
        await resume.save();

        return itemData;
    }

    // Delete a section item
    async deleteSectionItem(resumeId: string, sectionId: string, itemId: string, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const sectionIndex = resume.content.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex === -1) {
            throw new Error('Section not found');
        }

        // Filter out the item
        resume.content.sections[sectionIndex].content = resume.content.sections[sectionIndex].content.filter(
            (item: any) => item.id !== itemId
        );

        await resume.save();
        return { success: true };
    }

    // Toggle item enabled/disabled status
    async toggleSectionItemStatus(resumeId: string, sectionId: string, itemId: string, enabled: boolean, userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        const sectionIndex = resume.content.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex === -1) {
            throw new Error('Section not found');
        }

        const itemIndex = resume.content.sections[sectionIndex].content.findIndex((item: any) => item.id === itemId);
        if (itemIndex === -1) {
            throw new Error('Item not found');
        }

        // Update the enabled status
        resume.content.sections[sectionIndex].content[itemIndex].enabled = enabled;
        await resume.save();

        return resume.content.sections[sectionIndex].content[itemIndex];
    }

    // Update section order
    async updateSectionOrder(resumeId: string, sectionOrder: string[], userId: string) {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!resume) {
            throw new Error('Resume not found');
        }

        // Verify all section IDs exist
        const sectionIds = resume.content.sections.map(s => s.id);
        const allSectionsExist = sectionOrder.every(id => sectionIds.includes(id));

        if (!allSectionsExist) {
            throw new Error('Section order contains invalid section IDs');
        }

        resume.content.sectionOrder = sectionOrder;
        await resume.save();

        return { success: true, sectionOrder };
    }
}

export default new SectionService();

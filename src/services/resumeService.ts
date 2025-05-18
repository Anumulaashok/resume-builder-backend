import mongoose from 'mongoose';
import { Resume, IResume } from '../models/Resume';
import { AppError } from '../utils/appError';
import * as aiService from '../services/aiService';

class ResumeService {
    async createResume(resumeData: Partial<IResume>, userId: mongoose.Types.ObjectId): Promise<IResume> {
        if (!userId) {
            throw new AppError('User ID is required', 400);
        }

        const newResume = {
            ...resumeData,
            userId
        };

        return await Resume.create(newResume);
    }

    async getResumes(userId: mongoose.Types.ObjectId): Promise<IResume[]> {
        return await Resume.find({ userId });
    }

    async getResumeById(resumeId: string, userId: mongoose.Types.ObjectId): Promise<IResume> {
        const resume = await Resume.findOne({
            _id: resumeId,
            userId
        }).lean();

        if (!resume) {
            throw new AppError('Resume not found', 404);
        }

        return resume;
    }

    async updateResume(
        resumeId: string,
        updateData: Partial<IResume>,
        userId: mongoose.Types.ObjectId
    ): Promise<IResume> {
        const resume = await Resume.findOneAndUpdate(
            { _id: resumeId, userId },
            updateData,
            { new: true, runValidators: true }
        );

        if (!resume) {
            throw new AppError('Resume not found', 404);
        }

        return resume;
    }

    async deleteResume(resumeId: string, userId: mongoose.Types.ObjectId): Promise<void> {
        const resume = await Resume.findOneAndDelete({
            _id: resumeId,
            userId
        });

        if (!resume) {
            throw new AppError('Resume not found', 404);
        }
    }

    async generateResumeFromPrompt(userId: mongoose.Types.ObjectId, prompt: string): Promise<IResume> {
        if (!prompt) {
            throw new AppError('Prompt is required', 400);
        }

        const aiResponse: { summary: string } = await aiService.analyzeResumePrompt(prompt);

        const resume = {
            userId,
            title: 'AI Generated Resume',
            content: {
                basics: aiResponse,
            }
        } as IResume;
        return await Resume.create(resume);
    }

    async getBasicInfo(resumeId: string, userId: mongoose.Types.ObjectId): Promise<any> {
        const resume = await this.getResumeById(resumeId, userId);
        return resume.content.basics;
    }

    async updateBasicInfo(
        resumeId: string,
        basicInfo: any,
        userId: mongoose.Types.ObjectId
    ): Promise<any> {
        const resume = await Resume.findOneAndUpdate(
            { _id: resumeId, userId },
            { 'content.basics': basicInfo },
            { new: true, runValidators: true }
        );

        if (!resume) {
            throw new AppError('Resume not found', 404);
        }

        return resume.content.basics;
    }

    async getSections(resumeId: string, userId: mongoose.Types.ObjectId): Promise<any> {
        const resume = await this.getResumeById(resumeId, userId);
        return {
            sections: resume.content.sections,
            sectionOrder: resume.content.sectionOrder
        };
    }

    async updateSectionOrder(
        resumeId: string,
        sectionOrder: string[],
        userId: mongoose.Types.ObjectId
    ): Promise<string[]> {
        if (!Array.isArray(sectionOrder)) {
            throw new AppError('Section order must be an array', 400);
        }

        const resume = await Resume.findOne({
            _id: resumeId,
            userId
        });

        if (!resume) {
            throw new AppError('Resume not found', 404);
        }

        // Verify all section IDs exist
        const sectionIds = resume.content.sections.map(s => s.id);
        const allSectionsExist = sectionOrder.every(id => sectionIds.includes(id));

        if (!allSectionsExist) {
            throw new AppError('Section order contains invalid section IDs', 400);
        }

        resume.content.sectionOrder = sectionOrder;
        await resume.save();

        return sectionOrder;
    }
}

export default new ResumeService();

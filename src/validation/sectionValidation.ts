import Joi from 'joi';
import { SectionType } from '../models/Resume';

// Base validation for all item types
const baseItemSchema = Joi.object({
    id: Joi.string().required(),
    enabled: Joi.boolean().default(true),
});

// Validation schemas for each section type
const workItemSchema = baseItemSchema.append({
    company: Joi.string().required(),
    position: Joi.string().required(),
    startDate: Joi.string().required(),
    endDate: Joi.string().allow(''),
    current: Joi.boolean(),
    location: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const educationItemSchema = baseItemSchema.append({
    institution: Joi.string().required(),
    degree: Joi.string().required(),
    field: Joi.string().required(),
    startDate: Joi.string().required(),
    endDate: Joi.string().allow(''),
    current: Joi.boolean(),
    location: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const skillItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    level: Joi.number().min(0).max(5).allow(null),
    subSkills: Joi.array().items(Joi.string()),
});

const languageItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    level: Joi.string().allow(''),
    proficiency: Joi.number().min(0).max(5).allow(null),
});

const certificateItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    issuer: Joi.string().allow(''),
    date: Joi.string().allow(''),
    url: Joi.string().allow(''),
});

const interestItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    description: Joi.string().allow(''),
});

const projectItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    description: Joi.string().allow(''),
    startDate: Joi.string().allow(''),
    endDate: Joi.string().allow(''),
    url: Joi.string().allow(''),
    technologies: Joi.array().items(Joi.string()),
});

const courseItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    institution: Joi.string().allow(''),
    date: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const awardItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    issuer: Joi.string().allow(''),
    date: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const organizationItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    position: Joi.string().allow(''),
    startDate: Joi.string().allow(''),
    endDate: Joi.string().allow(''),
    current: Joi.boolean(),
    description: Joi.string().allow(''),
});

const publicationItemSchema = baseItemSchema.append({
    title: Joi.string().required(),
    publisher: Joi.string().allow(''),
    date: Joi.string().allow(''),
    url: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const referenceItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    company: Joi.string().allow(''),
    position: Joi.string().allow(''),
    contact: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const softSkillItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    level: Joi.number().min(0).max(5).allow(null),
});

const achievementItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    date: Joi.string().allow(''),
    description: Joi.string().allow(''),
});

const technicalSkillItemSchema = baseItemSchema.append({
    name: Joi.string().required(),
    level: Joi.number().min(0).max(5).allow(null),
    technologies: Joi.array().items(Joi.string()),
});

// Custom section items can have any structure
const customItemSchema = Joi.object().unknown(true).required();

// Section schema
export const sectionSchema = Joi.object({
    id: Joi.string().required(),
    type: Joi.string().valid(
        'work',
        'education',
        'skills',
        'languages',
        'certificates',
        'interests',
        'projects',
        'courses',
        'awards',
        'organizations',
        'publications',
        'references',
        'softSkills',
        'achievements',
        'technicalSkills',
        'custom'
    ).required(),
    title: Joi.string().required(),
    enabled: Joi.boolean().default(true),
    isCustom: Joi.boolean().default(false),
    content: Joi.array().items(Joi.object().unknown(true)).default([]),
});

// Validate section item based on section type
export const validateSectionItem = (type: SectionType, item: any) => {
    const schemas: Record<SectionType, Joi.ObjectSchema> = {
        work: workItemSchema,
        education: educationItemSchema,
        skills: skillItemSchema,
        languages: languageItemSchema,
        certificates: certificateItemSchema,
        interests: interestItemSchema,
        projects: projectItemSchema,
        courses: courseItemSchema,
        awards: awardItemSchema,
        organizations: organizationItemSchema,
        publications: publicationItemSchema,
        references: referenceItemSchema,
        softSkills: softSkillItemSchema,
        achievements: achievementItemSchema,
        technicalSkills: technicalSkillItemSchema,
        custom: customItemSchema,
    };

    const schema = schemas[type] || customItemSchema;
    return schema.validate(item);
};

// Validate an entire section
export const validateSection = (section: any) => {
    return sectionSchema.validate(section);
};

// Validate section order
export const sectionOrderSchema = Joi.array().items(Joi.string()).required();

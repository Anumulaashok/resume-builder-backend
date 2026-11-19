import { body } from 'express-validator';
import mongoose from 'mongoose';

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
];

export const signupValidation = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
];

export const resumeValidation = [
  body('title').trim().notEmpty(),
  body('themeConfig').optional().isObject(),
  body('content.basics.name').trim().notEmpty(),
  body('content.basics.email').isEmail(),
  body('content.sections').isArray(),
  body('content.sectionOrder').isArray()
];

const isPlainObject = (val: unknown): boolean =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

const sharedCoverLetterFieldRules = [
  body('resumeId')
    .optional({ values: 'null' })
    .custom((val) => val === '' || (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)))
    .withMessage('resumeId must be a valid ObjectId'),
  body('recipient')
    .optional()
    .custom(isPlainObject)
    .withMessage('recipient must be an object'),
  body('recipient.name').optional().isString().isLength({ max: 200 }),
  body('recipient.company').optional().isString().isLength({ max: 200 }),
  body('recipient.address').optional().isString().isLength({ max: 500 }),
  body('jobTitle').optional().isString().isLength({ max: 200 }),
  body('jobDescription').optional().isString().isLength({ max: 20000 }),
  body('date').optional().isString().isLength({ max: 100 }),
  body('greeting').optional().isString().isLength({ max: 200 }),
  body('body').optional().isString().isLength({ max: 30000 }),
  body('closing').optional().isString().isLength({ max: 200 }),
  body('templateId').optional({ values: 'null' }).isString().isLength({ max: 100 }),
  body('themeConfig')
    .optional({ values: 'null' })
    .custom(isPlainObject)
    .withMessage('themeConfig must be an object')
];

export const coverLetterCreateValidation = [
  body('title').isString().trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  ...sharedCoverLetterFieldRules
];

export const coverLetterUpdateValidation = [
  body('title')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 200 }),
  ...sharedCoverLetterFieldRules
];

export const coverLetterGenerateValidation = [
  body('prompt').optional().isString().isLength({ max: 5000 })
];

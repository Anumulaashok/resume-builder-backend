import { body, param, query } from 'express-validator';
import { validateCustomSlug } from '../utils/shareUtils';
import { APPLICATION_STATUSES } from '../models/JobApplication';
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

export const sharingSlugValidation = [
  body('slug')
    .exists()
    .withMessage('Slug field is required')
    .custom((value) => {
      if (value === null || value === '') {
        return true;
      }
      const check = validateCustomSlug(value);
      if (!check.valid) {
        throw new Error(check.reason || 'Invalid custom slug');
      }
      return true;
    })
];

export const sharingSlugQueryValidation = [
  query('slug')
    .isString()
    .withMessage('Query parameter "slug" is required')
    .notEmpty()
    .withMessage('Query parameter "slug" cannot be empty')
];

export const publicSlugParamValidation = [
  param('slug')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Slug is required')
];

const sharedApplicationFieldValidations = [
  body('location').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }),
  body('url').optional({ values: 'null' }).isString().trim().isLength({ max: 2000 }),
  body('status')
    .optional()
    .isString()
    .isIn([...APPLICATION_STATUSES])
    .withMessage(`status must be one of: ${APPLICATION_STATUSES.join(', ')}`),
  body('order')
    .optional()
    .custom((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .withMessage('order must be a non-negative finite number'),
  body('appliedAt')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('appliedAt must be a valid ISO 8601 date'),
  body('salary').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 10000 }),
  body('resumeId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('resumeId must be a valid Mongo ObjectId'),
  body('coverLetterId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('coverLetterId must be a valid Mongo ObjectId'),
  body('jobDescription').optional({ values: 'null' }).isString().isLength({ max: 20000 }),
  body('contacts').optional().isArray({ max: 50 }).withMessage('contacts must be an array'),
  body('contacts.*.name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Each contact requires a name')
    .isLength({ max: 200 }),
  body('contacts.*.email')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isEmail()
    .withMessage('Contact email must be valid')
    .isLength({ max: 320 }),
  body('contacts.*.role')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 200 }),
  body('nextActionAt')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('nextActionAt must be a valid ISO 8601 date'),
  body('nextActionNote').optional({ values: 'null' }).isString().trim().isLength({ max: 500 })
];

export const listApplicationsValidation = [
  query('status')
    .optional()
    .isString()
    .isIn([...APPLICATION_STATUSES])
    .withMessage(`status must be one of: ${APPLICATION_STATUSES.join(', ')}`)
];

export const createApplicationValidation = [
  body('company')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('company is required')
    .isLength({ max: 200 }),
  body('role')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('role is required')
    .isLength({ max: 200 }),
  ...sharedApplicationFieldValidations
];

export const updateApplicationValidation = [
  body('company')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('company cannot be empty')
    .isLength({ max: 200 }),
  body('role')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('role cannot be empty')
    .isLength({ max: 200 }),
  ...sharedApplicationFieldValidations
];

export const reorderApplicationsValidation = [
  body('moves')
    .isArray({ min: 1, max: 500 })
    .withMessage('moves must be a non-empty array'),
  body('moves.*.id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Each move must specify an application id'),
  body('moves.*.status')
    .isString()
    .isIn([...APPLICATION_STATUSES])
    .withMessage(`status must be one of: ${APPLICATION_STATUSES.join(', ')}`),
  body('moves.*.order')
    .custom((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .withMessage('Each move must specify a non-negative numeric order')
];

export const resumeIdParamValidation = [
  param('resumeId').trim().notEmpty()
];

export const historyIndexValidation = [
  param('resumeId').trim().notEmpty(),
  param('index').isInt({ min: 0 })
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

export const bulletCoachValidation = [
  body('text')
    .isString()
    .withMessage('Bullet text must be a string')
    .trim()
    .notEmpty()
    .withMessage('Bullet text is required')
    .isLength({ max: 5000 })
    .withMessage('Bullet text must be 5000 characters or less'),
  body('action')
    .optional()
    .isIn(['rewrite', 'shorten', 'improve'])
    .withMessage('action must be rewrite, shorten, or improve'),
  body('userMetric')
    .optional({ values: 'null' })
    .custom(isPlainObject)
    .withMessage('userMetric must be an object'),
  body('userMetric.category').optional().isString().isLength({ max: 120 }),
  body('userMetric.value').optional().isString().isLength({ max: 120 })
];


import { body, param, query } from 'express-validator';
import { validateCustomSlug } from '../utils/shareUtils';

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

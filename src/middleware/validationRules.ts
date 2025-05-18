import { body } from 'express-validator';

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
  body('content.basics.name').trim().notEmpty(),
  body('content.basics.email').isEmail(),
  body('content.sections').isArray(),
  body('content.sectionOrder').isArray()
];

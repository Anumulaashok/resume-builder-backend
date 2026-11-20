import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, ValidationError } from 'express-validator';

const FIELD_LABELS: Record<string, string> = {
  title: 'Resume title',
  themeConfig: 'Theme configuration',
  'content.basics.name': 'Full name',
  'content.basics.email': 'Email address',
  'content.sections': 'Resume sections',
  'content.sectionOrder': 'Section order'
};

function formatFieldLabel(path?: string): string {
  if (!path) return 'Field';
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const lastSegment = path.split('.').pop() || path;
  const spaced = lastSegment.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function resolveErrorMessage(err: ValidationError): string {
  const rawMsg = typeof err.msg === 'string' ? err.msg.trim() : '';
  if (rawMsg && rawMsg.toLowerCase() !== 'invalid value') {
    return rawMsg;
  }
  const path = err.type === 'field' ? err.path : undefined;
  return `${formatFieldLabel(path)} is invalid`;
}

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formattedErrors = errors.array().map((err) => {
      const readableMessage = resolveErrorMessage(err);
      const fieldPath = err.type === 'field' ? err.path : undefined;
      return {
        ...err,
        ...(fieldPath ? { field: fieldPath } : {}),
        msg: readableMessage,
        message: readableMessage
      };
    });

    const uniqueMessages = Array.from(
      new Set(formattedErrors.map((entry) => entry.message).filter(Boolean))
    );
    const summaryMessage =
      uniqueMessages.length > 0 ? uniqueMessages.join('; ') : 'Validation failed';

    return res.status(400).json({
      success: false,
      message: summaryMessage,
      errors: formattedErrors
    });
  };
};

export * from './validationRules';

import { AppError } from './appError';

export const MAX_AI_PROMPT_LENGTH = 2000;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

/**
 * Validates user prompt or text input sent to AI services.
 * Enforces non-empty string and strict maximum character cap (2000 chars).
 */
export const validatePromptInput = (input: unknown, fieldName = 'prompt'): string => {
  if (typeof input !== 'string') {
    throw new AppError(`Missing required field (${fieldName})`, 400);
  }

  if (input.length > MAX_AI_PROMPT_LENGTH) {
    throw new AppError(
      `Input (${fieldName}) exceeds the maximum allowed length of ${MAX_AI_PROMPT_LENGTH} characters`,
      400
    );
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new AppError(`Missing required field (${fieldName})`, 400);
  }

  return trimmed;
};

/**
 * Masks residual PII patterns in outbound prompt text before sending to third-party LLMs.
 */
export const maskPromptPII = (text: string): string => {
  if (!text) return '';
  return text
    .replace(EMAIL_REGEX, '[EMAIL]')
    .replace(SSN_REGEX, '[SSN]')
    .replace(PHONE_REGEX, '[PHONE]');
};

/**
 * Sanitizes an individual string from LLM output to strip XSS vectors,
 * HTML/script tags, dangerous URI schemes, and non-printable control bytes.
 */
export const sanitizeText = (input: string): string => {
  if (typeof input !== 'string') return '';

  return input
    // Strip script, style, and iframe blocks completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Strip remaining HTML tags
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Neutralize dangerous URI schemes
    .replace(/\b(?:javascript|vbscript):/gi, '')
    .replace(/\bdata:text\/html[^,\s]*/gi, '')
    // Strip non-printable ASCII control characters while keeping \n and \t
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
};

/**
 * Recursively sanitizes strings in LLM output structures and strips dangerous
 * prototype or MongoDB operator keys before persisting to the database.
 */
export const sanitizeDeep = <T>(value: T): T => {
  if (typeof value === 'string') {
    return sanitizeText(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key) || key.startsWith('$') || key.includes('.')) {
        continue;
      }
      cleaned[key] = sanitizeDeep(val);
    }
    return cleaned as T;
  }

  return value;
};

import { Request, Response, NextFunction } from 'express';

export const SENSITIVE_KEY_PATTERN = /pass(word)?|token|secret|authorization|apikey/i;
export const REDACTED_VALUE = '[REDACTED]';
export const MAX_BODY_LENGTH = 1000;
const TRUNCATION_SUFFIX = '...[truncated]';

export type LogWriter = (message: string) => void;

function redactInternal(value: unknown, ancestors: WeakSet<object>): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (value instanceof RegExp) {
        return new RegExp(value.source, value.flags);
    }

    if (Buffer.isBuffer(value)) {
        return Buffer.from(value);
    }

    if (ancestors.has(value)) {
        return '[Circular]';
    }

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item) => redactInternal(item, ancestors));
        }

        const copy: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            const rawChild = (value as Record<string, unknown>)[key];
            const safeChild = SENSITIVE_KEY_PATTERN.test(key)
                ? REDACTED_VALUE
                : redactInternal(rawChild, ancestors);

            if (key === '__proto__') {
                Object.defineProperty(copy, key, {
                    value: safeChild,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
            } else {
                copy[key] = safeChild;
            }
        }
        return copy;
    } finally {
        ancestors.delete(value);
    }
}

export function redact<T = unknown>(body: T): unknown {
    return redactInternal(body, new WeakSet<object>());
}

function getNormalizedPath(req: Request): string {
    const raw = req.originalUrl || `${req.baseUrl || ''}${req.url || req.path || ''}`;
    const withoutQuery = raw.split('?')[0];
    let decoded = withoutQuery;
    try {
        decoded = decodeURIComponent(withoutQuery);
    } catch {
        // Keep raw path if percent-encoding is malformed
    }
    return decoded.replace(/\/+/g, '/').toLowerCase();
}

export function isAuthRoute(req: Request): boolean {
    const path = getNormalizedPath(req);
    return path === '/api/auth' || path.startsWith('/api/auth/');
}

function shouldLogBody(req: Request): boolean {
    const method = (req.method || '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return false;
    }
    if (isAuthRoute(req)) {
        return false;
    }
    if (req.body === undefined) {
        return false;
    }
    return true;
}

export function truncateBody(serialized: string, maxLength: number = MAX_BODY_LENGTH): string {
    if (serialized.length <= maxLength) {
        return serialized;
    }
    if (maxLength <= TRUNCATION_SUFFIX.length) {
        return serialized.slice(0, maxLength);
    }
    return serialized.slice(0, maxLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

function formatBody(body: unknown): string {
    try {
        const serialized = JSON.stringify(redact(body));
        if (serialized === undefined) {
            return '';
        }
        return truncateBody(serialized, MAX_BODY_LENGTH);
    } catch {
        return '[Unserializable]';
    }
}

export const createRequestLogger = (
    log: LogWriter = (message: string) => console.log(message)
) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const requestUrl = req.originalUrl || req.url || req.path || '';
            const baseMessage = `[${new Date().toISOString()}] ${req.method} ${requestUrl} ${res.statusCode} ${duration}ms`;

            if (shouldLogBody(req)) {
                const bodyText = formatBody(req.body);
                if (bodyText) {
                    log(`${baseMessage} - Body: ${bodyText}`);
                    return;
                }
            }

            log(baseMessage);
        });

        next();
    };
};

export const requestLogger = createRequestLogger();

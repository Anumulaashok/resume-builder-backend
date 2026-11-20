import crypto from 'crypto';
import { PostHog } from 'posthog-node';
import { SENSITIVE_KEY_PATTERN } from '../middleware/requestLogger';

export const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '741313';
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
export const DEFAULT_POSTHOG_PROJECT_KEY =
  'phc_oEFx2wsdx9f7LREWQUB6uCrwVsMnpdHjmT7Pm9wJHMLP';

export type ServerTelemetryEventName =
  | 'resume_created'
  | 'resume_completed'
  | 'resume_exported'
  | 'jd_analyzed'
  | 'ats_analysis_completed'
  | 'time_to_first_resume'
  | 'time_to_export'
  | 'application_stage_changed';

export interface CapturedTelemetryPayload {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
}

export interface PostHogClientLike {
  capture: (payload: CapturedTelemetryPayload) => void;
  flush: () => Promise<unknown> | void;
  shutdown?: () => Promise<unknown> | void;
}

/**
 * Matches PII, resume prose, job description text, credentials, and raw URLs
 * so they are stripped before any event payload leaves the server.
 */
export const TELEMETRY_PII_KEY_PATTERN = new RegExp(
  [
    SENSITIVE_KEY_PATTERN.source,
    '^(full_?)?name$',
    'first_?name',
    'last_?name',
    'user_?name',
    'candidate_?name',
    'recipient_?name',
    'email',
    'phone',
    'mobile',
    'summary',
    'bio',
    'headline',
    '^label$',
    'bullet',
    'highlight',
    'description',
    'jd_?text',
    'company',
    'employer',
    'organization',
    '^role$',
    'target_?role',
    'candidate_?role',
    'contact_?role',
    'position',
    'job_?title',
    '^title$',
    'resume_?title',
    'notes?',
    'next_?action_?note',
    'contacts?',
    'address',
    'street',
    'city',
    'postal_?code',
    'location',
    'salary',
    'compensation',
    'url',
    'website',
    'linkedin',
    'github',
    'pathname',
    'referrer',
    'prompt',
    'instruction',
    'plain_?text',
    'raw_?text',
    '^content$',
    '^sections$',
    '^basics$',
    'share_?token',
    'slug',
    '^ip$',
    'ip_?address'
  ].join('|'),
  'i'
);

const EMAIL_VALUE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_VALUE_PATTERN = /^(https?:\/\/|www\.|\/share\/|\/r\/|\/p\/|\/portfolio\/)/i;
const SHARE_QUERY_PATTERN = /[?&]shareToken=/i;
const MONGO_OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_VALUE_PATTERN = /^\+?[\d\s().-]{9,20}$/;

const MAX_SAFE_STRING_LENGTH = 120;
const MAX_CAPTURED_HISTORY = 500;

let singletonClient: PostHogClientLike | null | undefined;
let customTestClient: PostHogClientLike | null = null;
const capturedHistory: CapturedTelemetryPayload[] = [];

function isSafeIdentifierKey(key: string): boolean {
  return /(^|_)(id|project_id)$/i.test(key);
}

function isPiiStringValue(value: string, key: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (EMAIL_VALUE_PATTERN.test(trimmed)) return true;
  if (URL_VALUE_PATTERN.test(trimmed) || SHARE_QUERY_PATTERN.test(trimmed)) {
    return true;
  }
  if (trimmed.length > MAX_SAFE_STRING_LENGTH) {
    return true;
  }
  if (
    !isSafeIdentifierKey(key) &&
    !MONGO_OBJECT_ID_PATTERN.test(trimmed) &&
    !UUID_PATTERN.test(trimmed) &&
    PHONE_VALUE_PATTERN.test(trimmed) &&
    /\d{7,}/.test(trimmed.replace(/\D/g, ''))
  ) {
    return true;
  }
  return false;
}

function sanitizeValue(
  value: unknown,
  key: string,
  ancestors: WeakSet<object>
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    if (isPiiStringValue(value, key)) {
      return undefined;
    }
    return value.trim();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  if (Buffer.isBuffer(value) || value instanceof RegExp) {
    return undefined;
  }

  // Convert Mongoose ObjectId-like values cleanly to opaque hex strings
  if (
    typeof (value as { toHexString?: () => string }).toHexString === 'function'
  ) {
    return (value as { toHexString: () => string }).toHexString();
  }

  if (ancestors.has(value)) {
    return undefined;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const sanitizedItems = value
        .map((item) => sanitizeValue(item, key, ancestors))
        .filter((item) => item !== undefined);
      return sanitizedItems;
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const childKey of Object.keys(value as Record<string, unknown>)) {
      if (childKey === '__proto__' || childKey === 'constructor') {
        continue;
      }
      if (TELEMETRY_PII_KEY_PATTERN.test(childKey)) {
        continue;
      }
      const rawChild = (value as Record<string, unknown>)[childKey];
      const cleanChild = sanitizeValue(rawChild, childKey, ancestors);
      if (cleanChild !== undefined) {
        sanitizedObj[childKey] = cleanChild;
      }
    }
    return sanitizedObj;
  } finally {
    ancestors.delete(value);
  }
}

export function sanitizeTelemetryProperties(
  properties: Record<string, unknown> = {}
): Record<string, unknown> {
  const cleaned = sanitizeValue(properties, 'root', new WeakSet<object>());
  if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
    return {};
  }
  return cleaned as Record<string, unknown>;
}

export function sanitizeDistinctId(rawUserId: unknown): string {
  const str =
    rawUserId &&
    typeof (rawUserId as { toHexString?: () => string }).toHexString ===
      'function'
      ? (rawUserId as { toHexString: () => string }).toHexString()
      : String(rawUserId ?? '').trim();

  if (!str) {
    return 'anonymous_server_user';
  }

  // Never permit an email address or whitespace-bearing string as distinctId
  if (EMAIL_VALUE_PATTERN.test(str) || /\s/.test(str)) {
    const digest = crypto.createHash('sha256').update(str).digest('hex');
    return `user_${digest.slice(0, 24)}`;
  }

  return str;
}

function getOrCreateClient(): PostHogClientLike | null {
  if (customTestClient) {
    return customTestClient;
  }

  if (singletonClient !== undefined) {
    return singletonClient;
  }

  const isTestEnv =
    process.env.NODE_ENV === 'test' &&
    process.env.POSTHOG_ENABLE_IN_TEST !== 'true';

  if (isTestEnv) {
    singletonClient = null;
    return null;
  }

  const apiKey = (
    process.env.POSTHOG_API_KEY ||
    process.env.POSTHOG_PROJECT_API_KEY ||
    DEFAULT_POSTHOG_PROJECT_KEY
  ).trim();

  if (!apiKey) {
    singletonClient = null;
    return null;
  }

  const host = (process.env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST).trim();

  try {
    singletonClient = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: 3000,
      disableGeoip: true
    });
  } catch {
    singletonClient = null;
  }

  return singletonClient;
}

/**
 * Non-blocking server-side PostHog capture.
 * Never throws or rejects so telemetry failures cannot break API mutations.
 */
export function captureServerEvent(
  rawUserId: unknown,
  event: ServerTelemetryEventName | string,
  rawProperties: Record<string, unknown> = {}
): void {
  try {
    const distinctId = sanitizeDistinctId(rawUserId);
    const sanitizedProps = sanitizeTelemetryProperties(rawProperties);
    const properties: Record<string, unknown> = {
      ...sanitizedProps,
      telemetry_source: 'backend',
      posthog_project_id: POSTHOG_PROJECT_ID,
      $ip: null
    };

    const payload: CapturedTelemetryPayload = {
      distinctId,
      event,
      properties
    };

    if (capturedHistory.length >= MAX_CAPTURED_HISTORY) {
      capturedHistory.shift();
    }
    capturedHistory.push(payload);

    const client = getOrCreateClient();
    if (client) {
      client.capture(payload);
    }
  } catch {
    // Telemetry must remain strictly non-blocking
  }
}

/**
 * Bounded flush for serverless handlers (Vercel & Netlify Functions)
 * so buffered events are transmitted before execution freezes.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  try {
    const client = getOrCreateClient();
    if (!client || typeof client.flush !== 'function') {
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.resolve(client.flush()).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      })
    ]);
    if (timer) {
      clearTimeout(timer);
    }
  } catch {
    // Never fail serverless responses on PostHog network issues
  }
}

export function setTelemetryClientForTests(
  client: PostHogClientLike | null
): void {
  customTestClient = client;
}

export function getCapturedTelemetryEventsForTests(): CapturedTelemetryPayload[] {
  return [...capturedHistory];
}

export function clearCapturedTelemetryEventsForTests(): void {
  capturedHistory.length = 0;
}

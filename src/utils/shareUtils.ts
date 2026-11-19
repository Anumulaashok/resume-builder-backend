import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { IDailyView, IResume } from '../models/Resume';
import { AuthenticatedRequest } from '../types/express';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const RESERVED_SLUGS = new Set<string>([
  'about',
  'account',
  'admin',
  'administrator',
  'analytics',
  'api',
  'api-docs',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'career',
  'careers',
  'config',
  'contact',
  'create',
  'cv',
  'dashboard',
  'delete',
  'dev',
  'docs',
  'download',
  'edit',
  'editor',
  'embed',
  'explore',
  'export',
  'faq',
  'favicon',
  'features',
  'feed',
  'files',
  'forgot',
  'health',
  'help',
  'home',
  'import',
  'index',
  'internal',
  'job',
  'job-match',
  'jobs',
  'legal',
  'login',
  'logout',
  'manage',
  'me',
  'metrics',
  'my',
  'new',
  'null',
  'oauth',
  'onboarding',
  'owner',
  'p',
  'portfolio',
  'portfolios',
  'preview',
  'pricing',
  'print',
  'privacy',
  'profile',
  'public',
  'r',
  'register',
  'reset',
  'resume',
  'resumes',
  'robots',
  'root',
  'search',
  'security',
  'settings',
  'share',
  'shared',
  'sharing',
  'signin',
  'signout',
  'signup',
  'sitemap',
  'slug',
  'static',
  'stats',
  'status',
  'support',
  'swagger',
  'system',
  'team',
  'template',
  'templates',
  'terms',
  'test',
  'undefined',
  'uploads',
  'user',
  'users',
  'verify',
  'version',
  'view',
  'views',
  'webhook',
  'webhooks',
  'www'
]);

export interface SlugValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateCustomSlug(slug: unknown): SlugValidationResult {
  if (typeof slug !== 'string') {
    return { valid: false, reason: 'Slug must be a string' };
  }

  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return {
      valid: false,
      reason: `Slug must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`
    };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      valid: false,
      reason: 'Slug may only contain lowercase letters, digits, and hyphens'
    };
  }

  if (slug.startsWith('-') || slug.endsWith('-')) {
    return {
      valid: false,
      reason: 'Slug cannot start or end with a hyphen'
    };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return {
      valid: false,
      reason: `"${slug}" is a reserved word and cannot be used as a custom slug`
    };
  }

  return { valid: true };
}

const OBVIOUS_BOT_UA_REGEX =
  /\b(bot|crawler|spider|crawl|slurp|mediapartners|facebookexternalhit|whatsapp|bingpreview|skypeuripreview|prerender|headlesschrome|phantomjs|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|apache-httpclient|scrapy)\b|(googlebot|bingbot|yandex|baiduspider|duckduckbot|linkedinbot|twitterbot|slackbot|discordbot|telegrambot|applebot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider)/i;

export function isObviousBotUserAgent(userAgent?: string | string[]): boolean {
  if (!userAgent) {
    return false;
  }
  const ua = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  if (!ua.trim()) {
    return false;
  }
  return OBVIOUS_BOT_UA_REGEX.test(ua);
}

export function resolveOptionalViewerId(req: Request): string | null {
  const authedReq = req as AuthenticatedRequest;
  if (authedReq.user?._id) {
    return String(authedReq.user._id);
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
          id?: string;
          _id?: string;
          userId?: string;
        };
        const resolved = decoded?.id || decoded?._id || decoded?.userId;
        if (resolved) {
          return String(resolved);
        }
      } catch {
        // Invalid or expired token on a public endpoint is treated as an unauthenticated visitor
      }
    }
  }

  return null;
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function get30DayCutoffDateStr(now: Date = new Date()): string {
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const cutoff = new Date(utcMidnight - 29 * 24 * 60 * 60 * 1000);
  return formatUtcDate(cutoff);
}

export function pruneAndIncrementDailyViews(
  existingDailyViews: IDailyView[] | undefined,
  now: Date = new Date()
): IDailyView[] {
  const todayStr = formatUtcDate(now);
  const cutoffStr = get30DayCutoffDateStr(now);

  const byDate = new Map<string, number>();
  if (Array.isArray(existingDailyViews)) {
    for (const entry of existingDailyViews) {
      if (
        entry &&
        typeof entry.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
        entry.date >= cutoffStr &&
        entry.date <= todayStr
      ) {
        const prev = byDate.get(entry.date) || 0;
        byDate.set(entry.date, prev + Math.max(0, Number(entry.count) || 0));
      }
    }
  }

  byDate.set(todayStr, (byDate.get(todayStr) || 0) + 1);

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

export function build30DayViewsSeries(
  existingDailyViews: IDailyView[] | undefined,
  now: Date = new Date()
): IDailyView[] {
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  const countsByDate = new Map<string, number>();
  if (Array.isArray(existingDailyViews)) {
    for (const entry of existingDailyViews) {
      if (entry && typeof entry.date === 'string') {
        countsByDate.set(
          entry.date,
          (countsByDate.get(entry.date) || 0) + Math.max(0, Number(entry.count) || 0)
        );
      }
    }
  }

  const series: IDailyView[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(utcMidnight - offset * 24 * 60 * 60 * 1000);
    const dateStr = formatUtcDate(day);
    series.push({
      date: dateStr,
      count: countsByDate.get(dateStr) || 0
    });
  }

  return series;
}

export async function recordPublicResumeViewIfEligible(
  resume: IResume | Record<string, any>,
  req: Request,
  now: Date = new Date()
): Promise<boolean> {
  if (isObviousBotUserAgent(req.headers?.['user-agent'])) {
    return false;
  }

  const viewerId = resolveOptionalViewerId(req);
  const ownerId = resume.userId ? String(resume.userId) : null;
  if (viewerId && ownerId && viewerId === ownerId) {
    return false;
  }

  if (!resume.sharing) {
    resume.sharing = {
      isPublic: true,
      shareToken: null,
      privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
    };
  }

  resume.sharing.viewCount = (Number(resume.sharing.viewCount) || 0) + 1;
  resume.sharing.lastViewedAt = now;
  resume.sharing.dailyViews = pruneAndIncrementDailyViews(
    resume.sharing.dailyViews,
    now
  );

  if (typeof (resume as IResume).save === 'function') {
    if (typeof (resume as IResume).markModified === 'function') {
      (resume as IResume).markModified('sharing');
    }
    await (resume as IResume).save();
  }

  return true;
}

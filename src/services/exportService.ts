import net from 'net';

const MAX_FIELD_LENGTH = 8000;
const MAX_SECTIONS = 60;
const MAX_ITEMS_PER_SECTION = 150;

export type CanonicalSectionKind =
  | 'work'
  | 'education'
  | 'projects'
  | 'skills'
  | 'languages'
  | 'certificates'
  | 'awards'
  | 'courses'
  | 'organizations'
  | 'publications'
  | 'references'
  | 'interests'
  | 'achievements'
  | 'custom';

export type DateFormatPattern = 'MMM YYYY' | 'MM/YYYY' | 'YYYY';

export interface ExportLink {
  key: string;
  label: string;
  href: string;
}

export interface PreparedSectionItem {
  raw: Record<string, unknown>;
  dateRange: string;
  location: string;
  highlights: string[];
  keywords: string[];
  url: string;
  urlLabel: string;
}

export interface PreparedSection {
  id: string;
  type: string;
  kind: CanonicalSectionKind;
  title: string;
  atsHeading: string;
  isCustom: boolean;
  textContent?: string;
  items: PreparedSectionItem[];
}

export interface PreparedResume {
  title: string;
  basics: {
    name: string;
    label: string;
    email: string;
    phone: string;
    formattedLocation: string;
    links: ExportLink[];
    summary: string;
  };
  sections: PreparedSection[];
}

const WORK_TYPES = new Set([
  'workitem',
  'work',
  'experience',
  'workexperience',
  'work_experience',
  'professional_experience',
  'employment',
]);

const EDUCATION_TYPES = new Set([
  'educationitem',
  'education',
  'academics',
]);

const PROJECT_TYPES = new Set([
  'projectitem',
  'project',
  'projects',
]);

const SKILL_TYPES = new Set([
  'skillitem',
  'technicalskillitem',
  'softskillitem',
  'skill',
  'skills',
  'technicalskills',
  'technical_skills',
  'softskills',
  'soft_skills',
]);

const LANGUAGE_TYPES = new Set([
  'languageitem',
  'language',
  'languages',
]);

const CERTIFICATE_TYPES = new Set([
  'certificateitem',
  'certificate',
  'certificates',
  'certification',
  'certifications',
]);

const AWARD_TYPES = new Set([
  'awarditem',
  'award',
  'awards',
  'honors',
]);

const COURSE_TYPES = new Set([
  'courseitem',
  'course',
  'courses',
  'coursework',
]);

const ORGANIZATION_TYPES = new Set([
  'organizationitem',
  'organization',
  'organizations',
  'organisations',
  'volunteer',
  'volunteering',
  'affiliations',
]);

const PUBLICATION_TYPES = new Set([
  'publicationitem',
  'publication',
  'publications',
]);

const REFERENCE_TYPES = new Set([
  'referenceitem',
  'reference',
  'references',
]);

const INTEREST_TYPES = new Set([
  'interestitem',
  'interest',
  'interests',
  'hobbies',
]);

const ACHIEVEMENT_TYPES = new Set([
  'achievementitem',
  'achivementitem',
  'achievement',
  'achievements',
  'achivements',
  'accomplishments',
]);

const CUSTOM_TYPES = new Set([
  'customitem',
  'custom',
]);

const ATS_SECTION_HEADINGS: Record<string, string> = {
  workitem: 'WORK EXPERIENCE',
  work: 'WORK EXPERIENCE',
  experience: 'WORK EXPERIENCE',
  workexperience: 'WORK EXPERIENCE',
  work_experience: 'WORK EXPERIENCE',
  professional_experience: 'WORK EXPERIENCE',
  employment: 'WORK EXPERIENCE',
  educationitem: 'EDUCATION',
  education: 'EDUCATION',
  academics: 'EDUCATION',
  skillitem: 'SKILLS',
  skill: 'SKILLS',
  skills: 'SKILLS',
  technicalskillitem: 'TECHNICAL SKILLS',
  technicalskills: 'TECHNICAL SKILLS',
  technical_skills: 'TECHNICAL SKILLS',
  softskillitem: 'SOFT SKILLS',
  softskills: 'SOFT SKILLS',
  soft_skills: 'SOFT SKILLS',
  projectitem: 'PROJECTS',
  project: 'PROJECTS',
  projects: 'PROJECTS',
  certificateitem: 'CERTIFICATIONS',
  certificate: 'CERTIFICATIONS',
  certificates: 'CERTIFICATIONS',
  certification: 'CERTIFICATIONS',
  certifications: 'CERTIFICATIONS',
  languageitem: 'LANGUAGES',
  language: 'LANGUAGES',
  languages: 'LANGUAGES',
  courseitem: 'COURSES',
  course: 'COURSES',
  courses: 'COURSES',
  coursework: 'COURSES',
  awarditem: 'AWARDS',
  award: 'AWARDS',
  awards: 'AWARDS',
  honors: 'AWARDS',
  achievementitem: 'ACHIEVEMENTS',
  achivementitem: 'ACHIEVEMENTS',
  achievement: 'ACHIEVEMENTS',
  achievements: 'ACHIEVEMENTS',
  achivements: 'ACHIEVEMENTS',
  accomplishments: 'ACHIEVEMENTS',
  organizationitem: 'ORGANIZATIONS',
  organization: 'ORGANIZATIONS',
  organizations: 'ORGANIZATIONS',
  organisations: 'ORGANIZATIONS',
  volunteer: 'ORGANIZATIONS',
  volunteering: 'ORGANIZATIONS',
  affiliations: 'ORGANIZATIONS',
  publicationitem: 'PUBLICATIONS',
  publication: 'PUBLICATIONS',
  publications: 'PUBLICATIONS',
  referenceitem: 'REFERENCES',
  reference: 'REFERENCES',
  references: 'REFERENCES',
  interestitem: 'INTERESTS',
  interest: 'INTERESTS',
  interests: 'INTERESTS',
  hobbies: 'INTERESTS',
};

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const VALID_DATE_FORMATS = new Set<DateFormatPattern>([
  'MMM YYYY',
  'MM/YYYY',
  'YYYY',
]);

/**
 * Strips HTML/script markup, BiDi spoofing characters, and ASCII control codes
 * while preserving UTF-8 characters and intentional line breaks.
 */
export function sanitizeText(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  if (typeof value !== 'string') {
    return '';
  }

  const cleaned = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/g, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();

  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength);
  }
  return cleaned;
}

function isPrivateIpv4Parts(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/**
 * Blocks localhost, private networks, loopback, link-local, and cloud metadata hosts
 * to prevent SSRF or internal link injection in exported documents.
 */
export function isBlockedHost(rawHostname: string): boolean {
  const host = rawHostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');

  if (!host) return true;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'local' ||
    host.endsWith('.local') ||
    host === 'internal' ||
    host.endsWith('.internal') ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host === 'instance-data'
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return isPrivateIpv4Parts(host.split('.').map((p) => Number(p)));
  }

  if (ipVersion === 6) {
    if (host === '::' || host === '::1' || /^0+(?::0+)*:(?:0+|1)$/.test(host)) {
      return true;
    }
    if (/^f[cd][0-9a-f]{0,2}:/i.test(host)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]?:/i.test(host)) return true; // fe80::/10 link-local

    // IPv4-mapped IPv6 in dotted form (::ffff:127.0.0.1)
    const dottedMatch = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (dottedMatch) {
      return isPrivateIpv4Parts(dottedMatch[1].split('.').map((p) => Number(p)));
    }

    // IPv4-mapped IPv6 in hex form normalized by WHATWG URL (::ffff:7f00:1)
    const hexMatch = host.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      return isPrivateIpv4Parts([(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]);
    }
    return false;
  }

  // Require a valid public domain with at least one dot
  if (!host.includes('.')) {
    return true;
  }

  return false;
}

/**
 * Validates and normalizes an external HTTP(S) URL.
 * Rejects dangerous protocols (javascript:, data:, file:, etc.) and SSRF targets.
 */
export function sanitizeSafeExternalUrl(rawUrl: unknown): string {
  const cleaned = sanitizeText(rawUrl, 500);
  if (!cleaned) return '';

  // Reject any explicit scheme other than http:// or https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned) && !/^https?:\/\//i.test(cleaned)) {
    return '';
  }

  const candidate = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    if (parsed.username || parsed.password) {
      return '';
    }
    if (isBlockedHost(parsed.hostname)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function formatLinkLabel(href: string): string {
  return href
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/$/, '');
}

export function sanitizeEmail(rawEmail: unknown): string {
  const cleaned = sanitizeText(rawEmail, 254).replace(/\s+/g, '');
  if (!cleaned) return '';
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cleaned)) {
    return sanitizeText(rawEmail, 254);
  }
  return cleaned;
}

export function sanitizePhone(rawPhone: unknown): string {
  return sanitizeText(rawPhone, 60);
}

export function buildSafeExportFilename(
  resume: { title?: unknown; content?: { basics?: { name?: unknown } } },
  ext: 'txt' = 'txt'
): string {
  const rawBase =
    sanitizeText(resume?.title, 120) ||
    sanitizeText(resume?.content?.basics?.name, 120) ||
    'resume';

  const slug = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${slug || 'resume'}.${ext}`;
}

/**
 * Formats a single resume date value using the exact same rules as the frontend
 * (`src/utils/date.ts`).
 */
export function formatResumeDate(value?: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return sanitizeText(value, 60);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const rawMonth = record.month;
    const rawYear = record.year;
    const month =
      typeof rawMonth === 'string'
        ? sanitizeText(rawMonth, 20)
        : typeof rawMonth === 'number' && Number.isFinite(rawMonth)
        ? String(rawMonth).trim()
        : '';
    const year =
      typeof rawYear === 'string'
        ? sanitizeText(rawYear, 10)
        : typeof rawYear === 'number' && Number.isFinite(rawYear)
        ? String(rawYear).trim()
        : '';
    return `${month} ${year}`.trim();
  }

  return '';
}

function parseMonthToken(rawMonth: string): number | null {
  const trimmed = rawMonth.trim().toLowerCase().replace(/\.$/, '');
  if (!trimmed) return null;
  if (MONTH_INDEX_MAP[trimmed]) return MONTH_INDEX_MAP[trimmed];
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }
  return null;
}

function parseMonthYear(
  value?: unknown
): { month: number | null; year: string | null; raw: string } {
  const base = formatResumeDate(value);
  if (!base) {
    return { month: null, year: null, raw: '' };
  }

  if (typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const rawYear =
      typeof record.year === 'string' || typeof record.year === 'number'
        ? sanitizeText(String(record.year), 10)
        : '';
    const rawMonth =
      typeof record.month === 'string' || typeof record.month === 'number'
        ? sanitizeText(String(record.month), 20)
        : '';
    return {
      month: parseMonthToken(rawMonth),
      year: /^\d{4}$/.test(rawYear) ? rawYear : rawYear || null,
      raw: base,
    };
  }

  const trimmed = base.trim();
  if (/^present|current|now$/i.test(trimmed)) {
    return { month: null, year: null, raw: 'Present' };
  }

  // YYYY-MM or YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (isoMatch) {
    return {
      month: parseMonthToken(isoMatch[2]),
      year: isoMatch[1],
      raw: trimmed,
    };
  }

  // MM/YYYY or MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    return {
      month: parseMonthToken(slashMatch[1]),
      year: slashMatch[2],
      raw: trimmed,
    };
  }

  // Month YYYY (e.g. "Jun 2021", "September 2023")
  const namedMatch = trimmed.match(/^([A-Za-z.]+)\s+(\d{4})$/);
  if (namedMatch) {
    return {
      month: parseMonthToken(namedMatch[1]),
      year: namedMatch[2],
      raw: trimmed,
    };
  }

  // Year only
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) {
    return { month: null, year: yearOnly[1], raw: trimmed };
  }

  return { month: null, year: null, raw: trimmed };
}

/**
 * Formats a date according to an optional `DateFormatPattern` (`MMM YYYY`, `MM/YYYY`, `YYYY`),
 * mirroring `formatDateWithPattern` in the frontend (`templateHelpers.tsx`).
 */
export function formatDateWithPattern(
  value?: unknown,
  dateFormat?: DateFormatPattern
): string {
  const base = formatResumeDate(value);
  if (!base) return '';
  if (!dateFormat) return base;

  const { month, year, raw } = parseMonthYear(value);
  if (!year) return raw;

  if (dateFormat === 'YYYY') {
    return year;
  }

  if (!month) {
    return year;
  }

  if (dateFormat === 'MM/YYYY') {
    return `${String(month).padStart(2, '0')}/${year}`;
  }

  return `${SHORT_MONTHS[month - 1]} ${year}`;
}

/**
 * Formats an item's date range using the exact same rules as the frontend
 * (`formatItemDateRange` in `templateHelpers.tsx`).
 */
export function formatItemDateRange(
  item: Record<string, unknown>,
  dateFormat?: DateFormatPattern
): string {
  if (!item) return '';

  const start = formatDateWithPattern(item.startDate, dateFormat);
  const end = formatDateWithPattern(item.endDate, dateFormat);
  const singleDate = formatDateWithPattern(item.date, dateFormat);
  const rawEnd = formatResumeDate(item.endDate);
  const isOngoing =
    Boolean(item.current || item.isCurrent) || /^present$/i.test(rawEnd.trim());

  if (start) {
    if (isOngoing) {
      return `${start} - Present`;
    }
    return end ? `${start} - ${end}` : start;
  }

  if (isOngoing) {
    return 'Present';
  }

  if (end) {
    return end;
  }

  if (singleDate) {
    return singleDate;
  }

  const dateRange = sanitizeText(item.dateRange, 80);
  if (dateRange) return dateRange;

  const period = sanitizeText(item.period, 80);
  if (period) return period;

  return '';
}

function resolveDateFormat(rawFormat: unknown): DateFormatPattern | undefined {
  if (typeof rawFormat !== 'string') return undefined;
  const trimmed = rawFormat.trim() as DateFormatPattern;
  return VALID_DATE_FORMATS.has(trimmed) ? trimmed : undefined;
}

function formatItemLocation(location: unknown): string {
  if (!location) return '';
  if (typeof location === 'string') {
    return sanitizeText(location, 160);
  }
  if (typeof location === 'object') {
    const loc = location as Record<string, unknown>;
    return [loc.address, loc.city, loc.region, loc.state, loc.countryCode, loc.country]
      .map((v) => sanitizeText(v, 80))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function extractKeywords(item: Record<string, unknown>): string[] {
  const raw =
    item.keywords ??
    item.subSkills ??
    item.technologies ??
    item.items ??
    item.skills;

  if (Array.isArray(raw)) {
    return raw
      .slice(0, 80)
      .map((entry) => {
        if (typeof entry === 'string') return sanitizeText(entry, 80);
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          if (obj.enabled === false) return '';
          return sanitizeText(obj.name, 80);
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .slice(0, 80)
      .map((s) => sanitizeText(s, 80))
      .filter(Boolean);
  }

  return [];
}

function extractHighlights(item: Record<string, unknown>): string[] {
  if (!Array.isArray(item.highlights)) return [];
  return item.highlights
    .slice(0, 50)
    .map((h) => sanitizeText(h, 1000))
    .filter(Boolean);
}

function matchKindToken(token: string): CanonicalSectionKind | null {
  if (!token) return null;
  if (WORK_TYPES.has(token)) return 'work';
  if (EDUCATION_TYPES.has(token)) return 'education';
  if (PROJECT_TYPES.has(token)) return 'projects';
  if (SKILL_TYPES.has(token)) return 'skills';
  if (LANGUAGE_TYPES.has(token)) return 'languages';
  if (CERTIFICATE_TYPES.has(token)) return 'certificates';
  if (AWARD_TYPES.has(token)) return 'awards';
  if (COURSE_TYPES.has(token)) return 'courses';
  if (ORGANIZATION_TYPES.has(token)) return 'organizations';
  if (PUBLICATION_TYPES.has(token)) return 'publications';
  if (REFERENCE_TYPES.has(token)) return 'references';
  if (INTEREST_TYPES.has(token)) return 'interests';
  if (ACHIEVEMENT_TYPES.has(token)) return 'achievements';
  if (CUSTOM_TYPES.has(token)) return 'custom';
  return null;
}

function resolveSectionKind(section: Record<string, unknown>): CanonicalSectionKind {
  const byType = matchKindToken(sanitizeText(section.type, 60).toLowerCase());
  if (byType) return byType;

  const byId = matchKindToken(sanitizeText(section.id, 60).toLowerCase());
  if (byId) return byId;

  const byTitle = matchKindToken(sanitizeText(section.title, 60).toLowerCase());
  if (byTitle) return byTitle;

  return 'custom';
}

function resolveAtsHeading(section: Record<string, unknown>, title: string): string {
  if (section.isCustom && title) {
    return title.toUpperCase();
  }
  const rawType = sanitizeText(section.type, 60).toLowerCase();
  if (ATS_SECTION_HEADINGS[rawType]) {
    return ATS_SECTION_HEADINGS[rawType];
  }
  const rawId = sanitizeText(section.id, 60).toLowerCase();
  if (ATS_SECTION_HEADINGS[rawId]) {
    return ATS_SECTION_HEADINGS[rawId];
  }
  const rawTitle = sanitizeText(section.title, 60).toLowerCase();
  if (ATS_SECTION_HEADINGS[rawTitle]) {
    return ATS_SECTION_HEADINGS[rawTitle];
  }
  return (title || 'ADDITIONAL INFORMATION').toUpperCase();
}

/**
 * Orders and filters sections identically to the frontend (`getOrderedSections` in `templateHelpers.tsx`).
 */
export function getOrderedSections(
  sections: Array<Record<string, any>> = [],
  sectionOrder: string[] = []
): Array<Record<string, any>> {
  if (!Array.isArray(sections) || sections.length === 0) return [];
  const capped = sections.slice(0, MAX_SECTIONS);

  if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) {
    return capped.filter((s) => Boolean(s) && s.enabled !== false);
  }

  const seenIds = new Set<string>();
  const fromOrder: Array<Record<string, any>> = [];

  for (const id of sectionOrder) {
    if (typeof id !== 'string' || seenIds.has(id)) continue;
    const match = capped.find((s) => s && s.id === id);
    if (match) {
      seenIds.add(id);
      if (match.enabled !== false) {
        fromOrder.push(match);
      }
    }
  }

  const remaining = capped.filter((s) => {
    if (!s || s.enabled === false) return false;
    const secId = typeof s.id === 'string' ? s.id : '';
    if (secId && seenIds.has(secId)) return false;
    if (secId) seenIds.add(secId);
    return true;
  });

  return [...fromOrder, ...remaining];
}

/**
 * Prepares a sanitized, privacy-filtered, ordered representation of a resume
 * ready for ATS Plain Text rendering.
 */
export function prepareExportableResume(rawResume: Record<string, any>): PreparedResume {
  const themeConfig =
    rawResume?.themeConfig && typeof rawResume.themeConfig === 'object'
      ? (rawResume.themeConfig as Record<string, unknown>)
      : {};
  const dateFormat = resolveDateFormat(themeConfig.dateFormat);

  const privacy = {
    hideEmail: Boolean(
      rawResume?.sharing?.privacy?.hideEmail ||
        rawResume?.sharing?.privacySettings?.hideEmail
    ),
    hidePhone: Boolean(
      rawResume?.sharing?.privacy?.hidePhone ||
        rawResume?.sharing?.privacySettings?.hidePhone
    ),
    hideAddress: Boolean(
      rawResume?.sharing?.privacy?.hideAddress ||
        rawResume?.sharing?.privacySettings?.hideAddress
    ),
  };

  const rawBasics =
    rawResume?.content?.basics && typeof rawResume.content.basics === 'object'
      ? (rawResume.content.basics as Record<string, any>)
      : {};

  const name = sanitizeText(rawBasics.name, 160);
  const label = sanitizeText(rawBasics.label, 160);
  const email = privacy.hideEmail ? '' : sanitizeEmail(rawBasics.email);
  const phone = privacy.hidePhone ? '' : sanitizePhone(rawBasics.phone);

  const rawLoc =
    rawBasics.location && typeof rawBasics.location === 'object'
      ? (rawBasics.location as Record<string, unknown>)
      : {};

  const formattedLocation = [
    privacy.hideAddress ? '' : sanitizeText(rawLoc.address, 120),
    sanitizeText(rawLoc.city, 80),
    sanitizeText(rawLoc.region, 80),
    sanitizeText(rawLoc.countryCode, 40),
  ]
    .filter(Boolean)
    .join(', ');

  const links: ExportLink[] = [];
  const directUrl = sanitizeSafeExternalUrl(
    rawBasics.url || rawBasics.website || rawBasics.portfolioUrl
  );
  if (directUrl) {
    links.push({ key: 'Website', label: formatLinkLabel(directUrl), href: directUrl });
  }

  const linkedinUrl = sanitizeSafeExternalUrl(rawBasics.linkedin);
  if (linkedinUrl) {
    links.push({ key: 'LinkedIn', label: formatLinkLabel(linkedinUrl), href: linkedinUrl });
  }

  const githubUrl = sanitizeSafeExternalUrl(rawBasics.github);
  if (githubUrl) {
    links.push({ key: 'GitHub', label: formatLinkLabel(githubUrl), href: githubUrl });
  }

  if (Array.isArray(rawBasics.profiles)) {
    rawBasics.profiles.slice(0, 10).forEach((profile: any, idx: number) => {
      if (!profile || typeof profile !== 'object') return;
      const href = sanitizeSafeExternalUrl(profile.url);
      if (!href) return;
      const network = sanitizeText(profile.network, 40);
      const username = sanitizeText(profile.username, 60);
      links.push({
        key: network || `Profile ${idx + 1}`,
        label: formatLinkLabel(href) || network || username,
        href,
      });
    });
  }

  const summary = sanitizeText(
    rawBasics.summary !== undefined && String(rawBasics.summary).trim() !== ''
      ? rawBasics.summary
      : rawResume?.summary
  );

  const rawSections: Array<Record<string, any>> = Array.isArray(rawResume?.content?.sections)
    ? rawResume.content.sections
    : [];
  const rawOrder: string[] = Array.isArray(rawResume?.content?.sectionOrder)
    ? rawResume.content.sectionOrder.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  const orderedRawSections = getOrderedSections(rawSections, rawOrder);
  const sections: PreparedSection[] = [];

  for (const sec of orderedRawSections) {
    const id = sanitizeText(sec.id, 100);
    const type = sanitizeText(sec.type, 60);
    const title = sanitizeText(sec.title, 120) || 'Section';
    const kind = resolveSectionKind(sec);
    const atsHeading = resolveAtsHeading(sec, title);

    if (typeof sec.content === 'string') {
      const textContent = sanitizeText(sec.content);
      if (textContent) {
        sections.push({
          id,
          type,
          kind,
          title,
          atsHeading,
          isCustom: Boolean(sec.isCustom),
          textContent,
          items: [],
        });
      }
      continue;
    }

    if (!Array.isArray(sec.content)) continue;

    const preparedItems: PreparedSectionItem[] = sec.content
      .slice(0, MAX_ITEMS_PER_SECTION)
      .filter((item: any) => item && typeof item === 'object' && item.enabled !== false)
      .map((item: Record<string, unknown>) => {
        const safeUrl = sanitizeSafeExternalUrl(
          item.url || item.website || item.link || item.liveUrl
        );
        return {
          raw: item,
          dateRange: formatItemDateRange(item, dateFormat),
          location: formatItemLocation(item.location),
          highlights: extractHighlights(item),
          keywords: extractKeywords(item),
          url: safeUrl,
          urlLabel: safeUrl ? formatLinkLabel(safeUrl) : '',
        };
      });

    if (preparedItems.length === 0) continue;

    sections.push({
      id,
      type,
      kind,
      title,
      atsHeading,
      isCustom: Boolean(sec.isCustom),
      items: preparedItems,
    });
  }

  return {
    title: sanitizeText(rawResume?.title, 160) || name || 'Resume',
    basics: {
      name,
      label,
      email,
      phone,
      formattedLocation,
      links,
      summary,
    },
    sections,
  };
}

function formatPlainTextSection(section: PreparedSection): string {
  const lines: string[] = [section.atsHeading];

  if (section.textContent) {
    lines.push(section.textContent);
    return lines.join('\n');
  }

  if (section.kind === 'skills') {
    const hasGroups = section.items.some((it) => it.keywords.length > 0);
    if (!hasGroups) {
      const labels = section.items
        .map((it) => {
          const name = sanitizeText(it.raw.name ?? it.raw.category ?? it.raw.title, 120);
          const level =
            typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
          if (!name) return '';
          return level ? `${name} (${level})` : name;
        })
        .filter(Boolean);
      if (labels.length > 0) {
        lines.push(labels.join(', '));
      }
      return lines.join('\n');
    }

    for (const it of section.items) {
      const groupName = sanitizeText(
        it.raw.name ?? it.raw.category ?? it.raw.title,
        120
      );
      const level =
        typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
      if (it.keywords.length > 0) {
        lines.push(
          groupName
            ? `${groupName}: ${it.keywords.join(', ')}`
            : it.keywords.join(', ')
        );
      } else if (groupName) {
        lines.push(level ? `${groupName} (${level})` : groupName);
      }
    }
    return lines.join('\n');
  }

  const itemBlocks: string[] = [];

  for (const it of section.items) {
    const itemLines: string[] = [];
    const raw = it.raw;

    if (section.kind === 'work') {
      const position = sanitizeText(
        raw.position ?? raw.role ?? raw.jobTitle ?? raw.title,
        160
      );
      const company = sanitizeText(
        raw.company ?? raw.name ?? raw.organization ?? raw.employer,
        160
      );
      const headline = [position, company].filter(Boolean).join(' | ');
      if (headline) itemLines.push(headline);

      const meta = [it.dateRange, it.location, it.url].filter(Boolean).join(' | ');
      if (meta) itemLines.push(meta);

      const desc = sanitizeText(raw.description ?? raw.summary);
      if (desc) itemLines.push(desc);
      it.highlights.forEach((h) => itemLines.push(`- ${h}`));
      if (it.keywords.length > 0) {
        itemLines.push(`Technologies: ${it.keywords.join(', ')}`);
      }
    } else if (section.kind === 'education') {
      const degree =
        sanitizeText(raw.degree, 160) ||
        [sanitizeText(raw.studyType, 80), sanitizeText(raw.area, 80)]
          .filter(Boolean)
          .join(' in ');
      const field = sanitizeText(
        raw.field ?? (raw.degree && raw.area ? raw.area : ''),
        160
      );
      const institution = sanitizeText(
        raw.institution ?? raw.school ?? raw.name,
        160
      );
      const gpa = sanitizeText(raw.gpa ?? raw.score, 40);

      const degreeLine = [degree, field].filter(Boolean).join(' - ');
      if (degreeLine) itemLines.push(degreeLine);

      const meta = [
        institution,
        it.dateRange,
        it.location,
        gpa ? `GPA: ${gpa}` : '',
        it.url,
      ]
        .filter(Boolean)
        .join(' | ');
      if (meta) itemLines.push(meta);

      const desc = sanitizeText(raw.description ?? raw.summary);
      if (desc) itemLines.push(desc);
      it.highlights.forEach((h) => itemLines.push(`- ${h}`));
    } else if (section.kind === 'projects') {
      const title = sanitizeText(raw.name ?? raw.title, 160);
      const role = sanitizeText(raw.position ?? raw.role, 120);
      const company = sanitizeText(
        raw.company ?? raw.organization ?? raw.entity,
        120
      );

      const headline = [title, role, company].filter(Boolean).join(' | ');
      if (headline) itemLines.push(headline);

      const meta = [it.dateRange, it.location, it.url].filter(Boolean).join(' | ');
      if (meta) itemLines.push(meta);

      const desc = sanitizeText(raw.description ?? raw.summary);
      if (desc) itemLines.push(desc);
      it.highlights.forEach((h) => itemLines.push(`- ${h}`));
      if (it.keywords.length > 0) {
        itemLines.push(`Technologies: ${it.keywords.join(', ')}`);
      }
    } else {
      const primary = sanitizeText(
        section.kind === 'publications' || section.kind === 'custom'
          ? raw.title ??
              raw.name ??
              raw.organization ??
              raw.institution ??
              raw.company ??
              raw.degree
          : raw.name ??
              raw.title ??
              raw.course ??
              raw.language ??
              raw.organization ??
              raw.institution ??
              raw.company ??
              raw.degree,
        160
      );
      const secondary = sanitizeText(
        raw.position ??
          raw.role ??
          raw.subtitle ??
          raw.issuer ??
          raw.awarder ??
          raw.publisher ??
          (raw.title && raw.company ? raw.company : undefined) ??
          (raw.name && raw.institution ? raw.institution : undefined) ??
          (raw.course && raw.institution ? raw.institution : undefined) ??
          (typeof raw.level === 'string'
            ? raw.level
            : typeof raw.level === 'number'
            ? raw.level <= 5
              ? `Level ${raw.level}/5`
              : `${raw.level}%`
            : undefined) ??
          raw.fluency,
        160
      );
      const contact = sanitizeText(raw.contact ?? raw.email ?? raw.phone, 160);

      const headline = [primary, secondary].filter(Boolean).join(' | ');
      if (headline) itemLines.push(headline);

      const meta = [it.dateRange, it.location, contact, it.url]
        .filter(Boolean)
        .join(' | ');
      if (meta) itemLines.push(meta);

      const desc = sanitizeText(raw.description ?? raw.summary ?? raw.reference);
      if (desc) itemLines.push(desc);
      it.highlights.forEach((h) => itemLines.push(`- ${h}`));
      if (it.keywords.length > 0) {
        itemLines.push(`Keywords: ${it.keywords.join(', ')}`);
      }
    }

    if (itemLines.length > 0) {
      itemBlocks.push(itemLines.join('\n'));
    }
  }

  if (itemBlocks.length > 0) {
    lines.push(itemBlocks.join('\n\n'));
  }

  return lines.join('\n');
}

/**
 * Generates an ATS-safe UTF-8 plain text document containing all active resume sections
 * in `sectionOrder`, enabled items only, with dates formatted identically to the frontend.
 */
export function renderResumePlainText(rawResume: Record<string, any>): string {
  const prepared = prepareExportableResume(rawResume);
  const blocks: string[] = [];

  const headerLines: string[] = [];
  const displayName = prepared.basics.name || prepared.title;
  if (displayName) {
    headerLines.push(displayName);
  }
  if (prepared.basics.label) {
    headerLines.push(prepared.basics.label);
  }
  if (prepared.basics.email) {
    headerLines.push(`Email: ${prepared.basics.email}`);
  }
  if (prepared.basics.phone) {
    headerLines.push(`Phone: ${prepared.basics.phone}`);
  }
  if (prepared.basics.formattedLocation) {
    headerLines.push(`Location: ${prepared.basics.formattedLocation}`);
  }
  for (const link of prepared.basics.links) {
    headerLines.push(`${link.key}: ${link.href}`);
  }

  if (headerLines.length > 0) {
    blocks.push(headerLines.join('\n'));
  }

  if (prepared.basics.summary) {
    blocks.push(`PROFESSIONAL SUMMARY\n${prepared.basics.summary}`);
  }

  for (const section of prepared.sections) {
    const rendered = formatPlainTextSection(section);
    if (rendered.trim()) {
      blocks.push(rendered);
    }
  }

  return `${blocks.join('\n\n')}\n`;
}

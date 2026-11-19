import net from 'net';
import PDFDocument from 'pdfkit';
import { AppError } from '../utils/appError';

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const PAGE_MARGIN_X = 42;
export const PAGE_MARGIN_Y = 40;
export const RENDER_TIMEOUT_MS = 4500;

const MAX_FIELD_LENGTH = 8000;
const MAX_SECTIONS = 60;
const MAX_ITEMS_PER_SECTION = 150;

export type CanonicalSectionKind =
  | 'work'
  | 'education'
  | 'projects'
  | 'skills'
  | 'other';

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
  templateId: 'modern' | 'professional';
  theme: {
    fontFamily: {
      heading: string;
      body: string;
      italic: string;
    };
    primaryColor: string;
    headingColor: string;
    textColor: string;
    sectionSpacingPt: number;
    itemSpacingPt: number;
  };
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
  certificates: 'CERTIFICATIONS',
  certifications: 'CERTIFICATIONS',
  languageitem: 'LANGUAGES',
  languages: 'LANGUAGES',
  courseitem: 'COURSES',
  courses: 'COURSES',
  awarditem: 'AWARDS',
  awards: 'AWARDS',
  achievementitem: 'ACHIEVEMENTS',
  achievements: 'ACHIEVEMENTS',
  achivements: 'ACHIEVEMENTS',
  organizationitem: 'ORGANIZATIONS',
  organizations: 'ORGANIZATIONS',
  organisations: 'ORGANIZATIONS',
  publicationitem: 'PUBLICATIONS',
  publications: 'PUBLICATIONS',
  referenceitem: 'REFERENCES',
  references: 'REFERENCES',
  interestitem: 'INTERESTS',
  interests: 'INTERESTS',
};

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

/**
 * Normalizes characters outside PDF standard 14 WinAnsiEncoding so built-in
 * vector fonts render cleanly without missing-glyph boxes.
 */
export function normalizePdfGlyphs(text: string): string {
  if (!text) return '';
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2212]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2194/g, '<->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2248/g, '~')
    .replace(/\u00D7/g, 'x')
    .replace(/\u2026/g, '...')
    // Strip remaining characters above U+00FF that are not in WinAnsi punctuation
    .replace(/[^\x09\x0A\x20-\xFF\u2013\u2014\u2022\u2122]/g, '');
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
  ext: 'pdf' | 'txt'
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

function formatResumeDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    return sanitizeText(value, 60);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const month = sanitizeText(obj.month, 20);
    const year = sanitizeText(obj.year, 10);
    return `${month} ${year}`.trim();
  }
  return '';
}

function formatItemDateRange(item: Record<string, unknown>): string {
  const start = formatResumeDate(item.startDate);
  const end = formatResumeDate(item.endDate);
  const singleDate = formatResumeDate(item.date);

  if (start) {
    const isCurrent = Boolean(item.current || item.isCurrent || !end);
    return `${start} - ${isCurrent ? 'Present' : end}`;
  }
  if (end) return end;
  if (singleDate) return singleDate;

  const dateRange = sanitizeText(item.dateRange, 80);
  if (dateRange) return dateRange;

  const period = sanitizeText(item.period, 80);
  if (period) return period;

  return '';
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
          return sanitizeText((entry as Record<string, unknown>).name, 80);
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

function resolveSectionKind(section: Record<string, unknown>): CanonicalSectionKind {
  const rawType = sanitizeText(section.type, 60).toLowerCase();
  if (WORK_TYPES.has(rawType)) return 'work';
  if (EDUCATION_TYPES.has(rawType)) return 'education';
  if (PROJECT_TYPES.has(rawType)) return 'projects';
  if (SKILL_TYPES.has(rawType)) return 'skills';

  const rawId = sanitizeText(section.id, 60).toLowerCase();
  if (WORK_TYPES.has(rawId)) return 'work';
  if (EDUCATION_TYPES.has(rawId)) return 'education';
  if (PROJECT_TYPES.has(rawId)) return 'projects';
  if (SKILL_TYPES.has(rawId)) return 'skills';

  return 'other';
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
  return (title || 'ADDITIONAL INFORMATION').toUpperCase();
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function resolvePdfFonts(
  templateId: 'modern' | 'professional',
  themeConfig: Record<string, unknown>
): { heading: string; body: string; italic: string } {
  const pairingId = sanitizeText(themeConfig.fontPairingId, 40).toLowerCase();
  const headingRaw = sanitizeText(themeConfig.headingFont, 200).toLowerCase();
  const bodyRaw = sanitizeText(themeConfig.bodyFont, 200).toLowerCase();

  if (pairingId === 'technical-mono' || headingRaw.includes('monospace') || headingRaw.includes('consolas')) {
    return {
      heading: 'Courier-Bold',
      body: 'Helvetica',
      italic: 'Helvetica-Oblique',
    };
  }

  if (pairingId === 'elegant-hybrid' || headingRaw.includes('playfair')) {
    return {
      heading: 'Times-Bold',
      body: 'Helvetica',
      italic: 'Helvetica-Oblique',
    };
  }

  if (
    pairingId === 'classic-serif' ||
    bodyRaw.includes('merriweather') ||
    bodyRaw.includes('georgia') ||
    bodyRaw.includes('times')
  ) {
    return {
      heading: 'Times-Bold',
      body: 'Times-Roman',
      italic: 'Times-Italic',
    };
  }

  if (pairingId === 'modern-sans' || bodyRaw.includes('sans-serif')) {
    return {
      heading: 'Helvetica-Bold',
      body: 'Helvetica',
      italic: 'Helvetica-Oblique',
    };
  }

  if (templateId === 'professional') {
    return {
      heading: 'Times-Bold',
      body: 'Times-Roman',
      italic: 'Times-Italic',
    };
  }

  return {
    heading: 'Helvetica-Bold',
    body: 'Helvetica',
    italic: 'Helvetica-Oblique',
  };
}

/**
 * Prepares a sanitized, privacy-filtered, ordered representation of a resume
 * ready for both Vector PDF and ATS Plain Text rendering.
 */
export function prepareExportableResume(rawResume: Record<string, any>): PreparedResume {
  const rawTemplate = sanitizeText(rawResume?.templateId ?? rawResume?.template, 40).toLowerCase();
  const templateId: 'modern' | 'professional' =
    rawTemplate === 'professional' ? 'professional' : 'modern';

  const themeConfig =
    rawResume?.themeConfig && typeof rawResume.themeConfig === 'object'
      ? (rawResume.themeConfig as Record<string, unknown>)
      : {};

  const defaultPrimary = '#1e293b';
  const defaultText = templateId === 'professional' ? '#334155' : '#374151';
  const defaultHeading = templateId === 'professional' ? '#1e293b' : '#111827';

  const primaryColor = sanitizeHexColor(themeConfig.primaryColor, defaultPrimary);
  const headingColor = sanitizeHexColor(
    themeConfig.headingColor,
    themeConfig.primaryColor ? primaryColor : defaultHeading
  );
  const textColor = sanitizeHexColor(themeConfig.textColor, defaultText);

  const spacingKey = sanitizeText(themeConfig.sectionSpacing, 20).toLowerCase();
  const spacingMap: Record<string, { section: number; item: number }> = {
    compact: { section: 11, item: 6 },
    normal: { section: 15, item: 9 },
    spacious: { section: 21, item: 13 },
  };
  const resolvedSpacing = spacingMap[spacingKey] || spacingMap.normal;

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
    ? rawResume.content.sections.slice(0, MAX_SECTIONS)
    : [];

  const rawOrder: string[] = Array.isArray(rawResume?.content?.sectionOrder)
    ? rawResume.content.sectionOrder.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  const orderedRawSections: Array<Record<string, any>> = [];
  const seenIds = new Set<string>();

  for (const id of rawOrder) {
    const match = rawSections.find((sec) => sec && sec.id === id);
    if (match && !seenIds.has(id)) {
      seenIds.add(id);
      orderedRawSections.push(match);
    }
  }
  for (const sec of rawSections) {
    if (!sec) continue;
    const secId = typeof sec.id === 'string' ? sec.id : '';
    if (secId && seenIds.has(secId)) continue;
    if (secId) seenIds.add(secId);
    orderedRawSections.push(sec);
  }

  const sections: PreparedSection[] = [];

  for (const sec of orderedRawSections) {
    if (!sec || sec.enabled === false) continue;

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
          dateRange: formatItemDateRange(item),
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
    templateId,
    theme: {
      fontFamily: resolvePdfFonts(templateId, themeConfig),
      primaryColor,
      headingColor,
      textColor,
      sectionSpacingPt: resolvedSpacing.section,
      itemSpacingPt: resolvedSpacing.item,
    },
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
          const name = sanitizeText(it.raw.name ?? it.raw.title, 120);
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
        raw.title ??
          raw.name ??
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
          raw.subtitle ??
          raw.issuer ??
          raw.awarder ??
          raw.publisher ??
          (raw.title && raw.company ? raw.company : '') ??
          (raw.course && raw.institution ? raw.institution : '') ??
          raw.fluency ??
          (typeof raw.level === 'string' ? raw.level : ''),
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
 * Generates an ATS-safe UTF-8 plain text document containing all active resume sections.
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

/**
 * Renders a deterministic A4 vector PDF mirroring the web preview template and theme.
 */
export async function renderResumePdf(rawResume: Record<string, any>): Promise<Buffer> {
  const prepared = prepareExportableResume(rawResume);

  const renderPromise = new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [A4_WIDTH_PT, A4_HEIGHT_PT],
        margins: {
          top: PAGE_MARGIN_Y,
          bottom: PAGE_MARGIN_Y,
          left: PAGE_MARGIN_X,
          right: PAGE_MARGIN_X,
        },
        info: {
          Title: normalizePdfGlyphs(prepared.title),
          Creator: 'Resume Builder Export Pipeline',
          Producer: 'Resume Builder Vector PDF Engine',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const usableWidth = A4_WIDTH_PT - PAGE_MARGIN_X * 2;
      const pageBottom = A4_HEIGHT_PT - PAGE_MARGIN_Y;
      const usablePageHeight = A4_HEIGHT_PT - PAGE_MARGIN_Y * 2;
      const { fontFamily, primaryColor, headingColor, textColor, sectionSpacingPt, itemSpacingPt } =
        prepared.theme;
      const isProfessional = prepared.templateId === 'professional';

      const ensureSpace = (neededHeight: number) => {
        if (doc.y + neededHeight > pageBottom) {
          doc.addPage();
          doc.y = PAGE_MARGIN_Y;
        }
      };

      const drawSplitRow = (opts: {
        leftText: string;
        leftFont: string;
        leftSize: number;
        leftColor: string;
        leftLink?: string;
        leftSuffixText?: string;
        leftSuffixLink?: string;
        leftSuffixColor?: string;
        rightText?: string;
        rightFont?: string;
        rightSize?: number;
        rightColor?: string;
      }) => {
        const leftClean = normalizePdfGlyphs(opts.leftText);
        const suffixClean = normalizePdfGlyphs(opts.leftSuffixText || '');
        const rightClean = normalizePdfGlyphs(opts.rightText || '');

        if (!leftClean && !suffixClean && !rightClean) return;

        let rightWidth = 0;
        let rightHeight = 0;
        if (rightClean) {
          doc.font(opts.rightFont || fontFamily.body).fontSize(opts.rightSize || 8.5);
          rightWidth = Math.min(usableWidth * 0.42, doc.widthOfString(rightClean) + 2);
          rightHeight = doc.heightOfString(rightClean, { width: rightWidth });
        }

        const leftMaxWidth = rightWidth > 0 ? usableWidth - rightWidth - 12 : usableWidth;
        doc.font(opts.leftFont).fontSize(opts.leftSize);
        const combinedLeft =
          leftClean && suffixClean ? `${leftClean}  ${suffixClean}` : leftClean || suffixClean;
        const leftHeight = combinedLeft
          ? doc.heightOfString(combinedLeft, { width: leftMaxWidth })
          : 0;

        const rowHeight = Math.max(leftHeight, rightHeight, opts.leftSize + 2);
        ensureSpace(rowHeight);

        const startY = doc.y;

        if (rightClean) {
          doc
            .font(opts.rightFont || fontFamily.body)
            .fontSize(opts.rightSize || 8.5)
            .fillColor(opts.rightColor || '#64748b')
            .text(rightClean, PAGE_MARGIN_X + usableWidth - rightWidth, startY, {
              width: rightWidth,
              align: 'right',
              lineBreak: false,
            });
        }

        let endLeftY = startY;
        if (leftClean) {
          doc
            .font(opts.leftFont)
            .fontSize(opts.leftSize)
            .fillColor(opts.leftColor);

          if (suffixClean) {
            const mainWidth = doc.widthOfString(leftClean);
            if (mainWidth + 16 < leftMaxWidth) {
              doc.text(leftClean, PAGE_MARGIN_X, startY, {
                width: mainWidth + 2,
                lineBreak: false,
                ...(opts.leftLink ? { link: opts.leftLink } : {}),
              });
              doc
                .font(fontFamily.body)
                .fontSize(Math.max(8, opts.leftSize - 1.5))
                .fillColor(opts.leftSuffixColor || primaryColor)
                .text(suffixClean, PAGE_MARGIN_X + mainWidth + 8, startY + 1, {
                  width: leftMaxWidth - mainWidth - 8,
                  ...(opts.leftSuffixLink ? { link: opts.leftSuffixLink, underline: true } : {}),
                });
              endLeftY = doc.y;
            } else {
              doc.text(leftClean, PAGE_MARGIN_X, startY, {
                width: leftMaxWidth,
                ...(opts.leftLink ? { link: opts.leftLink } : {}),
              });
              doc
                .font(fontFamily.body)
                .fontSize(Math.max(8, opts.leftSize - 1.5))
                .fillColor(opts.leftSuffixColor || primaryColor)
                .text(suffixClean, PAGE_MARGIN_X, doc.y + 1, {
                  width: leftMaxWidth,
                  ...(opts.leftSuffixLink ? { link: opts.leftSuffixLink, underline: true } : {}),
                });
              endLeftY = doc.y;
            }
          } else {
            doc.text(leftClean, PAGE_MARGIN_X, startY, {
              width: leftMaxWidth,
              ...(opts.leftLink ? { link: opts.leftLink } : {}),
            });
            endLeftY = doc.y;
          }
        } else if (suffixClean) {
          doc
            .font(fontFamily.body)
            .fontSize(Math.max(8, opts.leftSize - 1.5))
            .fillColor(opts.leftSuffixColor || primaryColor)
            .text(suffixClean, PAGE_MARGIN_X, startY, {
              width: leftMaxWidth,
              ...(opts.leftSuffixLink ? { link: opts.leftSuffixLink, underline: true } : {}),
            });
          endLeftY = doc.y;
        }

        doc.x = PAGE_MARGIN_X;
        doc.y = Math.max(endLeftY, startY + rightHeight);
      };

      const drawParagraph = (text: string, topGap = 3) => {
        const clean = normalizePdfGlyphs(text);
        if (!clean) return;
        doc.font(fontFamily.body).fontSize(9.5).fillColor(textColor);
        const lines = clean.split('\n');
        doc.y += topGap;
        for (const line of lines) {
          const trimmedLine = line.trimEnd();
          if (!trimmedLine) {
            doc.y += 4;
            continue;
          }
          const lineH = doc.heightOfString(trimmedLine, { width: usableWidth, lineGap: 1.5 });
          ensureSpace(Math.min(lineH, 28));
          doc.text(trimmedLine, PAGE_MARGIN_X, doc.y, {
            width: usableWidth,
            lineGap: 1.5,
          });
        }
      };

      const drawBullets = (bullets: string[]) => {
        if (!bullets.length) return;
        doc.y += 3;
        const bulletIndent = 11;
        const textWidth = usableWidth - bulletIndent;

        for (const rawBullet of bullets) {
          const bullet = normalizePdfGlyphs(rawBullet);
          if (!bullet) continue;
          doc.font(fontFamily.body).fontSize(9.3);
          const h = doc.heightOfString(bullet, { width: textWidth, lineGap: 1.2 });
          ensureSpace(Math.min(h, 26));
          const bulletTop = doc.y;
          doc
            .fillColor('#64748b')
            .text('\u2022', PAGE_MARGIN_X + 2, bulletTop, { width: bulletIndent, lineBreak: false });
          doc
            .fillColor(textColor)
            .text(bullet, PAGE_MARGIN_X + bulletIndent, bulletTop, {
              width: textWidth,
              lineGap: 1.2,
            });
          doc.x = PAGE_MARGIN_X;
          doc.y += 1.5;
        }
      };

      const drawKeywords = (keywords: string[], startX = PAGE_MARGIN_X, availableWidth = usableWidth) => {
        const cleanKeywords = keywords.map(normalizePdfGlyphs).filter(Boolean);
        if (!cleanKeywords.length) return;

        if (isProfessional) {
          doc.y += 2;
          const joined = cleanKeywords.join(', ');
          doc.font(fontFamily.body).fontSize(8.5).fillColor('#475569');
          const h = doc.heightOfString(joined, { width: availableWidth });
          ensureSpace(Math.min(h, 22));
          doc.text(joined, startX, doc.y, { width: availableWidth, lineGap: 1 });
          doc.x = PAGE_MARGIN_X;
          return;
        }

        // Modern template: crisp vector rounded pill chips
        doc.y += 3;
        doc.font(fontFamily.body).fontSize(8);
        const padX = 5.5;
        const chipHeight = 14;
        const gapX = 4.5;
        const gapY = 4;

        let cursorX = startX;
        ensureSpace(chipHeight + 2);
        let cursorY = doc.y;

        for (const kw of cleanKeywords) {
          const textW = Math.min(availableWidth - padX * 2, doc.widthOfString(kw));
          const chipW = textW + padX * 2;

          if (cursorX > startX && cursorX + chipW > startX + availableWidth) {
            cursorX = startX;
            cursorY += chipHeight + gapY;
            if (cursorY + chipHeight > pageBottom) {
              doc.addPage();
              cursorY = PAGE_MARGIN_Y;
            }
          }

          doc
            .save()
            .roundedRect(cursorX, cursorY, chipW, chipHeight, 3)
            .fillAndStroke('#f1f5f9', '#cbd5e1')
            .restore();

          doc
            .font(fontFamily.body)
            .fontSize(8)
            .fillColor('#334155')
            .text(kw, cursorX + padX, cursorY + 3, {
              width: textW + 1,
              lineBreak: false,
            });

          cursorX += chipW + gapX;
        }

        doc.x = PAGE_MARGIN_X;
        doc.y = cursorY + chipHeight + 2;
      };

      const drawSectionHeading = (headingText: string) => {
        const cleanHeading = normalizePdfGlyphs(headingText).toUpperCase();
        // break-after-avoid: keep heading together with first item block (~58pt minimum)
        ensureSpace(58);
        const headingY = doc.y;
        doc
          .font(fontFamily.heading)
          .fontSize(8.8)
          .fillColor(primaryColor)
          .text(cleanHeading, PAGE_MARGIN_X, headingY, {
            width: usableWidth,
            characterSpacing: isProfessional ? 1.3 : 1.0,
          });

        const ruleY = doc.y + 3;
        doc
          .save()
          .moveTo(PAGE_MARGIN_X, ruleY)
          .lineTo(PAGE_MARGIN_X + usableWidth, ruleY)
          .lineWidth(0.75)
          .strokeColor(isProfessional ? primaryColor : '#e2e8f0')
          .stroke()
          .restore();

        doc.y = ruleY + 7;
        doc.x = PAGE_MARGIN_X;
      };

      // ===================== HEADER =====================
      const displayName = normalizePdfGlyphs(prepared.basics.name || prepared.title);
      const displayLabel = normalizePdfGlyphs(prepared.basics.label);

      interface ContactPiece {
        text: string;
        href?: string;
      }
      const contactPieces: ContactPiece[] = [];
      if (prepared.basics.email) {
        contactPieces.push({
          text: normalizePdfGlyphs(prepared.basics.email),
          href: `mailto:${prepared.basics.email}`,
        });
      }
      if (prepared.basics.phone) {
        contactPieces.push({
          text: normalizePdfGlyphs(prepared.basics.phone),
          href: `tel:${prepared.basics.phone.replace(/\s+/g, '')}`,
        });
      }
      if (prepared.basics.formattedLocation) {
        contactPieces.push({
          text: normalizePdfGlyphs(prepared.basics.formattedLocation),
        });
      }
      for (const link of prepared.basics.links) {
        contactPieces.push({
          text: normalizePdfGlyphs(link.label),
          href: link.href,
        });
      }

      if (isProfessional) {
        const headerTop = doc.y;
        const contactColWidth = contactPieces.length > 0 ? Math.min(185, usableWidth * 0.38) : 0;
        const leftColWidth =
          contactColWidth > 0 ? usableWidth - contactColWidth - 14 : usableWidth;

        doc
          .font(fontFamily.heading)
          .fontSize(21)
          .fillColor(headingColor)
          .text(displayName, PAGE_MARGIN_X, headerTop, { width: leftColWidth });

        if (displayLabel) {
          doc
            .font(fontFamily.body)
            .fontSize(11)
            .fillColor(primaryColor)
            .text(displayLabel, PAGE_MARGIN_X, doc.y + 2, { width: leftColWidth });
        }
        const leftBottom = doc.y;

        let rightCursorY = headerTop + 2;
        if (contactPieces.length > 0) {
          const rightX = PAGE_MARGIN_X + usableWidth - contactColWidth;
          for (const piece of contactPieces) {
            if (!piece.text) continue;
            doc
              .font(fontFamily.body)
              .fontSize(8.5)
              .fillColor(piece.href ? primaryColor : '#475569')
              .text(piece.text, rightX, rightCursorY, {
                width: contactColWidth,
                align: 'right',
                ...(piece.href ? { link: piece.href } : {}),
              });
            rightCursorY = doc.y + 1.5;
          }
        }

        const borderY = Math.max(leftBottom, rightCursorY) + 8;
        doc
          .save()
          .moveTo(PAGE_MARGIN_X, borderY)
          .lineTo(PAGE_MARGIN_X + usableWidth, borderY)
          .lineWidth(1.5)
          .strokeColor(primaryColor)
          .stroke()
          .restore();

        doc.y = borderY + sectionSpacingPt;
        doc.x = PAGE_MARGIN_X;
      } else {
        // Modern template: centered header
        doc
          .font(fontFamily.heading)
          .fontSize(22)
          .fillColor(headingColor)
          .text(displayName, PAGE_MARGIN_X, doc.y, {
            width: usableWidth,
            align: 'center',
          });

        if (displayLabel) {
          doc
            .font(fontFamily.body)
            .fontSize(11)
            .fillColor(primaryColor)
            .text(displayLabel, PAGE_MARGIN_X, doc.y + 2, {
              width: usableWidth,
              align: 'center',
            });
        }

        if (contactPieces.length > 0) {
          doc.y += 5;
          doc.font(fontFamily.body).fontSize(8.5);
          const sep = '  \u2022  ';
          const sepW = doc.widthOfString(sep);

          // Group contact pieces into centered rows so each piece retains its clickable PDF link
          const rows: ContactPiece[][] = [];
          let currentRow: ContactPiece[] = [];
          let currentRowW = 0;

          for (const piece of contactPieces) {
            if (!piece.text) continue;
            const w = doc.widthOfString(piece.text);
            const needed = currentRow.length > 0 ? sepW + w : w;
            if (currentRow.length > 0 && currentRowW + needed > usableWidth) {
              rows.push(currentRow);
              currentRow = [piece];
              currentRowW = w;
            } else {
              currentRow.push(piece);
              currentRowW += needed;
            }
          }
          if (currentRow.length > 0) rows.push(currentRow);

          for (const row of rows) {
            const totalW = row.reduce(
              (acc, p, i) => acc + doc.widthOfString(p.text) + (i > 0 ? sepW : 0),
              0
            );
            let x = PAGE_MARGIN_X + Math.max(0, (usableWidth - totalW) / 2);
            const rowY = doc.y;
            row.forEach((p, i) => {
              if (i > 0) {
                doc.fillColor('#94a3b8').text(sep, x, rowY, { lineBreak: false });
                x += sepW;
              }
              const pw = doc.widthOfString(p.text);
              doc
                .fillColor(p.href ? primaryColor : '#475569')
                .text(p.text, x, rowY, {
                  width: pw + 2,
                  lineBreak: false,
                  ...(p.href ? { link: p.href } : {}),
                });
              x += pw;
            });
            doc.y = rowY + 12;
          }
        }

        const borderY = doc.y + 6;
        doc
          .save()
          .moveTo(PAGE_MARGIN_X, borderY)
          .lineTo(PAGE_MARGIN_X + usableWidth, borderY)
          .lineWidth(1.5)
          .strokeColor(primaryColor)
          .stroke()
          .restore();

        doc.y = borderY + sectionSpacingPt;
        doc.x = PAGE_MARGIN_X;
      }

      // ===================== SUMMARY =====================
      if (prepared.basics.summary) {
        drawSectionHeading(isProfessional ? 'Profile' : 'Professional Summary');
        drawParagraph(prepared.basics.summary, 0);
        if (prepared.sections.length > 0) {
          doc.y += sectionSpacingPt;
        }
      }

      // ===================== SECTIONS =====================
      prepared.sections.forEach((section, secIdx) => {
        drawSectionHeading(section.title);

        if (section.textContent) {
          drawParagraph(section.textContent, 0);
        } else if (section.kind === 'skills') {
          const hasGrouped = section.items.some((it) => it.keywords.length > 0);
          if (!hasGrouped) {
            const labels = section.items
              .map((it) => sanitizeText(it.raw.name ?? it.raw.title, 120))
              .filter(Boolean);
            if (isProfessional) {
              const joined = labels.map(normalizePdfGlyphs).join('  \u2022  ');
              doc.font(fontFamily.body).fontSize(9.5).fillColor(textColor);
              ensureSpace(16);
              doc.text(joined, PAGE_MARGIN_X, doc.y, { width: usableWidth, lineGap: 1.5 });
              doc.x = PAGE_MARGIN_X;
            } else {
              drawKeywords(labels);
            }
          } else {
            section.items.forEach((it, itemIdx) => {
              const groupName = normalizePdfGlyphs(
                sanitizeText(it.raw.name ?? it.raw.category ?? it.raw.title, 120)
              );
              const levelLabel = normalizePdfGlyphs(
                typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : ''
              );

              ensureSpace(22);
              if (isProfessional) {
                const startY = doc.y;
                const prefix =
                  it.keywords.length > 0 && groupName
                    ? `${groupName}: `
                    : levelLabel && groupName
                    ? `${groupName} (${levelLabel})`
                    : groupName;
                doc.font(fontFamily.heading).fontSize(9.5).fillColor(headingColor);
                const prefixW = prefix ? Math.min(160, doc.widthOfString(prefix) + 2) : 0;
                if (prefix) {
                  doc.text(prefix, PAGE_MARGIN_X, startY, {
                    width: prefixW,
                    lineBreak: false,
                  });
                }
                if (it.keywords.length > 0) {
                  const kwStr = it.keywords.map(normalizePdfGlyphs).join(', ');
                  doc
                    .font(fontFamily.body)
                    .fontSize(9.5)
                    .fillColor(textColor)
                    .text(kwStr, PAGE_MARGIN_X + prefixW, startY, {
                      width: usableWidth - prefixW,
                      lineGap: 1.2,
                    });
                }
                doc.x = PAGE_MARGIN_X;
                if (itemIdx < section.items.length - 1) {
                  doc.y += 4;
                }
              } else {
                const groupColW = 115;
                const rowStartY = doc.y;
                const labelDisplay =
                  levelLabel && !it.keywords.length && groupName
                    ? `${groupName} (${levelLabel})`
                    : groupName;
                if (labelDisplay) {
                  doc
                    .font(fontFamily.heading)
                    .fontSize(9.5)
                    .fillColor(headingColor)
                    .text(labelDisplay, PAGE_MARGIN_X, rowStartY + 2, {
                      width: groupColW - 6,
                    });
                }
                const labelEndY = doc.y;
                if (it.keywords.length > 0) {
                  doc.y = rowStartY - 3;
                  drawKeywords(it.keywords, PAGE_MARGIN_X + groupColW, usableWidth - groupColW);
                }
                doc.y = Math.max(doc.y, labelEndY) + (itemIdx < section.items.length - 1 ? 4 : 0);
                doc.x = PAGE_MARGIN_X;
              }
            });
          }
        } else {
          // Standard item sections (work, education, projects, other)
          section.items.forEach((it, itemIdx) => {
            const raw = it.raw;
            const descText = sanitizeText(
              raw.description ?? raw.summary ?? raw.reference
            );

            // break-inside-avoid heuristic: keep compact/medium items intact on a single page
            doc.font(fontFamily.body).fontSize(9.5);
            const descEst = descText
              ? doc.heightOfString(normalizePdfGlyphs(descText), { width: usableWidth })
              : 0;
            const bulletsEst = it.highlights.length * 14;
            const kwEst = it.keywords.length > 0 ? 20 : 0;
            const estimatedItemHeight = 28 + descEst + bulletsEst + kwEst;

            if (
              estimatedItemHeight <= usablePageHeight * 0.6 &&
              doc.y + estimatedItemHeight > pageBottom
            ) {
              doc.addPage();
              doc.y = PAGE_MARGIN_Y;
            } else {
              ensureSpace(32);
            }

            if (section.kind === 'work') {
              const position = sanitizeText(
                raw.position ?? raw.role ?? raw.jobTitle ?? raw.title,
                160
              );
              const company = sanitizeText(
                raw.company ?? raw.name ?? raw.organization ?? raw.employer,
                160
              );

              drawSplitRow({
                leftText: position,
                leftFont: fontFamily.heading,
                leftSize: 10.8,
                leftColor: headingColor,
                rightText: it.dateRange,
                rightFont: fontFamily.body,
                rightSize: 8.5,
              });

              if (company || it.urlLabel || it.location) {
                doc.y += 1;
                drawSplitRow({
                  leftText: company,
                  leftFont: isProfessional ? fontFamily.heading : fontFamily.body,
                  leftSize: 9.8,
                  leftColor: isProfessional ? '#334155' : primaryColor,
                  leftSuffixText: it.urlLabel,
                  leftSuffixLink: it.url,
                  rightText: it.location,
                  rightFont: isProfessional ? fontFamily.italic : fontFamily.body,
                  rightSize: 8.5,
                });
              }

              if (descText) drawParagraph(descText, 3);
              drawBullets(it.highlights);
              drawKeywords(it.keywords);
            } else if (section.kind === 'education') {
              const degree =
                sanitizeText(raw.degree, 160) ||
                [sanitizeText(raw.studyType, 80), sanitizeText(raw.area, 80)]
                  .filter(Boolean)
                  .join(' in ');
              const institution = sanitizeText(
                raw.institution ?? raw.school ?? raw.name,
                160
              );
              const field = sanitizeText(
                raw.field ?? (raw.degree && raw.area ? raw.area : ''),
                160
              );
              const gpa = sanitizeText(raw.gpa ?? raw.score, 40);

              drawSplitRow({
                leftText: degree,
                leftFont: fontFamily.heading,
                leftSize: 10.8,
                leftColor: headingColor,
                rightText: it.dateRange,
                rightFont: fontFamily.body,
                rightSize: 8.5,
              });

              const subParts = [
                institution,
                field,
                gpa ? `GPA: ${gpa}` : '',
              ].filter(Boolean);

              if (subParts.length > 0 || it.urlLabel || it.location) {
                doc.y += 1;
                drawSplitRow({
                  leftText: subParts.join(' \u00B7 '),
                  leftFont: fontFamily.body,
                  leftSize: 9.6,
                  leftColor: isProfessional ? '#334155' : primaryColor,
                  leftSuffixText: it.urlLabel,
                  leftSuffixLink: it.url,
                  rightText: it.location,
                  rightFont: isProfessional ? fontFamily.italic : fontFamily.body,
                  rightSize: 8.5,
                });
              }

              if (descText) drawParagraph(descText, 3);
              drawBullets(it.highlights);
            } else if (section.kind === 'projects') {
              const projTitle = sanitizeText(raw.name ?? raw.title, 160);
              const role = sanitizeText(raw.position ?? raw.role, 120);
              const company = sanitizeText(
                raw.company ?? raw.organization ?? raw.entity,
                120
              );

              drawSplitRow({
                leftText: projTitle,
                leftFont: fontFamily.heading,
                leftSize: 10.8,
                leftColor: headingColor,
                leftSuffixText: it.urlLabel,
                leftSuffixLink: it.url,
                rightText: it.dateRange,
                rightFont: fontFamily.body,
                rightSize: 8.5,
              });

              const roleCo = [role, company].filter(Boolean).join(' \u00B7 ');
              if (roleCo || it.location) {
                doc.y += 1;
                drawSplitRow({
                  leftText: roleCo,
                  leftFont: fontFamily.body,
                  leftSize: 9.5,
                  leftColor: primaryColor,
                  rightText: it.location,
                  rightFont: isProfessional ? fontFamily.italic : fontFamily.body,
                  rightSize: 8.5,
                });
              }

              if (descText) drawParagraph(descText, 3);
              drawBullets(it.highlights);
              drawKeywords(it.keywords);
            } else {
              const primary = sanitizeText(
                raw.title ??
                  raw.name ??
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
                  raw.subtitle ??
                  raw.issuer ??
                  raw.awarder ??
                  raw.publisher ??
                  (raw.title && raw.company ? raw.company : '') ??
                  (raw.course && raw.institution ? raw.institution : '') ??
                  raw.fluency ??
                  (typeof raw.level === 'string' ? raw.level : ''),
                160
              );

              drawSplitRow({
                leftText: primary,
                leftFont: fontFamily.heading,
                leftSize: 10.2,
                leftColor: headingColor,
                leftSuffixText: it.urlLabel,
                leftSuffixLink: it.url,
                rightText: it.dateRange,
                rightFont: fontFamily.body,
                rightSize: 8.5,
              });

              if (secondary || it.location) {
                doc.y += 1;
                drawSplitRow({
                  leftText: secondary,
                  leftFont: isProfessional ? fontFamily.italic : fontFamily.body,
                  leftSize: 9.4,
                  leftColor: '#475569',
                  rightText: it.location,
                  rightFont: isProfessional ? fontFamily.italic : fontFamily.body,
                  rightSize: 8.5,
                });
              }

              if (descText) drawParagraph(descText, 3);
              drawBullets(it.highlights);
              drawKeywords(it.keywords);
            }

            if (itemIdx < section.items.length - 1) {
              doc.y += itemSpacingPt;
            }
          });
        }

        if (secIdx < prepared.sections.length - 1) {
          doc.y += sectionSpacingPt;
        }
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new AppError('Document rendering timed out', 504));
    }, RENDER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([renderPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

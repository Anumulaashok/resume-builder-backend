import {
  FULL_SKILL_TAXONOMY,
  SkillCategory,
  TaxonomyMatch,
  getSkillDefinition,
  getTaxonomySkillCount,
  isKnownSkillAliasToken,
  matchTaxonomySkills,
  tokenizeForMatching,
} from './taxonomy';

export const REQUIRED_TIER_WEIGHT = 1.0;
export const PREFERRED_TIER_WEIGHT = 0.35;
export const TARGET_WORD_COUNT_MIN = 475;
export const TARGET_WORD_COUNT_MAX = 600;
export const DEFAULT_A4_HEIGHT_PX = 1123;

export type SkillTier = 'required' | 'preferred';

export interface AtsSubScores {
  keywords: number;
  structure: number;
  experience: number;
  formatting: number;
  skills: number;
}

export interface JobMatchBreakdown extends AtsSubScores {
  title: number;
}

export interface JobMatchKeyword {
  keyword: string;
  occurrences: number;
}

export interface TieredSkillMatch {
  keyword: string;
  category: SkillCategory;
  tier: SkillTier;
  weight: number;
  occurrences: number;
  matched: boolean;
}

export interface TransferableSkillHint {
  missingSkill: string;
  tier: SkillTier;
  resumeSkills: string[];
  category: SkillCategory;
  suggestion: string;
}

export interface BulletIssue {
  bulletIndex: number;
  bulletText: string;
  type: 'weak_verb' | 'missing_metric' | 'too_long' | 'too_short' | 'repeated_term';
  message: string;
  suggestedVerbs?: string[];
  metricPrompts?: string[];
}

export interface BulletDiagnosticsResult {
  bullets: string[];
  issues: BulletIssue[];
  strongBulletCount: number;
  quantifiedBulletCount: number;
  weakVerbCount: number;
  longBulletCount: number;
  repeatedTerms: string[];
  score: number;
}

export interface SectionHeadingIssue {
  sectionId: string;
  currentTitle: string;
  isCustom: boolean;
  suggestedStandardTitle: string;
  message: string;
}

export interface DateConsistencyResult {
  consistent: boolean;
  detectedFormats: string[];
  dominantFormat: string | null;
  chronologyIssues: string[];
  message?: string;
}

export interface LayoutDiagnostic {
  code: 'page_overflow' | 'word_count_low' | 'word_count_high' | 'non_ats_template' | 'skill_style_bars_dots';
  severity: 'warning' | 'info';
  message: string;
}

export interface AtsDiagnostics {
  headingIssues: SectionHeadingIssue[];
  dateConsistency: DateConsistencyResult;
  bulletDiagnostics: BulletDiagnosticsResult;
  layoutWarnings: LayoutDiagnostic[];
  strengths: string[];
  improvements: string[];
}

export interface JobMatchResult {
  score: number;
  label: 'Excellent match' | 'Good match' | 'Fair match' | 'Low match';
  mode: 'standalone' | 'job-match';
  guidanceDisclaimer: string;
  breakdown: JobMatchBreakdown;
  subScores: AtsSubScores;
  matchedKeywords: JobMatchKeyword[];
  missingKeywords: JobMatchKeyword[];
  skillTiers: TieredSkillMatch[];
  transferableSkills: TransferableSkillHint[];
  fallbackKeywords: {
    matched: JobMatchKeyword[];
    missing: JobMatchKeyword[];
  };
  suggestions: string[];
  totals: { matched: number; required: number };
  wordCount: number;
  diagnostics: AtsDiagnostics;
}

export interface ResumeLike {
  title?: string;
  summary?: string;
  templateId?: string;
  template?: string;
  themeConfig?: {
    skillStyle?: string;
    headingStyle?: string;
    pageMargins?: string;
    fontScale?: number;
    dateFormat?: string;
    [key: string]: unknown;
  };
  content?: {
    basics?: {
      name?: string;
      label?: string;
      email?: string;
      phone?: string;
      url?: string;
      website?: string;
      summary?: string;
      location?: Record<string, unknown>;
      profiles?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    sections?: Array<{
      id?: string;
      type?: string;
      title?: string;
      enabled?: boolean;
      isCustom?: boolean;
      content?: unknown;
    }>;
    sectionOrder?: string[];
  };
}

export interface EvaluateAtsOptions {
  jobDescription?: string;
  jobTitle?: string;
  pageHeightPx?: number;
  a4HeightPx?: number;
}

// Mirrors ATS_SECTION_HEADINGS from exportService.ts:L171-L233 plus common clean synonyms
export const ATS_SECTION_HEADINGS: Record<string, string> = {
  workitem: 'WORK EXPERIENCE',
  work: 'WORK EXPERIENCE',
  experience: 'WORK EXPERIENCE',
  workexperience: 'WORK EXPERIENCE',
  work_experience: 'WORK EXPERIENCE',
  professional_experience: 'WORK EXPERIENCE',
  professionalexperience: 'WORK EXPERIENCE',
  employment: 'WORK EXPERIENCE',
  employment_history: 'WORK EXPERIENCE',
  career_history: 'WORK EXPERIENCE',
  educationitem: 'EDUCATION',
  education: 'EDUCATION',
  academics: 'EDUCATION',
  academic_background: 'EDUCATION',
  skillitem: 'SKILLS',
  skill: 'SKILLS',
  skills: 'SKILLS',
  core_skills: 'SKILLS',
  core_competencies: 'SKILLS',
  technicalskillitem: 'TECHNICAL SKILLS',
  technicalskills: 'TECHNICAL SKILLS',
  technical_skills: 'TECHNICAL SKILLS',
  softskillitem: 'SOFT SKILLS',
  softskills: 'SOFT SKILLS',
  soft_skills: 'SOFT SKILLS',
  projectitem: 'PROJECTS',
  project: 'PROJECTS',
  projects: 'PROJECTS',
  key_projects: 'PROJECTS',
  selected_projects: 'PROJECTS',
  certificateitem: 'CERTIFICATIONS',
  certificate: 'CERTIFICATIONS',
  certificates: 'CERTIFICATIONS',
  certification: 'CERTIFICATIONS',
  certifications: 'CERTIFICATIONS',
  licenses_and_certifications: 'CERTIFICATIONS',
  languageitem: 'LANGUAGES',
  language: 'LANGUAGES',
  languages: 'LANGUAGES',
  courseitem: 'COURSES',
  course: 'COURSES',
  courses: 'COURSES',
  coursework: 'COURSES',
  relevant_coursework: 'COURSES',
  awarditem: 'AWARDS',
  award: 'AWARDS',
  awards: 'AWARDS',
  honors: 'AWARDS',
  honors_and_awards: 'AWARDS',
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
  volunteer_experience: 'ORGANIZATIONS',
  affiliations: 'ORGANIZATIONS',
  leadership: 'ORGANIZATIONS',
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
  summary: 'PROFESSIONAL SUMMARY',
  professional_summary: 'PROFESSIONAL SUMMARY',
  profile: 'PROFESSIONAL SUMMARY',
};

export const STANDARD_HEADING_SUGGESTIONS: string[] = [
  'Work Experience',
  'Projects',
  'Skills',
  'Technical Skills',
  'Education',
  'Certifications',
  'Achievements',
  'Awards',
  'Publications',
  'Organizations',
];

// Mirrors templateRegistry ATS & skillStyle defaults from frontend registry.ts:L52-L448
export const TEMPLATE_ATS_METADATA: Record<
  string,
  { name: string; atsFriendly: boolean; defaultSkillStyle: string; layout: string }
> = {
  modern: { name: 'Modern', atsFriendly: true, defaultSkillStyle: 'chips', layout: 'single' },
  professional: { name: 'Professional', atsFriendly: true, defaultSkillStyle: 'comma', layout: 'single' },
  minimal: { name: 'Clean Slate', atsFriendly: true, defaultSkillStyle: 'comma', layout: 'single' },
  'tech-split': { name: 'Systems Split', atsFriendly: true, defaultSkillStyle: 'chips', layout: 'sidebar-right' },
  'creative-sidebar': { name: 'Studio Sidebar', atsFriendly: false, defaultSkillStyle: 'bars', layout: 'sidebar-left' },
  'two-column': { name: 'Editorial Grid', atsFriendly: true, defaultSkillStyle: 'dots', layout: 'two-column' },
  classic: { name: 'Classic', atsFriendly: true, defaultSkillStyle: 'comma', layout: 'single' },
  executive: { name: 'Executive', atsFriendly: true, defaultSkillStyle: 'columns', layout: 'single' },
  compact: { name: 'Compact', atsFriendly: true, defaultSkillStyle: 'comma', layout: 'single' },
  timeline: { name: 'Timeline', atsFriendly: false, defaultSkillStyle: 'chips', layout: 'single' },
  'bold-header': { name: 'Bold Header', atsFriendly: false, defaultSkillStyle: 'chips', layout: 'single' },
  elegant: { name: 'Elegant', atsFriendly: false, defaultSkillStyle: 'comma', layout: 'single' },
  'accent-sidebar': { name: 'Accent Sidebar', atsFriendly: false, defaultSkillStyle: 'chips', layout: 'sidebar-left' },
  banded: { name: 'Banded', atsFriendly: true, defaultSkillStyle: 'columns', layout: 'single' },
  developer: { name: 'Developer', atsFriendly: true, defaultSkillStyle: 'chips', layout: 'single' },
  startup: { name: 'Startup', atsFriendly: false, defaultSkillStyle: 'chips', layout: 'sidebar-right' },
  academic: { name: 'Academic CV', atsFriendly: true, defaultSkillStyle: 'comma', layout: 'single' },
};

const STOPWORDS = new Set(
  (
    'a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our ' +
    'they their this these those who what which when where how all any can may must should would could about into over ' +
    'more most other such than then also not but if so do does did using use used work working team role job company ' +
    'experience years year strong excellent good great ability skills skill knowledge including etc plus well within ' +
    'across new looking candidate responsibilities requirements required preferred qualifications based help build ' +
    'building join us ensure develop developing development environment opportunity equal employer Ideal bonus nice ' +
    'have minimum desired position apply applicants day every extra mile rest assured gratitude'
  )
    .toLowerCase()
    .split(/\s+/)
);

const WEAK_VERB_PATTERNS: Array<{
  pattern: RegExp;
  matchedPhrase: string;
  suggestions: string[];
}> = [
  {
    pattern: /^worked\s+(?:on|with|in)\b/i,
    matchedPhrase: 'Worked on',
    suggestions: ['Built', 'Engineered', 'Developed', 'Implemented'],
  },
  {
    pattern: /^helped\s+(?:with|to|build|create|develop|manage|design)?\b/i,
    matchedPhrase: 'Helped',
    suggestions: ['Collaborated to build', 'Delivered', 'Implemented', 'Co-designed'],
  },
  {
    pattern: /^(?:was\s+)?responsible\s+for\b/i,
    matchedPhrase: 'Responsible for',
    suggestions: ['Owned', 'Led', 'Managed', 'Directed'],
  },
  {
    pattern: /^assisted\s+(?:in|with)?\b/i,
    matchedPhrase: 'Assisted',
    suggestions: ['Contributed', 'Implemented', 'Supported', 'Executed'],
  },
  {
    pattern: /^participated\s+in\b/i,
    matchedPhrase: 'Participated in',
    suggestions: ['Contributed to', 'Delivered', 'Executed', 'Spearheaded'],
  },
  {
    pattern: /^(?:was\s+)?involved\s+(?:in|with)\b/i,
    matchedPhrase: 'Involved in',
    suggestions: ['Engineered', 'Implemented', 'Integrated', 'Delivered'],
  },
  {
    pattern: /^duties\s+included\b/i,
    matchedPhrase: 'Duties included',
    suggestions: ['Executed', 'Managed', 'Delivered', 'Operated'],
  },
  {
    pattern: /^tasked\s+with\b/i,
    matchedPhrase: 'Tasked with',
    suggestions: ['Led', 'Architected', 'Implemented', 'spearheaded'],
  },
  {
    pattern: /^handled\b/i,
    matchedPhrase: 'Handled',
    suggestions: ['Managed', 'Orchestrated', 'Resolved', 'Processed'],
  },
  {
    pattern: /^dealt\s+with\b/i,
    matchedPhrase: 'Dealt with',
    suggestions: ['Resolved', 'Mitigated', 'Triaged', 'Managed'],
  },
  {
    pattern: /^(?:utilized|used)\b/i,
    matchedPhrase: 'Used / Utilized',
    suggestions: ['Applied', 'Built with', 'Engineered', 'Leveraged'],
  },
];

const METRIC_PROMPT_EXAMPLES = [
  'Did this reduce latency, response time, or build/processing duration?',
  'Did this increase throughput, reliability, conversion, or test coverage?',
  'How many users, customers, requests/day, integrations, or services did it support?',
  'Did it save engineering hours or infrastructure cost (only include numbers you can verify)?',
];

const METRIC_REGEX =
  /(?:\b\d+(?:\.\d+)?\s*(?:%|x|×|\+|k\b|m\b|b\b|ms\b|s\b|sec\b|secs\b|seconds?\b|mins?\b|minutes?\b|hrs?\b|hours?\b|days?\b|weeks?\b|months?\b|rps\b|qps\b|tps\b|gb\b|tb\b|mb\b|users?\b|customers?\b|clients?\b|engineers?\b|developers?\b|services?\b|microservices?\b|endpoints?\b|apis?\b|integrations?\b|pipelines?\b|writes?\b|reads?\b|events?\b|requests?\b|queries\b|charts?\b|types?\b|tables?\b|clusters?\b|nodes?\b|countries\b|teams?\b))|(?:\$\s*\d+(?:[.,]\d+)?\s*(?:k|m|b|thousand|million|billion)?\b)|(?:~\s*\d+(?:\.\d+)?\s*(?:%|x|×))/i;

const MONTH_NAMES_SHORT = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

const MONTH_NAMES_FULL = new Set([
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
]);

const MONTH_NUMBER_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export const ATS_GUIDANCE_DISCLAIMER =
  'Deterministic ATS guidance based on formatting, structure, and keyword rules — not an automated hiring guarantee.';

/**
 * Zero-safe percentage helper. Never inflates 0/0 to 100%.
 */
export function safePercent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export function scoreLabel(score: number): JobMatchResult['label'] {
  if (score >= 85) return 'Excellent match';
  if (score >= 65) return 'Good match';
  if (score >= 40) return 'Fair match';
  return 'Low match';
}

function normalizeHeadingKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isStandardSectionHeading(title: string, type?: string, isCustom?: boolean): boolean {
  const normTitle = normalizeHeadingKey(title || '');
  const compactTitle = normTitle.replace(/_/g, '');
  if (normTitle && (ATS_SECTION_HEADINGS[normTitle] || ATS_SECTION_HEADINGS[compactTitle])) {
    return true;
  }
  if (!isCustom && type) {
    const normType = normalizeHeadingKey(type).replace(/_/g, '');
    if (!title && ATS_SECTION_HEADINGS[normType]) {
      return true;
    }
  }
  return false;
}

export function suggestStandardHeading(title: string): string {
  const lower = (title || '').toLowerCase();
  if (/work|job|career|employ|journey|role|history|company|stint/.test(lower)) return 'Work Experience';
  if (/proj|build|built|portfolio|app|hack|side|creation/.test(lower)) return 'Projects';
  if (/skill|stack|tech|tool|superpower|arsenal|expertise|proficienc/.test(lower)) return 'Technical Skills';
  if (/edu|school|college|univ|degree|academ|study/.test(lower)) return 'Education';
  if (/cert|licen|credential|badge/.test(lower)) return 'Certifications';
  if (/win|award|honor|trophy|kudo|recogni/.test(lower)) return 'Awards';
  if (/achiev|impact|milestone|highlight/.test(lower)) return 'Achievements';
  if (/pub|paper|research|article|talk|speak/.test(lower)) return 'Publications';
  if (/volunt|communit|club|org|leader/.test(lower)) return 'Organizations';
  return 'Work Experience';
}

// ======================== VISIBILITY FILTERING (Requirement 7) ========================

export interface VisibleSection {
  id: string;
  type: string;
  title: string;
  isCustom: boolean;
  items: Array<Record<string, unknown>>;
  textContent: string;
}

export interface VisibleResume {
  title: string;
  summary: string;
  label: string;
  name: string;
  email: string;
  phone: string;
  hasLinkOrLocation: boolean;
  sections: VisibleSection[];
  allVisibleText: string;
  summaryText: string;
  experienceText: string;
  skillsSectionText: string;
  titleAndWorkText: string;
  wordCount: number;
}

function getOrderedEnabledSections(
  sections: Array<Record<string, any>> = [],
  sectionOrder: string[] = []
): Array<Record<string, any>> {
  if (!Array.isArray(sections) || sections.length === 0) return [];

  if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) {
    return sections.filter((s) => Boolean(s) && s.enabled !== false);
  }

  const seenIds = new Set<string>();
  const ordered: Array<Record<string, any>> = [];

  for (let i = 0; i < sectionOrder.length; i += 1) {
    const id = sectionOrder[i];
    if (typeof id !== 'string' || seenIds.has(id)) continue;
    const match = sections.find((s) => s && s.id === id);
    if (match) {
      seenIds.add(id);
      if (match.enabled !== false) {
        ordered.push(match);
      }
    }
  }

  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    if (!s || s.enabled === false) continue;
    const secId = typeof s.id === 'string' ? s.id : '';
    if (secId && seenIds.has(secId)) continue;
    if (secId) seenIds.add(secId);
    ordered.push(s);
  }

  return ordered;
}

const IGNORED_ITEM_KEYS = new Set([
  'id',
  '_id',
  'enabled',
  'current',
  'level',
  'proficiency',
  'url',
  'website',
  'link',
  'liveUrl',
]);

function collectEnabledItemStrings(value: unknown, out: string[], parentKey?: string): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectEnabledItemStrings(value[i], out, parentKey);
    }
    return;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.enabled === false) return;

    // Format date objects { month, year } cleanly
    if ('month' in record || 'year' in record) {
      const m = record.month !== undefined && record.month !== null ? String(record.month).trim() : '';
      const y = record.year !== undefined && record.year !== null ? String(record.year).trim() : '';
      const combined = `${m} ${y}`.trim();
      if (combined) out.push(combined);
      return;
    }

    const keys = Object.keys(record);
    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      if (IGNORED_ITEM_KEYS.has(key)) continue;
      collectEnabledItemStrings(record[key], out, key);
    }
  }
}

export function extractVisibleResume(resume: ResumeLike): VisibleResume {
  const basics = (resume?.content?.basics || {}) as Record<string, any>;
  const name = typeof basics.name === 'string' ? basics.name.trim() : '';
  const label = typeof basics.label === 'string' ? basics.label.trim() : '';
  const email = typeof basics.email === 'string' ? basics.email.trim() : '';
  const phone = typeof basics.phone === 'string' ? basics.phone.trim() : '';
  const basicsSummary = typeof basics.summary === 'string' ? basics.summary.trim() : '';
  const topSummary = typeof resume?.summary === 'string' ? resume.summary.trim() : '';
  const summary = basicsSummary || topSummary;
  const title = typeof resume?.title === 'string' ? resume.title.trim() : '';

  const loc = basics.location && typeof basics.location === 'object' ? (basics.location as Record<string, unknown>) : {};
  const locText = [loc.city, loc.region, loc.countryCode]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(', ');
  const hasProfiles = Array.isArray(basics.profiles) && basics.profiles.some((p: any) => p && p.url);
  const hasLinkOrLocation = Boolean(basics.url || basics.website || hasProfiles || locText);

  const rawSections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];
  const rawOrder = Array.isArray(resume?.content?.sectionOrder) ? resume!.content!.sectionOrder! : [];
  const enabledSections = getOrderedEnabledSections(rawSections as Array<Record<string, any>>, rawOrder);

  const visibleSections: VisibleSection[] = [];
  const allParts: string[] = [];
  const expParts: string[] = [];
  const skillParts: string[] = [];
  const workParts: string[] = [];

  if (name) allParts.push(name);
  if (label) allParts.push(label);
  if (locText) allParts.push(locText);
  if (summary) allParts.push(summary);

  for (let i = 0; i < enabledSections.length; i += 1) {
    const sec = enabledSections[i];
    const secId = typeof sec.id === 'string' ? sec.id : `sec-${i}`;
    const secType = typeof sec.type === 'string' ? sec.type : '';
    const secTitle = typeof sec.title === 'string' ? sec.title.trim() : '';
    const isCustom = Boolean(sec.isCustom) || secType.toLowerCase() === 'customitem';

    const secOut: string[] = [];
    const enabledItems: Array<Record<string, unknown>> = [];

    if (typeof sec.content === 'string') {
      const trimmed = sec.content.trim();
      if (trimmed) secOut.push(trimmed);
    } else if (Array.isArray(sec.content)) {
      for (let j = 0; j < sec.content.length; j += 1) {
        const item = sec.content[j];
        if (!item || typeof item !== 'object') continue;
        if ((item as Record<string, unknown>).enabled === false) continue;
        enabledItems.push(item as Record<string, unknown>);
        collectEnabledItemStrings(item, secOut);
      }
    }

    const sectionJoined = secOut.join(' ');
    visibleSections.push({
      id: secId,
      type: secType,
      title: secTitle,
      isCustom,
      items: enabledItems,
      textContent: sectionJoined,
    });

    if (secTitle && (enabledItems.length > 0 || sectionJoined)) {
      allParts.push(secTitle);
    }
    if (sectionJoined) {
      allParts.push(sectionJoined);
    }

    const descriptor = `${secType} ${secId} ${secTitle}`.toLowerCase();
    if (/work|experience|employment/.test(descriptor)) {
      if (sectionJoined) {
        expParts.push(sectionJoined);
        workParts.push(sectionJoined);
      }
    } else if (/project/.test(descriptor)) {
      if (sectionJoined) {
        expParts.push(sectionJoined);
      }
    } else if (/skill/.test(descriptor)) {
      if (sectionJoined) {
        skillParts.push(sectionJoined);
      }
    }
  }

  const allVisibleText = allParts.join(' ');
  const wordTokens = allVisibleText
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w));

  return {
    title,
    summary,
    label,
    name,
    email,
    phone,
    hasLinkOrLocation,
    sections: visibleSections,
    allVisibleText,
    summaryText: summary,
    experienceText: expParts.join(' '),
    skillsSectionText: skillParts.join(' '),
    titleAndWorkText: [title, label, workParts.join(' ')].filter(Boolean).join(' '),
    wordCount: wordTokens.length,
  };
}

// ======================== BULLET & IMPACT DIAGNOSTICS (Requirement 4) ========================

export function splitIntoBullets(text: string): string[] {
  if (!text || !text.trim()) return [];
  const rawLines = text
    .split(/\r?\n|(?:^|\s)[•▪●◦]\s+/)
    .map((line) => line.replace(/^\s*(?:[-*•▪●◦]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  return rawLines;
}

export function analyzeBulletDiagnostics(
  textOrBullets: string | string[]
): BulletDiagnosticsResult {
  const bullets = Array.isArray(textOrBullets)
    ? textOrBullets
        .map((b) => (typeof b === 'string' ? b.replace(/^\s*(?:[-*•▪●◦]|\d+[.)])\s*/, '').trim() : ''))
        .filter(Boolean)
    : splitIntoBullets(textOrBullets);

  if (bullets.length === 0) {
    return {
      bullets: [],
      issues: [],
      strongBulletCount: 0,
      quantifiedBulletCount: 0,
      weakVerbCount: 0,
      longBulletCount: 0,
      repeatedTerms: [],
      score: 0,
    };
  }

  const issues: BulletIssue[] = [];
  let weakVerbCount = 0;
  let quantifiedBulletCount = 0;
  let longBulletCount = 0;
  let strongBulletCount = 0;

  const leadVerbCounts = new Map<string, number>();
  const termCounts = new Map<string, number>();

  for (let i = 0; i < bullets.length; i += 1) {
    const bullet = bullets[i];
    const words = bullet.split(/\s+/).filter(Boolean);
    let bulletHasWeakVerb = false;
    let bulletTooLong = false;

    for (let w = 0; w < WEAK_VERB_PATTERNS.length; w += 1) {
      const rule = WEAK_VERB_PATTERNS[w];
      if (rule.pattern.test(bullet)) {
        bulletHasWeakVerb = true;
        weakVerbCount += 1;
        issues.push({
          bulletIndex: i,
          bulletText: bullet,
          type: 'weak_verb',
          message: `Bullet ${i + 1} starts with weak phrasing "${rule.matchedPhrase}". Start with a direct action verb such as ${rule.suggestions.slice(0, 3).join(', ')}.`,
          suggestedVerbs: rule.suggestions,
        });
        break;
      }
    }

    const hasMetric = METRIC_REGEX.test(bullet);
    if (hasMetric) {
      quantifiedBulletCount += 1;
    } else {
      issues.push({
        bulletIndex: i,
        bulletText: bullet,
        type: 'missing_metric',
        message: `Bullet ${i + 1} has no measurable outcome. Add a verifiable metric you achieved (e.g., % latency reduction, throughput, scale, or hours saved) — never invent numbers.`,
        metricPrompts: METRIC_PROMPT_EXAMPLES,
      });
    }

    if (words.length > 32 || bullet.length > 220) {
      bulletTooLong = true;
      longBulletCount += 1;
      issues.push({
        bulletIndex: i,
        bulletText: bullet,
        type: 'too_long',
        message: `Bullet ${i + 1} is ${words.length} words (${bullet.length} chars). Tighten to 15–28 words or split into two focused bullets.`,
      });
    } else if (words.length > 0 && words.length < 5) {
      issues.push({
        bulletIndex: i,
        bulletText: bullet,
        type: 'too_short',
        message: `Bullet ${i + 1} is only ${words.length} words. Expand with what you built, how you built it, and the factual outcome.`,
      });
    }

    if (!bulletHasWeakVerb && hasMetric && !bulletTooLong && words.length >= 6) {
      strongBulletCount += 1;
    }

    if (words.length > 0) {
      const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
      if (firstWord.length > 2 && !STOPWORDS.has(firstWord)) {
        leadVerbCounts.set(firstWord, (leadVerbCounts.get(firstWord) || 0) + 1);
      }
    }

    // Count distinct content words per bullet/overall for repetition detection
    const bulletTokens = tokenizeForMatching(bullet);
    for (let t = 0; t < bulletTokens.length; t += 1) {
      const tok = bulletTokens[t].lower;
      if (tok.length > 3 && !STOPWORDS.has(tok) && !/^\d+$/.test(tok) && !isKnownSkillAliasToken(tok)) {
        termCounts.set(tok, (termCounts.get(tok) || 0) + 1);
      }
    }
  }

  const repeatedTerms: string[] = [];
  leadVerbCounts.forEach((count, verb) => {
    if (count >= 3) {
      repeatedTerms.push(verb);
    }
  });
  termCounts.forEach((count, term) => {
    const threshold = Math.max(4, Math.ceil(bullets.length * 0.75));
    if (count >= threshold && repeatedTerms.indexOf(term) === -1) {
      repeatedTerms.push(term);
    }
  });

  if (repeatedTerms.length > 0) {
    issues.push({
      bulletIndex: 0,
      bulletText: bullets[0],
      type: 'repeated_term',
      message: `Repeated terms detected (${repeatedTerms.slice(0, 4).map((t) => `"${t}"`).join(', ')}). Vary your action verbs and phrasing across bullets.`,
    });
  }

  // Deterministic bullet score (0..100)
  const verbRatio = (bullets.length - weakVerbCount) / bullets.length;
  const targetQuantified = Math.max(1, Math.ceil(bullets.length * 0.5));
  const metricRatio = Math.min(1, quantifiedBulletCount / targetQuantified);
  const lengthRatio = (bullets.length - longBulletCount) / bullets.length;
  const repetitionPenalty = Math.min(15, repeatedTerms.length * 5);

  const rawScore = Math.round(verbRatio * 40 + metricRatio * 40 + lengthRatio * 20 - repetitionPenalty);

  return {
    bullets,
    issues,
    strongBulletCount,
    quantifiedBulletCount,
    weakVerbCount,
    longBulletCount,
    repeatedTerms,
    score: Math.max(0, Math.min(100, rawScore)),
  };
}

// ======================== DATE CONSISTENCY & HEADINGS (Requirement 5) ========================

function classifySingleDate(
  rawVal: unknown
): { format: string | null; yearNum: number | null; monthNum: number | null; isPresent: boolean } {
  if (rawVal === null || rawVal === undefined) {
    return { format: null, yearNum: null, monthNum: null, isPresent: false };
  }

  if (typeof rawVal === 'object' && !Array.isArray(rawVal)) {
    const rec = rawVal as Record<string, unknown>;
    const m = rec.month !== undefined && rec.month !== null ? String(rec.month).trim() : '';
    const y = rec.year !== undefined && rec.year !== null ? String(rec.year).trim() : '';
    if (!m && !y) return { format: null, yearNum: null, monthNum: null, isPresent: false };
    if (y && !m && /^\d{4}$/.test(y)) {
      return { format: 'YYYY', yearNum: Number(y), monthNum: null, isPresent: false };
    }
    const mLower = m.toLowerCase().replace(/\.$/, '');
    const mIdx = MONTH_NUMBER_MAP[mLower] || (/^\d{1,2}$/.test(mLower) ? Number(mLower) : null);
    const yNum = /^\d{4}$/.test(y) ? Number(y) : null;
    if (MONTH_NAMES_SHORT.has(mLower) && yNum) {
      return { format: 'MMM YYYY', yearNum: yNum, monthNum: mIdx, isPresent: false };
    }
    if (MONTH_NAMES_FULL.has(mLower) && yNum) {
      return { format: 'MMMM YYYY', yearNum: yNum, monthNum: mIdx, isPresent: false };
    }
    if (/^\d{1,2}$/.test(mLower) && yNum) {
      return { format: 'MM/YYYY', yearNum: yNum, monthNum: mIdx, isPresent: false };
    }
    return { format: 'unparsed', yearNum: yNum, monthNum: mIdx, isPresent: false };
  }

  if (typeof rawVal !== 'string' && typeof rawVal !== 'number') {
    return { format: null, yearNum: null, monthNum: null, isPresent: false };
  }

  const str = String(rawVal).trim();
  if (!str) return { format: null, yearNum: null, monthNum: null, isPresent: false };
  if (/^(?:present|current|now|ongoing)$/i.test(str)) {
    return { format: null, yearNum: null, monthNum: null, isPresent: true };
  }

  // YYYY
  if (/^\d{4}$/.test(str)) {
    return { format: 'YYYY', yearNum: Number(str), monthNum: null, isPresent: false };
  }

  // MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const m = Number(slashMatch[1]);
    return {
      format: m >= 1 && m <= 12 ? 'MM/YYYY' : 'unparsed',
      yearNum: Number(slashMatch[2]),
      monthNum: m >= 1 && m <= 12 ? m : null,
      isPresent: false,
    };
  }

  // YYYY-MM or YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (isoMatch) {
    const m = Number(isoMatch[2]);
    return {
      format: m >= 1 && m <= 12 ? 'YYYY-MM' : 'unparsed',
      yearNum: Number(isoMatch[1]),
      monthNum: m >= 1 && m <= 12 ? m : null,
      isPresent: false,
    };
  }

  // MMM YYYY or MMMM YYYY
  const wordMatch = str.match(/^([A-Za-z]+)\.?\s*,?\s*(\d{4})$/);
  if (wordMatch) {
    const mLower = wordMatch[1].toLowerCase();
    const yNum = Number(wordMatch[2]);
    const mIdx = MONTH_NUMBER_MAP[mLower] || null;
    if (MONTH_NAMES_SHORT.has(mLower)) {
      return { format: 'MMM YYYY', yearNum: yNum, monthNum: mIdx, isPresent: false };
    }
    if (MONTH_NAMES_FULL.has(mLower)) {
      return { format: 'MMMM YYYY', yearNum: yNum, monthNum: mIdx, isPresent: false };
    }
  }

  return { format: 'unparsed', yearNum: null, monthNum: null, isPresent: false };
}

export function analyzeDateConsistency(sections: VisibleSection[]): DateConsistencyResult {
  const formatCounts = new Map<string, number>();
  const chronologyIssues: string[] = [];

  for (let s = 0; s < sections.length; s += 1) {
    const sec = sections[s];
    for (let i = 0; i < sec.items.length; i += 1) {
      const item = sec.items[i];
      const startInfo = classifySingleDate(item.startDate);
      const endInfo = item.current ? { format: null, yearNum: null, monthNum: null, isPresent: true } : classifySingleDate(item.endDate);
      const singleInfo = classifySingleDate(item.date);

      if (startInfo.format) {
        formatCounts.set(startInfo.format, (formatCounts.get(startInfo.format) || 0) + 1);
      }
      if (endInfo.format) {
        formatCounts.set(endInfo.format, (formatCounts.get(endInfo.format) || 0) + 1);
      }
      if (singleInfo.format) {
        formatCounts.set(singleInfo.format, (formatCounts.get(singleInfo.format) || 0) + 1);
      }

      if (
        startInfo.yearNum &&
        endInfo.yearNum &&
        !endInfo.isPresent
      ) {
        const startComparable = startInfo.yearNum * 12 + (startInfo.monthNum || 1);
        const endComparable = endInfo.yearNum * 12 + (endInfo.monthNum || 12);
        if (startComparable > endComparable) {
          const itemLabel = String(item.company || item.name || item.institution || item.title || sec.title);
          chronologyIssues.push(
            `Start date is after end date in "${itemLabel}".`
          );
        }
      }
    }
  }

  const detectedFormats = Array.from(formatCounts.keys());
  let dominantFormat: string | null = null;
  let maxCount = 0;
  formatCounts.forEach((count, fmt) => {
    if (count > maxCount) {
      maxCount = count;
      dominantFormat = fmt;
    }
  });

  const hasUnparsed = formatCounts.has('unparsed');
  const consistent = detectedFormats.length <= 1 && !hasUnparsed && chronologyIssues.length === 0;

  let message: string | undefined;
  if (detectedFormats.length > 1) {
    message = `Mixed date formats detected across entries (${detectedFormats.join(', ')}). Standardize all dates to one ATS-safe format such as "Jan 2023" (MMM YYYY).`;
  } else if (hasUnparsed) {
    message = 'Unrecognized date format detected. Use a standard ATS format such as "Jan 2023" or "01/2023".';
  } else if (chronologyIssues.length > 0) {
    message = chronologyIssues[0];
  }

  return {
    consistent,
    detectedFormats,
    dominantFormat,
    chronologyIssues,
    message,
  };
}

export function analyzeSectionHeadings(sections: VisibleSection[]): SectionHeadingIssue[] {
  const issues: SectionHeadingIssue[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const sec = sections[i];
    if (!isStandardSectionHeading(sec.title, sec.type, sec.isCustom)) {
      const suggested = suggestStandardHeading(sec.title);
      issues.push({
        sectionId: sec.id,
        currentTitle: sec.title || 'Untitled Section',
        isCustom: sec.isCustom,
        suggestedStandardTitle: suggested,
        message: `Non-standard section heading "${sec.title || 'Untitled Section'}" may be skipped by ATS parsers. Rename it to a standard heading such as "${suggested}".`,
      });
    }
  }
  return issues;
}

// ======================== JD SEGMENTATION & FALLBACK NOUN PHRASES ========================

const PREFERRED_HEADER_REGEX =
  /^(?:#+\s*)?(?:preferred|nice[\s-]to[\s-]have|bonus(?:\s+points|\s+qualifications|\s+skills)?|desired(?:\s+qualifications|\s+skills)?|pluses|good[\s-]to[\s-]have|optional|additional\s+qualifications)(?:\s+(?:qualifications|skills|experience|requirements))?\s*:?\s*$/i;

const REQUIRED_HEADER_REGEX =
  /^(?:#+\s*)?(?:required|requirements|minimum\s+qualifications|basic\s+qualifications|must[\s-]haves?|what\s+you(?:'ll|\s+will)?\s+(?:need|bring)|core\s+(?:requirements|skills|qualifications)|qualifications|essential\s+skills|responsibilities|what\s+you\s+will\s+do|about\s+the\s+role)\s*:?\s*$/i;

const INLINE_PREFERRED_PREFIX_REGEX =
  /^\s*[-*•▪]?\s*(?:preferred|nice[\s-]to[\s-]have|bonus(?:\s+points)?|desired|optional)\s*:\s*(.+)$/i;

const INLINE_REQUIRED_PREFIX_REGEX =
  /^\s*[-*•▪]?\s*(?:required|must[\s-]have|minimum\s+qualifications|requirements)\s*:\s*(.+)$/i;

export interface SegmentedJobDescription {
  requiredText: string;
  preferredText: string;
}

export function segmentJobDescription(jobDescription: string): SegmentedJobDescription {
  if (!jobDescription || !jobDescription.trim()) {
    return { requiredText: '', preferredText: '' };
  }

  const lines = jobDescription.split(/\r?\n/);
  const requiredLines: string[] = [];
  const preferredLines: string[] = [];
  let currentTier: SkillTier = 'required';

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const inlinePref = trimmed.match(INLINE_PREFERRED_PREFIX_REGEX);
    if (inlinePref) {
      preferredLines.push(inlinePref[1]);
      currentTier = 'preferred';
      continue;
    }

    const inlineReq = trimmed.match(INLINE_REQUIRED_PREFIX_REGEX);
    if (inlineReq) {
      requiredLines.push(inlineReq[1]);
      currentTier = 'required';
      continue;
    }

    // Standalone header line (typically <= 6 words)
    if (trimmed.split(/\s+/).length <= 6) {
      if (PREFERRED_HEADER_REGEX.test(trimmed)) {
        currentTier = 'preferred';
        continue;
      }
      if (REQUIRED_HEADER_REGEX.test(trimmed)) {
        currentTier = 'required';
        continue;
      }
    }

    if (currentTier === 'preferred') {
      preferredLines.push(rawLine);
    } else {
      requiredLines.push(rawLine);
    }
  }

  return {
    requiredText: requiredLines.join('\n'),
    preferredText: preferredLines.join('\n'),
  };
}

const GENERIC_PHRASE_WORDS = new Set([
  'extra', 'mile', 'rest', 'assured', 'gratitude', 'spring', 'fast', 'paced', 'equal',
  'opportunity', 'employer', 'track', 'record', 'self', 'starter', 'team', 'player',
  'full', 'time', 'part', 'time', ' competitive', 'salary', 'health', 'insurance',
  'paid', 'time', 'sexual', 'orientation', 'national', 'origin', 'veteran', 'status',
  'years', 'experience', 'bachelor', 'degree', 'strong', 'understanding', 'hands',
  'proven', 'ability', 'verbal', 'written', 'attention', 'detail',
]);

/**
 * Extracts salient 2-3 word domain noun phrases when taxonomy skill hits equal zero (Requirement 11).
 */
export function extractFallbackNounPhrases(jobDescription: string, maxPhrases = 12): JobMatchKeyword[] {
  if (!jobDescription || !jobDescription.trim()) return [];

  const phraseCounts = new Map<string, number>();
  // Split into clauses on punctuation / newlines
  const clauses = jobDescription
    .toLowerCase()
    .split(/[\n\r.,;:!?()[\]{}"“”/\\|•▪]+/);

  for (let c = 0; c < clauses.length; c += 1) {
    const words = clauses[c]
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(Boolean);

    let run: string[] = [];
    const flushRun = () => {
      if (run.length >= 2) {
        for (let len = Math.min(3, run.length); len >= 2; len -= 1) {
          for (let start = 0; start + len <= run.length; start += 1) {
            const slice = run.slice(start, start + len);
            if (slice.every((w) => GENERIC_PHRASE_WORDS.has(w))) continue;
            const phrase = slice.join(' ');
            phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
          }
        }
      }
      run = [];
    };

    for (let w = 0; w < words.length; w += 1) {
      const word = words[w];
      if (
        word.length >= 3 &&
        !STOPWORDS.has(word) &&
        !GENERIC_PHRASE_WORDS.has(word) &&
        !/^\d+$/.test(word)
      ) {
        run.push(word);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  const entries: JobMatchKeyword[] = [];
  phraseCounts.forEach((occurrences, keyword) => {
    entries.push({ keyword, occurrences });
  });

  entries.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return b.keyword.split(' ').length - a.keyword.split(' ').length;
  });

  // Deduplicate sub-phrases already covered by a selected 3-word phrase
  const selected: JobMatchKeyword[] = [];
  for (let i = 0; i < entries.length && selected.length < maxPhrases; i += 1) {
    const candidate = entries[i];
    const subsumed = selected.some(
      (s) => s.keyword.indexOf(candidate.keyword) !== -1 && s.occurrences >= candidate.occurrences
    );
    if (!subsumed) {
      selected.push(candidate);
    }
  }

  return selected;
}

function tokenizeGeneralTerms(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function containsWholePhrase(normalizedText: string, phrase: string): boolean {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`);
  return regex.test(normalizedText);
}

// ======================== LAYOUT & FORMATTING DIAGNOSTICS (Requirement 6) ========================

export function evaluateLayoutDiagnostics(
  resume: ResumeLike,
  wordCount: number,
  options?: { pageHeightPx?: number; a4HeightPx?: number }
): { warnings: LayoutDiagnostic[]; formattingScore: number } {
  if (wordCount === 0) {
    return { warnings: [], formattingScore: 0 };
  }

  const warnings: LayoutDiagnostic[] = [];
  let score = 100;

  const rawTemplateId = String(resume?.templateId || resume?.template || 'modern')
    .trim()
    .toLowerCase();
  const templateMeta = TEMPLATE_ATS_METADATA[rawTemplateId] || TEMPLATE_ATS_METADATA.modern;
  const effectiveSkillStyle = String(
    resume?.themeConfig?.skillStyle || templateMeta.defaultSkillStyle || 'chips'
  )
    .trim()
    .toLowerCase();

  const a4Height = options?.a4HeightPx || DEFAULT_A4_HEIGHT_PX;
  const pageHeight = options?.pageHeightPx || 0;

  if (pageHeight > a4Height) {
    score -= 18;
    warnings.push({
      code: 'page_overflow',
      severity: 'warning',
      message: `Content overflows one A4 page (${Math.round(pageHeight)}px > ${a4Height}px). Tighten bullets or use Compact spacing to fit on a single page.`,
    });
  }

  if (!templateMeta.atsFriendly) {
    score -= 20;
    warnings.push({
      code: 'non_ats_template',
      severity: 'warning',
      message: `Selected template (${templateMeta.name}) is marked less ATS-friendly due to multi-column/decorative styling. Consider a single-column ATS template.`,
    });
  }

  if (effectiveSkillStyle === 'bars' || effectiveSkillStyle === 'dots') {
    score -= 15;
    warnings.push({
      code: 'skill_style_bars_dots',
      severity: 'warning',
      message: `Skills use visual ${effectiveSkillStyle} ratings, which ATS parsers cannot interpret reliably. Switch skill style to Comma or Chips.`,
    });
  }

  if (wordCount < TARGET_WORD_COUNT_MIN) {
    const deficitRatio = (TARGET_WORD_COUNT_MIN - wordCount) / TARGET_WORD_COUNT_MIN;
    score -= Math.min(20, Math.max(6, Math.round(deficitRatio * 22)));
    warnings.push({
      code: 'word_count_low',
      severity: 'info',
      message: `Resume has ${wordCount} words (recommended ATS target: ${TARGET_WORD_COUNT_MIN}–${TARGET_WORD_COUNT_MAX} words). Add concrete impact details where relevant.`,
    });
  } else if (wordCount > TARGET_WORD_COUNT_MAX) {
    const excessRatio = Math.min(1, (wordCount - TARGET_WORD_COUNT_MAX) / 400);
    score -= Math.min(18, Math.max(6, Math.round(excessRatio * 18)));
    warnings.push({
      code: 'word_count_high',
      severity: 'warning',
      message: `Resume has ${wordCount} words (recommended ATS target: ${TARGET_WORD_COUNT_MIN}–${TARGET_WORD_COUNT_MAX} words). Trim repetitive or older bullets for conciseness.`,
    });
  }

  const fontScale = typeof resume?.themeConfig?.fontScale === 'number' ? resume!.themeConfig!.fontScale! : 1;
  if (fontScale < 0.85 || fontScale > 1.18) {
    score -= 6;
  }

  return {
    warnings,
    formattingScore: Math.max(0, Math.min(100, score)),
  };
}

// ======================== UNIFIED DETERMINISTIC ATS & JOB MATCH ENGINE ========================

export function evaluateAts(
  resume: ResumeLike,
  options: EvaluateAtsOptions = {}
): JobMatchResult {
  const rawJd = typeof options.jobDescription === 'string' ? options.jobDescription : '';
  const trimmedJd = rawJd.trim();
  const isJobMatch = trimmedJd.length > 0;
  const rawJobTitle = typeof options.jobTitle === 'string' ? options.jobTitle.trim() : '';

  const visible = extractVisibleResume(resume || {});
  const isEmptyResume = visible.wordCount === 0;

  // Extract all visible bullets from Work/Experience & Projects (or fallback to all section descriptions)
  const bulletList: string[] = [];
  for (let s = 0; s < visible.sections.length; s += 1) {
    const sec = visible.sections[s];
    const secDesc = `${sec.type} ${sec.id} ${sec.title}`.toLowerCase();
    const isExpOrProj = /work|experience|employment|project|achiev/.test(secDesc);
    if (!isExpOrProj) continue;

    for (let i = 0; i < sec.items.length; i += 1) {
      const item = sec.items[i];
      if (typeof item.description === 'string' && item.description.trim()) {
        const split = splitIntoBullets(item.description);
        for (let b = 0; b < split.length; b += 1) bulletList.push(split[b]);
      }
      if (Array.isArray(item.highlights)) {
        for (let h = 0; h < item.highlights.length; h += 1) {
          if (typeof item.highlights[h] === 'string' && item.highlights[h].trim()) {
            bulletList.push(item.highlights[h].trim());
          }
        }
      }
    }
  }

  const bulletDiagnostics = analyzeBulletDiagnostics(bulletList);
  const headingIssues = analyzeSectionHeadings(visible.sections);
  const dateConsistency = analyzeDateConsistency(visible.sections);
  const { warnings: layoutWarnings, formattingScore } = evaluateLayoutDiagnostics(
    resume || {},
    visible.wordCount,
    { pageHeightPx: options.pageHeightPx, a4HeightPx: options.a4HeightPx }
  );

  // Compute Structure sub-score (0..100)
  let structureScore = 0;
  if (!isEmptyResume) {
    structureScore = 100;
    const hasContact = Boolean(visible.name && visible.email);
    const hasSummary = visible.summary.length >= 20;
    const hasWork = visible.sections.some((s) =>
      /work|experience|employment/.test(`${s.type} ${s.id} ${s.title}`.toLowerCase()) && s.items.length > 0
    );
    const hasSkills = visible.sections.some((s) =>
      /skill/.test(`${s.type} ${s.id} ${s.title}`.toLowerCase()) && s.items.length > 0
    );
    const hasEducation = visible.sections.some((s) =>
      /education|academic/.test(`${s.type} ${s.id} ${s.title}`.toLowerCase()) && s.items.length > 0
    );

    if (!hasContact) structureScore -= 15;
    if (!hasSummary) structureScore -= 8;
    if (!hasWork) structureScore -= 20;
    if (!hasSkills) structureScore -= 12;
    if (!hasEducation) structureScore -= 8;

    structureScore -= Math.min(30, headingIssues.length * 15);
    if (!dateConsistency.consistent) {
      structureScore -= 15;
    }
    structureScore = Math.max(0, Math.min(100, structureScore));
  }

  // Match taxonomy skills across enabled resume text & summary
  const resumeSkillMap = matchTaxonomySkills(visible.allVisibleText);
  const summarySkillMap = matchTaxonomySkills(visible.summaryText);
  const normalizedResumeLower = ` ${visible.allVisibleText.toLowerCase().replace(/\s+/g, ' ')} `;
  const normalizedTitleWorkLower = ` ${visible.titleAndWorkText.toLowerCase().replace(/\s+/g, ' ')} `;

  // ======================== STANDALONE MODE ========================
  if (!isJobMatch) {
    const resumeSkillsArr: TaxonomyMatch[] = [];
    resumeSkillMap.forEach((val) => resumeSkillsArr.push(val));
    resumeSkillsArr.sort((a, b) => b.occurrences - a.occurrences);

    let skillsSubScore = 0;
    if (!isEmptyResume) {
      const distinctCount = resumeSkillsArr.length;
      const hasSkillsSection = Boolean(visible.skillsSectionText.trim());
      const expSkillMap = matchTaxonomySkills(visible.experienceText);
      let reinforcedCount = 0;
      resumeSkillsArr.forEach((s) => {
        if (expSkillMap.has(s.canonical)) reinforcedCount += 1;
      });
      const breadthPoints = Math.min(60, distinctCount * 6);
      const sectionPoints = hasSkillsSection ? 20 : 0;
      const reinforcementPoints = distinctCount > 0 ? Math.min(20, Math.round((reinforcedCount / Math.min(distinctCount, 5)) * 20)) : 0;
      skillsSubScore = Math.max(0, Math.min(100, breadthPoints + sectionPoints + reinforcementPoints));
    }

    let keywordsSubScore = 0;
    let titleSubScore = 0;
    if (!isEmptyResume) {
      const titleTokens = tokenizeGeneralTerms(rawJobTitle || visible.label || visible.title);
      if (rawJobTitle && titleTokens.length > 0) {
        const titleHits = titleTokens.filter((t) => normalizedTitleWorkLower.indexOf(t) !== -1).length;
        titleSubScore = safePercent(titleHits, titleTokens.length);
      } else {
        titleSubScore = visible.label ? 100 : visible.title ? 70 : 30;
      }

      const summaryWords = visible.summary ? visible.summary.split(/\s+/).length : 0;
      const summaryScore = summaryWords >= 12 ? 35 : summaryWords >= 5 ? 22 : 0;
      const headlineScore = visible.label ? 30 : visible.title ? 15 : 0;
      const domainTermScore = Math.min(35, resumeSkillsArr.length * 4 + (summarySkillMap.size > 0 ? 10 : 0));
      keywordsSubScore = rawJobTitle
        ? Math.round(titleSubScore * 0.45 + (summaryScore + headlineScore + domainTermScore) * 0.55)
        : Math.min(100, summaryScore + headlineScore + domainTermScore);
    }

    const experienceSubScore = isEmptyResume
      ? 0
      : bulletList.length > 0
      ? bulletDiagnostics.score
      : visible.experienceText.trim()
      ? 40
      : 0;

    const subScores: AtsSubScores = {
      keywords: keywordsSubScore,
      structure: structureScore,
      experience: experienceSubScore,
      formatting: formattingScore,
      skills: skillsSubScore,
    };

    const overallScore = isEmptyResume
      ? 0
      : Math.round(
          subScores.structure * 0.22 +
            subScores.experience * 0.25 +
            subScores.skills * 0.2 +
            subScores.keywords * 0.18 +
            subScores.formatting * 0.15
        );

    const suggestions: string[] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];

    if (headingIssues.length === 0 && visible.sections.length > 0) {
      strengths.push('Standard ATS-readable section headings');
    } else {
      headingIssues.forEach((h) => {
        suggestions.push(h.message);
        improvements.push(h.message);
      });
    }

    if (dateConsistency.consistent && dateConsistency.detectedFormats.length > 0) {
      strengths.push(`Consistent date formatting (${dateConsistency.dominantFormat})`);
    } else if (dateConsistency.message) {
      suggestions.push(dateConsistency.message);
      improvements.push(dateConsistency.message);
    }

    if (bulletDiagnostics.weakVerbCount > 0) {
      const firstWeak = bulletDiagnostics.issues.find((i) => i.type === 'weak_verb');
      if (firstWeak) {
        suggestions.push(firstWeak.message);
        improvements.push(firstWeak.message);
      }
    }
    if (bulletList.length > 0 && bulletDiagnostics.quantifiedBulletCount === 0) {
      const msg =
        'Add verifiable metrics to your experience bullets (e.g., latency reduced, requests handled, or hours saved) — never invent numbers.';
      suggestions.push(msg);
      improvements.push(msg);
    } else if (bulletDiagnostics.quantifiedBulletCount > 0) {
      strengths.push(`${bulletDiagnostics.quantifiedBulletCount} quantified impact bullet(s)`);
    }

    if (bulletDiagnostics.longBulletCount > 0) {
      const firstLong = bulletDiagnostics.issues.find((i) => i.type === 'too_long');
      if (firstLong) suggestions.push(firstLong.message);
    }
    if (bulletDiagnostics.repeatedTerms.length > 0) {
      const repIssue = bulletDiagnostics.issues.find((i) => i.type === 'repeated_term');
      if (repIssue) suggestions.push(repIssue.message);
    }

    layoutWarnings.forEach((w) => {
      suggestions.push(w.message);
      improvements.push(w.message);
    });

    if (!visible.experienceText.trim() && !isEmptyResume) {
      suggestions.push('Add a Work Experience or Projects section with action-oriented impact bullets.');
    }
    if (!visible.skillsSectionText.trim() && !isEmptyResume) {
      suggestions.push('Add a dedicated Skills section listing your core technologies and tools.');
    }

    return {
      score: overallScore,
      label: scoreLabel(overallScore),
      mode: 'standalone',
      guidanceDisclaimer: ATS_GUIDANCE_DISCLAIMER,
      breakdown: {
        ...subScores,
        title: titleSubScore,
      },
      subScores,
      matchedKeywords: resumeSkillsArr.map((s) => ({
        keyword: s.canonical,
        occurrences: s.occurrences,
      })),
      missingKeywords: [],
      skillTiers: [],
      transferableSkills: [],
      fallbackKeywords: { matched: [], missing: [] },
      suggestions,
      totals: { matched: resumeSkillsArr.length, required: resumeSkillsArr.length },
      wordCount: visible.wordCount,
      diagnostics: {
        headingIssues,
        dateConsistency,
        bulletDiagnostics,
        layoutWarnings,
        strengths,
        improvements,
      },
    };
  }

  // ======================== JOB-SPECIFIC MODE ========================
  const segmented = segmentJobDescription(rawJd);
  const reqMatches = matchTaxonomySkills(segmented.requiredText);
  const fullJdMatches = matchTaxonomySkills(rawJd);

  const skillTiers: TieredSkillMatch[] = [];
  fullJdMatches.forEach((jdMatch, canonical) => {
    const inReq = reqMatches.has(canonical);
    const tier: SkillTier = inReq ? 'required' : 'preferred';
    const weight = tier === 'required' ? REQUIRED_TIER_WEIGHT : PREFERRED_TIER_WEIGHT;
    const matched = resumeSkillMap.has(canonical);

    skillTiers.push({
      keyword: canonical,
      category: jdMatch.category,
      tier,
      weight,
      occurrences: jdMatch.occurrences,
      matched,
    });
  });

  // Rank required skills first (or by frequency when same tier / overall frequency)
  skillTiers.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    if (a.tier !== b.tier) return a.tier === 'required' ? -1 : 1;
    return a.keyword.localeCompare(b.keyword);
  });

  const matchedTiered = skillTiers.filter((s) => s.matched);
  const missingTiered = skillTiers.filter((s) => !s.matched);

  // Adjacent transferable skills for missing JD skills (Requirement 10 & PRD Section 16)
  const transferableSkills: TransferableSkillHint[] = [];
  for (let m = 0; m < missingTiered.length; m += 1) {
    const miss = missingTiered[m];
    const def = getSkillDefinition(miss.keyword);
    const adjacent = def?.adjacentSkills || [];
    const presentPeers = adjacent.filter((peer) => resumeSkillMap.has(peer));
    if (presentPeers.length > 0) {
      transferableSkills.push({
        missingSkill: miss.keyword,
        tier: miss.tier,
        resumeSkills: presentPeers,
        category: miss.category,
        suggestion: `Missing ${miss.keyword}, and your resume includes related ${miss.category.toLowerCase()} experience (${presentPeers.slice(0, 2).join(', ')}). Highlight that transferable experience without claiming ${miss.keyword} unless you have used it.`,
      });
    }
  }

  // Fallback noun phrases when taxonomy skill hits equal zero (Requirement 11)
  const fallbackMatched: JobMatchKeyword[] = [];
  const fallbackMissing: JobMatchKeyword[] = [];
  if (skillTiers.length === 0) {
    const fallbackPhrases = extractFallbackNounPhrases(rawJd);
    for (let f = 0; f < fallbackPhrases.length; f += 1) {
      const fp = fallbackPhrases[f];
      if (!isEmptyResume && containsWholePhrase(normalizedResumeLower, fp.keyword)) {
        fallbackMatched.push(fp);
      } else {
        fallbackMissing.push(fp);
      }
    }
  }

  // Weighted Skills sub-score (never inflates 0/0 to 100%)
  let skillsSubScore = 0;
  if (!isEmptyResume) {
    if (skillTiers.length > 0) {
      let matchedWeight = 0;
      let totalWeight = 0;
      for (let i = 0; i < skillTiers.length; i += 1) {
        totalWeight += skillTiers[i].weight;
        if (skillTiers[i].matched) {
          matchedWeight += skillTiers[i].weight;
        }
      }
      skillsSubScore = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
    } else {
      const totalFallback = fallbackMatched.length + fallbackMissing.length;
      skillsSubScore = safePercent(fallbackMatched.length, totalFallback);
    }
  }

  // Experience & Keywords sub-scores
  const termCounts = new Map<string, number>();
  tokenizeGeneralTerms(rawJd)
    .filter((t) => !isKnownSkillAliasToken(t))
    .forEach((t) => termCounts.set(t, (termCounts.get(t) || 0) + 1));

  const repeatedTermsEntries: Array<[string, number]> = [];
  const singleTermsEntries: Array<[string, number]> = [];
  termCounts.forEach((n, t) => {
    if (n >= 2) repeatedTermsEntries.push([t, n]);
    else singleTermsEntries.push([t, n]);
  });

  const experienceTerms =
    repeatedTermsEntries.length > 0
      ? repeatedTermsEntries.map((pair) => pair[0]).slice(0, 25)
      : singleTermsEntries.map((pair) => pair[0]).slice(0, 15);

  const experienceHits = isEmptyResume
    ? 0
    : experienceTerms.filter((t) => containsWholePhrase(normalizedResumeLower, t)).length;
  const jdExperienceRatio = safePercent(experienceHits, experienceTerms.length);

  const titleTokens = tokenizeGeneralTerms(rawJobTitle);
  const titleHits = isEmptyResume
    ? 0
    : titleTokens.filter((t) => containsWholePhrase(normalizedTitleWorkLower, t)).length;
  const titleSubScore = titleTokens.length > 0 ? safePercent(titleHits, titleTokens.length) : 0;

  let experienceSubScore = 0;
  if (!isEmptyResume) {
    if (experienceTerms.length > 0 && bulletList.length > 0) {
      experienceSubScore = Math.round(jdExperienceRatio * 0.7 + bulletDiagnostics.score * 0.3);
    } else if (experienceTerms.length > 0) {
      experienceSubScore = jdExperienceRatio;
    } else if (bulletList.length > 0) {
      experienceSubScore = bulletDiagnostics.score;
    }
  }

  let keywordsSubScore = 0;
  if (!isEmptyResume) {
    const keywordSignals: Array<{ value: number; weight: number }> = [];
    if (skillTiers.length > 0 || fallbackMatched.length + fallbackMissing.length > 0) {
      keywordSignals.push({ value: skillsSubScore, weight: 0.5 });
    }
    if (experienceTerms.length > 0) {
      keywordSignals.push({ value: jdExperienceRatio, weight: 0.3 });
    }
    if (titleTokens.length > 0) {
      keywordSignals.push({ value: titleSubScore, weight: 0.2 });
    }
    if (keywordSignals.length > 0) {
      let wSum = 0;
      let vSum = 0;
      for (let k = 0; k < keywordSignals.length; k += 1) {
        vSum += keywordSignals[k].value * keywordSignals[k].weight;
        wSum += keywordSignals[k].weight;
      }
      keywordsSubScore = wSum > 0 ? Math.round(vSum / wSum) : 0;
    }
  }

  const subScores: AtsSubScores = {
    keywords: keywordsSubScore,
    structure: structureScore,
    experience: experienceSubScore,
    formatting: formattingScore,
    skills: skillsSubScore,
  };

  let overallScore = 0;
  if (!isEmptyResume) {
    // If JD has zero taxonomy skills and zero fallback/experience matches, do not inflate via static structure/formatting alone
    const hasAnyJdSignal =
      matchedTiered.length > 0 ||
      fallbackMatched.length > 0 ||
      experienceHits > 0 ||
      titleHits > 0;

    if (!hasAnyJdSignal && skillTiers.length === 0) {
      overallScore = Math.round(structureScore * 0.1 + formattingScore * 0.1);
    } else {
      overallScore = Math.round(
        subScores.skills * 0.45 +
          subScores.keywords * 0.25 +
          subScores.experience * 0.15 +
          subScores.structure * 0.08 +
          subScores.formatting * 0.07
      );
    }
  }

  // Actionable, non-fabricating suggestions
  const suggestions: string[] = [];
  const strengths: string[] = [];
  const improvements: string[] = [];

  missingTiered.slice(0, 4).forEach((s) => {
    const times = s.occurrences > 1 ? ` — the job description mentions it ${s.occurrences} times` : '';
    const tierNote = s.tier === 'preferred' ? ' (preferred qualification)' : '';
    const msg = `Add ${s.keyword}${tierNote} to your Skills section if you have experience with it${times}.`;
    suggestions.push(msg);
    improvements.push(msg);
  });

  if (skillTiers.length === 0 && fallbackMissing.length > 0) {
    const topFallback = fallbackMissing.slice(0, 3).map((f) => `"${f.keyword}"`).join(', ');
    const msg = `Reflect relevant domain phrases from this posting (${topFallback}) if they match your real experience.`;
    suggestions.push(msg);
    improvements.push(msg);
  }

  transferableSkills.slice(0, 2).forEach((hint) => {
    suggestions.push(hint.suggestion);
  });

  const topSkill = skillTiers[0];
  if (
    topSkill &&
    !summarySkillMap.has(topSkill.keyword) &&
    resumeSkillMap.has(topSkill.keyword)
  ) {
    suggestions.push(
      `Mention ${topSkill.keyword} in your summary — it's the most frequent skill in this job description.`
    );
  }

  if (!visible.experienceText.trim()) {
    suggestions.push(
      'Add a Work Experience or Projects section so recruiters can see where you used these skills.'
    );
  } else if (jdExperienceRatio < 50 && experienceTerms.length > 0) {
    const missingExpTerms = experienceTerms
      .filter((t) => !containsWholePhrase(normalizedResumeLower, t))
      .slice(0, 3);
    if (missingExpTerms.length > 0) {
      suggestions.push(
        `Reflect the job's language in your experience bullets, e.g. "${missingExpTerms.join('", "')}".`
      );
    }
  }

  if (titleTokens.length > 0 && titleSubScore < 50) {
    suggestions.push(`Align your headline with the role title "${rawJobTitle}".`);
  }

  headingIssues.forEach((h) => {
    suggestions.push(h.message);
    improvements.push(h.message);
  });
  if (dateConsistency.message) {
    suggestions.push(dateConsistency.message);
    improvements.push(dateConsistency.message);
  }
  layoutWarnings.forEach((w) => {
    improvements.push(w.message);
  });

  if (matchedTiered.length > 0) {
    strengths.push(`${matchedTiered.length} of ${skillTiers.length} target skills matched`);
  }
  if (headingIssues.length === 0 && visible.sections.length > 0) {
    strengths.push('Standard section headings');
  }
  if (dateConsistency.consistent && dateConsistency.detectedFormats.length > 0) {
    strengths.push('Consistent dates');
  }

  return {
    score: overallScore,
    label: scoreLabel(overallScore),
    mode: 'job-match',
    guidanceDisclaimer: ATS_GUIDANCE_DISCLAIMER,
    breakdown: {
      ...subScores,
      title: titleSubScore,
    },
    subScores,
    matchedKeywords: matchedTiered.map((k) => ({
      keyword: k.keyword,
      occurrences: k.occurrences,
    })),
    missingKeywords: missingTiered.map((k) => ({
      keyword: k.keyword,
      occurrences: k.occurrences,
    })),
    skillTiers,
    transferableSkills,
    fallbackKeywords: {
      matched: fallbackMatched,
      missing: fallbackMissing,
    },
    suggestions,
    totals: {
      matched: matchedTiered.length,
      required: skillTiers.length,
    },
    wordCount: visible.wordCount,
    diagnostics: {
      headingIssues,
      dateConsistency,
      bulletDiagnostics,
      layoutWarnings,
      strengths,
      improvements,
    },
  };
}

export function analyzeJobMatch(
  resume: ResumeLike,
  jobDescription = '',
  jobTitle?: string
): JobMatchResult {
  return evaluateAts(resume, { jobDescription, jobTitle });
}

export {
  FULL_SKILL_TAXONOMY,
  getSkillDefinition,
  getTaxonomySkillCount,
  matchTaxonomySkills,
  tokenizeForMatching,
};
export type { SkillCategory, TaxonomyMatch };

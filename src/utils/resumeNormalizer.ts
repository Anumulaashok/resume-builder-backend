export enum SectionType {
  WORK = 'WorkItem',
  EDUCATION = 'EducationItem',
  SKILLS = 'SkillItem',
  LANGUAGES = 'LanguageItem',
  CERTIFICATES = 'CertificateItem',
  INTERESTS = 'InterestItem',
  PROJECTS = 'ProjectItem',
  COURSES = 'CourseItem',
  AWARDS = 'AwardItem',
  ORGANIZATIONS = 'OrganizationItem',
  PUBLICATIONS = 'PublicationItem',
  REFERENCES = 'ReferenceItem',
  SOFTSKILSS = 'SoftSkillItem',
  ACHIVEMENTS = 'AchievementItem',
  TECK_SKILLS = 'TechnicalSkillItem',
  CUSTOM = 'CustomItem'
}

export const CANONICAL_SECTION_TYPES = [
  SectionType.WORK,
  SectionType.EDUCATION,
  SectionType.SKILLS,
  SectionType.LANGUAGES,
  SectionType.CERTIFICATES,
  SectionType.INTERESTS,
  SectionType.PROJECTS,
  SectionType.COURSES,
  SectionType.AWARDS,
  SectionType.ORGANIZATIONS,
  SectionType.PUBLICATIONS,
  SectionType.REFERENCES,
  SectionType.SOFTSKILSS,
  SectionType.ACHIVEMENTS,
  SectionType.TECK_SKILLS,
  SectionType.CUSTOM
] as const;

export interface EducationDateFields {
  month: string;
  year: string;
}

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
  'Dec'
] as const;

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
  december: 12
};

const WORK_ALIASES = new Set([
  SectionType.WORK.toLowerCase(),
  'work',
  'experience',
  'experiences',
  'workexperience',
  'work_experience',
  'professional_experience',
  'professionalexperience',
  'employment',
  'employment_history',
  'career',
  'career_history'
]);

const EDUCATION_ALIASES = new Set([
  SectionType.EDUCATION.toLowerCase(),
  'education',
  'academics',
  'academic',
  'academic_background'
]);

const PROJECT_ALIASES = new Set([
  SectionType.PROJECTS.toLowerCase(),
  'project',
  'projects',
  'personal_projects'
]);

const TECH_SKILL_ALIASES = new Set([
  SectionType.TECK_SKILLS.toLowerCase(),
  'technicalskills',
  'technical_skills',
  'tech_skills',
  'techskills'
]);

const SOFT_SKILL_ALIASES = new Set([
  SectionType.SOFTSKILSS.toLowerCase(),
  'softskills',
  'soft_skills'
]);

const SKILL_ALIASES = new Set([
  SectionType.SKILLS.toLowerCase(),
  'skill',
  'skills',
  'core_skills',
  'competencies'
]);

const LANGUAGE_ALIASES = new Set([
  SectionType.LANGUAGES.toLowerCase(),
  'language',
  'languages'
]);

const CERTIFICATE_ALIASES = new Set([
  SectionType.CERTIFICATES.toLowerCase(),
  'certificate',
  'certificates',
  'certification',
  'certifications',
  'licenses'
]);

const AWARD_ALIASES = new Set([
  SectionType.AWARDS.toLowerCase(),
  'award',
  'awards',
  'honors',
  'honours',
  'honors_and_awards'
]);

const COURSE_ALIASES = new Set([
  SectionType.COURSES.toLowerCase(),
  'course',
  'courses',
  'coursework'
]);

const ORGANIZATION_ALIASES = new Set([
  SectionType.ORGANIZATIONS.toLowerCase(),
  'organization',
  'organizations',
  'volunteer',
  'volunteering',
  'volunteer_experience',
  'affiliations',
  'leadership'
]);

const PUBLICATION_ALIASES = new Set([
  SectionType.PUBLICATIONS.toLowerCase(),
  'publication',
  'publications',
  'papers'
]);

const REFERENCE_ALIASES = new Set([
  SectionType.REFERENCES.toLowerCase(),
  'reference',
  'references'
]);

const INTEREST_ALIASES = new Set([
  SectionType.INTERESTS.toLowerCase(),
  'interest',
  'interests',
  'hobbies'
]);

const ACHIEVEMENT_ALIASES = new Set([
  SectionType.ACHIVEMENTS.toLowerCase(),
  'achievement',
  'achievements',
  'accomplishments',
  'key_achievements'
]);

const CUSTOM_ALIASES = new Set([
  SectionType.CUSTOM.toLowerCase(),
  'custom'
]);

const DEFAULT_SECTION_TITLES: Record<SectionType, string> = {
  [SectionType.WORK]: 'Work Experience',
  [SectionType.EDUCATION]: 'Education',
  [SectionType.SKILLS]: 'Skills',
  [SectionType.LANGUAGES]: 'Languages',
  [SectionType.CERTIFICATES]: 'Certifications',
  [SectionType.INTERESTS]: 'Interests',
  [SectionType.PROJECTS]: 'Projects',
  [SectionType.COURSES]: 'Courses',
  [SectionType.AWARDS]: 'Awards',
  [SectionType.ORGANIZATIONS]: 'Organizations',
  [SectionType.PUBLICATIONS]: 'Publications',
  [SectionType.REFERENCES]: 'References',
  [SectionType.SOFTSKILSS]: 'Soft Skills',
  [SectionType.ACHIVEMENTS]: 'Achievements',
  [SectionType.TECK_SKILLS]: 'Technical Skills',
  [SectionType.CUSTOM]: 'Custom Section'
};

const SECTION_ID_PREFIX: Record<SectionType, string> = {
  [SectionType.WORK]: 'work',
  [SectionType.EDUCATION]: 'education',
  [SectionType.SKILLS]: 'skills',
  [SectionType.LANGUAGES]: 'languages',
  [SectionType.CERTIFICATES]: 'certificates',
  [SectionType.INTERESTS]: 'interests',
  [SectionType.PROJECTS]: 'projects',
  [SectionType.COURSES]: 'courses',
  [SectionType.AWARDS]: 'awards',
  [SectionType.ORGANIZATIONS]: 'organizations',
  [SectionType.PUBLICATIONS]: 'publications',
  [SectionType.REFERENCES]: 'references',
  [SectionType.SOFTSKILSS]: 'soft-skills',
  [SectionType.ACHIVEMENTS]: 'achievements',
  [SectionType.TECK_SKILLS]: 'tech-skills',
  [SectionType.CUSTOM]: 'custom'
};

const PLACEHOLDER_TOKENS = new Set([
  'string',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'not provided',
  'not specified'
]);

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMeaningfulText(value: unknown): value is string {
  const cleaned = cleanString(value);
  if (!cleaned) return false;
  return !PLACEHOLDER_TOKENS.has(cleaned.toLowerCase());
}

export function isValidEmail(value: unknown): boolean {
  const email = cleanString(value);
  if (!email || email.length > 254) return false;
  if (PLACEHOLDER_TOKENS.has(email.toLowerCase())) return false;
  if (/\s/.test(email) || email.includes('..')) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }

  const domainLabels = domain.split('.');
  if (domainLabels.length < 2) return false;
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[A-Za-z]{2,63}$/.test(tld)) return false;

  return domainLabels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[A-Za-z0-9-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-')
  );
}

function matchSectionTypeToken(raw: unknown): SectionType | null {
  const cleaned = cleanString(raw).toLowerCase();
  if (!cleaned) return null;

  const underscored = cleaned.replace(/[\s-]+/g, '_');
  const collapsed = cleaned.replace(/[\s_-]+/g, '');
  const candidates = [cleaned, underscored, collapsed];

  for (const token of candidates) {
    if (WORK_ALIASES.has(token)) return SectionType.WORK;
    if (EDUCATION_ALIASES.has(token)) return SectionType.EDUCATION;
    if (PROJECT_ALIASES.has(token)) return SectionType.PROJECTS;
    if (TECH_SKILL_ALIASES.has(token)) return SectionType.TECK_SKILLS;
    if (SOFT_SKILL_ALIASES.has(token)) return SectionType.SOFTSKILSS;
    if (SKILL_ALIASES.has(token)) return SectionType.SKILLS;
    if (LANGUAGE_ALIASES.has(token)) return SectionType.LANGUAGES;
    if (CERTIFICATE_ALIASES.has(token)) return SectionType.CERTIFICATES;
    if (AWARD_ALIASES.has(token)) return SectionType.AWARDS;
    if (COURSE_ALIASES.has(token)) return SectionType.COURSES;
    if (ORGANIZATION_ALIASES.has(token)) return SectionType.ORGANIZATIONS;
    if (PUBLICATION_ALIASES.has(token)) return SectionType.PUBLICATIONS;
    if (REFERENCE_ALIASES.has(token)) return SectionType.REFERENCES;
    if (INTEREST_ALIASES.has(token)) return SectionType.INTERESTS;
    if (ACHIEVEMENT_ALIASES.has(token)) return SectionType.ACHIVEMENTS;
    if (CUSTOM_ALIASES.has(token)) return SectionType.CUSTOM;
  }

  return null;
}

export function resolveCanonicalSectionType(section?: {
  type?: unknown;
  id?: unknown;
  title?: unknown;
  isCustom?: unknown;
}): { type: SectionType; isCustom: boolean } {
  const byType = matchSectionTypeToken(section?.type);
  if (byType) {
    return {
      type: byType,
      isCustom: byType === SectionType.CUSTOM || Boolean(section?.isCustom)
    };
  }

  const byId = matchSectionTypeToken(section?.id);
  if (byId) {
    return {
      type: byId,
      isCustom: byId === SectionType.CUSTOM
    };
  }

  const byTitle = matchSectionTypeToken(section?.title);
  if (byTitle) {
    return {
      type: byTitle,
      isCustom: byTitle === SectionType.CUSTOM
    };
  }

  return {
    type: SectionType.CUSTOM,
    isCustom: true
  };
}

function humanizeToken(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseMonthIndex(rawMonth: unknown): number | null {
  if (typeof rawMonth === 'number' && Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12) {
    return rawMonth;
  }
  if (typeof rawMonth !== 'string') return null;
  const trimmed = rawMonth.trim().toLowerCase().replace(/\.$/, '');
  if (!trimmed) return null;
  if (MONTH_INDEX_MAP[trimmed]) return MONTH_INDEX_MAP[trimmed];
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }
  return null;
}

export function isPresentDateValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^(present|current|now|ongoing|today)$/i.test(value.trim());
}

export function parseEducationDateFields(raw: unknown): EducationDateFields {
  if (raw === null || raw === undefined) {
    return { month: '', year: '' };
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { month: '', year: String(Math.trunc(raw)) };
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const monthIdx = parseMonthIndex(record.month);
    const rawMonthStr =
      typeof record.month === 'string' || typeof record.month === 'number'
        ? String(record.month).trim()
        : '';
    const rawYearStr =
      typeof record.year === 'string' || typeof record.year === 'number'
        ? String(record.year).trim()
        : '';
    if (isPresentDateValue(rawYearStr) || isPresentDateValue(rawMonthStr)) {
      return { month: '', year: '' };
    }
    return {
      month: monthIdx ? SHORT_MONTHS[monthIdx - 1] : rawMonthStr,
      year: rawYearStr
    };
  }

  if (typeof raw !== 'string') {
    return { month: '', year: '' };
  }

  const str = raw.trim();
  if (!str || isPresentDateValue(str) || PLACEHOLDER_TOKENS.has(str.toLowerCase())) {
    return { month: '', year: '' };
  }

  // YYYY-MM or YYYY-MM-DD or YYYY/MM
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (isoMatch) {
    const monthIdx = parseMonthIndex(isoMatch[2]);
    return {
      month: monthIdx ? SHORT_MONTHS[monthIdx - 1] : '',
      year: isoMatch[1]
    };
  }

  // MM/YYYY or MM-YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    const monthIdx = parseMonthIndex(slashMatch[1]);
    return {
      month: monthIdx ? SHORT_MONTHS[monthIdx - 1] : '',
      year: slashMatch[2]
    };
  }

  // Month YYYY (e.g. "Sep 2018", "September 2018")
  const namedMatch = str.match(/^([A-Za-z.]+)\s*,?\s*(\d{4})$/);
  if (namedMatch) {
    const monthIdx = parseMonthIndex(namedMatch[1]);
    return {
      month: monthIdx ? SHORT_MONTHS[monthIdx - 1] : namedMatch[1].replace(/\.$/, ''),
      year: namedMatch[2]
    };
  }

  // YYYY Month
  const yearFirstNamed = str.match(/^(\d{4})\s+([A-Za-z.]+)$/);
  if (yearFirstNamed) {
    const monthIdx = parseMonthIndex(yearFirstNamed[2]);
    return {
      month: monthIdx ? SHORT_MONTHS[monthIdx - 1] : '',
      year: yearFirstNamed[1]
    };
  }

  // YYYY only
  const yearMatch = str.match(/^(\d{4})$/);
  if (yearMatch) {
    return { month: '', year: yearMatch[1] };
  }

  // Extract 4-digit year if embedded (e.g. "Graduated May 2022" or "Class of 2021")
  const embeddedNamed = str.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (embeddedNamed) {
    const monthIdx = parseMonthIndex(embeddedNamed[1]);
    if (monthIdx) {
      return { month: SHORT_MONTHS[monthIdx - 1], year: embeddedNamed[2] };
    }
  }
  const embeddedYear = str.match(/\b(19\d{2}|20\d{2})\b/);
  if (embeddedYear) {
    return { month: '', year: embeddedYear[1] };
  }

  return { month: '', year: str };
}

function formatDateValueToString(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const parsed = parseEducationDateFields(raw);
    return `${parsed.month} ${parsed.year}`.trim();
  }
  return '';
}

function slugifyIdPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function allocateUniqueId(base: string, usedIds: Set<string>): string {
  let candidate = base || 'id-1';
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function normalizeSectionItem(
  rawItem: unknown,
  sectionType: SectionType,
  sectionId: string,
  itemIndex: number,
  usedItemIds: Set<string>,
  reservedItemIds: Set<string>
): Record<string, any> | null {
  if (rawItem === null || rawItem === undefined || typeof rawItem === 'boolean') {
    return null;
  }

  let baseObj: Record<string, any>;
  if (typeof rawItem === 'string') {
    const trimmed = rawItem.trim();
    if (!trimmed) return null;
    if (sectionType === SectionType.PUBLICATIONS) {
      baseObj = { title: trimmed };
    } else if (sectionType === SectionType.CUSTOM) {
      baseObj = { title: trimmed, name: trimmed };
    } else {
      baseObj = { name: trimmed };
    }
  } else if (typeof rawItem === 'object' && !Array.isArray(rawItem)) {
    baseObj = { ...(rawItem as Record<string, any>) };
  } else {
    return null;
  }

  const candidateId = cleanString(baseObj.id) || cleanString(baseObj._id);
  let resolvedId: string;
  if (candidateId && !usedItemIds.has(candidateId)) {
    resolvedId = candidateId;
    usedItemIds.add(resolvedId);
  } else {
    const combinedUnavailable = new Set<string>([...usedItemIds, ...reservedItemIds]);
    const fallbackBase = `${sectionId}-item-${itemIndex + 1}`;
    resolvedId = allocateUniqueId(fallbackBase, combinedUnavailable);
    usedItemIds.add(resolvedId);
  }

  const normalized: Record<string, any> = {
    ...baseObj,
    id: resolvedId
  };

  if (sectionType === SectionType.EDUCATION) {
    const studyType = cleanString(normalized.studyType);
    const area = cleanString(normalized.area);
    const school =
      cleanString(normalized.institution) ||
      cleanString(normalized.school) ||
      cleanString(normalized.university) ||
      cleanString(normalized.college);

    if (!cleanString(normalized.institution) && school) {
      normalized.institution = school;
    }
    if (!cleanString(normalized.degree) && (studyType || area)) {
      normalized.degree = studyType || area;
    }
    if (!cleanString(normalized.field) && studyType && area) {
      normalized.field = area;
    }

    const rawStart = normalized.startDate;
    let rawEnd = normalized.endDate;
    if (
      rawStart === undefined &&
      rawEnd === undefined &&
      (normalized.date !== undefined || normalized.graduationDate !== undefined || normalized.year !== undefined)
    ) {
      rawEnd = normalized.date ?? normalized.graduationDate ?? normalized.year;
    }

    const endIndicatesCurrent = isPresentDateValue(rawEnd);
    if (endIndicatesCurrent && normalized.current === undefined) {
      normalized.current = true;
    }

    normalized.startDate = parseEducationDateFields(rawStart);
    normalized.endDate = endIndicatesCurrent
      ? { month: '', year: '' }
      : parseEducationDateFields(rawEnd);

    if (normalized.degree === undefined) normalized.degree = '';
    if (normalized.field === undefined) normalized.field = '';
    if (normalized.description === undefined && typeof normalized.summary === 'string') {
      normalized.description = normalized.summary;
    }
    return normalized;
  }

  if (sectionType === SectionType.WORK) {
    const resolvedCompany =
      cleanString(normalized.company) ||
      cleanString(normalized.name) ||
      cleanString(normalized.employer) ||
      cleanString(normalized.organization);
    if (!cleanString(normalized.name) && resolvedCompany) {
      normalized.name = resolvedCompany;
    }
    const resolvedPosition =
      cleanString(normalized.position) ||
      cleanString(normalized.role) ||
      cleanString(normalized.jobTitle) ||
      cleanString(normalized.title);
    if (!cleanString(normalized.position) && resolvedPosition) {
      normalized.position = resolvedPosition;
    }
    if (normalized.startDate !== undefined && typeof normalized.startDate !== 'string') {
      normalized.startDate = formatDateValueToString(normalized.startDate);
    } else if (normalized.startDate === undefined) {
      normalized.startDate = '';
    }
    if (normalized.endDate !== undefined) {
      if (isPresentDateValue(normalized.endDate)) {
        if (normalized.current === undefined) normalized.current = true;
        normalized.endDate = '';
      } else if (typeof normalized.endDate !== 'string') {
        normalized.endDate = formatDateValueToString(normalized.endDate);
      }
    }
    if (normalized.description === undefined && typeof normalized.summary === 'string') {
      normalized.description = normalized.summary;
    }
    return normalized;
  }

  if (
    sectionType === SectionType.SKILLS ||
    sectionType === SectionType.TECK_SKILLS ||
    sectionType === SectionType.SOFTSKILSS
  ) {
    if (!cleanString(normalized.name)) {
      const fallbackName = cleanString(normalized.category) || cleanString(normalized.title) || cleanString(normalized.skill);
      if (fallbackName) normalized.name = fallbackName;
    }
    if (
      sectionType === SectionType.SKILLS &&
      normalized.subSkills === undefined &&
      Array.isArray(normalized.keywords)
    ) {
      normalized.subSkills = normalized.keywords
        .map((kw: unknown) => cleanString(kw))
        .filter(Boolean);
    }
    if (
      sectionType === SectionType.TECK_SKILLS &&
      normalized.technologies === undefined &&
      Array.isArray(normalized.keywords)
    ) {
      normalized.technologies = normalized.keywords
        .map((kw: unknown) => cleanString(kw))
        .filter(Boolean);
    }
    return normalized;
  }

  if (sectionType === SectionType.PROJECTS) {
    if (!cleanString(normalized.name) && cleanString(normalized.title)) {
      normalized.name = cleanString(normalized.title);
    }
    if (normalized.technologies === undefined && Array.isArray(normalized.keywords)) {
      normalized.technologies = normalized.keywords
        .map((kw: unknown) => cleanString(kw))
        .filter(Boolean);
    }
    return normalized;
  }

  if (sectionType === SectionType.LANGUAGES) {
    if (!cleanString(normalized.name) && cleanString(normalized.language)) {
      normalized.name = cleanString(normalized.language);
    }
    if (normalized.level === undefined && cleanString(normalized.fluency)) {
      normalized.level = cleanString(normalized.fluency);
    }
    return normalized;
  }

  if (sectionType === SectionType.PUBLICATIONS) {
    if (!cleanString(normalized.title) && cleanString(normalized.name)) {
      normalized.title = cleanString(normalized.name);
    }
    return normalized;
  }

  if (sectionType === SectionType.CUSTOM) {
    if (!cleanString(normalized.title) && cleanString(normalized.name)) {
      normalized.title = cleanString(normalized.name);
    }
    return normalized;
  }

  if (!cleanString(normalized.name) && cleanString(normalized.title)) {
    normalized.name = cleanString(normalized.title);
  }

  return normalized;
}

export interface NormalizedSection {
  id: string;
  type: SectionType;
  title: string;
  content: Array<Record<string, any>>;
  isCustom?: boolean;
  enabled?: boolean;
}

export function normalizeSectionsAndOrder(
  rawSections: unknown,
  rawSectionOrder?: unknown
): { sections: NormalizedSection[]; sectionOrder: string[] } {
  const inputSections = Array.isArray(rawSections) ? rawSections : [];

  const reservedSectionIds = new Set<string>();
  const reservedItemIds = new Set<string>();

  for (const rawSec of inputSections) {
    if (!rawSec || typeof rawSec !== 'object') continue;
    const secId = cleanString((rawSec as any).id);
    if (secId) reservedSectionIds.add(secId);
    const items = Array.isArray((rawSec as any).content) ? (rawSec as any).content : [];
    for (const rawIt of items) {
      if (rawIt && typeof rawIt === 'object') {
        const itId = cleanString((rawIt as any).id) || cleanString((rawIt as any)._id);
        if (itId) reservedItemIds.add(itId);
      }
    }
  }

  const usedSectionIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const rawIdToFinalId = new Map<string, string>();
  const normalizedSections: NormalizedSection[] = [];

  inputSections.forEach((rawSec, secIdx) => {
    if (!rawSec || typeof rawSec !== 'object' || Array.isArray(rawSec)) {
      return;
    }

    const secRecord = rawSec as Record<string, any>;
    const { type, isCustom } = resolveCanonicalSectionType(secRecord);

    const rawTitle = cleanString(secRecord.title);
    const rawTypeLabel = cleanString(secRecord.type);
    const resolvedTitle =
      rawTitle ||
      (isCustom && rawTypeLabel && rawTypeLabel.toLowerCase() !== SectionType.CUSTOM.toLowerCase()
        ? humanizeToken(rawTypeLabel)
        : DEFAULT_SECTION_TITLES[type]);

    const rawSecId = cleanString(secRecord.id);
    let finalSecId: string;
    if (rawSecId && !usedSectionIds.has(rawSecId)) {
      finalSecId = rawSecId;
      usedSectionIds.add(finalSecId);
      rawIdToFinalId.set(rawSecId, finalSecId);
    } else {
      const combinedUnavailable = new Set<string>([...usedSectionIds, ...reservedSectionIds]);
      const prefix =
        type === SectionType.CUSTOM
          ? slugifyIdPart(resolvedTitle) || SECTION_ID_PREFIX[type]
          : SECTION_ID_PREFIX[type];
      finalSecId = allocateUniqueId(`${prefix}-${secIdx + 1}`, combinedUnavailable);
      usedSectionIds.add(finalSecId);
      if (rawSecId && !rawIdToFinalId.has(rawSecId)) {
        rawIdToFinalId.set(rawSecId, finalSecId);
      }
    }

    const rawItems = Array.isArray(secRecord.content) ? secRecord.content : [];
    const normalizedItems: Array<Record<string, any>> = [];
    rawItems.forEach((rawIt, itemIdx) => {
      const item = normalizeSectionItem(
        rawIt,
        type,
        finalSecId,
        itemIdx,
        usedItemIds,
        reservedItemIds
      );
      if (item) {
        normalizedItems.push(item);
      }
    });

    const normalizedSection: NormalizedSection = {
      id: finalSecId,
      type,
      title: resolvedTitle,
      content: normalizedItems,
      ...(isCustom ? { isCustom: true } : secRecord.isCustom === false ? { isCustom: false } : {}),
      ...(typeof secRecord.enabled === 'boolean' ? { enabled: secRecord.enabled } : {})
    };

    normalizedSections.push(normalizedSection);
  });

  const validFinalSectionIds = new Set(normalizedSections.map((s) => s.id));
  const orderedIds: string[] = [];
  const seenInOrder = new Set<string>();

  if (Array.isArray(rawSectionOrder)) {
    for (const rawEntry of rawSectionOrder) {
      const cleaned = cleanString(rawEntry);
      if (!cleaned) continue;
      const mapped = validFinalSectionIds.has(cleaned)
        ? cleaned
        : rawIdToFinalId.get(cleaned);
      if (mapped && validFinalSectionIds.has(mapped) && !seenInOrder.has(mapped)) {
        seenInOrder.add(mapped);
        orderedIds.push(mapped);
      }
    }
  }

  for (const sec of normalizedSections) {
    if (!seenInOrder.has(sec.id)) {
      seenInOrder.add(sec.id);
      orderedIds.push(sec.id);
    }
  }

  return {
    sections: normalizedSections,
    sectionOrder: orderedIds
  };
}

export interface DraftResumeLike {
  title?: string;
  summary?: string;
  content?: {
    basics?: {
      name?: string;
      label?: string;
      email?: string;
      phone?: string;
      summary?: string;
      location?: {
        address?: string;
        city?: string;
        countryCode?: string;
        postalCode?: string;
      };
      [key: string]: any;
    };
    sections?: any[];
    sectionOrder?: string[];
  };
}

export interface NormalizedAIResumePayload {
  title: string;
  summary: string;
  content: {
    basics: {
      name: string;
      label?: string;
      email: string;
      phone?: string;
      summary?: string;
      location?: {
        address?: string;
        city?: string;
        countryCode?: string;
        postalCode?: string;
      };
    };
    sections: NormalizedSection[];
    sectionOrder: string[];
  };
}

export function normalizeAIResumePayload(
  aiPayload: Record<string, any>,
  draft?: DraftResumeLike | null,
  options?: { preserveEmptyWhenNoDraft?: boolean }
): NormalizedAIResumePayload {
  const allowEmptyWhenNoDraft = Boolean(!draft && options?.preserveEmptyWhenNoDraft);
  const draftBasics = draft?.content?.basics || {};
  const rawContent =
    aiPayload?.content && typeof aiPayload.content === 'object' && !Array.isArray(aiPayload.content)
      ? aiPayload.content
      : undefined;
  const aiBasics =
    rawContent?.basics && typeof rawContent.basics === 'object' && !Array.isArray(rawContent.basics)
      ? rawContent.basics
      : {};

  const resolvedTitle = isMeaningfulText(aiPayload?.title)
    ? aiPayload.title.trim()
    : cleanString(draft?.title) || (allowEmptyWhenNoDraft ? '' : 'AI Draft');

  const resolvedSummary = isMeaningfulText(aiPayload?.summary)
    ? aiPayload.summary.trim()
    : isMeaningfulText(aiBasics?.summary)
      ? aiBasics.summary.trim()
      : cleanString(draft?.summary) || cleanString(draftBasics?.summary) || '';

  const resolvedName = isMeaningfulText(aiBasics?.name)
    ? aiBasics.name.trim()
    : isMeaningfulText(draftBasics?.name)
      ? draftBasics.name.trim()
      : allowEmptyWhenNoDraft
        ? ''
        : 'Your Name';

  const aiEmail = cleanString(aiBasics?.email);
  const draftEmail = cleanString(draftBasics?.email);
  const resolvedEmail = isValidEmail(aiEmail)
    ? aiEmail
    : isValidEmail(draftEmail)
      ? draftEmail
      : allowEmptyWhenNoDraft
        ? ''
        : 'you@example.com';

  const resolvedLabel = isMeaningfulText(aiBasics?.label)
    ? aiBasics.label.trim()
    : cleanString(draftBasics?.label) || undefined;

  const resolvedPhone = isMeaningfulText(aiBasics?.phone)
    ? aiBasics.phone.trim()
    : cleanString(draftBasics?.phone) || undefined;

  const aiLoc =
    aiBasics?.location && typeof aiBasics.location === 'object' && !Array.isArray(aiBasics.location)
      ? aiBasics.location
      : undefined;
  const draftLoc =
    draftBasics?.location && typeof draftBasics.location === 'object' && !Array.isArray(draftBasics.location)
      ? draftBasics.location
      : undefined;

  let resolvedLocation:
    | {
        address?: string;
        city?: string;
        countryCode?: string;
        postalCode?: string;
      }
    | undefined;

  if (aiLoc || draftLoc) {
    const mergedLoc: Record<string, string> = {};
    const address = isMeaningfulText(aiLoc?.address) ? aiLoc!.address.trim() : cleanString(draftLoc?.address);
    const city = isMeaningfulText(aiLoc?.city) ? aiLoc!.city.trim() : cleanString(draftLoc?.city);
    const countryCode = isMeaningfulText(aiLoc?.countryCode)
      ? aiLoc!.countryCode.trim()
      : cleanString(draftLoc?.countryCode);
    const postalCode = isMeaningfulText(aiLoc?.postalCode)
      ? aiLoc!.postalCode.trim()
      : cleanString(draftLoc?.postalCode);

    if (address) mergedLoc.address = address;
    if (city) mergedLoc.city = city;
    if (countryCode) mergedLoc.countryCode = countryCode;
    if (postalCode) mergedLoc.postalCode = postalCode;

    if (Object.keys(mergedLoc).length > 0 || draftLoc) {
      resolvedLocation = mergedLoc;
    }
  }

  const sourceSections = rawContent ? rawContent.sections : draft?.content?.sections;
  const sourceSectionOrder = rawContent ? rawContent.sectionOrder : draft?.content?.sectionOrder;

  const { sections, sectionOrder } = normalizeSectionsAndOrder(sourceSections, sourceSectionOrder);

  return {
    title: resolvedTitle,
    summary: resolvedSummary,
    content: {
      basics: {
        name: resolvedName,
        ...(resolvedLabel !== undefined ? { label: resolvedLabel } : {}),
        email: resolvedEmail,
        ...(resolvedPhone !== undefined ? { phone: resolvedPhone } : {}),
        summary: resolvedSummary,
        ...(resolvedLocation !== undefined ? { location: resolvedLocation } : {})
      },
      sections,
      sectionOrder
    }
  };
}

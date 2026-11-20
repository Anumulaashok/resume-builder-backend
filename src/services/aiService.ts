import { z } from 'zod';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';
import { SKILL_DICTIONARY, extractSkillsFromText } from './jobMatchService';

export const VALID_SECTION_TYPES = [
  'WorkItem',
  'EducationItem',
  'SkillItem',
  'LanguageItem',
  'CertificateItem',
  'InterestItem',
  'ProjectItem',
  'CourseItem',
  'AwardItem',
  'OrganizationItem',
  'PublicationItem',
  'ReferenceItem',
  'SoftSkillItem',
  'AchievementItem',
  'TechnicalSkillItem',
  'CustomItem'
] as const;

export type ValidSectionType = (typeof VALID_SECTION_TYPES)[number];

const SECTION_TYPE_ALIAS_MAP: Record<string, ValidSectionType> = {
  workitem: 'WorkItem',
  work: 'WorkItem',
  experience: 'WorkItem',
  workexperience: 'WorkItem',
  work_experience: 'WorkItem',
  professional_experience: 'WorkItem',
  employment: 'WorkItem',
  educationitem: 'EducationItem',
  education: 'EducationItem',
  academics: 'EducationItem',
  skillitem: 'SkillItem',
  skill: 'SkillItem',
  skills: 'SkillItem',
  technicalskillitem: 'TechnicalSkillItem',
  technicalskills: 'TechnicalSkillItem',
  technical_skills: 'TechnicalSkillItem',
  softskillitem: 'SoftSkillItem',
  softskills: 'SoftSkillItem',
  soft_skills: 'SoftSkillItem',
  languageitem: 'LanguageItem',
  language: 'LanguageItem',
  languages: 'LanguageItem',
  certificateitem: 'CertificateItem',
  certificate: 'CertificateItem',
  certificates: 'CertificateItem',
  certification: 'CertificateItem',
  certifications: 'CertificateItem',
  interestitem: 'InterestItem',
  interest: 'InterestItem',
  interests: 'InterestItem',
  hobbies: 'InterestItem',
  projectitem: 'ProjectItem',
  project: 'ProjectItem',
  projects: 'ProjectItem',
  courseitem: 'CourseItem',
  course: 'CourseItem',
  courses: 'CourseItem',
  coursework: 'CourseItem',
  awarditem: 'AwardItem',
  award: 'AwardItem',
  awards: 'AwardItem',
  honors: 'AwardItem',
  organizationitem: 'OrganizationItem',
  organization: 'OrganizationItem',
  organizations: 'OrganizationItem',
  organisations: 'OrganizationItem',
  volunteer: 'OrganizationItem',
  volunteering: 'OrganizationItem',
  affiliations: 'OrganizationItem',
  publicationitem: 'PublicationItem',
  publication: 'PublicationItem',
  publications: 'PublicationItem',
  referenceitem: 'ReferenceItem',
  reference: 'ReferenceItem',
  references: 'ReferenceItem',
  achievementitem: 'AchievementItem',
  achivementitem: 'AchievementItem',
  achievement: 'AchievementItem',
  achievements: 'AchievementItem',
  achivements: 'AchievementItem',
  accomplishments: 'AchievementItem',
  customitem: 'CustomItem',
  custom: 'CustomItem'
};

export const normalizeKnownSectionType = (rawType: unknown): string => {
  if (typeof rawType !== 'string') return '';
  const trimmed = rawType.trim();
  if (!trimmed) return '';
  if ((VALID_SECTION_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }
  const normalizedKey = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return SECTION_TYPE_ALIAS_MAP[normalizedKey] || trimmed;
};

// Zod Schema for Resume Generation matching the Mongoose model & frontend SectionType literals
const LocationSchema = z
  .object({
    address: z.string().optional(),
    city: z.string().optional(),
    countryCode: z.string().optional(),
    postalCode: z.string().optional()
  })
  .optional();

const BasicsSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  email: z.string(),
  phone: z.string().optional(),
  summary: z.string().optional(),
  location: LocationSchema,
  source_fact_ids: z.array(z.string().trim().min(1)).optional()
});

export const SectionItemSchema = z
  .object({
    id: z.string().trim().min(1, 'Section item id must be a non-empty string'),
    source_fact_ids: z.array(z.string().trim().min(1)).optional()
  })
  .passthrough();

export const SectionSchema = z.object({
  id: z.string().trim().min(1, 'Section id must be a non-empty string'),
  type: z.enum(VALID_SECTION_TYPES),
  title: z.string().trim().min(1, 'Section title must be a non-empty string'),
  content: z.array(SectionItemSchema),
  isCustom: z.boolean().optional(),
  source_fact_ids: z.array(z.string().trim().min(1)).optional()
});

export const GeneratedResumeSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().optional(),
  source_fact_ids: z.array(z.string().trim().min(1)).optional(),
  content: z.object({
    basics: BasicsSchema,
    sections: z.array(SectionSchema),
    sectionOrder: z.array(z.string()),
    source_fact_ids: z.array(z.string().trim().min(1)).optional()
  })
});

export type GeneratedResume = z.infer<typeof GeneratedResumeSchema>;

// Bounded so retries finish inside the 15s serverless function limit.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 5000;

export type AIResumeResult = Partial<GeneratedResume> & {
  summary: string;
  source_fact_ids?: string[];
};

export interface ResumeFactSourceInput {
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
    };
    sections?: Array<{
      id?: string;
      type?: string;
      title?: string;
      content?: any[];
      isCustom?: boolean;
    }>;
    sectionOrder?: string[];
  };
}

export interface VerifiedResumeFact {
  id: string;
  category:
    | 'basics'
    | 'summary'
    | 'employer'
    | 'role'
    | 'education'
    | 'credential'
    | 'skill'
    | 'project'
    | 'achievement'
    | 'metric'
    | 'prompt';
  value: string;
}

export interface VerifiedFactCatalog {
  facts: VerifiedResumeFact[];
  factMap: Map<string, VerifiedResumeFact>;
  employers: Map<string, string>;
  credentials: Map<string, string>;
  skills: Map<string, string>;
  numbers: Map<string, string>;
  hasResumeCareerFacts: boolean;
}

const slugifyFactToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';

const normalizeEntityText = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    : '';

// Extracts standalone numeric metrics without matching digits embedded inside identifiers (e.g. HTML5, CSS3, ES6, k8s).
export const extractNumericTokens = (text: string): string[] => {
  if (typeof text !== 'string' || !text.trim()) return [];
  const tokens: string[] = [];
  const regex =
    /(?:^|[\s($€£₹~≈<>+-])(\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|x|×|\+|k|m|b))?)(?=$|[\s.,;:!?)\]])/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, '').replace(/\s+/g, '').toLowerCase().replace(/×/g, 'x');
    if (raw) {
      tokens.push(raw);
      const numericCore = raw.replace(/[%x+kmb]+$/i, '');
      if (numericCore && numericCore !== raw) {
        tokens.push(numericCore);
      }
    }
  }
  return Array.from(new Set(tokens));
};

export const hasQuantifiedMetrics = (text: string): boolean => {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (/[$€£₹]\s*\d+/.test(text)) return true;
  const regex =
    /(?:^|[\s($€£₹~≈<>+-])(\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|x|×|\+|k|m|b|ms|s|sec|mins?|hrs?|hours?|days?|weeks?|months?|yrs?|years?))?)(?=$|[\s.,;:!?)\]])/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const token = match[1].trim();
    // Ignore bare 4-digit calendar years (1970-2039) unless accompanied by units/symbols
    if (/^(?:19[7-9]\d|20[0-3]\d)$/.test(token)) {
      continue;
    }
    return true;
  }
  return false;
};

const formatDateValue = (val: unknown): string => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return [obj.month, obj.year]
      .map((part) => (typeof part === 'string' || typeof part === 'number' ? String(part).trim() : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const isPlaceholderSummary = (summary: string): boolean =>
  /^\[ai placeholder\]/i.test(summary.trim());

const isGenericDraftTitle = (title?: string): boolean => {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();
  return !normalized || normalized === 'ai draft' || normalized === 'untitled resume';
};

const inferRoleFromPrompt = (prompt: string): string => {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const patterns = [
    /(?:resume|cv|summary|draft|profile)\s+(?:for|as)\s+(?:an?\s+)?([A-Za-z][A-Za-z0-9\s/&+-]{2,55}?)(?=\s+(?:with|specializing|focused|experienced|at|in|who|having|using|skilled)\b|[.,;:\n]|$)/i,
    /^(?:an?\s+)?([A-Za-z][A-Za-z0-9\s/&+-]{2,55}?(?:Engineer|Developer|Architect|Manager|Designer|Analyst|Scientist|Lead|Director|Consultant|Coordinator|Specialist|Administrator))(?=\s+(?:with|specializing|focused|experienced|at|in|who|having|using|skilled|resume)\b|[.,;:\n]|$)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/\s+resume$/i, '').trim();
      if (candidate.length >= 3 && candidate.length <= 60) {
        return candidate;
      }
    }
  }
  return '';
};

export const extractVerifiedResumeFacts = (
  resume?: ResumeFactSourceInput | null,
  options?: { prompt?: string; itemContext?: Record<string, unknown>; bulletText?: string; userMetricValue?: string }
): VerifiedFactCatalog => {
  const facts: VerifiedResumeFact[] = [];
  const factMap = new Map<string, VerifiedResumeFact>();
  const employers = new Map<string, string>();
  const credentials = new Map<string, string>();
  const skills = new Map<string, string>();
  const numbers = new Map<string, string>();

  const addFact = (fact: VerifiedResumeFact) => {
    const trimmedVal = fact.value.trim();
    if (!trimmedVal) return;
    if (!factMap.has(fact.id)) {
      const stored: VerifiedResumeFact = { ...fact, value: trimmedVal };
      facts.push(stored);
      factMap.set(stored.id, stored);
    }
  };

  const registerNumbersFromText = (text: string, sourceFactId: string) => {
    for (const num of extractNumericTokens(text)) {
      if (!numbers.has(num)) {
        numbers.set(num, sourceFactId);
      }
    }
  };

  const registerSkillsFromText = (text: string, fallbackFactPrefix: string) => {
    for (const skillName of extractSkillsFromText(text)) {
      const key = skillName.toLowerCase();
      const factId = skills.get(key) || `${fallbackFactPrefix}:${slugifyFactToken(skillName)}`;
      addFact({ id: factId, category: 'skill', value: skillName });
      if (!skills.has(key)) {
        skills.set(key, factId);
      }
      const aliases = SKILL_DICTIONARY[skillName] || [];
      for (const alias of aliases) {
        if (!skills.has(alias)) {
          skills.set(alias, factId);
        }
      }
    }
  };

  const basics = resume?.content?.basics || {};
  if (basics.name && basics.name.trim()) {
    addFact({ id: 'fact:basics:name', category: 'basics', value: basics.name });
  }
  if (basics.email && basics.email.trim()) {
    addFact({ id: 'fact:basics:email', category: 'basics', value: basics.email });
  }
  if (basics.phone && basics.phone.trim()) {
    addFact({ id: 'fact:basics:phone', category: 'basics', value: basics.phone });
    registerNumbersFromText(basics.phone, 'fact:basics:phone');
  }
  const roleLabel =
    basics.label?.trim() || (!isGenericDraftTitle(resume?.title) ? resume!.title!.trim() : '');
  if (roleLabel) {
    addFact({ id: 'fact:basics:label', category: 'role', value: roleLabel });
    registerNumbersFromText(roleLabel, 'fact:basics:label');
  }
  if (basics.location && typeof basics.location === 'object') {
    const locParts = [
      basics.location.address,
      basics.location.city,
      basics.location.countryCode,
      basics.location.postalCode
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    if (locParts.length > 0) {
      const locStr = locParts.join(', ');
      addFact({ id: 'fact:basics:location', category: 'basics', value: locStr });
      registerNumbersFromText(locStr, 'fact:basics:location');
    }
  }

  const rawSummary = (basics.summary || resume?.summary || '').toString().trim();
  let hasResumeCareerFacts = false;

  if (rawSummary && !isPlaceholderSummary(rawSummary)) {
    hasResumeCareerFacts = true;
    addFact({ id: 'fact:summary', category: 'summary', value: rawSummary });
    registerNumbersFromText(rawSummary, 'fact:summary');
    registerSkillsFromText(rawSummary, 'fact:skill');
  }

  const sections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];
  sections.forEach((section, secIdx) => {
    const normalizedType = normalizeKnownSectionType(
      section?.type || section?.id || section?.title || ''
    );
    const items = Array.isArray(section?.content) ? section.content : [];
    if (items.length > 0) {
      hasResumeCareerFacts = true;
    }

    items.forEach((rawItem, itemIdx) => {
      if (typeof rawItem === 'string' && rawItem.trim()) {
        const val = rawItem.trim();
        const skillFactId = `fact:skill:${slugifyFactToken(val)}`;
        addFact({ id: skillFactId, category: 'skill', value: val });
        skills.set(normalizeEntityText(val), skillFactId);
        registerSkillsFromText(val, 'fact:skill');
        registerNumbersFromText(val, skillFactId);
        return;
      }

      if (!rawItem || typeof rawItem !== 'object') return;
      const itemKey =
        typeof rawItem.id === 'string' && rawItem.id.trim()
          ? slugifyFactToken(rawItem.id.trim())
          : `s${secIdx}-i${itemIdx}`;

      if (normalizedType === 'WorkItem') {
        const company = (rawItem.company || rawItem.name || '').toString().trim();
        const position = (rawItem.position || rawItem.role || '').toString().trim();
        if (company) {
          const empId = `fact:work:${itemKey}:employer`;
          addFact({ id: empId, category: 'employer', value: company });
          employers.set(normalizeEntityText(company), empId);
          registerNumbersFromText(company, empId);
        }
        if (position) {
          const roleId = `fact:work:${itemKey}:role`;
          addFact({ id: roleId, category: 'role', value: position });
        }
        const dateText = `${formatDateValue(rawItem.startDate)} ${formatDateValue(rawItem.endDate)}`.trim();
        if (dateText) {
          const dateId = `fact:work:${itemKey}:dates`;
          addFact({ id: dateId, category: 'achievement', value: dateText });
          registerNumbersFromText(dateText, dateId);
        }
        const details = [
          typeof rawItem.description === 'string' ? rawItem.description : '',
          ...(Array.isArray(rawItem.highlights) ? rawItem.highlights : [])
        ]
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
          .join(' ');
        if (details) {
          const detailId = `fact:work:${itemKey}:detail`;
          addFact({ id: detailId, category: 'achievement', value: details });
          registerNumbersFromText(details, detailId);
          registerSkillsFromText(details, 'fact:skill');
        }
      } else if (normalizedType === 'EducationItem') {
        const institution = (rawItem.institution || rawItem.field || rawItem.school || '')
          .toString()
          .trim();
        const degree = (rawItem.degree || rawItem.studyType || '').toString().trim();
        const area = (rawItem.area || (rawItem.institution ? rawItem.field : '') || '')
          .toString()
          .trim();
        if (institution) {
          const instId = `fact:edu:${itemKey}:institution`;
          addFact({ id: instId, category: 'credential', value: institution });
          credentials.set(normalizeEntityText(institution), instId);
        }
        if (degree) {
          const degId = `fact:edu:${itemKey}:degree`;
          const fullDeg = area && !degree.toLowerCase().includes(area.toLowerCase()) ? `${degree} in ${area}` : degree;
          addFact({ id: degId, category: 'credential', value: fullDeg });
          credentials.set(normalizeEntityText(degree), degId);
          credentials.set(normalizeEntityText(fullDeg), degId);
          if (area) credentials.set(normalizeEntityText(area), degId);
        }
        const score = (rawItem.score || rawItem.gpa || '').toString().trim();
        if (score) {
          const scoreId = `fact:edu:${itemKey}:score`;
          addFact({ id: scoreId, category: 'metric', value: score });
          registerNumbersFromText(score, scoreId);
        }
        const dateText = `${formatDateValue(rawItem.startDate)} ${formatDateValue(rawItem.endDate)}`.trim();
        if (dateText) {
          const dateId = `fact:edu:${itemKey}:dates`;
          addFact({ id: dateId, category: 'education', value: dateText });
          registerNumbersFromText(dateText, dateId);
        }
        const desc = (rawItem.description || '').toString().trim();
        if (desc) {
          const descId = `fact:edu:${itemKey}:detail`;
          addFact({ id: descId, category: 'education', value: desc });
          registerNumbersFromText(desc, descId);
          registerSkillsFromText(desc, 'fact:skill');
        }
      } else if (
        normalizedType === 'SkillItem' ||
        normalizedType === 'TechnicalSkillItem' ||
        normalizedType === 'SoftSkillItem'
      ) {
        const skillName = (rawItem.name || rawItem.title || '').toString().trim();
        if (skillName) {
          const skillId = `fact:skill:${slugifyFactToken(skillName)}`;
          addFact({ id: skillId, category: 'skill', value: skillName });
          skills.set(normalizeEntityText(skillName), skillId);
          registerSkillsFromText(skillName, 'fact:skill');
        }
        const subList = [
          ...(Array.isArray(rawItem.subSkills) ? rawItem.subSkills : []),
          ...(Array.isArray(rawItem.technologies) ? rawItem.technologies : []),
          ...(Array.isArray(rawItem.keywords) ? rawItem.keywords : [])
        ];
        for (const sub of subList) {
          if (typeof sub === 'string' && sub.trim()) {
            const subId = `fact:skill:${slugifyFactToken(sub.trim())}`;
            addFact({ id: subId, category: 'skill', value: sub.trim() });
            skills.set(normalizeEntityText(sub.trim()), subId);
            registerSkillsFromText(sub.trim(), 'fact:skill');
          }
        }
      } else if (normalizedType === 'CertificateItem') {
        const certName = (rawItem.name || rawItem.title || '').toString().trim();
        const issuer = (rawItem.issuer || '').toString().trim();
        if (certName) {
          const certId = `fact:cert:${itemKey}`;
          addFact({
            id: certId,
            category: 'credential',
            value: issuer ? `${certName} (${issuer})` : certName
          });
          credentials.set(normalizeEntityText(certName), certId);
          if (issuer) credentials.set(normalizeEntityText(issuer), certId);
        }
        const dateText = formatDateValue(rawItem.date);
        if (dateText) {
          registerNumbersFromText(dateText, `fact:cert:${itemKey}`);
        }
      } else if (normalizedType === 'ProjectItem') {
        const projName = (rawItem.name || rawItem.title || '').toString().trim();
        const projId = `fact:project:${itemKey}`;
        if (projName) {
          addFact({ id: projId, category: 'project', value: projName });
        }
        const desc = [
          typeof rawItem.description === 'string' ? rawItem.description : '',
          ...(Array.isArray(rawItem.highlights) ? rawItem.highlights : [])
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (desc) {
          const detailId = `fact:project:${itemKey}:detail`;
          addFact({ id: detailId, category: 'achievement', value: desc });
          registerNumbersFromText(desc, detailId);
          registerSkillsFromText(desc, 'fact:skill');
        }
        const dateText = `${formatDateValue(rawItem.startDate)} ${formatDateValue(rawItem.endDate)}`.trim();
        if (dateText) {
          registerNumbersFromText(dateText, projId);
        }
      } else {
        const primary = (rawItem.name || rawItem.title || rawItem.course || rawItem.organization || '')
          .toString()
          .trim();
        const desc = (rawItem.description || rawItem.reference || '').toString().trim();
        const factId = `fact:item:${itemKey}`;
        const combined = [primary, desc].filter(Boolean).join(': ');
        if (combined) {
          addFact({ id: factId, category: 'achievement', value: combined });
          registerNumbersFromText(combined, factId);
          registerSkillsFromText(combined, 'fact:skill');
        }
      }

      // Register item-level technologies array on any section type
      if (Array.isArray(rawItem.technologies)) {
        for (const tech of rawItem.technologies) {
          if (typeof tech === 'string' && tech.trim()) {
            const techId = `fact:skill:${slugifyFactToken(tech.trim())}`;
            addFact({ id: techId, category: 'skill', value: tech.trim() });
            skills.set(normalizeEntityText(tech.trim()), techId);
            registerSkillsFromText(tech.trim(), 'fact:skill');
          }
        }
      }
    });
  });

  // Register inline itemContext (used during inline bullet coaching before/between saves)
  if (options?.itemContext && typeof options.itemContext === 'object') {
    const ctx = options.itemContext;
    const itemKey =
      typeof ctx.id === 'string' && ctx.id.trim() ? slugifyFactToken(ctx.id.trim()) : 'active';
    const company = (ctx.company || ctx.name || '').toString().trim();
    const position = (ctx.position || '').toString().trim();
    const degree = (ctx.degree || '').toString().trim();
    const institution = (ctx.institution || ctx.field || '').toString().trim();
    if (company) {
      const id = `fact:context:${itemKey}:entity`;
      addFact({ id, category: 'employer', value: company });
      employers.set(normalizeEntityText(company), id);
    }
    if (position) {
      addFact({ id: `fact:context:${itemKey}:role`, category: 'role', value: position });
    }
    if (degree) {
      const id = `fact:context:${itemKey}:degree`;
      addFact({ id, category: 'credential', value: degree });
      credentials.set(normalizeEntityText(degree), id);
    }
    if (institution) {
      const id = `fact:context:${itemKey}:institution`;
      addFact({ id, category: 'credential', value: institution });
      credentials.set(normalizeEntityText(institution), id);
    }
    const rawTechs = Array.isArray(ctx.technologies)
      ? ctx.technologies
      : typeof ctx.technologies === 'string'
        ? ctx.technologies.split(',')
        : [];
    for (const tech of rawTechs) {
      if (typeof tech === 'string' && tech.trim()) {
        const techId = `fact:skill:${slugifyFactToken(tech.trim())}`;
        addFact({ id: techId, category: 'skill', value: tech.trim() });
        skills.set(normalizeEntityText(tech.trim()), techId);
        registerSkillsFromText(tech.trim(), 'fact:skill');
      }
    }
  }

  // Register current bullet text if coaching an existing bullet
  if (options?.bulletText && options.bulletText.trim()) {
    const bulletFactId = 'fact:bullet:input';
    addFact({ id: bulletFactId, category: 'achievement', value: options.bulletText.trim() });
    registerNumbersFromText(options.bulletText, bulletFactId);
    registerSkillsFromText(options.bulletText, 'fact:skill');
  }

  // Register explicit user-provided X-Y-Z metric value
  if (options?.userMetricValue && options.userMetricValue.trim()) {
    const metricId = 'fact:user:metric';
    addFact({ id: metricId, category: 'metric', value: options.userMetricValue.trim() });
    registerNumbersFromText(options.userMetricValue, metricId);
  }

  // Register prompt facts: when starting from a blank draft without career history,
  // user-supplied skills & numbers in the prompt are treated as user-provided facts
  // (never fabricating employers or academic/professional credentials).
  if (options?.prompt && options.prompt.trim()) {
    const cleanPrompt = options.prompt.trim();
    const inferredRole = inferRoleFromPrompt(cleanPrompt);
    if (inferredRole) {
      addFact({ id: 'fact:prompt:role', category: 'role', value: inferredRole });
    }
    addFact({ id: 'fact:prompt:intent', category: 'prompt', value: cleanPrompt.slice(0, 500) });

    if (!hasResumeCareerFacts) {
      registerSkillsFromText(cleanPrompt, 'fact:prompt:skill');
      for (const num of extractNumericTokens(cleanPrompt)) {
        const numId = `fact:prompt:metric:${slugifyFactToken(num)}`;
        addFact({ id: numId, category: 'metric', value: num });
        if (!numbers.has(num)) {
          numbers.set(num, numId);
        }
      }
    }
  }

  return {
    facts,
    factMap,
    employers,
    credentials,
    skills,
    numbers,
    hasResumeCareerFacts
  };
};

const matchesVerifiedMap = (
  candidate: string,
  verifiedMap: Map<string, string>
): string | null => {
  const norm = normalizeEntityText(candidate);
  if (!norm) return null;
  if (verifiedMap.has(norm)) {
    return verifiedMap.get(norm)!;
  }
  for (const [known, factId] of verifiedMap.entries()) {
    if (known.includes(norm) || norm.includes(known)) {
      return factId;
    }
  }
  return null;
};

const validateTextClaimsAgainstCatalog = (
  text: string,
  catalog: VerifiedFactCatalog
): string[] => {
  const matchedIds = new Set<string>();
  if (!text || !text.trim()) return [];

  // 1. Reject unverified numbers/metrics
  const textNumbers = extractNumericTokens(text);
  for (const num of textNumbers) {
    const sourceId = catalog.numbers.get(num);
    if (!sourceId) {
      throw new Error(`Unverified metric or number "${num}" detected in AI output.`);
    }
    matchedIds.add(sourceId);
  }

  // 2. Reject unverified technologies from SKILL_DICTIONARY
  const detectedSkills = extractSkillsFromText(text);
  for (const skill of detectedSkills) {
    const sourceId = matchesVerifiedMap(skill, catalog.skills);
    if (!sourceId) {
      throw new Error(`Unverified technology "${skill}" detected in AI output.`);
    }
    matchedIds.add(sourceId);
  }

  return Array.from(matchedIds);
};

const validateAndAttachResumeProvenance = (
  resumeData: GeneratedResume,
  catalog: VerifiedFactCatalog
): AIResumeResult => {
  const topFactIds = new Set<string>();

  const validateProvidedFactIds = (ids?: string[]): string[] => {
    if (!Array.isArray(ids)) return [];
    const cleaned: string[] = [];
    for (const rawId of ids) {
      const trimmed = rawId.trim();
      if (!catalog.factMap.has(trimmed)) {
        throw new Error(`Unknown source_fact_id "${trimmed}" referenced in AI output.`);
      }
      cleaned.push(trimmed);
    }
    return cleaned;
  };

  validateProvidedFactIds(resumeData.source_fact_ids).forEach((id) => topFactIds.add(id));
  validateProvidedFactIds(resumeData.content.source_fact_ids).forEach((id) => topFactIds.add(id));
  validateProvidedFactIds(resumeData.content.basics.source_fact_ids).forEach((id) =>
    topFactIds.add(id)
  );

  if (catalog.factMap.has('fact:basics:name')) topFactIds.add('fact:basics:name');
  if (catalog.factMap.has('fact:basics:email')) topFactIds.add('fact:basics:email');
  if (catalog.factMap.has('fact:basics:label')) topFactIds.add('fact:basics:label');
  if (catalog.factMap.has('fact:prompt:role')) topFactIds.add('fact:prompt:role');

  const summaryText = (
    resumeData.summary ??
    resumeData.content.basics.summary ??
    ''
  ).trim();
  const summaryFactIds = new Set<string>(
    validateTextClaimsAgainstCatalog(summaryText, catalog)
  );
  if (catalog.factMap.has('fact:summary')) summaryFactIds.add('fact:summary');
  if (catalog.factMap.has('fact:basics:label')) summaryFactIds.add('fact:basics:label');
  if (catalog.factMap.has('fact:prompt:role')) summaryFactIds.add('fact:prompt:role');
  if (summaryFactIds.size === 0 && catalog.factMap.has('fact:prompt:intent')) {
    summaryFactIds.add('fact:prompt:intent');
  }
  summaryFactIds.forEach((id) => topFactIds.add(id));

  const groundedSections = resumeData.content.sections.map((section) => {
    const sectionFactIds = new Set<string>(validateProvidedFactIds(section.source_fact_ids));

    const groundedItems = section.content.map((secItem) => {
      const item = secItem as Record<string, any> & { id: string; source_fact_ids?: string[] };
      const itemFactIds = new Set<string>(validateProvidedFactIds(item.source_fact_ids));

      if (section.type === 'WorkItem') {
        const employer = (item.company || item.name || '').toString().trim();
        if (!employer) {
          throw new Error('WorkItem missing verified employer name.');
        }
        const empFactId = matchesVerifiedMap(employer, catalog.employers);
        if (!empFactId) {
          throw new Error(`Unverified employer "${employer}" detected in AI output.`);
        }
        itemFactIds.add(empFactId);
      } else if (section.type === 'EducationItem') {
        const institution = (item.institution || item.field || item.school || '')
          .toString()
          .trim();
        const degree = (item.degree || item.studyType || '').toString().trim();
        if (!institution && !degree) {
          throw new Error('EducationItem missing verified credential details.');
        }
        if (institution) {
          const instFactId = matchesVerifiedMap(institution, catalog.credentials);
          if (!instFactId) {
            throw new Error(`Unverified credential institution "${institution}" detected.`);
          }
          itemFactIds.add(instFactId);
        }
        if (degree) {
          const degFactId = matchesVerifiedMap(degree, catalog.credentials);
          if (!degFactId) {
            throw new Error(`Unverified credential degree "${degree}" detected.`);
          }
          itemFactIds.add(degFactId);
        }
        if (typeof item.score === 'string' && item.score.trim()) {
          validateTextClaimsAgainstCatalog(item.score, catalog).forEach((id) =>
            itemFactIds.add(id)
          );
        }
      } else if (section.type === 'CertificateItem') {
        const certName = (item.name || item.title || '').toString().trim();
        if (!certName) {
          throw new Error('CertificateItem missing verified certificate name.');
        }
        const certFactId = matchesVerifiedMap(certName, catalog.credentials);
        if (!certFactId) {
          throw new Error(`Unverified credential "${certName}" detected.`);
        }
        itemFactIds.add(certFactId);
      } else if (
        section.type === 'SkillItem' ||
        section.type === 'TechnicalSkillItem'
      ) {
        const skillName = (item.name || item.title || '').toString().trim();
        if (skillName) {
          const skillFactId = matchesVerifiedMap(skillName, catalog.skills);
          if (!skillFactId) {
            throw new Error(`Unverified technology "${skillName}" detected in Skills section.`);
          }
          itemFactIds.add(skillFactId);
        }
      }

      // Check subSkills / technologies / keywords arrays on any item
      const listedTechs = [
        ...(Array.isArray(item.subSkills) ? item.subSkills : []),
        ...(Array.isArray(item.technologies) ? item.technologies : []),
        ...(Array.isArray(item.keywords) ? item.keywords : [])
      ];
      for (const tech of listedTechs) {
        if (typeof tech === 'string' && tech.trim()) {
          const techFactId = matchesVerifiedMap(tech.trim(), catalog.skills);
          if (!techFactId) {
            throw new Error(`Unverified technology "${tech.trim()}" detected.`);
          }
          itemFactIds.add(techFactId);
        }
      }

      // Check textual descriptions & highlights for unverified metrics or technologies
      const itemNarrative = [
        typeof item.description === 'string' ? item.description : '',
        ...(Array.isArray(item.highlights) ? item.highlights : []),
        formatDateValue(item.startDate),
        formatDateValue(item.endDate),
        formatDateValue(item.date)
      ]
        .filter(Boolean)
        .join(' ');
      validateTextClaimsAgainstCatalog(itemNarrative, catalog).forEach((id) =>
        itemFactIds.add(id)
      );

      if (itemFactIds.size === 0 && catalog.facts.length > 0) {
        itemFactIds.add(catalog.facts[0].id);
      }

      const resolvedItemFactIds = Array.from(itemFactIds);
      resolvedItemFactIds.forEach((id) => {
        sectionFactIds.add(id);
        topFactIds.add(id);
      });

      return {
        ...item,
        source_fact_ids: resolvedItemFactIds
      };
    });

    const resolvedSectionFactIds = Array.from(sectionFactIds);
    return {
      ...section,
      content: groundedItems,
      ...(resolvedSectionFactIds.length > 0
        ? { source_fact_ids: resolvedSectionFactIds }
        : {})
    };
  });

  if (topFactIds.size === 0 && catalog.facts.length > 0) {
    topFactIds.add(catalog.facts[0].id);
  }

  const resolvedTopFactIds = Array.from(topFactIds);
  const resolvedSummaryIds = Array.from(summaryFactIds);

  return {
    title: resumeData.title,
    summary: summaryText,
    source_fact_ids: resolvedTopFactIds,
    content: {
      basics: {
        ...resumeData.content.basics,
        summary: summaryText,
        ...(resolvedSummaryIds.length > 0 ? { source_fact_ids: resolvedSummaryIds } : {})
      },
      sections: groundedSections,
      sectionOrder: resumeData.content.sectionOrder,
      source_fact_ids: resolvedTopFactIds
    }
  };
};

const DEFAULT_SECTION_TITLES: Record<ValidSectionType, string> = {
  WorkItem: 'Professional Experience',
  EducationItem: 'Education',
  SkillItem: 'Skills',
  LanguageItem: 'Languages',
  CertificateItem: 'Certifications',
  InterestItem: 'Interests',
  ProjectItem: 'Projects',
  CourseItem: 'Courses',
  AwardItem: 'Awards',
  OrganizationItem: 'Organizations',
  PublicationItem: 'Publications',
  ReferenceItem: 'References',
  SoftSkillItem: 'Soft Skills',
  AchievementItem: 'Achievements',
  TechnicalSkillItem: 'Technical Skills',
  CustomItem: 'Additional Information'
};

const buildGroundedStructuredDraft = (
  prompt: string,
  resume: ResumeFactSourceInput | null | undefined,
  catalog: VerifiedFactCatalog
): AIResumeResult => {
  const rawBasics = resume?.content?.basics || {};
  const name = rawBasics.name?.trim() || 'Candidate';
  const email = rawBasics.email?.trim() || 'candidate@example.com';
  const inferredRole = inferRoleFromPrompt(prompt);
  const existingLabel = rawBasics.label?.trim() || '';
  const preservedTitle = !isGenericDraftTitle(resume?.title) ? resume!.title!.trim() : '';
  const resolvedLabel = existingLabel || inferredRole || preservedTitle || 'Professional';
  const resolvedTitle = inferredRole || preservedTitle || existingLabel || `${name} Resume`;

  const usedSectionIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const normalizedSections: Array<z.infer<typeof SectionSchema>> = [];

  const rawSections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];
  rawSections.forEach((rawSec, secIdx) => {
    const candidateType = normalizeKnownSectionType(
      rawSec?.type || rawSec?.id || rawSec?.title || 'CustomItem'
    );
    const validType: ValidSectionType = (VALID_SECTION_TYPES as readonly string[]).includes(
      candidateType
    )
      ? (candidateType as ValidSectionType)
      : 'CustomItem';

    let secId =
      typeof rawSec?.id === 'string' && rawSec.id.trim()
        ? rawSec.id.trim()
        : `section-${validType.toLowerCase()}-${secIdx + 1}`;
    while (usedSectionIds.has(secId)) {
      secId = `${secId}-${secIdx + 1}`;
    }
    usedSectionIds.add(secId);

    const secTitle =
      typeof rawSec?.title === 'string' && rawSec.title.trim()
        ? rawSec.title.trim()
        : DEFAULT_SECTION_TITLES[validType];

    const rawItems = Array.isArray(rawSec?.content) ? rawSec.content : [];
    const normalizedItems = rawItems
      .map((rawItem, itemIdx) => {
        const baseObj =
          typeof rawItem === 'string'
            ? { name: rawItem.trim() }
            : rawItem && typeof rawItem === 'object'
              ? { ...rawItem }
              : null;
        if (!baseObj) return null;

        let itemId =
          typeof baseObj.id === 'string' && baseObj.id.trim()
            ? baseObj.id.trim()
            : `${secId}-item-${itemIdx + 1}`;
        let suffix = 1;
        while (usedItemIds.has(itemId)) {
          suffix += 1;
          itemId = `${secId}-item-${itemIdx + 1}-${suffix}`;
        }
        usedItemIds.add(itemId);

        const itemKey =
          typeof rawItem?.id === 'string' && rawItem.id.trim()
            ? slugifyFactToken(rawItem.id.trim())
            : `s${secIdx}-i${itemIdx}`;
        const itemFacts: string[] = [];
        for (const fact of catalog.facts) {
          if (fact.id.includes(`:${itemKey}`)) {
            itemFacts.push(fact.id);
          }
        }
        if (
          (validType === 'SkillItem' || validType === 'TechnicalSkillItem') &&
          typeof baseObj.name === 'string'
        ) {
          const matchedSkillFact = matchesVerifiedMap(baseObj.name, catalog.skills);
          if (matchedSkillFact) itemFacts.push(matchedSkillFact);
        }
        if (itemFacts.length === 0 && catalog.facts.length > 0) {
          itemFacts.push(catalog.facts[0].id);
        }

        return {
          ...baseObj,
          id: itemId,
          source_fact_ids: Array.from(new Set(itemFacts))
        };
      })
      .filter((it): it is NonNullable<typeof it> => it !== null);

    const secFactIds = Array.from(
      new Set(normalizedItems.flatMap((it) => it.source_fact_ids || []))
    );

    normalizedSections.push({
      id: secId,
      type: validType,
      title: secTitle,
      content: normalizedItems,
      ...(rawSec?.isCustom ? { isCustom: true } : {}),
      ...(secFactIds.length > 0 ? { source_fact_ids: secFactIds } : {})
    });
  });

  // Extract deterministic skills from verified catalog (resume or blank-draft prompt via SKILL_DICTIONARY)
  const hasSkillSection = normalizedSections.some(
    (s) => s.type === 'SkillItem' || s.type === 'TechnicalSkillItem'
  );
  const matchedPromptSkills = !catalog.hasResumeCareerFacts
    ? extractSkillsFromText(prompt)
    : [];
  if (!hasSkillSection && matchedPromptSkills.length > 0) {
    const skillSectionId = usedSectionIds.has('section-skills')
      ? `section-skills-${normalizedSections.length + 1}`
      : 'section-skills';
    usedSectionIds.add(skillSectionId);

    const skillItems = matchedPromptSkills.map((skillName) => {
      const slug = slugifyFactToken(skillName);
      let itemId = `skill-${slug}`;
      let counter = 1;
      while (usedItemIds.has(itemId)) {
        counter += 1;
        itemId = `skill-${slug}-${counter}`;
      }
      usedItemIds.add(itemId);
      const factId =
        matchesVerifiedMap(skillName, catalog.skills) || `fact:prompt:skill:${slug}`;
      return {
        id: itemId,
        name: skillName,
        source_fact_ids: [factId]
      };
    });

    normalizedSections.push({
      id: skillSectionId,
      type: 'SkillItem',
      title: 'Skills',
      content: skillItems,
      source_fact_ids: skillItems.flatMap((it) => it.source_fact_ids)
    });
  }

  // Build sectionOrder preserving existing order and appending new section IDs
  const rawOrder = Array.isArray(resume?.content?.sectionOrder)
    ? resume!.content!.sectionOrder!.filter(
        (id): id is string => typeof id === 'string' && usedSectionIds.has(id)
      )
    : [];
  const missingOrderIds = normalizedSections
    .map((s) => s.id)
    .filter((id) => !rawOrder.includes(id));
  const sectionOrder = [...rawOrder, ...missingOrderIds];

  // Build grounded summary without [AI placeholder] or fabricated claims
  const summaryFactIds = new Set<string>();
  if (catalog.factMap.has('fact:basics:name')) summaryFactIds.add('fact:basics:name');
  if (catalog.factMap.has('fact:basics:label')) summaryFactIds.add('fact:basics:label');
  if (catalog.factMap.has('fact:prompt:role')) summaryFactIds.add('fact:prompt:role');

  const verifiedSkillFacts = catalog.facts.filter((f) => f.category === 'skill').slice(0, 6);
  verifiedSkillFacts.forEach((f) => summaryFactIds.add(f.id));
  const verifiedEmployerFacts = catalog.facts.filter((f) => f.category === 'employer').slice(0, 2);
  verifiedEmployerFacts.forEach((f) => summaryFactIds.add(f.id));

  const existingCleanSummary = [rawBasics.summary, resume?.summary]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .find((s) => s.length > 0 && !isPlaceholderSummary(s));

  let summary = '';
  if (existingCleanSummary) {
    summaryFactIds.add('fact:summary');
    const skillNames = verifiedSkillFacts.map((f) => f.value);
    const missingSkillsInSummary = skillNames.filter(
      (sk) => !existingCleanSummary.toLowerCase().includes(sk.toLowerCase())
    );
    summary =
      missingSkillsInSummary.length > 0
        ? `${existingCleanSummary.replace(/[.]+$/, '')}. Core competencies include ${missingSkillsInSummary.slice(0, 4).join(', ')}.`
        : existingCleanSummary;
  } else {
    const clauses: string[] = [];
    const employerClause =
      verifiedEmployerFacts.length > 0
        ? ` with experience at ${verifiedEmployerFacts.map((f) => f.value).join(' and ')}`
        : '';
    const skillClause =
      verifiedSkillFacts.length > 0
        ? ` specializing in ${verifiedSkillFacts.map((f) => f.value).join(', ')}`
        : '';
    clauses.push(
      `${resolvedLabel}${employerClause}${skillClause}, focused on delivering reliable, maintainable solutions aligned with team goals.`
    );
    summary = clauses.join(' ');
  }

  if (summaryFactIds.size === 0 && catalog.factMap.has('fact:prompt:intent')) {
    summaryFactIds.add('fact:prompt:intent');
  }

  const allFactIds = Array.from(
    new Set([
      ...Array.from(summaryFactIds),
      ...normalizedSections.flatMap((s) => s.source_fact_ids || [])
    ])
  );

  const draft: GeneratedResume = {
    title: resolvedTitle,
    summary,
    ...(allFactIds.length > 0 ? { source_fact_ids: allFactIds } : {}),
    content: {
      basics: {
        name,
        email,
        label: resolvedLabel,
        summary,
        ...(rawBasics.phone ? { phone: rawBasics.phone } : {}),
        ...(rawBasics.location ? { location: rawBasics.location } : {}),
        ...(summaryFactIds.size > 0
          ? { source_fact_ids: Array.from(summaryFactIds) }
          : {})
      },
      sections: normalizedSections,
      sectionOrder,
      ...(allFactIds.length > 0 ? { source_fact_ids: allFactIds } : {})
    }
  };

  const parsed = GeneratedResumeSchema.parse(draft);
  return {
    ...parsed,
    summary: parsed.summary ?? summary,
    ...(allFactIds.length > 0 ? { source_fact_ids: allFactIds } : {})
  };
};

const normalizeRawAiSections = (parsedJson: any): any => {
  if (!parsedJson || typeof parsedJson !== 'object') return parsedJson;
  const content = parsedJson.content;
  if (!content || typeof content !== 'object' || !Array.isArray(content.sections)) {
    return parsedJson;
  }
  return {
    ...parsedJson,
    content: {
      ...content,
      sections: content.sections.map((sec: any) => {
        if (!sec || typeof sec !== 'object') return sec;
        return {
          ...sec,
          type:
            typeof sec.type === 'string'
              ? normalizeKnownSectionType(sec.type)
              : sec.type
        };
      })
    }
  };
};

export const analyzeResumePrompt = async (
  prompt: string,
  resume?: ResumeFactSourceInput | null
): Promise<AIResumeResult> => {
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  const factCatalog = extractVerifiedResumeFacts(resume, { prompt });

  if (!apiUrl) {
    return buildGroundedStructuredDraft(prompt, resume, factCatalog);
  }

  const factLines = factCatalog.facts.map(
    (fact) => `[${fact.id}] (${fact.category}): ${fact.value}`
  );

  const userPromptParts = [
    factLines.length > 0
      ? `Verified Resume Facts (ONLY allowed source of employers, credentials, technologies, and numbers):\n${factLines.join('\n')}`
      : 'Verified Resume Facts: None provided beyond prompt.',
    `Target Prompt / Instructions:\n${prompt}`
  ];

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are a fact-grounded resume builder. Build a structured JSON resume grounded STRICTLY in the provided Verified Resume Facts.
ANTI-FABRICATION RULES:
1. NEVER invent employers, companies, degrees, institutions, certifications, technologies, or numerical metrics that do not appear in the Verified Resume Facts.
2. Every section "type" MUST be one of: ${VALID_SECTION_TYPES.join(', ')}.
3. Every section and every item inside "content" MUST include a non-empty "id" string and "source_fact_ids" referencing the verified fact IDs used.
4. Do NOT retain or train on user resume content.
Return ONLY valid JSON matching this schema:
{
  "title": "String",
  "summary": "String",
  "source_fact_ids": ["fact:..."],
  "content": {
    "basics": { "name": "String", "email": "String", "phone": "String (optional)", "label": "String (optional)", "source_fact_ids": ["fact:..."] },
    "sections": [ { "id": "non-empty string", "type": "WorkItem | EducationItem | SkillItem | ProjectItem | CertificateItem", "title": "String", "source_fact_ids": ["fact:..."], "content": [ { "id": "non-empty string", "source_fact_ids": ["fact:..."] } ] } ],
    "sectionOrder": [ "String" ]
  }
}`
      },
      {
        role: 'user',
        content: userPromptParts.join('\n\n')
      }
    ]
  };

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      let jsonString = data?.choices?.[0]?.message?.content || data?.response || '';

      if (!jsonString && typeof data === 'object') {
        jsonString = JSON.stringify(data);
      }

      // Attempt to extract JSON if it contains markdown blocks or extra text
      jsonString = jsonString.trim();
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```/, '').replace(/```$/, '').trim();
      } else {
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        }
      }

      const parsedJson = normalizeRawAiSections(JSON.parse(jsonString));

      const result = GeneratedResumeSchema.safeParse(parsedJson);

      if (!result.success) {
        logger.error(`Validation failed for AI output: ${JSON.stringify(result.error.errors)}`);
        throw new Error('AI generated malformed structure that failed validation.');
      }

      return validateAndAttachResumeProvenance(result.data, factCatalog);
    } catch (error: any) {
      attempt++;
      logger.warn(`AI generation attempt ${attempt} failed: ${error.message}`);

      if (attempt >= MAX_RETRIES) {
        logger.error(
          `AI generation permanently failed after ${MAX_RETRIES} attempts. Error: ${error.message}`
        );
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }

      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

export type BulletCoachAction = 'rewrite' | 'shorten' | 'improve';

export interface XyzImpactPrompt {
  id: string;
  label: 'Reduced latency' | 'Increased throughput' | 'Cut cost';
  placeholder: string;
  clausePrefix: string;
}

export const XYZ_IMPACT_PROMPTS: XyzImpactPrompt[] = [
  {
    id: 'reduced-latency',
    label: 'Reduced latency',
    placeholder: 'e.g. 35% or 120ms',
    clausePrefix: 'reducing latency by'
  },
  {
    id: 'increased-throughput',
    label: 'Increased throughput',
    placeholder: 'e.g. 3x or 100K+ req/s',
    clausePrefix: 'increasing throughput by'
  },
  {
    id: 'cut-cost',
    label: 'Cut cost',
    placeholder: 'e.g. 25% or $12K/mo',
    clausePrefix: 'cutting cost by'
  }
];

export interface BulletCoachInput {
  text: string;
  action?: BulletCoachAction;
  sectionType?: string;
  fieldKey?: string;
  itemContext?: Record<string, unknown>;
  userMetric?: {
    category?: string;
    value?: string;
  };
  resume?: ResumeFactSourceInput | null;
}

export interface BulletCoachResult {
  originalText: string;
  rewrittenText: string;
  action: BulletCoachAction;
  source_fact_ids: string[];
  hasMetrics: boolean;
  xyzPrompts: XyzImpactPrompt[];
}

const BulletCoachAiResponseSchema = z.object({
  rewrittenText: z.string().trim().min(1),
  source_fact_ids: z.array(z.string().trim().min(1)).min(1)
});

const WEAK_VERB_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^(?:i\s+)?(?:was\s+)?responsible\s+for\s+working\s+on\b/i, 'Engineered'],
  [/^(?:i\s+)?(?:was\s+)?responsible\s+for\s+building\b/i, 'Architected'],
  [/^(?:i\s+)?(?:was\s+)?responsible\s+for\s+managing\b/i, 'Directed'],
  [/^(?:i\s+)?(?:was\s+)?responsible\s+for\b/i, 'Owned'],
  [/^(?:i\s+)?worked\s+on\b/i, 'Engineered'],
  [/^(?:i\s+)?helped\s+(?:to\s+)?build\b/i, 'Co-developed'],
  [/^(?:i\s+)?helped\s+(?:with|in|on)\b/i, 'Contributed to'],
  [/^(?:i\s+)?helped\b/i, 'Supported'],
  [/^(?:i\s+)?participated\s+in\b/i, 'Collaborated on'],
  [/^(?:i\s+)?assisted\s+(?:with|in)\b/i, 'Delivered'],
  [/^(?:i\s+)?made\b/i, 'Developed'],
  [/^(?:i\s+)?did\b/i, 'Executed'],
  [/^(?:i\s+)?handled\b/i, 'Managed'],
  [/^(?:i\s+)?fixed\b/i, 'Resolved'],
  [/^(?:i\s+)?used\b/i, 'Leveraged']
];

const FILLER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, 'to'],
  [/\bas well as\b/gi, 'and'],
  [/\ba wide variety of\b/gi, ''],
  [/\ba variety of\b/gi, ''],
  [/\bon a daily basis\b/gi, ''],
  [/\bplayed a key role in\b/gi, 'led'],
  [/\bwas able to\b/gi, ''],
  [/\bsuccessfully\s+/gi, ''],
  [/\bvarious\s+/gi, ''],
  [/\beffectively\s+/gi, ''],
  [/\bactively\s+/gi, '']
];

const appendUserMetricClause = (
  baseText: string,
  userMetric?: { category?: string; value?: string }
): string => {
  const rawMetric = userMetric?.value?.trim() || '';
  if (!rawMetric || !/\d/.test(rawMetric)) {
    return baseText;
  }
  if (baseText.includes(rawMetric)) {
    return baseText;
  }

  const category = (userMetric?.category || 'Reduced latency').trim().toLowerCase();
  let prefix = 'reducing latency by';
  if (category.includes('throughput')) {
    prefix = 'increasing throughput by';
  } else if (category.includes('cost')) {
    prefix = 'cutting cost by';
  }

  const metricPhrase = /^(?:by|to|from)\b/i.test(rawMetric)
    ? `${prefix.replace(/\s+by$/, '')} ${rawMetric}`
    : `${prefix} ${rawMetric}`;

  const stripped = baseText.trim().replace(/[.]+$/, '');
  if (!stripped) {
    const capitalized = metricPhrase.charAt(0).toUpperCase() + metricPhrase.slice(1);
    return `${capitalized}.`;
  }
  return `${stripped}, ${metricPhrase}.`;
};

const transformSingleBulletLocally = (
  rawLine: string,
  action: BulletCoachAction
): string => {
  const bulletPrefixMatch = rawLine.match(/^(\s*(?:[-•*]|\d+\.)\s+)/);
  const bulletPrefix = bulletPrefixMatch ? bulletPrefixMatch[1] : '';
  let body = rawLine.slice(bulletPrefix.length).trim();
  if (!body) return rawLine;

  // Strip leading first-person subject
  body = body.replace(/^(?:i|we)\s+/i, '');

  if (action === 'shorten') {
    for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
      body = body.replace(pattern, replacement);
    }
    for (const [pattern, replacement] of WEAK_VERB_REPLACEMENTS) {
      body = body.replace(pattern, replacement);
    }
    body = body.replace(/\s{2,}/g, ' ').trim();

    // Trim wordy non-numeric trailing clauses when long while keeping all metrics intact
    const clauses = body.split(/,\s+(?:while|which|allowing|enabling|supporting)\s+/i);
    if (clauses.length > 1 && !hasQuantifiedMetrics(clauses[clauses.length - 1])) {
      body = clauses.slice(0, -1).join(', ');
    }
    body = body.replace(/[.]+$/, '').trim();
    body = body.charAt(0).toUpperCase() + body.slice(1);
    return `${bulletPrefix}${body}.`;
  }

  let verbUpgraded = false;
  for (const [pattern, replacement] of WEAK_VERB_REPLACEMENTS) {
    if (pattern.test(body)) {
      body = body.replace(pattern, replacement);
      verbUpgraded = true;
      break;
    }
  }

  for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
    body = body.replace(pattern, replacement);
  }
  body = body.replace(/\s{2,}/g, ' ').trim();
  const cleanNoPeriod = body.replace(/[.]+$/, '').trim();

  if (action === 'improve') {
    let improved = cleanNoPeriod.charAt(0).toUpperCase() + cleanNoPeriod.slice(1);
    const wordCount = improved.split(/\s+/).filter(Boolean).length;
    if (
      wordCount <= 9 &&
      !/\b(?:improving|reducing|increasing|enhancing|delivering|supporting)\b/i.test(improved)
    ) {
      improved = `${improved} to support reliable production workflows`;
    }
    return `${bulletPrefix}${improved}.`;
  }

  // 'rewrite'
  let rewritten = cleanNoPeriod.charAt(0).toUpperCase() + cleanNoPeriod.slice(1);
  if (!verbUpgraded && !/^(?:Delivered|Engineered|Architected|Spearheaded|Built|Optimized)\b/i.test(rewritten)) {
    const lowered = rewritten.charAt(0).toLowerCase() + rewritten.slice(1);
    if (/^(?:developing|building|creating|designing|maintaining|implementing)\b/i.test(rewritten)) {
      rewritten = rewritten
        .replace(/^developing\b/i, 'Developed')
        .replace(/^building\b/i, 'Built')
        .replace(/^creating\b/i, 'Created')
        .replace(/^designing\b/i, 'Designed')
        .replace(/^maintaining\b/i, 'Maintained')
        .replace(/^implementing\b/i, 'Implemented');
    } else {
      rewritten = `Delivered ${lowered}`;
    }
  }
  return `${bulletPrefix}${rewritten}.`;
};

const runLocalBulletCoachRules = (
  input: BulletCoachInput,
  catalog: VerifiedFactCatalog
): BulletCoachResult => {
  const action: BulletCoachAction = input.action || 'improve';
  const originalText = input.text.trim();
  const lines = originalText.split('\n');
  const transformedLines = lines.map((line, idx) => {
    if (!line.trim()) return line;
    const rewrittenLine = transformSingleBulletLocally(line, action);
    return idx === lines.length - 1
      ? appendUserMetricClause(rewrittenLine, input.userMetric)
      : rewrittenLine;
  });

  const rewrittenText = transformedLines.join('\n').trim();
  const claimFactIds = validateTextClaimsAgainstCatalog(rewrittenText, catalog);
  const resolvedFactIds = new Set<string>(claimFactIds);

  if (catalog.factMap.has('fact:bullet:input')) {
    resolvedFactIds.add('fact:bullet:input');
  }
  if (input.userMetric?.value && catalog.factMap.has('fact:user:metric')) {
    resolvedFactIds.add('fact:user:metric');
  }
  for (const fact of catalog.facts) {
    if (fact.id.startsWith('fact:context:') || fact.id.startsWith('fact:work:') || fact.id.startsWith('fact:edu:')) {
      if (rewrittenText.toLowerCase().includes(fact.value.toLowerCase())) {
        resolvedFactIds.add(fact.id);
      }
    }
  }
  if (resolvedFactIds.size === 0 && catalog.facts.length > 0) {
    resolvedFactIds.add(catalog.facts[0].id);
  }

  return {
    originalText: input.text,
    rewrittenText,
    action,
    source_fact_ids: Array.from(resolvedFactIds),
    hasMetrics: hasQuantifiedMetrics(rewrittenText),
    xyzPrompts: XYZ_IMPACT_PROMPTS
  };
};

export const coachBullet = async (input: BulletCoachInput): Promise<BulletCoachResult> => {
  const action: BulletCoachAction = input.action || 'improve';
  const rawText = typeof input.text === 'string' ? input.text : '';
  if (!rawText.trim()) {
    throw new AppError('Bullet text is required', 400);
  }

  const catalog = extractVerifiedResumeFacts(input.resume, {
    itemContext: input.itemContext,
    bulletText: rawText,
    userMetricValue: input.userMetric?.value
  });

  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  if (!apiUrl) {
    return runLocalBulletCoachRules({ ...input, action }, catalog);
  }

  const factLines = catalog.facts.map((f) => `[${f.id}] (${f.category}): ${f.value}`);
  const metricInstruction =
    input.userMetric?.value && /\d/.test(input.userMetric.value)
      ? `Incorporate this exact user-verified metric (${input.userMetric.category || 'Impact'}): ${input.userMetric.value}`
      : 'Do NOT invent any numbers, percentages, or metrics.';

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are a grounded resume bullet coach performing the "${action}" transformation.
ANTI-FABRICATION RULES:
1. NEVER invent employers, credentials, technologies, or numerical metrics not present in the Verified Facts.
2. ${metricInstruction}
3. Return ONLY JSON: { "rewrittenText": "...", "source_fact_ids": ["fact:..."] } where "source_fact_ids" lists the verified fact IDs used.`
      },
      {
        role: 'user',
        content: `Verified Facts:\n${factLines.join('\n')}\n\nBullet to ${action}:\n${rawText}`
      }
    ]
  };

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      let jsonString = data?.choices?.[0]?.message?.content || data?.response || '';
      if (!jsonString && typeof data === 'object') {
        jsonString = JSON.stringify(data);
      }

      jsonString = jsonString.trim();
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```/, '').replace(/```$/, '').trim();
      } else {
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        }
      }

      const parsed = BulletCoachAiResponseSchema.safeParse(JSON.parse(jsonString));
      if (!parsed.success) {
        throw new Error('AI bullet coach returned malformed JSON or missing source_fact_ids.');
      }

      const verifiedFactIds = new Set<string>();
      for (const id of parsed.data.source_fact_ids) {
        if (!catalog.factMap.has(id)) {
          throw new Error(`Unverified source_fact_id "${id}" in AI bullet response.`);
        }
        verifiedFactIds.add(id);
      }

      // Reject unverified numbers or technologies
      validateTextClaimsAgainstCatalog(parsed.data.rewrittenText, catalog).forEach((id) =>
        verifiedFactIds.add(id)
      );

      return {
        originalText: rawText,
        rewrittenText: parsed.data.rewrittenText,
        action,
        source_fact_ids: Array.from(verifiedFactIds),
        hasMetrics: hasQuantifiedMetrics(parsed.data.rewrittenText),
        xyzPrompts: XYZ_IMPACT_PROMPTS
      };
    } catch (error: any) {
      attempt++;
      logger.warn(`AI bullet coach attempt ${attempt} failed: ${error.message}`);
      if (attempt >= MAX_RETRIES) {
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

export interface CoverLetterGenerationInput {
  resume?: {
    title?: string;
    summary?: string;
    content?: {
      basics?: {
        name?: string;
        label?: string;
        email?: string;
        phone?: string;
      };
      sections?: Array<{
        id?: string;
        type?: string;
        title?: string;
        content?: any[];
      }>;
    };
  } | null;
  recipient?: {
    name?: string;
    company?: string;
    address?: string;
  };
  jobTitle?: string;
  jobDescription?: string;
  prompt?: string;
}

const extractResumeHighlights = (resume?: CoverLetterGenerationInput['resume']) => {
  const basics = resume?.content?.basics || {};
  const sections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];

  const skills: string[] = [];
  const roles: string[] = [];

  for (const section of sections) {
    const sectionType = String(section?.type || section?.id || '').toLowerCase();
    const items = Array.isArray(section?.content) ? section.content : [];

    if (sectionType.includes('skill')) {
      for (const item of items) {
        if (typeof item === 'string' && item.trim()) {
          skills.push(item.trim());
        } else if (item && typeof item.name === 'string' && item.name.trim()) {
          skills.push(item.name.trim());
        }
      }
    } else if (sectionType.includes('work') || sectionType.includes('experience')) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const pos = typeof item.position === 'string' ? item.position.trim() : '';
        const org =
          typeof item.company === 'string' && item.company.trim()
            ? item.company.trim()
            : typeof item.name === 'string'
              ? item.name.trim()
              : '';
        if (pos && org) {
          roles.push(`${pos} at ${org}`);
        } else if (pos || org) {
          roles.push(pos || org);
        }
      }
    }
  }

  return {
    candidateRole: basics.label?.trim() || resume?.title?.trim() || '',
    summary: (resume?.summary || (basics as any)?.summary || '').toString().trim(),
    topSkills: Array.from(new Set(skills)).slice(0, 5),
    recentRoles: roles.slice(0, 2)
  };
};

const buildPlaceholderCoverLetterBody = (input: CoverLetterGenerationInput): string => {
  const targetRole = input.jobTitle?.trim() || 'the open position';
  const company = input.recipient?.company?.trim() || 'your organization';
  const { candidateRole, summary, topSkills, recentRoles } = extractResumeHighlights(input.resume);

  const openingRoleClause = candidateRole ? ` as a ${candidateRole}` : '';
  const paragraph1 = `I am writing to express my strong interest in the ${targetRole} opportunity at ${company}. Drawing on my background${openingRoleClause}, I am excited about the chance to contribute thoughtful execution and dependable collaboration to your team.`;

  const experienceParts: string[] = [];
  if (recentRoles.length > 0) {
    experienceParts.push(
      `In my experience as ${recentRoles.join(' and ')}, I have focused on delivering reliable, high-impact outcomes.`
    );
  } else if (summary) {
    const conciseSummary =
      summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
    experienceParts.push(conciseSummary);
  }
  if (topSkills.length > 0) {
    experienceParts.push(`My core strengths include ${topSkills.join(', ')}.`);
  }
  if (input.jobDescription && input.jobDescription.trim()) {
    const cleanJd = input.jobDescription.trim().replace(/\s+/g, ' ');
    const snippet = cleanJd.length > 160 ? `${cleanJd.slice(0, 157).trimEnd()}...` : cleanJd;
    experienceParts.push(
      `Your requirements—particularly "${snippet}"—closely align with the problems I enjoy solving.`
    );
  }
  if (experienceParts.length === 0) {
    experienceParts.push(
      `Throughout my career, I have prioritized clear communication, adaptability, and measurable results that align closely with the goals of ${company}.`
    );
  }
  const paragraph2 = experienceParts.join(' ');

  const promptNote =
    input.prompt && input.prompt.trim()
      ? ` In particular, I welcome the opportunity to discuss ${input.prompt.trim().replace(/[.]+$/, '')}.`
      : '';
  const paragraph3 = `Thank you for your time and consideration.${promptNote} I would welcome the opportunity to speak further about how my background can support ${company}'s upcoming priorities.`;

  return [paragraph1, paragraph2, paragraph3].join('\n\n');
};

export const generateCoverLetterBody = async (
  input: CoverLetterGenerationInput
): Promise<string> => {
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  if (!apiUrl) {
    return buildPlaceholderCoverLetterBody(input);
  }

  const { candidateRole, summary, topSkills, recentRoles } = extractResumeHighlights(input.resume);
  const resumeContextLines = [
    input.resume?.content?.basics?.name ? `Candidate Name: ${input.resume.content.basics.name}` : '',
    candidateRole ? `Current Title: ${candidateRole}` : '',
    summary ? `Summary: ${summary}` : '',
    recentRoles.length > 0 ? `Experience: ${recentRoles.join('; ')}` : '',
    topSkills.length > 0 ? `Skills: ${topSkills.join(', ')}` : ''
  ].filter(Boolean);

  const userPromptParts = [
    input.jobTitle ? `Target Job Title: ${input.jobTitle}` : '',
    input.recipient?.company ? `Target Company: ${input.recipient.company}` : '',
    input.recipient?.name ? `Recipient: ${input.recipient.name}` : '',
    resumeContextLines.length > 0 ? `Linked Resume Facts:\n${resumeContextLines.join('\n')}` : '',
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : '',
    input.prompt ? `Additional Instructions:\n${input.prompt}` : ''
  ].filter(Boolean);

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You write concise, professional cover letter body paragraphs grounded strictly in the provided resume facts and job description. Do not invent employers, metrics, or credentials. Omit the greeting and signature—return ONLY 3 to 4 plain-text body paragraphs separated by blank lines (\\n\\n) or JSON {"body": "..."}.'
      },
      {
        role: 'user',
        content: userPromptParts.join('\n\n') || 'Draft a professional cover letter body.'
      }
    ]
  };

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      let rawText: string =
        data?.choices?.[0]?.message?.content ??
        data?.body ??
        data?.response ??
        '';

      if (typeof rawText !== 'string') {
        rawText = '';
      }

      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
      }

      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed.body === 'string') {
            cleaned = parsed.body.trim();
          }
        } catch {
          // Use raw text if not valid JSON
        }
      }

      if (!cleaned) {
        throw new Error('AI returned an empty cover letter draft.');
      }

      return cleaned;
    } catch (error: any) {
      attempt++;
      logger.warn(`AI cover letter generation attempt ${attempt} failed: ${error.message}`);

      if (attempt >= MAX_RETRIES) {
        logger.error(
          `AI cover letter generation permanently failed after ${MAX_RETRIES} attempts. Error: ${error.message}`
        );
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }

      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

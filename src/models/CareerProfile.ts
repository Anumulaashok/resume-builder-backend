import crypto from 'crypto';
import mongoose, { Document, Schema } from 'mongoose';

export type SkillCategoryKey =
  | 'languages'
  | 'backend'
  | 'frontend'
  | 'databases'
  | 'cloud'
  | 'devops'
  | 'aiMl'
  | 'messaging'
  | 'tools'
  | 'other';

export const SKILL_CATEGORY_KEYS: SkillCategoryKey[] = [
  'languages',
  'backend',
  'frontend',
  'databases',
  'cloud',
  'devops',
  'aiMl',
  'messaging',
  'tools',
  'other',
];

export type AchievementCategory =
  | 'award'
  | 'publication'
  | 'open-source'
  | 'hackathon'
  | 'leadership'
  | 'other';

export interface ICareerLink {
  id: string;
  label: string;
  url: string;
}

export interface ICareerPersonalInfo {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
  otherLinks: ICareerLink[];
}

export interface ICareerSummary {
  id: string;
  currentTitle: string;
  yearsOfExperience: string;
  areasOfExpertise: string[];
  industryExperience: string[];
  text: string;
}

export interface ICareerExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  employmentType: string;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
  metrics: string[];
}

export interface ICareerProject {
  id: string;
  name: string;
  description: string;
  problem: string;
  solution: string;
  technologies: string[];
  impact: string;
  metrics: string[];
  url: string;
  links: string[];
}

export interface ICareerSkillItem {
  id: string;
  name: string;
  level?: string;
}

export type ICareerGroupedSkills = Record<SkillCategoryKey, ICareerSkillItem[]>;

export interface ICareerEducation {
  id: string;
  degree: string;
  field: string;
  institution: string;
  startYear: string;
  endYear: string;
  gpa: string;
  location: string;
}

export interface ICareerCertification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialUrl: string;
}

export interface ICareerAchievement {
  id: string;
  title: string;
  category: AchievementCategory;
  issuer: string;
  date: string;
  description: string;
}

export interface ICareerProfileData {
  personalInfo: ICareerPersonalInfo;
  summary: ICareerSummary;
  experience: ICareerExperience[];
  projects: ICareerProject[];
  skills: ICareerGroupedSkills;
  education: ICareerEducation[];
  certifications: ICareerCertification[];
  achievements: ICareerAchievement[];
}

export interface ICareerProfile extends ICareerProfileData, Document {
  userId: mongoose.Types.ObjectId;
  completeness: number;
  createdAt: Date;
  updatedAt: Date;
}

export const makeFactId = (prefix: string): string =>
  `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const str = (value: unknown, maxLen = 2000): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLen) : '';

const strArray = (value: unknown, maxItems = 50, maxLen = 600): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => str(item, maxLen))
          .filter(Boolean)
      )
    ).slice(0, maxItems);
  }
  if (typeof value === 'string' && value.trim()) {
    return Array.from(
      new Set(
        value
          .split(/[\n,;]+/)
          .map((item) => item.trim().slice(0, maxLen))
          .filter(Boolean)
      )
    ).slice(0, maxItems);
  }
  return [];
};

const ensureId = (value: unknown, prefix: string): string => {
  const cleaned = str(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || makeFactId(prefix);
};

export const createEmptyGroupedSkills = (): ICareerGroupedSkills => ({
  languages: [],
  backend: [],
  frontend: [],
  databases: [],
  cloud: [],
  devops: [],
  aiMl: [],
  messaging: [],
  tools: [],
  other: [],
});

export const createEmptyCareerProfileData = (defaults?: {
  fullName?: string;
  email?: string;
}): ICareerProfileData => ({
  personalInfo: {
    id: 'info_primary',
    fullName: str(defaults?.fullName, 200),
    email: str(defaults?.email, 200),
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
    website: '',
    otherLinks: [],
  },
  summary: {
    id: 'sum_primary',
    currentTitle: '',
    yearsOfExperience: '',
    areasOfExpertise: [],
    industryExperience: [],
    text: '',
  },
  experience: [],
  projects: [],
  skills: createEmptyGroupedSkills(),
  education: [],
  certifications: [],
  achievements: [],
});

const normalizeSkillItems = (raw: unknown, prefix: string): ICareerSkillItem[] => {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) {
      return strArray(raw, 60, 120).map((name) => ({
        id: makeFactId(prefix),
        name,
      }));
    }
    return [];
  }

  const seen = new Set<string>();
  const out: ICareerSkillItem[] = [];
  for (const entry of raw) {
    const name =
      typeof entry === 'string'
        ? str(entry, 120)
        : entry && typeof entry === 'object'
          ? str((entry as Record<string, unknown>).name, 120)
          : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const level =
      entry && typeof entry === 'object'
        ? str((entry as Record<string, unknown>).level, 60)
        : '';
    const id =
      entry && typeof entry === 'object'
        ? ensureId((entry as Record<string, unknown>).id, prefix)
        : makeFactId(prefix);

    out.push({
      id,
      name,
      ...(level ? { level } : {}),
    });
  }
  return out.slice(0, 80);
};

const VALID_ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  'award',
  'publication',
  'open-source',
  'hackathon',
  'leadership',
  'other',
];

export const normalizeCareerProfileInput = (
  input: Record<string, unknown> = {},
  defaults?: { fullName?: string; email?: string }
): ICareerProfileData => {
  const empty = createEmptyCareerProfileData(defaults);
  const rawPersonal =
    input.personalInfo && typeof input.personalInfo === 'object'
      ? (input.personalInfo as Record<string, unknown>)
      : {};
  const rawSummary =
    input.summary && typeof input.summary === 'object'
      ? (input.summary as Record<string, unknown>)
      : typeof input.summary === 'string'
        ? { text: input.summary }
        : {};

  const otherLinks: ICareerLink[] = Array.isArray(rawPersonal.otherLinks)
    ? rawPersonal.otherLinks
        .map((link) => {
          if (!link || typeof link !== 'object') return null;
          const l = link as Record<string, unknown>;
          const url = str(l.url, 400);
          if (!url) return null;
          return {
            id: ensureId(l.id, 'link'),
            label: str(l.label, 100) || 'Link',
            url,
          };
        })
        .filter((x): x is ICareerLink => Boolean(x))
        .slice(0, 15)
    : [];

  const personalInfo: ICareerPersonalInfo = {
    id: ensureId(rawPersonal.id || empty.personalInfo.id, 'info'),
    fullName: str(rawPersonal.fullName, 200) || empty.personalInfo.fullName,
    email: str(rawPersonal.email, 200) || empty.personalInfo.email,
    phone: str(rawPersonal.phone, 80),
    location: str(rawPersonal.location, 200),
    linkedin: str(rawPersonal.linkedin, 400),
    github: str(rawPersonal.github, 400),
    portfolio: str(rawPersonal.portfolio, 400),
    website: str(rawPersonal.website, 400),
    otherLinks,
  };

  const summary: ICareerSummary = {
    id: ensureId(rawSummary.id || empty.summary.id, 'sum'),
    currentTitle: str(rawSummary.currentTitle, 200),
    yearsOfExperience: str(
      typeof rawSummary.yearsOfExperience === 'number'
        ? String(rawSummary.yearsOfExperience)
        : rawSummary.yearsOfExperience,
      40
    ),
    areasOfExpertise: strArray(rawSummary.areasOfExpertise, 30, 120),
    industryExperience: strArray(rawSummary.industryExperience, 30, 120),
    text: str(rawSummary.text, 4000),
  };

  const experience: ICareerExperience[] = Array.isArray(input.experience)
    ? input.experience
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as Record<string, unknown>;
          const company = str(item.company || item.name, 200);
          const role = str(item.role || item.position, 200);
          const responsibilities = strArray(
            item.responsibilities ?? item.bullets ?? item.highlights,
            30,
            600
          );
          const achievements = strArray(item.achievements, 25, 600);
          if (!company && !role && responsibilities.length === 0 && achievements.length === 0) {
            return null;
          }
          const current = Boolean(item.current);
          return {
            id: ensureId(item.id, 'exp'),
            company,
            role,
            location: str(item.location, 200),
            startDate: str(item.startDate, 80),
            endDate: current ? 'Present' : str(item.endDate, 80),
            current,
            employmentType: str(item.employmentType, 80),
            responsibilities,
            achievements,
            technologies: strArray(item.technologies, 40, 120),
            metrics: strArray(item.metrics, 25, 300),
          };
        })
        .filter((x): x is ICareerExperience => Boolean(x))
        .slice(0, 40)
    : [];

  const projects: ICareerProject[] = Array.isArray(input.projects)
    ? input.projects
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as Record<string, unknown>;
          const name = str(item.name || item.title, 200);
          const description = str(item.description, 2500);
          const problem = str(item.problem, 1200);
          const solution = str(item.solution, 1200);
          const impact = str(item.impact, 1200);
          if (!name && !description && !solution) return null;
          const url = str(item.url, 400);
          const links = strArray(item.links, 10, 400);
          return {
            id: ensureId(item.id, 'proj'),
            name: name || 'Untitled Project',
            description,
            problem,
            solution,
            technologies: strArray(item.technologies, 40, 120),
            impact,
            metrics: strArray(item.metrics, 25, 300),
            url: url || links[0] || '',
            links,
          };
        })
        .filter((x): x is ICareerProject => Boolean(x))
        .slice(0, 40)
    : [];

  const skills = createEmptyGroupedSkills();
  if (input.skills && typeof input.skills === 'object' && !Array.isArray(input.skills)) {
    const rawSkills = input.skills as Record<string, unknown>;
    for (const category of SKILL_CATEGORY_KEYS) {
      skills[category] = normalizeSkillItems(rawSkills[category], `skill_${category}`);
    }
  } else if (Array.isArray(input.skills)) {
    skills.other = normalizeSkillItems(input.skills, 'skill_other');
  }

  const education: ICareerEducation[] = Array.isArray(input.education)
    ? input.education
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as Record<string, unknown>;
          const institution = str(item.institution || item.school, 200);
          const degree = str(item.degree || item.studyType, 200);
          const field = str(item.field || item.area, 200);
          if (!institution && !degree && !field) return null;
          return {
            id: ensureId(item.id, 'edu'),
            degree,
            field,
            institution,
            startYear: str(item.startYear || item.startDate, 60),
            endYear: str(item.endYear || item.endDate || item.graduationDate, 60),
            gpa: str(item.gpa || item.score, 40),
            location: str(item.location, 200),
          };
        })
        .filter((x): x is ICareerEducation => Boolean(x))
        .slice(0, 20)
    : [];

  const certifications: ICareerCertification[] = Array.isArray(input.certifications)
    ? input.certifications
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as Record<string, unknown>;
          const name = str(item.name || item.title, 200);
          if (!name) return null;
          return {
            id: ensureId(item.id, 'cert'),
            name,
            issuer: str(item.issuer, 200),
            date: str(item.date, 80),
            credentialUrl: str(item.credentialUrl || item.url, 400),
          };
        })
        .filter((x): x is ICareerCertification => Boolean(x))
        .slice(0, 30)
    : [];

  const achievements: ICareerAchievement[] = Array.isArray(input.achievements)
    ? input.achievements
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as Record<string, unknown>;
          const title = str(item.title || item.name, 200);
          const description = str(item.description || item.summary, 1500);
          if (!title && !description) return null;
          const rawCategory = str(item.category, 40).toLowerCase() as AchievementCategory;
          const category: AchievementCategory = VALID_ACHIEVEMENT_CATEGORIES.includes(rawCategory)
            ? rawCategory
            : 'other';
          return {
            id: ensureId(item.id, 'ach'),
            title: title || description.slice(0, 80),
            category,
            issuer: str(item.issuer || item.awarder, 200),
            date: str(item.date, 80),
            description,
          };
        })
        .filter((x): x is ICareerAchievement => Boolean(x))
        .slice(0, 30)
    : [];

  return {
    personalInfo,
    summary,
    experience,
    projects,
    skills,
    education,
    certifications,
    achievements,
  };
};

export const computeCareerProfileCompleteness = (data: ICareerProfileData): number => {
  let score = 0;
  if (data.personalInfo.fullName && data.personalInfo.email) score += 15;
  if (data.personalInfo.phone || data.personalInfo.location || data.personalInfo.linkedin || data.personalInfo.github) {
    score += 10;
  }
  if (data.summary.currentTitle || data.summary.text) score += 15;
  if (data.experience.length > 0) score += 25;
  if (data.projects.length > 0) score += 10;
  const totalSkills = SKILL_CATEGORY_KEYS.reduce((acc, k) => acc + (data.skills[k]?.length || 0), 0);
  if (totalSkills > 0) score += 15;
  if (data.education.length > 0) score += 10;
  return Math.min(100, score);
};

const skillItemSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    level: { type: String },
  },
  { _id: false }
);

const careerProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    personalInfo: {
      id: { type: String, default: 'info_primary' },
      fullName: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      location: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      portfolio: { type: String, default: '' },
      website: { type: String, default: '' },
      otherLinks: {
        type: [
          {
            _id: false,
            id: { type: String, required: true },
            label: { type: String, default: 'Link' },
            url: { type: String, required: true },
          },
        ],
        default: [],
      },
    },
    summary: {
      id: { type: String, default: 'sum_primary' },
      currentTitle: { type: String, default: '' },
      yearsOfExperience: { type: String, default: '' },
      areasOfExpertise: { type: [String], default: [] },
      industryExperience: { type: [String], default: [] },
      text: { type: String, default: '' },
    },
    experience: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          company: { type: String, default: '' },
          role: { type: String, default: '' },
          location: { type: String, default: '' },
          startDate: { type: String, default: '' },
          endDate: { type: String, default: '' },
          current: { type: Boolean, default: false },
          employmentType: { type: String, default: '' },
          responsibilities: { type: [String], default: [] },
          achievements: { type: [String], default: [] },
          technologies: { type: [String], default: [] },
          metrics: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    projects: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          name: { type: String, default: '' },
          description: { type: String, default: '' },
          problem: { type: String, default: '' },
          solution: { type: String, default: '' },
          technologies: { type: [String], default: [] },
          impact: { type: String, default: '' },
          metrics: { type: [String], default: [] },
          url: { type: String, default: '' },
          links: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    skills: {
      languages: { type: [skillItemSchema], default: [] },
      backend: { type: [skillItemSchema], default: [] },
      frontend: { type: [skillItemSchema], default: [] },
      databases: { type: [skillItemSchema], default: [] },
      cloud: { type: [skillItemSchema], default: [] },
      devops: { type: [skillItemSchema], default: [] },
      aiMl: { type: [skillItemSchema], default: [] },
      messaging: { type: [skillItemSchema], default: [] },
      tools: { type: [skillItemSchema], default: [] },
      other: { type: [skillItemSchema], default: [] },
    },
    education: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          degree: { type: String, default: '' },
          field: { type: String, default: '' },
          institution: { type: String, default: '' },
          startYear: { type: String, default: '' },
          endYear: { type: String, default: '' },
          gpa: { type: String, default: '' },
          location: { type: String, default: '' },
        },
      ],
      default: [],
    },
    certifications: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          name: { type: String, default: '' },
          issuer: { type: String, default: '' },
          date: { type: String, default: '' },
          credentialUrl: { type: String, default: '' },
        },
      ],
      default: [],
    },
    achievements: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          title: { type: String, default: '' },
          category: {
            type: String,
            enum: ['award', 'publication', 'open-source', 'hackathon', 'leadership', 'other'],
            default: 'other',
          },
          issuer: { type: String, default: '' },
          date: { type: String, default: '' },
          description: { type: String, default: '' },
        },
      ],
      default: [],
    },
    completeness: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const CareerProfile = mongoose.model<ICareerProfile>('CareerProfile', careerProfileSchema);

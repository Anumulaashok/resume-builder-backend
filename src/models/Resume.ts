import mongoose, { Document, Schema } from 'mongoose';

// Section type interfaces
export interface BaseSection {
  id: string;
  title: string;
  enabled?: boolean;
}

export interface WorkItem extends BaseSection {
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  description?: string;
}

export interface EducationItem extends BaseSection {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  description?: string;
}

export interface SkillItem extends BaseSection {
  name: string;
  level?: number;
  subSkills?: string[];
}

export interface LanguageItem extends BaseSection {
  name: string;
  level?: string;
  proficiency?: number;
}

export interface CertificateItem extends BaseSection {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

export interface InterestItem extends BaseSection {
  name: string;
  description?: string;
}

export interface ProjectItem extends BaseSection {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  technologies?: string[];
}

export interface CourseItem extends BaseSection {
  name: string;
  institution?: string;
  date?: string;
  description?: string;
}

export interface AwardItem extends BaseSection {
  name: string;
  issuer?: string;
  date?: string;
  description?: string;
}

export interface OrganizationItem extends BaseSection {
  name: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

export interface PublicationItem extends BaseSection {
  title: string;
  publisher?: string;
  date?: string;
  url?: string;
  description?: string;
}

export interface ReferenceItem extends BaseSection {
  name: string;
  company?: string;
  position?: string;
  contact?: string;
  description?: string;
}

export interface SoftSkillItem extends BaseSection {
  name: string;
  level?: number;
}

export interface AchievementItem extends BaseSection {
  name: string;
  date?: string;
  description?: string;
}

export interface TechnicalSkillItem extends BaseSection {
  name: string;
  level?: number;
  technologies?: string[];
}

export interface CustomItem extends BaseSection {
  [key: string]: any;
}
export enum SectionType {
  WORK = 'work',
  EDUCATION = 'education',
  SKILLS = 'skills',
  LANGUAGES = 'languages',
  CERTIFICATES = 'certificates',
  INTERESTS = 'interests',
  PROJECTS = 'projects',
  COURSES = 'courses',
  AWARDS = 'awards',
  ORGANIZATIONS = 'organizations',
  PUBLICATIONS = 'publications',
  REFERENCES = 'references',
  SOFTSKILSS = 'softSkills',
  ACHIVEMENTS = 'achievements',
  TECK_SKILLS = 'technicalSkills',
  CUSTOM = 'custom',
}

export interface ISection {
  id: string;
  type: SectionType;
  title: string;
  content: Array<
    | WorkItem
    | EducationItem
    | SkillItem
    | LanguageItem
    | CertificateItem
    | InterestItem
    | ProjectItem
    | CourseItem
    | AwardItem
    | OrganizationItem
    | PublicationItem
    | ReferenceItem
    | SoftSkillItem
    | AchievementItem
    | TechnicalSkillItem
    | CustomItem
  >;
  enabled?: boolean;
  isCustom?: boolean;
}

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
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
    sections: ISection[];
    sectionOrder: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },

  content: {
    basics: {
      name: { type: String, required: true },
      label: String,
      email: { type: String, required: true },
      phone: String,
      summary: String,
      location: {
        address: String,
        city: String,
        countryCode: String,
        postalCode: String
      }
    },
    sections: [{
      id: { type: String, required: true },
      type: { type: String, required: true },
      title: { type: String, required: true },
      content: [Schema.Types.Mixed],
      enabled: { type: Boolean, default: true },
      isCustom: Boolean
    }],
    sectionOrder: [String]
  }
}, { timestamps: true });

export const Resume = mongoose.model<IResume>('Resume', resumeSchema);

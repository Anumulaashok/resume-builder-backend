import mongoose, { Document, Schema } from 'mongoose';

export interface ICareerProfileLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  region?: string;
}

export interface ICareerProfileSocial {
  network?: string;
  username?: string;
  url?: string;
}

export interface ICareerProfileBasics {
  name: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: ICareerProfileLocation;
  profiles?: ICareerProfileSocial[];
}

export interface ICareerProfileExperience {
  id: string;
  company: string;
  name?: string;
  position: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
  highlights: string[];
  technologies: string[];
  metrics: string[];
}

export interface ICareerProfileProject {
  id: string;
  name: string;
  description?: string;
  highlights: string[];
  technologies: string[];
  metrics: string[];
  url?: string;
  githubUrl?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export interface ICareerProfileSkill {
  id: string;
  name: string;
  category?: string;
  level?: string;
  keywords: string[];
  subSkills?: Array<{ id: string; name: string }>;
}

export interface ICareerProfileEducation {
  id: string;
  institution: string;
  degree?: string;
  field?: string;
  startDate?: any;
  endDate?: any;
  current?: boolean;
  location?: string;
  score?: string;
  description?: string;
  highlights: string[];
}

export interface ICareerProfileCertification {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
  description?: string;
}

export interface ICareerProfileData {
  basics: ICareerProfileBasics;
  experiences: ICareerProfileExperience[];
  projects: ICareerProfileProject[];
  skills: ICareerProfileSkill[];
  education: ICareerProfileEducation[];
  certifications: ICareerProfileCertification[];
}

export interface ICareerProfile extends Document, ICareerProfileData {
  userId: mongoose.Types.ObjectId;
  lastApprovedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const experienceSchema = new Schema(
  {
    id: { type: String, required: true },
    company: { type: String, default: '' },
    name: { type: String, default: '' },
    position: { type: String, default: '' },
    location: { type: String, default: '' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    current: { type: Boolean, default: false },
    description: { type: String, default: '' },
    highlights: [{ type: String }],
    technologies: [{ type: String }],
    metrics: [{ type: String }]
  },
  { _id: false }
);

const projectSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    highlights: [{ type: String }],
    technologies: [{ type: String }],
    metrics: [{ type: String }],
    url: { type: String, default: '' },
    githubUrl: { type: String, default: '' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    current: { type: Boolean, default: false }
  },
  { _id: false }
);

const skillSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: '' },
    level: { type: String, default: '' },
    keywords: [{ type: String }],
    subSkills: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true }
      }
    ]
  },
  { _id: false }
);

const educationSchema = new Schema(
  {
    id: { type: String, required: true },
    institution: { type: String, default: '' },
    degree: { type: String, default: '' },
    field: { type: String, default: '' },
    startDate: { type: Schema.Types.Mixed, default: '' },
    endDate: { type: Schema.Types.Mixed, default: '' },
    current: { type: Boolean, default: false },
    location: { type: String, default: '' },
    score: { type: String, default: '' },
    description: { type: String, default: '' },
    highlights: [{ type: String }]
  },
  { _id: false }
);

const certificationSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    issuer: { type: String, default: '' },
    date: { type: String, default: '' },
    url: { type: String, default: '' },
    description: { type: String, default: '' }
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
      index: true
    },
    basics: {
      name: { type: String, default: '' },
      label: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      url: { type: String, default: '' },
      summary: { type: String, default: '' },
      location: {
        address: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        city: { type: String, default: '' },
        countryCode: { type: String, default: '' },
        region: { type: String, default: '' }
      },
      profiles: [
        {
          network: { type: String, default: '' },
          username: { type: String, default: '' },
          url: { type: String, default: '' }
        }
      ]
    },
    experiences: { type: [experienceSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
    skills: { type: [skillSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },
    lastApprovedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const CareerProfile = mongoose.model<ICareerProfile>(
  'CareerProfile',
  careerProfileSchema
);

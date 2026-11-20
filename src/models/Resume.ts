import mongoose, { Document, Schema } from 'mongoose';

export interface IPrivacySettings {
  hideEmail: boolean;
  hidePhone: boolean;
  hideAddress: boolean;
}

export interface IDailyView {
  date: string;
  count: number;
}

export interface ISharing {
  isPublic: boolean;
  shareToken?: string | null;
  slug?: string | null;
  viewCount?: number;
  lastViewedAt?: Date | null;
  dailyViews?: IDailyView[];
  privacy: IPrivacySettings;
}

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  summary?: string;
  templateId?: string;
  themeConfig?: Record<string, any>;
  targetRole?: string;
  targetCompany?: string;
  jobDescription?: string;
  atsScore?: number | null;
  parentResumeId?: mongoose.Types.ObjectId | string | null;
  sharing?: ISharing;
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
    sections: Array<{
      id: string;
      type: string;
      title: string;
      content: any[];
      isCustom?: boolean;
    }>;
    sectionOrder: string[];
  };
  history?: Array<{
    title?: string;
    summary?: string;
    templateId?: string;
    content: any;
    themeConfig?: any;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  summary: String,
  templateId: String,
  themeConfig: Schema.Types.Mixed,
  targetRole: String,
  targetCompany: String,
  jobDescription: String,
  atsScore: { type: Number, min: 0, max: 100 },
  parentResumeId: { type: Schema.Types.ObjectId, ref: 'Resume', default: null },
  sharing: {
    isPublic: { type: Boolean, default: false },
    shareToken: { type: String, default: null, index: true },
    slug: { type: String, trim: true, lowercase: true },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
    dailyViews: {
      type: [
        {
          _id: false,
          date: { type: String, required: true },
          count: { type: Number, required: true, default: 0 }
        }
      ],
      default: []
    },
    privacy: {
      hideEmail: { type: Boolean, default: false },
      hidePhone: { type: Boolean, default: false },
      hideAddress: { type: Boolean, default: false }
    }
  },
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
      isCustom: Boolean
    }],
    sectionOrder: [String]
  },
  history: [{
    title: String,
    summary: String,
    templateId: String,
    content: Schema.Types.Mixed,
    themeConfig: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

resumeSchema.index(
  { 'sharing.slug': 1 },
  {
    unique: true,
    partialFilterExpression: { 'sharing.slug': { $type: 'string' } }
  }
);

export const Resume = mongoose.model<IResume>('Resume', resumeSchema);

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

export interface IResumeProfile {
  network?: string;
  username?: string;
  url?: string;
}

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  summary?: string;
  templateId?: string;
  themeConfig?: Record<string, any>;
  sharing?: ISharing;
  content: {
    basics: {
      name: string;
      label?: string;
      email: string;
      phone?: string;
      url?: string;
      website?: string;
      portfolioUrl?: string;
      linkedin?: string;
      github?: string;
      image?: string;
      summary?: string;
      location?: {
        address?: string;
        city?: string;
        region?: string;
        countryCode?: string;
        postalCode?: string;
      };
      profiles?: IResumeProfile[];
    };
    sections: Array<{
      id: string;
      type: string;
      title: string;
      content: any[];
      enabled?: boolean;
      isCustom?: boolean;
    }>;
    sectionOrder: string[];
  };
  history?: Array<{
    title?: string;
    summary?: string;
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
      url: String,
      website: String,
      portfolioUrl: String,
      linkedin: String,
      github: String,
      image: String,
      summary: String,
      location: {
        address: String,
        city: String,
        region: String,
        countryCode: String,
        postalCode: String
      },
      profiles: {
        type: [
          {
            _id: false,
            network: String,
            username: String,
            url: String
          }
        ],
        default: undefined
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
  },
  history: [{
    title: String,
    summary: String,
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

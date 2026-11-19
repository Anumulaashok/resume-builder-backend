import mongoose, { Document, Schema } from 'mongoose';

export interface IPortfolioSection {
  id: string;
  type: string;
  title: string;
  content: any[];
  isCustom?: boolean;
  enabled?: boolean;
}

export interface IPortfolioBasics {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  bio?: string;
  avatarUrl?: string;
  socialLinks?: {
    github?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
}

export interface IPortfolioThemeConfig {
  theme?: string;
  primaryColor?: string;
  fontFamily?: string;
  layout?: string;
}

export interface IPortfolio extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  isPublished: boolean;
  themeConfig?: IPortfolioThemeConfig;
  basics: IPortfolioBasics;
  sections: IPortfolioSection[];
  sectionOrder: string[];
  createdAt: Date;
  updatedAt: Date;
}

const portfolioSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    isPublished: { type: Boolean, default: false, index: true },
    themeConfig: {
      theme: { type: String, default: 'modern' },
      primaryColor: { type: String, default: '#3B82F6' },
      fontFamily: { type: String, default: 'sans' },
      layout: { type: String, default: 'standard' }
    },
    basics: {
      name: { type: String, required: true, default: '' },
      title: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      location: { type: String, default: '' },
      bio: { type: String, default: '' },
      avatarUrl: { type: String, default: '' },
      socialLinks: {
        github: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        twitter: { type: String, default: '' },
        website: { type: String, default: '' }
      }
    },
    sections: [
      {
        id: { type: String, required: true },
        type: { type: String, required: true },
        title: { type: String, required: true },
        content: [Schema.Types.Mixed],
        isCustom: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true }
      }
    ],
    sectionOrder: [{ type: String }]
  },
  { timestamps: true }
);

export const Portfolio = mongoose.model<IPortfolio>('Portfolio', portfolioSchema);

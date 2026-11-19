import mongoose, { Document, Schema } from 'mongoose';

export interface ICoverLetterRecipient {
  name: string;
  company: string;
  address: string;
}

export interface ICoverLetter extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  resumeId?: mongoose.Types.ObjectId | null;
  recipient: ICoverLetterRecipient;
  jobTitle: string;
  jobDescription?: string;
  date: string;
  greeting: string;
  body: string;
  closing: string;
  templateId?: string;
  themeConfig?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const coverLetterSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: 'Resume',
      default: null
    },
    recipient: {
      name: { type: String, default: '' },
      company: { type: String, default: '' },
      address: { type: String, default: '' }
    },
    jobTitle: {
      type: String,
      default: ''
    },
    jobDescription: {
      type: String,
      default: ''
    },
    date: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10)
    },
    greeting: {
      type: String,
      default: 'Dear Hiring Manager,'
    },
    body: {
      type: String,
      default: ''
    },
    closing: {
      type: String,
      default: 'Sincerely,'
    },
    templateId: {
      type: String,
      default: 'modern'
    },
    themeConfig: {
      type: Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

export const CoverLetter = mongoose.model<ICoverLetter>('CoverLetter', coverLetterSchema);

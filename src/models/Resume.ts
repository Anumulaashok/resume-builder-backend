import mongoose, { Document, Schema } from 'mongoose';

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  summary?: string;
  content: {
    basics: {
      name: string;
      label?: string;
      email: string;
      phone?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  summary: String,
  content: {
    basics: {
      name: { type: String, required: true },
      label: String,
      email: { type: String, required: true },
      phone: String,
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
  }
}, { timestamps: true });

export const Resume = mongoose.model<IResume>('Resume', resumeSchema);

import mongoose, { Document, Schema } from 'mongoose';

export const APPLICATION_STATUSES = [
  'wishlist',
  'applied',
  'interview',
  'offer',
  'rejected'
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface IApplicationContact {
  name: string;
  email?: string;
  role?: string;
}

export interface IStageHistoryEntry {
  status: ApplicationStatus;
  changedAt: Date;
}

export interface IJobApplication extends Document {
  userId: mongoose.Types.ObjectId;
  company: string;
  role: string;
  location?: string;
  url?: string;
  status: ApplicationStatus;
  order: number;
  appliedAt?: Date | null;
  reachedInterviewAt?: Date | null;
  stageHistory: IStageHistoryEntry[];
  salary?: string;
  notes?: string;
  resumeId?: mongoose.Types.ObjectId | null;
  coverLetterId?: mongoose.Types.ObjectId | null;
  jobDescription?: string;
  contacts: IApplicationContact[];
  nextActionAt?: Date | null;
  nextActionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const applicationContactSchema = new Schema<IApplicationContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, trim: true, default: '', maxlength: 320 },
    role: { type: String, trim: true, default: '', maxlength: 200 }
  },
  { _id: false }
);

const stageHistoryEntrySchema = new Schema<IStageHistoryEntry>(
  {
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      required: true
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { _id: false }
);

const jobApplicationSchema = new Schema<IJobApplication>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    role: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    location: {
      type: String,
      trim: true,
      maxlength: 200
    },
    url: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'wishlist',
      required: true,
      index: true
    },
    order: {
      type: Number,
      default: 0,
      required: true
    },
    appliedAt: {
      type: Date,
      default: null
    },
    reachedInterviewAt: {
      type: Date,
      default: null
    },
    stageHistory: {
      type: [stageHistoryEntrySchema],
      default: []
    },
    salary: {
      type: String,
      trim: true,
      maxlength: 200
    },
    notes: {
      type: String,
      maxlength: 10000
    },
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: 'Resume',
      default: null
    },
    coverLetterId: {
      type: Schema.Types.ObjectId,
      default: null
    },
    jobDescription: {
      type: String,
      maxlength: 20000
    },
    contacts: {
      type: [applicationContactSchema],
      default: []
    },
    nextActionAt: {
      type: Date,
      default: null
    },
    nextActionNote: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  { timestamps: true }
);

jobApplicationSchema.index({ userId: 1, status: 1, order: 1 });

export const JobApplication = mongoose.model<IJobApplication>(
  'JobApplication',
  jobApplicationSchema
);

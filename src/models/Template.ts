import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface representing a document in MongoDB.
export interface ITemplate extends Document {
  name: string;
  description?: string; // Optional description
  structure: any; // Structure can be any object (flexible template definition)
  userId: mongoose.Schema.Types.ObjectId; // Reference to the User who owns the template
}

// Schema definition
const templateSchema: Schema<ITemplate> = new Schema({
  name: {
    type: String,
    required: true,
    trim: true, // Remove whitespace from name
  },
  description: {
    type: String,
    trim: true,
  },
  structure: {
    type: Schema.Types.Mixed, // Allows storing arbitrary object structures
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
    index: true, // Index userId for faster lookups
  },
}, {
  timestamps: true, // Add createdAt and updatedAt timestamps
});

// Model definition
const Template: Model<ITemplate> = mongoose.model<ITemplate>('Template', templateSchema);

export default Template;

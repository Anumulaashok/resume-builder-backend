// This file augments the Express Request type to include a user property.

// We need to import the actual User model type to use it in the augmentation.
// Adjust the path based on the actual location of your User model definition.
// Assuming User model exports an interface or type named IUser along with the model itself.
// If not, we might need to adjust the import or define a simpler type like { id: string }.
// Let's assume the User model file exports a type/interface for the document, e.g., IUser.
// If User.ts exports the Mongoose model directly, using typeof User might work or we define a simple type.
// For now, let's define a simple type. If compilation fails, we'll adjust.

// Import Mongoose types if needed, e.g., for ObjectId
import mongoose from 'mongoose';
import { IUser } from '../../models/User';
import { Request } from 'express';

// Define a simple User payload type for the request object
// This avoids direct dependency on the full Mongoose model in the global type declaration file
interface AuthenticatedUser {
  _id: mongoose.Schema.Types.ObjectId | string; // Use ObjectId or string depending on how you handle IDs
  // Include other fields you might attach, like email or name, if needed
  // name?: string;
  // email?: string;
}

declare global {
  namespace Express {
    interface Request {
      // Add the user property to the Request interface
      // It can hold the authenticated user's data (or null/undefined if not authenticated)
      user?: IUser;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// Adding this export statement ensures this file is treated as a module.
export {};

import mongoose from 'mongoose'; // Use import syntax

const connectDB = async (dbName?: string) => { // Add optional dbName parameter
  try {
    const baseUri = process.env.MONGO_URI || 'mongodb://localhost:27017/';
    const databaseName = dbName || 'resumeBuilder'; // Use provided dbName or default
    const mongoURI = `${baseUri}${databaseName}`;

    // Mongoose 6+ uses these options by default, no need to specify them explicitly
    await mongoose.connect(mongoURI);

    console.log(`MongoDB Connected to ${databaseName}...`);
  } catch (error: any) { // Add type annotation for error
    console.error(`MongoDB connection error to ${dbName || 'default DB'}:`, error.message);
    // Exit process with failure
    process.exit(1); // Exit process with failure
  }
};

export default connectDB; // Use export default syntax

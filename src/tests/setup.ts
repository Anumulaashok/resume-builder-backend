import mongoose from 'mongoose';
import connectDB from '../config/db'; // Adjust path if needed

// Run before all tests
beforeAll(async () => {
  // Connect to a dedicated test database
  await connectDB('resumeBuilderTest');
});

// Run after each test
afterEach(async () => {
  // Clear all collections in the test database
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Run after all tests
afterAll(async () => {
  // Close the database connection
  await mongoose.connection.close();
});

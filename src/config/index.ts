import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
  process.exit(1); // Exit the application if JWT_SECRET is not set
}

const config = {
  jwtSecret: jwtSecret,
  // Add other configuration variables here if needed
};

export default config;

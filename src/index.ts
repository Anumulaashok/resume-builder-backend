import dotenv from 'dotenv';
import app from './app';
import { connectDB } from './config/db.config';
import logger from './utils/logger';

// Load env vars
dotenv.config();

const PORT = process.env.PORT || 10000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { timestamp: new Date().toISOString() });
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`, { timestamp: new Date().toISOString() });
});

// Handle shutdown gracefully
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Connect to MongoDB
connectDB().catch(err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

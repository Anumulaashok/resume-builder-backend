import dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './config/db.config';
import logger from './utils/logger';
import { handleGracefulShutdown } from './utils/shutdown';

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, { timestamp: new Date().toISOString() });
      logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`, { timestamp: new Date().toISOString() });
    });

    handleGracefulShutdown(server);

    // Add graceful shutdown handling
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received. Closing HTTP server...');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received. Closing HTTP server...');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

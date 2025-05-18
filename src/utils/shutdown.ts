import { Server } from 'http';
import mongoose from 'mongoose';
import  logger  from './logger';

export const handleGracefulShutdown = (server: Server) => {
    const shutdown = async () => {
        logger.info('Received shutdown signal');
        
        // Close the HTTP server
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // Close MongoDB connection
        try {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed');
        } catch (err) {
            logger.error('Error closing MongoDB connection:', err);
        }

        // Exit process
        process.exit(0);
    };

    // Handle different signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught Exception:', err);
        shutdown();
    });
    process.on('unhandledRejection', (err) => {
        logger.error('Unhandled Rejection:', err);
        shutdown();
    });
};

// Core/Node modules
import { Server } from 'http';
import dotenv from 'dotenv';

// Third-party modules
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';

// Local imports - configurations
import { swaggerSpec } from './config/swagger';
import { connectDB } from './config/db.config';

// Local imports - routes
import authRoutes from './routes/authRoutes';
import resumeRoutes from './routes/resumeRoutes';
import portfolioRoutes from './routes/portfolioRoutes';
import { getPublicPortfolio } from './controllers/portfolioController';
import { asyncHandler } from './utils/asyncHandler';
import path from 'path';

// Local imports - middleware
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter, publicPortfolioLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';

// Local imports - utils
import logger from './utils/logger';

// Load environment variables
dotenv.config();

class App {
    private readonly app: Application;
    private server: Server | null = null;

    constructor() {
        this.app = express();
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }

    private configureMiddleware(): void {
        this.app.set('trust proxy', 1);
        this.app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
        this.app.use(cors());
        this.app.use(morgan('dev'));
        this.app.use(express.json());
        this.app.use(requestLogger);
        this.app.use(apiLimiter);
        this.app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
    }

    private configureRoutes(): void {
        // API Routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/resumes', resumeRoutes);
        this.app.use('/api/portfolios', portfolioRoutes);

        // Direct public slug route for published portfolios
        this.app.get('/p/:slug', publicPortfolioLimiter, asyncHandler(getPublicPortfolio));

        // Health Check
        this.app.get('/health', (_req, res) => {
            res.status(200).json({ status: 'ok' });
        });

        // Swagger Documentation
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }

    private configureErrorHandling(): void {
        this.app.use(notFound);
        this.app.use(errorHandler);
    }

    public async start(): Promise<void> {
        try {
            await connectDB();
            const PORT = process.env.PORT || 10000;

            this.server = this.app.listen(PORT, () => {
                logger.info(`Server running on port ${PORT}`);
                logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
            });

            this.handleServerErrors();
            this.setupProcessHandlers();

        } catch (error) {
            logger.error('Startup error:', error);
            process.exit(1);
        }
    }

    private handleServerErrors(): void {
        this.server?.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                const port = process.env.PORT || 10000;
                logger.error(`Port ${port} is already in use`);
                process.exit(1);
            }
            logger.error('Server error:', err);
        });
    }

    private setupProcessHandlers(): void {
        process.on('uncaughtException', (err: Error) => this.handleUncaughtException(err));
        process.on('unhandledRejection', (err: Error) => this.handleUnhandledRejection(err));
        process.on('SIGTERM', () => this.handleGracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.handleGracefulShutdown('SIGINT'));
    }

    private async handleGracefulShutdown(signal: string): Promise<void> {
        try {
            logger.info(`Received ${signal}. Shutting down gracefully...`);
            if (this.server) {
                await new Promise<void>((resolve) => {
                    this.server?.close(() => resolve());
                });
                this.server = null;
                logger.info('Server shut down successfully');
            }
            await mongoose.connection.close();
            process.exit(0);
        } catch (error) {
            logger.error(`Error during ${signal} shutdown:`, error);
            process.exit(1);
        }
    }

    private handleUncaughtException(err: Error): void {
        logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
        logger.error(err.name, err.message);
        process.exit(1);
    }

    private async handleUnhandledRejection(err: Error): Promise<void> {
        logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
        logger.error(err.name, err.message);
        await this.handleGracefulShutdown('UNHANDLED REJECTION');
    }

    public getApp(): Application {
        return this.app;
    }
}

// Initialize and start the application
const appInstance = new App();
if (process.env.NODE_ENV !== 'test') {
    appInstance.start();
}

export default appInstance.getApp();


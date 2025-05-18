import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import authRoutes from './routes/authRoutes';
import resumeRoutes from './routes/resumeRoutes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import rateLimit from 'express-rate-limit';

// Uncaught exception handler
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message, err.stack);
    process.exit(1);
});

const app = express();

// Enable trust proxy
app.set('trust proxy', 1);

// Configure rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { 
        status: 'error',
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(apiLimiter);
app.use(requestLogger);

// Apply rate limiter to auth routes only
app.use('/api/auth', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/started', (_req, res) => {
    res.json({ message: 'App started' });
});
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
// Error Handling
app.use(notFound);
app.use(errorHandler);

const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

// Unhandled rejection handler
process.on('unhandledRejection', (err: Error) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

export default app;

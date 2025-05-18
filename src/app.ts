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

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(apiLimiter);

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

export default app;

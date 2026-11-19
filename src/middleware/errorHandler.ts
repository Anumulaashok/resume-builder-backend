import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';

interface ExtendedError extends Error {
  statusCode?: number;
  status?: string;
  code?: number;
  errors?: Record<string, { message: string }>;
}

export const errorHandler = (
  err: ExtendedError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`Error occurred during ${req.method} ${req.originalUrl}:`, err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  }

  if (err.name === 'CastError') {
    return res.status(404).json({ success: false, status: 'fail', message: 'Resource not found' });
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {}).map((e) => e.message).join(', ') || err.message;
    return res.status(400).json({ success: false, status: 'fail', message });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      status: 'fail',
      message: 'Duplicate field value',
    });
  }

  logger.error(err);

  res.status(500).json({
    success: false,
    status: 'error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Something went wrong',
  });
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Not found - ${req.originalUrl}`, 404));
};

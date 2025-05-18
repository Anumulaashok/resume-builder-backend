import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';

interface ExtendedError extends Error {
  statusCode?: number;
  status?: string;
  code?: number;
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
      status: err.status,
      message: err.message,
    });
  }

  // Handle Mongoose validation errors
  if (err.code === 11000) {
    return res.status(400).json({
      status: 'fail',
      message: 'Duplicate field value',
    });
  }

  logger.error(err);

  res.status(500).json({
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

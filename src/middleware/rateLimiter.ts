import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicPortfolioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per 15 minutes
  message: {
    status: 'error',
    message: 'Too many requests for public portfolios from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many requests for shared resume. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});


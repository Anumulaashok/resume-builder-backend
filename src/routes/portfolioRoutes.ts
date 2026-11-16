import express from 'express';
import { protect } from '../middleware/auth';
import { publicPortfolioLimiter } from '../middleware/rateLimiter';
import { handleUpload } from '../middleware/upload';
import {
  createPortfolio,
  getPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
  getPublicPortfolio,
  uploadPortfolioMedia
} from '../controllers/portfolioController';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// Unauthenticated public route for viewing published portfolios via slug
router.get('/public/:slug', publicPortfolioLimiter, asyncHandler(getPublicPortfolio));

// Protected routes below
router.use(protect);

// Media upload for portfolio projects
router.post('/upload', handleUpload(), asyncHandler(uploadPortfolioMedia));

// CRUD routes
router.route('/')
  .get(asyncHandler(getPortfolios))
  .post(asyncHandler(createPortfolio));

router.route('/:portfolioId')
  .get(asyncHandler(getPortfolioById))
  .put(asyncHandler(updatePortfolio))
  .patch(asyncHandler(updatePortfolio))
  .delete(asyncHandler(deletePortfolio));

export default router;

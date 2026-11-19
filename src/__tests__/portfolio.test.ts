import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Portfolio } from '../models/Portfolio';
import portfolioRoutes from '../routes/portfolioRoutes';
import { getPublicPortfolio } from '../controllers/portfolioController';
import { publicPortfolioLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { errorHandler } from '../middleware/errorHandler';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

// Mock auth middleware to easily simulate authenticated users in tests
jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com'
    };
    next();
  }
}));

describe('Portfolio API', () => {
  let app: Express;
  const mockUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const mockPortfolioId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/portfolios', portfolioRoutes);
    app.get('/p/:slug', publicPortfolioLimiter, asyncHandler(getPublicPortfolio));
    app.use(errorHandler);
  });

  describe('Unauthenticated Public Routes: GET /api/portfolios/public/:slug and GET /p/:slug', () => {
    it('should return 200 and portfolio data when accessing vanity URL /p/:slug', async () => {
      const mockPublishedPortfolio = {
        _id: mockPortfolioId,
        title: 'Ashok Portfolio',
        slug: 'ashok-portfolio',
        isPublished: true,
        themeConfig: { theme: 'modern', primaryColor: '#3B82F6', layout: 'standard' },
        basics: {
          name: 'Ashok Anumula',
          title: 'Full Stack Engineer',
          email: 'ashok@example.com',
          bio: 'Building awesome web apps'
        },
        sections: [],
        sectionOrder: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(Portfolio, 'findOne').mockResolvedValue(mockPublishedPortfolio as any);

      const response = await request(app)
        .get('/p/ashok-portfolio')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.slug).toBe('ashok-portfolio');
      expect(response.body.data.title).toBe('Ashok Portfolio');
    });
    it('should return 200 and portfolio data when portfolio exists and is published', async () => {
      const mockPublishedPortfolio = {
        _id: mockPortfolioId,
        title: 'Ashok Portfolio',
        slug: 'ashok-portfolio',
        isPublished: true,
        themeConfig: { theme: 'modern', primaryColor: '#3B82F6', layout: 'standard' },
        basics: {
          name: 'Ashok Anumula',
          title: 'Full Stack Engineer',
          email: 'ashok@example.com',
          bio: 'Building awesome web apps'
        },
        sections: [
          {
            id: 'projects',
            type: 'projects',
            title: 'Featured Projects',
            content: [{ id: 'p1', title: 'Resume Builder', description: 'Web app' }]
          }
        ],
        sectionOrder: ['projects'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(Portfolio, 'findOne').mockResolvedValue(mockPublishedPortfolio as any);

      const response = await request(app)
        .get('/api/portfolios/public/ashok-portfolio')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.slug).toBe('ashok-portfolio');
      expect(response.body.data.title).toBe('Ashok Portfolio');
      expect(response.body.data.isPublished).toBe(true);
      expect(Portfolio.findOne).toHaveBeenCalledWith({
        slug: 'ashok-portfolio',
        isPublished: true
      });
    });

    it('should return 404 when portfolio is not published or does not exist', async () => {
      jest.spyOn(Portfolio, 'findOne').mockResolvedValue(null);

      const response = await request(app)
        .get('/api/portfolios/public/unpublished-slug')
        .expect(404);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/not found or is not currently published/i);
    });
  });

  describe('Media Upload: POST /api/portfolios/upload', () => {
    it('should reject unsupported media types (e.g. text/plain or application/pdf)', async () => {
      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', Buffer.from('plain text content'), 'document.txt')
        .expect(400);

      expect(response.body.message).toMatch(/only jpeg, png, and webp/i);
    });

    it('should accept supported image types (JPEG, PNG, WebP)', async () => {
      // Small 1x1 valid PNG buffer
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', pngBuffer, 'test-image.png')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.url).toMatch(/^\/uploads\/portfolio-/);
      expect(response.body.filename).toBeDefined();
    });

    it('should reject files exceeding the 5MB size limit', async () => {
      // 5MB + 10KB buffer
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10 * 1024);

      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', oversizedBuffer, 'oversized.png')
        .expect(400);

      expect(response.body.message).toMatch(/too large|5mb/i);
    });
  });

  describe('Portfolio CRUD Management', () => {
    it('POST /api/portfolios should create a new portfolio and enforce vanity slug uniqueness', async () => {
      const newPortfolioData = {
        title: 'New Creative Portfolio',
        slug: 'creative-portfolio',
        basics: { name: 'Jane Doe' }
      };

      // First test: slug already exists
      jest.spyOn(Portfolio, 'findOne').mockResolvedValueOnce({ _id: 'other-id' } as any);

      const conflictResponse = await request(app)
        .post('/api/portfolios')
        .send(newPortfolioData)
        .expect(400);

      expect(conflictResponse.body.message).toMatch(/already in use/i);

      // Second test: slug is unique and creation succeeds
      jest.spyOn(Portfolio, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Portfolio, 'create').mockResolvedValue({
        _id: mockPortfolioId,
        userId: mockUserId,
        title: 'New Creative Portfolio',
        slug: 'creative-portfolio',
        isPublished: false,
        basics: { name: 'Jane Doe' },
        sections: [],
        sectionOrder: []
      } as any);

      const createResponse = await request(app)
        .post('/api/portfolios')
        .send(newPortfolioData)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.title).toBe('New Creative Portfolio');
    });

    it('GET /api/portfolios should return list of portfolios for authenticated user', async () => {
      const mockPortfolios = [
        { _id: mockPortfolioId, title: 'Portfolio 1', slug: 'p1', userId: mockUserId }
      ];

      jest.spyOn(Portfolio, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockPortfolios)
      } as any);

      const response = await request(app)
        .get('/api/portfolios')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].title).toBe('Portfolio 1');
    });

    it('PUT /api/portfolios/:portfolioId should update portfolio content and publish status', async () => {
      const mockPortfolioInstance = {
        _id: mockPortfolioId,
        userId: mockUserId,
        title: 'Old Title',
        slug: 'my-slug',
        isPublished: false,
        save: jest.fn().mockResolvedValue({
          _id: mockPortfolioId,
          userId: mockUserId,
          title: 'Updated Title',
          slug: 'my-slug',
          isPublished: true
        })
      };

      jest.spyOn(Portfolio, 'findOne').mockResolvedValue(mockPortfolioInstance as any);

      const response = await request(app)
        .put(`/api/portfolios/${mockPortfolioId}`)
        .send({
          title: 'Updated Title',
          isPublished: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.isPublished).toBe(true);
    });

    it('DELETE /api/portfolios/:portfolioId should delete portfolio record', async () => {
      jest.spyOn(Portfolio, 'findOneAndDelete').mockResolvedValue({ _id: mockPortfolioId } as any);

      const response = await request(app)
        .delete(`/api/portfolios/${mockPortfolioId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Portfolio.findOneAndDelete).toHaveBeenCalledWith({
        _id: mockPortfolioId.toString(),
        userId: mockUserId
      });
    });
  });
});

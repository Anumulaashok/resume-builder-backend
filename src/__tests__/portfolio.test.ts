import fs from 'fs';
import path from 'path';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { put } from '@vercel/blob';
import { Portfolio } from '../models/Portfolio';
import portfolioRoutes from '../routes/portfolioRoutes';
import { getPublicPortfolio } from '../controllers/portfolioController';
import { publicPortfolioLimiter } from '../middleware/rateLimiter';
import { uploadsDir } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import { errorHandler } from '../middleware/errorHandler';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

jest.mock('@vercel/blob', () => ({
  put: jest.fn()
}));

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
    const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const createdDiskFiles: string[] = [];
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    beforeEach(() => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    });

    afterEach(() => {
      if (originalBlobToken === undefined) {
        delete process.env.BLOB_READ_WRITE_TOKEN;
      } else {
        process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
      }

      while (createdDiskFiles.length > 0) {
        const filePath = createdDiskFiles.pop()!;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it('should reject unsupported media types (e.g. text/plain or application/pdf)', async () => {
      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', Buffer.from('plain text content'), 'document.txt')
        .expect(400);

      expect(response.body.message).toMatch(/only jpeg, png, and webp/i);
      expect(put).not.toHaveBeenCalled();
    });

    it('should accept supported image types (JPEG, PNG, WebP) and return /uploads path when BLOB_READ_WRITE_TOKEN is not set', async () => {
      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', pngBuffer, 'test-image.png')
        .expect(201);

      createdDiskFiles.push(path.join(uploadsDir, response.body.filename));

      expect(put).not.toHaveBeenCalled();
      expect(response.body.success).toBe(true);
      expect(response.body.url).toMatch(/^\/uploads\/portfolio-.*\.png$/);
      expect(response.body.filename).toMatch(/^portfolio-.*\.png$/);
      expect(response.body.mimetype).toBe('image/png');
      expect(response.body.size).toBe(pngBuffer.length);
      expect(fs.existsSync(path.join(uploadsDir, response.body.filename))).toBe(true);
    });

    it('should upload buffer via @vercel/blob put() and return the public blob URL when BLOB_READ_WRITE_TOKEN is set', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_token';
      const mockedBlobUrl = 'https://test-store.public.blob.vercel-storage.com/portfolio-12345.png';
      (put as jest.Mock).mockResolvedValue({
        url: mockedBlobUrl,
        downloadUrl: `${mockedBlobUrl}?download=1`,
        pathname: 'portfolio-12345.png',
        contentType: 'image/png',
        contentDisposition: 'inline; filename="portfolio-12345.png"'
      });

      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', pngBuffer, 'test-image.png')
        .expect(201);

      expect(put).toHaveBeenCalledTimes(1);
      const [calledPathname, calledBuffer, calledOptions] = (put as jest.Mock).mock.calls[0];
      expect(calledPathname).toMatch(/^portfolio-.*\.png$/);
      expect(Buffer.isBuffer(calledBuffer)).toBe(true);
      expect((calledBuffer as Buffer).equals(pngBuffer)).toBe(true);
      expect(calledOptions).toEqual({
        access: 'public',
        contentType: 'image/png',
        token: 'vercel_blob_rw_test_token'
      });

      expect(response.body).toEqual({
        success: true,
        url: mockedBlobUrl,
        filename: calledPathname,
        mimetype: 'image/png',
        size: pngBuffer.length
      });
      expect(fs.existsSync(path.join(uploadsDir, response.body.filename))).toBe(false);
    });

    it('should enforce file type and 5MB size validation when BLOB_READ_WRITE_TOKEN is set without calling put()', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_token';

      const invalidTypeRes = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', Buffer.from('plain text content'), 'document.txt')
        .expect(400);
      expect(invalidTypeRes.body.message).toMatch(/only jpeg, png, and webp/i);

      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10 * 1024);
      const oversizedRes = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', oversizedBuffer, 'oversized.png')
        .expect(400);
      expect(oversizedRes.body.message).toMatch(/too large|5mb/i);

      expect(put).not.toHaveBeenCalled();
    });

    it('should reject files exceeding the 5MB size limit', async () => {
      // 5MB + 10KB buffer
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10 * 1024);

      const response = await request(app)
        .post('/api/portfolios/upload')
        .attach('file', oversizedBuffer, 'oversized.png')
        .expect(400);

      expect(response.body.message).toMatch(/too large|5mb/i);
      expect(put).not.toHaveBeenCalled();
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

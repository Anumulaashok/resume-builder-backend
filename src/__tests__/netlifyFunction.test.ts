import { handler } from '../../netlify/functions/api';
import { Portfolio } from '../models/Portfolio';

jest.mock('../config/db.config', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined)
}));

describe('Netlify Functions Serverless Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process /health endpoint via Netlify function', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/health',
      headers: {}
    };
    const context = { callbackWaitsForEmptyEventLoop: true };

    const result: any = await handler(event, context);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 'ok' });
    expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  it('should handle /api/* redirected routes correctly', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/portfolios/public/ashok-slug',
      headers: {}
    };

    const mockPortfolio = {
      _id: '507f1f77bcf86cd799439022',
      title: 'Ashok Portfolio',
      slug: 'ashok-slug',
      isPublished: true,
      basics: { name: 'Ashok' },
      sections: [],
      sectionOrder: []
    };
    jest.spyOn(Portfolio, 'findOne').mockResolvedValue(mockPortfolio as any);

    const result: any = await handler(event, {});
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('ashok-slug');
  });

  it('should handle vanity /p/:slug route via Netlify function', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/p/jane-portfolio',
      headers: {}
    };

    const mockPortfolio = {
      _id: '507f1f77bcf86cd799439033',
      title: 'Jane Portfolio',
      slug: 'jane-portfolio',
      isPublished: true,
      basics: { name: 'Jane' },
      sections: [],
      sectionOrder: []
    };
    jest.spyOn(Portfolio, 'findOne').mockResolvedValue(mockPortfolio as any);

    const result: any = await handler(event, {});
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('jane-portfolio');
  });
});

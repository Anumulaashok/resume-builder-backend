import { handler } from '../../netlify/functions/api';
import { Portfolio } from '../models/Portfolio';
import { Resume } from '../models/Resume';

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

  it('should return uncorrupted base64-encoded binary buffers for PDF and DOCX exports', async () => {
    const mockResume = {
      _id: '507f1f77bcf86cd799439044',
      title: 'Netlify Binary Export Resume',
      templateId: 'modern',
      sharing: {
        isPublic: true,
        shareToken: 'netlify-share-token-1',
        privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
      },
      content: {
        basics: {
          name: 'Maya Lin',
          label: 'Staff Engineer',
          email: 'maya@example.com'
        },
        sections: [],
        sectionOrder: []
      }
    };

    jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResume as any);

    const pdfResult: any = await handler(
      {
        httpMethod: 'GET',
        path: '/.netlify/functions/api/resumes/share/netlify-share-token-1/export.pdf',
        headers: {}
      },
      {}
    );
    expect(pdfResult.statusCode).toBe(200);
    expect(pdfResult.isBase64Encoded).toBe(true);
    const pdfBytes = Buffer.from(pdfResult.body, 'base64');
    expect(pdfBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const docxResult: any = await handler(
      {
        httpMethod: 'GET',
        path: '/.netlify/functions/api/resumes/share/netlify-share-token-1/export.docx',
        headers: {}
      },
      {}
    );
    expect(docxResult.statusCode).toBe(200);
    expect(docxResult.isBase64Encoded).toBe(true);
    const docxBytes = Buffer.from(docxResult.body, 'base64');
    expect(docxBytes.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

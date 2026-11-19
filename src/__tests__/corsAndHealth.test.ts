import request from 'supertest';
import app from '../app';

describe('Health Check, Swagger UI, and CORS Configuration', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.CORS_ORIGIN = originalCorsOrigin;
  });

  describe('GET /health', () => {
    it('should return 200 OK with status "ok"', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api-docs', () => {
    it('should serve Swagger UI documentation at /api-docs', async () => {
      const response = await request(app)
        .get('/api-docs/')
        .expect(200);

      expect(response.text).toContain('Swagger UI');
    });
  });

  describe('CORS and Helmet Headers', () => {
    it('should include Cross-Origin-Resource-Policy header for static assets and endpoints', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('should allow Netlify domains by default with credentials', async () => {
      const netlifyOrigin = 'https://preview-123--my-resume-builder.netlify.app';
      const response = await request(app)
        .get('/health')
        .set('Origin', netlifyOrigin)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(netlifyOrigin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow comma-separated origins specified in CORS_ORIGIN', async () => {
      process.env.CORS_ORIGIN = 'https://example.com, https://app.example.com';
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://app.example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should reject unlisted origins when CORS_ORIGIN is restricted', async () => {
      process.env.CORS_ORIGIN = 'https://allowed.com';
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://malicious.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should handle preflight OPTIONS requests cleanly', async () => {
      const netlifyOrigin = 'https://my-portfolio.netlify.app';
      const response = await request(app)
        .options('/api/portfolios')
        .set('Origin', netlifyOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(netlifyOrigin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});

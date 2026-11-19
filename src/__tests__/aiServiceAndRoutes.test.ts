import express from 'express';
import request from 'supertest';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';
import * as aiService from '../services/aiService';

let currentMockUser: any = {
  _id: 'user-default',
  name: 'Ada Lovelace',
  email: 'ada@example.com'
};

jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = currentMockUser;
    next();
  }
}));

describe('Multi-Provider LLM Service & AI Resume Routes', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      AI_MAX_RETRIES: '1',
      AI_RETRY_DELAY_MS: '0',
      AI_TIMEOUT_MS: '2000'
    };
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_URL;
    delete process.env.LLAMA_API_URL;
    delete process.env.LLAMA_API_KEY;
    delete process.env.AI_API_URL;
    delete process.env.AI_API_KEY;

    currentMockUser = {
      _id: `user-${Math.random().toString(36).slice(2)}`,
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('aiService multi-provider protocol & failover', () => {
    const validGeneratedPayload = {
      title: 'Staff Distributed Systems Engineer',
      summary: 'Engineered fault-tolerant cloud services at scale.',
      content: {
        basics: {
          name: '',
          label: 'Staff Distributed Systems Engineer',
          email: ''
        },
        sections: [
          {
            id: 'work-1',
            type: 'WorkItem',
            title: 'Professional Experience',
            content: [
              {
                id: 'w-1',
                name: 'CloudScale',
                position: 'Staff Engineer',
                description: 'Built distributed consensus engine.'
              }
            ]
          }
        ],
        sectionOrder: ['work-1']
      }
    };

    it('rejects with 503 graceful error instead of mock placeholder when no LLM provider is configured', async () => {
      await expect(
        aiService.analyzeResumePrompt('Backend engineer with Go experience')
      ).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringMatching(/no LLM provider is configured/i)
      });
    });

    it('communicates with OpenAI using standard Chat Completions JSON payload and masks PII', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(validGeneratedPayload)
              }
            }
          ]
        })
      });
      global.fetch = fetchMock as any;

      const result = await aiService.analyzeResumePrompt(
        'Contact me at secret@personal.org or 415-555-0199. Distributed systems engineer.'
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test-openai'
      });

      const sentBody = JSON.parse(init.body);
      expect(sentBody.model).toBe('gpt-4o-mini');
      expect(sentBody.response_format).toEqual({ type: 'json_object' });
      const userMsg = sentBody.messages.find((m: any) => m.role === 'user').content;
      expect(userMsg).not.toContain('secret@personal.org');
      expect(userMsg).not.toContain('415-555-0199');
      expect(userMsg).toContain('[EMAIL]');
      expect(userMsg).toContain('[PHONE]');

      expect(result.title).toBe('Staff Distributed Systems Engineer');
      expect(result.summary).not.toContain('[AI placeholder]');
    });

    it('communicates with Anthropic using standard Messages API JSON payload', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify(validGeneratedPayload) }]
        })
      });
      global.fetch = fetchMock as any;

      const result = await aiService.analyzeResumePrompt('Backend engineer');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-api-key': 'sk-ant-test',
        'anthropic-version': '2023-06-01'
      });
      const sentBody = JSON.parse(init.body);
      expect(sentBody.system).toEqual(expect.any(String));
      expect(sentBody.messages).toEqual([{ role: 'user', content: 'Backend engineer' }]);
      expect(result.summary).toBe('Engineered fault-tolerant cloud services at scale.');
    });

    it('communicates with Gemini using standard generateContent JSON payload', async () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'gemini-test-key';

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: `\`\`\`json\n${JSON.stringify(validGeneratedPayload)}\n\`\`\`` }]
              }
            }
          ]
        })
      });
      global.fetch = fetchMock as any;

      const result = await aiService.analyzeResumePrompt('Cloud architect');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(init.headers['x-goog-api-key']).toBe('gemini-test-key');
      const sentBody = JSON.parse(init.body);
      expect(sentBody.contents[0].parts[0].text).toBe('Cloud architect');
      expect(result.title).toBe('Staff Distributed Systems Engineer');
    });

    it('fails over to secondary configured provider when primary provider returns 500, and returns graceful 502 when all fail', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-broken-openai';
      process.env.ANTHROPIC_API_KEY = 'sk-backup-anthropic';

      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal OpenAI failure' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: JSON.stringify(validGeneratedPayload) }]
          })
        });
      global.fetch = fetchMock as any;

      const failoverResult = await aiService.analyzeResumePrompt('Platform engineer');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(failoverResult.title).toBe('Staff Distributed Systems Engineer');

      // Now simulate all providers failing -> graceful 502 message
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503
      }) as any;

      await expect(aiService.analyzeResumePrompt('Platform engineer')).rejects.toMatchObject({
        statusCode: 502,
        message: 'AI service is temporarily unavailable. Please try again in a moment.'
      });
    });
  });

  describe('Express Routes: /api/resumes/generate, /optimize-bullet, /generate-summary, validation, sanitization & rate limit', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/resumes', resumeRoutes);
      app.use(errorHandler);
    });

    it('POST /api/resumes/generate creates a new resume document when no existing resume exists for the user and sanitizes XSS output', async () => {
      jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);
      const createSpy = jest
        .spyOn(Resume, 'create')
        .mockImplementation(async (doc: any) => ({ _id: 'new-res-999', ...doc } as any));

      jest.spyOn(aiService, 'analyzeResumePrompt').mockResolvedValue({
        title: 'Full Stack Lead <script>alert("xss")</script>',
        summary: 'Delivered resilient APIs <b>at scale</b>.',
        content: {
          basics: {
            name: '[NAME]',
            email: '[EMAIL]',
            label: 'Full Stack Lead'
          },
          sections: [
            {
              id: 'work-1',
              type: 'WorkItem',
              title: 'Experience',
              content: [
                {
                  id: 'w-1',
                  name: 'Acme',
                  position: 'Lead Engineer',
                  description: 'Reduced latency by 40% <img src=x onerror=alert(1)>',
                  $where: 'malicious'
                }
              ]
            }
          ],
          sectionOrder: ['work-1']
        }
      });

      const res = await request(app)
        .post('/api/resumes/generate')
        .send({ prompt: 'Full Stack Lead with 8 years experience in Node.js and React' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(createSpy).toHaveBeenCalledTimes(1);

      const persistedArg: any = createSpy.mock.calls[0][0];
      expect(persistedArg.userId).toBe(currentMockUser._id);
      expect(persistedArg.title).toBe('Full Stack Lead');
      expect(persistedArg.summary).toBe('Delivered resilient APIs at scale.');
      // Masked placeholders fall back to authenticated user's name/email
      expect(persistedArg.content.basics.name).toBe('Ada Lovelace');
      expect(persistedArg.content.basics.email).toBe('ada@example.com');
      expect(persistedArg.content.sections[0].content[0].description).toBe(
        'Reduced latency by 40%'
      );
      expect(persistedArg.content.sections[0].content[0].$where).toBeUndefined();
    });

    it('POST /api/resumes/generate updates an existing resume and records revision history when one exists', async () => {
      const existingDoc: any = {
        _id: 'existing-res-1',
        userId: currentMockUser._id,
        title: 'Old Draft',
        summary: 'Old summary',
        content: {
          basics: { name: 'Ada Lovelace', email: 'ada@example.com' },
          sections: [],
          sectionOrder: []
        },
        history: [],
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        })
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(existingDoc);
      jest.spyOn(aiService, 'analyzeResumePrompt').mockResolvedValue({
        title: 'Principal Software Architect',
        summary: 'Architected cloud-native platforms.',
        content: {
          basics: { name: '', email: '', label: 'Principal Software Architect' },
          sections: [],
          sectionOrder: []
        }
      });

      const res = await request(app)
        .post('/api/resumes/generate')
        .send({ prompt: 'Principal Software Architect' });

      expect(res.status).toBe(200);
      expect(existingDoc.save).toHaveBeenCalledTimes(1);
      expect(existingDoc.history).toHaveLength(1);
      expect(existingDoc.title).toBe('Principal Software Architect');
      expect(existingDoc.content.basics.name).toBe('Ada Lovelace');
      expect(existingDoc.content.basics.email).toBe('ada@example.com');
    });

    it('POST /api/resumes/optimize-bullet returns 3 refined sanitized bullet variations', async () => {
      process.env.LLAMA_API_URL = 'http://mock-llm.local/v1/chat';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    '• Engineered high-throughput payment microservices handling 12K RPS with 99.99% uptime',
                    '- Optimized PostgreSQL query execution plans, cutting p95 API latency by 42% <script>bad()</script>',
                    '* Spearheaded automated CI/CD pipelines across 8 engineering squads, halving deployment lead time'
                  ]
                })
              }
            }
          ]
        })
      }) as any;

      const res = await request(app).post('/api/resumes/optimize-bullet').send({
        bullet: 'Worked on backend payment APIs and database queries',
        role: 'Senior Backend Engineer'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.suggestions).toHaveLength(3);
      expect(res.body.data.suggestions[0]).toMatch(/^Engineered high-throughput/);
      expect(res.body.data.suggestions[1]).not.toContain('<script>');
    });

    it('POST /api/resumes/generate-summary generates tailored summaries from role and highlights', async () => {
      process.env.LLAMA_API_URL = 'http://mock-llm.local/v1/chat';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary:
                    'Results-driven Frontend Architect with 7+ years building accessible React design systems.',
                  suggestions: [
                    'Results-driven Frontend Architect with 7+ years building accessible React design systems.',
                    'Senior UI Engineer specializing in TypeScript, performance optimization, and scalable web apps.',
                    'Product-minded Frontend Lead delivering high-conversion SaaS experiences.'
                  ]
                })
              }
            }
          ]
        })
      }) as any;

      const res = await request(app).post('/api/resumes/generate-summary').send({
        targetRole: 'Frontend Architect',
        prompt: '7 years React, TypeScript, design systems, web performance'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toContain('Frontend Architect');
      expect(res.body.data.suggestions).toHaveLength(3);
    });

    it('rejects prompts exceeding 2000 characters with 400 Bad Request across AI routes', async () => {
      const oversized = 'a'.repeat(2001);

      const genRes = await request(app)
        .post('/api/resumes/generate')
        .send({ prompt: oversized });
      expect(genRes.status).toBe(400);
      expect(genRes.body.message).toMatch(/2000 characters/i);

      const bulletRes = await request(app)
        .post('/api/resumes/optimize-bullet')
        .send({ bullet: oversized });
      expect(bulletRes.status).toBe(400);

      const summaryRes = await request(app)
        .post('/api/resumes/generate-summary')
        .send({ prompt: oversized });
      expect(summaryRes.status).toBe(400);
    });

    it('enforces a rate limit of 10 AI generation requests per minute per user', async () => {
      currentMockUser = {
        _id: 'rate-limited-user-1',
        name: 'Rate User',
        email: 'rate1@example.com'
      };

      jest.spyOn(aiService, 'optimizeBulletPoints').mockResolvedValue({
        suggestions: ['Refined 1', 'Refined 2', 'Refined 3']
      });

      for (let i = 0; i < 10; i++) {
        const okRes = await request(app)
          .post('/api/resumes/optimize-bullet')
          .send({ bullet: `Bullet iteration ${i}` });
        expect(okRes.status).toBe(200);
      }

      // 11th request within 1 minute for same user is rejected with 429
      const blockedRes = await request(app)
        .post('/api/resumes/optimize-bullet')
        .send({ bullet: 'Bullet iteration 11' });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.message).toMatch(/10 requests per minute/i);

      // Different user has an independent bucket and succeeds
      currentMockUser = {
        _id: 'rate-limited-user-2',
        name: 'Second User',
        email: 'rate2@example.com'
      };
      const otherUserRes = await request(app)
        .post('/api/resumes/optimize-bullet')
        .send({ bullet: 'Other user bullet' });
      expect(otherUserRes.status).toBe(200);
    });
  });
});

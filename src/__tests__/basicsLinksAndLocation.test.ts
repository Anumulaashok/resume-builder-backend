import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import { analyzeResumePrompt } from '../services/aiService';
import { renderResumePlainText } from '../services/exportService';
import { SNAPSHOT_MIN_INTERVAL_MS } from '../utils/resumeHistory';

describe('Basics Links, Location, Privacy Redaction, History Idempotency & AI Extraction', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalLlamaUrl = process.env.LLAMA_API_URL;
  const originalFetch = global.fetch;
  const TEST_SECRET = 'test-basics-links-jwt-secret';
  const OWNER_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
    if (originalLlamaUrl === undefined) {
      delete process.env.LLAMA_API_URL;
    } else {
      process.env.LLAMA_API_URL = originalLlamaUrl;
    }
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.LLAMA_API_URL;
    global.fetch = originalFetch;
  });

  const issueAuthHeader = (userId = OWNER_ID.toString()) => {
    const token = jwt.sign({ id: userId }, TEST_SECRET, { expiresIn: '1h' });
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(userId),
        email: 'maya@example.com',
        name: 'Maya Lin',
      }),
    } as any);
    return `Bearer ${token}`;
  };

  const fullBasicsPayload = {
    title: 'Staff Frontend Resume',
    summary: 'Staff engineer focused on design systems and web performance.',
    templateId: 'modern',
    themeConfig: { primaryColor: '#2563eb', sectionSpacing: 'normal' },
    content: {
      basics: {
        name: 'Maya Lin',
        label: 'Staff Frontend Architect',
        email: 'maya@example.com',
        phone: '+1-415-555-0192',
        summary: 'Staff engineer focused on design systems and web performance.',
        url: 'https://mayalin.dev',
        linkedin: 'linkedin.com/in/mayalin',
        github: 'https://github.com/mayalin',
        location: {
          address: '742 Market Street, Suite 400',
          city: 'San Francisco',
          region: 'CA',
          countryCode: 'US',
          postalCode: '94103',
        },
        profiles: [
          {
            network: 'Dribbble',
            username: 'mayalin',
            url: 'https://dribbble.com/mayalin',
          },
          {
            network: 'X',
            username: 'mayalin_ui',
            url: 'x.com/mayalin_ui',
          },
        ],
      },
      sections: [
        {
          id: 'sec-work',
          type: 'WorkItem',
          title: 'Experience',
          content: [
            {
              id: 'w-1',
              company: 'Veloce Cloud',
              position: 'Staff Architect',
              description: 'Led cross-platform UI architecture.',
            },
          ],
        },
      ],
      sectionOrder: ['sec-work'],
    },
  };

  describe('POST /api/resumes & PUT/PATCH /api/resumes/:resumeId persistence (real Mongoose schema)', () => {
    it('persists and returns summary, full location (including region & postalCode), linkedin, github, url, and custom profiles on POST and PUT', async () => {
      const authHeader = issueAuthHeader();

      // Use real Mongoose Document instantiation + synchronous validation so strict-mode schema stripping is exercised directly
      let storedDoc: InstanceType<typeof Resume> | null = null;
      jest.spyOn(Resume, 'create').mockImplementation((async (docInput: any) => {
        const doc = new Resume(docInput);
        const err = doc.validateSync();
        if (err) throw err;
        jest.spyOn(doc, 'save').mockImplementation(async function (this: any) {
          const saveErr = this.validateSync();
          if (saveErr) throw saveErr;
          return this;
        });
        storedDoc = doc;
        return doc;
      }) as any);

      const postRes = await request(app)
        .post('/api/resumes')
        .set('Authorization', authHeader)
        .send(fullBasicsPayload);

      expect(postRes.status).toBe(201);
      expect(postRes.body.success).toBe(true);
      const created = postRes.body.data;
      expect(created.summary).toBe(fullBasicsPayload.summary);
      expect(created.content.basics.summary).toBe(fullBasicsPayload.content.basics.summary);
      expect(created.content.basics.url).toBe('https://mayalin.dev');
      expect(created.content.basics.linkedin).toBe('linkedin.com/in/mayalin');
      expect(created.content.basics.github).toBe('https://github.com/mayalin');
      expect(created.content.basics.location).toEqual({
        address: '742 Market Street, Suite 400',
        city: 'San Francisco',
        region: 'CA',
        countryCode: 'US',
        postalCode: '94103',
      });
      expect(created.content.basics.profiles).toEqual([
        {
          network: 'Dribbble',
          username: 'mayalin',
          url: 'https://dribbble.com/mayalin',
        },
        {
          network: 'X',
          username: 'mayalin_ui',
          url: 'x.com/mayalin_ui',
        },
      ]);

      // Update links & location via PUT /api/resumes/:resumeId
      jest.spyOn(Resume, 'findOne').mockResolvedValue(storedDoc as any);

      const updatedPayload = {
        ...fullBasicsPayload,
        content: {
          ...fullBasicsPayload.content,
          basics: {
            ...fullBasicsPayload.content.basics,
            url: 'https://portfolio.mayalin.dev',
            linkedin: 'https://linkedin.com/in/maya-lin',
            location: {
              address: '100 Pine St',
              city: 'Seattle',
              region: 'WA',
              countryCode: 'US',
              postalCode: '98101',
            },
            profiles: [
              {
                network: 'Substack',
                username: 'mayalin',
                url: 'https://mayalin.substack.com',
              },
            ],
          },
        },
      };

      const putRes = await request(app)
        .put(`/api/resumes/${storedDoc!._id}`)
        .set('Authorization', authHeader)
        .send(updatedPayload);

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.content.basics.url).toBe('https://portfolio.mayalin.dev');
      expect(putRes.body.data.content.basics.linkedin).toBe('https://linkedin.com/in/maya-lin');
      expect(putRes.body.data.content.basics.location).toEqual({
        address: '100 Pine St',
        city: 'Seattle',
        region: 'WA',
        countryCode: 'US',
        postalCode: '98101',
      });
      expect(putRes.body.data.content.basics.profiles).toEqual([
        {
          network: 'Substack',
          username: 'mayalin',
          url: 'https://mayalin.substack.com',
        },
      ]);
    });

    it('does not append duplicate history entries when saving an unchanged resume (including Mongoose subdoc _id and hydrated empty fields)', async () => {
      const authHeader = issueAuthHeader();

      const realDoc = new Resume({
        ...fullBasicsPayload,
        userId: OWNER_ID,
        history: [
          {
            title: 'Older Snapshot',
            summary: 'Old summary',
            content: fullBasicsPayload.content,
            themeConfig: fullBasicsPayload.themeConfig,
            updatedAt: new Date(Date.now() - SNAPSHOT_MIN_INTERVAL_MS - 60_000),
          },
        ],
      });
      jest.spyOn(realDoc, 'save').mockResolvedValue(realDoc);
      jest.spyOn(Resume, 'findOne').mockResolvedValue(realDoc as any);

      // Save identical payload via PUT even though previous snapshot is >10 min old
      const resIdentical = await request(app)
        .put(`/api/resumes/${realDoc._id}`)
        .set('Authorization', authHeader)
        .send(fullBasicsPayload);

      expect(resIdentical.status).toBe(200);
      expect(realDoc.history).toHaveLength(1);

      // Also test minimal resume hydrated with frontend empty-string defaults
      const minimalDoc = new Resume({
        userId: OWNER_ID,
        title: 'Minimal Resume',
        content: {
          basics: {
            name: 'Alex Doe',
            email: 'alex@example.com',
          },
          sections: [],
          sectionOrder: [],
        },
        history: [],
      });
      jest.spyOn(minimalDoc, 'save').mockResolvedValue(minimalDoc);
      jest.spyOn(Resume, 'findOne').mockResolvedValue(minimalDoc as any);

      const resHydrated = await request(app)
        .put(`/api/resumes/${minimalDoc._id}`)
        .set('Authorization', authHeader)
        .send({
          title: 'Minimal Resume',
          summary: '',
          content: {
            basics: {
              name: 'Alex Doe',
              label: '',
              email: 'alex@example.com',
              phone: '',
              summary: '',
              url: '',
              linkedin: '',
              github: '',
              location: {
                address: '',
                city: '',
                region: '',
                countryCode: '',
                postalCode: '',
              },
              profiles: [],
            },
            sections: [],
            sectionOrder: [],
          },
        });

      expect(resHydrated.status).toBe(200);
      expect(minimalDoc.history).toHaveLength(0);
    });
  });

  describe('Link validation & scheme security on save', () => {
    it('rejects javascript:, data:, and malformed non-empty URLs with 400 while allowing empty strings and bare domains', async () => {
      const authHeader = issueAuthHeader();

      const badPayloads = [
        { ...fullBasicsPayload, content: { ...fullBasicsPayload.content, basics: { ...fullBasicsPayload.content.basics, url: 'javascript:alert(1)' } } },
        { ...fullBasicsPayload, content: { ...fullBasicsPayload.content, basics: { ...fullBasicsPayload.content.basics, linkedin: 'data:text/html,<script>alert(1)</script>' } } },
        { ...fullBasicsPayload, content: { ...fullBasicsPayload.content, basics: { ...fullBasicsPayload.content.basics, github: 'java\tscript:alert(1)' } } },
        { ...fullBasicsPayload, content: { ...fullBasicsPayload.content, basics: { ...fullBasicsPayload.content.basics, url: 'not a valid url' } } },
        {
          ...fullBasicsPayload,
          content: {
            ...fullBasicsPayload.content,
            basics: {
              ...fullBasicsPayload.content.basics,
              profiles: [{ network: 'Evil', url: 'javascript:void(0)' }],
            },
          },
        },
      ];

      for (const bad of badPayloads) {
        const res = await request(app)
          .post('/api/resumes')
          .set('Authorization', authHeader)
          .send(bad);
        expect(res.status).toBe(400);
      }

      // Empty strings and bare domains succeed
      jest.spyOn(Resume, 'create').mockImplementation((async (input: any) => new Resume(input)) as any);
      const cleanRes = await request(app)
        .post('/api/resumes')
        .set('Authorization', authHeader)
        .send({
          ...fullBasicsPayload,
          content: {
            ...fullBasicsPayload.content,
            basics: {
              ...fullBasicsPayload.content.basics,
              url: '',
              linkedin: 'linkedin.com/in/mayalin',
              github: 'github.com/mayalin',
              profiles: [{ network: 'Blog', url: '' }],
            },
          },
        });
      expect(cleanRes.status).toBe(201);
    });
  });

  describe('Address & Postal Code privacy redaction on public shares and plain-text export', () => {
    it('strips both location.address and location.postalCode while keeping city, region, and countryCode on share token and custom slug endpoints', async () => {
      const sharedDoc = new Resume({
        ...fullBasicsPayload,
        userId: OWNER_ID,
        sharing: {
          isPublic: true,
          shareToken: 'tok-redacted-address',
          slug: 'maya-lin',
          privacy: {
            hideEmail: false,
            hidePhone: false,
            hideAddress: true,
          },
        },
      });

      jest.spyOn(sharedDoc, 'save').mockResolvedValue(sharedDoc);
      jest.spyOn(Resume, 'findOne').mockResolvedValue(sharedDoc as any);
      jest.spyOn(Resume, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

      const tokenRes = await request(app).get('/api/resumes/share/tok-redacted-address');
      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.data.content.basics.location).toEqual({
        city: 'San Francisco',
        region: 'CA',
        countryCode: 'US',
      });
      expect(tokenRes.body.data.content.basics.location.address).toBeUndefined();
      expect(tokenRes.body.data.content.basics.location.postalCode).toBeUndefined();
      expect(tokenRes.body.data.content.basics.linkedin).toBe('linkedin.com/in/mayalin');
      expect(tokenRes.body.data.content.basics.profiles).toHaveLength(2);

      const slugRes = await request(app).get('/api/public/r/maya-lin');
      expect(slugRes.status).toBe(200);
      expect(slugRes.body.data.content.basics.location).toEqual({
        city: 'San Francisco',
        region: 'CA',
        countryCode: 'US',
      });
      expect(slugRes.body.data.content.basics.location.address).toBeUndefined();
      expect(slugRes.body.data.content.basics.location.postalCode).toBeUndefined();

      // Also verify plain-text export hides street address and postalCode when hideAddress is true
      const exportedTxt = renderResumePlainText(sharedDoc.toObject());
      expect(exportedTxt).toContain('San Francisco, CA, US');
      expect(exportedTxt).not.toContain('742 Market Street');
      expect(exportedTxt).not.toContain('94103');
    });
  });

  describe('AI prompt extraction for location and profile links', () => {
    it('extracts optional location and profile links when provided, strips unsafe schemes, and instructs LLM never to fabricate facts', async () => {
      process.env.LLAMA_API_URL = 'https://mock-llm.example.com/v1/chat/completions';

      let capturedRequestBody: any = null;
      global.fetch = jest.fn().mockImplementation(async (_url: any, init: any) => {
        capturedRequestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Backend Engineer',
                    summary: 'Go and Rust engineer.',
                    content: {
                      basics: {
                        name: 'Sam Patel',
                        email: 'sam@example.com',
                        github: 'https://github.com/sampatel',
                        linkedin: 'linkedin.com/in/sampatel',
                        url: 'javascript:alert(1)',
                        location: {
                          city: 'Austin',
                          region: 'TX',
                          countryCode: 'US',
                        },
                        profiles: [
                          { network: 'Crates.io', url: 'https://crates.io/users/sampatel' },
                          { network: 'Bad', url: 'data:text/html,evil' },
                        ],
                      },
                      sections: [],
                      sectionOrder: [],
                    },
                  }),
                },
              },
            ],
          }),
        };
      }) as any;

      const aiResult = await analyzeResumePrompt(
        'Sam Patel, sam@example.com, Austin TX US, github.com/sampatel, linkedin.com/in/sampatel, crates.io/users/sampatel'
      );

      expect(capturedRequestBody.messages[0].content).toMatch(/Never invent, guess, or fabricate/i);
      expect(aiResult.content?.basics.location).toEqual({
        city: 'Austin',
        region: 'TX',
        countryCode: 'US',
      });
      expect(aiResult.content?.basics.github).toBe('https://github.com/sampatel');
      expect(aiResult.content?.basics.linkedin).toBe('linkedin.com/in/sampatel');
      expect(aiResult.content?.basics.url).toBeUndefined();
      expect(aiResult.content?.basics.profiles).toEqual([
        { network: 'Crates.io', url: 'https://crates.io/users/sampatel' },
      ]);
    });
  });
});

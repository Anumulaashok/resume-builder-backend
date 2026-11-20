import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import resumeRoutes from '../routes/resumeRoutes';
import publicRoutes from '../routes/publicRoutes';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import { errorHandler } from '../middleware/errorHandler';
import {
  SectionSchema,
  VALID_SECTION_TYPES,
  extractVerifiedResumeFacts,
  hasQuantifiedMetrics
} from '../services/aiService';

const TEST_JWT_SECRET = 'test-grounded-ai-jwt-secret';

describe('Grounded AI Generation, History Undo, Provenance Privacy & Bullet Coach', () => {
  let app: express.Application;
  let ownerToken: string;
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env = { ...originalEnv, JWT_SECRET: TEST_JWT_SECRET };
    delete process.env.LLAMA_API_URL;
    delete process.env.LLAMA_API_KEY;
    ownerToken = jwt.sign({ id: 'owner-1' }, TEST_JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.LLAMA_API_URL;
    delete process.env.LLAMA_API_KEY;
    global.fetch = originalFetch;

    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use('/api/public', publicRoutes);
    app.use(errorHandler);

    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'owner-1',
        name: 'Jordan Lee',
        email: 'jordan@example.com'
      })
    } as any);
  });

  const makeResumeDoc = (overrides: Record<string, any> = {}) => {
    const doc: any = {
      _id: 'resume-grounded-1',
      userId: 'owner-1',
      title: 'Original Backend Resume',
      summary: 'Original verified backend summary.',
      templateId: 'modern',
      themeConfig: { primaryColor: '#1d4ed8', sectionSpacing: 'normal' },
      content: {
        basics: {
          name: 'Jordan Lee',
          label: 'Backend Software Engineer',
          email: 'jordan@example.com',
          phone: '555-0199',
          summary: 'Original verified backend summary.'
        },
        sections: [
          {
            id: 'sec-work-1',
            type: 'WorkItem',
            title: 'Work Experience',
            content: [
              {
                id: 'work-item-1',
                company: 'Acme Cloud Corp',
                position: 'Senior Backend Engineer',
                startDate: { month: 'Jan', year: '2022' },
                endDate: { month: 'Present', year: '' },
                description: 'Built TypeScript and PostgreSQL services handling 25K requests per minute.'
              }
            ]
          },
          {
            id: 'sec-edu-1',
            type: 'EducationItem',
            title: 'Education',
            content: [
              {
                id: 'edu-item-1',
                institution: 'State Tech University',
                degree: 'B.S. in Computer Science'
              }
            ]
          },
          {
            id: 'sec-skills-1',
            type: 'SkillItem',
            title: 'Skills',
            content: [
              { id: 'skill-ts', name: 'TypeScript', level: 4 },
              { id: 'skill-pg', name: 'PostgreSQL', level: 4 },
              { id: 'skill-node', name: 'Node.js', level: 4 }
            ]
          }
        ],
        sectionOrder: ['sec-work-1', 'sec-edu-1', 'sec-skills-1']
      },
      sharing: {
        isPublic: true,
        shareToken: 'public-token-123',
        slug: 'jordan-lee',
        viewCount: 0,
        lastViewedAt: null,
        dailyViews: [],
        privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
      },
      history: [],
      markModified: jest.fn(),
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
      ...overrides
    };
    return doc;
  };

  describe('SectionSchema validation & fact extraction', () => {
    it('restricts section.type to valid SectionType literals and requires non-empty item.id', () => {
      for (const validType of VALID_SECTION_TYPES) {
        const ok = SectionSchema.safeParse({
          id: `sec-${validType}`,
          type: validType,
          title: validType,
          content: [{ id: 'item-1', name: 'Sample' }]
        });
        expect(ok.success).toBe(true);
      }

      const invalidType = SectionSchema.safeParse({
        id: 'sec-bad',
        type: 'UnsupportedSectionType',
        title: 'Bad',
        content: [{ id: 'item-1' }]
      });
      expect(invalidType.success).toBe(false);

      const emptyItemId = SectionSchema.safeParse({
        id: 'sec-work',
        type: 'WorkItem',
        title: 'Experience',
        content: [{ id: '   ', company: 'Acme Cloud Corp' }]
      });
      expect(emptyItemId.success).toBe(false);

      const missingItemId = SectionSchema.safeParse({
        id: 'sec-work',
        type: 'WorkItem',
        title: 'Experience',
        content: [{ company: 'Acme Cloud Corp' }]
      });
      expect(missingItemId.success).toBe(false);
    });

    it('extracts deterministic fact IDs for basics, employers, credentials, skills, and metrics', () => {
      const doc = makeResumeDoc();
      const catalog = extractVerifiedResumeFacts(doc);

      expect(catalog.factMap.get('fact:basics:name')?.value).toBe('Jordan Lee');
      expect(catalog.employers.has('acme cloud corp')).toBe(true);
      expect(catalog.credentials.has('state tech university')).toBe(true);
      expect(catalog.skills.has('typescript')).toBe(true);
      expect(catalog.skills.has('postgresql')).toBe(true);
      expect(catalog.numbers.has('25k')).toBe(true);
    });
  });

  describe('POST /api/resumes/:resumeId/generate without LLAMA_API_URL + Undo', () => {
    it('saves a clean structured draft without [AI placeholder], snapshots history, and restores title/summary/content/themeConfig on undo', async () => {
      const doc = makeResumeDoc({
        title: 'AI Draft',
        summary: '',
        content: {
          basics: {
            name: 'Samira Patel',
            label: '',
            email: 'samira@example.com'
          },
          sections: [],
          sectionOrder: []
        }
      });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const genRes = await request(app)
        .post('/api/resumes/resume-grounded-1/generate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          prompt:
            'Draft a resume for a Full Stack Engineer experienced with React, TypeScript, Docker, and GraphQL'
        });

      expect(genRes.status).toBe(200);
      expect(genRes.body.success).toBe(true);

      const saved = genRes.body.data;
      expect(saved.summary).toBeTruthy();
      expect(saved.summary).not.toMatch(/\[AI placeholder\]/i);
      expect(saved.content.basics.summary).not.toMatch(/\[AI placeholder\]/i);
      expect(saved.title).toContain('Full Stack Engineer');
      expect(Array.isArray(saved.source_fact_ids)).toBe(true);
      expect(saved.source_fact_ids.length).toBeGreaterThan(0);

      // Uses SKILL_DICTIONARY skills from prompt without fabricating employers or credentials
      const sections = saved.content.sections;
      expect(sections.length).toBeGreaterThan(0);
      for (const sec of sections) {
        expect(VALID_SECTION_TYPES).toContain(sec.type);
        for (const item of sec.content) {
          expect(typeof item.id).toBe('string');
          expect(item.id.trim().length).toBeGreaterThan(0);
        }
      }
      expect(sections.some((s: any) => s.type === 'WorkItem')).toBe(false);
      const skillSec = sections.find((s: any) => s.type === 'SkillItem');
      expect(skillSec).toBeDefined();
      const skillNames = skillSec.content.map((i: any) => i.name);
      expect(skillNames).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Docker', 'GraphQL']));

      // History snapshot was pushed before overwrite
      expect(doc.history).toHaveLength(1);
      expect(doc.history[0].title).toBe('AI Draft');
      expect(doc.history[0].summary).toBe('');

      // Mutate themeConfig as well via history test setup to confirm full undo restoration
      doc.history[0].title = 'Prior Custom Title';
      doc.history[0].summary = 'Prior Verified Summary';
      doc.history[0].themeConfig = { primaryColor: '#0f766e', sectionSpacing: 'compact' };
      doc.themeConfig = { primaryColor: '#dc2626', sectionSpacing: 'spacious' };

      const undoRes = await request(app)
        .post('/api/resumes/resume-grounded-1/undo')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(undoRes.status).toBe(200);
      expect(doc.history).toHaveLength(0);
      expect(doc.title).toBe('Prior Custom Title');
      expect(doc.summary).toBe('Prior Verified Summary');
      expect(doc.themeConfig).toEqual({ primaryColor: '#0f766e', sectionSpacing: 'compact' });
      expect(doc.content.sections).toEqual([]);
    });
  });

  describe('POST /api/resumes/:resumeId/generate with LLAMA_API_URL anti-fabrication checks', () => {
    it('attaches verified source_fact_ids when AI claims match verified resume facts', async () => {
      process.env.LLAMA_API_URL = 'https://mock-llm.local/v1/chat/completions';
      const doc = makeResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Senior Backend Engineer Resume',
                  summary:
                    'Backend Software Engineer building TypeScript and PostgreSQL services handling 25K requests per minute.',
                  source_fact_ids: ['fact:basics:label'],
                  content: {
                    basics: {
                      name: 'Jordan Lee',
                      email: 'jordan@example.com',
                      label: 'Backend Software Engineer',
                      source_fact_ids: ['fact:basics:name', 'fact:basics:email']
                    },
                    sections: [
                      {
                        id: 'sec-work-1',
                        type: 'work',
                        title: 'Work Experience',
                        content: [
                          {
                            id: 'work-item-1',
                            company: 'Acme Cloud Corp',
                            position: 'Senior Backend Engineer',
                            description:
                              'Engineered TypeScript and PostgreSQL APIs handling 25K requests per minute.'
                          }
                        ]
                      }
                    ],
                    sectionOrder: ['sec-work-1']
                  }
                })
              }
            }
          ]
        })
      } as any);

      const res = await request(app)
        .post('/api/resumes/resume-grounded-1/generate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ prompt: 'Tailor my resume for a Senior Backend role' });

      expect(res.status).toBe(200);
      // Verify prompt sent to LLM included verified fact IDs and anti-fabrication + no-training instructions
      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const sentBody = JSON.parse(fetchArgs[1].body);
      expect(sentBody.messages[0].content).toContain('NEVER invent employers');
      expect(sentBody.messages[0].content).toContain('Do NOT retain or train on user resume content');
      expect(sentBody.messages[1].content).toContain('[fact:work:work-item-1:employer]');

      expect(res.body.data.content.sections[0].type).toBe('WorkItem');
      expect(res.body.data.content.sections[0].content[0].source_fact_ids).toEqual(
        expect.arrayContaining(['fact:work:work-item-1:employer'])
      );
    });

    it('rejects fabricated employers, technologies, or numbers from AI output without overwriting the resume', async () => {
      process.env.LLAMA_API_URL = 'https://mock-llm.local/v1/chat/completions';
      const doc = makeResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Fabricated Resume',
                  summary: 'Reduced infrastructure costs by 87% using Kubernetes at FakeCorp.',
                  content: {
                    basics: {
                      name: 'Jordan Lee',
                      email: 'jordan@example.com'
                    },
                    sections: [
                      {
                        id: 'sec-work-1',
                        type: 'WorkItem',
                        title: 'Experience',
                        content: [
                          {
                            id: 'work-item-1',
                            company: 'FakeCorp International',
                            position: 'Principal Architect',
                            description: 'Deployed Kubernetes clusters cutting latency by 87%.'
                          }
                        ]
                      }
                    ],
                    sectionOrder: ['sec-work-1']
                  }
                })
              }
            }
          ]
        })
      } as any);

      const res = await request(app)
        .post('/api/resumes/resume-grounded-1/generate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ prompt: 'Make my resume look impressive' });

      expect(res.status).toBe(502);
      expect(doc.title).toBe('Original Backend Resume');
      expect(doc.summary).toBe('Original verified backend summary.');
      expect(doc.history).toHaveLength(0);
    });
  });

  describe('Bullet Coach endpoint & X-Y-Z metric grounding', () => {
    it('coaches bullets locally without LLAMA_API_URL, attaches source_fact_ids, and inserts exact user metrics without fabrication', async () => {
      const doc = makeResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      expect(hasQuantifiedMetrics('Worked on TypeScript API endpoints')).toBe(false);
      expect(hasQuantifiedMetrics('Reduced API latency by 35%')).toBe(true);

      const rewriteRes = await request(app)
        .post('/api/resumes/resume-grounded-1/bullets/coach')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          text: 'Worked on TypeScript and PostgreSQL API endpoints',
          action: 'rewrite'
        });

      expect(rewriteRes.status).toBe(200);
      expect(rewriteRes.body.data.rewrittenText).toMatch(/^Engineered TypeScript and PostgreSQL API endpoints\.$/);
      expect(rewriteRes.body.data.hasMetrics).toBe(false);
      expect(rewriteRes.body.data.source_fact_ids).toEqual(
        expect.arrayContaining(['fact:bullet:input'])
      );
      expect(rewriteRes.body.data.xyzPrompts.map((p: any) => p.label)).toEqual([
        'Reduced latency',
        'Increased throughput',
        'Cut cost'
      ]);

      // Now supply a real user metric
      const metricRes = await request(app)
        .post('/api/resumes/resume-grounded-1/bullets/coach')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          text: 'Worked on TypeScript and PostgreSQL API endpoints',
          action: 'improve',
          userMetric: {
            category: 'Reduced latency',
            value: '42%'
          }
        });

      expect(metricRes.status).toBe(200);
      expect(metricRes.body.data.rewrittenText).toContain('42%');
      expect(metricRes.body.data.hasMetrics).toBe(true);
      expect(metricRes.body.data.source_fact_ids).toEqual(
        expect.arrayContaining(['fact:user:metric'])
      );
    });

    it('checks source_fact_ids and rejects fabricated metrics when LLAMA_API_URL is configured', async () => {
      process.env.LLAMA_API_URL = 'https://mock-llm.local/v1/chat/completions';
      const doc = makeResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrittenText: 'Engineered TypeScript services reducing latency by 73%.',
                  source_fact_ids: ['fact:bullet:input']
                })
              }
            }
          ]
        })
      } as any);

      const badRes = await request(app)
        .post('/api/resumes/resume-grounded-1/bullets/coach')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          text: 'Worked on TypeScript services',
          action: 'rewrite'
        });

      expect(badRes.status).toBe(502);
    });
  });

  describe('Public share responses omit source_fact_ids', () => {
    it('strips source_fact_ids from top-level, basics, sections, and items on share token and custom slug routes', async () => {
      const doc = makeResumeDoc({
        source_fact_ids: ['fact:basics:name', 'fact:work:work-item-1:employer'],
        content: {
          source_fact_ids: ['fact:basics:name'],
          basics: {
            name: 'Jordan Lee',
            email: 'jordan@example.com',
            summary: 'Verified summary.',
            source_fact_ids: ['fact:summary']
          },
          sections: [
            {
              id: 'sec-work-1',
              type: 'WorkItem',
              title: 'Work Experience',
              source_fact_ids: ['fact:work:work-item-1:employer'],
              content: [
                {
                  id: 'work-item-1',
                  company: 'Acme Cloud Corp',
                  position: 'Senior Backend Engineer',
                  source_fact_ids: ['fact:work:work-item-1:employer']
                }
              ]
            }
          ],
          sectionOrder: ['sec-work-1']
        }
      });

      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const tokenRes = await request(app).get('/api/resumes/share/public-token-123');
      expect(tokenRes.status).toBe(200);
      expect(JSON.stringify(tokenRes.body)).not.toContain('source_fact_ids');

      const slugRes = await request(app).get('/api/public/r/jordan-lee');
      expect(slugRes.status).toBe(200);
      expect(JSON.stringify(slugRes.body)).not.toContain('source_fact_ids');
    });
  });
});

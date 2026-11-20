import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import { errorHandler } from '../middleware/errorHandler';
import { MAX_HISTORY_SNAPSHOTS, SNAPSHOT_MIN_INTERVAL_MS } from '../utils/resumeHistory';

const TEST_JWT_SECRET = 'test-history-jwt-secret';

describe('Resume Version History API & Snapshot Throttling', () => {
  let app: express.Application;
  let ownerToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    ownerToken = jwt.sign({ id: 'owner-1' }, TEST_JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use(errorHandler);

    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'owner-1',
        name: 'Owner One',
        email: 'owner@example.com'
      })
    } as any);
  });

  const makeResumeDoc = (overrides: Record<string, any> = {}) => {
    const doc: any = {
      _id: 'resume-1',
      userId: 'owner-1',
      title: 'Staff Backend Resume',
      summary: 'Distributed systems engineer.',
      templateId: 'modern',
      themeConfig: { primaryColor: '#2563eb', sectionSpacing: 'normal' },
      content: {
        basics: {
          name: 'Alex Rivera',
          label: 'Staff Backend Engineer',
          email: 'alex@example.com',
          summary: 'Distributed systems engineer.'
        },
        sections: [
          {
            id: 'sec-work',
            type: 'WorkItem',
            title: 'Experience',
            content: [
              {
                id: 'work-1',
                name: 'CloudScale',
                position: 'Senior Engineer',
                description: 'Built resilient API gateways handling high throughput.'
              }
            ]
          }
        ],
        sectionOrder: ['sec-work']
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

  describe('Authentication & ownership scoping', () => {
    it('rejects unauthenticated requests to history routes with 401', async () => {
      const listRes = await request(app).get('/api/resumes/resume-1/history');
      expect(listRes.status).toBe(401);

      const snapRes = await request(app).get('/api/resumes/resume-1/history/0');
      expect(snapRes.status).toBe(401);

      const restoreRes = await request(app).post('/api/resumes/resume-1/history/0/restore');
      expect(restoreRes.status).toBe(401);
    });

    it('scopes every history query by req.user._id and returns 404 for another user’s resume', async () => {
      const findSpy = jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);

      const res = await request(app)
        .get('/api/resumes/other-resume/history')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(findSpy).toHaveBeenCalledWith({ _id: 'other-resume', userId: 'owner-1' });
    });
  });

  describe('Snapshot throttling & 30-snapshot cap on update', () => {
    it('snapshots on first update, skips minor edits within 10 minutes, and snapshots again after 10 minutes', async () => {
      const doc = makeResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      // 1. First minor edit when history is empty -> creates initial snapshot
      const minorContent1 = {
        ...doc.content,
        basics: { ...doc.content.basics, name: 'Alex M. Rivera' }
      };
      const res1 = await request(app)
        .patch('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: doc.title, content: minorContent1 });

      expect(res1.status).toBe(200);
      expect(doc.history).toHaveLength(1);
      expect(doc.history[0].content.basics.name).toBe('Alex Rivera');

      // 2. Second minor edit 2 minutes later -> skipped because < 10 min and not substantial
      doc.history[0].updatedAt = new Date(Date.now() - 2 * 60 * 1000);
      const minorContent2 = {
        ...minorContent1,
        basics: { ...minorContent1.basics, name: 'Alex M. Rivera Jr.' }
      };
      const res2 = await request(app)
        .patch('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: doc.title,
          content: minorContent2,
          themeConfig: { primaryColor: '#1e293b', sectionSpacing: 'compact' }
        });

      expect(res2.status).toBe(200);
      expect(doc.history).toHaveLength(1);
      expect(doc.content.basics.name).toBe('Alex M. Rivera Jr.');

      // 3. Minor edit when previous snapshot is > 10 minutes old -> creates new snapshot
      doc.history[0].updatedAt = new Date(Date.now() - SNAPSHOT_MIN_INTERVAL_MS - 5000);
      const minorContent3 = {
        ...minorContent2,
        basics: { ...minorContent2.basics, phone: '555-0142' }
      };
      const res3 = await request(app)
        .patch('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: doc.title, content: minorContent3 });

      expect(res3.status).toBe(200);
      expect(doc.history).toHaveLength(2);
      expect(doc.history[1].content.basics.name).toBe('Alex M. Rivera Jr.');
    });

    it('snapshots immediately within 10 minutes when content changes substantially (section change or large text delta)', async () => {
      const recentTime = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const doc = makeResumeDoc({
        history: [
          {
            title: 'Initial Draft',
            content: {
              basics: { name: 'Alex Rivera', email: 'alex@example.com' },
              sections: [],
              sectionOrder: []
            },
            updatedAt: recentTime
          }
        ]
      });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      // Substantial change 1: adding a new Skills section within 30s of previous snapshot
      const withSkillsSection = {
        ...doc.content,
        sections: [
          ...doc.content.sections,
          {
            id: 'sec-skills',
            type: 'SkillItem',
            title: 'Technical Skills',
            content: [{ id: 's1', name: 'TypeScript' }, { id: 's2', name: 'PostgreSQL' }]
          }
        ],
        sectionOrder: ['sec-work', 'sec-skills']
      };

      const resSection = await request(app)
        .put('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: doc.title, content: withSkillsSection });

      expect(resSection.status).toBe(200);
      expect(doc.history).toHaveLength(2);

      // Substantial change 2: rewriting/expanding work description by > 20 words within seconds
      const withSubstantialText = {
        ...withSkillsSection,
        sections: [
          {
            ...withSkillsSection.sections[0],
            content: [
              {
                id: 'work-1',
                name: 'CloudScale',
                position: 'Principal Architect',
                description:
                  'Architected multi-region event streaming pipelines with Kafka and Kubernetes reducing p99 latency by forty percent while mentoring fifteen engineers across platform reliability teams.'
              }
            ]
          },
          withSkillsSection.sections[1]
        ]
      };

      const resText = await request(app)
        .put('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: doc.title, content: withSubstantialText });

      expect(resText.status).toBe(200);
      expect(doc.history).toHaveLength(3);
    });

    it('keeps at most the last 30 snapshots when new snapshots are recorded', async () => {
      const existingHistory = Array.from({ length: MAX_HISTORY_SNAPSHOTS }, (_, idx) => ({
        title: `Version ${idx}`,
        content: {
          basics: { name: `User ${idx}`, email: 'alex@example.com' },
          sections: [],
          sectionOrder: []
        },
        updatedAt: new Date(Date.now() - (MAX_HISTORY_SNAPSHOTS - idx + 20) * 60 * 1000)
      }));

      const doc = makeResumeDoc({ history: existingHistory });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const updatedContent = {
        ...doc.content,
        basics: { ...doc.content.basics, name: 'Alex Updated' }
      };

      const res = await request(app)
        .patch('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Version 30 Current', content: updatedContent });

      expect(res.status).toBe(200);
      expect(doc.history).toHaveLength(MAX_HISTORY_SNAPSHOTS);
      expect(doc.history[0].title).toBe('Version 1');
      expect(doc.history[MAX_HISTORY_SNAPSHOTS - 1].title).toBe('Staff Backend Resume');
    });
  });

  describe('GET /api/resumes/:id/history & GET /api/resumes/:id/history/:index', () => {
    it('returns history summaries newest-first with index, updatedAt, title, and section/word summary', async () => {
      const t0 = new Date('2026-11-19T10:00:00.000Z');
      const t1 = new Date('2026-11-19T10:15:00.000Z');
      const t2 = new Date('2026-11-19T10:30:00.000Z');

      const doc = makeResumeDoc({
        history: [
          {
            title: 'Draft v1',
            content: {
              basics: { name: 'Alex Rivera', email: 'alex@example.com' },
              sections: [],
              sectionOrder: []
            },
            updatedAt: t0
          },
          {
            title: 'Added Experience',
            content: {
              basics: { name: 'Alex Rivera', email: 'alex@example.com' },
              sections: [
                {
                  id: 'sec-work',
                  type: 'WorkItem',
                  title: 'Experience',
                  content: [{ id: 'w1', name: 'Acme', position: 'Engineer' }]
                }
              ],
              sectionOrder: ['sec-work']
            },
            updatedAt: t1
          },
          {
            title: 'Expanded Experience & Skills',
            content: {
              basics: { name: 'Alex Rivera', email: 'alex@example.com' },
              sections: [
                {
                  id: 'sec-work',
                  type: 'WorkItem',
                  title: 'Experience',
                  content: [
                    {
                      id: 'w1',
                      name: 'Acme',
                      position: 'Senior Engineer',
                      description: 'Led core payments service'
                    }
                  ]
                },
                {
                  id: 'sec-skills',
                  type: 'SkillItem',
                  title: 'Skills',
                  content: [{ id: 's1', name: 'Node.js' }]
                }
              ],
              sectionOrder: ['sec-work', 'sec-skills']
            },
            themeConfig: { primaryColor: '#0f172a' },
            updatedAt: t2
          }
        ]
      });

      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const listRes = await request(app)
        .get('/api/resumes/resume-1/history')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data).toHaveLength(3);

      // Newest first: index 2, then 1, then 0
      expect(listRes.body.data.map((item: any) => item.index)).toEqual([2, 1, 0]);
      expect(listRes.body.data[0]).toMatchObject({
        index: 2,
        updatedAt: t2.toISOString(),
        title: 'Expanded Experience & Skills',
        sectionCount: 2
      });
      expect(listRes.body.data[0].summary).toMatch(/2 sections · \d+ words \(\+1 section, \+\d+ words\)/);

      expect(listRes.body.data[1]).toMatchObject({
        index: 1,
        updatedAt: t1.toISOString(),
        title: 'Added Experience',
        sectionCount: 1
      });
      expect(listRes.body.data[1].summary).toMatch(/1 section · \d+ words \(\+1 section, \+\d+ words\)/);

      expect(listRes.body.data[2]).toMatchObject({
        index: 0,
        updatedAt: t0.toISOString(),
        title: 'Draft v1',
        sectionCount: 0,
        wordCount: 3,
        summary: '0 sections · 3 words'
      });

      // Full snapshot at index 2
      const snapRes = await request(app)
        .get('/api/resumes/resume-1/history/2')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(snapRes.status).toBe(200);
      expect(snapRes.body.success).toBe(true);
      expect(snapRes.body.data).toMatchObject({
        index: 2,
        title: 'Expanded Experience & Skills',
        themeConfig: { primaryColor: '#0f172a' },
        updatedAt: t2.toISOString()
      });
      expect(snapRes.body.data.content.sections).toHaveLength(2);
    });

    it('validates :index with express-validator (400) and returns 404 when out of bounds', async () => {
      const doc = makeResumeDoc({
        history: [{ content: { basics: { name: 'A', email: 'a@x.com' }, sections: [], sectionOrder: [] }, updatedAt: new Date() }]
      });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const negRes = await request(app)
        .get('/api/resumes/resume-1/history/-1')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(negRes.status).toBe(400);

      const alphaRes = await request(app)
        .get('/api/resumes/resume-1/history/notanumber')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(alphaRes.status).toBe(400);

      const oobRes = await request(app)
        .get('/api/resumes/resume-1/history/5')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(oobRes.status).toBe(404);
    });
  });

  describe('POST /api/resumes/:id/history/:index/restore', () => {
    it('snapshots current state first, restores target snapshot, ignores userId in body, and supports undo restore', async () => {
      const targetSnapshotContent = {
        basics: {
          name: 'Alex Early',
          label: 'Backend Engineer',
          email: 'alex@example.com',
          summary: 'Early career summary.'
        },
        sections: [],
        sectionOrder: []
      };

      const doc = makeResumeDoc({
        title: 'Current Latest Title',
        summary: 'Current latest summary.',
        themeConfig: { primaryColor: '#dc2626' },
        history: [
          {
            title: 'Early Version Title',
            summary: 'Early career summary.',
            content: targetSnapshotContent,
            themeConfig: { primaryColor: '#16a34a' },
            updatedAt: new Date(Date.now() - 60 * 1000)
          }
        ]
      });

      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const restoreRes = await request(app)
        .post('/api/resumes/resume-1/history/0/restore')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: 'attacker-id' });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(doc.userId).toBe('owner-1');

      // Current state was snapshotted into history[1] before restoring history[0]
      expect(doc.history).toHaveLength(2);
      expect(restoreRes.body.previousSnapshotIndex).toBe(1);
      expect(doc.history[1].title).toBe('Current Latest Title');
      expect(doc.history[1].content.basics.name).toBe('Alex Rivera');
      expect(doc.history[1].themeConfig).toEqual({ primaryColor: '#dc2626' });

      // Resume now holds restored version 0
      expect(doc.title).toBe('Early Version Title');
      expect(doc.summary).toBe('Early career summary.');
      expect(doc.content.basics.name).toBe('Alex Early');
      expect(doc.themeConfig).toEqual({ primaryColor: '#16a34a' });

      // Restoring previousSnapshotIndex (Undo) restores the state from right before restore
      const undoRes = await request(app)
        .post(`/api/resumes/resume-1/history/${restoreRes.body.previousSnapshotIndex}/restore`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(undoRes.status).toBe(200);
      expect(doc.title).toBe('Current Latest Title');
      expect(doc.content.basics.name).toBe('Alex Rivera');
      expect(doc.themeConfig).toEqual({ primaryColor: '#dc2626' });
      expect(doc.history).toHaveLength(3);
    });

    it('records, returns, and restores templateId on history snapshots', async () => {
      const doc = makeResumeDoc({
        templateId: 'classic',
        history: []
      });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      // Switch template from 'classic' to 'executive' -> records 'classic' on history[0]
      const patchRes = await request(app)
        .patch('/api/resumes/resume-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: doc.title,
          templateId: 'executive',
          content: doc.content
        });

      expect(patchRes.status).toBe(200);
      expect(doc.templateId).toBe('executive');
      expect(doc.history).toHaveLength(1);
      expect(doc.history[0].templateId).toBe('classic');

      // Fetching snapshot 0 returns saved templateId: 'classic'
      const snapRes = await request(app)
        .get('/api/resumes/resume-1/history/0')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(snapRes.status).toBe(200);
      expect(snapRes.body.data.templateId).toBe('classic');

      // Restoring snapshot 0 snapshots 'executive' into history[1] and restores 'classic'
      const restoreRes = await request(app)
        .post('/api/resumes/resume-1/history/0/restore')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(restoreRes.status).toBe(200);
      expect(doc.templateId).toBe('classic');
      expect(doc.history[1].templateId).toBe('executive');
    });

    it('rejects invalid index with 400 and out-of-bounds index with 404 on restore', async () => {
      const doc = makeResumeDoc({ history: [] });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

      const badIndexRes = await request(app)
        .post('/api/resumes/resume-1/history/abc/restore')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(badIndexRes.status).toBe(400);

      const missingSnapRes = await request(app)
        .post('/api/resumes/resume-1/history/0/restore')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(missingSnapRes.status).toBe(404);
    });
  });
});

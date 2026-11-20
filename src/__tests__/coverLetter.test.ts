import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import coverLetterRoutes from '../routes/coverLetterRoutes';
import { CoverLetter } from '../models/CoverLetter';
import { Resume } from '../models/Resume';
import { CareerProfile } from '../models/CareerProfile';
import { User } from '../models/User';
import { errorHandler } from '../middleware/errorHandler';

describe('Cover Letters API (/api/cover-letters)', () => {
  const JWT_SECRET = 'test-cover-letter-jwt-secret';
  const ownerId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const otherUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439099');
  const resumeId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');
  const letterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439033');

  let app: express.Application;
  let ownerToken: string;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalLlamaUrl = process.env.LLAMA_API_URL;
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    ownerToken = jwt.sign({ id: ownerId.toString() }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
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

    app = express();
    app.use(express.json());
    app.use('/api/cover-letters', coverLetterRoutes);
    app.use(errorHandler);

    jest.spyOn(User, 'findById').mockImplementation((id: any) => ({
      select: jest.fn().mockResolvedValue(
        String(id) === ownerId.toString()
          ? { _id: ownerId, name: 'Ashok Anumula', email: 'ashok@example.com' }
          : String(id) === otherUserId.toString()
            ? { _id: otherUserId, name: 'Other User', email: 'other@example.com' }
            : null
      )
    } as any));
  });

  const makeLetterDoc = (overrides: Record<string, any> = {}) => ({
    _id: letterId,
    userId: ownerId,
    title: 'Senior Frontend Cover Letter',
    resumeId,
    recipient: {
      name: 'Taylor Morgan',
      company: 'Northstar Systems',
      address: '100 Market St, San Francisco, CA'
    },
    jobTitle: 'Senior Frontend Engineer',
    jobDescription:
      'Build accessible React and TypeScript design systems, collaborate with product teams, and optimize web performance.',
    date: '2026-11-19',
    greeting: 'Dear Taylor Morgan,',
    body: 'First paragraph.\n\nSecond paragraph.',
    closing: 'Sincerely,',
    templateId: 'executive',
    themeConfig: { primaryColor: '#1e293b', accentColor: '#2563eb' },
    createdAt: new Date('2026-11-19T10:00:00Z'),
    updatedAt: new Date('2026-11-19T10:00:00Z'),
    save: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    ...overrides
  });

  describe('Authentication & Ownership Scoping', () => {
    it('rejects unauthenticated requests with 401 across endpoints', async () => {
      await request(app).get('/api/cover-letters').expect(401);
      await request(app).post('/api/cover-letters').send({ title: 'Test' }).expect(401);
      await request(app).get(`/api/cover-letters/${letterId}`).expect(401);
      await request(app).patch(`/api/cover-letters/${letterId}`).send({ title: 'Updated' }).expect(401);
      await request(app).delete(`/api/cover-letters/${letterId}`).expect(401);
      await request(app).post(`/api/cover-letters/${letterId}/duplicate`).expect(401);
      await request(app).post(`/api/cover-letters/${letterId}/generate`).expect(401);
    });

    it('scopes GET /api/cover-letters strictly to req.user._id', async () => {
      const mockLetters = [makeLetterDoc()];
      const sortMock = jest.fn().mockResolvedValue(mockLetters);
      const findSpy = jest.spyOn(CoverLetter, 'find').mockReturnValue({ sort: sortMock } as any);

      const res = await request(app)
        .get('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(findSpy).toHaveBeenCalledWith({ userId: ownerId });
      expect(sortMock).toHaveBeenCalledWith({ updatedAt: -1 });
    });

    it('returns 404 when accessing, updating, deleting, duplicating, or generating another user’s cover letter', async () => {
      const findOneSpy = jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(null);
      const findDeleteSpy = jest.spyOn(CoverLetter, 'findOneAndDelete').mockResolvedValue(null);

      await request(app)
        .get(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
      expect(findOneSpy).toHaveBeenLastCalledWith({ _id: letterId.toString(), userId: ownerId });

      await request(app)
        .patch(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Hijack' })
        .expect(404);
      expect(findOneSpy).toHaveBeenLastCalledWith({ _id: letterId.toString(), userId: ownerId });

      await request(app)
        .delete(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
      expect(findDeleteSpy).toHaveBeenLastCalledWith({ _id: letterId.toString(), userId: ownerId });

      await request(app)
        .post(`/api/cover-letters/${letterId}/duplicate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);

      await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('rejects linking a resumeId owned by a different user on create and update', async () => {
      const foreignResumeId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439088');
      const resumeFindSpy = jest.spyOn(Resume, 'findOne').mockResolvedValue(null);

      const createRes = await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Attempt Foreign Link',
          resumeId: foreignResumeId.toString()
        })
        .expect(404);

      expect(createRes.body.message).toMatch(/linked resume not found/i);
      expect(resumeFindSpy).toHaveBeenCalledWith({
        _id: foreignResumeId.toString(),
        userId: ownerId
      });

      const doc = makeLetterDoc({ resumeId: null });
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);

      const updateRes = await request(app)
        .patch(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ resumeId: foreignResumeId.toString() })
        .expect(404);

      expect(updateRes.body.message).toMatch(/linked resume not found/i);
    });

    it('maps malformed ObjectId (CastError) to 404', async () => {
      jest
        .spyOn(CoverLetter, 'findOne')
        .mockRejectedValue(new mongoose.Error.CastError('ObjectId', 'bad-id', '_id'));

      const res = await request(app)
        .get('/api/cover-letters/bad-id')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Field Allowlist & Create / Update / Duplicate / Delete', () => {
    it('ignores userId and unallowed fields on POST /api/cover-letters and inherits linked resume theme when omitted', async () => {
      jest.spyOn(Resume, 'findOne').mockResolvedValue({
        _id: resumeId,
        userId: ownerId,
        templateId: 'bold-header',
        themeConfig: { primaryColor: '#1e293b', accentColor: '#991b1b' }
      } as any);

      const createSpy = jest
        .spyOn(CoverLetter, 'create')
        .mockImplementation((payload: any) => Promise.resolve({ _id: letterId, ...payload }));

      const res = await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: '  Platform Engineer Letter  ',
          resumeId: resumeId.toString(),
          recipient: { name: 'Jordan Lee', company: 'CloudScale' },
          jobTitle: 'Platform Engineer',
          userId: otherUserId.toString(),
          isAdmin: true,
          createdAt: '1999-01-01T00:00:00Z'
        })
        .expect(201);

      expect(createSpy).toHaveBeenCalledTimes(1);
      const createdPayload: any = createSpy.mock.calls[0][0];
      expect(createdPayload.userId).toEqual(ownerId);
      expect(createdPayload.title).toBe('Platform Engineer Letter');
      expect(createdPayload.templateId).toBe('bold-header');
      expect(createdPayload.themeConfig).toEqual({ primaryColor: '#1e293b', accentColor: '#991b1b' });
      expect(createdPayload.recipient).toEqual({
        name: 'Jordan Lee',
        company: 'CloudScale',
        address: ''
      });
      expect(createdPayload.isAdmin).toBeUndefined();
      expect(createdPayload.createdAt).toBeUndefined();
      expect(res.body.success).toBe(true);
    });

    it('ignores userId and merges partial recipient on PATCH /api/cover-letters/:id', async () => {
      const doc = makeLetterDoc();
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);

      const res = await request(app)
        .patch(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Updated Letter Title',
          recipient: { company: 'Updated Corp' },
          closing: 'Best regards,',
          resumeId: null,
          userId: otherUserId.toString(),
          _id: otherUserId.toString(),
          secretFlag: 'nope'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(doc.userId).toEqual(ownerId);
      expect(doc._id).toEqual(letterId);
      expect(doc.title).toBe('Updated Letter Title');
      expect(doc.closing).toBe('Best regards,');
      expect(doc.resumeId).toBeNull();
      expect(doc.recipient).toEqual({
        name: 'Taylor Morgan',
        company: 'Updated Corp',
        address: '100 Market St, San Francisco, CA'
      });
      expect((doc as any).secretFlag).toBeUndefined();
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('duplicates an owned cover letter via POST /api/cover-letters/:id/duplicate', async () => {
      const sourceDoc = makeLetterDoc();
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(sourceDoc as any);
      jest.spyOn(Resume, 'findOne').mockResolvedValue({ _id: resumeId, userId: ownerId } as any);
      const duplicateId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439044');
      const createSpy = jest
        .spyOn(CoverLetter, 'create')
        .mockImplementation((payload: any) => Promise.resolve({ _id: duplicateId, ...payload }));

      const res = await request(app)
        .post(`/api/cover-letters/${letterId}/duplicate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Senior Frontend Cover Letter (Copy)');
      expect(createSpy).toHaveBeenCalledTimes(1);
      const payload: any = createSpy.mock.calls[0][0];
      expect(payload.userId).toEqual(ownerId);
      expect(payload.resumeId).toEqual(resumeId);
      expect(payload.body).toBe(sourceDoc.body);
      expect(payload.templateId).toBe('executive');
    });

    it('deletes an owned cover letter via DELETE /api/cover-letters/:id', async () => {
      const deleteSpy = jest
        .spyOn(CoverLetter, 'findOneAndDelete')
        .mockResolvedValue(makeLetterDoc() as any);

      const res = await request(app)
        .delete(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(deleteSpy).toHaveBeenCalledWith({
        _id: letterId.toString(),
        userId: ownerId
      });
    });
  });

  describe('Input Validation (express-validator)', () => {
    it('rejects missing or empty title on POST /api/cover-letters with 400', async () => {
      const res1 = await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
      expect(res1.body.success).toBe(false);
      expect(Array.isArray(res1.body.errors)).toBe(true);

      const res2 = await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '   ' })
        .expect(400);
      expect(res2.body.success).toBe(false);
    });

    it('rejects invalid resumeId, non-object recipient/themeConfig, blank title on update, and non-string prompt', async () => {
      await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Valid Title', resumeId: 'not-a-valid-objectid' })
        .expect(400);

      await request(app)
        .post('/api/cover-letters')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Valid Title', recipient: 'not-an-object' })
        .expect(400);

      await request(app)
        .patch(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '   ' })
        .expect(400);

      await request(app)
        .patch(`/api/cover-letters/${letterId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ themeConfig: ['array-not-object'] })
        .expect(400);

      await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ prompt: { bad: true } })
        .expect(400);
    });
  });

  describe('AI Cover Letter Generation: POST /api/cover-letters/:id/generate', () => {
    it('drafts multi-paragraph placeholder body grounded in linked resume, jobDescription, and prompt when no LLM is configured', async () => {
      const doc = makeLetterDoc({ body: '' });
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);
      jest.spyOn(Resume, 'findOne').mockResolvedValue({
        _id: resumeId,
        userId: ownerId,
        title: 'Staff Frontend Resume',
        summary: 'Frontend architect specializing in accessible web applications.',
        content: {
          basics: {
            name: 'Ashok Anumula',
            label: 'Staff Frontend Engineer',
            email: 'ashok@example.com'
          },
          sections: [
            {
              id: 'work',
              type: 'WorkItem',
              title: 'Experience',
              content: [{ id: 'w1', position: 'Lead UI Engineer', name: 'Apex Cloud' }]
            },
            {
              id: 'skills',
              type: 'SkillItem',
              title: 'Skills',
              content: [
                { id: 's1', name: 'React' },
                { id: 's2', name: 'TypeScript' },
                { id: 's3', name: 'Design Systems' }
              ]
            }
          ],
          sectionOrder: ['work', 'skills']
        }
      } as any);

      const res = await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ prompt: 'emphasize cross-functional mentorship' })
        .expect(200);

      expect(res.body.success).toBe(true);
      const draftedBody: string = res.body.data.body;
      const paragraphs = draftedBody.split(/\n\n+/);
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(draftedBody).toContain('Senior Frontend Engineer');
      expect(draftedBody).toContain('Northstar Systems');
      expect(draftedBody).toContain('Staff Frontend Engineer');
      expect(draftedBody).toContain('Lead UI Engineer at Apex Cloud');
      expect(draftedBody).toContain('React, TypeScript, Design Systems');
      expect(draftedBody).toContain('emphasize cross-functional mentorship');
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('calls configured LLAMA_API_URL when set and saves the generated cover letter body', async () => {
      process.env.LLAMA_API_URL = 'https://llm.example.internal/v1/chat/completions';
      const doc = makeLetterDoc({ body: '' });
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);
      jest.spyOn(Resume, 'findOne').mockResolvedValue(null);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  body: 'Paragraph one from LLM.\n\nParagraph two tailored to Northstar Systems.'
                })
              }
            }
          ]
        })
      } as any);

      const res = await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(200);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(res.body.data.body).toBe(
        'Paragraph one from LLM.\n\nParagraph two tailored to Northstar Systems.'
      );
    });

    it('grounds cover letter generation in verified CareerProfile highlights and metrics when no single resume is linked', async () => {
      const doc = makeLetterDoc({ resumeId: null, body: '' });
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);
      const resumeFindSpy = jest.spyOn(Resume, 'findOne');
      jest.spyOn(CareerProfile, 'findOne').mockResolvedValue({
        userId: ownerId,
        basics: {
          name: 'Ashok Anumula',
          label: 'Principal Platform Engineer',
          summary: 'Platform leader building resilient cloud systems.'
        },
        experiences: [
          {
            id: 'exp-1',
            company: 'CloudCore Inc',
            position: 'Staff Platform Engineer',
            highlights: [
              'Reduced p99 checkout latency by 38% across 25M daily transactions'
            ],
            metrics: [
              'Reduced p99 checkout latency by 38% across 25M daily transactions'
            ],
            technologies: ['TypeScript', 'Go']
          }
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'EdgeMesh',
            description: 'Zero-downtime service mesh rollout controller',
            highlights: ['Automated canary rollouts across 140 microservices'],
            metrics: ['Automated canary rollouts across 140 microservices'],
            technologies: ['Kubernetes']
          }
        ],
        skills: [
          { id: 'sk-1', name: 'TypeScript', keywords: ['React', 'Node.js'] },
          { id: 'sk-2', name: 'Kubernetes', keywords: [] }
        ]
      } as any);

      const res = await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(200);

      expect(resumeFindSpy).not.toHaveBeenCalled();
      expect(CareerProfile.findOne).toHaveBeenCalledWith({ userId: ownerId });
      const body: string = res.body.data.body;
      expect(body).toContain('Principal Platform Engineer');
      expect(body).toContain('Staff Platform Engineer at CloudCore Inc');
      expect(body).toContain('Reduced p99 checkout latency by 38% across 25M daily transactions');
      expect(body).toContain('Automated canary rollouts across 140 microservices');
    });

    it('includes CareerProfile verified metrics and highlights in LLM prompt payload when resumeId is null', async () => {
      process.env.LLAMA_API_URL = 'https://llm.example.internal/v1/chat/completions';
      const doc = makeLetterDoc({ resumeId: null, body: '' });
      jest.spyOn(CoverLetter, 'findOne').mockResolvedValue(doc as any);
      jest.spyOn(CareerProfile, 'findOne').mockResolvedValue({
        userId: ownerId,
        basics: {
          name: 'Ashok Anumula',
          label: 'Principal Platform Engineer'
        },
        experiences: [
          {
            id: 'exp-1',
            company: 'CloudCore Inc',
            position: 'Staff Platform Engineer',
            highlights: ['Cut infrastructure spend by $420k per year'],
            metrics: ['Cut infrastructure spend by $420k per year']
          }
        ],
        projects: [],
        skills: [{ id: 'sk-1', name: 'Go', keywords: ['gRPC'] }]
      } as any);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Grounded LLM draft citing $420k savings.' } }]
        })
      } as any);

      await request(app)
        .post(`/api/cover-letters/${letterId}/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(200);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchInit = (global.fetch as jest.Mock).mock.calls[0][1];
      const parsedPayload = JSON.parse(fetchInit.body);
      const userMessage: string = parsedPayload.messages[1].content;
      expect(userMessage).toContain('Staff Platform Engineer at CloudCore Inc');
      expect(userMessage).toContain('Cut infrastructure spend by $420k per year');
      expect(userMessage).toContain('Go, gRPC');
    });
  });
});

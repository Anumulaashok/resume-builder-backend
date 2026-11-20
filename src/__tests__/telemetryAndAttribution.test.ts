import EventEmitter from 'events';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import resumeRoutes from '../routes/resumeRoutes';
import applicationRoutes from '../routes/applicationRoutes';
import { Resume } from '../models/Resume';
import { JobApplication } from '../models/JobApplication';
import { User } from '../models/User';
import { errorHandler } from '../middleware/errorHandler';
import {
  CapturedTelemetryPayload,
  clearCapturedTelemetryEventsForTests,
  flushTelemetry,
  getCapturedTelemetryEventsForTests,
  sanitizeDistinctId,
  sanitizeTelemetryProperties,
  setTelemetryClientForTests
} from '../services/telemetryService';

const TEST_JWT_SECRET = 'test-posthog-telemetry-secret';

const FORBIDDEN_PII_SUBSTRINGS = [
  'Grace Hopper',
  'grace.hopper@navy.mil',
  '+1 (555) 867-5309',
  '555-867-5309',
  'Built the first compiler infrastructure',
  'Reduced batch latency by 47%',
  'Anthropic',
  'Staff Distributed Systems Engineer',
  'Hiring manager prefers Go and Rust',
  'https://jobs.example.com/opening/99',
  'dana.recruiter@anthropic.example.com',
  'We are hiring a Staff Distributed Systems Engineer to scale TypeScript, Node.js, React, Docker, and Kubernetes workloads.'
];

function assertZeroPiiInPayload(payload: CapturedTelemetryPayload): void {
  const serialized = JSON.stringify(payload);
  for (const needle of FORBIDDEN_PII_SUBSTRINGS) {
    expect(serialized).not.toContain(needle);
  }
  expect(payload.distinctId).not.toContain('@');
  const keys = Object.keys(payload.properties);
  for (const forbiddenKey of [
    'name',
    'email',
    'phone',
    'summary',
    'bullets',
    'company',
    'role',
    'title',
    'jobTitle',
    'jobDescription',
    'notes',
    'contacts',
    'url',
    'prompt',
    'content',
    'sections'
  ]) {
    expect(keys).not.toContain(forbiddenKey);
  }
}

describe('PostHog Server Pipeline, Zero-PII Sanitizer & Stage-History Attribution', () => {
  const userId = new mongoose.Types.ObjectId('65f1a2b3c4d5e6f7a8b9c0d1');
  const resumeAId = new mongoose.Types.ObjectId('65f1a2b3c4d5e6f7a8b9c0e1');
  const resumeBId = new mongoose.Types.ObjectId('65f1a2b3c4d5e6f7a8b9c0e2');
  const app1Id = new mongoose.Types.ObjectId('65f1a2b3c4d5e6f7a8b9c0f1');
  const app2Id = new mongoose.Types.ObjectId('65f1a2b3c4d5e6f7a8b9c0f2');

  let app: express.Express;
  let token: string;
  let mockClientCapture: jest.Mock;
  let mockClientFlush: jest.Mock;

  beforeEach(() => {
    jest.restoreAllMocks();
    clearCapturedTelemetryEventsForTests();

    process.env.JWT_SECRET = TEST_JWT_SECRET;
    token = jwt.sign({ id: userId.toString() }, TEST_JWT_SECRET, {
      expiresIn: '1h'
    });

    mockClientCapture = jest.fn();
    mockClientFlush = jest.fn().mockResolvedValue(undefined);
    setTelemetryClientForTests({
      capture: mockClientCapture,
      flush: mockClientFlush
    });

    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: userId,
        name: 'Grace Hopper',
        email: 'grace.hopper@navy.mil',
        createdAt: new Date(Date.now() - 120_000)
      })
    } as any);

    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use('/api/applications', applicationRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    setTelemetryClientForTests(null);
    clearCapturedTelemetryEventsForTests();
  });

  describe('Sanitizer & Non-blocking Guarantees', () => {
    it('strips all PII keys, emails, phone numbers, URLs, and hashes email distinctIds', () => {
      const sanitized = sanitizeTelemetryProperties({
        resume_id: resumeAId.toString(),
        template_id: 'modern',
        match_score: 88,
        name: 'Grace Hopper',
        email: 'grace.hopper@navy.mil',
        phone: '+1 (555) 867-5309',
        summary: 'Built the first compiler infrastructure',
        bullets: ['Reduced batch latency by 47%'],
        company: 'Anthropic',
        role: 'Staff Distributed Systems Engineer',
        notes: 'Hiring manager prefers Go and Rust',
        jobDescription:
          'We are hiring a Staff Distributed Systems Engineer to scale TypeScript, Node.js, React, Docker, and Kubernetes workloads.',
        url: 'https://jobs.example.com/opening/99',
        accidental_email_field: 'dana.recruiter@anthropic.example.com',
        accidental_phone_field: '+1 (555) 867-5309',
        share_path: '/share/secret-token-abc'
      });

      expect(sanitized).toEqual({
        resume_id: resumeAId.toString(),
        template_id: 'modern',
        match_score: 88
      });

      const hashedDistinct = sanitizeDistinctId('grace.hopper@navy.mil');
      expect(hashedDistinct).not.toContain('@');
      expect(hashedDistinct).toMatch(/^user_[a-f0-9]{24}$/);
      expect(sanitizeDistinctId(userId)).toBe(userId.toString());
    });

    it('never fails API mutations when PostHog capture or flush throws', async () => {
      setTelemetryClientForTests({
        capture: () => {
          throw new Error('PostHog network unreachable');
        },
        flush: () => Promise.reject(new Error('PostHog flush timeout'))
      });

      jest.spyOn(Resume, 'countDocuments').mockResolvedValue(0 as any);
      jest.spyOn(Resume, 'create').mockImplementation((doc: any) =>
        Promise.resolve({
          _id: resumeAId,
          createdAt: new Date(),
          ...doc
        })
      );

      const res = await request(app)
        .post('/api/resumes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Distributed Systems Resume',
          templateId: 'modern',
          summary: 'Built the first compiler infrastructure',
          content: {
            basics: {
              name: 'Grace Hopper',
              email: 'grace.hopper@navy.mil',
              phone: '+1 (555) 867-5309'
            },
            sections: [],
            sectionOrder: []
          }
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      await expect(flushTelemetry(50)).resolves.toBeUndefined();
    });
  });

  describe('Resume Authoring, AI Draft Skipping, Job Match, and TXT Export Events', () => {
    it('skips temporary AI Draft creation, then emits resume_created, time_to_first_resume, and resume_completed when confirmed', async () => {
      jest.spyOn(Resume, 'countDocuments').mockResolvedValue(0 as any);
      jest.spyOn(Resume, 'create').mockImplementation((doc: any) =>
        Promise.resolve({
          _id: resumeAId,
          createdAt: new Date(),
          ...doc
        })
      );

      // Step 1: Temporary AI Draft shell from frontend generateFromPrompt -> NO events
      await request(app)
        .post('/api/resumes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'AI Draft',
          content: {
            basics: {
              name: 'Grace Hopper',
              email: 'grace.hopper@navy.mil'
            },
            sections: [],
            sectionOrder: []
          }
        })
        .expect(201);

      expect(getCapturedTelemetryEventsForTests()).toHaveLength(0);

      // Step 2: Candidate accepts AI draft -> PATCH /api/resumes/:id with confirmAiDraft=true
      const draftDoc: any = {
        _id: resumeAId,
        userId,
        title: 'Staff Distributed Systems Engineer',
        templateId: 'professional',
        summary: 'Built the first compiler infrastructure',
        createdAt: new Date(Date.now() - 10_000),
        content: {
          basics: {
            name: 'Grace Hopper',
            email: 'grace.hopper@navy.mil',
            phone: '+1 (555) 867-5309',
            summary: 'Built the first compiler infrastructure'
          },
          sections: [
            {
              id: 'work',
              type: 'WorkItem',
              title: 'Experience',
              content: [
                {
                  id: 'w1',
                  name: 'Anthropic',
                  position: 'Staff Distributed Systems Engineer',
                  highlights: ['Reduced batch latency by 47%']
                }
              ]
            }
          ],
          sectionOrder: ['work']
        },
        history: [],
        markModified: jest.fn(),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        })
      };
      jest.spyOn(Resume, 'findOne').mockResolvedValue(draftDoc);

      await request(app)
        .patch(`/api/resumes/${resumeAId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: draftDoc.title,
          summary: draftDoc.summary,
          templateId: 'professional',
          content: draftDoc.content,
          confirmAiDraft: true
        })
        .expect(200);

      const events = getCapturedTelemetryEventsForTests();
      expect(events.map((e) => e.event)).toEqual([
        'resume_created',
        'time_to_first_resume',
        'resume_completed'
      ]);

      for (const evt of events) {
        expect(evt.distinctId).toBe(userId.toString());
        expect(evt.properties.posthog_project_id).toBe('741313');
        expect(evt.properties.resume_id).toBe(resumeAId.toString());
        expect(evt.properties.template_id).toBe('professional');
        assertZeroPiiInPayload(evt);
      }

      const timingEvt = events.find((e) => e.event === 'time_to_first_resume')!;
      expect(typeof timingEvt.properties.duration_ms).toBe('number');
      expect((timingEvt.properties.duration_ms as number) >= 0).toBe(true);
    });

    it('emits jd_analyzed, ats_analysis_completed, resume_exported (txt), and time_to_export with zero PII', async () => {
      const resumeDoc: any = {
        _id: resumeAId,
        userId,
        title: 'Staff Distributed Systems Engineer',
        templateId: 'modern',
        summary: 'Built the first compiler infrastructure',
        createdAt: new Date(Date.now() - 45_000),
        content: {
          basics: {
            name: 'Grace Hopper',
            label: 'Staff Distributed Systems Engineer',
            email: 'grace.hopper@navy.mil',
            phone: '+1 (555) 867-5309'
          },
          sections: [
            {
              id: 'skills',
              type: 'SkillItem',
              title: 'Skills',
              content: [{ id: 's1', name: 'TypeScript' }, { id: 's2', name: 'Node.js' }]
            }
          ],
          sectionOrder: ['skills']
        },
        toObject() {
          return this;
        }
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc);

      await request(app)
        .post(`/api/resumes/${resumeAId}/job-match`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          jobTitle: 'Staff Distributed Systems Engineer',
          jobDescription:
            'We are hiring a Staff Distributed Systems Engineer to scale TypeScript, Node.js, React, Docker, and Kubernetes workloads.'
        })
        .expect(200);

      await request(app)
        .get(`/api/resumes/${resumeAId}/export.txt`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const events = getCapturedTelemetryEventsForTests();
      expect(events.map((e) => e.event)).toEqual([
        'jd_analyzed',
        'ats_analysis_completed',
        'resume_exported',
        'time_to_export'
      ]);

      for (const evt of events) {
        expect(evt.distinctId).toBe(userId.toString());
        assertZeroPiiInPayload(evt);
      }

      const txtExport = events.find((e) => e.event === 'resume_exported')!;
      expect(txtExport.properties.format).toBe('txt');
      const timeToExport = events.find((e) => e.event === 'time_to_export')!;
      expect(timeToExport.properties.format).toBe('txt');
      expect((timeToExport.properties.duration_ms as number) >= 40_000).toBe(true);
    });
  });

  describe('Stage History, Sticky reachedInterviewAt, and Attribution Endpoint', () => {
    it('stamps missing appliedAt on wishlist->applied, preserves sticky reachedInterviewAt on interview->rejected, and emits sanitized application_stage_changed', async () => {
      const appDoc: any = {
        _id: app1Id,
        userId,
        company: 'Anthropic',
        role: 'Staff Distributed Systems Engineer',
        url: 'https://jobs.example.com/opening/99',
        notes: 'Hiring manager prefers Go and Rust',
        contacts: [
          {
            name: 'Dana Recruiter',
            email: 'dana.recruiter@anthropic.example.com',
            role: 'Recruiter'
          }
        ],
        status: 'wishlist',
        order: 0,
        appliedAt: null,
        reachedInterviewAt: null,
        stageHistory: [{ status: 'wishlist', changedAt: new Date('2026-11-01T00:00:00Z') }],
        resumeId: resumeAId,
        markModified: jest.fn(),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        })
      };

      // 1. Reorder wishlist -> applied stamps appliedAt & stageHistory
      const findSpy = jest
        .spyOn(JobApplication, 'find')
        .mockResolvedValueOnce([appDoc] as any)
        .mockResolvedValueOnce([
          {
            ...appDoc,
            status: 'applied',
            order: 0,
            appliedAt: new Date(),
            stageHistory: [
              ...appDoc.stageHistory,
              { status: 'applied', changedAt: new Date() }
            ]
          }
        ] as any);

      const bulkSpy = jest.spyOn(JobApplication, 'bulkWrite').mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1
      } as any);

      const reorderAppliedRes = await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({
          moves: [{ id: app1Id.toString(), status: 'applied', order: 0 }]
        })
        .expect(200);

      const firstOp = (bulkSpy.mock.calls[0][0] as any[])[0].updateOne;
      expect(firstOp.update.$set.status).toBe('applied');
      expect(firstOp.update.$set.appliedAt).toBeInstanceOf(Date);
      expect(firstOp.update.$push.stageHistory.status).toBe('applied');
      expect(reorderAppliedRes.body.data.applications).toHaveLength(1);
      expect(reorderAppliedRes.body.data.applications[0].appliedAt).toBeTruthy();

      // 2. PATCH applied -> interview sets sticky reachedInterviewAt
      appDoc.status = 'applied';
      appDoc.appliedAt = firstOp.update.$set.appliedAt;
      appDoc.stageHistory.push({ status: 'applied', changedAt: appDoc.appliedAt });
      jest.spyOn(JobApplication, 'findOne').mockResolvedValue(appDoc);

      const interviewRes = await request(app)
        .patch(`/api/applications/${app1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'interview' })
        .expect(200);

      const firstInterviewAt = interviewRes.body.data.reachedInterviewAt;
      expect(firstInterviewAt).toBeTruthy();
      expect(appDoc.reachedInterviewAt).toBeInstanceOf(Date);

      // 3. PATCH interview -> rejected keeps reachedInterviewAt intact!
      const rejectedRes = await request(app)
        .patch(`/api/applications/${app1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'rejected' })
        .expect(200);

      expect(rejectedRes.body.data.status).toBe('rejected');
      expect(rejectedRes.body.data.reachedInterviewAt).toBe(firstInterviewAt);
      expect(rejectedRes.body.data.stageHistory.map((h: any) => h.status)).toEqual([
        'wishlist',
        'applied',
        'interview',
        'rejected'
      ]);

      // 4. GET /api/applications/attribution preserves historical interviewRate
      findSpy.mockResolvedValueOnce([
        appDoc,
        {
          _id: app2Id,
          userId,
          company: 'Stripe',
          role: 'Backend Engineer',
          status: 'applied',
          order: 1,
          appliedAt: new Date(),
          reachedInterviewAt: null,
          stageHistory: [{ status: 'applied', changedAt: new Date() }],
          resumeId: resumeBId
        }
      ] as any);
      jest.spyOn(Resume, 'find').mockResolvedValue([
        { _id: resumeAId, userId, title: 'Systems Resume', templateId: 'modern' },
        { _id: resumeBId, userId, title: 'General Resume', templateId: 'professional' }
      ] as any);

      const attrRes = await request(app)
        .get('/api/applications/attribution')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(attrRes.body.success).toBe(true);
      expect(attrRes.body.data.totals).toMatchObject({
        totalApplications: 2,
        submittedCount: 2,
        interviewCount: 1,
        interviewRate: 50
      });

      const resumeAMetrics = attrRes.body.data.byResume.find(
        (r: any) => r.resumeId === resumeAId.toString()
      );
      expect(resumeAMetrics).toMatchObject({
        templateId: 'modern',
        submittedCount: 1,
        interviewCount: 1,
        interviewRate: 100
      });

      const modernTemplateMetrics = attrRes.body.data.byTemplate.find(
        (t: any) => t.templateId === 'modern'
      );
      expect(modernTemplateMetrics).toMatchObject({
        resumeCount: 1,
        submittedCount: 1,
        interviewCount: 1,
        interviewRate: 100
      });

      const stageEvents = getCapturedTelemetryEventsForTests().filter(
        (e) => e.event === 'application_stage_changed'
      );
      expect(stageEvents).toHaveLength(3);
      expect(stageEvents[2].properties).toMatchObject({
        from_status: 'interview',
        to_status: 'rejected',
        reached_interview: true,
        has_linked_resume: true,
        resume_id: resumeAId.toString()
      });
      for (const evt of stageEvents) {
        assertZeroPiiInPayload(evt);
      }
    });
  });

  describe('Serverless Flush Handlers (Netlify & Vercel)', () => {
    it('flushes PostHog telemetry in Netlify handler before returning', async () => {
      const { handler: netlifyHandler } = await import(
        '../../netlify/functions/api'
      );
      const response: any = await netlifyHandler(
        {
          httpMethod: 'GET',
          path: '/.netlify/functions/api/health',
          headers: {}
        },
        {}
      );
      expect(response.statusCode).toBe(200);
      expect(mockClientFlush).toHaveBeenCalled();
    });

    it('flushes PostHog telemetry in Vercel api/index.js handler on response finish', async () => {
      const distFlushSpy = jest.fn().mockResolvedValue(undefined);
      const mockExpressApp = jest.fn((_req: any, res: any) => {
        res.end();
      });

      let vercelHandler: any;
      jest.isolateModules(() => {
        jest.doMock('../../dist/app', () => ({ default: mockExpressApp }));
        jest.doMock('../../dist/config/db.config', () => ({
          connectDB: jest.fn().mockResolvedValue(undefined)
        }));
        jest.doMock('../../dist/services/telemetryService', () => ({
          flushTelemetry: distFlushSpy
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vercelHandler = require('../../api/index.js');
      });

      const fakeRes: any = Object.assign(new EventEmitter(), {
        statusCode: 200,
        end: function (this: any) {
          this.emit('finish');
        }
      });
      const fakeReq: any = Object.assign(new EventEmitter(), {
        method: 'POST',
        url: '/api/resumes',
        headers: {}
      });

      await vercelHandler(fakeReq, fakeRes);
      expect(mockExpressApp).toHaveBeenCalledTimes(1);
      expect(distFlushSpy).toHaveBeenCalledTimes(1);
    });
  });
});

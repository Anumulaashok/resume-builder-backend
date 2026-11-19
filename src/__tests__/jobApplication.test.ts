import express, { Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { JobApplication, APPLICATION_STATUSES } from '../models/JobApplication';
import { User } from '../models/User';
import applicationRoutes from '../routes/applicationRoutes';
import { errorHandler } from '../middleware/errorHandler';

describe('JobApplication Model & /api/applications API', () => {
  const userAId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const userBId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439099');
  const resumeId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');
  const coverLetterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439033');
  const app1Id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439044');
  const app2Id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439055');
  const app3Id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439066');

  let app: Express;
  const originalJwtSecret = process.env.JWT_SECRET;

  const signTokenFor = (id: mongoose.Types.ObjectId) =>
    jwt.sign({ id: id.toString() }, process.env.JWT_SECRET!);

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.JWT_SECRET = 'test-secret-for-job-tracker';

    jest.spyOn(User, 'findById').mockImplementation((id: any) => {
      const idStr = id?.toString();
      const userDoc =
        idStr === userAId.toString()
          ? { _id: userAId, email: 'alice@example.com', name: 'Alice' }
          : idStr === userBId.toString()
          ? { _id: userBId, email: 'bob@example.com', name: 'Bob' }
          : null;
      return {
        select: jest.fn().mockResolvedValue(userDoc)
      } as any;
    });

    app = express();
    app.use(express.json());
    app.use('/api/applications', applicationRoutes);
    app.use(errorHandler);
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  describe('JobApplication Mongoose Schema', () => {
    it('supports all specified fields, defaults, and contacts array', () => {
      const doc = new JobApplication({
        userId: userAId,
        company: '  Acme Corp  ',
        role: '  Staff Frontend Engineer  ',
        location: 'Remote',
        url: 'https://acme.example.com/jobs/42',
        status: 'interview',
        order: 2,
        appliedAt: new Date('2026-11-10T00:00:00.000Z'),
        salary: '$180k - $210k',
        notes: 'Strong technical alignment',
        resumeId,
        coverLetterId,
        jobDescription: 'Build resilient UI systems with React and TypeScript.',
        contacts: [{ name: 'Dana Lee', email: 'dana@acme.example.com', role: 'Hiring Manager' }],
        nextActionAt: new Date('2026-11-22T17:00:00.000Z'),
        nextActionNote: 'Send architecture portfolio link'
      });

      const validationError = doc.validateSync();
      expect(validationError).toBeUndefined();
      expect(doc.company).toBe('Acme Corp');
      expect(doc.role).toBe('Staff Frontend Engineer');
      expect(doc.status).toBe('interview');
      expect(doc.order).toBe(2);
      expect(doc.contacts).toHaveLength(1);
      expect(doc.contacts[0].name).toBe('Dana Lee');
    });

    it('applies default status="wishlist", order=0, and contacts=[]', () => {
      const doc = new JobApplication({
        userId: userAId,
        company: 'Globex',
        role: 'Backend Engineer'
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.status).toBe('wishlist');
      expect(doc.order).toBe(0);
      expect(doc.contacts).toEqual([]);
    });

    it('enforces the 5-value status enum on the Mongoose schema', () => {
      expect(APPLICATION_STATUSES).toEqual([
        'wishlist',
        'applied',
        'interview',
        'offer',
        'rejected'
      ]);

      const invalidDoc = new JobApplication({
        userId: userAId,
        company: 'Globex',
        role: 'Backend Engineer',
        status: 'archived' as any
      });

      const err = invalidDoc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors.status).toBeDefined();
    });
  });

  describe('Authentication & User Scoping', () => {
    it('rejects unauthenticated requests with 401 across all endpoints', async () => {
      await request(app).get('/api/applications').expect(401);
      await request(app).post('/api/applications').send({ company: 'X', role: 'Y' }).expect(401);
      await request(app).patch(`/api/applications/${app1Id}`).send({ role: 'Z' }).expect(401);
      await request(app).delete(`/api/applications/${app1Id}`).expect(401);
      await request(app)
        .patch('/api/applications/reorder')
        .send({ moves: [{ id: app1Id.toString(), status: 'applied', order: 0 }] })
        .expect(401);
    });

    it('scopes GET /api/applications strictly to req.user._id and supports optional status filter', async () => {
      const tokenA = signTokenFor(userAId);
      const sortMock = jest.fn().mockResolvedValue([
        { _id: app1Id, userId: userAId, company: 'Stripe', role: 'SWE', status: 'applied', order: 0 }
      ]);
      const findSpy = jest.spyOn(JobApplication, 'find').mockReturnValue({ sort: sortMock } as any);

      const res = await request(app)
        .get('/api/applications?status=applied')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(findSpy).toHaveBeenCalledWith({ userId: userAId, status: 'applied' });
      expect(sortMock).toHaveBeenCalledWith({ status: 1, order: 1, updatedAt: -1 });
    });

    it('ignores spoofed userId in POST /api/applications and binds userId to req.user._id', async () => {
      const tokenA = signTokenFor(userAId);
      const createSpy = jest
        .spyOn(JobApplication, 'create')
        .mockImplementation((payload: any) => Promise.resolve({ _id: app1Id, ...payload }));

      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          userId: userBId.toString(),
          _id: app2Id.toString(),
          company: 'Linear',
          role: 'Product Engineer',
          status: 'applied',
          order: 1,
          resumeId: resumeId.toString(),
          contacts: [{ name: 'Sam Rivera', email: 'sam@linear.example.com', role: 'Recruiter' }]
        })
        .expect(201);

      expect(createSpy).toHaveBeenCalledTimes(1);
      const createdArg = createSpy.mock.calls[0][0] as unknown as Record<string, any>;
      expect(createdArg.userId).toEqual(userAId);
      expect(createdArg.userId).not.toEqual(userBId.toString());
      expect(createdArg._id).toBeUndefined();
      expect(createdArg.appliedAt).toBeInstanceOf(Date);
      expect(res.body.data.company).toBe('Linear');
    });

    it('prevents User A from updating or deleting User B applications and strips userId on PATCH', async () => {
      const tokenA = signTokenFor(userAId);

      // User B owns app2Id -> findOne with userId=userAId returns null -> 404
      const findOneSpy = jest.spyOn(JobApplication, 'findOne').mockResolvedValueOnce(null);

      await request(app)
        .patch(`/api/applications/${app2Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'offer', userId: userAId.toString() })
        .expect(404);

      expect(findOneSpy).toHaveBeenCalledWith({
        _id: app2Id.toString(),
        userId: userAId
      });

      // Updating own doc ignores spoofed userId in body
      const ownDoc: any = {
        _id: app1Id,
        userId: userAId,
        company: 'Vercel',
        role: 'Frontend Engineer',
        status: 'applied',
        order: 0,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        })
      };
      findOneSpy.mockResolvedValueOnce(ownDoc);

      const updateRes = await request(app)
        .patch(`/api/applications/${app1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          status: 'interview',
          salary: '$195k',
          userId: userBId.toString()
        })
        .expect(200);

      expect(ownDoc.userId).toEqual(userAId);
      expect(updateRes.body.data.status).toBe('interview');
      expect(updateRes.body.data.salary).toBe('$195k');

      // Delete scopes by userId and returns 404 when owned by someone else
      const deleteSpy = jest.spyOn(JobApplication, 'findOneAndDelete').mockResolvedValueOnce(null);
      await request(app)
        .delete(`/api/applications/${app2Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
      expect(deleteSpy).toHaveBeenCalledWith({
        _id: app2Id.toString(),
        userId: userAId
      });

      // Delete succeeds when owned by caller
      deleteSpy.mockResolvedValueOnce({ _id: app1Id, userId: userAId } as any);
      await request(app)
        .delete(`/api/applications/${app1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });
  });

  describe('Status Enum & Input Validation', () => {
    it('rejects invalid status values on create, update, list query, and reorder with 400', async () => {
      const tokenA = signTokenFor(userAId);

      const createBadStatus = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ company: 'Datadog', role: 'SWE', status: 'phone-screen' })
        .expect(400);
      expect(createBadStatus.body.success).toBe(false);

      const updateBadStatus = await request(app)
        .patch(`/api/applications/${app1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'hired' })
        .expect(400);
      expect(updateBadStatus.body.success).toBe(false);

      const listBadStatus = await request(app)
        .get('/api/applications?status=unknown')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
      expect(listBadStatus.body.success).toBe(false);

      const reorderBadStatus = await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves: [{ id: app1Id.toString(), status: 'onsite', order: 0 }] })
        .expect(400);
      expect(reorderBadStatus.body.success).toBe(false);
    });

    it('rejects missing company/role, invalid contact email, and invalid resumeId', async () => {
      const tokenA = signTokenFor(userAId);

      await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ company: '   ', role: 'Engineer' })
        .expect(400);

      await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          company: 'Figma',
          role: 'Design Engineer',
          contacts: [{ name: 'Alex', email: 'not-an-email', role: 'Manager' }]
        })
        .expect(400);

      await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          company: 'Figma',
          role: 'Design Engineer',
          resumeId: 'not-a-mongo-id'
        })
        .expect(400);
    });
  });

  describe('Batch Reorder: PATCH /api/applications/reorder', () => {
    it('reorders multiple cards across and within columns in one bulkWrite request scoped to req.user', async () => {
      const tokenA = signTokenFor(userAId);
      const bulkSpy = jest.spyOn(JobApplication, 'bulkWrite').mockResolvedValue({
        matchedCount: 3,
        modifiedCount: 3
      } as any);

      const moves = [
        { id: app1Id.toString(), status: 'interview', order: 0 },
        { id: app2Id.toString(), status: 'interview', order: 1 },
        { id: app3Id.toString(), status: 'applied', order: 0 }
      ];

      const res = await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves, userId: userBId.toString() })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedCount).toBe(3);
      expect(bulkSpy).toHaveBeenCalledTimes(1);

      const bulkOps = bulkSpy.mock.calls[0][0] as any[];
      expect(bulkOps).toHaveLength(3);
      expect(bulkOps[0]).toEqual({
        updateOne: {
          filter: { _id: app1Id.toString(), userId: userAId },
          update: { $set: { status: 'interview', order: 0 } }
        }
      });
      expect(bulkOps[1]).toEqual({
        updateOne: {
          filter: { _id: app2Id.toString(), userId: userAId },
          update: { $set: { status: 'interview', order: 1 } }
        }
      });
      expect(bulkOps[2]).toEqual({
        updateOne: {
          filter: { _id: app3Id.toString(), userId: userAId },
          update: { $set: { status: 'applied', order: 0 } }
        }
      });
    });

    it('returns 404 when attempting to reorder an application belonging to another user', async () => {
      const tokenA = signTokenFor(userAId);
      jest.spyOn(JobApplication, 'bulkWrite').mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0
      } as any);

      const res = await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves: [{ id: app2Id.toString(), status: 'offer', order: 0 }] })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('rejects empty moves array or negative/non-numeric order values with 400', async () => {
      const tokenA = signTokenFor(userAId);

      await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves: [] })
        .expect(400);

      await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves: [{ id: app1Id.toString(), status: 'applied', order: -1 }] })
        .expect(400);

      await request(app)
        .patch('/api/applications/reorder')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ moves: [{ id: app1Id.toString(), status: 'applied', order: 'first' }] })
        .expect(400);
    });
  });
});

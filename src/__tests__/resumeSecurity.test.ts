import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';

jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = { _id: 'owner-1', email: 'owner@example.com' };
    next();
  }
}));

describe('Resume field allowlist and error mapping', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use(errorHandler);
  });

  const makeDoc = () => ({
    _id: 'resume-1',
    userId: 'owner-1',
    title: 'Original',
    content: { basics: { name: 'A', email: 'a@x.com' }, sections: [], sectionOrder: [] },
    sharing: { isPublic: false, shareToken: null, privacy: { hideEmail: false, hidePhone: false, hideAddress: false } },
    history: [{ content: {}, updatedAt: new Date() }],
    save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); })
  });

  it('ignores userId, sharing and history in PATCH body', async () => {
    const doc: any = makeDoc();
    jest.spyOn(Resume, 'findOne').mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/resumes/resume-1')
      .send({
        title: 'Updated',
        content: { basics: { name: 'A', email: 'a@x.com' }, sections: [], sectionOrder: [] },
        userId: 'attacker-2',
        sharing: { isPublic: true, shareToken: 'chosen-token' },
        history: []
      });

    expect(res.status).toBe(200);
    expect(doc.title).toBe('Updated');
    expect(doc.userId).toBe('owner-1');
    expect(doc.sharing.shareToken).toBeNull();
    expect(doc.sharing.isPublic).toBe(false);
    expect(doc.history).toHaveLength(1);
  });

  it('ignores sharing and history on create and binds userId to the caller', async () => {
    const createSpy = jest.spyOn(Resume, 'create').mockImplementation((data: any) => Promise.resolve(data));

    await request(app)
      .post('/api/resumes')
      .send({
        title: 'New',
        content: { basics: { name: 'A', email: 'a@x.com' }, sections: [], sectionOrder: [] },
        userId: 'attacker-2',
        sharing: { isPublic: true, shareToken: 'chosen-token' },
        history: [{ content: {} }]
      });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload: any = createSpy.mock.calls[0][0];
    expect(payload.userId).toBe('owner-1');
    expect(payload.sharing).toBeUndefined();
    expect(payload.history).toBeUndefined();
  });

  it('maps a malformed ObjectId (CastError) to 404', async () => {
    jest.spyOn(Resume, 'findOne').mockRejectedValue(
      new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id')
    );

    const res = await request(app).get('/api/resumes/not-an-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

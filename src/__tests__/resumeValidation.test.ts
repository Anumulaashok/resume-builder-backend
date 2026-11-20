import express from 'express';
import request from 'supertest';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';

jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = { _id: 'owner-1', email: 'owner@example.com' };
    next();
  }
}));

describe('Resume save validation (POST, PUT, PATCH)', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use(errorHandler);
  });

  const validPayload = {
    title: 'Senior Software Engineer Resume',
    content: {
      basics: {
        name: 'Ada Lovelace',
        email: 'ada@example.com'
      },
      sections: [],
      sectionOrder: []
    }
  };

  it('returns HTTP 400 with readable message and field-level errors when name is missing on POST /api/resumes', async () => {
    const res = await request(app)
      .post('/api/resumes')
      .send({
        ...validPayload,
        content: {
          ...validPayload.content,
          basics: {
            name: '   ',
            email: 'ada@example.com'
          }
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Full name is required');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'content.basics.name',
          field: 'content.basics.name',
          msg: 'Full name is required',
          message: 'Full name is required'
        })
      ])
    );
  });

  it('returns HTTP 400 with readable message and field-level errors when email is invalid on PUT /api/resumes/:resumeId', async () => {
    const res = await request(app)
      .put('/api/resumes/resume-123')
      .send({
        ...validPayload,
        content: {
          ...validPayload.content,
          basics: {
            name: 'Ada Lovelace',
            email: 'not-an-email'
          }
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Please enter a valid email address');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'content.basics.email',
          field: 'content.basics.email',
          msg: 'Please enter a valid email address',
          message: 'Please enter a valid email address'
        })
      ])
    );
  });

  it('combines multiple field validation errors into a readable summary message on PATCH /api/resumes/:resumeId', async () => {
    const res = await request(app)
      .patch('/api/resumes/resume-123')
      .send({
        title: 'Untitled Resume',
        content: {
          basics: {
            name: '',
            email: ''
          },
          sections: [],
          sectionOrder: []
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Full name is required; Email address is required');
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'content.basics.name',
          message: 'Full name is required'
        }),
        expect.objectContaining({
          field: 'content.basics.email',
          message: 'Email address is required'
        })
      ])
    );
  });

  it('accepts valid resume payloads on POST /api/resumes', async () => {
    jest
      .spyOn(Resume, 'create')
      .mockImplementation((data: any) => Promise.resolve({ _id: 'res-new-1', ...data }));

    const res = await request(app).post('/api/resumes').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe('res-new-1');
  });
});

import express from 'express';
import request from 'supertest';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';

// Mock auth middleware to simulate authenticated user
jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = { _id: 'mock-user-123', email: 'owner@example.com' };
    next();
  }
}));

describe('Token-Based Public Share Links & Privacy Controls', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use(errorHandler);
  });

  describe('Unauthenticated Public Token Access: GET /api/resumes/share/:shareToken', () => {
    it('returns 404 when share token is not found or inactive', async () => {
      jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);

      const res = await request(app).get('/api/resumes/share/nonexistent-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found or share link is inactive or revoked/i);
    });

    it('returns the shared resume with sensitive internals stripped', async () => {
      const mockResumeData = {
        _id: 'resume-1',
        userId: 'owner-id',
        title: 'Software Engineer Resume',
        templateId: 'modern',
        sharing: {
          isPublic: true,
          shareToken: 'valid-token-123',
          privacy: {
            hideEmail: false,
            hidePhone: false,
            hideAddress: false
          }
        },
        content: {
          basics: {
            name: 'Jane Doe',
            label: 'Tech Lead',
            email: 'jane@example.com',
            phone: '555-1234',
            location: {
              address: '123 Main St',
              city: 'San Francisco',
              countryCode: 'US'
            }
          },
          sections: [],
          sectionOrder: []
        },
        history: [{ content: {}, updatedAt: new Date() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResumeData as any);

      const res = await request(app).get('/api/resumes/share/valid-token-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Software Engineer Resume');
      expect(res.body.data.content.basics.name).toBe('Jane Doe');
      expect(res.body.data.content.basics.email).toBe('jane@example.com');
      expect(res.body.data.content.basics.phone).toBe('555-1234');
      expect(res.body.data.content.basics.location.address).toBe('123 Main St');
      // Crucial: ensure internal userId and history are stripped
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.history).toBeUndefined();
    });

    it('strictly redacts email, phone, and address when marked private', async () => {
      const mockResumeData = {
        _id: 'resume-2',
        title: 'Private Candidate',
        sharing: {
          isPublic: true,
          shareToken: 'secure-token-456',
          privacy: {
            hideEmail: true,
            hidePhone: true,
            hideAddress: true
          }
        },
        content: {
          basics: {
            name: 'John Smith',
            label: 'Architect',
            email: 'secret@domain.com',
            phone: '+1-555-987-6543',
            location: {
              address: '99 Secret Avenue',
              city: 'New York',
              countryCode: 'US'
            }
          },
          sections: [],
          sectionOrder: []
        }
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResumeData as any);

      const res = await request(app).get('/api/resumes/share/secure-token-456');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const basics = res.body.data.content.basics;
      expect(basics.name).toBe('John Smith');
      // Verify complete redaction
      expect(basics.email).toBeUndefined();
      expect(basics.phone).toBeUndefined();
      expect(basics.location.address).toBeUndefined();
      // Non-hidden location details like city should remain
      expect(basics.location.city).toBe('New York');
    });

    it('rejects all non-read HTTP methods with 405 Method Not Allowed', async () => {
      const postRes = await request(app)
        .post('/api/resumes/share/valid-token-123')
        .send({ fake: 'data' });
      expect(postRes.status).toBe(405);
      expect(postRes.body.success).toBe(false);

      const putRes = await request(app)
        .put('/api/resumes/share/valid-token-123')
        .send({ fake: 'data' });
      expect(putRes.status).toBe(405);

      const patchRes = await request(app)
        .patch('/api/resumes/share/valid-token-123')
        .send({ fake: 'data' });
      expect(patchRes.status).toBe(405);

      const delRes = await request(app)
        .delete('/api/resumes/share/valid-token-123');
      expect(delRes.status).toBe(405);
    });
  });

  describe('Authenticated Share Management: /api/resumes/:resumeId/share', () => {
    it('generates a share token when toggling public sharing on', async () => {
      const mockResumeInstance: any = {
        _id: 'resume-10',
        userId: 'mock-user-123',
        sharing: {
          isPublic: false,
          shareToken: null,
          privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResumeInstance);

      const res = await request(app)
        .patch('/api/resumes/resume-10/share')
        .send({ isPublic: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPublic).toBe(true);
      expect(typeof res.body.data.shareToken).toBe('string');
      expect(res.body.data.shareToken.length).toBeGreaterThan(10);
      expect(mockResumeInstance.save).toHaveBeenCalled();
    });

    it('revokes the share token when toggling public sharing off', async () => {
      const mockResumeInstance: any = {
        _id: 'resume-10',
        userId: 'mock-user-123',
        sharing: {
          isPublic: true,
          shareToken: 'existing-token-abc',
          privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResumeInstance);

      const res = await request(app)
        .patch('/api/resumes/resume-10/share')
        .send({ isPublic: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPublic).toBe(false);
      expect(res.body.data.shareToken).toBeNull();
      expect(mockResumeInstance.save).toHaveBeenCalled();
    });

    it('updates contact privacy settings independently', async () => {
      const mockResumeInstance: any = {
        _id: 'resume-10',
        userId: 'mock-user-123',
        sharing: {
          isPublic: true,
          shareToken: 'token-xyz',
          privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Resume, 'findOne').mockResolvedValue(mockResumeInstance);

      const res = await request(app)
        .patch('/api/resumes/resume-10/share')
        .send({
          privacy: {
            hideEmail: true,
            hidePhone: true,
            hideAddress: false
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.privacy.hideEmail).toBe(true);
      expect(res.body.data.privacy.hidePhone).toBe(true);
      expect(res.body.data.privacy.hideAddress).toBe(false);
      expect(mockResumeInstance.save).toHaveBeenCalled();
    });
  });
});

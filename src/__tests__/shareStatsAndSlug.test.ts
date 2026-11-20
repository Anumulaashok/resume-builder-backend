import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import { formatUtcDate } from '../utils/shareUtils';

describe('Resume Sharing Analytics, Bot/Owner Filtering, and Custom URL Slugs', () => {
  const JWT_SECRET = 'test-jwt-secret-for-share-stats';
  const OWNER_ID = '507f1f77bcf86cd799439011';
  const OTHER_USER_ID = '507f1f77bcf86cd799439099';

  let ownerToken: string;
  let otherUserToken: string;
  let previousSecret: string | undefined;

  beforeAll(() => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
    ownerToken = jwt.sign({ id: OWNER_ID }, JWT_SECRET, { expiresIn: '1h' });
    otherUserToken = jwt.sign({ id: OTHER_USER_ID }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(() => {
    process.env.JWT_SECRET = previousSecret;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(User, 'findById').mockImplementation(((id: string) => ({
      select: jest.fn().mockResolvedValue(
        id === OWNER_ID
          ? { _id: OWNER_ID, name: 'Owner', email: 'owner@example.com' }
          : id === OTHER_USER_ID
            ? { _id: OTHER_USER_ID, name: 'Visitor', email: 'visitor@example.com' }
            : null
      )
    })) as any);
  });

  const makeMockResumeDoc = (overrides: Record<string, any> = {}) => {
    const doc: any = {
      _id: '507f1f77bcf86cd799439055',
      userId: OWNER_ID,
      title: 'Staff Engineer Resume',
      summary: 'Distributed systems architect',
      templateId: 'modern',
      sharing: {
        isPublic: true,
        shareToken: 'tok-public-123',
        slug: 'jane-doe-cv',
        viewCount: 0,
        lastViewedAt: null,
        dailyViews: [],
        privacy: {
          hideEmail: false,
          hidePhone: false,
          hideAddress: false
        }
      },
      content: {
        basics: {
          name: 'Jane Doe',
          label: 'Staff Engineer',
          email: 'jane@example.com',
          phone: '+1-555-0100',
          location: {
            address: '742 Evergreen Terrace',
            city: 'Seattle',
            countryCode: 'US'
          }
        },
        sections: [],
        sectionOrder: []
      },
      history: [{ content: {}, updatedAt: new Date() }],
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-18T10:00:00.000Z',
      markModified: jest.fn(),
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
      ...overrides
    };
    return doc;
  };

  describe('View recording, owner exclusion, bot filtering & 30-day pruning', () => {
    it('records a view (viewCount, lastViewedAt, dailyViews) when fetched by an anonymous visitor via share token', async () => {
      const resumeDoc = makeMockResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc);

      const todayStr = formatUtcDate(new Date());
      const res = await request(app)
        .get('/api/resumes/share/tok-public-123')
        .set(
          'User-Agent',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
        );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(resumeDoc.sharing.viewCount).toBe(1);
      expect(resumeDoc.sharing.lastViewedAt).toBeInstanceOf(Date);
      expect(resumeDoc.sharing.dailyViews).toEqual([{ date: todayStr, count: 1 }]);
      expect(resumeDoc.save).toHaveBeenCalledTimes(1);
      // Analytics must not leak in public payload
      expect(res.body.data.sharing.viewCount).toBeUndefined();
      expect(res.body.data.sharing.dailyViews).toBeUndefined();
    });

    it('increments today count and prunes dailyViews older than 30 days on custom slug views', async () => {
      const now = new Date();
      const todayStr = formatUtcDate(now);
      const tenDaysAgoStr = formatUtcDate(
        new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      );
      const fortyFiveDaysAgoStr = formatUtcDate(
        new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000)
      );

      const resumeDoc = makeMockResumeDoc({
        targetRole: 'Principal Platform Engineer',
        targetCompany: 'Hidden Corp',
        jobDescription: 'Confidential role specification',
        atsScore: 93,
        parentResumeId: '507f1f77bcf86cd799439011',
        sharing: {
          isPublic: true,
          shareToken: 'tok-public-123',
          slug: 'jane-doe-cv',
          viewCount: 9,
          lastViewedAt: new Date(now.getTime() - 86400000),
          dailyViews: [
            { date: fortyFiveDaysAgoStr, count: 4 },
            { date: tenDaysAgoStr, count: 3 },
            { date: todayStr, count: 2 }
          ],
          privacy: { hideEmail: true, hidePhone: true, hideAddress: true }
        }
      });
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc);

      const res = await request(app).get('/api/public/r/jane-doe-cv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Redacts private contact fields just like share token endpoint
      expect(res.body.data.content.basics.email).toBeUndefined();
      expect(res.body.data.content.basics.phone).toBeUndefined();
      expect(res.body.data.content.basics.location.address).toBeUndefined();
      expect(res.body.data.content.basics.location.city).toBe('Seattle');
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.history).toBeUndefined();
      expect(res.body.data.targetRole).toBeUndefined();
      expect(res.body.data.targetCompany).toBeUndefined();
      expect(res.body.data.jobDescription).toBeUndefined();
      expect(res.body.data.atsScore).toBeUndefined();
      expect(res.body.data.parentResumeId).toBeUndefined();

      // Increments lifetime viewCount & today's count, prunes 45-day-old entry
      expect(resumeDoc.sharing.viewCount).toBe(10);
      expect(resumeDoc.sharing.dailyViews).toEqual([
        { date: tenDaysAgoStr, count: 3 },
        { date: todayStr, count: 3 }
      ]);
      expect(resumeDoc.save).toHaveBeenCalledTimes(1);
    });

    it('does NOT record a view when fetched by the resume owner, but DOES record for another logged-in user', async () => {
      const resumeDoc = makeMockResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc);

      // Owner views own public resume via custom slug -> 200 OK, 0 views recorded
      const ownerRes = await request(app)
        .get('/api/public/r/jane-doe-cv')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('User-Agent', 'Mozilla/5.0 Chrome/126.0');

      expect(ownerRes.status).toBe(200);
      expect(resumeDoc.sharing.viewCount).toBe(0);
      expect(resumeDoc.sharing.lastViewedAt).toBeNull();
      expect(resumeDoc.sharing.dailyViews).toEqual([]);
      expect(resumeDoc.save).not.toHaveBeenCalled();

      // Different user views same public resume -> records 1 view
      const otherRes = await request(app)
        .get('/api/public/r/jane-doe-cv')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .set('User-Agent', 'Mozilla/5.0 Chrome/126.0');

      expect(otherRes.status).toBe(200);
      expect(resumeDoc.sharing.viewCount).toBe(1);
      expect(resumeDoc.save).toHaveBeenCalledTimes(1);
    });

    it('ignores obvious bots by User-Agent while still serving the public resume', async () => {
      const botAgents = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Twitterbot/1.0',
        'facebookexternalhit/1.1',
        'curl/8.5.0',
        'python-requests/2.31.0',
        'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/125.0.0.0 Safari/537.36'
      ];

      for (const ua of botAgents) {
        const resumeDoc = makeMockResumeDoc();
        jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(resumeDoc);

        const res = await request(app)
          .get('/api/public/r/jane-doe-cv')
          .set('User-Agent', ua);

        expect(res.status).toBe(200);
        expect(resumeDoc.sharing.viewCount).toBe(0);
        expect(resumeDoc.sharing.lastViewedAt).toBeNull();
        expect(resumeDoc.save).not.toHaveBeenCalled();
      }
    });

    it('returns 404 for unknown/inactive slug and 405 for non-GET methods on /api/public/r/:slug', async () => {
      jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(null as any);
      const notFoundRes = await request(app).get('/api/public/r/unknown-slug');
      expect(notFoundRes.status).toBe(404);

      const postRes = await request(app).post('/api/public/r/jane-doe-cv').send({});
      expect(postRes.status).toBe(405);
    });
  });

  describe('Custom Slug Management: PATCH /api/resumes/:id/sharing/slug & GET .../slug/check', () => {
    it('saves a valid unique slug for the owner and ignores userId in request body', async () => {
      const resumeDoc = makeMockResumeDoc({
        sharing: {
          isPublic: true,
          shareToken: 'tok-1',
          slug: undefined,
          privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
        }
      });

      const findOneSpy = jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(resumeDoc) // owner lookup
        .mockResolvedValueOnce(null as any); // uniqueness check

      const res = await request(app)
        .patch(`/api/resumes/${resumeDoc._id}/sharing/slug`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ slug: 'alex-rivera-2026', userId: 'attacker-id' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('alex-rivera-2026');
      expect(resumeDoc.userId).toBe(OWNER_ID);
      expect(findOneSpy).toHaveBeenNthCalledWith(1, {
        _id: resumeDoc._id,
        userId: OWNER_ID
      });
      expect(findOneSpy).toHaveBeenNthCalledWith(2, {
        'sharing.slug': 'alex-rivera-2026',
        _id: { $ne: resumeDoc._id }
      });
      expect(resumeDoc.save).toHaveBeenCalledTimes(1);
    });

    it('returns 409 Conflict when the custom slug is already used by another resume', async () => {
      const resumeDoc = makeMockResumeDoc();
      jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(resumeDoc) // owner lookup
        .mockResolvedValueOnce({ _id: 'other-resume-id' } as any); // collision!

      const res = await request(app)
        .patch(`/api/resumes/${resumeDoc._id}/sharing/slug`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ slug: 'taken-slug' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already taken/i);
      expect(resumeDoc.save).not.toHaveBeenCalled();
    });

    it('maps MongoDB duplicate key (11000) race condition on save to 409 Conflict', async () => {
      const dupErr: any = new Error('E11000 duplicate key error');
      dupErr.code = 11000;
      const resumeDoc = makeMockResumeDoc({
        save: jest.fn().mockRejectedValueOnce(dupErr)
      });

      jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(resumeDoc)
        .mockResolvedValueOnce(null as any);

      const res = await request(app)
        .patch(`/api/resumes/${resumeDoc._id}/sharing/slug`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ slug: 'race-slug' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed slugs (too short, too long, uppercase, bad chars, edge hyphens) and reserved words with 400', async () => {
      const invalidSlugs = [
        'ab', // < 3 chars
        'a'.repeat(41), // > 40 chars
        'Jane-Doe', // uppercase
        'jane_doe', // underscore
        'jane doe', // space
        '-jane-doe', // leading hyphen
        'jane-doe-', // trailing hyphen
        'admin', // reserved
        'api', // reserved
        'login', // reserved
        'public', // reserved
        'resumes', // reserved
        'share', // reserved
        'settings' // reserved
      ];

      for (const badSlug of invalidSlugs) {
        const res = await request(app)
          .patch('/api/resumes/507f1f77bcf86cd799439055/sharing/slug')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ slug: badSlug });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    it('allows clearing an existing custom slug by passing null or empty string', async () => {
      const resumeDoc = makeMockResumeDoc();
      jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(resumeDoc);

      const res = await request(app)
        .patch(`/api/resumes/${resumeDoc._id}/sharing/slug`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ slug: null });

      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBeNull();
      expect(resumeDoc.sharing.slug).toBeUndefined();
      expect(resumeDoc.save).toHaveBeenCalledTimes(1);
    });

    it('checks live slug availability via GET /api/resumes/:id/sharing/slug/check', async () => {
      const resumeDoc = makeMockResumeDoc();

      // Available slug
      jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(resumeDoc)
        .mockResolvedValueOnce(null as any);

      const okRes = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/sharing/slug/check?slug=fresh-slug-99`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(okRes.status).toBe(200);
      expect(okRes.body.data).toEqual({ slug: 'fresh-slug-99', available: true });

      // Taken slug
      jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(resumeDoc)
        .mockResolvedValueOnce({ _id: 'someone-else' } as any);

      const takenRes = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/sharing/slug/check?slug=already-used`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(takenRes.status).toBe(200);
      expect(takenRes.body.data.available).toBe(false);
      expect(takenRes.body.data.reason).toMatch(/already taken/i);

      // Reserved slug
      jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(resumeDoc);
      const reservedRes = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/sharing/slug/check?slug=dashboard`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(reservedRes.status).toBe(200);
      expect(reservedRes.body.data.available).toBe(false);
      expect(reservedRes.body.data.reason).toMatch(/reserved/i);
    });
  });

  describe('Owner Share Stats: GET /api/resumes/:id/sharing/stats', () => {
    it('returns viewCount, lastViewedAt, and a 30-day dailyViews series for the owner', async () => {
      const now = new Date();
      const todayStr = formatUtcDate(now);
      const twoDaysAgoStr = formatUtcDate(
        new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      );
      const lastViewed = new Date('2026-11-19T15:00:00.000Z');

      const resumeDoc = makeMockResumeDoc({
        sharing: {
          isPublic: true,
          shareToken: 'tok-123',
          slug: 'jane-doe-cv',
          viewCount: 14,
          lastViewedAt: lastViewed,
          dailyViews: [
            { date: twoDaysAgoStr, count: 5 },
            { date: todayStr, count: 4 }
          ],
          privacy: { hideEmail: false, hidePhone: false, hideAddress: false }
        }
      });

      jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(resumeDoc);

      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/sharing/stats`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.viewCount).toBe(14);
      expect(res.body.data.lastViewedAt).toBe(lastViewed.toISOString());
      expect(res.body.data.slug).toBe('jane-doe-cv');
      expect(res.body.data.dailyViews).toHaveLength(30);

      const todayBucket = res.body.data.dailyViews.find(
        (d: { date: string; count: number }) => d.date === todayStr
      );
      const twoDaysBucket = res.body.data.dailyViews.find(
        (d: { date: string; count: number }) => d.date === twoDaysAgoStr
      );
      expect(todayBucket).toEqual({ date: todayStr, count: 4 });
      expect(twoDaysBucket).toEqual({ date: twoDaysAgoStr, count: 5 });
    });

    it('enforces authentication (401) and owner scoping (404 for non-owner)', async () => {
      const unauthRes = await request(app).get(
        '/api/resumes/507f1f77bcf86cd799439055/sharing/stats'
      );
      expect(unauthRes.status).toBe(401);

      const findSpy = jest
        .spyOn(Resume, 'findOne')
        .mockResolvedValueOnce(null as any);

      const nonOwnerRes = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439055/sharing/stats')
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(nonOwnerRes.status).toBe(404);
      expect(findSpy).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439055',
        userId: OTHER_USER_ID
      });
    });
  });
});

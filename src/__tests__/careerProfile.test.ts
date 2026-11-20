import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import careerProfileRoutes from '../routes/careerProfileRoutes';
import { CareerProfile } from '../models/CareerProfile';
import { User } from '../models/User';
import { errorHandler } from '../middleware/errorHandler';
import { mergeCareerProfileData } from '../services/careerProfileService';

describe('Career Profile API (/api/career-profile)', () => {
  const JWT_SECRET = 'test-career-profile-jwt-secret';
  const ownerId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const otherUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439099');
  const profileId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439055');

  let app: express.Application;
  let ownerToken: string;
  const originalJwtSecret = process.env.JWT_SECRET;

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
  });

  beforeEach(() => {
    jest.restoreAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/career-profile', careerProfileRoutes);
    app.use(errorHandler);

    jest.spyOn(User, 'findById').mockImplementation((id: any) => ({
      select: jest.fn().mockResolvedValue(
        String(id) === ownerId.toString()
          ? { _id: ownerId, name: 'Jane Doe', email: 'jane@example.com' }
          : null
      )
    } as any));
  });

  it('requires authentication on GET, PUT, and POST /merge', async () => {
    await request(app).get('/api/career-profile').expect(401);
    await request(app).put('/api/career-profile').send({}).expect(401);
    await request(app).post('/api/career-profile/merge').send({}).expect(401);
  });

  it('returns null when no approved profile exists yet', async () => {
    jest.spyOn(CareerProfile, 'findOne').mockResolvedValue(null);

    const res = await request(app)
      .get('/api/career-profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: null
    });
    expect(CareerProfile.findOne).toHaveBeenCalledWith({ userId: ownerId });
  });

  it('creates one approved profile scoped to req.user._id (ignoring body userId) via PUT /api/career-profile', async () => {
    jest.spyOn(CareerProfile, 'findOne').mockResolvedValue(null);
    const createSpy = jest
      .spyOn(CareerProfile, 'create')
      .mockImplementation((doc: any) => Promise.resolve({ _id: profileId, ...doc } as any));

    const res = await request(app)
      .put('/api/career-profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        userId: otherUserId.toString(),
        basics: {
          name: 'Jane Doe',
          label: 'Principal Backend Engineer',
          email: 'jane@example.com',
          phone: '+1 415 555 0192',
          location: { city: 'San Francisco', region: 'CA' }
        },
        experiences: [
          {
            id: 'exp-1',
            company: 'Acme Cloud',
            position: 'Staff Software Engineer',
            startDate: 'Jan 2021',
            endDate: 'Present',
            current: true,
            highlights: [
              'Reduced p99 API latency by 42% across 50M daily requests',
              'Mentored 8 engineers across distributed billing services'
            ],
            technologies: ['Go', 'Kubernetes', 'PostgreSQL']
          }
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'PulseStream Telemetry',
            description: 'Real-time event ingestion pipeline',
            highlights: ['Sustained 120k events/sec with sub-50ms end-to-end lag'],
            technologies: ['Rust', 'Kafka']
          }
        ],
        skills: [{ id: 'sk-1', name: 'Distributed Systems', keywords: ['Go', 'Kafka'] }],
        education: [
          {
            id: 'edu-1',
            institution: 'UC Berkeley',
            degree: 'B.S.',
            field: 'Computer Science'
          }
        ],
        certifications: [
          {
            id: 'cert-1',
            name: 'CKA: Certified Kubernetes Administrator',
            issuer: 'CNCF',
            date: '2023'
          }
        ]
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const savedArg: any = createSpy.mock.calls[0][0];
    expect(savedArg.userId).toEqual(ownerId);
    expect(savedArg.basics.name).toBe('Jane Doe');
    expect(savedArg.experiences[0].metrics).toEqual([
      'Reduced p99 API latency by 42% across 50M daily requests',
      'Mentored 8 engineers across distributed billing services'
    ]);
    expect(savedArg.projects[0].highlights).toEqual([
      'Sustained 120k events/sec with sub-50ms end-to-end lag'
    ]);
    expect(savedArg.certifications[0].name).toBe('CKA: Certified Kubernetes Administrator');
  });

  it('merges newly approved resume sections into an existing CareerProfile via POST /api/career-profile/merge without fabricating or losing prior highlights', async () => {
    const existingDoc: any = {
      _id: profileId,
      userId: ownerId,
      basics: {
        name: 'Jane Doe',
        label: 'Senior Engineer',
        email: 'jane@example.com',
        phone: '415-555-0192',
        summary: 'Backend systems engineer.',
        location: { city: 'San Francisco', region: 'CA' },
        profiles: [{ network: 'GitHub', username: 'janedoe', url: 'https://github.com/janedoe' }]
      },
      experiences: [
        {
          id: 'exp-1',
          company: 'Acme Cloud',
          position: 'Staff Software Engineer',
          startDate: 'Jan 2021',
          endDate: 'Present',
          current: true,
          description: '',
          highlights: ['Reduced p99 API latency by 42% across 50M daily requests'],
          technologies: ['Go'],
          metrics: ['Reduced p99 API latency by 42% across 50M daily requests']
        }
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'PulseStream',
          description: 'Telemetry pipeline',
          highlights: ['Processed 120k events/sec'],
          technologies: ['Rust'],
          metrics: ['Processed 120k events/sec'],
          url: 'https://pulsestream.dev',
          githubUrl: ''
        }
      ],
      skills: [{ id: 'sk-1', name: 'Go', category: 'Languages', level: 'Expert', keywords: [], subSkills: [] }],
      education: [],
      certifications: [],
      toObject() {
        return {
          basics: this.basics,
          experiences: this.experiences,
          projects: this.projects,
          skills: this.skills,
          education: this.education,
          certifications: this.certifications
        };
      },
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      })
    };

    jest.spyOn(CareerProfile, 'findOne').mockResolvedValue(existingDoc);

    // Send an approved IResume-shaped payload from ImportResumeModal review step
    const res = await request(app)
      .post('/api/career-profile/merge')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        summary: 'Principal distributed systems engineer.',
        content: {
          basics: {
            name: 'Jane Doe',
            label: 'Principal Distributed Systems Engineer',
            email: 'jane@example.com'
          },
          sections: [
            {
              id: 'work-sec',
              type: 'work',
              title: 'Professional Experience',
              content: [
                {
                  id: 'w-new-bullet',
                  company: 'Acme Cloud',
                  position: 'Staff Software Engineer',
                  highlights: ['Cut cloud infrastructure spend by $340k annually']
                },
                {
                  id: 'w-2',
                  company: 'Orbit FinTech',
                  position: 'Software Engineer',
                  startDate: '2018',
                  endDate: '2020',
                  highlights: ['Built ledger reconciliation service with 99.99% uptime']
                }
              ]
            },
            {
              id: 'proj-sec',
              type: 'projects',
              title: 'Projects',
              content: [
                {
                  id: 'p-1',
                  name: 'PulseStream',
                  highlights: ['Zero-copy compression cutting storage by 65%'],
                  technologies: ['Kafka']
                }
              ]
            },
            {
              id: 'skills-sec',
              type: 'skills',
              title: 'Skills',
              content: [
                { id: 's-1', name: 'go' },
                { id: 's-2', name: 'Kubernetes' }
              ]
            }
          ]
        }
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(existingDoc.save).toHaveBeenCalledTimes(1);
    expect(existingDoc.basics.label).toBe('Principal Distributed Systems Engineer');
    // Phone preserved from existing profile even though incoming omitted phone
    expect(existingDoc.basics.phone).toBe('415-555-0192');
    // Acme Cloud experience deduplicated & highlights unioned
    expect(existingDoc.experiences).toHaveLength(2);
    expect(existingDoc.experiences[0].highlights).toEqual([
      'Reduced p99 API latency by 42% across 50M daily requests',
      'Cut cloud infrastructure spend by $340k annually'
    ]);
    // PulseStream project deduplicated & highlights/technologies unioned
    expect(existingDoc.projects).toHaveLength(1);
    expect(existingDoc.projects[0].highlights).toEqual([
      'Processed 120k events/sec',
      'Zero-copy compression cutting storage by 65%'
    ]);
    expect(existingDoc.projects[0].technologies).toEqual(['Rust', 'Kafka']);
    // Skills deduplicated case-insensitively
    expect(existingDoc.skills.map((s: any) => s.name)).toEqual(['Go', 'Kubernetes']);
  });

  it('rejects invalid email or non-array sections with 400 validation error', async () => {
    const res = await request(app)
      .put('/api/career-profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        basics: { name: 'Jane', email: 'not-an-email' },
        experiences: 'invalid'
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('mergeCareerProfileData never invents metrics when highlights contain no numbers', () => {
    const merged = mergeCareerProfileData(null, {
      basics: { name: 'Alex' },
      experiences: [
        {
          id: 'e1',
          company: 'Beta Studio',
          position: 'Designer',
          highlights: ['Collaborated closely with product and engineering teams']
        }
      ]
    });

    expect(merged.experiences[0].metrics).toEqual([]);
  });
});

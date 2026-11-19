import express from 'express';
import request from 'supertest';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';
import { analyzeJobMatch } from '../services/jobMatchService';

jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = { _id: 'owner-1', email: 'owner@example.com' };
    next();
  }
}));

const resume = {
  title: 'Frontend Engineer Resume',
  summary: 'Frontend engineer building dashboards.',
  content: {
    basics: { name: 'Jane', email: 'jane@x.com', label: 'Senior Frontend Engineer' },
    sections: [
      { id: 'skills', type: 'SkillItem', title: 'Skills', content: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Jest' }] },
      {
        id: 'work',
        type: 'WorkItem',
        title: 'Experience',
        content: [{ name: 'Acme', position: 'Frontend Engineer', description: 'Built dashboards with Redux and REST APIs for customers.' }]
      }
    ],
    sectionOrder: ['skills', 'work']
  }
};

const jd = `We are hiring a Senior Frontend Engineer. You will build customer dashboards using React, TypeScript and GraphQL.
Experience with GraphQL, Next.js and AWS is a plus. Strong testing with Jest. Dashboards for customers at scale.`;

describe('analyzeJobMatch', () => {
  it('splits JD skills into matched and missing, ranked by frequency', () => {
    const result = analyzeJobMatch(resume, jd, 'Senior Frontend Engineer');

    expect(result.matchedKeywords.map((k) => k.keyword)).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Jest']));
    expect(result.missingKeywords[0]).toEqual({ keyword: 'GraphQL', occurrences: 2 });
    expect(result.missingKeywords.map((k) => k.keyword)).toEqual(expect.arrayContaining(['Next.js', 'AWS']));
    expect(result.totals).toEqual({ matched: 3, required: 6 });
    expect(result.breakdown.skills).toBe(50);
    expect(result.breakdown.title).toBe(100);
    expect(result.suggestions[0]).toMatch(/Add GraphQL to your Skills section.*2 times/);
  });

  it('does not match ambiguous English words as skills', () => {
    const result = analyzeJobMatch(resume, 'You will go the extra mile and rest assured we express gratitude in spring.');
    expect(result.totals.required).toBe(0);
  });

  it('scores a fully aligned resume as an excellent match', () => {
    const result = analyzeJobMatch(resume, 'React TypeScript Jest engineer building dashboards for customers, dashboards for customers.', 'Frontend Engineer');
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe('Excellent match');
  });
});

describe('POST /api/resumes/:resumeId/job-match', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/resumes', resumeRoutes);
    app.use(errorHandler);
  });

  it('returns the analysis for the caller\'s resume', async () => {
    const findOne = jest.spyOn(Resume, 'findOne').mockResolvedValue({ ...resume, toObject: () => resume } as any);

    const res = await request(app).post('/api/resumes/r1/job-match').send({ jobDescription: jd, jobTitle: 'Frontend Engineer' });

    expect(res.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ _id: 'r1', userId: 'owner-1' });
    expect(res.body.data.score).toEqual(expect.any(Number));
    expect(res.body.data.missingKeywords.length).toBeGreaterThan(0);
  });

  it('rejects a too-short job description', async () => {
    const res = await request(app).post('/api/resumes/r1/job-match').send({ jobDescription: 'React dev' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the resume belongs to someone else', async () => {
    jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);
    const res = await request(app).post('/api/resumes/r1/job-match').send({ jobDescription: jd });
    expect(res.status).toBe(404);
  });
});

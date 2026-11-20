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

  it('returns score 0 and Low match when a job description yields zero extractable requirements', () => {
    const noReqResult = analyzeJobMatch(
      resume,
      'You will go the extra mile and rest assured we express gratitude in spring.'
    );
    expect(noReqResult.totals).toEqual({ matched: 0, required: 0 });
    expect(noReqResult.breakdown).toEqual({ skills: 0, experience: 0, title: 0 });
    expect(noReqResult.score).toBe(0);
    expect(noReqResult.label).toBe('Low match');

    const withTitleNoReq = analyzeJobMatch(
      resume,
      'You will go the extra mile and rest assured we express gratitude in spring.',
      'Senior Frontend Engineer'
    );
    expect(withTitleNoReq.totals.required).toBe(0);
    expect(withTitleNoReq.score).toBe(0);
    expect(withTitleNoReq.label).toBe('Low match');
  });

  it('excludes disabled sections and hidden items from matchedKeywords, breakdown, and score', () => {
    const resumeWithHiddenContent = {
      title: 'Software Resume',
      summary: 'Focused on web user interfaces.',
      content: {
        basics: { name: 'Jane', email: 'jane@x.com', label: 'UI Developer' },
        sections: [
          {
            id: 'skills-visible',
            type: 'SkillItem',
            title: 'Skills',
            enabled: true,
            content: [
              { id: 's-1', name: 'React', enabled: true },
              { id: 's-hidden', name: 'Kubernetes', enabled: false },
            ],
          },
          {
            id: 'skills-disabled-sec',
            type: 'TechnicalSkillItem',
            title: 'Technical Skills',
            enabled: false,
            content: [{ id: 'ts-1', name: 'Backend', technologies: ['GraphQL', 'PostgreSQL'] }],
          },
          {
            id: 'work-sec',
            type: 'WorkItem',
            title: 'Work Experience',
            enabled: true,
            content: [
              {
                id: 'w-visible',
                name: 'Visible Corp',
                position: 'UI Developer',
                description: 'Implemented accessible components in React.',
                enabled: true,
              },
              {
                id: 'w-hidden',
                name: 'Hidden Corp',
                position: 'Principal Backend Architect',
                description: 'Designed distributed pipelines with Docker and telemetry pipelines.',
                enabled: false,
              },
            ],
          },
        ],
        sectionOrder: ['skills-visible', 'skills-disabled-sec', 'work-sec'],
      },
    };

    const targetJd =
      'Hiring a Principal Backend Architect to build distributed pipelines with React, Kubernetes, GraphQL, PostgreSQL, and Docker. Distributed pipelines experience required.';
    const result = analyzeJobMatch(resumeWithHiddenContent, targetJd, 'Principal Backend Architect');

    expect(result.matchedKeywords.map((k) => k.keyword)).toEqual(['React']);
    expect(result.missingKeywords.map((k) => k.keyword)).toEqual(
      expect.arrayContaining(['Kubernetes', 'GraphQL', 'PostgreSQL', 'Docker'])
    );
    expect(result.breakdown.skills).toBe(20);
    expect(result.breakdown.experience).toBe(0);
    expect(result.breakdown.title).toBe(0);
    expect(result.score).toBe(12);
  });

  it('matches Go and Express in technical contexts while ignoring lowercase English verbs', () => {
    const backendResume = {
      title: 'Backend Systems Resume',
      summary: 'Backend engineer building APIs.',
      content: {
        basics: { name: 'Alex', label: 'Backend Engineer' },
        sections: [
          {
            id: 'tech-skills',
            type: 'TechnicalSkillItem',
            title: 'Technical Skills',
            content: [{ id: 'ts-1', name: 'Backend', technologies: ['Go', 'Express', 'PostgreSQL'] }],
          },
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Experience',
            content: [{ id: 'w-1', name: 'CloudCo', position: 'Backend Engineer', description: 'Built services in Go and Node.js/Express.' }],
          },
        ],
      },
    };

    const techJd =
      'Seeking a Backend Engineer experienced in Go, Node.js, Express, and Docker to build microservices in Go.';
    const matchedResult = analyzeJobMatch(backendResume, techJd, 'Backend Engineer');

    expect(matchedResult.matchedKeywords.map((k) => k.keyword)).toEqual(
      expect.arrayContaining(['Go', 'Express', 'Node.js'])
    );
    expect(matchedResult.missingKeywords.map((k) => k.keyword)).toEqual(['Docker', 'Microservices']);

    // Lowercase prose verbs on resume must not satisfy technical Go/Express requirements
    const proseResume = {
      title: 'Coordinator Resume',
      summary: 'We go above and beyond and express ideas clearly.',
      content: {
        basics: { name: 'Sam', label: 'Operations Coordinator' },
        sections: [
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Experience',
            content: [{ id: 'w-1', name: 'Org', position: 'Coordinator', description: 'Helped teams go faster and express feedback.' }],
          },
        ],
      },
    };
    const unmatchedResult = analyzeJobMatch(proseResume, techJd, 'Backend Engineer');
    expect(unmatchedResult.matchedKeywords).toEqual([]);
    expect(unmatchedResult.missingKeywords.map((k) => k.keyword)).toEqual(
      expect.arrayContaining(['Go', 'Express'])
    );
  });

  it('matches experience and title keywords on whole-word boundaries rather than substrings', () => {
    const substringResume = {
      title: 'Smart Startup Resume',
      summary: 'Rapidly started workshops.',
      content: {
        basics: { name: 'Pat', label: 'DevOps Specialist' },
        sections: [
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Experience',
            content: [
              {
                id: 'w-1',
                name: 'Startup',
                position: 'DevOps Specialist',
                description: 'Rapidly started smart capital research.',
              },
            ],
          },
        ],
      },
    };

    // "art" appears in "smart"/"started", "arch" in "research", "ops" in "DevOps" — none are whole words
    const result = analyzeJobMatch(
      substringResume,
      'Looking for fine art curation and art restoration with React.',
      'Ops Arch'
    );
    expect(result.breakdown.experience).toBe(0);
    expect(result.breakdown.title).toBe(0);
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

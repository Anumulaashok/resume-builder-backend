import express from 'express';
import request from 'supertest';
import resumeRoutes from '../routes/resumeRoutes';
import { Resume } from '../models/Resume';
import { errorHandler } from '../middleware/errorHandler';
import {
  analyzeBulletDiagnostics,
  analyzeJobMatch,
  evaluateAts,
  FULL_SKILL_TAXONOMY,
  getTaxonomySkillCount,
  matchTaxonomySkills,
} from '../services/jobMatchService';

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

  it('supports standalone ATS checks without jobDescription and returns all 5 sub-scores', async () => {
    jest.spyOn(Resume, 'findOne').mockResolvedValue({ ...resume, toObject: () => resume } as any);

    const res = await request(app).post('/api/resumes/r1/job-match').send({});

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('standalone');
    expect(res.body.data.subScores).toEqual({
      keywords: expect.any(Number),
      structure: expect.any(Number),
      experience: expect.any(Number),
      formatting: expect.any(Number),
      skills: expect.any(Number),
    });
    expect(res.body.data.breakdown).toMatchObject({
      keywords: expect.any(Number),
      structure: expect.any(Number),
      experience: expect.any(Number),
      formatting: expect.any(Number),
      skills: expect.any(Number),
    });
    expect(res.body.data.guidanceDisclaimer).toMatch(/not an automated hiring guarantee/i);
  });
});

export const SHARED_ISOMORPHIC_FIXTURE = {
  prdReferenceSkillsText:
    'Engineered distributed workflows with Temporal, Node.js, NestJS, Java, and Python backed by PostgreSQL, MongoDB, ClickHouse, RabbitMQ, and Redis. Built AI Agents and RAG pipelines with LangChain, shipped React, Next.js, and Flutter apps, and deployed on GCP and GKE with Kubernetes.',
  expectedPrdSkills: [
    'Temporal',
    'Node.js',
    'NestJS',
    'Java',
    'Python',
    'PostgreSQL',
    'MongoDB',
    'ClickHouse',
    'RabbitMQ',
    'Redis',
    'LangChain',
    'AI Agents',
    'RAG',
    'React',
    'Next.js',
    'Flutter',
    'GCP',
    'GKE',
    'Kubernetes',
  ],
  tieredJd: `Senior Backend & Platform Engineer
Required Qualifications:
- Production experience with Node.js, PostgreSQL, and Docker
- Strong distributed systems design

Preferred Qualifications:
- Experience with ClickHouse and NestJS
- Familiarity with Temporal`,
};

describe('Isomorphic Deterministic ATS Engine & Taxonomy Matcher', () => {
  it('contains 300+ unique canonical skills and detects all 19 PRD Section 34 reference skills', () => {
    expect(getTaxonomySkillCount()).toBeGreaterThanOrEqual(300);
    const canonicalSet = new Set(FULL_SKILL_TAXONOMY.map((s) => s.canonical));
    expect(canonicalSet.size).toBe(FULL_SKILL_TAXONOMY.length);

    const detected = matchTaxonomySkills(SHARED_ISOMORPHIC_FIXTURE.prdReferenceSkillsText);
    for (const skill of SHARED_ISOMORPHIC_FIXTURE.expectedPrdSkills) {
      expect(detected.has(skill)).toBe(true);
    }
  });

  it('uses longest-span whole-word matching so Node.js is counted once and avoids substring or English-word false positives', () => {
    const nodeMatches = matchTaxonomySkills('Built APIs in Node.js and deployed Node JS microservices.');
    expect(nodeMatches.get('Node.js')?.occurrences).toBe(2);

    const singleNodeJs = matchTaxonomySkills('Backend service written in Node.js');
    expect(singleNodeJs.get('Node.js')?.occurrences).toBe(1);

    // Case-aware Go & Express detection
    const techGoExpress = matchTaxonomySkills('Built Go microservices and Express APIs with Spring and RAG.');
    expect(techGoExpress.has('Go')).toBe(true);
    expect(techGoExpress.has('Express')).toBe(true);
    expect(techGoExpress.has('Spring')).toBe(true);
    expect(techGoExpress.has('RAG')).toBe(true);

    // Substring & ambiguous prose false-positive guards
    const prose = matchTaxonomySkills(
      'Proactive JavaScript engineer at Google handling fragments in R&D for John R. Smith during Series C.'
    );
    expect(prose.has('JavaScript')).toBe(true);
    expect(prose.has('Java')).toBe(false);
    expect(prose.has('React')).toBe(false);
    expect(prose.has('Go')).toBe(false);
    expect(prose.has('RAG')).toBe(false);
    expect(prose.has('R')).toBe(false);
    expect(prose.has('C')).toBe(false);
  });

  it('excludes sections, items, and subSkills with enabled: false before scoring', () => {
    const resumeWithHiddenSkills = {
      title: 'Backend Engineer',
      content: {
        basics: { name: 'Alex Doe', email: 'alex@example.com', label: 'Backend Engineer' },
        sections: [
          {
            id: 'skills',
            type: 'SkillItem',
            title: 'Technical Skills',
            enabled: true,
            content: [
              { name: 'Python', enabled: true },
              { name: 'Docker', enabled: false },
              {
                name: 'Databases',
                enabled: true,
                subSkills: [
                  { name: 'PostgreSQL', enabled: true },
                  { name: 'ClickHouse', enabled: false },
                ],
              },
            ],
          },
          {
            id: 'hidden-work',
            type: 'WorkItem',
            title: 'Work Experience',
            enabled: false,
            content: [
              {
                company: 'Secret Corp',
                position: 'Architect',
                description: 'Built Kubernetes and Redis clusters.',
              },
            ],
          },
        ],
      },
    };

    const targetJd =
      'Looking for a Backend Engineer with Python, PostgreSQL, Docker, ClickHouse, Kubernetes, and Redis experience.';
    const result = analyzeJobMatch(resumeWithHiddenSkills, targetJd, 'Backend Engineer');

    const matchedNames = result.matchedKeywords.map((k) => k.keyword);
    const missingNames = result.missingKeywords.map((k) => k.keyword);

    expect(matchedNames).toEqual(expect.arrayContaining(['Python', 'PostgreSQL']));
    expect(matchedNames).not.toContain('Docker');
    expect(matchedNames).not.toContain('ClickHouse');
    expect(matchedNames).not.toContain('Kubernetes');
    expect(matchedNames).not.toContain('Redis');
    expect(missingNames).toEqual(expect.arrayContaining(['Docker', 'ClickHouse', 'Kubernetes', 'Redis']));
  });

  it('segments Required (1.0) vs Preferred (0.35) tiers and surfaces adjacent transferable skills', () => {
    const candidateResume = {
      title: 'Backend Engineer',
      content: {
        basics: { name: 'Sam Lee', email: 'sam@example.com', label: 'Senior Backend Engineer' },
        sections: [
          {
            id: 'skills',
            type: 'SkillItem',
            title: 'Skills',
            content: [{ name: 'Node.js' }, { name: 'Express' }, { name: 'PostgreSQL' }, { name: 'Docker' }],
          },
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Work Experience',
            content: [
              {
                company: 'CloudCo',
                position: 'Backend Engineer',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Engineered Node.js and PostgreSQL services in Docker handling 15k requests/sec.',
              },
            ],
          },
        ],
      },
    };

    const result = analyzeJobMatch(
      candidateResume,
      SHARED_ISOMORPHIC_FIXTURE.tieredJd,
      'Senior Backend Engineer'
    );

    const reqSkills = result.skillTiers.filter((s) => s.tier === 'required').map((s) => s.keyword);
    const prefSkills = result.skillTiers.filter((s) => s.tier === 'preferred').map((s) => s.keyword);

    expect(reqSkills).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'Docker', 'System Design']));
    expect(prefSkills).toEqual(expect.arrayContaining(['ClickHouse', 'NestJS', 'Temporal']));

    // Required matches weigh 1.0 while missing preferred skills weigh only 0.35 -> weighted skills > unweighted 3/7 (43%)
    expect(result.subScores.skills).toBeGreaterThan(55);

    // Adjacent transferable hints for ClickHouse (PostgreSQL) and NestJS (Node.js / Express)
    const hintTargets = result.transferableSkills.map((t) => t.missingSkill);
    expect(hintTargets).toEqual(expect.arrayContaining(['ClickHouse', 'NestJS']));
  });

  it('extracts fallback noun phrases when taxonomy hits equal zero and scores empty resumes at 0% (never 100%)', () => {
    const nonTechJd = `Clinical Trial Operations Coordinator responsible for patient recruitment workflows,
      regulatory compliance documentation, institutional review submissions, and clinical site monitoring.`;

    const emptyResult = analyzeJobMatch({}, nonTechJd, 'Clinical Trial Coordinator');
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.subScores.skills).toBe(0);
    expect(emptyResult.subScores.keywords).toBe(0);
    expect(emptyResult.fallbackKeywords.missing.length).toBeGreaterThan(0);

    const alignedNonTechResume = {
      title: 'Clinical Trial Coordinator',
      summary: 'Led patient recruitment workflows and clinical site monitoring across 12 hospital sites.',
      content: {
        basics: { name: 'Taylor Kim', email: 'taylor@example.com', label: 'Clinical Trial Operations Coordinator' },
        sections: [
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Work Experience',
            content: [
              {
                company: 'BioHealth',
                position: 'Coordinator',
                description:
                  'Managed regulatory compliance documentation and institutional review submissions reducing turnaround by 30%.',
              },
            ],
          },
        ],
      },
    };

    const alignedResult = analyzeJobMatch(alignedNonTechResume, nonTechJd, 'Clinical Trial Operations Coordinator');
    expect(alignedResult.fallbackKeywords.matched.length).toBeGreaterThan(0);
    expect(alignedResult.score).toBeGreaterThan(emptyResult.score);
  });

  it('flags weak action verbs, missing metrics with non-fabricating prompts, non-standard headings, mixed dates, and layout issues in < 16ms', () => {
    const diagnosticResume = {
      title: 'Software Engineer',
      templateId: 'creative-sidebar', // atsFriendly: false
      themeConfig: { skillStyle: 'bars' },
      content: {
        basics: { name: 'Jordan', email: 'jordan@example.com', label: 'Software Engineer' },
        sections: [
          {
            id: 'custom-1',
            type: 'CustomItem',
            title: 'My Coding Superpowers',
            isCustom: true,
            content: [{ name: 'TypeScript' }, { name: 'React' }],
          },
          {
            id: 'work',
            type: 'WorkItem',
            title: 'Work Experience',
            content: [
              {
                company: 'Alpha',
                position: 'Developer',
                startDate: 'Jan 2023',
                endDate: '03/2024',
                description:
                  'Worked on internal dashboard components for customer support agents.\nHelped build frontend forms and validation flows.',
              },
            ],
          },
        ],
      },
    };

    const t0 = performance.now();
    const audit = evaluateAts(diagnosticResume, { pageHeightPx: 1350 });
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(16);
    expect(audit.diagnostics.headingIssues[0]).toMatchObject({
      currentTitle: 'My Coding Superpowers',
      suggestedStandardTitle: 'Technical Skills',
    });
    expect(audit.diagnostics.dateConsistency.consistent).toBe(false);
    expect(audit.diagnostics.bulletDiagnostics.weakVerbCount).toBe(2);
    expect(audit.diagnostics.bulletDiagnostics.quantifiedBulletCount).toBe(0);

    const metricIssue = audit.diagnostics.bulletDiagnostics.issues.find((i) => i.type === 'missing_metric');
    expect(metricIssue?.message).toMatch(/never invent numbers/i);

    const layoutCodes = audit.diagnostics.layoutWarnings.map((w) => w.code);
    expect(layoutCodes).toEqual(
      expect.arrayContaining(['page_overflow', 'non_ats_template', 'skill_style_bars_dots', 'word_count_low'])
    );

    // Direct bullet helper also flags overly long bullets and repeated terms
    const longBulletAudit = analyzeBulletDiagnostics([
      'Built distributed pipeline architecture for telemetry ingestion across multi-region clusters handling customer analytics events and streaming dashboards with automated schema validation and real-time alerting workflows across production environments daily.',
      'Built pipeline alerting modules for customer analytics.',
      'Built pipeline reporting views for customer analytics.',
    ]);
    expect(longBulletAudit.longBulletCount).toBe(1);
    expect(longBulletAudit.repeatedTerms).toContain('built');
  });
});


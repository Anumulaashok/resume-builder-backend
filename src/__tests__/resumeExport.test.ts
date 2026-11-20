import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import {
  buildSafeExportFilename,
  formatDateWithPattern,
  formatItemDateRange,
  formatResumeDate,
  isBlockedHost,
  renderResumePlainText,
  sanitizeSafeExternalUrl,
  sanitizeText,
} from '../services/exportService';

describe('ATS Plain Text Export Endpoint (GET /api/resumes/:resumeId/export.txt)', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const TEST_SECRET = 'test-export-jwt-secret-key';
  const OWNER_ID = '507f1f77bcf86cd799439011';

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const issueAuthHeader = (userId = OWNER_ID) => {
    const token = jwt.sign({ id: userId }, TEST_SECRET, { expiresIn: '1h' });
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: userId,
        email: 'ashok@example.com',
        name: 'Anumula Ashok',
      }),
    } as any);
    return `Bearer ${token}`;
  };

  const buildSampleResumeRecord = (overrides: Record<string, any> = {}) => ({
    _id: '507f1f77bcf86cd799439022',
    userId: OWNER_ID,
    title: 'Staff Backend Engineer',
    summary: 'Fallback summary text.',
    templateId: 'tech-split',
    themeConfig: {
      fontPairingId: 'modern-sans',
      primaryColor: '#2563eb',
    },
    sharing: {
      isPublic: false,
      shareToken: 'internal-secret-share-token-999',
      privacy: {
        hideEmail: false,
        hidePhone: false,
        hideAddress: false,
      },
    },
    content: {
      basics: {
        name: 'Anumula Ashok',
        label: 'Senior Backend Engineer',
        email: 'ashok@example.com',
        phone: '+1-555-0148',
        summary: 'Backend engineer building resilient distributed workflows and AI pipelines.',
        website: 'https://ashok.dev',
        github: 'github.com/anumulaashok',
        linkedin: 'https://linkedin.com/in/anumulaashok',
        location: {
          address: '742 Evergreen Terrace',
          city: 'San Francisco',
          countryCode: 'US',
        },
      },
      sections: [
        {
          id: 'sec-work',
          type: 'WorkItem',
          title: 'Professional Experience',
          content: [
            {
              id: 'w1',
              company: 'RagaAI',
              position: 'Software Development Engineer',
              location: 'Bengaluru, IN',
              startDate: { month: 'Dec', year: '2025' },
              endDate: {},
              current: true,
              description: 'Designed Temporal workflow orchestration handling 100K+ daily writes.',
              highlights: ['Reduced batch processing time by 99%'],
              technologies: ['Temporal', 'Node.js', 'PostgreSQL'],
            },
          ],
        },
        {
          id: 'sec-edu',
          type: 'EducationItem',
          title: 'Education',
          content: [
            {
              id: 'e1',
              degree: 'B.Tech',
              field: 'Computer Science',
              institution: 'National Institute of Technology',
              startDate: { month: 'Aug', year: '2018' },
              endDate: { month: 'May', year: '2022' },
              gpa: '8.9/10',
              location: 'India',
            },
          ],
        },
        {
          id: 'sec-proj',
          type: 'ProjectItem',
          title: 'Projects',
          content: [
            {
              id: 'p1',
              name: 'Distributed ATS Parser',
              role: 'Creator',
              startDate: '2024',
              endDate: '2025',
              url: 'https://github.com/anumulaashok/ats-parser',
              description: 'Deterministic resume extraction engine.',
              technologies: ['TypeScript', 'Node.js'],
            },
          ],
        },
        {
          id: 'sec-skills',
          type: 'SkillItem',
          title: 'Skills',
          content: [
            {
              id: 's1',
              name: 'Backend & Distributed Systems',
              keywords: ['Node.js', 'NestJS', 'Temporal', 'ClickHouse', 'Redis'],
            },
          ],
        },
        {
          id: 'sec-cert',
          type: 'CertificateItem',
          title: 'Certificates',
          content: [
            {
              id: 'c1',
              name: 'Google Cloud Professional Architect',
              issuer: 'Google Cloud',
              date: '2025',
            },
          ],
        },
        {
          id: 'sec-custom',
          type: 'CustomItem',
          title: 'Open Source Leadership',
          isCustom: true,
          content: [
            {
              id: 'cu1',
              title: 'Core Maintainer',
              subtitle: 'Cloud Native Tooling',
              description: 'Reviewed 120+ community pull requests.',
            },
          ],
        },
      ],
      sectionOrder: [
        'sec-work',
        'sec-edu',
        'sec-proj',
        'sec-skills',
        'sec-cert',
        'sec-custom',
      ],
    },
    history: [{ content: { secretHistoryMarker: 'NEVER_EXPORT_HISTORY' }, updatedAt: new Date() }],
    ...overrides,
  });

  describe('Authentication, Ownership & Route Guardrails', () => {
    it('rejects unauthenticated plain text export requests with 401', async () => {
      const res = await request(app).get('/api/resumes/507f1f77bcf86cd799439022/export.txt');
      expect(res.status).toBe(401);
    });

    it('rejects requests with an invalid JWT token with 401', async () => {
      const res = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export.txt')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
    });

    it('returns 404 when the resume does not exist or belongs to another user', async () => {
      const authHeader = issueAuthHeader();
      const findSpy = jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);

      const res = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439099/export.txt')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(findSpy).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439099',
        userId: OWNER_ID,
      });
    });

    it('does not expose removed PDF or query export routes', async () => {
      const authHeader = issueAuthHeader();

      const pdfRes = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export/pdf')
        .set('Authorization', authHeader);
      expect(pdfRes.status).toBe(404);

      const dotPdfRes = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export.pdf')
        .set('Authorization', authHeader);
      expect(dotPdfRes.status).toBe(404);
    });
  });

  describe('ATS Plain Text Export Content, Section Ordering & Frontend Date Rules', () => {
    it('streams UTF-8 plain text with standardized ATS headings and all active sections', async () => {
      const authHeader = issueAuthHeader();
      const resumeDoc = buildSampleResumeRecord();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc as any);

      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/export.txt`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain;\s*charset=utf-8/i);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="staff-backend-engineer.txt"'
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const text = res.text;
      expect(text).toContain('Anumula Ashok');
      expect(text).toContain('Senior Backend Engineer');
      expect(text).toContain('Email: ashok@example.com');
      expect(text).toContain('Phone: +1-555-0148');
      expect(text).toContain('Location: 742 Evergreen Terrace, San Francisco, US');
      expect(text).toContain('PROFESSIONAL SUMMARY');
      expect(text).toContain('WORK EXPERIENCE');
      expect(text).toContain('Software Development Engineer | RagaAI');
      expect(text).toContain('Dec 2025 - Present | Bengaluru, IN');
      expect(text).toContain('- Reduced batch processing time by 99%');
      expect(text).toContain('EDUCATION');
      expect(text).toContain('B.Tech - Computer Science');
      expect(text).toContain('PROJECTS');
      expect(text).toContain('SKILLS');
      expect(text).toContain(
        'Backend & Distributed Systems: Node.js, NestJS, Temporal, ClickHouse, Redis'
      );
      expect(text).toContain('CERTIFICATIONS');
      expect(text).toContain('OPEN SOURCE LEADERSHIP');
    });

    it('renders sections strictly in sectionOrder and appends active unreferenced sections', () => {
      const base = buildSampleResumeRecord();
      const reorderedResume = buildSampleResumeRecord({
        content: {
          ...base.content,
          sectionOrder: ['sec-skills', 'sec-proj', 'sec-edu', 'sec-work'],
        },
      });

      const text = renderResumePlainText(reorderedResume);
      const skillsIdx = text.indexOf('SKILLS');
      const projIdx = text.indexOf('PROJECTS');
      const eduIdx = text.indexOf('EDUCATION');
      const workIdx = text.indexOf('WORK EXPERIENCE');
      const certIdx = text.indexOf('CERTIFICATIONS');
      const customIdx = text.indexOf('OPEN SOURCE LEADERSHIP');

      expect(skillsIdx).toBeGreaterThan(-1);
      expect(projIdx).toBeGreaterThan(skillsIdx);
      expect(eduIdx).toBeGreaterThan(projIdx);
      expect(workIdx).toBeGreaterThan(eduIdx);
      // Unreferenced active sections appended after sectionOrder in original order
      expect(certIdx).toBeGreaterThan(workIdx);
      expect(customIdx).toBeGreaterThan(certIdx);
    });

    it('formats dates via the exact same rules as the frontend (including themeConfig.dateFormat)', () => {
      // Direct helper parity checks
      expect(formatResumeDate({ month: 'September', year: 2023 })).toBe('September 2023');
      expect(formatResumeDate(2024)).toBe('2024');
      expect(formatResumeDate(new Date('2025-03-15T00:00:00.000Z'))).toBe('2025-03-15');

      expect(formatDateWithPattern({ month: 'September', year: '2023' }, 'MMM YYYY')).toBe(
        'Sep 2023'
      );
      expect(formatDateWithPattern('2023-09-01', 'MM/YYYY')).toBe('09/2023');
      expect(formatDateWithPattern('06/2021', 'YYYY')).toBe('2021');
      expect(formatDateWithPattern('Present', 'MM/YYYY')).toBe('Present');

      expect(
        formatItemDateRange(
          { startDate: '2022-04', endDate: '2024-11', current: false },
          'MMM YYYY'
        )
      ).toBe('Apr 2022 - Nov 2024');
      expect(formatItemDateRange({ current: true })).toBe('Present');
      expect(formatItemDateRange({ dateRange: 'Spring 2023' })).toBe('Spring 2023');
      expect(formatItemDateRange({ period: 'Q1 2024 - Q3 2024' })).toBe('Q1 2024 - Q3 2024');

      // End-to-end resume dateFormat via themeConfig
      const formattedResume = buildSampleResumeRecord({
        themeConfig: {
          dateFormat: 'MM/YYYY',
        },
      });
      const text = renderResumePlainText(formattedResume);
      expect(text).toContain('12/2025 - Present | Bengaluru, IN');
      expect(text).toContain('08/2018 - 05/2022');
    });
  });

  describe('Privacy Redaction, Enabled-Only Filtering, Sanitization & SSRF Protection', () => {
    it('omits hidden contact fields, disabled sections, disabled items, and internal metadata', () => {
      const privateResume = buildSampleResumeRecord({
        sharing: {
          isPublic: true,
          shareToken: 'TOP_SECRET_TOKEN_DO_NOT_LEAK',
          privacy: {
            hideEmail: true,
            hidePhone: true,
            hideAddress: true,
          },
        },
        content: {
          basics: {
            name: 'Priya Nair',
            label: 'Staff Security Engineer',
            email: 'private-email@secret.org',
            phone: '+1-800-555-9999',
            summary: 'Zero-trust architecture specialist.',
            location: {
              address: '99 Confidential Blvd Apt 4B',
              city: 'Seattle',
              countryCode: 'US',
            },
          },
          sections: [
            {
              id: 'sec-work',
              type: 'WorkItem',
              title: 'Experience',
              enabled: true,
              content: [
                {
                  id: 'w-visible',
                  company: 'Visible Security Corp',
                  position: 'Lead Security Engineer',
                  startDate: '2022',
                  current: true,
                  enabled: true,
                },
                {
                  id: 'w-hidden',
                  company: 'Stealth Hidden Employer',
                  position: 'Undercover Role',
                  startDate: '2019',
                  enabled: false,
                },
              ],
            },
            {
              id: 'sec-disabled',
              type: 'AwardItem',
              title: 'Classified Awards',
              enabled: false,
              content: [
                {
                  id: 'a-hidden',
                  name: 'Secret Internal Award',
                },
              ],
            },
          ],
          sectionOrder: ['sec-work', 'sec-disabled'],
        },
      });

      const plainText = renderResumePlainText(privateResume);
      expect(plainText).toContain('Priya Nair');
      expect(plainText).toContain('Location: Seattle, US');
      expect(plainText).toContain('Visible Security Corp');
      expect(plainText).not.toContain('private-email@secret.org');
      expect(plainText).not.toContain('+1-800-555-9999');
      expect(plainText).not.toContain('99 Confidential Blvd');
      expect(plainText).not.toContain('Stealth Hidden Employer');
      expect(plainText).not.toContain('Classified Awards');
      expect(plainText).not.toContain('Secret Internal Award');
      expect(plainText).not.toContain('TOP_SECRET_TOKEN_DO_NOT_LEAK');
      expect(plainText).not.toContain('NEVER_EXPORT_HISTORY');
      expect(plainText).not.toContain(OWNER_ID);
    });

    it('sanitizes HTML/script payloads and blocks SSRF/unsafe URLs during export', () => {
      expect(sanitizeText('<script>fetch("http://169.254.169.254")</script>Clean <b>Title</b>')).toBe(
        'Clean Title'
      );
      expect(buildSafeExportFilename({ title: '../../Evil\r\nHeader<script>' })).toBe(
        'evil-header.txt'
      );

      expect(sanitizeSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe('');
      expect(sanitizeSafeExternalUrl('http://127.0.0.1:8080/internal')).toBe('');
      expect(sanitizeSafeExternalUrl('http://localhost:3000/secret')).toBe('');
      expect(sanitizeSafeExternalUrl('http://10.0.0.12/admin')).toBe('');
      expect(sanitizeSafeExternalUrl('http://172.16.5.4/internal')).toBe('');
      expect(sanitizeSafeExternalUrl('http://192.168.1.1/router')).toBe('');
      expect(sanitizeSafeExternalUrl('http://[::1]:9000/health')).toBe('');
      expect(sanitizeSafeExternalUrl('http://[::ffff:169.254.169.254]/latest')).toBe('');
      expect(sanitizeSafeExternalUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe('');
      expect(sanitizeSafeExternalUrl('javascript:alert(document.cookie)')).toBe('');
      expect(sanitizeSafeExternalUrl('file:///etc/passwd')).toBe('');
      expect(sanitizeSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(isBlockedHost('100.64.1.1')).toBe(true);
      expect(sanitizeSafeExternalUrl('https://github.com/anumulaashok')).toBe(
        'https://github.com/anumulaashok'
      );

      const maliciousResume = buildSampleResumeRecord({
        content: {
          basics: {
            name: 'Alex <script>evil()</script><img src="http://169.254.169.254/x">Mercer',
            label: 'Engineer',
            email: 'alex@example.com',
            website: 'http://169.254.169.254/latest/meta-data/iam',
            github: 'javascript:alert(1)',
            linkedin: 'http://127.0.0.1:6379/',
          },
          sections: [
            {
              id: 'sec-proj',
              type: 'ProjectItem',
              title: 'Projects',
              content: [
                {
                  id: 'p-ssrf',
                  name: 'Safe Project',
                  url: 'http://10.24.0.8:9200/_cluster/health',
                  description: 'Reduced p99 latency to <10ms across services.',
                },
              ],
            },
          ],
          sectionOrder: ['sec-proj'],
        },
      });

      const txt = renderResumePlainText(maliciousResume);
      expect(txt).toContain('Alex Mercer');
      expect(txt).toContain('Reduced p99 latency to <10ms across services.');
      expect(txt).not.toContain('169.254.169.254');
      expect(txt).not.toContain('127.0.0.1');
      expect(txt).not.toContain('10.24.0.8');
      expect(txt).not.toContain('javascript:');
      expect(txt).not.toContain('<script');
    });

    it('preserves generic type annotations while stripping HTML comments, attributed tags, and markup', () => {
      expect(sanitizeText('Built APIs returning List<String> and Promise<void>')).toBe(
        'Built APIs returning List<String> and Promise<void>'
      );
      expect(sanitizeText('Typed UI primitives as React.FC<Props>, Set<S>, and Option<P>')).toBe(
        'Typed UI primitives as React.FC<Props>, Set<S>, and Option<P>'
      );
      expect(
        sanitizeText(
          '<!-- internal note --><b>Lead</b> <span class="badge" data-x="1">Platform</span> Engineer<br/>'
        )
      ).toBe('Lead Platform Engineer');

      const engineeringResume = buildSampleResumeRecord({
        content: {
          basics: {
            name: 'Jordan Lee',
            label: 'Staff TypeScript & JVM Engineer',
            email: 'jordan@example.com',
            url: 'https://jordanlee.dev/',
            linkedin: 'https://www.linkedin.com/in/jordanlee/',
            github: 'https://github.com/jordanlee',
            profiles: [
              { network: 'LinkedIn', url: 'http://linkedin.com/in/jordanlee' },
              { network: 'GitHub', url: 'https://www.github.com/jordanlee/' },
              { network: 'Portfolio', url: 'https://jordanlee.dev' },
              { network: 'Blog', url: 'https://writing.jordanlee.dev' },
            ],
            location: {
              city: 'Austin',
              region: 'TX',
              countryCode: 'US',
            },
            summary:
              '<!-- draft -->Designed <strong>SDKs</strong> using List<String>, Promise<void>, and React.FC<Props>.',
          },
          sections: [
            {
              id: 'sec-work',
              type: 'WorkItem',
              title: 'Experience',
              content: [
                {
                  id: 'w-generics',
                  company: 'CloudScale',
                  position: 'Principal Engineer',
                  startDate: '2023',
                  current: true,
                  highlights: [
                    'Migrated Java pipelines to List<String> and Set<S> caches',
                    'Shipped async hooks typed with Promise<void>, Option<P>, and React.FC<Props>',
                  ],
                },
              ],
            },
          ],
          sectionOrder: ['sec-work'],
        },
      });

      const txt = renderResumePlainText(engineeringResume);
      expect(txt).toContain('Location: Austin, TX, US');
      expect(txt).toContain(
        'Designed SDKs using List<String>, Promise<void>, and React.FC<Props>.'
      );
      expect(txt).toContain('- Migrated Java pipelines to List<String> and Set<S> caches');
      expect(txt).toContain(
        '- Shipped async hooks typed with Promise<void>, Option<P>, and React.FC<Props>'
      );
      expect(txt).not.toContain('<!-- draft -->');
      expect(txt).not.toContain('<strong>');

      // Direct links and matching basics.profiles entries must be deduplicated
      const linkedinMatches = txt.match(/linkedin\.com\/in\/jordanlee/gi) || [];
      const githubMatches = txt.match(/github\.com\/jordanlee/gi) || [];
      const websiteMatches = txt.match(/https?:\/\/jordanlee\.dev/gi) || [];
      expect(linkedinMatches).toHaveLength(1);
      expect(githubMatches).toHaveLength(1);
      expect(websiteMatches).toHaveLength(1);
      expect(txt).toContain('writing.jordanlee.dev');
    });
  });
});

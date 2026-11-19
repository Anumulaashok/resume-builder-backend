import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  buildSafeExportFilename,
  isBlockedHost,
  renderResumePdf,
  renderResumePlainText,
  sanitizeSafeExternalUrl,
  sanitizeText,
} from '../services/exportService';

function extractDecompressedPdfText(pdfBuffer: Buffer): string {
  const rawLatin1 = pdfBuffer.toString('latin1');
  const decodedStreams: string[] = [rawLatin1];
  const decodedTextRuns: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(rawLatin1)) !== null) {
    const compressedBytes = Buffer.from(match[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(compressedBytes).toString('latin1');
      decodedStreams.push(inflated);

      // Decode PDFKit hex-encoded vector glyph arrays: [<416c...> 15 <7820...>] TJ
      const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjArrayRegex.exec(inflated)) !== null) {
        const hexParts = tjMatch[1].match(/<([0-9a-fA-F]+)>/g) || [];
        const lineText = hexParts
          .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
          .join('');
        if (lineText) {
          decodedTextRuns.push(lineText);
        }
      }

      // Decode single hex strings: <416c...> Tj
      const singleHexTjRegex = /<([0-9a-fA-F]+)>\s*Tj/g;
      let singleMatch: RegExpExecArray | null;
      while ((singleMatch = singleHexTjRegex.exec(inflated)) !== null) {
        decodedTextRuns.push(Buffer.from(singleMatch[1], 'hex').toString('latin1'));
      }
    } catch {
      // Non-Flate stream or raw stream already included in rawLatin1
    }
  }

  return `${decodedStreams.join('\n')}\n${decodedTextRuns.join('\n')}`;
}

function parseBinaryResponse(res: any, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Server-Side Vector PDF & ATS Plain Text Export Pipeline', () => {
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
    templateId: 'modern',
    themeConfig: {
      fontPairingId: 'modern-sans',
      primaryColor: '#2563eb',
      headingColor: '#111827',
      textColor: '#374151',
      sectionSpacing: 'normal',
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
              technologies: ['TypeScript', 'PDFKit'],
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

  describe('Authentication & Authorization Guardrails', () => {
    it('rejects unauthenticated PDF and plain text export requests with 401', async () => {
      const pdfRes = await request(app).get('/api/resumes/507f1f77bcf86cd799439022/export/pdf');
      expect(pdfRes.status).toBe(401);

      const txtRes = await request(app).get('/api/resumes/507f1f77bcf86cd799439022/export/txt');
      expect(txtRes.status).toBe(401);

      const queryRes = await request(app).get('/api/resumes/507f1f77bcf86cd799439022/export?format=pdf');
      expect(queryRes.status).toBe(401);
    });

    it('rejects requests with an invalid JWT token with 401', async () => {
      const res = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export/pdf')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
    });

    it('returns 404 when the resume does not exist or belongs to another user', async () => {
      const authHeader = issueAuthHeader();
      const findSpy = jest.spyOn(Resume, 'findOne').mockResolvedValue(null as any);

      const res = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439099/export/pdf')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(findSpy).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439099',
        userId: OWNER_ID,
      });
    });

    it('returns 400 when requesting an unsupported export format such as docx', async () => {
      const authHeader = issueAuthHeader();

      const res = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export?format=docx')
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unsupported export format/i);
    });
  });

  describe('Vector PDF Export Endpoint & Layout Consistency', () => {
    it('streams a valid A4 vector PDF within 3 seconds containing all active sections', async () => {
      const authHeader = issueAuthHeader();
      const resumeDoc = buildSampleResumeRecord();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc as any);

      const startedAt = Date.now();
      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/export/pdf`)
        .set('Authorization', authHeader)
        .buffer(true)
        .parse(parseBinaryResponse);
      const elapsedMs = Date.now() - startedAt;

      expect(res.status).toBe(200);
      expect(elapsedMs).toBeLessThan(3000);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="staff-backend-engineer.pdf"'
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const pdfBuffer: Buffer = res.body;
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const rawPdf = pdfBuffer.toString('latin1');
      expect(rawPdf).toContain(`/MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}]`);
      expect(rawPdf).toContain('%%EOF');

      const decompressed = extractDecompressedPdfText(pdfBuffer);
      // Vector text stream operators
      expect(decompressed).toContain('BT');
      expect(decompressed).toContain('ET');
      expect(decompressed).toContain('Anumula Ashok');
      expect(decompressed).toContain('RagaAI');
      expect(decompressed).toContain('Software Development Engineer');
      expect(decompressed).toContain('Dec 2025 - Present');
      expect(decompressed).toContain('National Institute of Technology');
      expect(decompressed).toContain('Distributed ATS Parser');
      expect(decompressed).toContain('Temporal');
      expect(decompressed).toContain('Google Cloud Professional Architect');
      expect(decompressed).toContain('OPEN SOURCE LEADERSHIP');
      // Public links preserved as PDF URI annotations
      expect(rawPdf).toContain('/URI (https://ashok.dev/)');
      expect(rawPdf).toContain('/URI (https://github.com/anumulaashok/ats-parser)');
    });

    it('renders Professional template with classic-serif theme and paginates multi-page resumes without clipping', async () => {
      const manyWorkItems = Array.from({ length: 18 }, (_, i) => ({
        id: `work-${i + 1}`,
        company: `Enterprise Systems Co ${i + 1}`,
        position: `Principal Architect Role ${i + 1}`,
        startDate: 'Jan 2020',
        endDate: 'Dec 2024',
        location: 'New York, NY',
        description:
          'Led multi-region distributed architecture migration with strict latency SLAs and zero downtime.',
        highlights: [
          `Delivered milestone ${i + 1}A improving throughput across clusters`,
          `Mentored engineering squad ${i + 1}B on observability and incident response`,
        ],
        technologies: ['Go', 'Kubernetes', 'PostgreSQL'],
      }));

      const multiPageResume = buildSampleResumeRecord({
        templateId: 'professional',
        themeConfig: {
          fontPairingId: 'classic-serif',
          primaryColor: '#0f766e',
          sectionSpacing: 'spacious',
        },
        content: {
          ...buildSampleResumeRecord().content,
          sections: [
            {
              id: 'sec-work',
              type: 'WorkItem',
              title: 'Work Experience',
              content: manyWorkItems,
            },
          ],
          sectionOrder: ['sec-work'],
        },
      });

      const pdfBuffer = await renderResumePdf(multiPageResume);
      const rawPdf = pdfBuffer.toString('latin1');
      const pageMatches = rawPdf.match(/\/Type \/Page\b/g) || [];
      expect(pageMatches.length).toBeGreaterThanOrEqual(2);
      expect(rawPdf).toContain(`/MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}]`);

      const decompressed = extractDecompressedPdfText(pdfBuffer);
      expect(decompressed).toContain('PROFILE');
      expect(decompressed).toContain('Enterprise Systems Co 1');
      // Verify the final item on the last page was not clipped
      expect(decompressed).toContain('Enterprise Systems Co 18');
      expect(decompressed).toContain('Delivered milestone 18A');
    });
  });

  describe('ATS Plain Text Export Endpoint', () => {
    it('streams UTF-8 plain text with standardized ATS headings and all active sections', async () => {
      const authHeader = issueAuthHeader();
      const resumeDoc = buildSampleResumeRecord();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc as any);

      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/export/txt`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain;\s*charset=utf-8/i);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="staff-backend-engineer.txt"'
      );

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
  });

  describe('Privacy Redaction, Hidden Sections/Items, Sanitization & SSRF Protection', () => {
    it('omits hidden contact fields, disabled sections, disabled items, and internal metadata in both PDF and TXT', async () => {
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

      const pdfBuffer = await renderResumePdf(privateResume);
      const decompressedPdf = extractDecompressedPdfText(pdfBuffer);
      expect(decompressedPdf).toContain('Priya Nair');
      expect(decompressedPdf).toContain('Visible Security Corp');
      expect(decompressedPdf).not.toContain('private-email@secret.org');
      expect(decompressedPdf).not.toContain('+1-800-555-9999');
      expect(decompressedPdf).not.toContain('99 Confidential Blvd');
      expect(decompressedPdf).not.toContain('Stealth Hidden Employer');
      expect(decompressedPdf).not.toContain('Secret Internal Award');
      expect(decompressedPdf).not.toContain('TOP_SECRET_TOKEN_DO_NOT_LEAK');
      expect(decompressedPdf).not.toContain('NEVER_EXPORT_HISTORY');
    });

    it('sanitizes HTML/script payloads and blocks SSRF/unsafe URLs during export', async () => {
      expect(sanitizeText('<script>fetch("http://169.254.169.254")</script>Clean <b>Title</b>')).toBe(
        'Clean Title'
      );
      expect(buildSafeExportFilename({ title: '../../Evil\r\nHeader<script>' }, 'pdf')).toBe(
        'evil-header.pdf'
      );

      // SSRF & unsafe scheme checks
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

      const pdfBuffer = await renderResumePdf(maliciousResume);
      const decompressedPdf = extractDecompressedPdfText(pdfBuffer);
      expect(decompressedPdf).toContain('Alex Mercer');
      expect(decompressedPdf).toContain('Reduced p99 latency to <10ms across services.');
      expect(decompressedPdf).not.toContain('169.254.169.254');
      expect(decompressedPdf).not.toContain('127.0.0.1');
      expect(decompressedPdf).not.toContain('10.24.0.8');
      expect(decompressedPdf).not.toContain('javascript:');
    });
  });
});

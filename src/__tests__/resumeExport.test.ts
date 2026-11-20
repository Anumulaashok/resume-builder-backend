import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from 'pdf-lib';
import request from 'supertest';
import app from '../app';
import { Resume } from '../models/Resume';
import { User } from '../models/User';
import {
  TEMPLATE_EXPORT_DEFINITIONS,
  buildSafeExportFilename,
  formatDateWithPattern,
  formatItemDateRange,
  formatResumeDate,
  isBlockedHost,
  renderResumeDocx,
  renderResumePdf,
  renderResumePlainText,
  resolveExportTheme,
  sanitizeSafeExternalUrl,
  sanitizeText,
} from '../services/exportService';

function decodeUtf16BeHex(hex: string): string {
  const bytes = Buffer.from(hex, 'hex');
  const u16 = new Uint16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < u16.length; i += 1) {
    u16[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  }
  return String.fromCharCode(...Array.from(u16));
}

async function extractSelectableTextAndLinksFromPdf(pdfBuffer: Buffer): Promise<{
  pageCount: number;
  text: string;
  links: string[];
}> {
  const doc = await PDFDocument.load(pdfBuffer);
  const pages = doc.getPages();
  const textFragments: string[] = [];
  const links: string[] = [];

  for (const page of pages) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      for (let i = 0; i < annots.size(); i += 1) {
        const annotDict = doc.context.lookup(annots.get(i), PDFDict);
        const actionDict = doc.context.lookupMaybe(
          annotDict.get(PDFName.of('A')),
          PDFDict
        );
        const uriObj = actionDict?.get(PDFName.of('URI'));
        if (uriObj) {
          links.push(uriObj.toString().replace(/^\(|\)$/g, ''));
        }
      }
    }

    const resources = page.node.Resources();
    const fontsRef = resources?.get(PDFName.of('Font'));
    if (!fontsRef) continue;
    const fontsDict = doc.context.lookup(fontsRef, PDFDict);
    const cmaps = new Map<string, Map<string, string>>();

    for (const [fontKey, fontVal] of fontsDict.entries()) {
      const fDict = doc.context.lookup(fontVal, PDFDict);
      const toUniRef = fDict.get(PDFName.of('ToUnicode'));
      if (!toUniRef) continue;
      const stream = doc.context.lookup(toUniRef) as PDFRawStream;
      const cmapTxt = zlib.inflateSync(stream.contents).toString('latin1');
      const map = new Map<string, string>();

      for (const sec of cmapTxt.split('endbfchar')) {
        const idx = sec.indexOf('beginbfchar');
        if (idx === -1) continue;
        const body = sec.slice(idx + 11);
        for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          map.set(m[1].toUpperCase().padStart(4, '0'), decodeUtf16BeHex(m[2]));
        }
      }
      for (const sec of cmapTxt.split('endbfrange')) {
        const idx = sec.indexOf('beginbfrange');
        if (idx === -1) continue;
        const body = sec.slice(idx + 12);
        for (const m of body.matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
        )) {
          const start = parseInt(m[1], 16);
          const end = parseInt(m[2], 16);
          const baseStr = decodeUtf16BeHex(m[3]);
          const baseCp = baseStr.codePointAt(0) || 0;
          for (let g = start; g <= end; g += 1) {
            map.set(
              g.toString(16).toUpperCase().padStart(4, '0'),
              String.fromCodePoint(baseCp + (g - start))
            );
          }
        }
      }
      cmaps.set(fontKey.toString(), map);
    }

    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) continue;
    const cArr = doc.context.lookup(contentsRef);
    const streams: PDFRawStream[] =
      cArr instanceof PDFArray
        ? Array.from({ length: cArr.size() }, (_, idx) =>
            doc.context.lookup(cArr.get(idx)) as PDFRawStream
          )
        : [cArr as PDFRawStream];

    let curFont: string | null = null;
    for (const st of streams) {
      const ops = zlib.inflateSync(st.contents).toString('latin1');
      for (const t of ops.matchAll(
        /(\/[^\s]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g
      )) {
        if (t[1]) {
          curFont = t[1];
        } else if (t[2] && curFont && cmaps.has(curFont)) {
          const cmap = cmaps.get(curFont)!;
          const hex = t[2].toUpperCase();
          let line = '';
          for (let j = 0; j < hex.length; j += 4) {
            line += cmap.get(hex.slice(j, j + 4)) || '';
          }
          textFragments.push(line);
        }
      }
    }
  }

  return {
    pageCount: pages.length,
    text: textFragments.join('\n'),
    links,
  };
}

function unzipArchiveEntries(zipBuffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP buffer: End of Central Directory not found');
  }
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (zipBuffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const fileNameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);
    const fileName = zipBuffer
      .subarray(ptr + 46, ptr + 46 + fileNameLen)
      .toString('utf-8');

    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawCompressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    const content =
      compressionMethod === 0
        ? rawCompressed.toString('utf-8')
        : zlib.inflateRawSync(rawCompressed).toString('utf-8');
    entries.set(fileName, content);

    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

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

    it('does not expose legacy /export/pdf path while requiring auth on .pdf and .docx routes', async () => {
      const authHeader = issueAuthHeader();

      const legacyPdfRes = await request(app)
        .get('/api/resumes/507f1f77bcf86cd799439022/export/pdf')
        .set('Authorization', authHeader);
      expect(legacyPdfRes.status).toBe(404);

      const unauthPdfRes = await request(app).get(
        '/api/resumes/507f1f77bcf86cd799439022/export.pdf'
      );
      expect(unauthPdfRes.status).toBe(401);

      const unauthDocxRes = await request(app).get(
        '/api/resumes/507f1f77bcf86cd799439022/export.docx'
      );
      expect(unauthDocxRes.status).toBe(401);
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
  });

  describe('Vector PDF (.pdf) & OpenXML (.docx) Exports + Public Share Export Endpoints', () => {
    const buildAll16SectionTypesResume = () =>
      buildSampleResumeRecord({
        title: 'Principal Systems Resume — Zofia Żółć',
        templateId: 'modern',
        themeConfig: {
          fontPairingId: 'elegant-hybrid',
          primaryColor: '#1e293b',
          accentColor: '#2563eb',
          headingStyle: 'underline',
          skillStyle: 'chips',
        },
        content: {
          basics: {
            name: 'Zofia Żółć — Καλημέρα — Привет',
            label: 'Principal Distributed Systems Architect',
            email: 'zofia@example.com',
            phone: '+48-555-0199',
            summary: 'Designing zero-downtime consensus protocols with <5ms p99 latency.',
            website: 'https://zofia.dev/cv',
            github: 'http://169.254.169.254/latest/meta-data/',
            linkedin: 'javascript:alert(1)',
            location: {
              address: 'ul. Marszałkowska 10',
              city: 'Warszawa',
              countryCode: 'PL',
            },
          },
          sections: [
            {
              id: 's1',
              type: 'WorkItem',
              title: 'Work Experience',
              content: [
                {
                  id: 'w1',
                  position: 'Staff Consensus Engineer',
                  company: 'RaftCore Labs',
                  startDate: '2022-01',
                  current: true,
                  url: 'https://raftcore.example.com',
                  highlights: ['Cut replication lag by 65% → 4ms'],
                },
              ],
            },
            {
              id: 's2',
              type: 'EducationItem',
              title: 'Education',
              content: [
                {
                  id: 'ed1',
                  degree: 'M.Sc.',
                  field: 'Distributed Computing',
                  institution: 'University of Warsaw',
                  startDate: '2016',
                  endDate: '2018',
                  gpa: '4.9/5.0',
                },
              ],
            },
            {
              id: 's3',
              type: 'SkillItem',
              title: 'Core Skills',
              content: [{ id: 'sk1', name: 'Rust' }, { id: 'sk2', name: 'Go' }],
            },
            {
              id: 's4',
              type: 'TechnicalSkillItem',
              title: 'Technical Skills',
              content: [
                {
                  id: 'tsk1',
                  name: 'Storage Engines',
                  keywords: ['RocksDB', 'FoundationDB'],
                },
              ],
            },
            {
              id: 's5',
              type: 'SoftSkillItem',
              title: 'Leadership Skills',
              content: [{ id: 'ssk1', name: 'Architecture Reviews' }],
            },
            {
              id: 's6',
              type: 'ProjectItem',
              title: 'Projects',
              content: [
                {
                  id: 'pr1',
                  name: 'QuorumKV',
                  role: 'Maintainer',
                  url: 'https://github.com/zofia/quorumkv',
                  github: 'http://10.0.0.8/private-repo',
                  description: 'Linearizable key-value engine.',
                },
              ],
            },
            {
              id: 's7',
              type: 'LanguageItem',
              title: 'Languages',
              content: [{ id: 'lg1', language: 'Polish', fluency: 'Native' }],
            },
            {
              id: 's8',
              type: 'CertificateItem',
              title: 'Certifications',
              content: [
                {
                  id: 'ct1',
                  name: 'CKA Kubernetes Administrator',
                  issuer: 'CNCF',
                  date: '2024',
                },
              ],
            },
            {
              id: 's9',
              type: 'CourseItem',
              title: 'Courses',
              content: [
                {
                  id: 'cr1',
                  name: 'Formal Verification in TLA+',
                  institution: 'MITx',
                },
              ],
            },
            {
              id: 's10',
              type: 'AwardItem',
              title: 'Awards',
              content: [
                {
                  id: 'aw1',
                  title: 'Best Systems Paper Award',
                  awarder: 'EuroSys',
                  date: '2023',
                },
              ],
            },
            {
              id: 's11',
              type: 'OrganizationItem',
              title: 'Organizations',
              content: [
                {
                  id: 'or1',
                  organization: 'ACM SIGOPS',
                  role: 'Program Committee Member',
                },
              ],
            },
            {
              id: 's12',
              type: 'PublicationItem',
              title: 'Publications',
              content: [
                {
                  id: 'pb1',
                  name: 'Deterministic State Machine Replication',
                  publisher: 'USENIX ATC',
                  date: '2023',
                  url: 'https://usenix.example.org/paper',
                },
              ],
            },
            {
              id: 's13',
              type: 'ReferenceItem',
              title: 'References',
              content: [
                {
                  id: 'rf1',
                  name: 'Dr. Marek Kowalski',
                  reference: 'Principal Researcher, Systems Institute',
                },
              ],
            },
            {
              id: 's14',
              type: 'InterestItem',
              title: 'Interests',
              content: [{ id: 'in1', name: 'Alpine Mountaineering' }],
            },
            {
              id: 's15',
              type: 'AchievementItem',
              title: 'Achievements',
              content: [
                {
                  id: 'ac1',
                  title: 'Zero Sev-1 Incidents Across 18 Months',
                },
              ],
            },
            {
              id: 's16',
              type: 'CustomItem',
              title: 'Patents',
              isCustom: true,
              content: [
                {
                  id: 'cu1',
                  title: 'US Patent 11,900,123 — Lease-Based Quorum Reads',
                },
              ],
            },
          ],
          sectionOrder: [
            's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8',
            's9', 's10', 's11', 's12', 's13', 's14', 's15', 's16',
          ],
        },
      });

    it('builds safe slugified filenames for .pdf, .docx, and .txt', () => {
      expect(
        buildSafeExportFilename({ title: 'Staff Backend Engineer (2026)' }, 'pdf')
      ).toBe('staff-backend-engineer-2026.pdf');
      expect(
        buildSafeExportFilename({ title: 'Staff Backend Engineer (2026)' }, 'docx')
      ).toBe('staff-backend-engineer-2026.docx');
      expect(
        buildSafeExportFilename({ title: '', content: { basics: { name: 'Maya Lin' } } }, 'pdf')
      ).toBe('maya-lin.pdf');
      expect(buildSafeExportFilename({ title: '!!!' }, 'docx')).toBe('resume.docx');
    });

    it('streams valid vector PDF on GET /api/resumes/:id/export.pdf with selectable UTF-8 text, clickable links, SSRF filtering, and all 16 SectionType values', async () => {
      const authHeader = issueAuthHeader();
      const resumeDoc = buildAll16SectionTypesResume();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc as any);

      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/export.pdf`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/i);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="principal-systems-resume-zofia.pdf"'
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const pdfBuffer = res.body as Buffer;
      expect(pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdfBuffer.subarray(pdfBuffer.length - 16).toString('latin1')).toContain(
        '%%EOF'
      );

      const { pageCount, text, links } =
        await extractSelectableTextAndLinksFromPdf(pdfBuffer);
      expect(pageCount).toBeGreaterThanOrEqual(1);

      // UTF-8 text across candidate header + all 16 SectionType values
      expect(text).toContain('Zofia Żółć — Καλημέρα — Привет');
      expect(text).toContain('Principal Distributed Systems Architect');
      expect(text).toContain('Staff Consensus Engineer');
      expect(text).toContain('Cut replication lag by 65% → 4ms');
      expect(text).toContain('University of Warsaw');
      expect(text).toContain('Rust');
      expect(text).toContain('RocksDB');
      expect(text).toContain('Architecture Reviews');
      expect(text).toContain('QuorumKV');
      expect(text).toContain('Polish');
      expect(text).toContain('CKA Kubernetes Administrator');
      expect(text).toContain('Formal Verification in TLA+');
      expect(text).toContain('Best Systems Paper Award');
      expect(text).toContain('ACM SIGOPS');
      expect(text).toContain('Deterministic State Machine Replication');
      expect(text).toContain('Dr. Marek Kowalski');
      expect(text).toContain('Alpine Mountaineering');
      expect(text).toContain('Zero Sev-1 Incidents Across 18 Months');
      expect(text).toContain('US Patent 11,900,123');

      // Logical reading order preserved
      expect(text.indexOf('Work Experience')).toBeLessThan(text.indexOf('Education'));
      expect(text.indexOf('Education')).toBeLessThan(text.indexOf('Publications'));
      expect(text.indexOf('Publications')).toBeLessThan(text.indexOf('Patents'));

      // Verified external links present, SSRF & javascript: links blocked
      expect(links).toEqual(
        expect.arrayContaining([
          'https://zofia.dev/cv',
          'https://raftcore.example.com/',
          'https://github.com/zofia/quorumkv',
          'https://usenix.example.org/paper',
        ])
      );
      expect(links.join(' ')).not.toContain('169.254.169.254');
      expect(links.join(' ')).not.toContain('10.0.0.8');
      expect(links.join(' ')).not.toContain('javascript:');
      expect(text).not.toContain('169.254.169.254');
      expect(text).not.toContain('10.0.0.8');
    });

    it('maps all 17 template layout families and theme tokens cleanly in renderResumePdf including multi-page resumes', async () => {
      const templateIds = Object.keys(TEMPLATE_EXPORT_DEFINITIONS);
      expect(templateIds).toHaveLength(17);

      const layoutsSeen = new Set<string>();
      for (const templateId of templateIds) {
        const resolved = resolveExportTheme({ templateId });
        layoutsSeen.add(resolved.layout);

        const buf = await renderResumePdf(
          buildSampleResumeRecord({
            templateId,
          })
        );
        const { text } = await extractSelectableTextAndLinksFromPdf(buf);
        expect(text).toContain('Anumula Ashok');
        expect(text).toContain('RagaAI');
      }

      expect(layoutsSeen).toEqual(
        new Set(['single', 'two-column', 'sidebar-left', 'sidebar-right'])
      );

      // Multi-page pagination check
      const manyJobsResume = buildSampleResumeRecord({
        templateId: 'accent-sidebar',
        content: {
          ...buildSampleResumeRecord().content,
          sections: [
            {
              id: 'sec-many-work',
              type: 'WorkItem',
              title: 'Experience',
              content: Array.from({ length: 18 }, (_, i) => ({
                id: `job-${i}`,
                position: `Principal Engineer #${i + 1}`,
                company: `Distributed Systems Org ${i + 1}`,
                startDate: '2020',
                endDate: '2024',
                description:
                  'Architected multi-region consensus services and automated failover pipelines across global clusters.',
                highlights: [
                  `Delivered milestone ${i + 1}A improving throughput by 40%`,
                  `Mentored 12 engineers on observability and incident response`,
                ],
              })),
            },
          ],
          sectionOrder: ['sec-many-work'],
        },
      });
      const multiPageBuf = await renderResumePdf(manyJobsResume);
      const multiParsed = await extractSelectableTextAndLinksFromPdf(multiPageBuf);
      expect(multiParsed.pageCount).toBeGreaterThanOrEqual(2);
      expect(multiParsed.text).toContain('Principal Engineer #1');
      expect(multiParsed.text).toContain('Principal Engineer #18');
    }, 20000);

    it('streams editable single-column OpenXML .docx on GET /api/resumes/:id/export.docx with native headings, bullet lists, verified links, and zero floating textboxes', async () => {
      const authHeader = issueAuthHeader();
      const resumeDoc = buildAll16SectionTypesResume();
      jest.spyOn(Resume, 'findOne').mockResolvedValue(resumeDoc as any);

      const res = await request(app)
        .get(`/api/resumes/${resumeDoc._id}/export.docx`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i
      );
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="principal-systems-resume-zofia.docx"'
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const docxBuffer = res.body as Buffer;
      expect(docxBuffer.subarray(0, 2).toString('latin1')).toBe('PK');

      const zipEntries = unzipArchiveEntries(docxBuffer);
      expect(zipEntries.has('[Content_Types].xml')).toBe(true);
      expect(zipEntries.has('word/document.xml')).toBe(true);
      expect(zipEntries.has('word/numbering.xml')).toBe(true);
      expect(zipEntries.has('word/_rels/document.xml.rels')).toBe(true);

      const docXml = zipEntries.get('word/document.xml')!;
      const relsXml = zipEntries.get('word/_rels/document.xml.rels')!;

      // Native Word heading styles + native bullet lists + zero floating text boxes
      expect(docXml).toContain('Heading1');
      expect(docXml).toContain('Heading2');
      expect(docXml).toContain('<w:numPr>');
      expect(docXml).not.toContain('w:txbxContent');

      // All 16 SectionType values rendered in reading order
      expect(docXml).toContain('Zofia Żółć');
      expect(docXml).toContain('Staff Consensus Engineer');
      expect(docXml).toContain('University of Warsaw');
      expect(docXml).toContain('RocksDB');
      expect(docXml).toContain('QuorumKV');
      expect(docXml).toContain('Deterministic State Machine Replication');
      expect(docXml).toContain('US Patent 11,900,123');

      // Verified hyperlinks in document.xml.rels, SSRF & javascript: blocked
      expect(relsXml).toContain('https://zofia.dev/cv');
      expect(relsXml).toContain('https://github.com/zofia/quorumkv');
      expect(relsXml).toContain('TargetMode="External"');
      expect(relsXml).not.toContain('169.254.169.254');
      expect(relsXml).not.toContain('10.0.0.8');
      expect(relsXml).not.toContain('javascript:');
      expect(docXml).not.toContain('169.254.169.254');
    });

    it('serves rate-limited public share exports (.pdf, .docx, .txt) via token and custom slug with privacy redaction and 404/405 guards', async () => {
      const sharedResume = buildSampleResumeRecord({
        sharing: {
          isPublic: true,
          shareToken: 'pub-tok-777',
          slug: 'ashok-public-cv',
          privacy: {
            hideEmail: true,
            hidePhone: true,
            hideAddress: true,
          },
        },
      });

      jest.spyOn(Resume, 'findOne').mockResolvedValue(sharedResume as any);

      const collectBinary = (response: any, cb: any) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      };

      // Share token PDF export redacts hidden email, phone, and street address
      const tokenPdfRes = await request(app)
        .get('/api/resumes/share/pub-tok-777/export.pdf')
        .buffer(true)
        .parse(collectBinary);
      expect(tokenPdfRes.status).toBe(200);
      expect(tokenPdfRes.headers['content-type']).toMatch(/application\/pdf/i);
      const parsedPdf = await extractSelectableTextAndLinksFromPdf(
        tokenPdfRes.body as Buffer
      );
      expect(parsedPdf.text).toContain('Anumula Ashok');
      expect(parsedPdf.text).toContain('San Francisco, US');
      expect(parsedPdf.text).not.toContain('ashok@example.com');
      expect(parsedPdf.text).not.toContain('+1-555-0148');
      expect(parsedPdf.text).not.toContain('742 Evergreen Terrace');

      // Custom slug DOCX export redacts hidden email, phone, and street address
      const slugDocxRes = await request(app)
        .get('/api/public/r/ashok-public-cv/export.docx')
        .buffer(true)
        .parse(collectBinary);
      expect(slugDocxRes.status).toBe(200);
      const docxXml = unzipArchiveEntries(slugDocxRes.body as Buffer).get(
        'word/document.xml'
      )!;
      expect(docxXml).toContain('Anumula Ashok');
      expect(docxXml).not.toContain('ashok@example.com');
      expect(docxXml).not.toContain('+1-555-0148');
      expect(docxXml).not.toContain('742 Evergreen Terrace');

      // Share token TXT export
      const tokenTxtRes = await request(app).get(
        '/api/resumes/share/pub-tok-777/export.txt'
      );
      expect(tokenTxtRes.status).toBe(200);
      expect(tokenTxtRes.text).not.toContain('ashok@example.com');

      // 405 for non-GET methods
      const postRes = await request(app).post(
        '/api/resumes/share/pub-tok-777/export.pdf'
      );
      expect(postRes.status).toBe(405);

      const postSlugRes = await request(app).post(
        '/api/public/r/ashok-public-cv/export.docx'
      );
      expect(postSlugRes.status).toBe(405);

      // 404 when share link is inactive / not found
      jest.spyOn(Resume, 'findOne').mockResolvedValueOnce(null as any);
      const revokedRes = await request(app).get(
        '/api/resumes/share/revoked-token/export.pdf'
      );
      expect(revokedRes.status).toBe(404);
    });
  });
});

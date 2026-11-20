import fs from 'fs';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import { User } from '../models/User';
import { CareerProfile } from '../models/CareerProfile';
import { Resume } from '../models/Resume';
import { Portfolio } from '../models/Portfolio';
import { uploadsDir } from '../middleware/upload';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-career-profile-secret';

const signAuthToken = (userId: string) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

// Build a valid minimal PDF 1.4 buffer with selectable text stream
const buildValidPdfBuffer = (lines: string[]): Buffer => {
  const escapedLines = lines.map((l) =>
    l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  );
  const streamBody = [
    'BT',
    '/F1 11 Tf',
    '50 750 Td',
    ...escapedLines.flatMap((line, i) =>
      i === 0 ? [`(${line}) Tj`] : ['0 -14 Td', `(${line}) Tj`]
    ),
    'ET',
  ].join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'latin1')} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
};

const buildEncryptedPdfBuffer = (): Buffer =>
  Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n6 0 obj\n<< /Filter /Standard /V 2 /R 3 /Length 128 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 6 0 R >>\n%%EOF\n',
    'latin1'
  );

const buildScannedEmptyPdfBuffer = (): Buffer => buildValidPdfBuffer([]);

// Build a genuine ZIP archive (.docx) with [Content_Types].xml, _rels/.rels, and word/document.xml
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZipArchive = (entries: Array<{ name: string; content: string }>): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = Buffer.from(entry.content, 'utf8');
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
};

const buildDocxBuffer = (paragraphs: string[]): Buffer => {
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bodyXml = paragraphs
    .map((p) => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`)
    .join('');

  return buildZipArchive([
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${bodyXml}</w:body></w:document>`,
    },
  ]);
};

const SAMPLE_RESUME_LINES = [
  'Maya Lin',
  'Senior Backend Engineer',
  'maya.lin@example.com | (415) 555-0192 | San Francisco, CA | https://github.com/mayalin | https://linkedin.com/in/mayalin',
  'SUMMARY',
  'Backend engineer with 6+ years of experience building distributed payment services and event pipelines.',
  'EXPERIENCE',
  'Senior Backend Engineer | StripeCorp | San Francisco, CA | Jan 2022 - Present',
  '- Architected idempotent settlement service in TypeScript and Node.js processing 120K+ daily transactions',
  '- Reduced p99 API latency by 38% using Redis read-through caching and PostgreSQL query tuning',
  '- Collaborated with product and platform engineers on service reliability',
  'PROJECTS',
  'QueuePulse | https://github.com/mayalin/queuepulse',
  '- Built dead-letter monitoring dashboard for RabbitMQ and Docker microservices',
  'SKILLS',
  'Languages: TypeScript, Python, SQL',
  'Backend: Node.js, Express, GraphQL',
  'Databases: PostgreSQL, Redis',
  'Messaging: RabbitMQ',
  'DevOps: Docker, GitHub Actions',
  'EDUCATION',
  'B.S. in Computer Science | University of California, Berkeley | 2014 - 2018 | GPA: 3.8',
  'CERTIFICATIONS',
  'AWS Certified Developer Associate | Amazon Web Services | 2023',
  'ACHIEVEMENTS',
  'CalHacks Grand Prize Winner | UC Berkeley Hackathon | 2017',
];

describe('Career Profile, In-Memory Resume Import, Grounded AI & Anti-Fabrication', () => {
  const userAId = '507f1f77bcf86cd799439011';
  const tokenA = signAuthToken(userAId);
  const originalLlamaUrl = process.env.LLAMA_API_URL;
  const originalFetch = global.fetch;

  let storedProfiles: Map<string, any>;
  let storedResumes: Map<string, any>;
  let storedPortfolios: Map<string, any>;

  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.LLAMA_API_URL;
    global.fetch = originalFetch;

    storedProfiles = new Map();
    storedResumes = new Map();
    storedPortfolios = new Map();

    jest.spyOn(User, 'findById').mockImplementation(
      ((id: string) => ({
        select: jest.fn().mockResolvedValue(
          id === userAId
            ? { _id: userAId, name: 'Maya Lin', email: 'maya.lin@example.com' }
            : null
        ),
      })) as any
    );

    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ _id: userAId } as any);

    jest.spyOn(CareerProfile, 'findOne').mockImplementation(((query: any) => {
      const uid = String(query?.userId || '');
      return Promise.resolve(storedProfiles.get(uid) || null);
    }) as any);

    jest.spyOn(CareerProfile, 'findOneAndUpdate').mockImplementation(((
      query: any,
      update: any
    ) => {
      const uid = String(query?.userId || '');
      const payload = update?.$set ? { ...update.$set } : { ...update };
      const saved = {
        _id: 'profile_doc_1',
        ...payload,
        userId: uid,
        updatedAt: new Date(),
        toObject() {
          return { ...this };
        },
      };
      storedProfiles.set(uid, saved);
      return Promise.resolve(saved);
    }) as any);

    jest.spyOn(Resume, 'create').mockImplementation(((data: any) => {
      const id = `resume_${storedResumes.size + 1}`;
      const doc: any = {
        _id: id,
        ...JSON.parse(JSON.stringify(data)),
        history: [],
        save: jest.fn().mockImplementation(function (this: any) {
          storedResumes.set(id, this);
          return Promise.resolve(this);
        }),
        toObject() {
          return JSON.parse(JSON.stringify(this));
        },
      };
      storedResumes.set(id, doc);
      return Promise.resolve(doc);
    }) as any);

    jest.spyOn(Resume, 'findOne').mockImplementation(((query: any) => {
      const doc = storedResumes.get(String(query?._id));
      if (!doc || String(doc.userId) !== String(query?.userId)) {
        return Promise.resolve(null);
      }
      return Promise.resolve(doc);
    }) as any);

    jest.spyOn(Portfolio, 'findOne').mockResolvedValue(null as any);
    jest.spyOn(Portfolio, 'create').mockImplementation(((data: any) => {
      const id = `portfolio_${storedPortfolios.size + 1}`;
      const doc = { _id: id, ...JSON.parse(JSON.stringify(data)) };
      storedPortfolios.set(id, doc);
      return Promise.resolve(doc);
    }) as any);
  });

  afterAll(() => {
    if (originalLlamaUrl !== undefined) {
      process.env.LLAMA_API_URL = originalLlamaUrl;
    } else {
      delete process.env.LLAMA_API_URL;
    }
    global.fetch = originalFetch;
  });

  describe('Authentication & Career Profile CRUD', () => {
    it('enforces authentication (401) on Career Profile and bullet rewrite routes', async () => {
      const r1 = await request(app).get('/api/career-profile');
      expect(r1.status).toBe(401);

      const r2 = await request(app).put('/api/career-profile').send({});
      expect(r2.status).toBe(401);

      const r3 = await request(app).post('/api/career-profile/import/extract');
      expect(r3.status).toBe(401);

      const r4 = await request(app).post('/api/resumes/bullets/rewrite').send({ bullet: 'Test' });
      expect(r4.status).toBe(401);
    });

    it('returns an initialized empty profile before saving, then persists full Career Profile on PUT', async () => {
      const initial = await request(app)
        .get('/api/career-profile')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(initial.status).toBe(200);
      expect(initial.body.data.exists).toBe(false);
      expect(initial.body.data.personalInfo.fullName).toBe('Maya Lin');

      const saveRes = await request(app)
        .put('/api/career-profile')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          userId: 'spoofed-attacker-id',
          personalInfo: {
            fullName: 'Maya Lin',
            email: 'maya.lin@example.com',
            phone: '415-555-0192',
            location: 'San Francisco, CA',
            github: 'https://github.com/mayalin',
          },
          summary: {
            currentTitle: 'Senior Backend Engineer',
            yearsOfExperience: '6+',
            areasOfExpertise: ['Distributed Systems'],
            text: 'Backend engineer specializing in payment infrastructure.',
          },
          experience: [
            {
              company: 'StripeCorp',
              role: 'Senior Backend Engineer',
              startDate: 'Jan 2022',
              current: true,
              responsibilities: ['Owned settlement APIs in TypeScript and Node.js'],
              achievements: ['Reduced p99 API latency by 38%'],
              technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis'],
            },
          ],
          projects: [
            {
              name: 'QueuePulse',
              description: 'Observability dashboard for RabbitMQ queues',
              technologies: ['TypeScript', 'RabbitMQ'],
              url: 'https://github.com/mayalin/queuepulse',
            },
          ],
          skills: {
            languages: ['TypeScript', 'Python'],
            backend: ['Node.js', 'GraphQL'],
            databases: ['PostgreSQL', 'Redis'],
            messaging: ['RabbitMQ'],
          },
          education: [
            {
              degree: 'B.S.',
              field: 'Computer Science',
              institution: 'UC Berkeley',
              startYear: '2014',
              endYear: '2018',
            },
          ],
          certifications: [
            { name: 'AWS Certified Developer Associate', issuer: 'AWS', date: '2023' },
          ],
          achievements: [
            { title: 'CalHacks Winner', category: 'hackathon', date: '2017', description: '1st place' },
          ],
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.exists).toBe(true);
      expect(saveRes.body.data.userId).toBe(userAId);
      expect(saveRes.body.data.completeness).toBe(100);
      expect(saveRes.body.data.experience[0].id).toMatch(/^exp_/);
      expect(saveRes.body.data.skills.languages[0].id).toMatch(/^skill_languages_/);
    });
  });

  describe('In-Memory Resume File Import (PDF, DOCX, TXT) & Mandatory Staging Gate', () => {
    it('extracts PDF, DOCX, and TXT buffers in memory without writing to /uploads or mutating Career Profile until approved', async () => {
      const filesBefore = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];

      // 1. TXT import
      const txtBuffer = Buffer.from(SAMPLE_RESUME_LINES.join('\n'), 'utf8');
      const txtRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', txtBuffer, { filename: 'maya_resume.txt', contentType: 'text/plain' });

      expect(txtRes.status).toBe(200);
      expect(txtRes.body.data.metadata.format).toBe('txt');
      expect(txtRes.body.data.stagedProfile.personalInfo.email).toBe('maya.lin@example.com');
      expect(txtRes.body.data.stagedProfile.experience.length).toBeGreaterThanOrEqual(1);
      expect(txtRes.body.data.stagedProfile.skills.languages.map((s: any) => s.name)).toContain('TypeScript');
      expect(txtRes.body.data.stagedProfile.education[0].institution).toContain('Berkeley');

      // 2. PDF import
      const pdfBuffer = buildValidPdfBuffer(SAMPLE_RESUME_LINES);
      const pdfRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', pdfBuffer, { filename: 'maya_resume.pdf', contentType: 'application/pdf' });

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.body.data.metadata.format).toBe('pdf');
      expect(pdfRes.body.data.stagedProfile.experience[0].company).toContain('StripeCorp');

      // 3. DOCX import
      const docxBuffer = buildDocxBuffer(SAMPLE_RESUME_LINES);
      const docxRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', docxBuffer, {
          filename: 'maya_resume.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

      expect(docxRes.status).toBe(200);
      expect(docxRes.body.data.metadata.format).toBe('docx');
      expect(docxRes.body.data.stagedProfile.projects[0].name).toContain('QueuePulse');

      // Zero files written to /uploads
      const filesAfter = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
      expect(filesAfter).toEqual(filesBefore);

      // Mandatory Staging Gate: Career Profile is STILL untouched when user cancels / before approve
      expect(storedProfiles.has(userAId)).toBe(false);
      const profileCheck = await request(app)
        .get('/api/career-profile')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(profileCheck.body.data.exists).toBe(false);

      // Approve staged items -> persists to Career Profile
      const approveRes = await request(app)
        .post('/api/career-profile/import/approve')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          mode: 'replace',
          stagedProfile: docxRes.body.data.stagedProfile,
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.exists).toBe(true);
      expect(storedProfiles.has(userAId)).toBe(true);
      expect(approveRes.body.data.experience[0].company).toContain('StripeCorp');
    });

    it('rejects >5MB files, unsupported formats, encrypted PDFs, and scanned/empty PDFs with actionable errors while keeping portfolio upload images-only', async () => {
      // >5MB rejection
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 2048, 'a');
      const largeRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', oversized, { filename: 'huge.txt', contentType: 'text/plain' });
      expect(largeRes.status).toBe(400);
      expect(largeRes.body.message).toMatch(/5MB/i);

      // Unsupported format (.png on resume import)
      const imgOnResume = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(imgOnResume.status).toBe(400);
      expect(imgOnResume.body.message).toMatch(/PDF|DOCX|TXT/i);

      // Encrypted PDF -> 422 actionable error
      const encRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', buildEncryptedPdfBuffer(), {
          filename: 'locked.pdf',
          contentType: 'application/pdf',
        });
      expect(encRes.status).toBe(422);
      expect(encRes.body.message).toMatch(/encrypted|password/i);

      // Scanned / image-only PDF -> 422 actionable error (OCR out of scope)
      const scanRes = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', buildScannedEmptyPdfBuffer(), {
          filename: 'scanned.pdf',
          contentType: 'application/pdf',
        });
      expect(scanRes.status).toBe(422);
      expect(scanRes.body.message).toMatch(/scanned|image-only|OCR/i);

      // Portfolio media upload STILL rejects PDF/DOCX/TXT and accepts only JPEG, PNG, WebP
      const pdfOnPortfolio = await request(app)
        .post('/api/portfolios/upload')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', buildValidPdfBuffer(SAMPLE_RESUME_LINES), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        });
      expect(pdfOnPortfolio.status).toBe(400);
      expect(pdfOnPortfolio.body.message).toMatch(/JPEG, PNG, and WebP/i);
    });
  });

  describe('Seeding Resumes & Portfolios, Grounded AI, Provenance & Anti-Fabrication', () => {
    beforeEach(async () => {
      const txtBuffer = Buffer.from(SAMPLE_RESUME_LINES.join('\n'), 'utf8');
      const extracted = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', txtBuffer, { filename: 'maya.txt', contentType: 'text/plain' });

      await request(app)
        .post('/api/career-profile/import/approve')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ mode: 'replace', stagedProfile: extracted.body.data.stagedProfile });
    });

    it('seeds standalone resumes and portfolios with source_fact_ids provenance and leaves Career Profile untouched on single-resume edits', async () => {
      const seedResumeRes = await request(app)
        .post('/api/career-profile/seed-resume')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Maya Lin — Platform Role',
          targetRole: 'Staff Backend Engineer',
          jobDescription: 'Looking for TypeScript, Node.js, PostgreSQL, and Redis expertise.',
        });

      expect(seedResumeRes.status).toBe(201);
      const seededResume = seedResumeRes.body.data;
      expect(seededResume.provenance.seededFromCareerProfile).toBe(true);
      expect(seededResume.provenance.claims.length).toBeGreaterThan(0);
      expect(
        seededResume.provenance.claims.every(
          (c: any) => Array.isArray(c.source_fact_ids) && c.source_fact_ids.length > 0
        )
      ).toBe(true);

      // Mutate the seeded resume heavily
      const patchRes = await request(app)
        .patch(`/api/resumes/${seededResume._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Edited Single Resume',
          content: {
            basics: { name: 'Maya Lin', email: 'maya.lin@example.com' },
            sections: [],
            sectionOrder: [],
          },
        });
      expect(patchRes.status).toBe(200);

      // Verify master Career Profile was NOT mutated
      const masterProfile = await request(app)
        .get('/api/career-profile')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(masterProfile.body.data.experience.length).toBeGreaterThan(0);
      expect(masterProfile.body.data.experience[0].company).toContain('StripeCorp');

      // Seed standalone portfolio
      const seedPortfolioRes = await request(app)
        .post('/api/career-profile/seed-portfolio')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Maya Engineering Portfolio' });

      expect(seedPortfolioRes.status).toBe(201);
      expect(seedPortfolioRes.body.data.basics.name).toBe('Maya Lin');
      const projSection = seedPortfolioRes.body.data.sections.find(
        (s: any) => s.type === 'projects'
      );
      expect(projSection.content[0].name).toContain('QueuePulse');
    });

    it('blocks AI resume generation outputs that introduce unverified companies, roles, degrees, skills, or invented metrics', async () => {
      const draft = await Resume.create({
        userId: userAId as any,
        title: 'Draft',
        content: {
          basics: { name: 'Maya Lin', email: 'maya.lin@example.com' },
          sections: [],
          sectionOrder: [],
        },
      });

      process.env.LLAMA_API_URL = 'http://mock-llm.local/v1/chat/completions';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Hallucinated Resume',
                  summary: 'Principal Rust Architect at Google who increased revenue by 450%.',
                  content: {
                    basics: { name: 'Maya Lin', email: 'maya.lin@example.com' },
                    sections: [
                      {
                        id: 'work',
                        type: 'work',
                        title: 'Experience',
                        content: [
                          {
                            company: 'Google',
                            position: 'Principal Rust Architect',
                            description: 'Scaled Kubernetes clusters by 900% using Rust.',
                            source_fact_ids: ['fake_fact_id'],
                          },
                        ],
                      },
                      {
                        id: 'education',
                        type: 'education',
                        title: 'Education',
                        content: [
                          {
                            institution: 'Stanford University',
                            studyType: 'Ph.D.',
                            source_fact_ids: ['fake_edu'],
                          },
                        ],
                      },
                    ],
                    sectionOrder: ['work', 'education'],
                  },
                }),
              },
            },
          ],
        }),
      }) as any;

      const res = await request(app)
        .post(`/api/resumes/${draft._id}/generate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ prompt: 'Generate an impressive backend resume' });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Blocked unverified AI output/i);
      expect(res.body.message).toMatch(/Google|Rust|450%|Stanford/i);
    });

    it('rewrites bullets without inventing metrics, prompts for real metrics when absent, incorporates user-entered metrics, and blocks hallucinated LLM numbers', async () => {
      // 1. Weak bullet lacking metrics -> needsMetrics=true, zero invented numbers
      const weakRes = await request(app)
        .post('/api/resumes/bullets/rewrite')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          bullet: 'worked on service reliability in order to support product engineers on a daily basis',
          action: 'shorten',
          company: 'StripeCorp',
        });

      expect(weakRes.status).toBe(200);
      expect(weakRes.body.data.needsMetrics).toBe(true);
      expect(weakRes.body.data.metricPrompts).toContain('Reduced latency');
      expect(weakRes.body.data.rewrittenBullet).toMatch(/^Engineered/i);
      expect(weakRes.body.data.rewrittenBullet).not.toMatch(/\d/);
      expect(weakRes.body.data.provenance.groundedInCareerProfile).toBe(true);
      expect(weakRes.body.data.provenance.source_fact_ids.length).toBeGreaterThan(0);

      // 2. User provides real metric -> incorporated cleanly with user_entered_metric provenance
      const metricRes = await request(app)
        .post('/api/resumes/bullets/rewrite')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          bullet: 'worked on service reliability for checkout pipelines',
          action: 'improve',
          company: 'StripeCorp',
          metricCategory: 'Reduced latency',
          userMetric: '42% (from 310ms to 180ms)',
        });

      expect(metricRes.status).toBe(200);
      expect(metricRes.body.data.needsMetrics).toBe(false);
      expect(metricRes.body.data.rewrittenBullet).toContain('42%');
      expect(metricRes.body.data.provenance.source_fact_ids).toContain('user_entered_metric');
      expect(metricRes.body.data.provenance.userEnteredMetric).toBe('42% (from 310ms to 180ms)');

      // 3. Adversarial LLM invents a metric ("73%") not in Career Profile or userMetric -> blocked with 422!
      process.env.LLAMA_API_URL = 'http://mock-llm.local/v1/chat/completions';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrittenBullet:
                    'Engineered service reliability for checkout pipelines, reducing downtime by 73%.',
                }),
              },
            },
          ],
        }),
      }) as any;

      const blockedRes = await request(app)
        .post('/api/resumes/bullets/rewrite')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          bullet: 'worked on service reliability for checkout pipelines',
          action: 'improve',
          company: 'StripeCorp',
        });

      expect(blockedRes.status).toBe(422);
      expect(blockedRes.body.message).toMatch(/73%/);
    });
  });

  describe('Career-Profile-Aware Job Match', () => {
    it('separates missing resume skills into Career Profile verified, transferable context, and unconfirmed skills', async () => {
      // Save Career Profile that has TypeScript, PostgreSQL, GraphQL, and RabbitMQ (but NOT Kafka or Rust)
      const txtBuffer = Buffer.from(SAMPLE_RESUME_LINES.join('\n'), 'utf8');
      const extracted = await request(app)
        .post('/api/career-profile/import/extract')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', txtBuffer, { filename: 'maya.txt', contentType: 'text/plain' });

      await request(app)
        .post('/api/career-profile/import/approve')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ mode: 'replace', stagedProfile: extracted.body.data.stagedProfile });

      // Create an active resume that ONLY mentions TypeScript & Node.js (omitting GraphQL & PostgreSQL which ARE in Career Profile)
      const activeResume = await Resume.create({
        userId: userAId as any,
        title: 'Short Resume',
        content: {
          basics: { name: 'Maya Lin', label: 'Backend Engineer', email: 'maya.lin@example.com' },
          sections: [
            {
              id: 'skills',
              type: 'skills',
              title: 'Skills',
              content: [{ name: 'TypeScript' }, { name: 'Node.js' }],
            },
          ],
          sectionOrder: ['skills'],
        },
      });

      const jd =
        'We are hiring a Senior Backend Engineer with strong TypeScript, Node.js, GraphQL, PostgreSQL, Kafka, and Rust skills to build event-driven services.';

      const matchRes = await request(app)
        .post(`/api/resumes/${activeResume._id}/job-match`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ jobTitle: 'Senior Backend Engineer', jobDescription: jd });

      expect(matchRes.status).toBe(200);
      const data = matchRes.body.data;
      expect(data.hasCareerProfile).toBe(true);

      // Matched on resume: TypeScript, Node.js
      const matchedNames = data.matchedKeywords.map((k: any) => k.keyword);
      expect(matchedNames).toEqual(expect.arrayContaining(['TypeScript', 'Node.js']));

      // Verified in Career Profile (missing from resume): GraphQL, PostgreSQL
      const verifiedNames = data.profileVerifiedSkills.map((k: any) => k.keyword);
      expect(verifiedNames).toEqual(expect.arrayContaining(['GraphQL', 'PostgreSQL']));
      expect(verifiedNames).not.toContain('Kafka');
      expect(verifiedNames).not.toContain('Rust');

      // Transferable skill: Kafka required -> RabbitMQ in Career Profile (Messaging & Event Streaming)
      const kafkaTransferable = data.transferableSkills.find((t: any) => t.keyword === 'Kafka');
      expect(kafkaTransferable).toBeDefined();
      expect(kafkaTransferable.relatedProfileSkills).toContain('RabbitMQ');
      expect(kafkaTransferable.guidance).toMatch(/without claiming Kafka/i);

      // Unconfirmed skills: Kafka & Rust require user confirmation
      const unconfirmedNames = data.unconfirmedSkills.map((u: any) => u.keyword);
      expect(unconfirmedNames).toEqual(expect.arrayContaining(['Kafka', 'Rust']));
    });
  });
});

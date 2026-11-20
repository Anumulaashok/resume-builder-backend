import path from 'path';
import zlib from 'zlib';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { AppError } from '../utils/appError';
import {
  AchievementCategory,
  ICareerAchievement,
  ICareerCertification,
  ICareerEducation,
  ICareerExperience,
  ICareerGroupedSkills,
  ICareerProfileData,
  ICareerProject,
  SkillCategoryKey,
  createEmptyCareerProfileData,
  createEmptyGroupedSkills,
  makeFactId,
  normalizeCareerProfileInput,
} from '../models/CareerProfile';

// Bounded extraction timeout well inside the 15-second serverless ceiling.
const EXTRACTION_TIMEOUT_MS = 8000;
const MIN_READABLE_TEXT_CHARS = 15;

export type ResumeImportFormat = 'pdf' | 'docx' | 'txt';

export interface ExtractedResumeStagingResult {
  stagedProfile: ICareerProfileData;
  metadata: {
    filename: string;
    format: ResumeImportFormat;
    sizeBytes: number;
    extractedCharacters: number;
    detectedCounts: {
      experience: number;
      projects: number;
      skills: number;
      education: number;
      certifications: number;
      achievements: number;
    };
  };
}

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          `${label} timed out. Please upload a smaller or simpler text-based resume file.`,
          422
        )
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const detectFormat = (filename: string, mimetype: string): ResumeImportFormat => {
  const ext = path.extname(filename || '').toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (ext === '.txt' || mime === 'text/plain') return 'txt';

  throw new AppError(
    'Unsupported resume file format. Please upload a PDF (.pdf), Word (.docx), or Plain Text (.txt) file up to 5MB.',
    400
  );
};

const hasPdfEncryptMarker = (buffer: Buffer): boolean => {
  const latin1 = buffer.toString('latin1');
  return /\/Encrypt\b/.test(latin1);
};

// Lightweight fallback for minimal uncompressed PDF streams in case xref tables are non-standard.
const extractFallbackPdfLiterals = (buffer: Buffer): string => {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];
  const tjSingle = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjSingle.exec(raw)) !== null) {
    const decoded = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    chunks.push(decoded);
  }
  const tjArray = /\[((?:.|\r|\n)*?)\]\s*TJ/g;
  while ((match = tjArray.exec(raw)) !== null) {
    const inner = match[1];
    const litRegex = /\(((?:\\.|[^\\()])*)\)/g;
    let lit: RegExpExecArray | null;
    const parts: string[] = [];
    while ((lit = litRegex.exec(inner)) !== null) {
      parts.push(
        lit[1]
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\')
      );
    }
    if (parts.length) chunks.push(parts.join(''));
  }
  return chunks.join('\n');
};

// Fallback ZIP reader for word/document.xml if mammoth fails on a minimal valid DOCX archive.
const extractFallbackDocxXmlText = (buffer: Buffer): string => {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart + compressedSize > buffer.length) break;

    const entryName = buffer.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);

    if (entryName === 'word/document.xml') {
      const xmlBuf =
        compression === 0
          ? rawData
          : compression === 8
            ? zlib.inflateRawSync(rawData)
            : null;
      if (xmlBuf) {
        const xml = xmlBuf.toString('utf8');
        return xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<w:tab[^>]*\/>/g, '\t')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }
    }
    offset = dataStart + compressedSize;
  }
  return '';
};

export const extractTextFromResumeBuffer = async (
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<{ text: string; format: ResumeImportFormat }> => {
  if (!buffer || buffer.length === 0) {
    throw new AppError('Uploaded resume file is empty.', 400);
  }

  const format = detectFormat(filename, mimetype);

  if (format === 'pdf') {
    const headerSlice = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
    if (!headerSlice.includes('%PDF-')) {
      throw new AppError(
        'Invalid PDF file. Please upload a valid text-based PDF, DOCX, or TXT resume.',
        400
      );
    }

    if (hasPdfEncryptMarker(buffer)) {
      throw new AppError(
        'Encrypted or password-protected PDF detected. Please unlock the PDF or upload a DOCX or TXT version.',
        422
      );
    }

    let extracted = '';
    try {
      const parsed = await withTimeout(
        pdfParse(buffer),
        EXTRACTION_TIMEOUT_MS,
        'PDF text extraction'
      );
      extracted = parsed?.text || '';
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('password') || msg.includes('encrypt')) {
        throw new AppError(
          'Encrypted or password-protected PDF detected. Please unlock the PDF or upload a DOCX or TXT version.',
          422
        );
      }
      extracted = extractFallbackPdfLiterals(buffer);
      const rawLatin1 = buffer.toString('latin1');
      const hasValidPdfStructure = /\/Type\s*\/Page\b/.test(rawLatin1) && rawLatin1.includes('%%EOF');
      if (!extracted.trim() && !hasValidPdfStructure) {
        throw new AppError(
          'Could not read PDF structure. Please export a fresh text-based PDF, DOCX, or TXT file.',
          422
        );
      }
    }

    if (!extracted.trim()) {
      extracted = extractFallbackPdfLiterals(buffer);
    }

    const nonSpaceCount = extracted.replace(/\s+/g, '').length;
    if (nonSpaceCount < MIN_READABLE_TEXT_CHARS) {
      throw new AppError(
        'Scanned or image-only PDF detected with no selectable text. Optical character recognition (OCR) is not supported — please upload a text-based PDF, DOCX, or TXT resume.',
        422
      );
    }

    return { text: extracted, format };
  }

  if (format === 'docx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new AppError(
        'Invalid DOCX file. Please upload a valid Microsoft Word (.docx), PDF, or TXT resume.',
        400
      );
    }

    let extracted = '';
    try {
      const result = await withTimeout(
        mammoth.extractRawText({ buffer }),
        EXTRACTION_TIMEOUT_MS,
        'DOCX text extraction'
      );
      extracted = result?.value || '';
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      try {
        extracted = extractFallbackDocxXmlText(buffer);
      } catch {
        extracted = '';
      }
      if (!extracted.trim()) {
        throw new AppError(
          'Unable to extract text from DOCX file. The archive may be corrupted or password-protected.',
          422
        );
      }
    }

    if (!extracted.trim()) {
      try {
        extracted = extractFallbackDocxXmlText(buffer);
      } catch {
        extracted = '';
      }
    }

    if (extracted.replace(/\s+/g, '').length < 10) {
      throw new AppError(
        'No readable resume text was found in the uploaded DOCX file.',
        422
      );
    }

    return { text: extracted, format };
  }

  // TXT handling
  const sampleLen = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleLen; i++) {
    if (buffer[i] === 0x00) {
      throw new AppError(
        'Invalid plain-text file: binary content detected. Please upload UTF-8 plain text (.txt), PDF, or DOCX.',
        400
      );
    }
  }

  const text = buffer.toString('utf8');
  if (text.replace(/\s+/g, '').length < 10) {
    throw new AppError(
      'Uploaded text file is empty or too short to extract career profile facts.',
      422
    );
  }

  return { text, format: 'txt' };
};

const SKILL_CATEGORY_LOOKUP: Array<{ category: SkillCategoryKey; patterns: RegExp[]; canonical?: string }> = [
  { category: 'languages', patterns: [/^(javascript|js)$/i], canonical: 'JavaScript' },
  { category: 'languages', patterns: [/^(typescript|ts)$/i], canonical: 'TypeScript' },
  { category: 'languages', patterns: [/^python$/i], canonical: 'Python' },
  { category: 'languages', patterns: [/^java$/i], canonical: 'Java' },
  { category: 'languages', patterns: [/^(go|golang)$/i], canonical: 'Go' },
  { category: 'languages', patterns: [/^rust$/i], canonical: 'Rust' },
  { category: 'languages', patterns: [/^(c\+\+|cpp)$/i], canonical: 'C++' },
  { category: 'languages', patterns: [/^(c#|csharp)$/i], canonical: 'C#' },
  { category: 'languages', patterns: [/^kotlin$/i], canonical: 'Kotlin' },
  { category: 'languages', patterns: [/^swift$/i], canonical: 'Swift' },
  { category: 'languages', patterns: [/^ruby$/i], canonical: 'Ruby' },
  { category: 'languages', patterns: [/^php$/i], canonical: 'PHP' },
  { category: 'languages', patterns: [/^sql$/i], canonical: 'SQL' },
  { category: 'languages', patterns: [/^dart$/i], canonical: 'Dart' },

  { category: 'backend', patterns: [/^(node\.?js|node)$/i], canonical: 'Node.js' },
  { category: 'backend', patterns: [/^(express|express\.?js)$/i], canonical: 'Express' },
  { category: 'backend', patterns: [/^(nestjs|nest\.?js)$/i], canonical: 'NestJS' },
  { category: 'backend', patterns: [/^spring\s*boot$/i], canonical: 'Spring Boot' },
  { category: 'backend', patterns: [/^django$/i], canonical: 'Django' },
  { category: 'backend', patterns: [/^flask$/i], canonical: 'Flask' },
  { category: 'backend', patterns: [/^fastapi$/i], canonical: 'FastAPI' },
  { category: 'backend', patterns: [/^graphql$/i], canonical: 'GraphQL' },
  { category: 'backend', patterns: [/^grpc$/i], canonical: 'gRPC' },
  { category: 'backend', patterns: [/^rest(\s*apis?)?$/i], canonical: 'REST APIs' },
  { category: 'backend', patterns: [/^(microservices?)$/i], canonical: 'Microservices' },
  { category: 'backend', patterns: [/^\.?net$/i], canonical: '.NET' },
  { category: 'backend', patterns: [/^rails|ruby on rails$/i], canonical: 'Rails' },
  { category: 'backend', patterns: [/^laravel$/i], canonical: 'Laravel' },

  { category: 'frontend', patterns: [/^(react|react\.?js)$/i], canonical: 'React' },
  { category: 'frontend', patterns: [/^react native$/i], canonical: 'React Native' },
  { category: 'frontend', patterns: [/^next\.?js$/i], canonical: 'Next.js' },
  { category: 'frontend', patterns: [/^vue(\.?js)?$/i], canonical: 'Vue' },
  { category: 'frontend', patterns: [/^angular$/i], canonical: 'Angular' },
  { category: 'frontend', patterns: [/^svelte$/i], canonical: 'Svelte' },
  { category: 'frontend', patterns: [/^redux$/i], canonical: 'Redux' },
  { category: 'frontend', patterns: [/^html5?$/i], canonical: 'HTML' },
  { category: 'frontend', patterns: [/^css3?$/i], canonical: 'CSS' },
  { category: 'frontend', patterns: [/^tailwind(\s*css)?$/i], canonical: 'Tailwind CSS' },
  { category: 'frontend', patterns: [/^(sass|scss)$/i], canonical: 'Sass' },

  { category: 'databases', patterns: [/^(postgres|postgresql)$/i], canonical: 'PostgreSQL' },
  { category: 'databases', patterns: [/^mysql$/i], canonical: 'MySQL' },
  { category: 'databases', patterns: [/^(mongo|mongodb|mongoose)$/i], canonical: 'MongoDB' },
  { category: 'databases', patterns: [/^redis$/i], canonical: 'Redis' },
  { category: 'databases', patterns: [/^elasticsearch$/i], canonical: 'Elasticsearch' },
  { category: 'databases', patterns: [/^dynamodb$/i], canonical: 'DynamoDB' },

  { category: 'cloud', patterns: [/^(aws|amazon web services)$/i], canonical: 'AWS' },
  { category: 'cloud', patterns: [/^(gcp|google cloud)$/i], canonical: 'GCP' },
  { category: 'cloud', patterns: [/^azure$/i], canonical: 'Azure' },
  { category: 'cloud', patterns: [/^(serverless|lambda)$/i], canonical: 'Serverless' },

  { category: 'devops', patterns: [/^docker$/i], canonical: 'Docker' },
  { category: 'devops', patterns: [/^(kubernetes|k8s)$/i], canonical: 'Kubernetes' },
  { category: 'devops', patterns: [/^terraform$/i], canonical: 'Terraform' },
  { category: 'devops', patterns: [/^ci\/cd|cicd$/i], canonical: 'CI/CD' },
  { category: 'devops', patterns: [/^github actions$/i], canonical: 'GitHub Actions' },
  { category: 'devops', patterns: [/^jenkins$/i], canonical: 'Jenkins' },
  { category: 'devops', patterns: [/^linux$/i], canonical: 'Linux' },

  { category: 'aiMl', patterns: [/^(machine learning|ml)$/i], canonical: 'Machine Learning' },
  { category: 'aiMl', patterns: [/^deep learning$/i], canonical: 'Deep Learning' },
  { category: 'aiMl', patterns: [/^pytorch$/i], canonical: 'PyTorch' },
  { category: 'aiMl', patterns: [/^tensorflow$/i], canonical: 'TensorFlow' },
  { category: 'aiMl', patterns: [/^(llms?|large language models?|genai|generative ai)$/i], canonical: 'LLMs' },
  { category: 'aiMl', patterns: [/^pandas$/i], canonical: 'Pandas' },
  { category: 'aiMl', patterns: [/^(spark|pyspark)$/i], canonical: 'Spark' },

  { category: 'messaging', patterns: [/^(apache\s+)?kafka$/i], canonical: 'Kafka' },
  { category: 'messaging', patterns: [/^rabbitmq$/i], canonical: 'RabbitMQ' },
  { category: 'messaging', patterns: [/^sqs$/i], canonical: 'SQS' },

  { category: 'tools', patterns: [/^git$/i], canonical: 'Git' },
  { category: 'tools', patterns: [/^jest$/i], canonical: 'Jest' },
  { category: 'tools', patterns: [/^playwright$/i], canonical: 'Playwright' },
  { category: 'tools', patterns: [/^cypress$/i], canonical: 'Cypress' },
  { category: 'tools', patterns: [/^figma$/i], canonical: 'Figma' },
  { category: 'tools', patterns: [/^webpack$/i], canonical: 'Webpack' },
  { category: 'tools', patterns: [/^vite$/i], canonical: 'Vite' },
];

export const classifySkillCategory = (
  skillName: string,
  hintHeading = ''
): { category: SkillCategoryKey; normalizedName: string } => {
  const cleaned = skillName.trim().replace(/^[•\-*·]+\s*/, '');
  for (const entry of SKILL_CATEGORY_LOOKUP) {
    if (entry.patterns.some((re) => re.test(cleaned))) {
      return {
        category: entry.category,
        normalizedName: entry.canonical || cleaned,
      };
    }
  }

  const h = hintHeading.toLowerCase();
  if (h.includes('language')) return { category: 'languages', normalizedName: cleaned };
  if (h.includes('backend') || h.includes('server') || h.includes('api')) {
    return { category: 'backend', normalizedName: cleaned };
  }
  if (h.includes('frontend') || h.includes('ui') || h.includes('web')) {
    return { category: 'frontend', normalizedName: cleaned };
  }
  if (h.includes('database') || h.includes('data store') || h.includes('storage')) {
    return { category: 'databases', normalizedName: cleaned };
  }
  if (h.includes('cloud')) return { category: 'cloud', normalizedName: cleaned };
  if (h.includes('devops') || h.includes('infra') || h.includes('ci/cd')) {
    return { category: 'devops', normalizedName: cleaned };
  }
  if (h.includes('ai') || h.includes('ml') || h.includes('machine learning')) {
    return { category: 'aiMl', normalizedName: cleaned };
  }
  if (h.includes('messag') || h.includes('stream') || h.includes('queue')) {
    return { category: 'messaging', normalizedName: cleaned };
  }
  if (h.includes('tool') || h.includes('test')) {
    return { category: 'tools', normalizedName: cleaned };
  }
  return { category: 'other', normalizedName: cleaned };
};

export const extractQuantitativeMetrics = (lines: string[]): string[] => {
  const found: string[] = [];
  const metricPattern =
    /(?:\$\s?\d+(?:[.,]\d+)?\s*[kKmMbB]?|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\b\d+(?:,\d{3})+(?:\+)?\b|\b\d+\s*(?:ms|sec|seconds|minutes|hours|days|users|requests\/s|rps|qps|tb|gb|mb)\b|\b\d+[kKmM]\+?\b)/gi;

  for (const line of lines) {
    if (metricPattern.test(line)) {
      found.push(line.trim());
    }
    metricPattern.lastIndex = 0;
  }
  return Array.from(new Set(found)).slice(0, 15);
};

const detectKnownTechInText = (text: string): string[] => {
  const techs: string[] = [];
  for (const entry of SKILL_CATEGORY_LOOKUP) {
    const label = entry.canonical;
    if (!label) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-zA-Z0-9+#.])${escaped}(?=$|[^a-zA-Z0-9+#])`, 'i');
    if (pattern.test(text)) {
      techs.push(label);
    }
  }
  return Array.from(new Set(techs));
};

type SectionBucket =
  | 'header'
  | 'summary'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'education'
  | 'certifications'
  | 'achievements';

const SECTION_HEADINGS: Array<{ bucket: SectionBucket; regex: RegExp }> = [
  {
    bucket: 'summary',
    regex: /^(professional\s+summary|executive\s+summary|summary|profile|objective|about\s+me)\s*:?$/i,
  },
  {
    bucket: 'experience',
    regex: /^(work\s+experience|professional\s+experience|employment\s+history|experience|employment|career\s+history)\s*:?$/i,
  },
  {
    bucket: 'projects',
    regex: /^(projects|personal\s+projects|featured\s+projects|key\s+projects|selected\s+projects|open\s+source\s+projects)\s*:?$/i,
  },
  {
    bucket: 'skills',
    regex: /^(technical\s+skills|skills\s*&\s*technologies|core\s+competencies|skills|technologies|tech\s+stack)\s*:?$/i,
  },
  {
    bucket: 'education',
    regex: /^(education|academic\s+background|academics|qualifications)\s*:?$/i,
  },
  {
    bucket: 'certifications',
    regex: /^(certifications?|certificates?|licenses?\s*(&\s*certifications?)?)\s*:?$/i,
  },
  {
    bucket: 'achievements',
    regex: /^(achievements?|awards?(\s*&\s*honors?)?|honors?|publications?|leadership\s*&\s*awards?)\s*:?$/i,
  },
];

const DATE_RANGE_REGEX =
  /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}\/)?\s*(?:19|20)\d{2})\s*(?:[-–—]|to)\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}\/)?\s*(?:19|20)\d{2}|Present|Current|Now)/i;

const isBulletLine = (line: string): boolean => /^[•\-*·▪◦►]\s+/.test(line.trim());
const stripBullet = (line: string): string => line.trim().replace(/^[•\-*·▪◦►]\s+/, '').trim();

const parseExperienceLines = (lines: string[]): ICareerExperience[] => {
  const entries: ICareerExperience[] = [];
  let current: ICareerExperience | null = null;

  const flush = () => {
    if (!current) return;
    if (
      current.company ||
      current.role ||
      current.responsibilities.length > 0 ||
      current.achievements.length > 0
    ) {
      const allBullets = [...current.responsibilities, ...current.achievements];
      current.metrics = extractQuantitativeMetrics(allBullets);
      if (current.technologies.length === 0) {
        current.technologies = detectKnownTechInText(allBullets.join(' '));
      }
      entries.push(current);
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    if (isBulletLine(raw)) {
      if (!current) {
        current = {
          id: makeFactId('exp'),
          company: '',
          role: '',
          location: '',
          startDate: '',
          endDate: '',
          current: false,
          employmentType: '',
          responsibilities: [],
          achievements: [],
          technologies: [],
          metrics: [],
        };
      }
      const text = stripBullet(raw);
      if (extractQuantitativeMetrics([text]).length > 0) {
        current.achievements.push(text);
      } else {
        current.responsibilities.push(text);
      }
      continue;
    }

    if (/^(technologies|tech\s*stack|tools)\s*:/i.test(raw)) {
      if (current) {
        const techPart = raw.replace(/^(technologies|tech\s*stack|tools)\s*:/i, '');
        const parsedTechs = techPart
          .split(/[,;|•]/)
          .map((t) => t.trim())
          .filter(Boolean);
        current.technologies = Array.from(new Set([...current.technologies, ...parsedTechs]));
      }
      continue;
    }

    const dateMatch = raw.match(DATE_RANGE_REGEX);
    if (dateMatch) {
      const startDate = dateMatch[1].trim();
      const endRaw = dateMatch[2].trim();
      const isCurrent = /^(present|current|now)$/i.test(endRaw);
      const remainder = raw
        .replace(dateMatch[0], '')
        .replace(/^[|•\-–—,\s]+|[|•\-–—,\s]+$/g, '')
        .trim();

      if (current && !current.startDate && !current.responsibilities.length && !current.achievements.length) {
        current.startDate = startDate;
        current.endDate = isCurrent ? 'Present' : endRaw;
        current.current = isCurrent;
        if (remainder && !current.company) {
          current.company = remainder;
        }
        continue;
      }

      flush();
      let role = '';
      let company = '';
      let location = '';

      if (remainder) {
        if (/\s+at\s+/i.test(remainder)) {
          const [r, c] = remainder.split(/\s+at\s+/i);
          role = r.trim();
          company = (c || '').trim();
        } else if (remainder.includes('|')) {
          const parts = remainder.split('|').map((p) => p.trim()).filter(Boolean);
          role = parts[0] || '';
          company = parts[1] || '';
          location = parts[2] || '';
        } else if (/\s+[-–—]\s+/.test(remainder)) {
          const parts = remainder.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
          role = parts[0] || '';
          company = parts[1] || '';
          location = parts[2] || '';
        } else {
          role = remainder;
        }
      }

      current = {
        id: makeFactId('exp'),
        company,
        role,
        location,
        startDate,
        endDate: isCurrent ? 'Present' : endRaw,
        current: isCurrent,
        employmentType: '',
        responsibilities: [],
        achievements: [],
        technologies: [],
        metrics: [],
      };
      continue;
    }

    // Header line before dates or role/company line
    const nextLine = (lines[i + 1] || '').trim();
    const nextHasDate = DATE_RANGE_REGEX.test(nextLine);
    const hasRoleCompanyDelimiter =
      /\s+at\s+/i.test(raw) || raw.includes('|') || /\s+[—–-]\s+/.test(raw);

    if (!current || nextHasDate || (hasRoleCompanyDelimiter && (current.responsibilities.length > 0 || current.achievements.length > 0))) {
      flush();
      let role = '';
      let company = '';
      let location = '';
      if (/\s+at\s+/i.test(raw)) {
        const [r, c] = raw.split(/\s+at\s+/i);
        role = r.trim();
        company = (c || '').trim();
      } else if (raw.includes('|')) {
        const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
        role = parts[0] || '';
        company = parts[1] || '';
        location = parts[2] || '';
      } else if (/\s+[—–-]\s+/.test(raw)) {
        const parts = raw.split(/\s+[—–-]\s+/).map((p) => p.trim()).filter(Boolean);
        role = parts[0] || '';
        company = parts[1] || '';
        location = parts[2] || '';
      } else {
        role = raw;
      }

      current = {
        id: makeFactId('exp'),
        company,
        role,
        location,
        startDate: '',
        endDate: '',
        current: false,
        employmentType: '',
        responsibilities: [],
        achievements: [],
        technologies: [],
        metrics: [],
      };
    } else if (!current.company && raw.length < 90) {
      current.company = raw;
    } else {
      current.responsibilities.push(raw);
    }
  }

  flush();
  return entries;
};

const parseProjectLines = (lines: string[]): ICareerProject[] => {
  const projects: ICareerProject[] = [];
  let current: ICareerProject | null = null;
  const bulletBuffer: string[] = [];

  const flush = () => {
    if (!current) return;
    const combinedDesc = [current.description, ...bulletBuffer].filter(Boolean).join('\n');
    current.description = combinedDesc;
    current.metrics = extractQuantitativeMetrics([combinedDesc, current.impact].filter(Boolean));
    if (current.technologies.length === 0) {
      current.technologies = detectKnownTechInText(combinedDesc);
    }
    if (current.name || current.description) {
      projects.push(current);
    }
    current = null;
    bulletBuffer.length = 0;
  };

  for (const rawLine of lines) {
    const raw = rawLine.trim();
    if (!raw) continue;

    if (isBulletLine(raw)) {
      if (!current) {
        current = {
          id: makeFactId('proj'),
          name: 'Project',
          description: '',
          problem: '',
          solution: '',
          technologies: [],
          impact: '',
          metrics: [],
          url: '',
          links: [],
        };
      }
      const text = stripBullet(raw);
      bulletBuffer.push(text);
      if (!current.impact && extractQuantitativeMetrics([text]).length > 0) {
        current.impact = text;
      }
      continue;
    }

    if (/^(technologies|tech\s*stack|built\s+with)\s*:/i.test(raw)) {
      if (current) {
        const techs = raw
          .replace(/^(technologies|tech\s*stack|built\s+with)\s*:/i, '')
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean);
        current.technologies = Array.from(new Set([...current.technologies, ...techs]));
      }
      continue;
    }

    // New project heading line
    if (!current || bulletBuffer.length > 0 || raw.includes('|') || /\s+[—–-]\s+/.test(raw)) {
      flush();
      const urlMatch = raw.match(/https?:\/\/\S+/i);
      const url = urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : '';
      const withoutUrl = url ? raw.replace(urlMatch![0], '').trim() : raw;
      const parts = withoutUrl.split(/\s*[|—–]\s*/).map((p) => p.trim()).filter(Boolean);
      const name = (parts[0] || 'Project').replace(DATE_RANGE_REGEX, '').trim();
      const inlineTechs =
        parts[1] && !DATE_RANGE_REGEX.test(parts[1])
          ? parts[1].split(/[,/]/).map((t) => t.trim()).filter(Boolean)
          : [];

      current = {
        id: makeFactId('proj'),
        name: name || 'Project',
        description: '',
        problem: '',
        solution: '',
        technologies: inlineTechs,
        impact: '',
        metrics: [],
        url,
        links: url ? [url] : [],
      };
    } else {
      bulletBuffer.push(raw);
    }
  }

  flush();
  return projects;
};

const parseSkillsLines = (lines: string[]): ICareerGroupedSkills => {
  const grouped = createEmptyGroupedSkills();
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const cleanedLine = stripBullet(rawLine);
    if (!cleanedLine) continue;

    let hint = '';
    let valuesPart = cleanedLine;
    const colonIdx = cleanedLine.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      hint = cleanedLine.slice(0, colonIdx).trim();
      valuesPart = cleanedLine.slice(colonIdx + 1).trim();
    }

    const tokens = valuesPart
      .split(/[,;|•·]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 60);

    for (const token of tokens) {
      const { category, normalizedName } = classifySkillCategory(token, hint);
      const dedupeKey = normalizedName.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      grouped[category].push({
        id: makeFactId(`skill_${category}`),
        name: normalizedName,
      });
    }
  }

  return grouped;
};

const DEGREE_HINT_REGEX =
  /\b(B\.?S\.?|B\.?A\.?|B\.?E\.?|B\.?Tech|M\.?S\.?|M\.?A\.?|M\.?E\.?|M\.?Tech|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor|Master|Doctor|Associate|Diploma)\b/i;

const INSTITUTION_HINT_REGEX =
  /\b(University|College|Institute|School|Academy|Polytechnic)\b/i;

const parseEducationLines = (lines: string[]): ICareerEducation[] => {
  const education: ICareerEducation[] = [];
  let current: ICareerEducation | null = null;

  const flush = () => {
    if (current && (current.institution || current.degree)) {
      education.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const raw = stripBullet(rawLine);
    if (!raw) continue;

    const gpaMatch = raw.match(/GPA\s*:?\s*(\d\.\d{1,2}(?:\s*\/\s*\d(?:\.\d+)?)?)/i);
    const dateRange = raw.match(DATE_RANGE_REGEX);
    const singleYear = !dateRange ? raw.match(/\b((?:19|20)\d{2})\b/) : null;

    const hasDegree = DEGREE_HINT_REGEX.test(raw);
    const hasInst = INSTITUTION_HINT_REGEX.test(raw);

    if (hasDegree || hasInst) {
      if (
        current &&
        ((hasDegree && current.degree) || (hasInst && current.institution))
      ) {
        flush();
      }
      if (!current) {
        current = {
          id: makeFactId('edu'),
          degree: '',
          field: '',
          institution: '',
          startYear: '',
          endYear: '',
          gpa: '',
          location: '',
        };
      }

      const cleaned = raw
        .replace(DATE_RANGE_REGEX, '')
        .replace(/GPA\s*:?\s*\d\.\d{1,2}(?:\s*\/\s*\d(?:\.\d+)?)?/i, '')
        .trim();

      const segments = (/\s*[|—–]\s*/.test(cleaned)
        ? cleaned.split(/\s*[|—–]\s*/)
        : cleaned.split(/,\s+(?=[A-Z])/)
      )
        .map((s) => s.trim())
        .filter(Boolean);

      for (const seg of segments) {
        if (DEGREE_HINT_REGEX.test(seg) && !current.degree) {
          if (/\s+in\s+/i.test(seg)) {
            const [deg, fld] = seg.split(/\s+in\s+/i);
            current.degree = deg.trim();
            current.field = (fld || '').trim();
          } else {
            current.degree = seg;
          }
        } else if (INSTITUTION_HINT_REGEX.test(seg) && !current.institution) {
          current.institution = seg;
        } else if (!current.field && current.degree && !INSTITUTION_HINT_REGEX.test(seg)) {
          current.field = seg;
        }
      }
    }

    if (current) {
      if (dateRange) {
        current.startYear = dateRange[1].trim();
        current.endYear = dateRange[2].trim();
      } else if (singleYear && !current.endYear) {
        current.endYear = singleYear[1];
      }
      if (gpaMatch) {
        current.gpa = gpaMatch[1].trim();
      }
    }
  }

  flush();
  return education;
};

const parseCertificationLines = (lines: string[]): ICareerCertification[] => {
  const certs: ICareerCertification[] = [];
  for (const rawLine of lines) {
    const raw = stripBullet(rawLine);
    if (!raw) continue;
    const urlMatch = raw.match(/https?:\/\/\S+/i);
    const credentialUrl = urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : '';
    const withoutUrl = credentialUrl ? raw.replace(urlMatch![0], '').trim() : raw;
    const yearMatch = withoutUrl.match(/\b((?:19|20)\d{2})\b/);
    const date = yearMatch ? yearMatch[1] : '';
    const parts = withoutUrl
      .replace(/\(\s*(?:19|20)\d{2}\s*\)/, '')
      .split(/\s*[|—–-]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const name = parts[0] || withoutUrl;
    const issuer = parts[1] && parts[1] !== date ? parts[1] : '';
    if (name) {
      certs.push({
        id: makeFactId('cert'),
        name,
        issuer,
        date,
        credentialUrl,
      });
    }
  }
  return certs;
};

const inferAchievementCategory = (text: string): AchievementCategory => {
  const lower = text.toLowerCase();
  if (lower.includes('hackathon')) return 'hackathon';
  if (lower.includes('paper') || lower.includes('publish') || lower.includes('journal') || lower.includes('conference')) {
    return 'publication';
  }
  if (lower.includes('open source') || lower.includes('open-source') || lower.includes('github') || lower.includes('maintainer')) {
    return 'open-source';
  }
  if (lower.includes('lead') || lower.includes('president') || lower.includes('mentor') || lower.includes('chair')) {
    return 'leadership';
  }
  if (lower.includes('award') || lower.includes('winner') || lower.includes('first place') || lower.includes('prize') || lower.includes('honor')) {
    return 'award';
  }
  return 'other';
};

const parseAchievementLines = (lines: string[]): ICareerAchievement[] => {
  const out: ICareerAchievement[] = [];
  for (const rawLine of lines) {
    const raw = stripBullet(rawLine);
    if (!raw) continue;
    const yearMatch = raw.match(/\b((?:19|20)\d{2})\b/);
    const parts = raw.split(/\s*[|—–]\s*/).map((p) => p.trim()).filter(Boolean);
    out.push({
      id: makeFactId('ach'),
      title: parts[0] || raw.slice(0, 100),
      category: inferAchievementCategory(raw),
      issuer: parts[1] || '',
      date: yearMatch ? yearMatch[1] : '',
      description: raw,
    });
  }
  return out;
};

export const parseResumeTextToStagedProfile = (
  rawText: string,
  defaults?: { fullName?: string; email?: string }
): ICareerProfileData => {
  const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');

  const buckets: Record<SectionBucket, string[]> = {
    header: [],
    summary: [],
    experience: [],
    projects: [],
    skills: [],
    education: [],
    certifications: [],
    achievements: [],
  };

  let activeBucket: SectionBucket = 'header';
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const matchedHeading = SECTION_HEADINGS.find((h) => h.regex.test(trimmed));
    if (matchedHeading) {
      activeBucket = matchedHeading.bucket;
      continue;
    }

    buckets[activeBucket].push(trimmed);
  }

  const profile = createEmptyCareerProfileData(defaults);

  // Extract contact details across header & full text
  const emailMatch = normalizedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = normalizedText.match(
    /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/
  );
  const linkedinMatch = normalizedText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i);
  const githubMatch = normalizedText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+\/?/i);
  const allUrls = normalizedText.match(/https?:\/\/[^\s|,;)]+/gi) || [];
  const portfolioUrl =
    allUrls.find(
      (u) => !/linkedin\.com|github\.com/i.test(u)
    ) || '';

  if (emailMatch) profile.personalInfo.email = emailMatch[0];
  if (phoneMatch) profile.personalInfo.phone = phoneMatch[0].trim();
  if (linkedinMatch) {
    profile.personalInfo.linkedin = linkedinMatch[0].startsWith('http')
      ? linkedinMatch[0]
      : `https://${linkedinMatch[0]}`;
  }
  if (githubMatch) {
    profile.personalInfo.github = githubMatch[0].startsWith('http')
      ? githubMatch[0]
      : `https://${githubMatch[0]}`;
  }
  if (portfolioUrl) {
    profile.personalInfo.portfolio = portfolioUrl;
    profile.personalInfo.website = portfolioUrl;
  }

  // Name & headline from header lines
  const cleanHeaderCandidates = buckets.header.filter(
    (line) =>
      !/@/.test(line) &&
      !/linkedin\.com|github\.com|https?:\/\//i.test(line) &&
      !(phoneMatch && line.includes(phoneMatch[0]))
  );

  if (cleanHeaderCandidates.length > 0) {
    const first = cleanHeaderCandidates[0].split(/[|—–]/)[0].trim();
    if (first.length >= 2 && first.length <= 70) {
      profile.personalInfo.fullName = first;
    }
    if (cleanHeaderCandidates[1] && cleanHeaderCandidates[1].length <= 100) {
      profile.summary.currentTitle = cleanHeaderCandidates[1];
    }
  }

  const locationMatch = buckets.header
    .join(' | ')
    .match(/\b([A-Z][a-zA-Z.\s]{1,28},\s*(?:[A-Z]{2}|[A-Z][a-zA-Z\s]{2,20})|Remote)\b/);
  if (locationMatch) {
    profile.personalInfo.location = locationMatch[1].trim();
  }

  if (buckets.summary.length > 0) {
    const summaryText = buckets.summary.join(' ');
    profile.summary.text = summaryText;
    const yearsMatch = summaryText.match(/\b(\d+\+?\s*years?)\b/i);
    if (yearsMatch) {
      profile.summary.yearsOfExperience = yearsMatch[1];
    }
  }

  profile.experience = parseExperienceLines(buckets.experience);
  if (!profile.summary.currentTitle && profile.experience[0]?.role) {
    profile.summary.currentTitle = profile.experience[0].role;
  }

  profile.projects = parseProjectLines(buckets.projects);
  profile.skills = parseSkillsLines(buckets.skills);
  profile.education = parseEducationLines(buckets.education);
  profile.certifications = parseCertificationLines(buckets.certifications);
  profile.achievements = parseAchievementLines(buckets.achievements);

  // If no explicit Skills section existed, populate verified skills mentioned in experience/projects
  const totalCategorizedSkills = Object.values(profile.skills).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  if (totalCategorizedSkills === 0) {
    const detected = detectKnownTechInText(
      [...buckets.experience, ...buckets.projects, ...buckets.summary].join(' ')
    );
    profile.skills = parseSkillsLines(detected.length ? [detected.join(', ')] : []);
  }

  return normalizeCareerProfileInput(
    profile as unknown as Record<string, unknown>,
    defaults
  );
};

export const extractResumeForStaging = async (
  file: { buffer: Buffer; originalname: string; mimetype: string; size?: number },
  defaults?: { fullName?: string; email?: string }
): Promise<ExtractedResumeStagingResult> => {
  const { text, format } = await extractTextFromResumeBuffer(
    file.buffer,
    file.originalname,
    file.mimetype
  );

  const stagedProfile = parseResumeTextToStagedProfile(text, defaults);
  const skillCount = Object.values(stagedProfile.skills).reduce(
    (sum, list) => sum + list.length,
    0
  );

  return {
    stagedProfile,
    metadata: {
      filename: file.originalname,
      format,
      sizeBytes: file.size ?? file.buffer.length,
      extractedCharacters: text.length,
      detectedCounts: {
        experience: stagedProfile.experience.length,
        projects: stagedProfile.projects.length,
        skills: skillCount,
        education: stagedProfile.education.length,
        certifications: stagedProfile.certifications.length,
        achievements: stagedProfile.achievements.length,
      },
    },
  };
};

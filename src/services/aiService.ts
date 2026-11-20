import { z } from 'zod';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';

// Zod Schema for Resume Generation matching the Mongoose model
const LocationSchema = z.object({
  address: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  postalCode: z.string().optional()
}).optional();

const BasicsSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  email: z.string(),
  phone: z.string().optional(),
  location: LocationSchema
});

const SectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  content: z.array(z.any()),
  isCustom: z.boolean().optional()
});

export const GeneratedResumeSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  content: z.object({
    basics: BasicsSchema,
    sections: z.array(SectionSchema),
    sectionOrder: z.array(z.string())
  })
});

export type GeneratedResume = z.infer<typeof GeneratedResumeSchema>;

// Bounded so retries finish inside the 15s serverless function limit.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 5000;

export type AIResumeResult = Partial<GeneratedResume> & { summary: string };

export const analyzeResumePrompt = async (prompt: string): Promise<AIResumeResult> => {
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  if (!apiUrl) {
    return { summary: `[AI placeholder] Generated summary based on: ${prompt}` };
  }

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an expert resume builder. Extract the user's prompt into a structured JSON resume. The JSON must exactly match this schema:
{
  "title": "String",
  "summary": "String",
  "content": {
    "basics": { "name": "String", "email": "String", "phone": "String (optional)", "label": "String (optional)" },
    "sections": [ { "id": "String", "type": "String", "title": "String", "content": [ ] } ],
    "sectionOrder": [ "String" ]
  }
}
Return ONLY valid JSON. No markdown, no explanations.`
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      
      let jsonString = data?.choices?.[0]?.message?.content || data?.response || '';
      
      if (!jsonString && typeof data === 'object') {
          jsonString = JSON.stringify(data);
      }
      
      // Attempt to extract JSON if it contains markdown blocks or extra text
      jsonString = jsonString.trim();
      if (jsonString.startsWith('\`\`\`json')) {
        jsonString = jsonString.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
      } else if (jsonString.startsWith('\`\`\`')) {
        jsonString = jsonString.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
      } else {
        // Fallback robust json extraction in case there's text around it
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        }
      }

      const parsedJson = JSON.parse(jsonString);
      
      const result = GeneratedResumeSchema.safeParse(parsedJson);
      
      if (!result.success) {
        logger.error(`Validation failed for AI output: ${JSON.stringify(result.error.errors)}`);
        throw new Error('AI generated malformed structure that failed validation.');
      }

      return { ...result.data, summary: result.data.summary ?? '' };
    } catch (error: any) {
      attempt++;
      logger.warn(`AI generation attempt ${attempt} failed: ${error.message}`);
      
      if (attempt >= MAX_RETRIES) {
        logger.error(`AI generation permanently failed after ${MAX_RETRIES} attempts. Error: ${error.message}`);
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }
      
      await new Promise(res => setTimeout(res, RETRY_DELAY_MS * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

export interface CoverLetterGenerationInput {
  resume?: {
    title?: string;
    summary?: string;
    content?: {
      basics?: {
        name?: string;
        label?: string;
        email?: string;
        phone?: string;
      };
      sections?: Array<{
        id?: string;
        type?: string;
        title?: string;
        content?: any[];
      }>;
    };
  } | null;
  careerProfile?: {
    basics?: {
      name?: string;
      label?: string;
      email?: string;
      summary?: string;
    };
    experiences?: Array<{
      company?: string;
      name?: string;
      position?: string;
      description?: string;
      highlights?: string[];
      technologies?: string[];
      metrics?: string[];
    }>;
    projects?: Array<{
      name?: string;
      description?: string;
      highlights?: string[];
      technologies?: string[];
      metrics?: string[];
    }>;
    skills?: Array<{
      name?: string;
      keywords?: string[];
      subSkills?: Array<{ name?: string }>;
    }>;
  } | null;
  recipient?: {
    name?: string;
    company?: string;
    address?: string;
  };
  jobTitle?: string;
  jobDescription?: string;
  prompt?: string;
}

const METRIC_SIGNAL_REGEX =
  /(?:\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|sec|seconds|mins?|hours?|days?|k|m|b|tb|gb|mb|rps|qps|users?|clients?|customers?|engineers?|developers?|requests?|services?|pipelines?|repos?|countries|teams?)\b|\$\s*\d+(?:[.,]\d+)?\s*(?:k|m|b)?)/i;

const dedupePreserveOrder = (items: string[], limit: number): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const clean = (raw || '').trim().replace(/^[•●◦▪▸►✓✔*–—-]\s*/, '');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= limit) break;
  }
  return out;
};

export const extractResumeHighlights = (
  resume?: CoverLetterGenerationInput['resume'],
  careerProfile?: CoverLetterGenerationInput['careerProfile']
) => {
  const basics = resume?.content?.basics || {};
  const profileBasics = careerProfile?.basics || {};
  const sections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];

  const skills: string[] = [];
  const roles: string[] = [];
  const highlights: string[] = [];
  const metrics: string[] = [];
  const projectSummaries: string[] = [];

  for (const section of sections) {
    const sectionType = String(section?.type || section?.id || '').toLowerCase();
    const items = Array.isArray(section?.content) ? section.content : [];

    if (sectionType.includes('skill')) {
      for (const item of items) {
        if (typeof item === 'string' && item.trim()) {
          skills.push(item.trim());
        } else if (item && typeof item.name === 'string' && item.name.trim()) {
          skills.push(item.name.trim());
        }
      }
    } else if (sectionType.includes('work') || sectionType.includes('experience')) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const pos = typeof item.position === 'string' ? item.position.trim() : '';
        const org =
          typeof item.company === 'string' && item.company.trim()
            ? item.company.trim()
            : typeof item.name === 'string'
              ? item.name.trim()
              : '';
        if (pos && org) {
          roles.push(`${pos} at ${org}`);
        } else if (pos || org) {
          roles.push(pos || org);
        }
        if (Array.isArray(item.highlights)) {
          for (const h of item.highlights) {
            if (typeof h === 'string' && h.trim()) {
              highlights.push(h.trim());
              if (METRIC_SIGNAL_REGEX.test(h)) {
                metrics.push(h.trim());
              }
            }
          }
        }
      }
    } else if (sectionType.includes('project')) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const pName = typeof item.name === 'string' ? item.name.trim() : '';
        if (Array.isArray(item.highlights)) {
          for (const h of item.highlights) {
            if (typeof h === 'string' && h.trim()) {
              const labeled = pName ? `${pName}: ${h.trim()}` : h.trim();
              highlights.push(labeled);
              if (METRIC_SIGNAL_REGEX.test(h)) {
                metrics.push(labeled);
              }
            }
          }
        } else if (pName && typeof item.description === 'string' && item.description.trim()) {
          projectSummaries.push(`${pName}: ${item.description.trim()}`);
        }
      }
    }
  }

  // Enrich from approved CareerProfile (critical when no single resume is linked, and adds verified metrics)
  if (careerProfile) {
    for (const exp of careerProfile.experiences || []) {
      const pos = typeof exp?.position === 'string' ? exp.position.trim() : '';
      const org =
        typeof exp?.company === 'string' && exp.company.trim()
          ? exp.company.trim()
          : typeof exp?.name === 'string'
            ? exp.name.trim()
            : '';
      const roleLabel = pos && org ? `${pos} at ${org}` : pos || org;
      if (roleLabel) {
        roles.push(roleLabel);
      }
      for (const m of exp?.metrics || []) {
        if (typeof m === 'string' && m.trim()) {
          metrics.push(roleLabel ? `${m.trim()} (${org || pos})` : m.trim());
        }
      }
      for (const h of exp?.highlights || []) {
        if (typeof h === 'string' && h.trim()) {
          highlights.push(h.trim());
          if (METRIC_SIGNAL_REGEX.test(h)) {
            metrics.push(h.trim());
          }
        }
      }
    }

    for (const proj of careerProfile.projects || []) {
      const pName = typeof proj?.name === 'string' ? proj.name.trim() : '';
      for (const m of proj?.metrics || []) {
        if (typeof m === 'string' && m.trim()) {
          metrics.push(pName ? `${pName} — ${m.trim()}` : m.trim());
        }
      }
      for (const h of proj?.highlights || []) {
        if (typeof h === 'string' && h.trim()) {
          const labeled = pName ? `${pName} — ${h.trim()}` : h.trim();
          highlights.push(labeled);
          if (METRIC_SIGNAL_REGEX.test(h)) {
            metrics.push(labeled);
          }
        }
      }
      if (pName && typeof proj?.description === 'string' && proj.description.trim()) {
        projectSummaries.push(`${pName}: ${proj.description.trim()}`);
      }
    }

    for (const sk of careerProfile.skills || []) {
      if (sk?.name && sk.name.trim()) {
        skills.push(sk.name.trim());
      }
      for (const kw of sk?.keywords || []) {
        if (typeof kw === 'string' && kw.trim()) {
          skills.push(kw.trim());
        }
      }
    }
  }

  return {
    candidateName: basics.name?.trim() || profileBasics.name?.trim() || '',
    candidateRole:
      basics.label?.trim() ||
      profileBasics.label?.trim() ||
      resume?.title?.trim() ||
      '',
    summary: (
      resume?.summary ||
      (basics as any)?.summary ||
      profileBasics.summary ||
      ''
    )
      .toString()
      .trim(),
    topSkills: dedupePreserveOrder(skills, 10),
    recentRoles: dedupePreserveOrder(roles, 4),
    verifiedHighlights: dedupePreserveOrder(highlights, 6),
    verifiedMetrics: dedupePreserveOrder(metrics, 5),
    projectSummaries: dedupePreserveOrder(projectSummaries, 4)
  };
};

const buildPlaceholderCoverLetterBody = (input: CoverLetterGenerationInput): string => {
  const targetRole = input.jobTitle?.trim() || 'the open position';
  const company = input.recipient?.company?.trim() || 'your organization';
  const {
    candidateRole,
    summary,
    topSkills,
    recentRoles,
    verifiedHighlights,
    verifiedMetrics
  } = extractResumeHighlights(input.resume, input.careerProfile);

  const openingRoleClause = candidateRole
    ? ` as a ${candidateRole}`
    : '';
  const paragraph1 = `I am writing to express my strong interest in the ${targetRole} opportunity at ${company}. Drawing on my background${openingRoleClause}, I am excited about the chance to contribute thoughtful execution and dependable collaboration to your team.`;

  const experienceParts: string[] = [];
  if (recentRoles.length > 0) {
    experienceParts.push(`In my experience as ${recentRoles.slice(0, 3).join(' and ')}, I have focused on delivering reliable, high-impact outcomes.`);
  } else if (summary) {
    const conciseSummary = summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
    experienceParts.push(conciseSummary);
  }
  const groundedAchievements =
    verifiedMetrics.length > 0
      ? verifiedMetrics.slice(0, 3)
      : verifiedHighlights.slice(0, 3);
  if (groundedAchievements.length > 0) {
    const cleaned = groundedAchievements.map((item) => item.replace(/[.]+$/, '')).join('; ');
    experienceParts.push(`Notable verified highlights include: ${cleaned}.`);
  }
  if (topSkills.length > 0) {
    experienceParts.push(`My core strengths include ${topSkills.slice(0, 8).join(', ')}.`);
  }
  if (input.jobDescription && input.jobDescription.trim()) {
    const cleanJd = input.jobDescription.trim().replace(/\s+/g, ' ');
    const snippet = cleanJd.length > 160 ? `${cleanJd.slice(0, 157).trimEnd()}...` : cleanJd;
    experienceParts.push(`Your requirements—particularly "${snippet}"—closely align with the problems I enjoy solving.`);
  }
  if (experienceParts.length === 0) {
    experienceParts.push(
      `Throughout my career, I have prioritized clear communication, adaptability, and measurable results that align closely with the goals of ${company}.`
    );
  }
  const paragraph2 = experienceParts.join(' ');

  const promptNote =
    input.prompt && input.prompt.trim()
      ? ` In particular, I welcome the opportunity to discuss ${input.prompt.trim().replace(/[.]+$/, '')}.`
      : '';
  const paragraph3 = `Thank you for your time and consideration.${promptNote} I would welcome the opportunity to speak further about how my background can support ${company}'s upcoming priorities.`;

  return [paragraph1, paragraph2, paragraph3].join('\n\n');
};

export const generateCoverLetterBody = async (
  input: CoverLetterGenerationInput
): Promise<string> => {
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  if (!apiUrl) {
    return buildPlaceholderCoverLetterBody(input);
  }

  const {
    candidateName,
    candidateRole,
    summary,
    topSkills,
    recentRoles,
    verifiedHighlights,
    verifiedMetrics,
    projectSummaries
  } = extractResumeHighlights(input.resume, input.careerProfile);

  const resumeContextLines = [
    candidateName ? `Candidate Name: ${candidateName}` : '',
    candidateRole ? `Current Title: ${candidateRole}` : '',
    summary ? `Summary: ${summary}` : '',
    recentRoles.length > 0 ? `Experience: ${recentRoles.join('; ')}` : '',
    verifiedMetrics.length > 0
      ? `Verified Metrics & Impact:\n- ${verifiedMetrics.join('\n- ')}`
      : '',
    verifiedHighlights.length > 0
      ? `Verified Career Highlights:\n- ${verifiedHighlights.join('\n- ')}`
      : '',
    projectSummaries.length > 0
      ? `Projects:\n- ${projectSummaries.join('\n- ')}`
      : '',
    topSkills.length > 0 ? `Skills: ${topSkills.join(', ')}` : ''
  ].filter(Boolean);

  const userPromptParts = [
    input.jobTitle ? `Target Job Title: ${input.jobTitle}` : '',
    input.recipient?.company ? `Target Company: ${input.recipient.company}` : '',
    input.recipient?.name ? `Recipient: ${input.recipient.name}` : '',
    resumeContextLines.length > 0
      ? `Verified Candidate Facts (Resume & Career Profile):\n${resumeContextLines.join('\n')}`
      : '',
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : '',
    input.prompt ? `Additional Instructions:\n${input.prompt}` : ''
  ].filter(Boolean);

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You write concise, professional cover letter body paragraphs grounded strictly in the provided verified candidate facts and job description. Cite concrete verified achievements and metrics when relevant, and NEVER invent or fabricate employers, dates, skills, metrics, or credentials. Omit the greeting and signature—return ONLY 3 to 4 plain-text body paragraphs separated by blank lines (\\n\\n) or JSON {"body": "..."}.'
      },
      {
        role: 'user',
        content: userPromptParts.join('\n\n') || 'Draft a professional cover letter body.'
      }
    ]
  };

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      let rawText: string =
        data?.choices?.[0]?.message?.content ??
        data?.body ??
        data?.response ??
        '';

      if (typeof rawText !== 'string') {
        rawText = '';
      }

      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
      }

      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed.body === 'string') {
            cleaned = parsed.body.trim();
          }
        } catch {
          // Use raw text if not valid JSON
        }
      }

      if (!cleaned) {
        throw new Error('AI returned an empty cover letter draft.');
      }

      return cleaned;
    } catch (error: any) {
      attempt++;
      logger.warn(`AI cover letter generation attempt ${attempt} failed: ${error.message}`);

      if (attempt >= MAX_RETRIES) {
        logger.error(
          `AI cover letter generation permanently failed after ${MAX_RETRIES} attempts. Error: ${error.message}`
        );
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }

      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

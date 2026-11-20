import { z } from 'zod';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';
import { ICareerProfileData, SKILL_CATEGORY_KEYS } from '../models/CareerProfile';
import { IProvenanceClaim, IResumeProvenance } from '../models/Resume';
import {
  BulletRewriteAction,
  METRIC_PROMPT_OPTIONS,
  buildGroundedResumeFromProfile,
  buildProfileFactIndex,
  deterministicBulletTransform,
  hasQuantitativeMetrics,
  validateGroundedBullet,
  validateGroundedResume,
} from './groundingService';

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

export type AIResumeResult = Partial<GeneratedResume> & {
  summary: string;
  provenance?: IResumeProvenance;
};

export interface GroundedGenerationOptions {
  careerProfile?: ICareerProfileData | null;
  targetRole?: string;
  jobDescription?: string;
  fallbackName?: string;
  fallbackEmail?: string;
}

const hasApprovedCareerProfileFacts = (
  profile?: ICareerProfileData | null
): profile is ICareerProfileData => {
  if (!profile) return false;
  const totalSkills = SKILL_CATEGORY_KEYS.reduce(
    (sum, key) => sum + (profile.skills?.[key]?.length || 0),
    0
  );
  return Boolean(
    profile.summary?.text?.trim() ||
      profile.summary?.currentTitle?.trim() ||
      profile.experience?.length ||
      profile.projects?.length ||
      totalSkills > 0 ||
      profile.education?.length ||
      profile.certifications?.length ||
      profile.achievements?.length
  );
};

export const analyzeResumePrompt = async (
  prompt: string,
  options?: GroundedGenerationOptions
): Promise<AIResumeResult> => {
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';
  const profile = options?.careerProfile;
  const groundedMode = hasApprovedCareerProfileFacts(profile);

  if (!apiUrl) {
    if (groundedMode && profile) {
      const grounded = buildGroundedResumeFromProfile(profile, {
        prompt,
        targetRole: options?.targetRole,
        jobDescription: options?.jobDescription,
        fallbackName: options?.fallbackName,
        fallbackEmail: options?.fallbackEmail,
      });
      return {
        title: grounded.title,
        summary: grounded.summary,
        content: grounded.content,
        provenance: grounded.provenance,
      };
    }
    return { summary: `[AI placeholder] Generated summary based on: ${prompt}` };
  }

  const systemContent = groundedMode && profile
    ? `You are a strictly grounded resume tailoring assistant.
CRITICAL RULES (PRD Section 4 — NEVER FABRICATE EXPERIENCE):
1. Use ONLY the approved Career Profile facts provided below.
2. NEVER invent companies, roles, degrees, institutions, certifications, skills, or numeric metrics that do not appear in the Career Profile.
3. Every item in every section MUST include a non-empty "source_fact_ids": ["..."] array referencing exact fact IDs from the Career Profile.
4. Return ONLY valid JSON matching:
{
  "title": "String",
  "summary": "String",
  "content": {
    "basics": { "name": "String", "email": "String", "phone": "String (optional)", "label": "String (optional)", "summary": "String (optional)" },
    "sections": [ { "id": "String", "type": "WorkItem | ProjectItem | SkillItem | EducationItem | CertificateItem | AwardItem", "title": "String", "content": [ { "source_fact_ids": ["String"] } ] } ],
    "sectionOrder": [ "String" ]
  }
}`
    : `You are an expert resume builder. Extract the user's prompt into a structured JSON resume. The JSON must exactly match this schema:
{
  "title": "String",
  "summary": "String",
  "content": {
    "basics": { "name": "String", "email": "String", "phone": "String (optional)", "label": "String (optional)" },
    "sections": [ { "id": "String", "type": "String", "title": "String", "content": [ ] } ],
    "sectionOrder": [ "String" ]
  }
}
Return ONLY valid JSON. No markdown, no explanations.`;

  const userContent = groundedMode && profile
    ? JSON.stringify({
        careerProfile: profile,
        targetRole: options?.targetRole || '',
        jobDescription: options?.jobDescription || '',
        instructions: prompt,
      })
    : prompt;

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: systemContent
      },
      {
        role: 'user',
        content: userContent
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

      if (groundedMode && profile) {
        const groundingCheck = validateGroundedResume(result.data, profile);
        if (!groundingCheck.valid) {
          throw new AppError(
            `Blocked unverified AI output: ${groundingCheck.violations.join(' ')}`,
            422
          );
        }

        const claims: IProvenanceClaim[] = [];
        for (const section of result.data.content.sections) {
          (section.content || []).forEach((item: any, idx: number) => {
            if (Array.isArray(item?.source_fact_ids) && item.source_fact_ids.length > 0) {
              claims.push({
                targetPath: `sections.${section.id}.${idx}`,
                text: String(item.description || item.name || item.title || item.institution || ''),
                source_fact_ids: item.source_fact_ids,
              });
            }
          });
        }

        return {
          ...result.data,
          summary: result.data.summary ?? '',
          provenance: {
            seededFromCareerProfile: true,
            careerProfileUpdatedAt: new Date().toISOString(),
            ...(options?.targetRole ? { targetRole: options.targetRole } : {}),
            claims,
          },
        };
      }

      return { ...result.data, summary: result.data.summary ?? '' };
    } catch (error: any) {
      if (error instanceof AppError && error.statusCode === 422) {
        throw error;
      }
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

export interface BulletRewriteInput {
  bullet: string;
  action?: BulletRewriteAction;
  sectionType?: 'work' | 'projects' | string;
  itemId?: string;
  company?: string;
  role?: string;
  projectName?: string;
  technologies?: string[];
  metricCategory?: string;
  userMetric?: string;
  targetRole?: string;
  jobDescription?: string;
  careerProfile?: ICareerProfileData | null;
}

export interface BulletRewriteOutput {
  rewrittenBullet: string;
  originalBullet: string;
  action: BulletRewriteAction;
  needsMetrics: boolean;
  metricPrompts: string[];
  provenance: {
    source_fact_ids: string[];
    userEnteredMetric?: string;
    groundedInCareerProfile: boolean;
  };
}

export const rewriteBulletWithAI = async (
  input: BulletRewriteInput
): Promise<BulletRewriteOutput> => {
  const originalBullet = (input.bullet || '').trim();
  if (!originalBullet) {
    throw new AppError('Bullet text is required for rewriting.', 400);
  }

  const validActions: BulletRewriteAction[] = ['rewrite', 'shorten', 'improve', 'ats'];
  const action: BulletRewriteAction = validActions.includes(input.action as BulletRewriteAction)
    ? (input.action as BulletRewriteAction)
    : 'rewrite';

  const profile = input.careerProfile || null;
  const factIndex = buildProfileFactIndex(profile);

  // Resolve matching Career Profile fact IDs for provenance
  const matchedFactIds: string[] = [];
  if (profile) {
    if (input.itemId && factIndex.facts.has(input.itemId)) {
      matchedFactIds.push(input.itemId);
    }
    const lowerCompany = (input.company || '').trim().toLowerCase();
    const lowerRole = (input.role || '').trim().toLowerCase();
    const lowerProj = (input.projectName || '').trim().toLowerCase();
    const lowerBullet = originalBullet.toLowerCase();

    for (const exp of profile.experience || []) {
      if (
        (lowerCompany && exp.company.toLowerCase() === lowerCompany) ||
        (lowerRole && exp.role.toLowerCase() === lowerRole) ||
        exp.responsibilities.some((r) => r.toLowerCase().includes(lowerBullet.slice(0, 28))) ||
        exp.achievements.some((a) => a.toLowerCase().includes(lowerBullet.slice(0, 28)))
      ) {
        if (!matchedFactIds.includes(exp.id)) matchedFactIds.push(exp.id);
      }
    }

    for (const proj of profile.projects || []) {
      if (
        (lowerProj && proj.name.toLowerCase() === lowerProj) ||
        proj.description.toLowerCase().includes(lowerBullet.slice(0, 28))
      ) {
        if (!matchedFactIds.includes(proj.id)) matchedFactIds.push(proj.id);
      }
    }
  }

  const groundedInCareerProfile = matchedFactIds.length > 0;
  const sourceFactIds = groundedInCareerProfile ? [...matchedFactIds] : ['current_resume_bullet'];
  const trimmedUserMetric = (input.userMetric || '').trim();
  if (trimmedUserMetric) {
    sourceFactIds.push('user_entered_metric');
  }

  // Only allow technologies that exist in Career Profile or on the current bullet/item
  const verifiedTechnologies: string[] = [];
  if (profile) {
    for (const fid of matchedFactIds) {
      const exp = profile.experience.find((e) => e.id === fid);
      if (exp) verifiedTechnologies.push(...exp.technologies);
      const proj = profile.projects.find((p) => p.id === fid);
      if (proj) verifiedTechnologies.push(...proj.technologies);
    }
  }
  for (const tech of input.technologies || []) {
    const clean = tech.trim();
    if (!clean) continue;
    if (!profile || factIndex.skills.has(clean.toLowerCase()) || factIndex.allTextLower.includes(clean.toLowerCase())) {
      verifiedTechnologies.push(clean);
    }
  }

  const needsMetrics =
    !hasQuantitativeMetrics(originalBullet) && !hasQuantitativeMetrics(trimmedUserMetric);

  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY || '';

  if (apiUrl) {
    const allowedContext = matchedFactIds
      .map((id) => factIndex.facts.get(id)?.text || '')
      .filter(Boolean)
      .join('\n');

    const requestBody = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You rewrite a single resume bullet with action="${action}".
STRICT ANTI-FABRICATION RULES:
- NEVER invent numbers, percentages, dollar amounts, latencies, or user counts.
- NEVER add companies, roles, degrees, certifications, or technical skills not present in the original bullet, approved Career Profile context, or userMetric.
- If userMetric is provided, incorporate ONLY that metric accurately.
Return ONLY JSON: {"rewrittenBullet": "..."}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            bullet: originalBullet,
            action,
            approvedContext: allowedContext,
            verifiedTechnologies: Array.from(new Set(verifiedTechnologies)),
            metricCategory: input.metricCategory || '',
            userMetric: trimmedUserMetric,
            targetRole: input.targetRole || '',
          }),
        },
      ],
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
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        let rawContent = data?.choices?.[0]?.message?.content ?? data?.rewrittenBullet ?? '';
        if (typeof rawContent !== 'string') rawContent = JSON.stringify(rawContent);
        rawContent = rawContent.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();

        let rewrittenCandidate = rawContent;
        if (rawContent.startsWith('{')) {
          const parsed = JSON.parse(rawContent);
          rewrittenCandidate = String(parsed.rewrittenBullet || '').trim();
        }

        const check = validateGroundedBullet({
          rewrittenText: rewrittenCandidate,
          originalText: originalBullet,
          sourceFactIds,
          factIndex,
          userEnteredMetric: trimmedUserMetric,
        });
        if (!check.valid) {
          throw new AppError(
            `Blocked unverified AI bullet rewrite: ${check.violations.join(' ')}`,
            422
          );
        }

        return {
          rewrittenBullet: rewrittenCandidate,
          originalBullet,
          action,
          needsMetrics,
          metricPrompts: [...METRIC_PROMPT_OPTIONS],
          provenance: {
            source_fact_ids: sourceFactIds,
            ...(trimmedUserMetric ? { userEnteredMetric: trimmedUserMetric } : {}),
            groundedInCareerProfile,
          },
        };
      } catch (error: any) {
        if (error instanceof AppError && error.statusCode === 422) {
          throw error;
        }
        attempt++;
        if (attempt >= MAX_RETRIES) {
          throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
        }
        await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempt));
      }
    }
  }

  const rewrittenBullet = deterministicBulletTransform({
    bullet: originalBullet,
    action,
    verifiedTechnologies: Array.from(new Set(verifiedTechnologies)),
    metricCategory: input.metricCategory,
    metricValue: trimmedUserMetric,
  });

  const check = validateGroundedBullet({
    rewrittenText: rewrittenBullet,
    originalText: originalBullet,
    sourceFactIds,
    factIndex,
    userEnteredMetric: trimmedUserMetric,
  });

  if (!check.valid) {
    throw new AppError(
      `Blocked unverified bullet rewrite: ${check.violations.join(' ')}`,
      422
    );
  }

  return {
    rewrittenBullet,
    originalBullet,
    action,
    needsMetrics,
    metricPrompts: [...METRIC_PROMPT_OPTIONS],
    provenance: {
      source_fact_ids: sourceFactIds,
      ...(trimmedUserMetric ? { userEnteredMetric: trimmedUserMetric } : {}),
      groundedInCareerProfile,
    },
  };
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
  recipient?: {
    name?: string;
    company?: string;
    address?: string;
  };
  jobTitle?: string;
  jobDescription?: string;
  prompt?: string;
}

const extractResumeHighlights = (resume?: CoverLetterGenerationInput['resume']) => {
  const basics = resume?.content?.basics || {};
  const sections = Array.isArray(resume?.content?.sections) ? resume!.content!.sections! : [];

  const skills: string[] = [];
  const roles: string[] = [];

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
      }
    }
  }

  return {
    candidateRole: basics.label?.trim() || resume?.title?.trim() || '',
    summary: (resume?.summary || (basics as any)?.summary || '').toString().trim(),
    topSkills: Array.from(new Set(skills)).slice(0, 5),
    recentRoles: roles.slice(0, 2)
  };
};

const buildPlaceholderCoverLetterBody = (input: CoverLetterGenerationInput): string => {
  const targetRole = input.jobTitle?.trim() || 'the open position';
  const company = input.recipient?.company?.trim() || 'your organization';
  const { candidateRole, summary, topSkills, recentRoles } = extractResumeHighlights(input.resume);

  const openingRoleClause = candidateRole
    ? ` as a ${candidateRole}`
    : '';
  const paragraph1 = `I am writing to express my strong interest in the ${targetRole} opportunity at ${company}. Drawing on my background${openingRoleClause}, I am excited about the chance to contribute thoughtful execution and dependable collaboration to your team.`;

  const experienceParts: string[] = [];
  if (recentRoles.length > 0) {
    experienceParts.push(`In my experience as ${recentRoles.join(' and ')}, I have focused on delivering reliable, high-impact outcomes.`);
  } else if (summary) {
    const conciseSummary = summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
    experienceParts.push(conciseSummary);
  }
  if (topSkills.length > 0) {
    experienceParts.push(`My core strengths include ${topSkills.join(', ')}.`);
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

  const { candidateRole, summary, topSkills, recentRoles } = extractResumeHighlights(input.resume);
  const resumeContextLines = [
    input.resume?.content?.basics?.name ? `Candidate Name: ${input.resume.content.basics.name}` : '',
    candidateRole ? `Current Title: ${candidateRole}` : '',
    summary ? `Summary: ${summary}` : '',
    recentRoles.length > 0 ? `Experience: ${recentRoles.join('; ')}` : '',
    topSkills.length > 0 ? `Skills: ${topSkills.join(', ')}` : ''
  ].filter(Boolean);

  const userPromptParts = [
    input.jobTitle ? `Target Job Title: ${input.jobTitle}` : '',
    input.recipient?.company ? `Target Company: ${input.recipient.company}` : '',
    input.recipient?.name ? `Recipient: ${input.recipient.name}` : '',
    resumeContextLines.length > 0 ? `Linked Resume Facts:\n${resumeContextLines.join('\n')}` : '',
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : '',
    input.prompt ? `Additional Instructions:\n${input.prompt}` : ''
  ].filter(Boolean);

  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You write concise, professional cover letter body paragraphs grounded strictly in the provided resume facts and job description. Do not invent employers, metrics, or credentials. Omit the greeting and signature—return ONLY 3 to 4 plain-text body paragraphs separated by blank lines (\\n\\n) or JSON {"body": "..."}.'
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

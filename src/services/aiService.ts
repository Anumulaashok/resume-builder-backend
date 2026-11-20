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
        content: `You are an expert resume builder. Extract the user's prompt into a structured JSON resume grounded strictly in the facts provided by the user. Never invent employers, job titles, degrees, credentials, dates, or unverified metrics. The JSON must exactly match this schema:
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

import { z } from 'zod';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';
import {
  MAX_AI_PROMPT_LENGTH,
  maskPromptPII,
  sanitizeDeep,
  validatePromptInput
} from '../utils/sanitize';

export type LLMProviderName = 'openai' | 'anthropic' | 'gemini' | 'llama';

export interface ProviderConfig {
  name: LLMProviderName;
  apiUrl: string;
  apiKey: string;
  model: string;
}

// Zod Schemas for AI Outputs
const LocationSchema = z
  .object({
    address: z.string().optional(),
    city: z.string().optional(),
    countryCode: z.string().optional(),
    postalCode: z.string().optional()
  })
  .optional();

const BasicsSchema = z.object({
  name: z.string().optional().default(''),
  label: z.string().optional(),
  email: z.string().optional().default(''),
  phone: z.string().optional(),
  summary: z.string().optional(),
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

export const BulletOptimizationSchema = z.object({
  suggestions: z.array(z.string().min(1)).min(1).max(5)
});

export const SummaryGenerationSchema = z.object({
  summary: z.string().min(1).optional(),
  suggestions: z.array(z.string().min(1)).min(1).optional()
});

export type GeneratedResume = z.infer<typeof GeneratedResumeSchema>;
export type AIResumeResult = Partial<GeneratedResume> & { summary: string };

export interface OptimizeBulletInput {
  bullet: string;
  role?: string;
  company?: string;
  targetRole?: string;
  context?: string;
}

export interface OptimizeBulletResult {
  suggestions: string[];
}

export interface GenerateSummaryInput {
  prompt?: string;
  targetRole?: string;
  experienceContext?: string;
  currentSummary?: string;
}

export interface GenerateSummaryResult {
  summary: string;
  suggestions: string[];
}

const getMaxRetries = (): number => {
  const parsed = Number(process.env.AI_MAX_RETRIES);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 3) : 2;
};

const getRetryDelayMs = (): number => {
  const parsed = Number(process.env.AI_RETRY_DELAY_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
};

const getTimeoutMs = (): number => {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 100 ? parsed : 4500;
};

/**
 * Resolves all configured LLM providers in priority order.
 * If AI_PROVIDER is explicitly set, that provider is placed first, followed by
 * any secondary configured providers as failover candidates.
 */
export const resolveConfiguredProviders = (): ProviderConfig[] => {
  const preferred = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const candidates: Map<LLMProviderName, ProviderConfig> = new Map();

  const openAiKey = (process.env.OPENAI_API_KEY || '').trim();
  const openAiUrl = (process.env.OPENAI_API_URL || '').trim();
  if (openAiKey || openAiUrl || (preferred === 'openai' && process.env.AI_API_KEY)) {
    candidates.set('openai', {
      name: 'openai',
      apiUrl: openAiUrl || 'https://api.openai.com/v1/chat/completions',
      apiKey: openAiKey || (process.env.AI_API_KEY || '').trim(),
      model: (process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini').trim()
    });
  }

  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const anthropicUrl = (process.env.ANTHROPIC_API_URL || '').trim();
  if (anthropicKey || anthropicUrl || (preferred === 'anthropic' && process.env.AI_API_KEY)) {
    candidates.set('anthropic', {
      name: 'anthropic',
      apiUrl: anthropicUrl || 'https://api.anthropic.com/v1/messages',
      apiKey: anthropicKey || (process.env.AI_API_KEY || '').trim(),
      model: (
        process.env.ANTHROPIC_MODEL ||
        process.env.AI_MODEL ||
        'claude-3-5-haiku-latest'
      ).trim()
    });
  }

  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiUrl = (process.env.GEMINI_API_URL || '').trim();
  if (geminiKey || geminiUrl || (preferred === 'gemini' && process.env.AI_API_KEY)) {
    const model = (process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.0-flash').trim();
    candidates.set('gemini', {
      name: 'gemini',
      apiUrl:
        geminiUrl ||
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      apiKey: geminiKey || (process.env.AI_API_KEY || '').trim(),
      model
    });
  }

  const llamaUrl = (process.env.LLAMA_API_URL || process.env.AI_API_URL || '').trim();
  if (llamaUrl) {
    candidates.set('llama', {
      name: 'llama',
      apiUrl: llamaUrl,
      apiKey: (process.env.LLAMA_API_KEY || process.env.AI_API_KEY || '').trim(),
      model: (process.env.LLAMA_MODEL || process.env.AI_MODEL || 'llama-3.1-8b-instruct').trim()
    });
  }

  const ordered: ProviderConfig[] = [];
  if (
    preferred &&
    (preferred === 'openai' ||
      preferred === 'anthropic' ||
      preferred === 'gemini' ||
      preferred === 'llama')
  ) {
    const primary = candidates.get(preferred);
    if (primary) {
      ordered.push(primary);
      candidates.delete(preferred);
    }
  }

  for (const config of candidates.values()) {
    ordered.push(config);
  }

  return ordered;
};

/**
 * Builds standard JSON request headers and payload for each supported LLM provider.
 */
export const buildProviderRequest = (
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } => {
  switch (provider.name) {
    case 'anthropic':
      return {
        url: provider.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {})
        },
        body: {
          model: provider.model,
          max_tokens: 2048,
          temperature: 0.4,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        }
      };

    case 'gemini':
      return {
        url: provider.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { 'x-goog-api-key': provider.apiKey } : {})
        },
        body: {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json'
          }
        }
      };

    case 'openai':
      return {
        url: provider.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
        },
        body: {
          model: provider.model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }
      };

    case 'llama':
    default:
      return {
        url: provider.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
        },
        body: {
          model: provider.model,
          temperature: 0.4,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }
      };
  }
};

/**
 * Extracts raw text content from any supported LLM provider JSON response envelope.
 */
export const extractProviderText = (providerName: LLMProviderName, data: any): string => {
  if (!data) return '';

  if (providerName === 'anthropic') {
    if (Array.isArray(data.content)) {
      const joined = data.content
        .map((block: any) => (typeof block?.text === 'string' ? block.text : ''))
        .join('\n')
        .trim();
      if (joined) return joined;
    }
  }

  if (providerName === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .join('\n')
        .trim();
      if (joined) return joined;
    }
  }

  const openAiContent = data?.choices?.[0]?.message?.content;
  if (typeof openAiContent === 'string' && openAiContent.trim()) {
    return openAiContent.trim();
  }

  if (typeof data?.response === 'string' && data.response.trim()) {
    return data.response.trim();
  }

  if (typeof data === 'string') {
    return data.trim();
  }

  if (typeof data === 'object') {
    return JSON.stringify(data);
  }

  return '';
};

const parseJsonFromLLMText = (rawText: string): unknown => {
  let cleaned = rawText.trim();
  if (!cleaned) {
    throw new Error('Empty response from LLM provider');
  }

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  } else {
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      cleaned = cleaned.substring(objStart, objEnd + 1);
    }
  }

  return JSON.parse(cleaned);
};

/**
 * Executes a structured JSON request against configured LLM providers with retries,
 * timeout protection, PII scrubbing, output sanitization, and schema validation.
 */
const executeStructuredLLMCall = async <T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<T> => {
  const validatedPrompt = validatePromptInput(userPrompt, 'prompt');
  const maskedPrompt = maskPromptPII(validatedPrompt);

  const providers = resolveConfiguredProviders();
  if (providers.length === 0) {
    throw new AppError(
      'AI generation is currently unavailable because no LLM provider is configured.',
      503
    );
  }

  const maxRetries = getMaxRetries();
  const retryDelayMs = getRetryDelayMs();
  const timeoutMs = getTimeoutMs();

  let lastErrorMessage = 'Upstream LLM service error';

  for (const provider of providers) {
    let attempt = 0;

    while (attempt < maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const reqSpec = buildProviderRequest(provider, systemPrompt, maskedPrompt);
        const response = await fetch(reqSpec.url, {
          method: 'POST',
          headers: reqSpec.headers,
          body: JSON.stringify(reqSpec.body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Provider ${provider.name} returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const rawText = extractProviderText(provider.name, data);
        const parsedJson = parseJsonFromLLMText(rawText);
        const sanitizedJson = sanitizeDeep(parsedJson);

        const validation = schema.safeParse(sanitizedJson);
        if (!validation.success) {
          logger.error(
            `Validation failed for ${provider.name} AI output: ${JSON.stringify(
              validation.error.errors
            )}`
          );
          throw new Error('AI response structure failed schema validation');
        }

        return validation.data;
      } catch (error: any) {
        clearTimeout(timeoutId);
        attempt++;
        const errMsg =
          error?.name === 'AbortError'
            ? `Provider ${provider.name} timed out after ${timeoutMs}ms`
            : error?.message || 'Unknown provider error';
        lastErrorMessage = errMsg;
        logger.warn(`AI provider ${provider.name} attempt ${attempt} failed: ${errMsg}`);

        if (attempt < maxRetries && retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    }

    logger.error(
      `AI provider ${provider.name} exhausted all ${maxRetries} attempts. Trying next provider if available.`
    );
  }

  logger.error(`All configured AI providers failed. Last error: ${lastErrorMessage}`);
  throw new AppError(
    'AI service is temporarily unavailable. Please try again in a moment.',
    502
  );
};

export const analyzeResumePrompt = async (prompt: string): Promise<AIResumeResult> => {
  const systemPrompt = `You are an expert ATS resume writer. Convert the user's career prompt into a structured JSON resume grounded strictly in the provided information without fabricating employers, degrees, or metrics.
The JSON must match this exact structure:
{
  "title": "Target Role or Resume Title",
  "summary": "Concise 2-4 sentence professional summary",
  "content": {
    "basics": {
      "name": "",
      "label": "Target Professional Title",
      "email": "",
      "phone": "",
      "summary": "Same concise professional summary"
    },
    "sections": [
      {
        "id": "work-1",
        "type": "WorkItem",
        "title": "Professional Experience",
        "content": [
          {
            "id": "work-item-1",
            "name": "Company Name",
            "company": "Company Name",
            "position": "Role Title",
            "startDate": "2022",
            "endDate": "Present",
            "description": "• Action-oriented bullet point"
          }
        ]
      },
      {
        "id": "skills-1",
        "type": "SkillItem",
        "title": "Skills",
        "content": [
          { "id": "skill-item-1", "name": "Core Skill", "level": "Advanced", "subSkills": [] }
        ]
      }
    ],
    "sectionOrder": ["work-1", "skills-1"]
  }
}
Return ONLY valid JSON with no markdown or commentary.`;

  const data = await executeStructuredLLMCall(prompt ? systemPrompt : systemPrompt, prompt, GeneratedResumeSchema);
  const resolvedSummary = data.summary || data.content.basics.summary || '';

  return {
    ...data,
    summary: resolvedSummary,
    content: {
      ...data.content,
      basics: {
        ...data.content.basics,
        summary: resolvedSummary
      }
    }
  };
};

export const optimizeBulletPoints = async (
  input: OptimizeBulletInput
): Promise<OptimizeBulletResult> => {
  const bullet = validatePromptInput(input.bullet, 'bullet');

  const contextParts: string[] = [`Original bullet point: "${bullet}"`];
  if (input.role && typeof input.role === 'string' && input.role.trim()) {
    contextParts.push(`Role: ${input.role.trim()}`);
  }
  if (input.company && typeof input.company === 'string' && input.company.trim()) {
    contextParts.push(`Organization: ${input.company.trim()}`);
  }
  if (input.targetRole && typeof input.targetRole === 'string' && input.targetRole.trim()) {
    contextParts.push(`Target Role: ${input.targetRole.trim()}`);
  }
  if (input.context && typeof input.context === 'string' && input.context.trim()) {
    contextParts.push(`Additional Guidance: ${input.context.trim()}`);
  }

  const combinedPrompt = contextParts.join('\n');
  if (combinedPrompt.length > MAX_AI_PROMPT_LENGTH) {
    throw new AppError(
      `Prompt exceeds the maximum allowed length of ${MAX_AI_PROMPT_LENGTH} characters`,
      400
    );
  }

  const systemPrompt = `You are an expert technical resume editor. Rewrite the user's resume bullet point into exactly 3 distinct, stronger, ATS-friendly variations using impactful action verbs, clear ownership, and outcome framing without inventing unverified employers or fake facts.
Return ONLY valid JSON matching this exact schema:
{
  "suggestions": [
    "Refined version 1",
    "Refined version 2",
    "Refined version 3"
  ]
}
Do not include leading bullet symbols (• or -) inside the strings.`;

  const result = await executeStructuredLLMCall(
    systemPrompt,
    combinedPrompt,
    BulletOptimizationSchema
  );

  const cleanedSuggestions = result.suggestions
    .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (cleanedSuggestions.length === 0) {
    throw new AppError(
      'AI service is temporarily unavailable. Please try again in a moment.',
      502
    );
  }

  return { suggestions: cleanedSuggestions };
};

export const generateProfessionalSummary = async (
  input: GenerateSummaryInput
): Promise<GenerateSummaryResult> => {
  const parts: string[] = [];
  if (input.targetRole && typeof input.targetRole === 'string' && input.targetRole.trim()) {
    parts.push(`Target Role: ${input.targetRole.trim()}`);
  }
  if (input.prompt && typeof input.prompt === 'string' && input.prompt.trim()) {
    parts.push(`Key Highlights & Instructions: ${input.prompt.trim()}`);
  }
  if (
    input.experienceContext &&
    typeof input.experienceContext === 'string' &&
    input.experienceContext.trim()
  ) {
    parts.push(`Resume Context: ${input.experienceContext.trim()}`);
  }
  if (
    input.currentSummary &&
    typeof input.currentSummary === 'string' &&
    input.currentSummary.trim()
  ) {
    parts.push(`Current Summary: ${input.currentSummary.trim()}`);
  }

  const combinedPrompt = parts.join('\n');
  validatePromptInput(combinedPrompt, 'prompt');

  const systemPrompt = `You are an expert executive and technical resume writer. Generate 3 tailored, concise professional summary options (2-4 sentences each) grounded in the user's target role and background without fabricating credentials or companies.
Return ONLY valid JSON matching this exact schema:
{
  "summary": "Primary recommended professional summary",
  "suggestions": [
    "Primary recommended professional summary",
    "Alternative concise impact-focused summary",
    "Alternative leadership & domain-focused summary"
  ]
}`;

  const result = await executeStructuredLLMCall(
    systemPrompt,
    combinedPrompt,
    SummaryGenerationSchema
  );

  const suggestions =
    result.suggestions && result.suggestions.length > 0
      ? result.suggestions.map((s) => s.trim()).filter(Boolean)
      : result.summary
      ? [result.summary.trim()]
      : [];

  if (suggestions.length === 0) {
    throw new AppError(
      'AI service is temporarily unavailable. Please try again in a moment.',
      502
    );
  }

  return {
    summary: result.summary?.trim() || suggestions[0],
    suggestions: suggestions.slice(0, 3)
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

  const maxRetries = getMaxRetries();
  const timeoutMs = getTimeoutMs();
  const retryDelayMs = getRetryDelayMs();
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

      if (attempt >= maxRetries) {
        logger.error(
          `AI cover letter generation permanently failed after ${maxRetries} attempts. Error: ${error.message}`
        );
        throw new AppError(`AI Service Error: ${error.message || 'Unknown error'}`, 502);
      }

      await new Promise((res) => setTimeout(res, retryDelayMs * attempt));
    }
  }

  throw new AppError('AI Service Error: Max retries exceeded', 502);
};

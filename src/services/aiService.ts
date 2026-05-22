import { z } from 'zod';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';

interface AIResponse {
  summary: string;
}

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 30000;

export const analyzeResumePrompt = async (prompt: string): Promise<GeneratedResume> => {
  const apiUrl = process.env.LLAMA_API_URL || 'https://api.openai.com/v1/chat/completions';
  const apiKey = process.env.LLAMA_API_KEY || '';

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

      return result.data;
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

import { validationResult } from 'express-validator';
import {
  generateResumeFromPrompt,
  updateResume,
  undoResume
} from '../resumeController';
import { Resume } from '../../models/Resume';
import { resumeValidation } from '../../middleware/validationRules';
import * as aiService from '../../services/aiService';
import { SectionType } from '../../utils/resumeNormalizer';

jest.mock('../../models/Resume');

describe('resumeController - themeConfig & undo support', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { _id: 'user123' },
      params: { resumeId: 'resume123' },
      body: {},
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('updateResume', () => {
    it('saves themeConfig and adds revision to history when themeConfig changes', async () => {
      const mockDoc: any = {
        _id: 'resume123',
        userId: 'user123',
        title: 'My Resume',
        content: { basics: { name: 'Alice' }, sections: [], sectionOrder: [] },
        themeConfig: { primaryColor: '#000000', sectionSpacing: 'normal' },
        history: [],
        save: jest.fn().mockResolvedValue(true),
      };

      (Resume.findOne as jest.Mock).mockResolvedValue(mockDoc);

      mockReq.body = {
        themeConfig: { primaryColor: '#2563eb', sectionSpacing: 'compact' },
      };

      await updateResume(mockReq, mockRes, mockNext);

      expect(mockDoc.history).toHaveLength(1);
      expect(mockDoc.history[0].themeConfig).toEqual({ primaryColor: '#000000', sectionSpacing: 'normal' });
      expect(mockDoc.themeConfig).toEqual({ primaryColor: '#2563eb', sectionSpacing: 'compact' });
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('does not add to history if neither content nor themeConfig changed', async () => {
      const mockDoc: any = {
        _id: 'resume123',
        userId: 'user123',
        title: 'My Resume',
        content: { basics: { name: 'Alice' }, sections: [], sectionOrder: [] },
        themeConfig: { primaryColor: '#2563eb' },
        history: [],
        save: jest.fn().mockResolvedValue(true),
      };

      (Resume.findOne as jest.Mock).mockResolvedValue(mockDoc);

      mockReq.body = {
        title: 'Updated Title',
        themeConfig: { primaryColor: '#2563eb' },
      };

      await updateResume(mockReq, mockRes, mockNext);

      expect(mockDoc.history).toHaveLength(0);
      expect(mockDoc.title).toBe('Updated Title');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });

  describe('undoResume', () => {
    it('restores previous themeConfig from history', async () => {
      const previousTheme = { primaryColor: '#1e293b', sectionSpacing: 'normal' };
      const currentTheme = { primaryColor: '#dc2626', sectionSpacing: 'spacious' };

      const mockDoc: any = {
        _id: 'resume123',
        userId: 'user123',
        content: { basics: { name: 'Alice Current' } },
        themeConfig: currentTheme,
        history: [
          {
            content: { basics: { name: 'Alice Previous' } },
            themeConfig: previousTheme,
            updatedAt: new Date(),
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      (Resume.findOne as jest.Mock).mockResolvedValue(mockDoc);

      await undoResume(mockReq, mockRes, mockNext);

      expect(mockDoc.history).toHaveLength(0);
      expect(mockDoc.content).toEqual({ basics: { name: 'Alice Previous' } });
      expect(mockDoc.themeConfig).toEqual(previousTheme);
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });
});

describe('generateResumeFromPrompt & AI output normalization', () => {
  const originalLlamaUrl = process.env.LLAMA_API_URL;
  const originalLlamaKey = process.env.LLAMA_API_KEY;
  const originalFetch = global.fetch;

  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  const runAutoSaveValidation = async (payload: any) => {
    const reqForValidation: any = { body: payload };
    for (const validator of resumeValidation) {
      await validator.run(reqForValidation);
    }
    return validationResult(reqForValidation);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { _id: 'user123' },
      params: { resumeId: 'resume123' },
      body: {
        prompt:
          'Backend engineer at Acme Corp (2022-2024) and Globex (2020-2022). BS Computer Science at MIT from 2018-09 to May 2022. Skills: TypeScript, Node.js. Patent on distributed consensus.'
      }
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    if (originalLlamaUrl === undefined) {
      delete process.env.LLAMA_API_URL;
    } else {
      process.env.LLAMA_API_URL = originalLlamaUrl;
    }
    if (originalLlamaKey === undefined) {
      delete process.env.LLAMA_API_KEY;
    } else {
      process.env.LLAMA_API_KEY = originalLlamaKey;
    }
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends canonical SectionType instructions, anti-fabrication rules, and normalizes raw LLM aliases, missing IDs, education dates, and invalid emails', async () => {
    process.env.LLAMA_API_URL = 'https://llm.example.test/v1/chat/completions';
    process.env.LLAMA_API_KEY = 'test-key';

    const rawLlmPayload = {
      title: 'Backend Software Engineer',
      summary: 'Backend engineer experienced in distributed Node.js systems.',
      content: {
        basics: {
          name: '',
          email: 'not-an-email',
          label: 'Backend Software Engineer'
        },
        sections: [
          {
            type: 'work',
            title: 'Experience',
            content: [
              {
                company: 'Acme Corp',
                position: 'Senior Backend Engineer',
                startDate: '2022-01',
                endDate: '2024-06',
                description: 'Built resilient APIs.'
              },
              {
                company: 'Globex',
                position: 'Backend Engineer',
                startDate: '2020-06',
                endDate: '2021-12',
                description: 'Implemented event pipelines.'
              }
            ]
          },
          {
            id: '',
            type: 'education',
            title: 'Education',
            content: [
              {
                id: '',
                institution: 'MIT',
                degree: 'B.S.',
                field: 'Computer Science',
                startDate: '2018-09',
                endDate: 'May 2022'
              }
            ]
          },
          {
            type: 'skills',
            title: 'Technical Skills',
            content: ['TypeScript', { name: 'Node.js', level: 'Expert' }]
          },
          {
            type: 'certifications',
            title: 'Certifications',
            content: [{ title: 'AWS Certified Developer', issuer: 'AWS' }]
          },
          {
            type: 'patents',
            title: 'Patents',
            content: [
              {
                name: 'Distributed Consensus Protocol',
                description: 'US Patent Pending'
              }
            ]
          }
        ]
      }
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(rawLlmPayload)
            }
          }
        ]
      })
    });
    global.fetch = fetchMock as any;

    const draftDoc: any = {
      _id: 'resume123',
      userId: 'user123',
      title: 'AI Draft',
      summary: '',
      content: {
        basics: {
          name: 'Grace Hopper',
          email: 'grace@example.com',
          phone: '555-0100'
        },
        sections: [],
        sectionOrder: []
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };
    (Resume.findOne as jest.Mock).mockResolvedValue(draftDoc);

    await generateResumeFromPrompt(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0][1];
    const parsedRequestBody = JSON.parse(requestInit.body);
    const systemPrompt: string = parsedRequestBody.messages[0].content;
    expect(systemPrompt).toContain('Never fabricate');
    expect(systemPrompt).toContain('WorkItem');
    expect(systemPrompt).toContain('EducationItem');
    expect(systemPrompt).toContain('CustomItem');
    expect(systemPrompt).toContain('sectionOrder');
    expect(systemPrompt).toContain('"month"');

    // Draft contact info is retained when AI omits name or returns invalid email
    expect(draftDoc.content.basics.name).toBe('Grace Hopper');
    expect(draftDoc.content.basics.email).toBe('grace@example.com');
    expect(draftDoc.content.basics.phone).toBe('555-0100');
    expect(draftDoc.content.basics.summary).toBe(
      'Backend engineer experienced in distributed Node.js systems.'
    );

    const sections = draftDoc.content.sections;
    expect(sections).toHaveLength(5);
    expect(sections.map((s: any) => s.type)).toEqual([
      SectionType.WORK,
      SectionType.EDUCATION,
      SectionType.SKILLS,
      SectionType.CERTIFICATES,
      SectionType.CUSTOM
    ]);
    expect(sections[4].isCustom).toBe(true);
    expect(sections[4].content[0].title).toBe('Distributed Consensus Protocol');

    // Every section and item has a unique non-empty ID and sectionOrder matches sections
    const sectionIds = sections.map((s: any) => s.id);
    expect(sectionIds.every((id: string) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(draftDoc.content.sectionOrder).toEqual(sectionIds);

    const allItemIds = sections.flatMap((s: any) => s.content.map((item: any) => item.id));
    expect(allItemIds.every((id: string) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
    expect(new Set(allItemIds).size).toBe(allItemIds.length);

    // Work items preserve distinct entries and normalize company/name
    expect(sections[0].content[0]).toMatchObject({
      company: 'Acme Corp',
      name: 'Acme Corp',
      position: 'Senior Backend Engineer'
    });
    expect(sections[0].content[1]).toMatchObject({
      company: 'Globex',
      name: 'Globex',
      position: 'Backend Engineer'
    });

    // Education dates convert into structured { month, year } objects
    expect(sections[1].content[0].startDate).toEqual({
      month: 'Sep',
      year: '2018'
    });
    expect(sections[1].content[0].endDate).toEqual({
      month: 'May',
      year: '2022'
    });

    // String skill entries convert into SkillItem objects
    expect(sections[2].content[0]).toMatchObject({ name: 'TypeScript' });
    expect(sections[2].content[1]).toMatchObject({ name: 'Node.js', level: 'Expert' });

    // Subsequent PUT /api/resumes/:id auto-save payload passes express-validator rules
    const validation = await runAutoSaveValidation({
      title: draftDoc.title,
      content: draftDoc.content
    });
    expect(validation.isEmpty()).toBe(true);
    expect(draftDoc.markModified).toHaveBeenCalledWith('content');
    expect(draftDoc.save).toHaveBeenCalledTimes(1);
  });

  it('retains draft name and valid email in offline placeholder mode when LLAMA_API_URL is unset', async () => {
    delete process.env.LLAMA_API_URL;

    const draftDoc: any = {
      _id: 'resume123',
      userId: 'user123',
      title: 'AI Draft',
      summary: '',
      content: {
        basics: {
          name: 'Ada Lovelace',
          email: 'ada@analytical.org'
        },
        sections: [],
        sectionOrder: []
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };
    (Resume.findOne as jest.Mock).mockResolvedValue(draftDoc);

    await generateResumeFromPrompt(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(draftDoc.content.basics.name).toBe('Ada Lovelace');
    expect(draftDoc.content.basics.email).toBe('ada@analytical.org');
    expect(draftDoc.summary).toContain('[AI placeholder]');
    expect(draftDoc.content.basics.summary).toContain('[AI placeholder]');

    const validation = await runAutoSaveValidation({
      title: draftDoc.title,
      content: draftDoc.content
    });
    expect(validation.isEmpty()).toBe(true);
  });

  it('falls back to valid defaults when both AI output and draft resume have invalid email', async () => {
    jest.spyOn(aiService, 'analyzeResumePrompt').mockResolvedValueOnce({
      title: 'Cloud Architect',
      summary: 'Designed hybrid cloud infrastructure.',
      content: {
        basics: {
          name: '',
          email: ''
        },
        sections: [],
        sectionOrder: []
      }
    });

    const draftDoc: any = {
      _id: 'resume123',
      userId: 'user123',
      title: '',
      summary: '',
      content: {
        basics: {
          name: '',
          email: 'invalid-draft-email'
        },
        sections: [],
        sectionOrder: []
      },
      save: jest.fn().mockResolvedValue(true)
    };
    (Resume.findOne as jest.Mock).mockResolvedValue(draftDoc);

    await generateResumeFromPrompt(mockReq, mockRes, mockNext);

    expect(draftDoc.content.basics.name).toBe('Your Name');
    expect(draftDoc.content.basics.email).toBe('you@example.com');

    const validation = await runAutoSaveValidation({
      title: draftDoc.title,
      content: draftDoc.content
    });
    expect(validation.isEmpty()).toBe(true);
  });
});


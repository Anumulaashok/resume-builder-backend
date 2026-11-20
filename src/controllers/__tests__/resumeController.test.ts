import mongoose from 'mongoose';
import { createResume, updateResume, undoResume } from '../resumeController';
import { Resume } from '../../models/Resume';

jest.mock('../../models/Resume');
const { Resume: ActualResume } = jest.requireActual('../../models/Resume');

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

  describe('Mongoose schema & controller persistence for links, location.region, and section.enabled', () => {
    it('retains contact links, profiles, location.region, and section.enabled on createResume', async () => {
      const validUserId = new mongoose.Types.ObjectId().toString();
      mockReq.user = { _id: validUserId };
      mockReq.body = {
        title: 'Full Stack Engineer',
        content: {
          basics: {
            name: 'Anumula Ashok',
            label: 'Staff Engineer',
            email: 'ashok@example.com',
            phone: '+1-555-0199',
            url: 'https://ashok.dev',
            website: 'https://www.ashok.dev',
            portfolioUrl: 'https://portfolio.ashok.dev',
            linkedin: 'https://linkedin.com/in/anumulaashok',
            github: 'https://github.com/anumulaashok',
            image: 'https://ashok.dev/avatar.png',
            location: {
              address: '100 Market St',
              city: 'San Francisco',
              region: 'CA',
              countryCode: 'US',
              postalCode: '94105',
            },
            profiles: [
              { network: 'LinkedIn', username: 'anumulaashok', url: 'https://linkedin.com/in/anumulaashok' },
              { network: 'GitHub', username: 'anumulaashok', url: 'https://github.com/anumulaashok' },
            ],
          },
          sections: [
            {
              id: 'sec-work',
              type: 'WorkItem',
              title: 'Experience',
              content: [{ id: 'w1', company: 'Acme', highlights: ['Built APIs'] }],
            },
            {
              id: 'sec-awards',
              type: 'AwardItem',
              title: 'Awards',
              enabled: false,
              isCustom: false,
              content: [],
            },
          ],
          sectionOrder: ['sec-work', 'sec-awards'],
        },
      };

      (Resume.create as jest.Mock).mockImplementation(async (payload: any) => {
        const doc = new ActualResume(payload);
        const validationError = doc.validateSync();
        if (validationError) throw validationError;
        return doc;
      });

      await createResume(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      const savedDoc = mockRes.json.mock.calls[0][0].data.toObject();
      expect(savedDoc.content.basics).toMatchObject({
        name: 'Anumula Ashok',
        email: 'ashok@example.com',
        url: 'https://ashok.dev',
        website: 'https://www.ashok.dev',
        portfolioUrl: 'https://portfolio.ashok.dev',
        linkedin: 'https://linkedin.com/in/anumulaashok',
        github: 'https://github.com/anumulaashok',
        image: 'https://ashok.dev/avatar.png',
        location: {
          address: '100 Market St',
          city: 'San Francisco',
          region: 'CA',
          countryCode: 'US',
          postalCode: '94105',
        },
        profiles: [
          { network: 'LinkedIn', username: 'anumulaashok', url: 'https://linkedin.com/in/anumulaashok' },
          { network: 'GitHub', username: 'anumulaashok', url: 'https://github.com/anumulaashok' },
        ],
      });
      expect(savedDoc.content.sections[0].enabled).toBe(true);
      expect(savedDoc.content.sections[1].enabled).toBe(false);
    });

    it('retains updated contact links, location.region, and section.enabled on updateResume', async () => {
      const validUserId = new mongoose.Types.ObjectId().toString();
      mockReq.user = { _id: validUserId };

      const realDoc = new ActualResume({
        userId: validUserId,
        title: 'Initial Resume',
        content: {
          basics: {
            name: 'Alice',
            email: 'alice@example.com',
          },
          sections: [
            {
              id: 'sec-proj',
              type: 'ProjectItem',
              title: 'Projects',
              enabled: true,
              content: [],
            },
          ],
          sectionOrder: ['sec-proj'],
        },
      });
      jest.spyOn(realDoc, 'save').mockImplementation(async function (this: any) {
        const validationError = this.validateSync();
        if (validationError) throw validationError;
        return this;
      });

      (Resume.findOne as jest.Mock).mockResolvedValue(realDoc);

      mockReq.body = {
        content: {
          basics: {
            name: 'Alice',
            email: 'alice@example.com',
            url: 'https://alice.dev',
            linkedin: 'https://linkedin.com/in/alice',
            github: 'https://github.com/alice',
            location: {
              city: 'Seattle',
              region: 'WA',
            },
            profiles: [{ network: 'GitHub', url: 'https://github.com/alice' }],
          },
          sections: [
            {
              id: 'sec-proj',
              type: 'ProjectItem',
              title: 'Projects',
              enabled: false,
              content: [],
            },
          ],
          sectionOrder: ['sec-proj'],
        },
      };

      await updateResume(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const updated = realDoc.toObject();
      expect(updated.content.basics.url).toBe('https://alice.dev');
      expect(updated.content.basics.linkedin).toBe('https://linkedin.com/in/alice');
      expect(updated.content.basics.github).toBe('https://github.com/alice');
      expect(updated.content.basics.location?.city).toBe('Seattle');
      expect(updated.content.basics.location?.region).toBe('WA');
      expect(updated.content.basics.profiles).toEqual([
        { network: 'GitHub', url: 'https://github.com/alice' },
      ]);
      expect(updated.content.sections[0].enabled).toBe(false);
    });
  });
});

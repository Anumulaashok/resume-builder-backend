import { updateResume, undoResume } from '../resumeController';
import { Resume } from '../../models/Resume';

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

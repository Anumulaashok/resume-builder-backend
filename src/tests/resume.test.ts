import request from 'supertest';
import app from '../app'; // Assuming app is exported from app.ts
import mongoose from 'mongoose';
import User from '../models/User'; // Adjust path as needed
import Resume from '../models/Resume'; // Adjust path as needed
import * as aiService from '../services/aiService'; // Import the service to mock

// Mock the AI Service
// We mock the specific function used by the controller
jest.mock('../services/aiService', () => ({
  analyzeResumePrompt: jest.fn(),
}));

// Use the main app instance for testing
const agent = request.agent(app);

let testUser: any;
let authToken: string;
let testResume: any;

describe('Resume API: /api/resumes', () => {

  // Setup: Register and login a user before running resume tests
  beforeAll(async () => {
    await User.deleteMany({});
    await Resume.deleteMany({});

    // Register
    await agent
      .post('/api/users/register')
      .send({
        name: 'Resume Test User',
        email: 'resume@example.com',
        password: 'password123',
      });

    // Login to get token
    const loginRes = await agent
      .post('/api/users/login')
      .send({
        email: 'resume@example.com',
        password: 'password123',
      });

    authToken = loginRes.body.token;
    testUser = loginRes.body.user; // Store user details if needed
  });

  // Cleanup after all tests in this suite
  afterAll(async () => {
      await User.deleteMany({});
      await Resume.deleteMany({});
  });

  // Clear resumes before each test within this suite
   beforeEach(async () => {
     await Resume.deleteMany({ userId: testUser.id }); // Clear only this user's resumes
     // Reset mocks before each test if needed
     (aiService.analyzeResumePrompt as jest.Mock).mockClear();
   });

  // --- Test POST / ---
  describe('POST /', () => {
    it('should create a new resume for the authenticated user', async () => {
      const resumeData = {
        personalInfo: { name: 'Test Name', email: 'test@example.com' },
        summary: 'Initial summary',
      };
      const res = await agent
        .post('/api/resumes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(resumeData);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.userId).toEqual(testUser.id);
      expect(res.body.summary).toBe('Initial summary');
      testResume = res.body; // Save for later tests
    });

    it('should return 401 if no token is provided', async () => {
       const resumeData = {
        personalInfo: { name: 'Test Name', email: 'test@example.com' },
        summary: 'Initial summary',
      };
      const res = await agent
        .post('/api/resumes')
        .send(resumeData); // No token
      expect(res.statusCode).toEqual(401);
    });
  });

  // --- Test GET /my ---
  describe('GET /my', () => {
    beforeEach(async () => {
        // Ensure at least one resume exists for the user
        if (!testResume) {
             const resumeData = {
                userId: testUser.id, // Need to assign userId directly here
                personalInfo: { name: 'My Resume', email: 'my@example.com' },
                summary: 'My Summary',
             };
             await new Resume(resumeData).save();
        }
    });

    it('should get all resumes for the authenticated user', async () => {
      const res = await agent
        .get('/api/resumes/my')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Add more specific checks if needed, e.g., expect(res.body.length).toBeGreaterThan(0);
    });

     it('should return 401 if no token is provided', async () => {
       const res = await agent.get('/api/resumes/my'); // No token
       expect(res.statusCode).toEqual(401);
     });
  });

  // --- Test GET /:resumeId ---
  describe('GET /:resumeId', () => {
     beforeEach(async () => {
        // Ensure testResume exists
        if (!testResume) {
             const resumeData = {
                userId: testUser.id,
                personalInfo: { name: 'Get Me', email: 'get@example.com' },
                summary: 'Get Summary',
             };
             testResume = await new Resume(resumeData).save();
        }
     });

    it('should get a specific resume by ID if owned by the user', async () => {
      const res = await agent
        .get(`/api/resumes/${testResume._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body._id).toEqual(testResume._id.toString());
    });

    it('should return 404 if resume ID does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await agent
        .get(`/api/resumes/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toEqual(404);
    });

     it('should return 401 if attempting to get another user\'s resume', async () => {
        // Create a resume for another user
        const otherUserId = new mongoose.Types.ObjectId();
        const otherResume = await new Resume({
             userId: otherUserId,
             personalInfo: { name: 'Other User Resume' },
             summary: 'Secret summary'
        }).save();

        const res = await agent
          .get(`/api/resumes/${otherResume._id}`)
          .set('Authorization', `Bearer ${authToken}`); // Use original user's token

        expect(res.statusCode).toEqual(401); // Unauthorized
     });

     it('should return 401 if no token is provided', async () => {
       const res = await agent.get(`/api/resumes/${testResume._id}`); // No token
       expect(res.statusCode).toEqual(401);
     });
  });

  // --- Test PATCH /:resumeId ---
  describe('PATCH /:resumeId', () => {
     beforeEach(async () => {
        // Ensure testResume exists
        if (!testResume) {
             const resumeData = {
                userId: testUser.id,
                personalInfo: { name: 'Update Me' },
                summary: 'Update Summary',
             };
             testResume = await new Resume(resumeData).save();
        }
     });

    it('should update a specific resume by ID if owned by the user', async () => {
      const updates = { summary: 'Updated Summary Text' };
      const res = await agent
        .patch(`/api/resumes/${testResume._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);

      expect(res.statusCode).toEqual(200);
      expect(res.body.summary).toEqual('Updated Summary Text');
    });

    it('should return 404 if resume ID does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
       const updates = { summary: 'Updated Summary Text' };
      const res = await agent
        .patch(`/api/resumes/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);
      expect(res.statusCode).toEqual(404);
    });

     it('should return 401 if attempting to update another user\'s resume', async () => {
        // Create a resume for another user
        const otherUserId = new mongoose.Types.ObjectId();
        const otherResume = await new Resume({
             userId: otherUserId,
             personalInfo: { name: 'Other User Resume Patch' },
             summary: 'Secret patch summary'
        }).save();
        const updates = { summary: 'Attempted Update' };

        const res = await agent
          .patch(`/api/resumes/${otherResume._id}`)
          .set('Authorization', `Bearer ${authToken}`) // Use original user's token
          .send(updates);

        expect(res.statusCode).toEqual(401); // Unauthorized
     });

     it('should return 401 if no token is provided', async () => {
       const updates = { summary: 'Updated Summary Text' };
       const res = await agent
         .patch(`/api/resumes/${testResume._id}`) // No token
         .send(updates);
       expect(res.statusCode).toEqual(401);
     });
  });


  // --- Test POST /generate ---
  describe('POST /generate', () => {
     beforeEach(async () => {
        // Ensure testResume exists
        if (!testResume) {
             const resumeData = {
                userId: testUser.id,
                personalInfo: { name: 'Generate Me' },
                summary: 'Generate Summary',
             };
             testResume = await new Resume(resumeData).save();
        }
        // Setup mock response for AI service
        (aiService.analyzeResumePrompt as jest.Mock).mockResolvedValue({ generatedSummary: "AI generated summary based on prompt" });
     });

    it('should generate a summary using the AI service and update the resume', async () => {
      const promptData = { prompt: 'Generate a summary for a software engineer' };
      const res = await agent
        .post('/api/resumes/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(promptData);

      expect(res.statusCode).toEqual(200);
      // The controller currently stringifies the response object
      expect(res.body.summary).toEqual(JSON.stringify({ generatedSummary: "AI generated summary based on prompt" }));
      // Verify the mock was called
      expect(aiService.analyzeResumePrompt).toHaveBeenCalledWith(promptData.prompt);
    });

     it('should return 401 if no token is provided', async () => {
       const promptData = { prompt: 'Generate a summary for a software engineer' };
       const res = await agent
         .post('/api/resumes/generate') // No token
         .send(promptData);
       expect(res.statusCode).toEqual(401);
     });

      it('should return 502 if AI service fails', async () => {
        // Setup mock failure for AI service
        (aiService.analyzeResumePrompt as jest.Mock).mockRejectedValue(new Error("AI Service Error: Failed to connect"));

        const promptData = { prompt: 'Generate a summary for a software engineer' };
        const res = await agent
            .post('/api/resumes/generate')
            .set('Authorization', `Bearer ${authToken}`)
            .send(promptData);

        expect(res.statusCode).toEqual(502); // Bad Gateway expected from controller logic
        expect(res.body.message).toContain("AI Service Error");
      });
  });

});

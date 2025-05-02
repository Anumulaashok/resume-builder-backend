import { Request, Response } from 'express'; // Import Request and Response types
import Resume from '../models/Resume'; // Use import syntax
import mongoose from 'mongoose'; // Use import syntax
import * as aiService from '../services/aiService'; // Use import syntax for the service

// @desc    Create a new resume
// @route   POST /api/resumes
// @access  Private (Needs Auth Middleware)
export const createResume = async (req: Request, res: Response) => {
  const userId = req.user?._id; // Get userId from authenticated user
  const { personalInfo, summary } = req.body;

  // Basic validation
  if (!personalInfo || !summary) { // Removed userId check from body
    return res.status(400).json({ message: 'Missing required fields (personalInfo, summary)' });
  }
  if (!userId) { // Check if userId is available from token/middleware
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  // No need to validate userId format here

  try {
    const newResume = new Resume({
      userId: userId, // Use userId from authenticated user
      personalInfo,
      summary,
      // Add other fields as they are implemented
    });

    const savedResume = await newResume.save();
    res.status(201).json(savedResume);

  } catch (error) {
    console.error('Create resume error:', error.message);
    res.status(500).send('Server error during resume creation');
  }
};

// @desc    Get all resumes for the logged-in user
// @route   GET /api/resumes/my
// @access  Private (Needs Auth Middleware)
export const getMyResumes = async (req: Request, res: Response) => {
  const userId = req.user?._id;

  if (!userId) {
    // Should not happen if protect middleware is used correctly
    return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  try {
    const resumes = await Resume.find({ userId: userId });
    res.json(resumes);
  } catch (error: any) {
    console.error('Get my resumes error:', error.message);
    res.status(500).send('Server error while fetching resumes');
  }
};


// @desc    Get a single resume by its ID
// @route   GET /api/resumes/:resumeId
// @access  Private (Needs Auth Middleware)
export const getResumeById = async (req: Request, res: Response) => {
  const { resumeId } = req.params;
  const userId = req.user?._id; // Get userId from authenticated user

  // Validate resumeId format
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    return res.status(400).json({ message: 'Invalid Resume ID format' });
  }

  try {
    const resume = await Resume.findById(resumeId);

    if (!resume) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Check ownership
    if (resume.userId.toString() !== userId?.toString()) {
      return res.status(401).json({ message: 'Not authorized to access this resume' });
    }

    res.json(resume);

  } catch (error: any) { // Add type annotation for error
    console.error('Get resume by ID error:', error.message);
    // Handle potential CastError if ID format is valid but doesn't fit ObjectId internal structure
    if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Resume not found (invalid ID structure)' });
    }
    res.status(500).send('Server error while fetching resume');
  }
};

// @desc    Generate resume summary from prompt using AI
// @route   POST /api/resumes/generate
// @access  Private (Needs Auth Middleware)
export const generateResumeFromPrompt = async (req: Request, res: Response) => {
  const userId = req.user?._id; // Get userId from authenticated user
  const { prompt } = req.body; // Get only prompt from body

  // Basic validation
  if (!prompt) { // Removed userId check from body
    return res.status(400).json({ message: 'Missing required field (prompt)' });
  }
  if (!userId) { // Check if userId is available from token/middleware
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }
  // No need to validate userId format from body

  try {
    // 1. Call AI Service
    console.log(`Generating summary for user ${userId} with prompt: "${prompt}"`);
    const aiResponse = await aiService.analyzeResumePrompt(prompt);

    // 2. Find the user's resume
    // Ensure the resume belongs to the authenticated user
    const resume = await Resume.findOne({ userId: userId });

    if (!resume) {
      // Corrected error message
      return res.status(404).json({ message: `No resume found for user ${userId}. Create one first via POST /api/resumes.` });
    }
    // Ownership is implicitly checked by finding the resume using userId from token

    // 3. Update the resume summary
    // Storing the raw AI response stringified for now.
    resume.summary = JSON.stringify(aiResponse);
    console.log(`Updating resume ${resume._id} summary with AI response.`);

    // 4. Save the updated resume
    const updatedResume = await resume.save();

    // 5. Return the updated resume
    res.json(updatedResume);

  } catch (error) {
    console.error('Generate resume from prompt error:', error.message);
    if (error.message.includes('AI Service')) {
        res.status(502).json({ message: `AI Service Error: ${error.message}` });
    } else {
        res.status(500).send('Server error during resume generation');
    }
  }
};

// @desc    Update specific fields of a resume
// @route   PATCH /api/resumes/:resumeId
// @access  Private (Needs Auth Middleware)
export const updateResumeField = async (req: Request, res: Response) => {
  const { resumeId } = req.params;
  const updateData = req.body;
  const userId = req.user?._id; // Get userId from authenticated user

  // Validate resumeId format
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    return res.status(400).json({ message: 'Invalid Resume ID format' });
  }

  // Check if update body is empty
  if (!updateData || Object.keys(updateData).length === 0) {
    return res.status(400).json({ message: 'Update data cannot be empty' });
  }

  // Prevent updating userId via this endpoint
  if (updateData.userId) {
      delete updateData.userId;
      // Optionally, return an error if they try to update userId
      // return res.status(400).json({ message: 'Cannot update userId via this endpoint' });
  }


  try {
    const updatedResume = await Resume.findByIdAndUpdate(
      resumeId,
      { $set: updateData }, // Use $set to update only provided fields
      resumeId
    );

    if (!resumeToUpdate) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Check ownership before attempting update
    if (resumeToUpdate.userId.toString() !== userId?.toString()) {
        return res.status(401).json({ message: 'Not authorized to update this resume' });
    }

    // Apply updates using $set (Mongoose handles $set implicitly with save() on existing doc)
    Object.assign(resumeToUpdate, updateData);

    // Save the updated document (runs validators)
    const savedResume = await resumeToUpdate.save();

    res.json(savedResume);

  } catch (error: any) { // Add type annotation for error
    console.error('Update resume field error:', error.message);
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    // Handle CastError if ID format is valid but leads to DB error
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid ID format causing database error' });
    }
    res.status(500).send('Server error during resume update');
  }
};

// Remove module.exports as functions are exported individually

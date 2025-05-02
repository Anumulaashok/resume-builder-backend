import { Request, Response } from 'express';
import Template, { ITemplate } from '../models/Template'; // Import model and interface
import mongoose from 'mongoose';

// @desc    Create a new template
// @route   POST /api/templates
// @access  Private
export const createTemplate = async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { name, description, structure } = req.body;

  // Basic validation
  if (!name || !structure) {
    return res.status(400).json({ message: 'Missing required fields (name, structure)' });
  }
  if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  try {
    const newTemplate: ITemplate = new Template({
      userId,
      name,
      description,
      structure,
    });

    const savedTemplate = await newTemplate.save();
    res.status(201).json(savedTemplate);

  } catch (error: any) {
    console.error('Create template error:', error.message);
    res.status(500).send('Server error during template creation');
  }
};

// @desc    Get all templates for the logged-in user
// @route   GET /api/templates/my
// @access  Private
export const getMyTemplates = async (req: Request, res: Response) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  try {
    const templates = await Template.find({ userId: userId });
    res.json(templates);
  } catch (error: any) {
    console.error('Get my templates error:', error.message);
    res.status(500).send('Server error while fetching templates');
  }
};

// @desc    Get a single template by its ID
// @route   GET /api/templates/:templateId
// @access  Private
export const getTemplateById = async (req: Request, res: Response) => {
  const { templateId } = req.params;
  const userId = req.user?._id;

  // Validate templateId format
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return res.status(400).json({ message: 'Invalid Template ID format' });
  }
  if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  try {
    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Check ownership
    if (template.userId.toString() !== userId.toString()) {
      return res.status(401).json({ message: 'Not authorized to access this template' });
    }

    res.json(template);

  } catch (error: any) {
    console.error('Get template by ID error:', error.message);
    res.status(500).send('Server error while fetching template');
  }
};

// @desc    Update a template
// @route   PATCH /api/templates/:templateId
// @access  Private
export const updateTemplate = async (req: Request, res: Response) => {
  const { templateId } = req.params;
  const updateData = req.body;
  const userId = req.user?._id;

  // Validate templateId format
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return res.status(400).json({ message: 'Invalid Template ID format' });
  }
  if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }
  // Prevent updating userId
  if (updateData.userId) {
      delete updateData.userId;
  }
  // Check if update body is empty after potentially removing userId
  if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Update data cannot be empty' });
  }

  try {
    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Check ownership
    if (template.userId.toString() !== userId.toString()) {
        return res.status(401).json({ message: 'Not authorized to update this template' });
    }

    // Use findByIdAndUpdate for atomic update
    const updatedTemplate = await Template.findByIdAndUpdate(
        templateId,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.json(updatedTemplate);

  } catch (error: any) {
    console.error('Update template error:', error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).send('Server error during template update');
  }
};

// @desc    Delete a template
// @route   DELETE /api/templates/:templateId
// @access  Private
export const deleteTemplate = async (req: Request, res: Response) => {
  const { templateId } = req.params;
  const userId = req.user?._id;

  // Validate templateId format
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return res.status(400).json({ message: 'Invalid Template ID format' });
  }
   if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user ID missing' });
  }

  try {
    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Check ownership
    if (template.userId.toString() !== userId.toString()) {
        return res.status(401).json({ message: 'Not authorized to delete this template' });
    }

    // Perform deletion
    await Template.findByIdAndDelete(templateId);

    res.json({ message: 'Template removed successfully' });

  } catch (error: any) {
    console.error('Delete template error:', error.message);
    res.status(500).send('Server error during template deletion');
  }
};

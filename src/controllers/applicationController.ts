import { Response, NextFunction } from 'express';
import {
  JobApplication,
  ApplicationStatus,
  IApplicationContact
} from '../models/JobApplication';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';

const EDITABLE_APPLICATION_FIELDS = [
  'company',
  'role',
  'location',
  'url',
  'status',
  'order',
  'appliedAt',
  'salary',
  'notes',
  'resumeId',
  'coverLetterId',
  'jobDescription',
  'contacts',
  'nextActionAt',
  'nextActionNote'
] as const;

type EditableField = (typeof EDITABLE_APPLICATION_FIELDS)[number];

const NULLABLE_DATE_FIELDS = new Set<EditableField>(['appliedAt', 'nextActionAt']);
const NULLABLE_ID_FIELDS = new Set<EditableField>(['resumeId', 'coverLetterId']);

function sanitizeContacts(raw: unknown): IApplicationContact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const contact = (item || {}) as Record<string, unknown>;
    return {
      name: typeof contact.name === 'string' ? contact.name.trim() : '',
      email: typeof contact.email === 'string' ? contact.email.trim() : '',
      role: typeof contact.role === 'string' ? contact.role.trim() : ''
    };
  });
}

/**
 * Strictly pick editable fields from request body so userId, _id, timestamps,
 * or internal properties can never be injected or overwritten by the client.
 */
export function pickEditableApplicationFields(
  body: Record<string, unknown> = {}
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const field of EDITABLE_APPLICATION_FIELDS) {
    if (body[field] === undefined) {
      continue;
    }

    const val = body[field];

    if (NULLABLE_DATE_FIELDS.has(field)) {
      sanitized[field] = val === null || val === '' ? null : new Date(String(val));
      continue;
    }

    if (NULLABLE_ID_FIELDS.has(field)) {
      sanitized[field] = val === null || val === '' ? null : val;
      continue;
    }

    if (field === 'contacts') {
      sanitized.contacts = sanitizeContacts(val);
      continue;
    }

    if (field === 'order') {
      sanitized.order = Number(val);
      continue;
    }

    if (typeof val === 'string' && field !== 'notes' && field !== 'jobDescription') {
      sanitized[field] = val.trim();
      continue;
    }

    sanitized[field] = val === null ? '' : val;
  }

  return sanitized;
}

// @desc    List job applications for authenticated user
// @route   GET /api/applications
// @access  Private
export const getApplications = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const filter: { userId: unknown; status?: ApplicationStatus } = {
      userId: req.user._id
    };

    if (typeof req.query.status === 'string' && req.query.status) {
      filter.status = req.query.status as ApplicationStatus;
    }

    const applications = await JobApplication.find(filter).sort({
      status: 1,
      order: 1,
      updatedAt: -1
    });

    res.json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single job application by ID
// @route   GET /api/applications/:id
// @access  Private
export const getApplicationById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const application = await JobApplication.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!application) {
      throw new AppError('Job application not found', 404);
    }

    res.json({
      success: true,
      data: application
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new job application
// @route   POST /api/applications
// @access  Private
export const createApplication = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const editable = pickEditableApplicationFields(req.body || {});
    const status = (editable.status as ApplicationStatus | undefined) || 'wishlist';
    const order = typeof editable.order === 'number' ? editable.order : 0;

    if (status === 'applied' && req.body?.appliedAt === undefined) {
      editable.appliedAt = new Date();
    }

    const application = await JobApplication.create({
      ...editable,
      status,
      order,
      userId: req.user._id
    });

    res.status(201).json({
      success: true,
      data: application
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a job application
// @route   PATCH / PUT /api/applications/:id
// @access  Private
export const updateApplication = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const application = await JobApplication.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!application) {
      throw new AppError('Job application not found', 404);
    }

    const editable = pickEditableApplicationFields(req.body || {});
    Object.assign(application, editable);

    const savedApplication = await application.save();

    res.json({
      success: true,
      data: savedApplication
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a job application
// @route   DELETE /api/applications/:id
// @access  Private
export const deleteApplication = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const application = await JobApplication.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!application) {
      throw new AppError('Job application not found', 404);
    }

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

interface ReorderMoveInput {
  id: string;
  status: ApplicationStatus;
  order: number;
}

// @desc    Batch reorder / move job applications across or within columns in one request
// @route   PATCH /api/applications/reorder
// @access  Private
export const reorderApplications = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const rawMoves = Array.isArray(req.body?.moves)
      ? (req.body.moves as ReorderMoveInput[])
      : [];

    const normalizedMoves = rawMoves.map((move) => ({
      id: String(move.id).trim(),
      status: move.status,
      order: Number(move.order)
    }));

    const uniqueIds = new Set(normalizedMoves.map((m) => m.id));

    const operations = normalizedMoves.map((move) => ({
      updateOne: {
        filter: {
          _id: move.id,
          userId: req.user!._id
        },
        update: {
          $set: {
            status: move.status,
            order: move.order
          }
        }
      }
    }));

    const bulkResult = await JobApplication.bulkWrite(operations);

    if (
      bulkResult &&
      typeof bulkResult.matchedCount === 'number' &&
      bulkResult.matchedCount < uniqueIds.size
    ) {
      throw new AppError('One or more job applications were not found', 404);
    }

    res.json({
      success: true,
      data: {
        updatedCount: bulkResult?.matchedCount ?? normalizedMoves.length,
        moves: normalizedMoves
      }
    });
  } catch (error) {
    next(error);
  }
};

import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  JobApplication,
  ApplicationStatus,
  IApplicationContact,
  IStageHistoryEntry
} from '../models/JobApplication';
import { Resume } from '../models/Resume';
import { AppError } from '../utils/appError';
import { AuthenticatedRequest } from '../types/express';
import { captureServerEvent } from '../services/telemetryService';

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

export function isInterviewMilestoneStatus(status: unknown): boolean {
  return status === 'interview' || status === 'offer';
}

export function hasReachedInterviewStage(app: {
  status?: unknown;
  reachedInterviewAt?: Date | string | null;
  stageHistory?: Array<{ status?: unknown }>;
}): boolean {
  if (app.reachedInterviewAt) {
    return true;
  }
  if (isInterviewMilestoneStatus(app.status)) {
    return true;
  }
  if (
    Array.isArray(app.stageHistory) &&
    app.stageHistory.some((entry) => isInterviewMilestoneStatus(entry?.status))
  ) {
    return true;
  }
  return false;
}

function canRunModelQuery(model: unknown, method: string): boolean {
  const fn = (model as Record<string, unknown>)?.[method] as
    | { _isMockFunction?: boolean }
    | undefined;
  return mongoose.connection.readyState === 1 || Boolean(fn?._isMockFunction);
}

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

    const now = new Date();
    const editable = pickEditableApplicationFields(req.body || {});
    const status = (editable.status as ApplicationStatus | undefined) || 'wishlist';
    const order = typeof editable.order === 'number' ? editable.order : 0;

    if (status !== 'wishlist' && req.body?.appliedAt === undefined) {
      editable.appliedAt = now;
    }

    const reachedInterviewAt = isInterviewMilestoneStatus(status) ? now : null;
    const stageHistory: IStageHistoryEntry[] = [{ status, changedAt: now }];

    const application = await JobApplication.create({
      ...editable,
      status,
      order,
      reachedInterviewAt,
      stageHistory,
      userId: req.user._id
    });

    captureServerEvent(req.user._id, 'application_stage_changed', {
      application_id: application._id ? String(application._id) : undefined,
      from_status: null,
      to_status: status,
      has_linked_resume: Boolean(application.resumeId),
      resume_id: application.resumeId ? String(application.resumeId) : null,
      reached_interview: hasReachedInterviewStage(application),
      trigger: 'create'
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

    const previousStatus = application.status;
    const now = new Date();
    const editable = pickEditableApplicationFields(req.body || {});
    const nextStatus = (editable.status as ApplicationStatus | undefined) ?? previousStatus;

    if (
      nextStatus !== 'wishlist' &&
      !application.appliedAt &&
      req.body?.appliedAt === undefined
    ) {
      editable.appliedAt = now;
    }

    Object.assign(application, editable);

    if (isInterviewMilestoneStatus(nextStatus) && !application.reachedInterviewAt) {
      application.reachedInterviewAt = now;
    }

    if (nextStatus !== previousStatus) {
      const existingHistory = Array.isArray(application.stageHistory)
        ? [...application.stageHistory]
        : previousStatus
        ? [{ status: previousStatus, changedAt: application.createdAt || now }]
        : [];
      existingHistory.push({ status: nextStatus, changedAt: now });
      application.stageHistory = existingHistory;
      if (typeof (application as { markModified?: (path: string) => void }).markModified === 'function') {
        application.markModified('stageHistory');
      }
    }

    const savedApplication = await application.save();

    if (nextStatus !== previousStatus) {
      captureServerEvent(req.user._id, 'application_stage_changed', {
        application_id: savedApplication._id
          ? String(savedApplication._id)
          : String(req.params.id),
        from_status: previousStatus,
        to_status: nextStatus,
        has_linked_resume: Boolean(savedApplication.resumeId),
        resume_id: savedApplication.resumeId
          ? String(savedApplication.resumeId)
          : null,
        reached_interview: hasReachedInterviewStage(savedApplication),
        trigger: 'update'
      });
    }

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

async function resolveApplicationFindQuery(queryOrResult: unknown): Promise<any[]> {
  if (!queryOrResult) return [];
  if (Array.isArray(queryOrResult)) return queryOrResult;
  if (
    typeof (queryOrResult as { then?: unknown }).then !== 'function' &&
    typeof (queryOrResult as { sort?: () => unknown }).sort === 'function'
  ) {
    const sorted = await (queryOrResult as { sort: (arg: unknown) => Promise<any[]> }).sort({
      status: 1,
      order: 1,
      updatedAt: -1
    });
    return Array.isArray(sorted) ? sorted : [];
  }
  const awaited = await (queryOrResult as Promise<any[]>);
  return Array.isArray(awaited) ? awaited : [];
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

    const uniqueIdList = Array.from(new Set(normalizedMoves.map((m) => m.id)));
    const uniqueIds = new Set(uniqueIdList);
    const now = new Date();

    const canQueryExisting = canRunModelQuery(JobApplication, 'find');
    let existingMap: Map<string, any> | null = null;

    if (canQueryExisting) {
      const existingDocs = await resolveApplicationFindQuery(
        JobApplication.find({
          _id: { $in: uniqueIdList },
          userId: req.user._id
        })
      );
      existingMap = new Map(
        existingDocs.map((doc) => [String(doc._id), doc])
      );
    }

    const stageTransitions: Array<{
      id: string;
      fromStatus: ApplicationStatus;
      toStatus: ApplicationStatus;
      resumeId: string | null;
      reachedInterview: boolean;
    }> = [];

    const operations = normalizedMoves.map((move) => {
      const existing = existingMap ? existingMap.get(move.id) : undefined;
      const setFields: Record<string, unknown> = {
        status: move.status,
        order: move.order
      };
      const updateDoc: Record<string, unknown> = {
        $set: setFields
      };

      if (existing) {
        if (move.status !== 'wishlist' && !existing.appliedAt) {
          setFields.appliedAt = now;
        }
        if (
          isInterviewMilestoneStatus(move.status) &&
          !existing.reachedInterviewAt
        ) {
          setFields.reachedInterviewAt = now;
        }
        if (existing.status !== move.status) {
          updateDoc.$push = {
            stageHistory: {
              status: move.status,
              changedAt: now
            }
          };
          stageTransitions.push({
            id: move.id,
            fromStatus: existing.status,
            toStatus: move.status,
            resumeId: existing.resumeId ? String(existing.resumeId) : null,
            reachedInterview:
              hasReachedInterviewStage(existing) ||
              isInterviewMilestoneStatus(move.status)
          });
        }
      }

      return {
        updateOne: {
          filter: {
            _id: move.id,
            userId: req.user!._id
          },
          update: updateDoc
        }
      };
    });

    const bulkResult = await JobApplication.bulkWrite(operations);

    if (
      bulkResult &&
      typeof bulkResult.matchedCount === 'number' &&
      bulkResult.matchedCount < uniqueIds.size
    ) {
      throw new AppError('One or more job applications were not found', 404);
    }

    for (const transition of stageTransitions) {
      captureServerEvent(req.user._id, 'application_stage_changed', {
        application_id: transition.id,
        from_status: transition.fromStatus,
        to_status: transition.toStatus,
        has_linked_resume: Boolean(transition.resumeId),
        resume_id: transition.resumeId,
        reached_interview: transition.reachedInterview,
        trigger: 'reorder'
      });
    }

    let updatedApplications: any[] | undefined;
    if (canQueryExisting) {
      updatedApplications = await resolveApplicationFindQuery(
        JobApplication.find({
          _id: { $in: uniqueIdList },
          userId: req.user._id
        })
      );
    }

    res.json({
      success: true,
      data: {
        updatedCount: bulkResult?.matchedCount ?? normalizedMoves.length,
        moves: normalizedMoves,
        ...(updatedApplications ? { applications: updatedApplications } : {})
      }
    });
  } catch (error) {
    next(error);
  }
};

export interface AttributionBucketMetrics {
  totalApplications: number;
  submittedCount: number;
  interviewCount: number;
  offerCount: number;
  interviewRate: number;
}

export interface ResumeAttributionEntry extends AttributionBucketMetrics {
  resumeId: string;
  title: string;
  templateId: string;
}

export interface TemplateAttributionEntry extends AttributionBucketMetrics {
  templateId: string;
  resumeCount: number;
}

function finalizeBucketMetrics(counts: {
  totalApplications: number;
  submittedCount: number;
  interviewCount: number;
  offerCount: number;
}): AttributionBucketMetrics {
  const interviewRate =
    counts.submittedCount > 0
      ? Math.round((counts.interviewCount / counts.submittedCount) * 100)
      : 0;
  return {
    ...counts,
    interviewRate
  };
}

// @desc    Get conversion attribution summary per linked resume and per templateId
// @route   GET /api/applications/attribution
// @access  Private
export const getApplicationAttribution = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const applications = await resolveApplicationFindQuery(
      JobApplication.find({ userId: req.user._id })
    );

    let resumes: any[] = [];
    if (canRunModelQuery(Resume, 'find')) {
      resumes = await resolveApplicationFindQuery(
        Resume.find({ userId: req.user._id, title: { $ne: 'AI Draft' } })
      );
    }

    const resumeMetaMap = new Map<
      string,
      { resumeId: string; title: string; templateId: string }
    >();
    const resumeCountsMap = new Map<
      string,
      {
        totalApplications: number;
        submittedCount: number;
        interviewCount: number;
        offerCount: number;
      }
    >();
    const templateCountsMap = new Map<
      string,
      {
        resumeIds: Set<string>;
        totalApplications: number;
        submittedCount: number;
        interviewCount: number;
        offerCount: number;
      }
    >();

    for (const resume of resumes) {
      const rId = String(resume._id);
      const templateId =
        typeof resume.templateId === 'string' && resume.templateId.trim()
          ? resume.templateId.trim()
          : 'modern';
      resumeMetaMap.set(rId, {
        resumeId: rId,
        title: typeof resume.title === 'string' && resume.title.trim()
          ? resume.title.trim()
          : 'Untitled Resume',
        templateId
      });
      resumeCountsMap.set(rId, {
        totalApplications: 0,
        submittedCount: 0,
        interviewCount: 0,
        offerCount: 0
      });
      if (!templateCountsMap.has(templateId)) {
        templateCountsMap.set(templateId, {
          resumeIds: new Set<string>(),
          totalApplications: 0,
          submittedCount: 0,
          interviewCount: 0,
          offerCount: 0
        });
      }
      templateCountsMap.get(templateId)!.resumeIds.add(rId);
    }

    const totalsCounter = {
      totalApplications: 0,
      submittedCount: 0,
      interviewCount: 0,
      offerCount: 0
    };
    const unlinkedCounter = {
      totalApplications: 0,
      submittedCount: 0,
      interviewCount: 0,
      offerCount: 0
    };

    for (const app of applications) {
      const isSubmitted = app.status !== 'wishlist';
      const reachedInterview = isSubmitted && hasReachedInterviewStage(app);
      const isOffer = app.status === 'offer';

      totalsCounter.totalApplications += 1;
      if (isSubmitted) totalsCounter.submittedCount += 1;
      if (reachedInterview) totalsCounter.interviewCount += 1;
      if (isOffer) totalsCounter.offerCount += 1;

      const linkedId = app.resumeId ? String(app.resumeId) : '';
      if (!linkedId) {
        unlinkedCounter.totalApplications += 1;
        if (isSubmitted) unlinkedCounter.submittedCount += 1;
        if (reachedInterview) unlinkedCounter.interviewCount += 1;
        if (isOffer) unlinkedCounter.offerCount += 1;
        continue;
      }

      if (!resumeMetaMap.has(linkedId)) {
        resumeMetaMap.set(linkedId, {
          resumeId: linkedId,
          title: 'Deleted Resume',
          templateId: 'unknown'
        });
      }
      if (!resumeCountsMap.has(linkedId)) {
        resumeCountsMap.set(linkedId, {
          totalApplications: 0,
          submittedCount: 0,
          interviewCount: 0,
          offerCount: 0
        });
      }

      const rCounts = resumeCountsMap.get(linkedId)!;
      rCounts.totalApplications += 1;
      if (isSubmitted) rCounts.submittedCount += 1;
      if (reachedInterview) rCounts.interviewCount += 1;
      if (isOffer) rCounts.offerCount += 1;

      const meta = resumeMetaMap.get(linkedId)!;
      if (!templateCountsMap.has(meta.templateId)) {
        templateCountsMap.set(meta.templateId, {
          resumeIds: new Set<string>([linkedId]),
          totalApplications: 0,
          submittedCount: 0,
          interviewCount: 0,
          offerCount: 0
        });
      }
      const tCounts = templateCountsMap.get(meta.templateId)!;
      tCounts.resumeIds.add(linkedId);
      tCounts.totalApplications += 1;
      if (isSubmitted) tCounts.submittedCount += 1;
      if (reachedInterview) tCounts.interviewCount += 1;
      if (isOffer) tCounts.offerCount += 1;
    }

    const byResume: ResumeAttributionEntry[] = Array.from(
      resumeMetaMap.values()
    )
      .map((meta) => ({
        ...meta,
        ...finalizeBucketMetrics(resumeCountsMap.get(meta.resumeId)!)
      }))
      .sort(
        (a, b) =>
          b.submittedCount - a.submittedCount ||
          b.interviewRate - a.interviewRate ||
          a.title.localeCompare(b.title)
      );

    const byTemplate: TemplateAttributionEntry[] = Array.from(
      templateCountsMap.entries()
    )
      .map(([templateId, bucket]) => ({
        templateId,
        resumeCount: bucket.resumeIds.size,
        ...finalizeBucketMetrics({
          totalApplications: bucket.totalApplications,
          submittedCount: bucket.submittedCount,
          interviewCount: bucket.interviewCount,
          offerCount: bucket.offerCount
        })
      }))
      .sort(
        (a, b) =>
          b.submittedCount - a.submittedCount ||
          b.interviewRate - a.interviewRate ||
          a.templateId.localeCompare(b.templateId)
      );

    res.json({
      success: true,
      data: {
        totals: finalizeBucketMetrics(totalsCounter),
        byResume,
        byTemplate,
        unlinked: finalizeBucketMetrics(unlinkedCounter)
      }
    });
  } catch (error) {
    next(error);
  }
};

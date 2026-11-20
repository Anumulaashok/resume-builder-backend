import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  CareerProfile,
  ICareerProfileData,
  SKILL_CATEGORY_KEYS,
  computeCareerProfileCompleteness,
  createEmptyCareerProfileData,
  makeFactId,
  normalizeCareerProfileInput,
} from '../models/CareerProfile';
import { Resume } from '../models/Resume';
import { Portfolio } from '../models/Portfolio';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../types/express';
import { AppError } from '../utils/appError';
import { classifySkillCategory, extractResumeForStaging } from '../services/resumeImportService';
import { buildGroundedResumeFromProfile } from '../services/groundingService';
import * as aiService from '../services/aiService';

const isMockedFn = (fn: unknown): boolean =>
  Boolean(fn && typeof fn === 'function' && ('_isMockFunction' in (fn as any) || 'mock' in (fn as any)));

export const findUserCareerProfileSafely = async (
  userId: unknown
): Promise<(ICareerProfileData & { _id?: unknown; updatedAt?: Date; completeness?: number }) | null> => {
  if (!userId) return null;
  if (mongoose.connection.readyState !== 1 && !isMockedFn(CareerProfile.findOne)) {
    return null;
  }
  const doc = await CareerProfile.findOne({ userId });
  if (!doc) return null;
  return typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : (doc as any);
};

const linkProfileToUserSafely = async (userId: unknown, profileId: unknown): Promise<void> => {
  if (!userId || !profileId) return;
  if (mongoose.connection.readyState !== 1 && !isMockedFn(User.findByIdAndUpdate)) {
    return;
  }
  try {
    await User.findByIdAndUpdate(userId, { careerProfileId: profileId });
  } catch {
    // Non-fatal link update
  }
};

const mergeCareerProfiles = (
  existing: ICareerProfileData,
  incoming: ICareerProfileData
): ICareerProfileData => {
  const personalInfo = {
    id: existing.personalInfo.id || incoming.personalInfo.id || 'info_primary',
    fullName: incoming.personalInfo.fullName || existing.personalInfo.fullName,
    email: incoming.personalInfo.email || existing.personalInfo.email,
    phone: incoming.personalInfo.phone || existing.personalInfo.phone,
    location: incoming.personalInfo.location || existing.personalInfo.location,
    linkedin: incoming.personalInfo.linkedin || existing.personalInfo.linkedin,
    github: incoming.personalInfo.github || existing.personalInfo.github,
    portfolio: incoming.personalInfo.portfolio || existing.personalInfo.portfolio,
    website: incoming.personalInfo.website || existing.personalInfo.website,
    otherLinks: [
      ...(existing.personalInfo.otherLinks || []),
      ...(incoming.personalInfo.otherLinks || []).filter(
        (l) => !(existing.personalInfo.otherLinks || []).some((e) => e.url === l.url)
      ),
    ],
  };

  const summary = {
    id: existing.summary.id || incoming.summary.id || 'sum_primary',
    currentTitle: incoming.summary.currentTitle || existing.summary.currentTitle,
    yearsOfExperience: incoming.summary.yearsOfExperience || existing.summary.yearsOfExperience,
    areasOfExpertise: Array.from(
      new Set([...(existing.summary.areasOfExpertise || []), ...(incoming.summary.areasOfExpertise || [])])
    ),
    industryExperience: Array.from(
      new Set([
        ...(existing.summary.industryExperience || []),
        ...(incoming.summary.industryExperience || []),
      ])
    ),
    text: incoming.summary.text || existing.summary.text,
  };

  const expKey = (e: { company: string; role: string; startDate: string }) =>
    `${e.company.toLowerCase()}|${e.role.toLowerCase()}|${e.startDate.toLowerCase()}`;
  const seenExp = new Set((existing.experience || []).map(expKey));
  const experience = [
    ...(existing.experience || []),
    ...(incoming.experience || []).filter((e) => !seenExp.has(expKey(e))),
  ];

  const seenProj = new Set((existing.projects || []).map((p) => p.name.toLowerCase()));
  const projects = [
    ...(existing.projects || []),
    ...(incoming.projects || []).filter((p) => !seenProj.has(p.name.toLowerCase())),
  ];

  const skills = { ...existing.skills };
  for (const cat of SKILL_CATEGORY_KEYS) {
    const existingList = existing.skills?.[cat] || [];
    const seenSkills = new Set(existingList.map((s) => s.name.toLowerCase()));
    skills[cat] = [
      ...existingList,
      ...(incoming.skills?.[cat] || []).filter((s) => !seenSkills.has(s.name.toLowerCase())),
    ];
  }

  const eduKey = (e: { institution: string; degree: string }) =>
    `${e.institution.toLowerCase()}|${e.degree.toLowerCase()}`;
  const seenEdu = new Set((existing.education || []).map(eduKey));
  const education = [
    ...(existing.education || []),
    ...(incoming.education || []).filter((e) => !seenEdu.has(eduKey(e))),
  ];

  const seenCert = new Set((existing.certifications || []).map((c) => c.name.toLowerCase()));
  const certifications = [
    ...(existing.certifications || []),
    ...(incoming.certifications || []).filter((c) => !seenCert.has(c.name.toLowerCase())),
  ];

  const seenAch = new Set((existing.achievements || []).map((a) => a.title.toLowerCase()));
  const achievements = [
    ...(existing.achievements || []),
    ...(incoming.achievements || []).filter((a) => !seenAch.has(a.title.toLowerCase())),
  ];

  return {
    personalInfo,
    summary,
    experience,
    projects,
    skills,
    education,
    certifications,
    achievements,
  };
};

// @desc    Get current user's Career Profile
// @route   GET /api/career-profile
// @access  Private
export const getCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const doc = await CareerProfile.findOne({ userId: req.user._id });
    if (!doc) {
      const empty = createEmptyCareerProfileData({
        fullName: req.user.name,
        email: req.user.email,
      });
      return res.json({
        success: true,
        data: {
          ...empty,
          completeness: 0,
          exists: false,
        },
      });
    }

    const raw = typeof (doc as any).toObject === 'function' ? doc.toObject() : doc;
    res.json({
      success: true,
      data: {
        ...raw,
        completeness:
          typeof raw.completeness === 'number'
            ? raw.completeness
            : computeCareerProfileCompleteness(raw),
        exists: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or update current user's Career Profile
// @route   PUT /api/career-profile
// @access  Private
export const upsertCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    if (!req.body || typeof req.body !== 'object') {
      throw new AppError('Career Profile data is required', 400);
    }

    const normalized = normalizeCareerProfileInput(req.body as Record<string, unknown>, {
      fullName: req.user.name,
      email: req.user.email,
    });
    const completeness = computeCareerProfileCompleteness(normalized);

    const saved = await CareerProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...normalized,
          completeness,
          userId: req.user._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await linkProfileToUserSafely(req.user._id, (saved as any)?._id);

    const raw = saved && typeof (saved as any).toObject === 'function' ? saved.toObject() : saved;
    res.json({
      success: true,
      data: {
        ...raw,
        completeness,
        exists: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Extract structured career facts from an uploaded PDF, DOCX, or TXT file for staging review
// @route   POST /api/career-profile/import/extract
// @access  Private
export const extractCareerProfileImport = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    if (!req.file || !req.file.buffer) {
      throw new AppError(
        'No resume file uploaded. Please select a PDF (.pdf), Word (.docx), or Plain Text (.txt) file up to 5MB.',
        400
      );
    }

    const result = await extractResumeForStaging(req.file, {
      fullName: req.user.name,
      email: req.user.email,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve staged resume import items and persist them to Career Profile
// @route   POST /api/career-profile/import/approve
// @access  Private
export const approveCareerProfileImport = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawStaged =
      body.stagedProfile && typeof body.stagedProfile === 'object'
        ? (body.stagedProfile as Record<string, unknown>)
        : body;

    if (
      !rawStaged.personalInfo &&
      !rawStaged.summary &&
      !rawStaged.experience &&
      !rawStaged.projects &&
      !rawStaged.skills &&
      !rawStaged.education &&
      !rawStaged.certifications &&
      !rawStaged.achievements
    ) {
      throw new AppError('Approved staged profile data is required.', 400);
    }

    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const incoming = normalizeCareerProfileInput(rawStaged, {
      fullName: req.user.name,
      email: req.user.email,
    });

    let finalProfileData = incoming;
    if (mode === 'merge') {
      const existingDoc = await CareerProfile.findOne({ userId: req.user._id });
      if (existingDoc) {
        const existingObj =
          typeof (existingDoc as any).toObject === 'function'
            ? existingDoc.toObject()
            : (existingDoc as unknown as ICareerProfileData);
        finalProfileData = mergeCareerProfiles(existingObj, incoming);
      }
    }

    const completeness = computeCareerProfileCompleteness(finalProfileData);
    const saved = await CareerProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...finalProfileData,
          completeness,
          userId: req.user._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await linkProfileToUserSafely(req.user._id, (saved as any)?._id);

    const raw = saved && typeof (saved as any).toObject === 'function' ? saved.toObject() : saved;
    res.status(200).json({
      success: true,
      data: {
        ...raw,
        completeness,
        exists: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Seed a new standalone Resume from the user's approved Career Profile (optionally tailored)
// @route   POST /api/career-profile/seed-resume
// @access  Private
export const seedResumeFromCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const profileDoc = await CareerProfile.findOne({ userId: req.user._id });
    if (!profileDoc) {
      throw new AppError(
        'Career Profile not found. Please save or import facts into your Career Profile first.',
        400
      );
    }

    const profileObj: ICareerProfileData =
      typeof (profileDoc as any).toObject === 'function'
        ? profileDoc.toObject()
        : (profileDoc as unknown as ICareerProfileData);

    const { title, targetRole, jobDescription, prompt, templateId } = (req.body || {}) as {
      title?: string;
      targetRole?: string;
      jobDescription?: string;
      prompt?: string;
      templateId?: string;
    };

    let resumePayload;
    if (process.env.LLAMA_API_URL && (prompt || jobDescription || targetRole)) {
      const aiGenerated = await aiService.analyzeResumePrompt(
        prompt || `Tailor resume for ${targetRole || 'target role'}`,
        {
          careerProfile: profileObj,
          targetRole,
          jobDescription,
          fallbackName: req.user.name,
          fallbackEmail: req.user.email,
        }
      );
      const fallbackSeeded = buildGroundedResumeFromProfile(profileObj, {
        title,
        targetRole,
        jobDescription,
        prompt,
        templateId,
        fallbackName: req.user.name,
        fallbackEmail: req.user.email,
      });
      resumePayload = {
        title: title?.trim() || aiGenerated.title || fallbackSeeded.title,
        summary: aiGenerated.summary ?? fallbackSeeded.summary,
        templateId: templateId || 'modern',
        content: (aiGenerated.content as any) || fallbackSeeded.content,
        provenance: aiGenerated.provenance || fallbackSeeded.provenance,
      };
    } else {
      resumePayload = buildGroundedResumeFromProfile(profileObj, {
        title,
        targetRole,
        jobDescription,
        prompt,
        templateId,
        fallbackName: req.user.name,
        fallbackEmail: req.user.email,
      });
    }

    const created = await Resume.create({
      userId: req.user._id,
      title: resumePayload.title,
      summary: resumePayload.summary,
      templateId: resumePayload.templateId,
      content: resumePayload.content,
      provenance: resumePayload.provenance,
    });

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error) {
    next(error);
  }
};

const cleanSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// @desc    Seed a new standalone Portfolio from the user's approved Career Profile
// @route   POST /api/career-profile/seed-portfolio
// @access  Private
export const seedPortfolioFromCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const profileDoc = await CareerProfile.findOne({ userId: req.user._id });
    if (!profileDoc) {
      throw new AppError(
        'Career Profile not found. Please save or import facts into your Career Profile first.',
        400
      );
    }

    const profile: ICareerProfileData =
      typeof (profileDoc as any).toObject === 'function'
        ? profileDoc.toObject()
        : (profileDoc as unknown as ICareerProfileData);

    const requestedTitle =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : `${profile.personalInfo.fullName || req.user.name || 'My'} Portfolio`;

    const baseSlug =
      cleanSlug(req.body?.slug || profile.personalInfo.fullName || requestedTitle) || 'portfolio';
    let slug = baseSlug;
    const existingSlug = await Portfolio.findOne({ slug });
    if (existingSlug) {
      slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const allSkills = SKILL_CATEGORY_KEYS.flatMap((cat) =>
      (profile.skills[cat] || []).map((s) => ({
        id: s.id,
        name: s.name,
        category: cat,
        level: s.level || '',
        source_fact_ids: [s.id],
      }))
    );

    const portfolioProjects = (profile.projects || []).map((proj) => ({
      id: proj.id,
      title: proj.name,
      name: proj.name,
      description: [proj.description, proj.impact].filter(Boolean).join(' '),
      technologies: proj.technologies,
      liveUrl: proj.url || '',
      githubUrl: (proj.links || []).find((l) => /github\.com/i.test(l)) || '',
      source_fact_ids: [proj.id],
    }));

    const portfolioExperience = (profile.experience || []).map((exp) => ({
      id: exp.id,
      company: exp.company,
      role: exp.role,
      position: exp.role,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.current ? 'Present' : exp.endDate,
      description: [...(exp.achievements || []), ...(exp.responsibilities || [])].join('\n'),
      technologies: exp.technologies,
      source_fact_ids: [exp.id],
    }));

    const sections = [
      {
        id: 'about',
        type: 'about',
        title: 'About Me',
        content: profile.summary.text
          ? [{ text: profile.summary.text, source_fact_ids: [profile.summary.id] }]
          : [],
        enabled: true,
      },
      {
        id: 'projects',
        type: 'projects',
        title: 'Featured Projects',
        content: portfolioProjects,
        enabled: true,
      },
      {
        id: 'skills',
        type: 'skills',
        title: 'Skills & Expertise',
        content: allSkills,
        enabled: true,
      },
      {
        id: 'experience',
        type: 'experience',
        title: 'Experience',
        content: portfolioExperience,
        enabled: true,
      },
      {
        id: 'contact',
        type: 'contact',
        title: 'Get In Touch',
        content: [],
        enabled: true,
      },
    ];

    const created = await Portfolio.create({
      userId: req.user._id,
      title: requestedTitle,
      slug,
      isPublished: false,
      themeConfig: { theme: 'modern', primaryColor: '#3B82F6', layout: 'standard' },
      basics: {
        name: profile.personalInfo.fullName || req.user.name || '',
        title: profile.summary.currentTitle || profile.experience[0]?.role || '',
        email: profile.personalInfo.email || req.user.email || '',
        phone: profile.personalInfo.phone || '',
        location: profile.personalInfo.location || '',
        bio: profile.summary.text || '',
        avatarUrl: '',
        socialLinks: {
          github: profile.personalInfo.github || '',
          linkedin: profile.personalInfo.linkedin || '',
          website: profile.personalInfo.portfolio || profile.personalInfo.website || '',
        },
      },
      sections,
      sectionOrder: ['about', 'projects', 'skills', 'experience', 'contact'],
    });

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a user-confirmed skill to Career Profile
// @route   POST /api/career-profile/skills/confirm
// @access  Private
export const confirmSkillInCareerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const skillRaw = typeof req.body?.skill === 'string' ? req.body.skill.trim() : '';
    if (!skillRaw) {
      throw new AppError('Skill name is required.', 400);
    }

    const { category, normalizedName } = classifySkillCategory(skillRaw);
    const existingDoc = await CareerProfile.findOne({ userId: req.user._id });
    const baseData: ICareerProfileData = existingDoc
      ? typeof (existingDoc as any).toObject === 'function'
        ? existingDoc.toObject()
        : (existingDoc as unknown as ICareerProfileData)
      : createEmptyCareerProfileData({ fullName: req.user.name, email: req.user.email });

    const list = baseData.skills[category] || [];
    if (!list.some((s) => s.name.toLowerCase() === normalizedName.toLowerCase())) {
      baseData.skills[category] = [
        ...list,
        { id: makeFactId(`skill_${category}`), name: normalizedName },
      ];
    }

    const completeness = computeCareerProfileCompleteness(baseData);
    const saved = await CareerProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...baseData,
          completeness,
          userId: req.user._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const raw = saved && typeof (saved as any).toObject === 'function' ? saved.toObject() : saved;
    res.status(200).json({
      success: true,
      data: {
        ...raw,
        completeness,
        exists: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

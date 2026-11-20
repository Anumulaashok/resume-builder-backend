import {
  ICareerProfileBasics,
  ICareerProfileCertification,
  ICareerProfileData,
  ICareerProfileEducation,
  ICareerProfileExperience,
  ICareerProfileProject,
  ICareerProfileSkill
} from '../models/CareerProfile';

const VERIFIED_METRIC_TEST_REGEX =
  /(?:\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|sec|seconds|mins?|hours?|days?|k|m|b|tb|gb|mb|rps|qps|users?|clients?|customers?|engineers?|developers?|requests?|services?|pipelines?|repos?|countries|teams?)\b|\$\s*\d+(?:[.,]\d+)?\s*(?:k|m|b)?)/i;

const BULLET_SPLIT_REGEX = /\r?\n/;
const BULLET_LEAD_STRIP = /^\s*(?:[•●◦▪▸►✓✔*–—-]|\d+\.)\s*/;

const makeId = (prefix: string, idx: number): string =>
  `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;

const asCleanString = (val: unknown, maxLen = 5000): string => {
  if (typeof val === 'string') {
    return val.trim().slice(0, maxLen);
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  return '';
};

const formatDateField = (val: unknown): string => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim().slice(0, 100);
  if (typeof val === 'object' && val !== null) {
    const month = asCleanString((val as any).month, 30);
    const year = asCleanString((val as any).year, 10);
    return [month, year].filter(Boolean).join(' ').trim();
  }
  return '';
};

const toStringList = (val: unknown, maxItems = 50, maxLen = 1000): string[] => {
  if (!val) return [];
  const rawList = Array.isArray(val)
    ? val
    : typeof val === 'string'
      ? val.split(BULLET_SPLIT_REGEX)
      : [];

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawList) {
    const cleaned = asCleanString(entry, maxLen).replace(BULLET_LEAD_STRIP, '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
    if (result.length >= maxItems) break;
  }
  return result;
};

/**
 * Extracts only verbatim statements containing concrete metrics from user-approved
 * highlights/descriptions. Never invents or alters numbers.
 */
export const extractVerifiedMetricsFromStatements = (
  highlights: string[],
  description?: string,
  explicitMetrics?: unknown
): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (text: string) => {
    const cleaned = text.replace(BULLET_LEAD_STRIP, '').trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  };

  for (const explicit of toStringList(explicitMetrics, 20, 500)) {
    addCandidate(explicit);
  }

  for (const h of highlights) {
    if (VERIFIED_METRIC_TEST_REGEX.test(h)) {
      addCandidate(h);
    }
  }

  if (description && description.trim()) {
    const lines = description
      .split(/\r?\n|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (VERIFIED_METRIC_TEST_REGEX.test(line)) {
        addCandidate(line);
      }
    }
  }

  return result.slice(0, 20);
};

const normalizeBasics = (rawBasics: any, topSummary?: unknown): ICareerProfileBasics => {
  const b = rawBasics && typeof rawBasics === 'object' ? rawBasics : {};
  const loc = b.location && typeof b.location === 'object' ? b.location : {};
  const rawProfiles = Array.isArray(b.profiles) ? b.profiles : [];

  const profiles = rawProfiles
    .filter((p: any) => p && typeof p === 'object')
    .map((p: any) => ({
      network: asCleanString(p.network, 100),
      username: asCleanString(p.username, 150),
      url: asCleanString(p.url, 1000)
    }))
    .filter((p: any) => p.network || p.username || p.url)
    .slice(0, 20);

  return {
    name: asCleanString(b.name, 200),
    label: asCleanString(b.label || b.title, 200),
    email: asCleanString(b.email, 320),
    phone: asCleanString(b.phone, 100),
    url: asCleanString(b.url || b.website, 1000),
    summary: asCleanString(b.summary || topSummary, 5000),
    location: {
      address: asCleanString(loc.address, 300),
      postalCode: asCleanString(loc.postalCode, 50),
      city: asCleanString(loc.city || (typeof b.location === 'string' ? b.location : ''), 150),
      countryCode: asCleanString(loc.countryCode, 20),
      region: asCleanString(loc.region, 150)
    },
    profiles
  };
};

const normalizeExperienceItem = (item: any, idx: number): ICareerProfileExperience | null => {
  if (!item || typeof item !== 'object') return null;
  const company = asCleanString(item.company || item.name || item.organization, 250);
  const position = asCleanString(item.position || item.role || item.title, 250);
  const description = asCleanString(item.description || item.summary, 5000);
  const highlights = toStringList(item.highlights, 40, 1000);
  const technologies = toStringList(item.technologies || item.keywords, 40, 120);

  if (!company && !position && !description && highlights.length === 0) {
    return null;
  }

  return {
    id: asCleanString(item.id, 120) || makeId('exp', idx),
    company,
    name: asCleanString(item.name || company, 250),
    position,
    location: asCleanString(item.location, 200),
    startDate: formatDateField(item.startDate),
    endDate: formatDateField(item.endDate),
    current: Boolean(item.current),
    description,
    highlights,
    technologies,
    metrics: extractVerifiedMetricsFromStatements(highlights, description, item.metrics)
  };
};

const normalizeProjectItem = (item: any, idx: number): ICareerProfileProject | null => {
  if (!item || typeof item !== 'object') return null;
  const name = asCleanString(item.name || item.title, 250);
  const description = asCleanString(item.description || item.summary, 5000);
  const highlights = toStringList(item.highlights, 40, 1000);
  const technologies = toStringList(item.technologies || item.tags || item.keywords, 40, 120);

  if (!name && !description && highlights.length === 0) {
    return null;
  }

  return {
    id: asCleanString(item.id, 120) || makeId('proj', idx),
    name: name || `Project ${idx + 1}`,
    description,
    highlights,
    technologies,
    metrics: extractVerifiedMetricsFromStatements(highlights, description, item.metrics),
    url: asCleanString(item.url || item.demoUrl, 1000),
    githubUrl: asCleanString(item.githubUrl || item.repoUrl, 1000),
    startDate: formatDateField(item.startDate),
    endDate: formatDateField(item.endDate),
    current: Boolean(item.current)
  };
};

const normalizeSkillItem = (item: any, idx: number): ICareerProfileSkill | null => {
  if (typeof item === 'string') {
    const clean = asCleanString(item, 150);
    if (!clean) return null;
    return {
      id: makeId('skill', idx),
      name: clean,
      category: '',
      level: '',
      keywords: [],
      subSkills: []
    };
  }
  if (!item || typeof item !== 'object') return null;
  const name = asCleanString(item.name, 150);
  if (!name) return null;

  const rawSubSkills = Array.isArray(item.subSkills) ? item.subSkills : [];
  const subSkills = rawSubSkills
    .map((sub: any, sIdx: number) => {
      if (typeof sub === 'string') {
        const cleanSub = asCleanString(sub, 120);
        return cleanSub ? { id: makeId('subskill', sIdx), name: cleanSub } : null;
      }
      if (sub && typeof sub === 'object') {
        const cleanSub = asCleanString(sub.name, 120);
        return cleanSub
          ? { id: asCleanString(sub.id, 120) || makeId('subskill', sIdx), name: cleanSub }
          : null;
      }
      return null;
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;

  const keywords = toStringList(
    item.keywords || subSkills.map((s) => s.name),
    40,
    120
  );

  return {
    id: asCleanString(item.id, 120) || makeId('skill', idx),
    name,
    category: asCleanString(item.category, 150),
    level: asCleanString(item.level, 80),
    keywords,
    subSkills
  };
};

const normalizeEducationItem = (item: any, idx: number): ICareerProfileEducation | null => {
  if (!item || typeof item !== 'object') return null;
  const institution = asCleanString(item.institution || item.school || item.name, 250);
  const degree = asCleanString(item.degree || item.studyType, 250);
  const field = asCleanString(item.field || item.area, 250);
  const description = asCleanString(item.description, 3000);
  const highlights = toStringList(item.highlights || item.courses, 30, 500);

  if (!institution && !degree && !field) {
    return null;
  }

  const normalizeEduDate = (d: any) => {
    if (!d) return '';
    if (typeof d === 'string') return asCleanString(d, 100);
    if (typeof d === 'object') {
      return {
        month: asCleanString(d.month, 30),
        year: asCleanString(d.year, 10)
      };
    }
    return '';
  };

  return {
    id: asCleanString(item.id, 120) || makeId('edu', idx),
    institution,
    degree,
    field,
    startDate: normalizeEduDate(item.startDate),
    endDate: normalizeEduDate(item.endDate),
    current: Boolean(item.current),
    location: asCleanString(item.location, 200),
    score: asCleanString(item.score || item.gpa, 80),
    description,
    highlights
  };
};

const normalizeCertificationItem = (
  item: any,
  idx: number
): ICareerProfileCertification | null => {
  if (!item || typeof item !== 'object') return null;
  const name = asCleanString(item.name || item.title, 250);
  if (!name) return null;

  return {
    id: asCleanString(item.id, 120) || makeId('cert', idx),
    name,
    issuer: asCleanString(item.issuer || item.awarder, 250),
    date: formatDateField(item.date),
    url: asCleanString(item.url, 1000),
    description: asCleanString(item.description, 2000)
  };
};

/**
 * Normalizes either a direct CareerProfile payload or an approved IResume-shaped payload
 * (`{ summary, content: { basics, sections } }`) into clean CareerProfile data.
 */
export const normalizeCareerProfilePayload = (payload: any): ICareerProfileData => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const resumeContent =
    source.content && typeof source.content === 'object' ? source.content : null;

  const basics = normalizeBasics(
    source.basics || resumeContent?.basics,
    source.summary || resumeContent?.basics?.summary
  );

  const rawExperiences: any[] = Array.isArray(source.experiences)
    ? [...source.experiences]
    : [];
  const rawProjects: any[] = Array.isArray(source.projects) ? [...source.projects] : [];
  const rawSkills: any[] = Array.isArray(source.skills) ? [...source.skills] : [];
  const rawEducation: any[] = Array.isArray(source.education) ? [...source.education] : [];
  const rawCertifications: any[] = Array.isArray(source.certifications)
    ? [...source.certifications]
    : [];

  const sections = Array.isArray(source.sections)
    ? source.sections
    : Array.isArray(resumeContent?.sections)
      ? resumeContent.sections
      : [];

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    const type = asCleanString(section.type || section.id, 100).toLowerCase();
    const title = asCleanString(section.title, 150).toLowerCase();
    const items = Array.isArray(section.content) ? section.content : [];

    if (
      type.includes('work') ||
      type.includes('experience') ||
      title.includes('experience') ||
      title.includes('work')
    ) {
      rawExperiences.push(...items);
    } else if (type === 'projects' || type.includes('project') || title.includes('project')) {
      rawProjects.push(...items);
    } else if (
      type === 'skills' ||
      type === 'teck_skills' ||
      type === 'softskilss' ||
      type.includes('skill')
    ) {
      rawSkills.push(...items);
    } else if (type === 'education' || type.includes('education')) {
      rawEducation.push(...items);
    } else if (
      type === 'certificates' ||
      type.includes('certif') ||
      title.includes('certif')
    ) {
      rawCertifications.push(...items);
    }
  }

  return {
    basics,
    experiences: rawExperiences
      .map((item, idx) => normalizeExperienceItem(item, idx))
      .filter(Boolean)
      .slice(0, 100) as ICareerProfileExperience[],
    projects: rawProjects
      .map((item, idx) => normalizeProjectItem(item, idx))
      .filter(Boolean)
      .slice(0, 100) as ICareerProfileProject[],
    skills: rawSkills
      .map((item, idx) => normalizeSkillItem(item, idx))
      .filter(Boolean)
      .slice(0, 200) as ICareerProfileSkill[],
    education: rawEducation
      .map((item, idx) => normalizeEducationItem(item, idx))
      .filter(Boolean)
      .slice(0, 50) as ICareerProfileEducation[],
    certifications: rawCertifications
      .map((item, idx) => normalizeCertificationItem(item, idx))
      .filter(Boolean)
      .slice(0, 100) as ICareerProfileCertification[]
  };
};

const unionStrings = (existing: string[] = [], incoming: string[] = []): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const val of [...existing, ...incoming]) {
    const clean = (val || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
};

const normKey = (...parts: Array<string | undefined>): string =>
  parts
    .map((p) => (p || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');

/**
 * Deterministically merges newly approved career facts into an existing CareerProfile
 * without fabricating data or losing previously approved highlights/metrics.
 */
export const mergeCareerProfileData = (
  existing: ICareerProfileData | null | undefined,
  incomingRaw: any
): ICareerProfileData => {
  const incoming = normalizeCareerProfilePayload(incomingRaw);
  if (!existing) {
    return incoming;
  }

  const pickStr = (inc?: string, cur?: string): string =>
    inc && inc.trim() ? inc.trim() : cur?.trim() || '';

  const mergedProfiles = [...(existing.basics?.profiles || [])];
  const profileUrls = new Set(
    mergedProfiles.map((p) => (p.url || `${p.network}:${p.username}`).toLowerCase())
  );
  for (const p of incoming.basics.profiles || []) {
    const key = (p.url || `${p.network}:${p.username}`).toLowerCase();
    if (key && !profileUrls.has(key)) {
      profileUrls.add(key);
      mergedProfiles.push(p);
    }
  }

  const basics: ICareerProfileBasics = {
    name: pickStr(incoming.basics.name, existing.basics?.name),
    label: pickStr(incoming.basics.label, existing.basics?.label),
    email: pickStr(incoming.basics.email, existing.basics?.email),
    phone: pickStr(incoming.basics.phone, existing.basics?.phone),
    url: pickStr(incoming.basics.url, existing.basics?.url),
    summary: pickStr(incoming.basics.summary, existing.basics?.summary),
    location: {
      address: pickStr(incoming.basics.location?.address, existing.basics?.location?.address),
      postalCode: pickStr(
        incoming.basics.location?.postalCode,
        existing.basics?.location?.postalCode
      ),
      city: pickStr(incoming.basics.location?.city, existing.basics?.location?.city),
      countryCode: pickStr(
        incoming.basics.location?.countryCode,
        existing.basics?.location?.countryCode
      ),
      region: pickStr(incoming.basics.location?.region, existing.basics?.location?.region)
    },
    profiles: mergedProfiles
  };

  // Merge experiences by (company + position)
  const experiences = (existing.experiences || []).map((e) => ({
    ...e,
    highlights: [...(e.highlights || [])],
    technologies: [...(e.technologies || [])],
    metrics: [...(e.metrics || [])]
  }));
  const expIndexByKey = new Map<string, number>();
  experiences.forEach((e, i) => {
    expIndexByKey.set(normKey(e.company || e.name, e.position), i);
  });

  for (const inc of incoming.experiences) {
    const key = normKey(inc.company || inc.name, inc.position);
    const matchIdx = expIndexByKey.get(key);
    if (matchIdx !== undefined && key !== '|') {
      const cur = experiences[matchIdx];
      const mergedHighlights = unionStrings(cur.highlights, inc.highlights);
      const mergedDescription = pickStr(inc.description, cur.description);
      experiences[matchIdx] = {
        ...cur,
        company: pickStr(inc.company, cur.company),
        name: pickStr(inc.name, cur.name),
        position: pickStr(inc.position, cur.position),
        location: pickStr(inc.location, cur.location),
        startDate: pickStr(inc.startDate, cur.startDate),
        endDate: pickStr(inc.endDate, cur.endDate),
        current: inc.current ?? cur.current,
        description: mergedDescription,
        highlights: mergedHighlights,
        technologies: unionStrings(cur.technologies, inc.technologies),
        metrics: extractVerifiedMetricsFromStatements(
          mergedHighlights,
          mergedDescription,
          unionStrings(cur.metrics, inc.metrics)
        )
      };
    } else {
      expIndexByKey.set(key, experiences.length);
      experiences.push(inc);
    }
  }

  // Merge projects by normalized project name
  const projects = (existing.projects || []).map((p) => ({
    ...p,
    highlights: [...(p.highlights || [])],
    technologies: [...(p.technologies || [])],
    metrics: [...(p.metrics || [])]
  }));
  const projIndexByKey = new Map<string, number>();
  projects.forEach((p, i) => {
    projIndexByKey.set(normKey(p.name), i);
  });

  for (const inc of incoming.projects) {
    const key = normKey(inc.name);
    const matchIdx = projIndexByKey.get(key);
    if (matchIdx !== undefined && key) {
      const cur = projects[matchIdx];
      const mergedHighlights = unionStrings(cur.highlights, inc.highlights);
      const mergedDescription = pickStr(inc.description, cur.description);
      projects[matchIdx] = {
        ...cur,
        name: pickStr(inc.name, cur.name),
        description: mergedDescription,
        highlights: mergedHighlights,
        technologies: unionStrings(cur.technologies, inc.technologies),
        metrics: extractVerifiedMetricsFromStatements(
          mergedHighlights,
          mergedDescription,
          unionStrings(cur.metrics, inc.metrics)
        ),
        url: pickStr(inc.url, cur.url),
        githubUrl: pickStr(inc.githubUrl, cur.githubUrl),
        startDate: pickStr(inc.startDate, cur.startDate),
        endDate: pickStr(inc.endDate, cur.endDate),
        current: inc.current ?? cur.current
      };
    } else {
      projIndexByKey.set(key, projects.length);
      projects.push(inc);
    }
  }

  // Merge skills by normalized skill name
  const skills: ICareerProfileSkill[] = (existing.skills || []).map((s) => ({
    ...s,
    keywords: [...(s.keywords || [])],
    subSkills: [...(s.subSkills || [])]
  }));
  const skillIndexByKey = new Map<string, number>();
  skills.forEach((s, i) => {
    skillIndexByKey.set(normKey(s.name), i);
  });

  for (const inc of incoming.skills) {
    const key = normKey(inc.name);
    const matchIdx = skillIndexByKey.get(key);
    if (matchIdx !== undefined && key) {
      const cur = skills[matchIdx];
      const mergedKeywords = unionStrings(cur.keywords, inc.keywords);
      const existingSubNames = new Set(
        (cur.subSkills || []).map((sub) => sub.name.toLowerCase())
      );
      const mergedSubSkills = [...(cur.subSkills || [])];
      for (const sub of inc.subSkills || []) {
        if (!existingSubNames.has(sub.name.toLowerCase())) {
          existingSubNames.add(sub.name.toLowerCase());
          mergedSubSkills.push(sub);
        }
      }
      skills[matchIdx] = {
        ...cur,
        category: pickStr(inc.category, cur.category),
        level: pickStr(inc.level, cur.level),
        keywords: mergedKeywords,
        subSkills: mergedSubSkills
      };
    } else {
      skillIndexByKey.set(key, skills.length);
      skills.push(inc);
    }
  }

  // Merge education by (institution + degree + field)
  const education = (existing.education || []).map((ed) => ({
    ...ed,
    highlights: [...(ed.highlights || [])]
  }));
  const eduIndexByKey = new Map<string, number>();
  education.forEach((ed, i) => {
    eduIndexByKey.set(normKey(ed.institution, ed.degree, ed.field), i);
  });

  for (const inc of incoming.education) {
    const key = normKey(inc.institution, inc.degree, inc.field);
    const matchIdx = eduIndexByKey.get(key);
    if (matchIdx !== undefined && key !== '||') {
      const cur = education[matchIdx];
      education[matchIdx] = {
        ...cur,
        institution: pickStr(inc.institution, cur.institution),
        degree: pickStr(inc.degree, cur.degree),
        field: pickStr(inc.field, cur.field),
        startDate: inc.startDate || cur.startDate,
        endDate: inc.endDate || cur.endDate,
        current: inc.current ?? cur.current,
        location: pickStr(inc.location, cur.location),
        score: pickStr(inc.score, cur.score),
        description: pickStr(inc.description, cur.description),
        highlights: unionStrings(cur.highlights, inc.highlights)
      };
    } else {
      eduIndexByKey.set(key, education.length);
      education.push(inc);
    }
  }

  // Merge certifications by (name + issuer)
  const certifications = [...(existing.certifications || [])];
  const certIndexByKey = new Map<string, number>();
  certifications.forEach((c, i) => {
    certIndexByKey.set(normKey(c.name, c.issuer), i);
  });

  for (const inc of incoming.certifications) {
    const key = normKey(inc.name, inc.issuer);
    const matchIdx = certIndexByKey.get(key);
    if (matchIdx !== undefined && key !== '|') {
      const cur = certifications[matchIdx];
      certifications[matchIdx] = {
        ...cur,
        date: pickStr(inc.date, cur.date),
        url: pickStr(inc.url, cur.url),
        description: pickStr(inc.description, cur.description)
      };
    } else {
      certIndexByKey.set(key, certifications.length);
      certifications.push(inc);
    }
  }

  return {
    basics,
    experiences,
    projects,
    skills,
    education,
    certifications
  };
};

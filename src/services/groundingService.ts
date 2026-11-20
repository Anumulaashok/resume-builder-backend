import { AppError } from '../utils/appError';
import {
  ICareerProfileData,
  SKILL_CATEGORY_KEYS,
  SkillCategoryKey,
} from '../models/CareerProfile';
import { IProvenanceClaim, IResumeProvenance } from '../models/Resume';

export type BulletRewriteAction = 'rewrite' | 'shorten' | 'improve' | 'ats';

export const METRIC_PROMPT_OPTIONS = [
  'Reduced latency',
  'Increased throughput',
  'Reduced infrastructure cost',
  'Reduced processing time',
  'Other',
] as const;

export interface FactIndexEntry {
  id: string;
  kind:
    | 'personalInfo'
    | 'summary'
    | 'experience'
    | 'project'
    | 'skill'
    | 'education'
    | 'certification'
    | 'achievement';
  text: string;
  company?: string;
  role?: string;
  institution?: string;
  degree?: string;
  certificationName?: string;
  skillName?: string;
  category?: string;
}

export interface CareerProfileFactIndex {
  facts: Map<string, FactIndexEntry>;
  companies: Set<string>;
  roles: Set<string>;
  institutions: Set<string>;
  degrees: Set<string>;
  certifications: Set<string>;
  skills: Map<string, { displayName: string; factId: string; category: SkillCategoryKey | 'experience' | 'project' }>;
  allTextLower: string;
  numericTokens: Set<string>;
}

const norm = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const extractNumericTokens = (text: string): string[] => {
  if (!text) return [];
  const matches =
    text.match(
      /(?:\$\s?\d+(?:[.,]\d+)?\s*[kKmMbB]?|\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|x|ms|s|sec|seconds|mins?|minutes|hrs?|hours|days|k|m|b|tb|gb|mb|rps|qps)?\+?)/gi
    ) || [];
  return matches
    .map((m) => m.trim().toLowerCase().replace(/\s+/g, ''))
    .filter((m) => /\d/.test(m));
};

export const hasQuantitativeMetrics = (text: string): boolean => {
  if (!text) return false;
  return /(?:\$\s?\d|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\b\d+(?:,\d{3})+|\b\d+\+?\s*(?:ms|sec|seconds|minutes|hours|days|users|clients|requests|services|pipelines|engineers|k\b|m\b|gb\b|tb\b|rps\b|qps\b))/i.test(
    text
  );
};

export const buildProfileFactIndex = (
  profile: ICareerProfileData | null | undefined
): CareerProfileFactIndex => {
  const facts = new Map<string, FactIndexEntry>();
  const companies = new Set<string>();
  const roles = new Set<string>();
  const institutions = new Set<string>();
  const degrees = new Set<string>();
  const certifications = new Set<string>();
  const skills = new Map<
    string,
    { displayName: string; factId: string; category: SkillCategoryKey | 'experience' | 'project' }
  >();
  const allTexts: string[] = [];

  if (!profile) {
    return {
      facts,
      companies,
      roles,
      institutions,
      degrees,
      certifications,
      skills,
      allTextLower: '',
      numericTokens: new Set<string>(),
    };
  }

  const pInfo = profile.personalInfo;
  if (pInfo) {
    const id = pInfo.id || 'info_primary';
    const text = [
      pInfo.fullName,
      pInfo.email,
      pInfo.phone,
      pInfo.location,
      pInfo.linkedin,
      pInfo.github,
      pInfo.portfolio,
      pInfo.website,
    ]
      .filter(Boolean)
      .join(' | ');
    facts.set(id, { id, kind: 'personalInfo', text });
    allTexts.push(text);
  }

  if (profile.summary) {
    const id = profile.summary.id || 'sum_primary';
    const text = [
      profile.summary.currentTitle,
      profile.summary.yearsOfExperience,
      ...(profile.summary.areasOfExpertise || []),
      ...(profile.summary.industryExperience || []),
      profile.summary.text,
    ]
      .filter(Boolean)
      .join(' ');
    facts.set(id, {
      id,
      kind: 'summary',
      text,
      role: profile.summary.currentTitle || undefined,
    });
    if (profile.summary.currentTitle) roles.add(norm(profile.summary.currentTitle));
    for (const area of profile.summary.areasOfExpertise || []) {
      const k = norm(area);
      if (k && !skills.has(k)) {
        skills.set(k, { displayName: area.trim(), factId: id, category: 'other' });
      }
    }
    allTexts.push(text);
  }

  for (const exp of profile.experience || []) {
    const text = [
      exp.company,
      exp.role,
      exp.location,
      exp.startDate,
      exp.endDate,
      ...(exp.responsibilities || []),
      ...(exp.achievements || []),
      ...(exp.technologies || []),
      ...(exp.metrics || []),
    ]
      .filter(Boolean)
      .join(' ');
    facts.set(exp.id, {
      id: exp.id,
      kind: 'experience',
      text,
      company: exp.company,
      role: exp.role,
    });
    if (exp.company) companies.add(norm(exp.company));
    if (exp.role) roles.add(norm(exp.role));
    for (const tech of exp.technologies || []) {
      const k = norm(tech);
      if (k && !skills.has(k)) {
        skills.set(k, { displayName: tech.trim(), factId: exp.id, category: 'experience' });
      }
    }
    allTexts.push(text);
  }

  for (const proj of profile.projects || []) {
    const text = [
      proj.name,
      proj.description,
      proj.problem,
      proj.solution,
      proj.impact,
      ...(proj.technologies || []),
      ...(proj.metrics || []),
      proj.url,
    ]
      .filter(Boolean)
      .join(' ');
    facts.set(proj.id, { id: proj.id, kind: 'project', text });
    for (const tech of proj.technologies || []) {
      const k = norm(tech);
      if (k && !skills.has(k)) {
        skills.set(k, { displayName: tech.trim(), factId: proj.id, category: 'project' });
      }
    }
    allTexts.push(text);
  }

  if (profile.skills) {
    for (const category of SKILL_CATEGORY_KEYS) {
      for (const item of profile.skills[category] || []) {
        facts.set(item.id, {
          id: item.id,
          kind: 'skill',
          text: `${item.name} ${item.level || ''}`.trim(),
          skillName: item.name,
          category,
        });
        const k = norm(item.name);
        if (k) {
          skills.set(k, { displayName: item.name, factId: item.id, category });
        }
        allTexts.push(item.name);
      }
    }
  }

  for (const edu of profile.education || []) {
    const text = [
      edu.degree,
      edu.field,
      edu.institution,
      edu.startYear,
      edu.endYear,
      edu.gpa,
      edu.location,
    ]
      .filter(Boolean)
      .join(' ');
    facts.set(edu.id, {
      id: edu.id,
      kind: 'education',
      text,
      institution: edu.institution,
      degree: [edu.degree, edu.field].filter(Boolean).join(' in '),
    });
    if (edu.institution) institutions.add(norm(edu.institution));
    if (edu.degree) degrees.add(norm(edu.degree));
    if (edu.degree && edu.field) degrees.add(norm(`${edu.degree} in ${edu.field}`));
    allTexts.push(text);
  }

  for (const cert of profile.certifications || []) {
    const text = [cert.name, cert.issuer, cert.date].filter(Boolean).join(' ');
    facts.set(cert.id, {
      id: cert.id,
      kind: 'certification',
      text,
      certificationName: cert.name,
    });
    if (cert.name) certifications.add(norm(cert.name));
    allTexts.push(text);
  }

  for (const ach of profile.achievements || []) {
    const text = [ach.title, ach.category, ach.issuer, ach.date, ach.description]
      .filter(Boolean)
      .join(' ');
    facts.set(ach.id, { id: ach.id, kind: 'achievement', text });
    allTexts.push(text);
  }

  const joined = allTexts.join(' ');
  const numericTokens = new Set<string>(extractNumericTokens(joined));

  return {
    facts,
    companies,
    roles,
    institutions,
    degrees,
    certifications,
    skills,
    allTextLower: ` ${norm(joined)} `,
    numericTokens,
  };
};

// Canonical technical terms checked in free-text outputs so AI cannot slip unverified tech into bullets/summaries.
const KNOWN_TECH_GUARD_TERMS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'JavaScript', aliases: ['javascript'] },
  { canonical: 'TypeScript', aliases: ['typescript'] },
  { canonical: 'Python', aliases: ['python'] },
  { canonical: 'Java', aliases: ['java'] },
  { canonical: 'Golang', aliases: ['golang'] },
  { canonical: 'Rust', aliases: ['rust'] },
  { canonical: 'C++', aliases: ['c++'] },
  { canonical: 'C#', aliases: ['c#', 'csharp'] },
  { canonical: 'Kotlin', aliases: ['kotlin'] },
  { canonical: 'Swift', aliases: ['swift'] },
  { canonical: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs'] },
  { canonical: 'Vue', aliases: ['vue', 'vuejs', 'vue.js'] },
  { canonical: 'Angular', aliases: ['angular'] },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs'] },
  { canonical: 'Express', aliases: ['express.js', 'expressjs'] },
  { canonical: 'NestJS', aliases: ['nestjs', 'nest.js'] },
  { canonical: 'Spring Boot', aliases: ['spring boot', 'springboot'] },
  { canonical: 'Django', aliases: ['django'] },
  { canonical: 'FastAPI', aliases: ['fastapi'] },
  { canonical: 'GraphQL', aliases: ['graphql'] },
  { canonical: 'gRPC', aliases: ['grpc'] },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { canonical: 'MySQL', aliases: ['mysql'] },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongoose'] },
  { canonical: 'Redis', aliases: ['redis'] },
  { canonical: 'Elasticsearch', aliases: ['elasticsearch'] },
  { canonical: 'Kafka', aliases: ['kafka'] },
  { canonical: 'RabbitMQ', aliases: ['rabbitmq'] },
  { canonical: 'AWS', aliases: ['aws', 'amazon web services'] },
  { canonical: 'GCP', aliases: ['gcp', 'google cloud'] },
  { canonical: 'Azure', aliases: ['azure'] },
  { canonical: 'Docker', aliases: ['docker'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { canonical: 'Terraform', aliases: ['terraform'] },
  { canonical: 'PyTorch', aliases: ['pytorch'] },
  { canonical: 'TensorFlow', aliases: ['tensorflow'] },
];

const hasWholeAlias = (lowerText: string, alias: string): boolean => {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(lowerText);
};

export interface GroundingValidationResult {
  valid: boolean;
  violations: string[];
}

export const validateGroundedBullet = (params: {
  rewrittenText: string;
  originalText?: string;
  sourceFactIds: string[];
  factIndex: CareerProfileFactIndex;
  userEnteredMetric?: string;
}): GroundingValidationResult => {
  const { rewrittenText, originalText = '', sourceFactIds, factIndex, userEnteredMetric } = params;
  const violations: string[] = [];

  if (!rewrittenText || !rewrittenText.trim()) {
    return { valid: false, violations: ['Generated bullet text is empty.'] };
  }

  // Verify referenced source_fact_ids exist when CareerProfile facts are referenced
  const validSourceTexts: string[] = [originalText];
  for (const id of sourceFactIds) {
    if (id === 'current_resume_bullet' || id === 'user_entered_metric') continue;
    const entry = factIndex.facts.get(id);
    if (!entry) {
      violations.push(`Unknown source_fact_id "${id}" not found in Career Profile.`);
    } else {
      validSourceTexts.push(entry.text);
    }
  }

  if (sourceFactIds.length === 0) {
    violations.push('Every generated or rewritten claim must include at least one source_fact_id.');
  }

  // Check numeric metrics: every numeric token in rewrittenText must exist in source facts, original bullet, or userEnteredMetric
  const allowedNumbers = new Set<string>([
    ...extractNumericTokens(validSourceTexts.join(' ')),
    ...extractNumericTokens(userEnteredMetric || ''),
  ]);
  // Also allow plain digits embedded inside allowed tokens (e.g. "40%" -> "40")
  for (const token of Array.from(allowedNumbers)) {
    const bareDigits = token.match(/\d+(?:[.,]\d+)?/g) || [];
    bareDigits.forEach((d) => allowedNumbers.add(d));
  }

  const outputNumbers = extractNumericTokens(rewrittenText);
  for (const outNum of outputNumbers) {
    const bare = (outNum.match(/\d+(?:[.,]\d+)?/) || [''])[0];
    if (!allowedNumbers.has(outNum) && (!bare || !allowedNumbers.has(bare))) {
      violations.push(`Unverified numeric metric "${outNum}" is not present in Career Profile facts or user-entered metrics.`);
    }
  }

  // Check unverified technical skills injected into bullet prose
  const allowedProseLower = ` ${norm(
    [validSourceTexts.join(' '), factIndex.allTextLower, userEnteredMetric || ''].join(' ')
  )} `;
  const rewrittenLower = ` ${norm(rewrittenText)} `;

  for (const tech of KNOWN_TECH_GUARD_TERMS) {
    const inOutput = tech.aliases.some((alias) => hasWholeAlias(rewrittenLower, alias));
    if (!inOutput) continue;
    const inAllowed = tech.aliases.some((alias) => hasWholeAlias(allowedProseLower, alias));
    if (!inAllowed) {
      violations.push(`Unverified skill "${tech.canonical}" is not in your Career Profile or original bullet.`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
};

export const validateGroundedResume = (
  generated: {
    summary?: string;
    content?: {
      basics?: Record<string, any>;
      sections?: Array<{ id?: string; type?: string; title?: string; content?: any[] }>;
    };
  },
  profile: ICareerProfileData
): GroundingValidationResult => {
  const factIndex = buildProfileFactIndex(profile);
  const violations: string[] = [];

  const summaryText = generated.summary || generated.content?.basics?.summary || '';
  if (summaryText) {
    const sumCheck = validateGroundedBullet({
      rewrittenText: summaryText,
      sourceFactIds: Array.from(factIndex.facts.keys()),
      factIndex,
    });
    violations.push(...sumCheck.violations);
  }

  for (const section of generated.content?.sections || []) {
    const sectionType = String(section.type || section.id || '').toLowerCase();
    const items = Array.isArray(section.content) ? section.content : [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const sourceFactIds: string[] = Array.isArray(item.source_fact_ids)
        ? item.source_fact_ids
        : [];

      if (sourceFactIds.length === 0) {
        violations.push(
          `Section "${section.title || sectionType}" contains an item without source_fact_ids provenance.`
        );
      } else {
        for (const fid of sourceFactIds) {
          if (!factIndex.facts.has(fid)) {
            violations.push(`Invalid source_fact_id "${fid}" referenced in section "${section.title || sectionType}".`);
          }
        }
      }

      if (sectionType.includes('work') || sectionType.includes('experience')) {
        const company = norm(String(item.company || item.name || ''));
        const role = norm(String(item.position || item.role || ''));
        if (company && !factIndex.companies.has(company)) {
          violations.push(`Unverified company "${item.company || item.name}" is not in Career Profile.`);
        }
        if (role && !factIndex.roles.has(role)) {
          violations.push(`Unverified role "${item.position || item.role}" is not in Career Profile.`);
        }
        const desc = [
          typeof item.description === 'string' ? item.description : '',
          ...(Array.isArray(item.highlights) ? item.highlights : []),
        ]
          .filter(Boolean)
          .join('\n');
        if (desc) {
          const check = validateGroundedBullet({
            rewrittenText: desc,
            sourceFactIds: sourceFactIds.length ? sourceFactIds : Array.from(factIndex.facts.keys()),
            factIndex,
          });
          violations.push(...check.violations);
        }
      } else if (sectionType.includes('education')) {
        const inst = norm(String(item.institution || ''));
        const degree = norm(String(item.studyType || item.degree || ''));
        if (inst && !factIndex.institutions.has(inst)) {
          violations.push(`Unverified educational institution "${item.institution}" is not in Career Profile.`);
        }
        if (degree && !Array.from(factIndex.degrees).some((d) => d.includes(degree) || degree.includes(d))) {
          violations.push(`Unverified degree "${item.studyType || item.degree}" is not in Career Profile.`);
        }
      } else if (sectionType.includes('cert')) {
        const certName = norm(String(item.name || item.title || ''));
        if (certName && !factIndex.certifications.has(certName)) {
          violations.push(`Unverified certification "${item.name || item.title}" is not in Career Profile.`);
        }
      } else if (sectionType.includes('skill')) {
        const candidates: string[] = [];
        if (typeof item.name === 'string' && !Array.isArray(item.technologies) && !Array.isArray(item.subSkills)) {
          candidates.push(item.name);
        }
        if (Array.isArray(item.technologies)) candidates.push(...item.technologies);
        if (Array.isArray(item.subSkills)) candidates.push(...item.subSkills);

        for (const skillName of candidates) {
          const k = norm(String(skillName));
          if (
            k &&
            !factIndex.skills.has(k) &&
            !hasWholeAlias(factIndex.allTextLower, k)
          ) {
            violations.push(`Unverified skill "${skillName}" is not in Career Profile.`);
          }
        }
      } else if (sectionType.includes('project')) {
        const desc = [
          typeof item.description === 'string' ? item.description : '',
          ...(Array.isArray(item.highlights) ? item.highlights : []),
        ]
          .filter(Boolean)
          .join('\n');
        if (desc) {
          const check = validateGroundedBullet({
            rewrittenText: desc,
            sourceFactIds: sourceFactIds.length ? sourceFactIds : Array.from(factIndex.facts.keys()),
            factIndex,
          });
          violations.push(...check.violations);
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations: Array.from(new Set(violations)),
  };
};

const relevanceScore = (text: string, queryTerms: string[]): number => {
  if (!queryTerms.length) return 0;
  const lower = text.toLowerCase();
  return queryTerms.reduce((acc, term) => (lower.includes(term) ? acc + 1 : acc), 0);
};

const extractQueryTerms = (targetRole?: string, jobDescription?: string, prompt?: string): string[] => {
  const combined = `${targetRole || ''} ${jobDescription || ''} ${prompt || ''}`.toLowerCase();
  return Array.from(
    new Set(
      combined
        .split(/[^a-z0-9+#.]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2)
    )
  ).slice(0, 60);
};

export interface GroundedSeededResumePayload {
  title: string;
  summary: string;
  templateId: string;
  content: {
    basics: {
      name: string;
      label: string;
      email: string;
      phone?: string;
      summary?: string;
      location?: {
        city?: string;
      };
    };
    sections: Array<{
      id: string;
      type: string;
      title: string;
      content: any[];
      isCustom?: boolean;
    }>;
    sectionOrder: string[];
  };
  provenance: IResumeProvenance;
}

export const buildGroundedResumeFromProfile = (
  profile: ICareerProfileData,
  options?: {
    title?: string;
    targetRole?: string;
    jobDescription?: string;
    prompt?: string;
    templateId?: string;
    fallbackName?: string;
    fallbackEmail?: string;
  }
): GroundedSeededResumePayload => {
  const queryTerms = extractQueryTerms(
    options?.targetRole,
    options?.jobDescription,
    options?.prompt
  );
  const claims: IProvenanceClaim[] = [];

  const candidateName =
    profile.personalInfo.fullName || options?.fallbackName || 'Your Name';
  const candidateEmail =
    profile.personalInfo.email || options?.fallbackEmail || 'you@example.com';

  // Keep headline strictly grounded in Career Profile title/roles
  const verifiedTitle =
    profile.summary.currentTitle ||
    profile.experience[0]?.role ||
    '';

  // Build grounded summary strictly from approved summary/experience/skills facts
  const summaryFactIds: string[] = [];
  let summaryText = profile.summary.text.trim();
  if (summaryText) {
    summaryFactIds.push(profile.summary.id || 'sum_primary');
  } else {
    const topSkills: string[] = [];
    for (const cat of SKILL_CATEGORY_KEYS) {
      for (const sk of profile.skills[cat] || []) {
        topSkills.push(sk.name);
        summaryFactIds.push(sk.id);
        if (topSkills.length >= 5) break;
      }
      if (topSkills.length >= 5) break;
    }

    const parts: string[] = [];
    if (verifiedTitle) {
      summaryFactIds.push(
        profile.summary.currentTitle
          ? profile.summary.id || 'sum_primary'
          : profile.experience[0]?.id || 'sum_primary'
      );
      const yrs = profile.summary.yearsOfExperience
        ? ` with ${profile.summary.yearsOfExperience} of experience`
        : '';
      parts.push(`${verifiedTitle}${yrs}.`);
    }
    if (profile.experience[0]?.company) {
      summaryFactIds.push(profile.experience[0].id);
      parts.push(
        `Proven delivery at ${profile.experience[0].company}${
          profile.experience[0].role ? ` as ${profile.experience[0].role}` : ''
        }.`
      );
    }
    if (topSkills.length > 0) {
      parts.push(`Core strengths in ${topSkills.join(', ')}.`);
    }
    summaryText = parts.join(' ').trim();
  }

  if (summaryText && summaryFactIds.length > 0) {
    claims.push({
      targetPath: 'content.basics.summary',
      text: summaryText,
      source_fact_ids: Array.from(new Set(summaryFactIds)),
    });
  }

  const sections: GroundedSeededResumePayload['content']['sections'] = [];
  const sectionOrder: string[] = [];

  // 1. Work Experience (ranked by relevance if tailoring, preserving verified facts)
  if (profile.experience.length > 0) {
    const orderedExp = [...profile.experience].sort((a, b) => {
      if (!queryTerms.length) return 0;
      const aScore = relevanceScore(
        `${a.role} ${a.company} ${a.responsibilities.join(' ')} ${a.achievements.join(' ')} ${a.technologies.join(' ')}`,
        queryTerms
      );
      const bScore = relevanceScore(
        `${b.role} ${b.company} ${b.responsibilities.join(' ')} ${b.achievements.join(' ')} ${b.technologies.join(' ')}`,
        queryTerms
      );
      return bScore - aScore;
    });

    const workContent = orderedExp.map((exp, idx) => {
      const bullets = [...(exp.achievements || []), ...(exp.responsibilities || [])];
      const rankedBullets = queryTerms.length
        ? [...bullets].sort(
            (a, b) => relevanceScore(b, queryTerms) - relevanceScore(a, queryTerms)
          )
        : bullets;
      const description = rankedBullets.map((b) => `• ${b}`).join('\n');

      rankedBullets.forEach((bullet, bIdx) => {
        claims.push({
          targetPath: `sections.work.${idx}.bullet.${bIdx}`,
          text: bullet,
          source_fact_ids: [exp.id],
        });
      });

      return {
        id: exp.id,
        name: exp.company,
        company: exp.company,
        position: exp.role,
        location: exp.location,
        startDate: exp.startDate,
        endDate: exp.current ? 'Present' : exp.endDate,
        current: exp.current,
        description,
        highlights: rankedBullets,
        technologies: exp.technologies,
        source_fact_ids: [exp.id],
      };
    });

    sections.push({
      id: 'work',
      type: 'WorkItem',
      title: 'Work Experience',
      content: workContent,
    });
    sectionOrder.push('work');
  }

  // 2. Projects
  if (profile.projects.length > 0) {
    const orderedProjects = [...profile.projects].sort((a, b) => {
      if (!queryTerms.length) return 0;
      return (
        relevanceScore(`${b.name} ${b.description} ${b.impact} ${b.technologies.join(' ')}`, queryTerms) -
        relevanceScore(`${a.name} ${a.description} ${a.impact} ${a.technologies.join(' ')}`, queryTerms)
      );
    });

    const projectContent = orderedProjects.map((proj, idx) => {
      const lines = [
        proj.description,
        proj.problem ? `Problem: ${proj.problem}` : '',
        proj.solution ? `Solution: ${proj.solution}` : '',
        proj.impact ? `Impact: ${proj.impact}` : '',
      ]
        .filter(Boolean)
        .flatMap((chunk) =>
          chunk
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        );

      lines.forEach((line, lIdx) => {
        claims.push({
          targetPath: `sections.projects.${idx}.bullet.${lIdx}`,
          text: line,
          source_fact_ids: [proj.id],
        });
      });

      return {
        id: proj.id,
        name: proj.name,
        description: lines.join('\n'),
        highlights: lines,
        technologies: proj.technologies,
        url: proj.url || proj.links?.[0] || '',
        source_fact_ids: [proj.id],
      };
    });

    sections.push({
      id: 'projects',
      type: 'ProjectItem',
      title: 'Projects',
      content: projectContent,
    });
    sectionOrder.push('projects');
  }

  // 3. Skills (preserve verified skill items + fact provenance)
  const skillItems: any[] = [];
  for (const cat of SKILL_CATEGORY_KEYS) {
    const list = profile.skills[cat] || [];
    if (!list.length) continue;
    const sorted = queryTerms.length
      ? [...list].sort(
          (a, b) => relevanceScore(b.name, queryTerms) - relevanceScore(a.name, queryTerms)
        )
      : list;

    for (const sk of sorted) {
      skillItems.push({
        id: sk.id,
        name: sk.name,
        ...(sk.level ? { level: sk.level } : {}),
        source_fact_ids: [sk.id],
      });
      claims.push({
        targetPath: `sections.skills.${sk.id}`,
        text: sk.name,
        source_fact_ids: [sk.id],
      });
    }
  }

  if (skillItems.length > 0) {
    sections.push({
      id: 'skills',
      type: 'SkillItem',
      title: 'Skills',
      content: skillItems,
    });
    sectionOrder.push('skills');
  }

  // 4. Education
  if (profile.education.length > 0) {
    const eduContent = profile.education.map((edu) => {
      claims.push({
        targetPath: `sections.education.${edu.id}`,
        text: `${edu.degree} ${edu.field} — ${edu.institution}`.trim(),
        source_fact_ids: [edu.id],
      });
      return {
        id: edu.id,
        institution: edu.institution,
        studyType: edu.degree,
        degree: edu.degree,
        area: edu.field,
        startDate: edu.startYear,
        endDate: edu.endYear,
        gpa: edu.gpa,
        location: edu.location,
        source_fact_ids: [edu.id],
      };
    });

    sections.push({
      id: 'education',
      type: 'EducationItem',
      title: 'Education',
      content: eduContent,
    });
    sectionOrder.push('education');
  }

  // 5. Certifications
  if (profile.certifications.length > 0) {
    const certContent = profile.certifications.map((cert) => {
      claims.push({
        targetPath: `sections.certificates.${cert.id}`,
        text: `${cert.name}${cert.issuer ? ` (${cert.issuer})` : ''}`,
        source_fact_ids: [cert.id],
      });
      return {
        id: cert.id,
        name: cert.name,
        issuer: cert.issuer,
        date: cert.date,
        url: cert.credentialUrl,
        source_fact_ids: [cert.id],
      };
    });

    sections.push({
      id: 'certificates',
      type: 'CertificateItem',
      title: 'Certifications',
      content: certContent,
    });
    sectionOrder.push('certificates');
  }

  // 6. Achievements / Awards
  if (profile.achievements.length > 0) {
    const awardContent = profile.achievements.map((ach) => {
      claims.push({
        targetPath: `sections.awards.${ach.id}`,
        text: `${ach.title}${ach.description ? `: ${ach.description}` : ''}`,
        source_fact_ids: [ach.id],
      });
      return {
        id: ach.id,
        title: ach.title,
        awarder: ach.issuer,
        date: ach.date,
        summary: ach.description,
        source_fact_ids: [ach.id],
      };
    });

    sections.push({
      id: 'awards',
      type: 'AwardItem',
      title: 'Achievements & Awards',
      content: awardContent,
    });
    sectionOrder.push('awards');
  }

  const resolvedTitle =
    options?.title?.trim() ||
    (options?.targetRole?.trim()
      ? `${candidateName} — ${options.targetRole.trim()}`
      : verifiedTitle
        ? `${candidateName} — ${verifiedTitle}`
        : `${candidateName} Resume`);

  const payload: GroundedSeededResumePayload = {
    title: resolvedTitle,
    summary: summaryText,
    templateId: options?.templateId || 'modern',
    content: {
      basics: {
        name: candidateName,
        label: verifiedTitle,
        email: candidateEmail,
        ...(profile.personalInfo.phone ? { phone: profile.personalInfo.phone } : {}),
        ...(summaryText ? { summary: summaryText } : {}),
        ...(profile.personalInfo.location
          ? { location: { city: profile.personalInfo.location } }
          : {}),
      },
      sections,
      sectionOrder,
    },
    provenance: {
      seededFromCareerProfile: true,
      careerProfileUpdatedAt: new Date().toISOString(),
      ...(options?.targetRole?.trim() ? { targetRole: options.targetRole.trim() } : {}),
      claims,
    },
  };

  // Run deterministic anti-fabrication validation on our own output
  const validation = validateGroundedResume(payload, profile);
  if (!validation.valid) {
    throw new AppError(
      `Blocked unverified resume claims: ${validation.violations.join(' ')}`,
      422
    );
  }

  return payload;
};

const WEAK_OPENERS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^worked\s+on\s+/i, replacement: 'Engineered ' },
  { pattern: /^helped\s+(?:to\s+)?build\s+/i, replacement: 'Built ' },
  { pattern: /^helped\s+(?:to\s+)?develop\s+/i, replacement: 'Developed ' },
  { pattern: /^helped\s+(?:with\s+)?/i, replacement: 'Contributed to ' },
  { pattern: /^was\s+responsible\s+for\s+building\s+/i, replacement: 'Architected and built ' },
  { pattern: /^was\s+responsible\s+for\s+/i, replacement: 'Owned ' },
  { pattern: /^responsible\s+for\s+/i, replacement: 'Led ' },
  { pattern: /^participated\s+in\s+/i, replacement: 'Delivered ' },
  { pattern: /^assisted\s+(?:in|with)\s+/i, replacement: 'Supported ' },
  { pattern: /^made\s+/i, replacement: 'Implemented ' },
  { pattern: /^did\s+/i, replacement: 'Executed ' },
];

const formatUserMetricClause = (metricCategory?: string, metricValue?: string): string => {
  const val = (metricValue || '').trim().replace(/^[.,;:\s]+|[.]+$/g, '');
  if (!val) return '';
  const cat = (metricCategory || '').trim();
  if (!cat || cat.toLowerCase() === 'other') {
    return /^(by|to|from|achieving|reducing|increasing)\b/i.test(val)
      ? val
      : `achieving ${val}`;
  }
  const lowerCat = cat.toLowerCase();
  if (lowerCat.startsWith('reduced ')) {
    const subject = cat.slice('reduced '.length).toLowerCase();
    return /^(by|from|to)\b/i.test(val)
      ? `reducing ${subject} ${val}`
      : `reducing ${subject} by ${val}`;
  }
  if (lowerCat.startsWith('increased ')) {
    const subject = cat.slice('increased '.length).toLowerCase();
    return /^(by|from|to)\b/i.test(val)
      ? `increasing ${subject} ${val}`
      : `increasing ${subject} by ${val}`;
  }
  return `${lowerCat} (${val})`;
};

export const deterministicBulletTransform = (params: {
  bullet: string;
  action: BulletRewriteAction;
  verifiedTechnologies?: string[];
  metricCategory?: string;
  metricValue?: string;
}): string => {
  const raw = params.bullet
    .trim()
    .replace(/^[•\-*·]+\s*/, '')
    .replace(/\s+/g, ' ');

  let base = raw.replace(/[.]+$/, '').trim();

  for (const rule of WEAK_OPENERS) {
    if (rule.pattern.test(base)) {
      base = base.replace(rule.pattern, rule.replacement);
      break;
    }
  }

  // Capitalize first letter
  if (base.length > 0) {
    base = base.charAt(0).toUpperCase() + base.slice(1);
  }

  if (params.action === 'shorten') {
    base = base
      .replace(/\bin order to\b/gi, 'to')
      .replace(/\bdue to the fact that\b/gi, 'because')
      .replace(/\ba wide variety of\b/gi, 'multiple')
      .replace(/\bcollaborated closely with\b/gi, 'partnered with')
      .replace(/\bon a daily basis\b/gi, 'daily')
      .replace(/\s*,\s*which\s+allowed\s+us\s+to\s+/gi, ' to ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (params.action === 'improve') {
    if (!/^(Engineered|Built|Developed|Architected|Owned|Led|Delivered|Implemented|Designed|Optimized|Automated|Scaled|Streamlined|Reduced|Increased)\b/.test(base)) {
      const loweredFirst = base.charAt(0).toLowerCase() + base.slice(1);
      base = `Delivered ${loweredFirst}`;
    }
  } else if (params.action === 'ats') {
    const missingVerifiedTech = (params.verifiedTechnologies || []).filter(
      (tech) => tech && !new RegExp(tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(base)
    );
    if (missingVerifiedTech.length > 0) {
      base = `${base} using ${missingVerifiedTech.slice(0, 3).join(', ')}`;
    }
  }

  const metricClause = formatUserMetricClause(params.metricCategory, params.metricValue);
  if (metricClause) {
    base = `${base}, ${metricClause}`;
  }

  return `${base}.`;
};

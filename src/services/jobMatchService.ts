export interface JobMatchBreakdown {
  skills: number;
  experience: number;
  title: number;
}

export interface JobMatchKeyword {
  keyword: string;
  occurrences: number;
}

export interface JobMatchResult {
  score: number;
  label: 'Excellent match' | 'Good match' | 'Fair match' | 'Low match';
  breakdown: JobMatchBreakdown;
  matchedKeywords: JobMatchKeyword[];
  missingKeywords: JobMatchKeyword[];
  suggestions: string[];
  totals: { matched: number; required: number };
}

interface ResumeSectionLike {
  id?: string;
  type?: string;
  title?: string;
  enabled?: boolean;
  content?: unknown[] | string;
}

interface ResumeLike {
  title?: string;
  summary?: string;
  content?: {
    basics?: { label?: string; summary?: string; enabled?: boolean; [key: string]: unknown };
    sections?: ResumeSectionLike[];
    sectionOrder?: string[];
  };
}

const WORK_SECTION_TOKENS = new Set([
  'workitem',
  'work',
  'experience',
  'workexperience',
  'work_experience',
  'professional_experience',
  'employment',
]);

const PROJECT_SECTION_TOKENS = new Set([
  'projectitem',
  'project',
  'projects',
]);

const SKILL_SECTION_TOKENS = new Set([
  'skillitem',
  'technicalskillitem',
  'softskillitem',
  'skill',
  'skills',
  'technicalskills',
  'technical_skills',
  'softskills',
  'soft_skills',
]);

const IGNORED_OBJECT_KEYS = new Set(['id', '_id', 'enabled', 'isCustom']);

// Canonical skill -> aliases (all lowercase); aliases are matched as whole words/phrases.
const SKILL_DICTIONARY: Record<string, string[]> = {
  JavaScript: ['javascript', 'js', 'es6', 'ecmascript'],
  TypeScript: ['typescript', 'ts'],
  React: ['react', 'reactjs', 'react.js'],
  'React Native': ['react native'],
  'Next.js': ['next.js', 'nextjs'],
  Vue: ['vue', 'vuejs', 'vue.js'],
  Angular: ['angular'],
  Svelte: ['svelte'],
  Redux: ['redux'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3'],
  Sass: ['sass', 'scss'],
  'Tailwind CSS': ['tailwind', 'tailwindcss', 'tailwind css'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  Express: ['expressjs', 'express.js'],
  NestJS: ['nestjs', 'nest.js'],
  GraphQL: ['graphql'],
  'REST APIs': ['restful', 'rest api', 'rest apis'],
  gRPC: ['grpc'],
  Python: ['python'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi'],
  Java: ['java'],
  'Spring Boot': ['spring boot', 'springboot'],
  Kotlin: ['kotlin'],
  Go: ['golang'],
  Rust: ['rust'],
  'C#': ['c#', 'csharp'],
  '.NET': ['.net', 'dotnet', 'asp.net'],
  'C++': ['c++', 'cpp'],
  PHP: ['php'],
  Laravel: ['laravel'],
  Ruby: ['ruby'],
  Rails: ['rails', 'ruby on rails'],
  Swift: ['swift'],
  Flutter: ['flutter'],
  Dart: ['dart'],
  SQL: ['sql'],
  PostgreSQL: ['postgresql', 'postgres'],
  MySQL: ['mysql'],
  MongoDB: ['mongodb', 'mongo', 'mongoose'],
  Redis: ['redis'],
  Elasticsearch: ['elasticsearch', 'elastic search'],
  Kafka: ['kafka'],
  RabbitMQ: ['rabbitmq'],
  AWS: ['aws', 'amazon web services'],
  Azure: ['azure'],
  GCP: ['gcp', 'google cloud'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s'],
  Terraform: ['terraform'],
  'CI/CD': ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  'GitHub Actions': ['github actions'],
  Jenkins: ['jenkins'],
  Git: ['git'],
  Linux: ['linux'],
  Microservices: ['microservices', 'microservice'],
  Serverless: ['serverless', 'lambda'],
  Jest: ['jest'],
  Cypress: ['cypress'],
  Playwright: ['playwright'],
  'Unit Testing': ['unit testing', 'unit tests', 'tdd', 'test-driven'],
  Storybook: ['storybook'],
  Webpack: ['webpack'],
  Vite: ['vite'],
  Accessibility: ['accessibility', 'a11y', 'wcag'],
  'Performance Optimization': ['performance optimization', 'web performance', 'core web vitals'],
  'Machine Learning': ['machine learning', 'ml'],
  'Deep Learning': ['deep learning'],
  PyTorch: ['pytorch'],
  TensorFlow: ['tensorflow'],
  LLMs: ['llm', 'llms', 'large language models', 'generative ai', 'genai'],
  'Data Analysis': ['data analysis', 'data analytics'],
  Pandas: ['pandas'],
  Spark: ['spark', 'pyspark'],
  Figma: ['figma'],
  'UI/UX': ['ui/ux', 'ux', 'user experience'],
  Agile: ['agile', 'scrum', 'kanban'],
  'System Design': ['system design', 'distributed systems'],
  Security: ['security', 'owasp', 'oauth', 'jwt'],
  Leadership: ['leadership', 'mentoring', 'mentorship', 'team lead'],
  Communication: ['communication', 'stakeholder management'],
};

const STOPWORDS = new Set(
  ('a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our ' +
    'they their this these those who what which when where how all any can may must should would could about into over ' +
    'more most other such than then also not but if so do does did using use used work working team role job company ' +
    'experience years year strong excellent good great ability skills skill knowledge including etc plus well within ' +
    'across new looking candidate responsibilities requirements required preferred qualifications based help build ' +
    'building join us ensure develop developing development').split(' ')
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Word-boundary match that tolerates symbols like '.', '#', '+', '/' inside aliases.
const aliasPattern = (alias: string) => new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(alias)}(?=$|[^a-z0-9+#])`, 'g');

const countAlias = (text: string, aliases: string[]) =>
  aliases.reduce((sum, alias) => sum + (text.match(aliasPattern(alias))?.length ?? 0), 0);

const hasWholeWord = (normalizedText: string, word: string): boolean =>
  Boolean(word) && aliasPattern(word).test(normalizedText);

const countContextualGo = (rawText: string): number => {
  let count = 0;
  const pattern = /(^|[^A-Za-z0-9+#.-])(Go|go)(?=$|[^A-Za-z0-9+#-])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawText)) !== null) {
    const token = match[2];
    const tokenStart = match.index + match[1].length;
    const before = rawText.slice(0, tokenStart);
    const after = rawText.slice(tokenStart + token.length);

    if (token === 'Go') {
      if (
        /^\s+(?:to|the|beyond|above|ahead|live|extra|further|back|out|over|into|through|around|away|wrong|smoothly|forward|hand|mile)\b/i.test(
          after
        )
      ) {
        continue;
      }
      const atSentenceStart = /^\s*$/.test(before) || /(?:[.!?]\s+|\n\s*)$/.test(before);
      if (atSentenceStart) {
        if (
          after.trim() === '' ||
          /^(?:\s*(?:,|\/|;|:|\)|\]|\(|\+|\d+(?:\.\d+)?)|\s+(?:and|or|developer|developers|engineer|engineers|engineering|programming|language|microservices|microservice|services|service|backend|backends|api|apis|sdk|runtime|goroutines|concurrency|experience|skills?|stack|cli|modules?|packages?)\b)/i.test(
            after
          )
        ) {
          count += 1;
        }
      } else {
        count += 1;
      }
    } else if (
      /^\s+\d+\.\d+\b/.test(after) ||
      /(?:python|rust|java|c\+\+|c#|typescript|javascript|node(?:\.js)?|kotlin|ruby|scala|docker|kubernetes|k8s|grpc|postgres(?:ql)?)\s*(?:\/|,\s*(?:and\s+|or\s+)?)\s*$/i.test(
        before
      ) ||
      /^\s*(?:\/|,\s*(?:and\s+|or\s+)?)\s*(?:python|rust|java|c\+\+|c#|typescript|javascript|node(?:\.js)?|kotlin|ruby|scala|docker|kubernetes|k8s|grpc|postgres(?:ql)?)\b/i.test(
        after
      ) ||
      /\b(?:written|programmed|coded|implemented|built\s+(?:microservices|services|apis|backends?))\s+in\s+$/i.test(
        before
      )
    ) {
      count += 1;
    }
  }
  return count;
};

const countContextualExpress = (rawText: string): number => {
  let count = 0;
  const pattern = /(^|[^A-Za-z0-9+#.-])(Express|express)(?=$|[^A-Za-z0-9+#-])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawText)) !== null) {
    const token = match[2];
    const tokenStart = match.index + match[1].length;
    const before = rawText.slice(0, tokenStart);
    const after = rawText.slice(tokenStart + token.length);

    // Avoid double-counting express.js / expressjs which are matched via SKILL_DICTIONARY.Express
    if (/^\.?js\b/i.test(after)) {
      continue;
    }

    if (token === 'Express') {
      if (/\b(?:American|Federal|Panda|Polar|Orient|Pony)\s+$/i.test(before)) {
        continue;
      }
      if (
        /^\s+(?:gratitude|interest|concern|concerns|yourself|yourselves|themselves|ourselves|your|our|their|my|his|her|opinions?|views?|appreciation|sympathy|thanks|feelings?|ideas?|thoughts?|regret|excitement|enthusiasm|support\s+for)\b/i.test(
          after
        )
      ) {
        continue;
      }
      const atSentenceStart = /^\s*$/.test(before) || /(?:[.!?]\s+|\n\s*)$/.test(before);
      if (atSentenceStart) {
        if (
          after.trim() === '' ||
          /^(?:\s*(?:,|\/|;|:|\)|\]|\(|\+|\d+)|\s+(?:and|or|middleware|router|routes|server|servers|api|apis|rest|backend|backends|app|apps|application|applications|framework|service|services|experience|skills?|stack)\b)/i.test(
            after
          )
        ) {
          count += 1;
        }
      } else {
        count += 1;
      }
    } else if (
      /(?:node(?:\.js|js)?|nestjs|fastify|koa|hapi|mern|mean|mongodb|mongoose|prisma|postgres(?:ql)?|react|typescript|javascript|graphql|rest(?:\s+apis?)?)\s*(?:,|\/|\+|&|\band\b|\bor\b|\bwith\b)\s*$/i.test(
        before
      ) ||
      /^\s*(?:\/|,\s*(?:and\s+|or\s+)?)\s*(?:node(?:\.js|js)?|nestjs|fastify|koa|mongodb|mongoose|prisma|postgres(?:ql)?|mysql|redis|graphql|typescript|javascript|react)\b/i.test(
        after
      ) ||
      /^\s+(?:middleware|router|routes|server|servers|framework)\b/i.test(after)
    ) {
      count += 1;
    }
  }
  return count;
};

const countSkillOccurrences = (
  rawText: string,
  normalizedText: string,
  keyword: string,
  aliases: string[],
  skillsSectionNormalizedText = ''
): number => {
  let total = countAlias(normalizedText, aliases);
  if (keyword === 'Go') {
    total += countContextualGo(rawText);
    if (total === 0 && skillsSectionNormalizedText) {
      total += countAlias(skillsSectionNormalizedText, ['go']);
    }
  } else if (keyword === 'Express') {
    total += countContextualExpress(rawText);
    if (total === 0 && skillsSectionNormalizedText) {
      total += countAlias(skillsSectionNormalizedText, ['express']);
    }
  }
  return total;
};

const collectVisibleStrings = (value: unknown, out: string[]): void => {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectVisibleStrings(item, out));
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.enabled === false) return;
    Object.entries(record).forEach(([key, item]) => {
      if (IGNORED_OBJECT_KEYS.has(key)) return;
      collectVisibleStrings(item, out);
    });
  }
};

const getOrderedVisibleSections = (resume: ResumeLike): ResumeSectionLike[] => {
  const sections = resume.content?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return [];
  const sectionOrder = resume.content?.sectionOrder;
  if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) {
    return sections.filter((s): s is ResumeSectionLike => Boolean(s) && s.enabled !== false);
  }
  const seenIds = new Set<string>();
  const fromOrder: ResumeSectionLike[] = [];
  for (const id of sectionOrder) {
    if (typeof id !== 'string' || seenIds.has(id)) continue;
    const match = sections.find((s) => s && s.id === id);
    if (match) {
      seenIds.add(id);
      if (match.enabled !== false) {
        fromOrder.push(match);
      }
    }
  }
  const remaining = sections.filter((s) => {
    if (!s || s.enabled === false) return false;
    const secId = typeof s.id === 'string' ? s.id : '';
    if (secId && seenIds.has(secId)) return false;
    if (secId) seenIds.add(secId);
    return true;
  });
  return [...fromOrder, ...remaining];
};

const resolveSectionKind = (section: ResumeSectionLike): 'work' | 'projects' | 'skills' | 'other' => {
  const candidates = [section.type, section.id, section.title].map((v) =>
    typeof v === 'string' ? v.trim().toLowerCase() : ''
  );
  for (const token of candidates) {
    if (!token) continue;
    if (WORK_SECTION_TOKENS.has(token)) return 'work';
    if (PROJECT_SECTION_TOKENS.has(token)) return 'projects';
    if (SKILL_SECTION_TOKENS.has(token)) return 'skills';
  }
  return 'other';
};

const getVisibleSectionContent = (section: ResumeSectionLike): string[] => {
  const out: string[] = [];
  if (typeof section.content === 'string') {
    if (section.content.trim()) {
      out.push(section.content);
    }
    return out;
  }
  if (!Array.isArray(section.content)) return out;
  const visibleItems = section.content.filter(
    (item) =>
      item !== null &&
      item !== undefined &&
      (typeof item !== 'object' || (item as Record<string, unknown>).enabled !== false)
  );
  if (visibleItems.length === 0) return out;
  collectVisibleStrings(visibleItems, out);
  return out;
};

const normalize = (text: string) => ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

const sectionText = (resume: ResumeLike, types: string[]) => {
  const out: string[] = [];
  getOrderedVisibleSections(resume)
    .filter((s) => {
      const kind = resolveSectionKind(s);
      if (kind === 'work' && (types.includes('work') || types.includes('experience'))) {
        return true;
      }
      if (kind === 'projects' && types.includes('project')) {
        return true;
      }
      const combined = `${s.type ?? ''} ${s.id ?? ''} ${s.title ?? ''}`.toLowerCase();
      return types.some((t) => combined.includes(t));
    })
    .forEach((s) => {
      out.push(...getVisibleSectionContent(s));
    });
  return out.join(' ');
};

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const scoreLabel = (score: number): JobMatchResult['label'] => {
  if (score >= 85) return 'Excellent match';
  if (score >= 65) return 'Good match';
  if (score >= 40) return 'Fair match';
  return 'Low match';
};

export const analyzeJobMatch = (
  resume: ResumeLike,
  jobDescription: string,
  jobTitle?: string
): JobMatchResult => {
  const jd = normalize(jobDescription);

  const visibleSections = getOrderedVisibleSections(resume);
  const resumeStrings: string[] = [];
  const basics = resume.content?.basics;
  const basicsVisible = !basics || basics.enabled !== false;

  if (basics && basicsVisible) {
    collectVisibleStrings(basics, resumeStrings);
  }
  if (resume.summary) {
    resumeStrings.push(resume.summary);
  }

  const skillsSectionStrings: string[] = [];
  visibleSections.forEach((section) => {
    const contentStrings = getVisibleSectionContent(section);
    if (contentStrings.length > 0) {
      if (section.title) {
        resumeStrings.push(section.title);
      }
      resumeStrings.push(...contentStrings);
      if (resolveSectionKind(section) === 'skills') {
        skillsSectionStrings.push(...contentStrings);
      }
    }
  });

  const rawResumeText = resumeStrings.join(' ');
  const resumeText = normalize(rawResumeText);
  const skillsSectionText = skillsSectionStrings.length ? normalize(skillsSectionStrings.join(' ')) : '';

  const rawSummaryText = `${resume.summary ?? ''} ${basicsVisible ? basics?.summary ?? '' : ''}`;
  const summaryText = normalize(rawSummaryText);
  const experienceText = normalize(sectionText(resume, ['work', 'experience', 'project']));

  const requiredSkills = Object.entries(SKILL_DICTIONARY)
    .map(([keyword, aliases]) => ({
      keyword,
      aliases,
      occurrences: countSkillOccurrences(jobDescription, jd, keyword, aliases),
    }))
    .filter((s) => s.occurrences > 0)
    .sort((a, b) => b.occurrences - a.occurrences);

  const matched = requiredSkills.filter(
    (s) => countSkillOccurrences(rawResumeText, resumeText, s.keyword, s.aliases, skillsSectionText) > 0
  );
  const missing = requiredSkills.filter(
    (s) => countSkillOccurrences(rawResumeText, resumeText, s.keyword, s.aliases, skillsSectionText) === 0
  );

  // Experience keywords: non-skill JD terms repeated at least twice, checked against resume text on whole-word boundaries.
  const skillAliasSet = new Set([
    ...Object.values(SKILL_DICTIONARY).flat(),
    ...requiredSkills.map((s) => s.keyword.toLowerCase()),
  ]);
  const termCounts = new Map<string, number>();
  tokenize(jobDescription)
    .filter((t) => !skillAliasSet.has(t))
    .forEach((t) => termCounts.set(t, (termCounts.get(t) ?? 0) + 1));
  const experienceTerms = [...termCounts.entries()].filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 25);
  const experienceHits = experienceTerms.filter((t) => hasWholeWord(resumeText, t)).length;

  const titleTokens = tokenize(jobTitle ?? '');
  const resumeTitleText = normalize(
    `${resume.title ?? ''} ${basicsVisible ? basics?.label ?? '' : ''} ${sectionText(resume, ['work', 'experience'])}`
  );
  const titleHits = titleTokens.filter((t) => hasWholeWord(resumeTitleText, t)).length;

  const breakdown: JobMatchBreakdown = {
    skills: percent(matched.length, requiredSkills.length),
    experience: percent(experienceHits, experienceTerms.length),
    title: percent(titleHits, titleTokens.length),
  };

  const hasExtractableRequirements = requiredSkills.length > 0 || experienceTerms.length > 0;
  const weights = {
    skills: requiredSkills.length > 0 ? 0.6 : 0,
    experience: experienceTerms.length > 0 ? 0.25 : 0,
    title: titleTokens.length > 0 ? 0.15 : 0,
  };
  const weightTotal = weights.skills + weights.experience + weights.title;
  const score =
    !hasExtractableRequirements || weightTotal === 0
      ? 0
      : Math.round(
          (breakdown.skills * weights.skills +
            breakdown.experience * weights.experience +
            breakdown.title * weights.title) /
            weightTotal
        );

  const suggestions: string[] = [];
  missing.slice(0, 4).forEach((s) => {
    const times = s.occurrences > 1 ? ` — the job description mentions it ${s.occurrences} times` : '';
    suggestions.push(`Add ${s.keyword} to your Skills section if you have experience with it${times}.`);
  });
  const topSkill = requiredSkills[0];
  if (
    topSkill &&
    countSkillOccurrences(rawSummaryText, summaryText, topSkill.keyword, topSkill.aliases) === 0 &&
    countSkillOccurrences(rawResumeText, resumeText, topSkill.keyword, topSkill.aliases, skillsSectionText) > 0
  ) {
    suggestions.push(`Mention ${topSkill.keyword} in your summary — it's the most frequent skill in this job description.`);
  }
  if (!experienceText.trim()) {
    suggestions.push('Add a Work Experience or Projects section so recruiters can see where you used these skills.');
  } else if (breakdown.experience < 50 && experienceTerms.length) {
    const missingTerms = experienceTerms.filter((t) => !hasWholeWord(resumeText, t)).slice(0, 3);
    if (missingTerms.length) {
      suggestions.push(`Reflect the job's language in your experience bullets, e.g. "${missingTerms.join('", "')}".`);
    }
  }
  if (titleTokens.length && breakdown.title < 50) {
    suggestions.push(`Align your headline with the role title "${jobTitle?.trim()}".`);
  }

  const toKeyword = ({ keyword, occurrences }: { keyword: string; occurrences: number }) => ({ keyword, occurrences });

  return {
    score,
    label: scoreLabel(score),
    breakdown,
    matchedKeywords: matched.map(toKeyword),
    missingKeywords: missing.map(toKeyword),
    suggestions,
    totals: { matched: matched.length, required: requiredSkills.length },
  };
};

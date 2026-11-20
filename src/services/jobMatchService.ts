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

interface ResumeLike {
  title?: string;
  summary?: string;
  content?: {
    basics?: { label?: string; summary?: string; [key: string]: unknown };
    sections?: Array<{ id?: string; type?: string; title?: string; content?: unknown[] }>;
  };
}

// Canonical skill -> aliases (all lowercase); aliases are matched as whole words/phrases.
export const SKILL_DICTIONARY: Record<string, string[]> = {
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

const collectStrings = (value: unknown, out: string[]): void => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
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
  (resume.content?.sections ?? [])
    .filter((s) => types.some((t) => `${s.type ?? ''} ${s.id ?? ''} ${s.title ?? ''}`.toLowerCase().includes(t)))
    .forEach((s) => collectStrings(s.content, out));
  return out.join(' ');
};

const percent = (part: number, whole: number) => (whole === 0 ? 100 : Math.round((part / whole) * 100));

const scoreLabel = (score: number): JobMatchResult['label'] => {
  if (score >= 85) return 'Excellent match';
  if (score >= 65) return 'Good match';
  if (score >= 40) return 'Fair match';
  return 'Low match';
};

export const extractSkillsFromText = (text: string): string[] => {
  if (typeof text !== 'string' || !text.trim()) return [];
  const normalized = normalize(text);
  return Object.entries(SKILL_DICTIONARY)
    .map(([keyword, aliases]) => ({ keyword, occurrences: countAlias(normalized, aliases) }))
    .filter((entry) => entry.occurrences > 0)
    .sort((a, b) => b.occurrences - a.occurrences)
    .map((entry) => entry.keyword);
};

export const analyzeJobMatch = (
  resume: ResumeLike,
  jobDescription: string,
  jobTitle?: string
): JobMatchResult => {
  const jd = normalize(jobDescription);

  const resumeStrings: string[] = [];
  collectStrings(resume.content, resumeStrings);
  if (resume.summary) resumeStrings.push(resume.summary);
  const resumeText = normalize(resumeStrings.join(' '));
  const summaryText = normalize(`${resume.summary ?? ''} ${resume.content?.basics?.summary ?? ''}`);
  const experienceText = normalize(sectionText(resume, ['work', 'experience', 'project']));

  const requiredSkills = Object.entries(SKILL_DICTIONARY)
    .map(([keyword, aliases]) => ({ keyword, aliases, occurrences: countAlias(jd, aliases) }))
    .filter((s) => s.occurrences > 0)
    .sort((a, b) => b.occurrences - a.occurrences);

  const matched = requiredSkills.filter((s) => countAlias(resumeText, s.aliases) > 0);
  const missing = requiredSkills.filter((s) => countAlias(resumeText, s.aliases) === 0);

  // Experience keywords: non-skill JD terms repeated at least twice, checked against resume text.
  const skillAliasSet = new Set(Object.values(SKILL_DICTIONARY).flat());
  const termCounts = new Map<string, number>();
  tokenize(jobDescription)
    .filter((t) => !skillAliasSet.has(t))
    .forEach((t) => termCounts.set(t, (termCounts.get(t) ?? 0) + 1));
  const experienceTerms = [...termCounts.entries()].filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 25);
  const experienceHits = experienceTerms.filter((t) => resumeText.includes(t)).length;

  const titleTokens = tokenize(jobTitle ?? '');
  const resumeTitleText = normalize(
    `${resume.title ?? ''} ${resume.content?.basics?.label ?? ''} ${sectionText(resume, ['work', 'experience'])}`
  );
  const titleHits = titleTokens.filter((t) => resumeTitleText.includes(t)).length;

  const breakdown: JobMatchBreakdown = {
    skills: percent(matched.length, requiredSkills.length),
    experience: percent(experienceHits, experienceTerms.length),
    title: percent(titleHits, titleTokens.length),
  };

  const weights = { skills: 0.6, experience: 0.25, title: titleTokens.length ? 0.15 : 0 };
  const weightTotal = weights.skills + weights.experience + weights.title;
  const score = Math.round(
    (breakdown.skills * weights.skills + breakdown.experience * weights.experience + breakdown.title * weights.title) /
      weightTotal
  );

  const suggestions: string[] = [];
  missing.slice(0, 4).forEach((s) => {
    const times = s.occurrences > 1 ? ` — the job description mentions it ${s.occurrences} times` : '';
    suggestions.push(`Add ${s.keyword} to your Skills section if you have experience with it${times}.`);
  });
  const topSkill = requiredSkills[0];
  if (topSkill && countAlias(summaryText, topSkill.aliases) === 0 && countAlias(resumeText, topSkill.aliases) > 0) {
    suggestions.push(`Mention ${topSkill.keyword} in your summary — it's the most frequent skill in this job description.`);
  }
  if (!experienceText.trim()) {
    suggestions.push('Add a Work Experience or Projects section so recruiters can see where you used these skills.');
  } else if (breakdown.experience < 50 && experienceTerms.length) {
    const missingTerms = experienceTerms.filter((t) => !resumeText.includes(t)).slice(0, 3);
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

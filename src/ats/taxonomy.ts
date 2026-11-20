export type SkillCategory =
  | 'Languages'
  | 'Frontend'
  | 'Backend'
  | 'Databases'
  | 'Cloud'
  | 'DevOps'
  | 'AI/ML'
  | 'Messaging'
  | 'Data Engineering'
  | 'Testing'
  | 'Mobile'
  | 'Security'
  | 'Tools'
  | 'Practices';

export interface SkillDefinition {
  canonical: string;
  category: SkillCategory;
  /** Case-insensitive aliases (matched as whole-token spans). */
  aliases: string[];
  /** Case-sensitive aliases requiring exact token casing (e.g., 'Go', 'Express', 'RAG'). */
  caseSensitiveAliases?: string[];
  /** Adjacent / transferable canonical skills in the same technical domain. */
  adjacentSkills?: string[];
}

export interface TextToken {
  raw: string;
  lower: string;
  start: number;
  end: number;
  isSentenceStart: boolean;
}

export interface TaxonomyMatch {
  canonical: string;
  category: SkillCategory;
  occurrences: number;
  spans: Array<{ startToken: number; endToken: number; matchedText: string }>;
}

const GO_IMPERATIVE_FOLLOWERS = new Set([
  'to',
  'the',
  'ahead',
  'beyond',
  'above',
  'extra',
  'through',
  'into',
  'out',
  'back',
  'forward',
  'over',
  'around',
  'away',
  'down',
  'up',
  'home',
  'deep',
  'far',
  'further',
  'live',
  'viral',
  'big',
  'from',
]);

const GO_NON_TECH_PREDECESSORS = new Set([
  'pokemon',
  'pokémon',
  'lets',
  "let's",
]);

const EXPRESS_NON_TECH_PREDECESSORS = new Set([
  'american',
  'adobe',
  'panda',
  'fedex',
  'orient',
  'polar',
  'pony',
  'ali',
  'outlook',
  'planet',
]);

const EXPRESS_NON_TECH_FOLLOWERS = new Set([
  'gratitude',
  'thanks',
  'interest',
  'opinions',
  'opinion',
  'ideas',
  'concerns',
  'yourself',
  'themselves',
  'ourselves',
  'appreciation',
  'sympathy',
  'your',
  'our',
  'their',
  'my',
  'scripts',
  'delivery',
  'shipping',
  'mail',
  'lane',
  'lanes',
  'card',
  'cards',
  'checkout',
]);

const SPRING_NON_TECH_PREDECESSORS = new Set([
  'in',
  'this',
  'last',
  'next',
  'every',
  'early',
  'late',
  'during',
]);

const SPRING_NON_TECH_FOLLOWERS = new Set([
  'season',
  'break',
  'semester',
  'quarter',
  'term',
  'cleaning',
  'water',
]);

const SWIFT_NON_TECH_FOLLOWERS = new Set([
  'action',
  'response',
  'resolution',
  'recovery',
  'transition',
  'delivery',
]);

const RUST_NON_TECH_FOLLOWERS = new Set([
  'belt',
  'prevention',
  'removal',
]);

export const SKILL_TAXONOMY: SkillDefinition[] = [
  // ======================== LANGUAGES (38) ========================
  {
    canonical: 'JavaScript',
    category: 'Languages',
    aliases: ['javascript', 'js', 'es6', 'es2015', 'es2020', 'es2022', 'ecmascript'],
    adjacentSkills: ['TypeScript', 'Node.js', 'HTML', 'CSS'],
  },
  {
    canonical: 'TypeScript',
    category: 'Languages',
    aliases: ['typescript', 'ts'],
    adjacentSkills: ['JavaScript', 'Node.js', 'React', 'Angular'],
  },
  {
    canonical: 'Python',
    category: 'Languages',
    aliases: ['python', 'python3', 'cpython'],
    adjacentSkills: ['FastAPI', 'Django', 'Flask', 'Go', 'Java'],
  },
  {
    canonical: 'Java',
    category: 'Languages',
    aliases: ['java', 'jdk', 'jvm', 'j2ee', 'jakarta ee'],
    adjacentSkills: ['Kotlin', 'Spring Boot', 'Scala', 'C#'],
  },
  {
    canonical: 'Go',
    category: 'Languages',
    aliases: ['golang', 'goroutines'],
    caseSensitiveAliases: ['Go'],
    adjacentSkills: ['Rust', 'Python', 'Java', 'C++', 'gRPC'],
  },
  {
    canonical: 'Rust',
    category: 'Languages',
    aliases: ['rustlang', 'cargo'],
    caseSensitiveAliases: ['Rust'],
    adjacentSkills: ['Go', 'C++', 'C', 'WebAssembly'],
  },
  {
    canonical: 'C#',
    category: 'Languages',
    aliases: ['c#', 'csharp'],
    adjacentSkills: ['.NET', 'ASP.NET Core', 'Java', 'F#'],
  },
  {
    canonical: 'C++',
    category: 'Languages',
    aliases: ['c++', 'cpp', 'c++17', 'c++20'],
    adjacentSkills: ['C', 'Rust', 'CUDA'],
  },
  {
    canonical: 'C',
    category: 'Languages',
    aliases: ['ansi c', 'c99', 'c11', 'embedded c'],
    caseSensitiveAliases: ['C'],
    adjacentSkills: ['C++', 'Rust', 'Embedded Systems'],
  },
  {
    canonical: 'Kotlin',
    category: 'Languages',
    aliases: ['kotlin'],
    adjacentSkills: ['Java', 'Spring Boot', 'Android', 'Jetpack Compose'],
  },
  {
    canonical: 'Swift',
    category: 'Languages',
    aliases: ['swiftlang'],
    caseSensitiveAliases: ['Swift'],
    adjacentSkills: ['SwiftUI', 'Objective-C', 'iOS', 'Kotlin'],
  },
  {
    canonical: 'Objective-C',
    category: 'Languages',
    aliases: ['objective-c', 'objective c', 'objc'],
    adjacentSkills: ['Swift', 'iOS'],
  },
  {
    canonical: 'Dart',
    category: 'Languages',
    aliases: ['dart', 'dartlang'],
    adjacentSkills: ['Flutter', 'TypeScript', 'Kotlin'],
  },
  {
    canonical: 'PHP',
    category: 'Languages',
    aliases: ['php', 'php8'],
    adjacentSkills: ['Laravel', 'Symfony', 'WordPress'],
  },
  {
    canonical: 'Ruby',
    category: 'Languages',
    aliases: ['ruby'],
    adjacentSkills: ['Rails', 'Python'],
  },
  {
    canonical: 'Scala',
    category: 'Languages',
    aliases: ['scala'],
    adjacentSkills: ['Java', 'Kotlin', 'Spark', 'Akka'],
  },
  {
    canonical: 'Elixir',
    category: 'Languages',
    aliases: ['elixir', 'erlang', 'otp'],
    adjacentSkills: ['Phoenix', 'Go', 'RabbitMQ'],
  },
  {
    canonical: 'Clojure',
    category: 'Languages',
    aliases: ['clojure', 'clojurescript'],
    adjacentSkills: ['Java', 'Scala', 'Haskell'],
  },
  {
    canonical: 'Haskell',
    category: 'Languages',
    aliases: ['haskell'],
    adjacentSkills: ['Scala', 'OCaml', 'Rust'],
  },
  {
    canonical: 'OCaml',
    category: 'Languages',
    aliases: ['ocaml', 'reasonml'],
    adjacentSkills: ['Haskell', 'Rust', 'F#'],
  },
  {
    canonical: 'F#',
    category: 'Languages',
    aliases: ['f#', 'fsharp'],
    adjacentSkills: ['C#', '.NET', 'OCaml'],
  },
  {
    canonical: 'SQL',
    category: 'Languages',
    aliases: ['sql', 'ansi sql', 'tsql', 't-sql', 'pl/sql', 'plpgsql'],
    adjacentSkills: ['PostgreSQL', 'MySQL', 'SQLite', 'ClickHouse'],
  },
  {
    canonical: 'Bash',
    category: 'Languages',
    aliases: ['bash', 'shell scripting', 'zsh', 'posix shell', 'sh scripting'],
    adjacentSkills: ['Linux', 'Python', 'PowerShell'],
  },
  {
    canonical: 'PowerShell',
    category: 'Languages',
    aliases: ['powershell', 'pwsh'],
    adjacentSkills: ['Bash', 'Azure', 'Windows Server'],
  },
  {
    canonical: 'R',
    category: 'Languages',
    aliases: ['rlang', 'r programming', 'rstudio', 'tidyverse'],
    caseSensitiveAliases: ['R'],
    adjacentSkills: ['Python', 'Pandas', 'Data Analysis', 'MATLAB'],
  },
  {
    canonical: 'MATLAB',
    category: 'Languages',
    aliases: ['matlab', 'simulink'],
    adjacentSkills: ['Python', 'NumPy', 'SciPy', 'R'],
  },
  {
    canonical: 'Julia',
    category: 'Languages',
    aliases: ['julialang', 'julia programming'],
    adjacentSkills: ['Python', 'MATLAB', 'R'],
  },
  {
    canonical: 'Lua',
    category: 'Languages',
    aliases: ['lua', 'luajit'],
    adjacentSkills: ['C', 'Python', 'Nginx'],
  },
  {
    canonical: 'Perl',
    category: 'Languages',
    aliases: ['perl'],
    adjacentSkills: ['Bash', 'Python', 'Linux'],
  },
  {
    canonical: 'Groovy',
    category: 'Languages',
    aliases: ['groovy'],
    adjacentSkills: ['Java', 'Gradle', 'Jenkins'],
  },
  {
    canonical: 'Zig',
    category: 'Languages',
    aliases: ['ziglang'],
    caseSensitiveAliases: ['Zig'],
    adjacentSkills: ['C', 'C++', 'Rust'],
  },
  {
    canonical: 'Solidity',
    category: 'Languages',
    aliases: ['solidity'],
    adjacentSkills: ['Web3', 'Ethereum', 'Rust', 'TypeScript'],
  },
  {
    canonical: 'WebAssembly',
    category: 'Languages',
    aliases: ['webassembly', 'wasm'],
    adjacentSkills: ['Rust', 'C++', 'TypeScript'],
  },
  {
    canonical: 'HTML',
    category: 'Languages',
    aliases: ['html', 'html5', 'semantic html'],
    adjacentSkills: ['CSS', 'JavaScript', 'Accessibility'],
  },
  {
    canonical: 'CSS',
    category: 'Languages',
    aliases: ['css', 'css3', 'flexbox', 'css grid'],
    adjacentSkills: ['HTML', 'Sass', 'Tailwind CSS'],
  },
  {
    canonical: 'GraphQL',
    category: 'Languages',
    aliases: ['graphql', 'gql'],
    adjacentSkills: ['REST APIs', 'Apollo', 'gRPC', 'TypeScript'],
  },
  {
    canonical: 'Protocol Buffers',
    category: 'Languages',
    aliases: ['protobuf', 'protocol buffers', 'proto3'],
    adjacentSkills: ['gRPC', 'Go', 'Avro'],
  },
  {
    canonical: 'YAML',
    category: 'Languages',
    aliases: ['yaml'],
    adjacentSkills: ['Kubernetes', 'GitHub Actions', 'Helm'],
  },

  // ======================== FRONTEND (45) ========================
  {
    canonical: 'React',
    category: 'Frontend',
    aliases: ['react', 'reactjs', 'react.js', 'react 18', 'react 19'],
    adjacentSkills: ['Next.js', 'TypeScript', 'Redux', 'Vue', 'Angular'],
  },
  {
    canonical: 'Next.js',
    category: 'Frontend',
    aliases: ['next.js', 'nextjs', 'next js'],
    adjacentSkills: ['React', 'Remix', 'TypeScript', 'Vercel'],
  },
  {
    canonical: 'Vue',
    category: 'Frontend',
    aliases: ['vue', 'vuejs', 'vue.js', 'vue 3', 'vuex', 'pinia'],
    adjacentSkills: ['Nuxt.js', 'React', 'Svelte', 'Angular'],
  },
  {
    canonical: 'Nuxt.js',
    category: 'Frontend',
    aliases: ['nuxt', 'nuxt.js', 'nuxtjs'],
    adjacentSkills: ['Vue', 'Next.js', 'TypeScript'],
  },
  {
    canonical: 'Angular',
    category: 'Frontend',
    aliases: ['angular', 'angularjs', 'ngrx'],
    adjacentSkills: ['TypeScript', 'RxJS', 'React', 'Vue'],
  },
  {
    canonical: 'Svelte',
    category: 'Frontend',
    aliases: ['svelte', 'sveltekit'],
    adjacentSkills: ['React', 'Vue', 'SolidJS', 'Astro'],
  },
  {
    canonical: 'SolidJS',
    category: 'Frontend',
    aliases: ['solidjs', 'solid.js'],
    adjacentSkills: ['React', 'Svelte', 'TypeScript'],
  },
  {
    canonical: 'Astro',
    category: 'Frontend',
    aliases: ['astrojs', 'astro.build'],
    caseSensitiveAliases: ['Astro'],
    adjacentSkills: ['Next.js', 'Svelte', 'React'],
  },
  {
    canonical: 'Remix',
    category: 'Frontend',
    aliases: ['remix.run', 'remix js'],
    caseSensitiveAliases: ['Remix'],
    adjacentSkills: ['React', 'Next.js', 'React Router'],
  },
  {
    canonical: 'Gatsby',
    category: 'Frontend',
    aliases: ['gatsby', 'gatsbyjs'],
    adjacentSkills: ['React', 'GraphQL', 'Next.js'],
  },
  {
    canonical: 'Preact',
    category: 'Frontend',
    aliases: ['preact'],
    adjacentSkills: ['React', 'JavaScript'],
  },
  {
    canonical: 'jQuery',
    category: 'Frontend',
    aliases: ['jquery'],
    adjacentSkills: ['JavaScript', 'HTML', 'CSS'],
  },
  {
    canonical: 'Redux',
    category: 'Frontend',
    aliases: ['redux', 'redux toolkit', 'rtk'],
    adjacentSkills: ['React', 'Zustand', 'MobX', 'React Query'],
  },
  {
    canonical: 'Zustand',
    category: 'Frontend',
    aliases: ['zustand'],
    adjacentSkills: ['Redux', 'Jotai', 'React'],
  },
  {
    canonical: 'MobX',
    category: 'Frontend',
    aliases: ['mobx'],
    adjacentSkills: ['Redux', 'Zustand', 'React'],
  },
  {
    canonical: 'Recoil',
    category: 'Frontend',
    aliases: ['recoiljs'],
    caseSensitiveAliases: ['Recoil'],
    adjacentSkills: ['Jotai', 'Zustand', 'Redux', 'React'],
  },
  {
    canonical: 'Jotai',
    category: 'Frontend',
    aliases: ['jotai'],
    adjacentSkills: ['Zustand', 'Recoil', 'React'],
  },
  {
    canonical: 'React Query',
    category: 'Frontend',
    aliases: ['react query', 'react-query', 'tanstack query'],
    adjacentSkills: ['SWR', 'Apollo', 'React', 'Redux'],
  },
  {
    canonical: 'SWR',
    category: 'Frontend',
    aliases: ['vercel swr'],
    caseSensitiveAliases: ['SWR'],
    adjacentSkills: ['React Query', 'Next.js', 'React'],
  },
  {
    canonical: 'Apollo',
    category: 'Frontend',
    aliases: ['apollo client', 'apollo server', 'apollo graphql'],
    adjacentSkills: ['GraphQL', 'React Query', 'Relay'],
  },
  {
    canonical: 'Relay',
    category: 'Frontend',
    aliases: ['relay graphql', 'react relay'],
    caseSensitiveAliases: ['Relay'],
    adjacentSkills: ['GraphQL', 'Apollo', 'React'],
  },
  {
    canonical: 'RxJS',
    category: 'Frontend',
    aliases: ['rxjs'],
    adjacentSkills: ['Angular', 'TypeScript'],
  },
  {
    canonical: 'Tailwind CSS',
    category: 'Frontend',
    aliases: ['tailwind', 'tailwindcss', 'tailwind css'],
    adjacentSkills: ['CSS', 'Sass', 'PostCSS', 'Radix UI'],
  },
  {
    canonical: 'Sass',
    category: 'Frontend',
    aliases: ['sass', 'scss'],
    adjacentSkills: ['CSS', 'Less', 'PostCSS', 'Tailwind CSS'],
  },
  {
    canonical: 'Less',
    category: 'Frontend',
    aliases: ['lesscss', 'less.js', 'less css'],
    adjacentSkills: ['Sass', 'CSS'],
  },
  {
    canonical: 'Styled Components',
    category: 'Frontend',
    aliases: ['styled-components', 'styled components', 'css-in-js', 'emotion'],
    adjacentSkills: ['CSS', 'React', 'Tailwind CSS'],
  },
  {
    canonical: 'Material UI',
    category: 'Frontend',
    aliases: ['material ui', 'material-ui', 'mui'],
    adjacentSkills: ['Chakra UI', 'Ant Design', 'Radix UI', 'React'],
  },
  {
    canonical: 'Chakra UI',
    category: 'Frontend',
    aliases: ['chakra ui', 'chakra-ui'],
    adjacentSkills: ['Material UI', 'Radix UI', 'Tailwind CSS'],
  },
  {
    canonical: 'Ant Design',
    category: 'Frontend',
    aliases: ['ant design', 'antd'],
    adjacentSkills: ['Material UI', 'React'],
  },
  {
    canonical: 'Radix UI',
    category: 'Frontend',
    aliases: ['radix ui', 'radix-ui', 'shadcn', 'shadcn/ui'],
    adjacentSkills: ['Headless UI', 'Tailwind CSS', 'Accessibility'],
  },
  {
    canonical: 'Headless UI',
    category: 'Frontend',
    aliases: ['headless ui', 'headlessui'],
    adjacentSkills: ['Radix UI', 'Tailwind CSS', 'React'],
  },
  {
    canonical: 'Bootstrap',
    category: 'Frontend',
    aliases: ['bootstrap'],
    adjacentSkills: ['Tailwind CSS', 'CSS'],
  },
  {
    canonical: 'Storybook',
    category: 'Frontend',
    aliases: ['storybook'],
    adjacentSkills: ['Design Systems', 'React', 'Chromatic'],
  },
  {
    canonical: 'Design Systems',
    category: 'Frontend',
    aliases: ['design system', 'design systems', 'component library', 'design tokens'],
    adjacentSkills: ['Storybook', 'Figma', 'Accessibility', 'React'],
  },
  {
    canonical: 'Webpack',
    category: 'Frontend',
    aliases: ['webpack'],
    adjacentSkills: ['Vite', 'Rollup', 'esbuild', 'Turbopack'],
  },
  {
    canonical: 'Vite',
    category: 'Frontend',
    aliases: ['vite', 'vitejs'],
    adjacentSkills: ['Webpack', 'Rollup', 'esbuild'],
  },
  {
    canonical: 'Rollup',
    category: 'Frontend',
    aliases: ['rollup', 'rollup.js'],
    adjacentSkills: ['Vite', 'Webpack', 'esbuild'],
  },
  {
    canonical: 'esbuild',
    category: 'Frontend',
    aliases: ['esbuild', 'swc', 'turbopack'],
    adjacentSkills: ['Vite', 'Webpack'],
  },
  {
    canonical: 'Babel',
    category: 'Frontend',
    aliases: ['babel', 'babeljs'],
    adjacentSkills: ['Webpack', 'TypeScript', 'JavaScript'],
  },
  {
    canonical: 'Three.js',
    category: 'Frontend',
    aliases: ['three.js', 'threejs', 'webgl', 'webgpu'],
    adjacentSkills: ['D3.js', 'Canvas API', 'JavaScript'],
  },
  {
    canonical: 'D3.js',
    category: 'Frontend',
    aliases: ['d3.js', 'd3js', 'd3'],
    adjacentSkills: ['Chart.js', 'Three.js', 'Data Visualization'],
  },
  {
    canonical: 'Chart.js',
    category: 'Frontend',
    aliases: ['chart.js', 'chartjs', 'recharts', 'echarts', 'highcharts'],
    adjacentSkills: ['D3.js', 'Data Visualization'],
  },
  {
    canonical: 'Framer Motion',
    category: 'Frontend',
    aliases: ['framer motion', 'framer-motion', 'gsap'],
    adjacentSkills: ['React', 'CSS'],
  },
  {
    canonical: 'Micro-Frontends',
    category: 'Frontend',
    aliases: ['micro-frontends', 'microfrontends', 'micro frontends', 'module federation'],
    adjacentSkills: ['Webpack', 'React', 'Microservices'],
  },
  {
    canonical: 'Progressive Web Apps',
    category: 'Frontend',
    aliases: ['pwa', 'progressive web app', 'progressive web apps', 'service workers'],
    adjacentSkills: ['WebSockets', 'Performance Optimization', 'React'],
  },
  {
    canonical: 'Accessibility',
    category: 'Frontend',
    aliases: ['accessibility', 'a11y', 'wcag', 'aria', 'wai-aria'],
    adjacentSkills: ['HTML', 'UI/UX', 'Design Systems'],
  },
  {
    canonical: 'Performance Optimization',
    category: 'Frontend',
    aliases: ['performance optimization', 'web performance', 'core web vitals', 'lighthouse'],
    adjacentSkills: ['React', 'Next.js', 'CDN'],
  },

  // ======================== BACKEND (44) ========================
  {
    canonical: 'Node.js',
    category: 'Backend',
    aliases: ['node.js', 'nodejs', 'node js', 'node'],
    adjacentSkills: ['Express', 'NestJS', 'Fastify', 'TypeScript', 'Bun', 'Deno'],
  },
  {
    canonical: 'Express',
    category: 'Backend',
    aliases: ['expressjs', 'express.js', 'express js'],
    caseSensitiveAliases: ['Express'],
    adjacentSkills: ['Node.js', 'NestJS', 'Fastify', 'Koa'],
  },
  {
    canonical: 'NestJS',
    category: 'Backend',
    aliases: ['nestjs', 'nest.js', 'nest js'],
    adjacentSkills: ['Node.js', 'Express', 'TypeScript', 'Spring Boot'],
  },
  {
    canonical: 'Fastify',
    category: 'Backend',
    aliases: ['fastify'],
    adjacentSkills: ['Express', 'Node.js', 'NestJS', 'Hono'],
  },
  {
    canonical: 'Hono',
    category: 'Backend',
    aliases: ['honojs', 'hono.dev'],
    caseSensitiveAliases: ['Hono'],
    adjacentSkills: ['Express', 'Fastify', 'Cloudflare Workers'],
  },
  {
    canonical: 'Koa',
    category: 'Backend',
    aliases: ['koa', 'koajs', 'koa.js'],
    adjacentSkills: ['Express', 'Node.js'],
  },
  {
    canonical: 'Bun',
    category: 'Backend',
    aliases: ['bun.sh', 'bunjs'],
    caseSensitiveAliases: ['Bun'],
    adjacentSkills: ['Node.js', 'Deno', 'TypeScript'],
  },
  {
    canonical: 'Deno',
    category: 'Backend',
    aliases: ['deno'],
    adjacentSkills: ['Node.js', 'Bun', 'TypeScript'],
  },
  {
    canonical: 'Django',
    category: 'Backend',
    aliases: ['django', 'django rest framework', 'drf'],
    adjacentSkills: ['Python', 'FastAPI', 'Flask', 'PostgreSQL'],
  },
  {
    canonical: 'Flask',
    category: 'Backend',
    aliases: ['flask'],
    adjacentSkills: ['Python', 'FastAPI', 'Django'],
  },
  {
    canonical: 'FastAPI',
    category: 'Backend',
    aliases: ['fastapi', 'fast api'],
    adjacentSkills: ['Python', 'Flask', 'Django', 'Pydantic'],
  },
  {
    canonical: 'Pydantic',
    category: 'Backend',
    aliases: ['pydantic'],
    adjacentSkills: ['FastAPI', 'Python', 'Zod'],
  },
  {
    canonical: 'Spring Boot',
    category: 'Backend',
    aliases: ['spring boot', 'springboot'],
    adjacentSkills: ['Java', 'Spring', 'Kotlin', 'Hibernate', 'NestJS'],
  },
  {
    canonical: 'Spring',
    category: 'Backend',
    aliases: ['spring framework', 'spring mvc', 'spring cloud', 'spring security', 'spring data', 'spring webflux'],
    caseSensitiveAliases: ['Spring'],
    adjacentSkills: ['Spring Boot', 'Java', 'Hibernate'],
  },
  {
    canonical: 'Hibernate',
    category: 'Backend',
    aliases: ['hibernate', 'jpa'],
    adjacentSkills: ['Java', 'Spring Boot', 'PostgreSQL'],
  },
  {
    canonical: 'Quarkus',
    category: 'Backend',
    aliases: ['quarkus', 'micronaut'],
    adjacentSkills: ['Spring Boot', 'Java', 'Kubernetes'],
  },
  {
    canonical: '.NET',
    category: 'Backend',
    aliases: ['.net', 'dotnet', '.net core', 'dotnet core'],
    adjacentSkills: ['C#', 'ASP.NET Core', 'Entity Framework'],
  },
  {
    canonical: 'ASP.NET Core',
    category: 'Backend',
    aliases: ['asp.net', 'asp.net core', 'aspnet'],
    adjacentSkills: ['.NET', 'C#', 'SQL Server'],
  },
  {
    canonical: 'Entity Framework',
    category: 'Backend',
    aliases: ['entity framework', 'ef core'],
    adjacentSkills: ['.NET', 'C#', 'SQL Server'],
  },
  {
    canonical: 'Laravel',
    category: 'Backend',
    aliases: ['laravel'],
    adjacentSkills: ['PHP', 'Symfony', 'MySQL'],
  },
  {
    canonical: 'Symfony',
    category: 'Backend',
    aliases: ['symfony'],
    adjacentSkills: ['PHP', 'Laravel'],
  },
  {
    canonical: 'Rails',
    category: 'Backend',
    aliases: ['rails', 'ruby on rails', 'ror'],
    adjacentSkills: ['Ruby', 'Django', 'PostgreSQL'],
  },
  {
    canonical: 'Phoenix',
    category: 'Backend',
    aliases: ['phoenix framework', 'phoenix liveview'],
    caseSensitiveAliases: ['Phoenix'],
    adjacentSkills: ['Elixir', 'WebSockets'],
  },
  {
    canonical: 'Gin',
    category: 'Backend',
    aliases: ['gin-gonic', 'gin framework'],
    caseSensitiveAliases: ['Gin'],
    adjacentSkills: ['Go', 'Echo', 'Fiber'],
  },
  {
    canonical: 'Fiber',
    category: 'Backend',
    aliases: ['gofiber'],
    caseSensitiveAliases: ['Fiber'],
    adjacentSkills: ['Go', 'Express'],
  },
  {
    canonical: 'Actix',
    category: 'Backend',
    aliases: ['actix', 'actix-web', 'axum', 'tokio'],
    adjacentSkills: ['Rust', 'REST APIs'],
  },
  {
    canonical: 'REST APIs',
    category: 'Backend',
    aliases: ['restful', 'rest api', 'rest apis', 'restful api', 'restful apis'],
    adjacentSkills: ['GraphQL', 'gRPC', 'OpenAPI', 'Express', 'FastAPI'],
  },
  {
    canonical: 'gRPC',
    category: 'Backend',
    aliases: ['grpc'],
    adjacentSkills: ['Protocol Buffers', 'REST APIs', 'GraphQL', 'Go', 'Microservices'],
  },
  {
    canonical: 'tRPC',
    category: 'Backend',
    aliases: ['trpc'],
    adjacentSkills: ['TypeScript', 'Next.js', 'GraphQL', 'REST APIs'],
  },
  {
    canonical: 'WebSockets',
    category: 'Backend',
    aliases: ['websocket', 'websockets', 'socket.io', 'socketio', 'sse', 'server-sent events'],
    adjacentSkills: ['WebRTC', 'Node.js', 'Redis'],
  },
  {
    canonical: 'WebRTC',
    category: 'Backend',
    aliases: ['webrtc'],
    adjacentSkills: ['WebSockets', 'JavaScript'],
  },
  {
    canonical: 'OpenAPI',
    category: 'Backend',
    aliases: ['openapi', 'swagger'],
    adjacentSkills: ['REST APIs', 'Postman'],
  },
  {
    canonical: 'Temporal',
    category: 'Backend',
    aliases: ['temporal', 'temporal.io'],
    adjacentSkills: ['Airflow', 'Dagster', 'Prefect', 'Step Functions', 'Microservices'],
  },
  {
    canonical: 'Microservices',
    category: 'Backend',
    aliases: ['microservices', 'microservice', 'service-oriented architecture', 'soa'],
    adjacentSkills: ['System Design', 'Kubernetes', 'gRPC', 'Kafka', 'RabbitMQ', 'Docker'],
  },
  {
    canonical: 'Event-Driven Architecture',
    category: 'Backend',
    aliases: ['event-driven', 'event driven', 'event-driven architecture', 'cqrs', 'event sourcing'],
    adjacentSkills: ['Kafka', 'RabbitMQ', 'Microservices', 'Temporal'],
  },
  {
    canonical: 'Serverless',
    category: 'Backend',
    aliases: ['serverless', 'aws lambda', 'lambda', 'cloud functions', 'azure functions'],
    adjacentSkills: ['AWS', 'GCP', 'Azure', 'Cloudflare Workers'],
  },
  {
    canonical: 'Prisma',
    category: 'Backend',
    aliases: ['prisma', 'prisma orm'],
    adjacentSkills: ['TypeORM', 'Drizzle ORM', 'PostgreSQL', 'TypeScript'],
  },
  {
    canonical: 'TypeORM',
    category: 'Backend',
    aliases: ['typeorm'],
    adjacentSkills: ['Prisma', 'Sequelize', 'NestJS', 'PostgreSQL'],
  },
  {
    canonical: 'Drizzle ORM',
    category: 'Backend',
    aliases: ['drizzle', 'drizzle orm'],
    adjacentSkills: ['Prisma', 'TypeORM', 'PostgreSQL', 'TypeScript'],
  },
  {
    canonical: 'Sequelize',
    category: 'Backend',
    aliases: ['sequelize', 'knex', 'knex.js'],
    adjacentSkills: ['TypeORM', 'Prisma', 'Node.js', 'PostgreSQL'],
  },
  {
    canonical: 'SQLAlchemy',
    category: 'Backend',
    aliases: ['sqlalchemy', 'alembic'],
    adjacentSkills: ['Python', 'FastAPI', 'Flask', 'PostgreSQL'],
  },
  {
    canonical: 'Celery',
    category: 'Backend',
    aliases: ['celery'],
    adjacentSkills: ['Python', 'RabbitMQ', 'Redis', 'Temporal'],
  },
  {
    canonical: 'BullMQ',
    category: 'Backend',
    aliases: ['bullmq', 'bull queue'],
    adjacentSkills: ['Node.js', 'Redis', 'RabbitMQ', 'Temporal'],
  },
  {
    canonical: 'Zod',
    category: 'Backend',
    aliases: ['zod', 'joi', 'yup', 'ajv'],
    adjacentSkills: ['TypeScript', 'tRPC', 'Pydantic'],
  },

  // ======================== DATABASES (32) ========================
  {
    canonical: 'PostgreSQL',
    category: 'Databases',
    aliases: ['postgresql', 'postgres', 'psql'],
    adjacentSkills: ['MySQL', 'SQL', 'CockroachDB', 'Supabase', 'MariaDB'],
  },
  {
    canonical: 'MySQL',
    category: 'Databases',
    aliases: ['mysql'],
    adjacentSkills: ['PostgreSQL', 'MariaDB', 'SQL', 'PlanetScale'],
  },
  {
    canonical: 'MariaDB',
    category: 'Databases',
    aliases: ['mariadb'],
    adjacentSkills: ['MySQL', 'PostgreSQL', 'SQL'],
  },
  {
    canonical: 'SQLite',
    category: 'Databases',
    aliases: ['sqlite', 'sqlite3', 'libsql', 'turso'],
    adjacentSkills: ['SQL', 'PostgreSQL', 'DuckDB'],
  },
  {
    canonical: 'SQL Server',
    category: 'Databases',
    aliases: ['sql server', 'mssql', 'microsoft sql server'],
    adjacentSkills: ['SQL', 'PostgreSQL', '.NET', 'Azure'],
  },
  {
    canonical: 'Oracle DB',
    category: 'Databases',
    aliases: ['oracle database', 'oracle db'],
    adjacentSkills: ['SQL', 'PostgreSQL', 'SQL Server'],
  },
  {
    canonical: 'MongoDB',
    category: 'Databases',
    aliases: ['mongodb', 'mongo', 'mongoose', 'mongodb atlas'],
    adjacentSkills: ['DynamoDB', 'Firestore', 'Couchbase', 'NoSQL'],
  },
  {
    canonical: 'Redis',
    category: 'Databases',
    aliases: ['redis', 'valkey', 'elasticache'],
    adjacentSkills: ['Memcached', 'Dragonfly', 'PostgreSQL'],
  },
  {
    canonical: 'Memcached',
    category: 'Databases',
    aliases: ['memcached'],
    adjacentSkills: ['Redis'],
  },
  {
    canonical: 'ClickHouse',
    category: 'Databases',
    aliases: ['clickhouse', 'click house'],
    adjacentSkills: ['Snowflake', 'BigQuery', 'Redshift', 'Apache Druid', 'DuckDB', 'PostgreSQL'],
  },
  {
    canonical: 'Elasticsearch',
    category: 'Databases',
    aliases: ['elasticsearch', 'elastic search', 'opensearch', 'elk stack', 'kibana'],
    adjacentSkills: ['Algolia', 'Meilisearch', 'ClickHouse', 'PostgreSQL'],
  },
  {
    canonical: 'DynamoDB',
    category: 'Databases',
    aliases: ['dynamodb', 'dynamo db'],
    adjacentSkills: ['MongoDB', 'Cassandra', 'AWS', 'NoSQL'],
  },
  {
    canonical: 'Cassandra',
    category: 'Databases',
    aliases: ['cassandra', 'apache cassandra', 'scylladb', 'scylla'],
    adjacentSkills: ['DynamoDB', 'Bigtable', 'MongoDB', 'NoSQL'],
  },
  {
    canonical: 'CockroachDB',
    category: 'Databases',
    aliases: ['cockroachdb', 'cockroach db', 'yugabytedb', 'ti-db', 'tidb'],
    adjacentSkills: ['PostgreSQL', 'Spanner', 'SQL'],
  },
  {
    canonical: 'Google Cloud Spanner',
    category: 'Databases',
    aliases: ['cloud spanner', 'google spanner'],
    adjacentSkills: ['GCP', 'CockroachDB', 'PostgreSQL'],
  },
  {
    canonical: 'Bigtable',
    category: 'Databases',
    aliases: ['bigtable', 'cloud bigtable', 'hbase', 'apache hbase'],
    adjacentSkills: ['GCP', 'Cassandra', 'DynamoDB'],
  },
  {
    canonical: 'Firestore',
    category: 'Databases',
    aliases: ['firestore', 'cloud firestore', 'firebase'],
    adjacentSkills: ['Supabase', 'MongoDB', 'GCP'],
  },
  {
    canonical: 'Supabase',
    category: 'Databases',
    aliases: ['supabase'],
    adjacentSkills: ['PostgreSQL', 'Firestore', 'pgvector'],
  },
  {
    canonical: 'Neo4j',
    category: 'Databases',
    aliases: ['neo4j', 'cypher', 'neptune', 'graph database'],
    adjacentSkills: ['PostgreSQL', 'NoSQL'],
  },
  {
    canonical: 'InfluxDB',
    category: 'Databases',
    aliases: ['influxdb', 'timescaledb', 'time-series database'],
    adjacentSkills: ['Prometheus', 'ClickHouse', 'PostgreSQL'],
  },
  {
    canonical: 'DuckDB',
    category: 'Databases',
    aliases: ['duckdb'],
    adjacentSkills: ['ClickHouse', 'SQLite', 'Snowflake', 'Pandas'],
  },
  {
    canonical: 'Apache Druid',
    category: 'Databases',
    aliases: ['apache druid', 'apache pinot'],
    adjacentSkills: ['ClickHouse', 'Elasticsearch', 'Kafka'],
  },
  {
    canonical: 'Couchbase',
    category: 'Databases',
    aliases: ['couchbase', 'couchdb'],
    adjacentSkills: ['MongoDB', 'Redis', 'NoSQL'],
  },
  {
    canonical: 'NoSQL',
    category: 'Databases',
    aliases: ['nosql'],
    adjacentSkills: ['MongoDB', 'DynamoDB', 'Cassandra', 'Redis'],
  },
  {
    canonical: 'pgvector',
    category: 'Databases',
    aliases: ['pgvector'],
    adjacentSkills: ['PostgreSQL', 'Pinecone', 'Qdrant', 'Weaviate', 'Milvus', 'RAG'],
  },
  {
    canonical: 'Pinecone',
    category: 'Databases',
    aliases: ['pinecone'],
    adjacentSkills: ['Qdrant', 'Weaviate', 'Milvus', 'ChromaDB', 'pgvector', 'RAG'],
  },
  {
    canonical: 'Weaviate',
    category: 'Databases',
    aliases: ['weaviate'],
    adjacentSkills: ['Pinecone', 'Qdrant', 'Milvus', 'ChromaDB', 'RAG'],
  },
  {
    canonical: 'Qdrant',
    category: 'Databases',
    aliases: ['qdrant'],
    adjacentSkills: ['Pinecone', 'Weaviate', 'Milvus', 'pgvector', 'RAG'],
  },
  {
    canonical: 'Milvus',
    category: 'Databases',
    aliases: ['milvus'],
    adjacentSkills: ['Pinecone', 'Qdrant', 'Weaviate', 'pgvector', 'RAG'],
  },
  {
    canonical: 'ChromaDB',
    category: 'Databases',
    aliases: ['chromadb', 'chroma db', 'faiss'],
    adjacentSkills: ['Pinecone', 'Qdrant', 'Weaviate', 'LangChain', 'RAG'],
  },
  {
    canonical: 'Meilisearch',
    category: 'Databases',
    aliases: ['meilisearch', 'typesense', 'algolia'],
    adjacentSkills: ['Elasticsearch'],
  },
  {
    canonical: 'PlanetScale',
    category: 'Databases',
    aliases: ['planetscale', 'vitess', 'neon db'],
    adjacentSkills: ['MySQL', 'PostgreSQL'],
  },

  // ======================== MESSAGING & STREAMING (12) ========================
  {
    canonical: 'Kafka',
    category: 'Messaging',
    aliases: ['kafka', 'apache kafka', 'confluent', 'kafka streams', 'redpanda'],
    adjacentSkills: ['RabbitMQ', 'Apache Pulsar', 'AWS SQS', 'AWS Kinesis', 'Google Cloud Pub/Sub', 'NATS'],
  },
  {
    canonical: 'RabbitMQ',
    category: 'Messaging',
    aliases: ['rabbitmq', 'rabbit mq', 'amqp'],
    adjacentSkills: ['Kafka', 'AWS SQS', 'ActiveMQ', 'NATS', 'Redis', 'Celery'],
  },
  {
    canonical: 'Apache Pulsar',
    category: 'Messaging',
    aliases: ['apache pulsar', 'pulsar'],
    adjacentSkills: ['Kafka', 'RabbitMQ'],
  },
  {
    canonical: 'ActiveMQ',
    category: 'Messaging',
    aliases: ['activemq', 'jms', 'ibm mq'],
    adjacentSkills: ['RabbitMQ', 'Kafka', 'Java'],
  },
  {
    canonical: 'NATS',
    category: 'Messaging',
    aliases: ['nats', 'nats jetstream'],
    adjacentSkills: ['Kafka', 'RabbitMQ', 'Go'],
  },
  {
    canonical: 'AWS SQS',
    category: 'Messaging',
    aliases: ['sqs', 'amazon sqs', 'aws sqs', 'aws sns', 'amazon sns', 'eventbridge'],
    adjacentSkills: ['AWS', 'RabbitMQ', 'Kafka', 'AWS Kinesis'],
  },
  {
    canonical: 'AWS Kinesis',
    category: 'Messaging',
    aliases: ['kinesis', 'aws kinesis', 'amazon kinesis'],
    adjacentSkills: ['Kafka', 'AWS', 'AWS SQS', 'Apache Flink'],
  },
  {
    canonical: 'Google Cloud Pub/Sub',
    category: 'Messaging',
    aliases: ['pub/sub', 'cloud pub/sub', 'google pub/sub', 'gcp pub/sub'],
    adjacentSkills: ['GCP', 'Kafka', 'RabbitMQ'],
  },
  {
    canonical: 'Azure Service Bus',
    category: 'Messaging',
    aliases: ['azure service bus', 'azure event hubs'],
    adjacentSkills: ['Azure', 'Kafka', 'RabbitMQ'],
  },
  {
    canonical: 'MQTT',
    category: 'Messaging',
    aliases: ['mqtt', 'zeromq'],
    adjacentSkills: ['RabbitMQ', 'NATS', 'WebSockets'],
  },

  // ======================== CLOUD & INFRASTRUCTURE (32) ========================
  {
    canonical: 'AWS',
    category: 'Cloud',
    aliases: ['aws', 'amazon web services'],
    adjacentSkills: ['GCP', 'Azure', 'Terraform', 'Kubernetes', 'Docker'],
  },
  {
    canonical: 'GCP',
    category: 'Cloud',
    aliases: ['gcp', 'google cloud', 'google cloud platform'],
    adjacentSkills: ['AWS', 'Azure', 'GKE', 'BigQuery', 'Kubernetes'],
  },
  {
    canonical: 'Azure',
    category: 'Cloud',
    aliases: ['azure', 'microsoft azure'],
    adjacentSkills: ['AWS', 'GCP', 'AKS', '.NET', 'Kubernetes'],
  },
  {
    canonical: 'GKE',
    category: 'Cloud',
    aliases: ['gke', 'google kubernetes engine'],
    adjacentSkills: ['Kubernetes', 'GCP', 'EKS', 'AKS', 'Helm'],
  },
  {
    canonical: 'EKS',
    category: 'Cloud',
    aliases: ['eks', 'amazon eks', 'aws eks'],
    adjacentSkills: ['Kubernetes', 'AWS', 'GKE', 'AKS', 'ECS'],
  },
  {
    canonical: 'AKS',
    category: 'Cloud',
    aliases: ['aks', 'azure kubernetes service'],
    adjacentSkills: ['Kubernetes', 'Azure', 'GKE', 'EKS'],
  },
  {
    canonical: 'ECS',
    category: 'Cloud',
    aliases: ['amazon ecs', 'aws ecs', 'aws fargate', 'fargate'],
    adjacentSkills: ['AWS', 'EKS', 'Docker', 'Kubernetes'],
  },
  {
    canonical: 'AWS EC2',
    category: 'Cloud',
    aliases: ['ec2', 'aws ec2', 'amazon ec2'],
    adjacentSkills: ['AWS', 'Linux', 'Terraform'],
  },
  {
    canonical: 'AWS S3',
    category: 'Cloud',
    aliases: ['s3', 'aws s3', 'amazon s3', 'cloud storage', 'gcs'],
    adjacentSkills: ['AWS', 'GCP', 'CloudFront'],
  },
  {
    canonical: 'AWS RDS',
    category: 'Cloud',
    aliases: ['rds', 'aws rds', 'amazon rds', 'aurora', 'cloud sql'],
    adjacentSkills: ['PostgreSQL', 'MySQL', 'AWS'],
  },
  {
    canonical: 'Step Functions',
    category: 'Cloud',
    aliases: ['step functions', 'aws step functions'],
    adjacentSkills: ['Temporal', 'AWS', 'Serverless', 'Airflow'],
  },
  {
    canonical: 'Cloud Run',
    category: 'Cloud',
    aliases: ['cloud run', 'google cloud run'],
    adjacentSkills: ['GCP', 'GKE', 'Docker', 'Serverless'],
  },
  {
    canonical: 'CloudFront',
    category: 'Cloud',
    aliases: ['cloudfront', 'aws cloudfront'],
    adjacentSkills: ['CDN', 'Cloudflare', 'AWS'],
  },
  {
    canonical: 'Cloudflare',
    category: 'Cloud',
    aliases: ['cloudflare', 'cloudflare workers', 'cloudflare pages'],
    adjacentSkills: ['CDN', 'Vercel', 'Fastly'],
  },
  {
    canonical: 'CDN',
    category: 'Cloud',
    aliases: ['cdn', 'akamai', 'fastly'],
    adjacentSkills: ['Cloudflare', 'CloudFront', 'Nginx'],
  },
  {
    canonical: 'Vercel',
    category: 'Cloud',
    aliases: ['vercel'],
    adjacentSkills: ['Next.js', 'Netlify', 'Cloudflare'],
  },
  {
    canonical: 'Netlify',
    category: 'Cloud',
    aliases: ['netlify'],
    adjacentSkills: ['Vercel', 'Cloudflare'],
  },
  {
    canonical: 'DigitalOcean',
    category: 'Cloud',
    aliases: ['digitalocean', 'linode', 'hetzner', 'fly.io', 'render', 'heroku'],
    adjacentSkills: ['AWS', 'GCP', 'Docker', 'Linux'],
  },
  {
    canonical: 'OpenStack',
    category: 'Cloud',
    aliases: ['openstack', 'vmware', 'vsphere', 'proxmox'],
    adjacentSkills: ['Linux', 'Kubernetes', 'Terraform'],
  },
  {
    canonical: 'Supabase Auth',
    category: 'Cloud',
    aliases: ['cognito', 'aws cognito', 'auth0', 'clerk', 'okta', 'keycloak', 'firebase auth'],
    adjacentSkills: ['Security', 'OAuth', 'JWT'],
  },

  // ======================== DEVOPS, SRE & OBSERVABILITY (38) ========================
  {
    canonical: 'Docker',
    category: 'DevOps',
    aliases: ['docker', 'docker compose', 'docker-compose', 'dockerfile', 'containerd', 'podman'],
    adjacentSkills: ['Kubernetes', 'CI/CD', 'Linux', 'ECS'],
  },
  {
    canonical: 'Kubernetes',
    category: 'DevOps',
    aliases: ['kubernetes', 'k8s', 'kubectl'],
    adjacentSkills: ['Docker', 'Helm', 'GKE', 'EKS', 'AKS', 'ArgoCD', 'Terraform'],
  },
  {
    canonical: 'Helm',
    category: 'DevOps',
    aliases: ['helm', 'helm charts', 'kustomize'],
    adjacentSkills: ['Kubernetes', 'ArgoCD', 'GKE', 'EKS'],
  },
  {
    canonical: 'Terraform',
    category: 'DevOps',
    aliases: ['terraform', 'opentofu', 'hcl', 'infrastructure as code', 'iac'],
    adjacentSkills: ['Pulumi', 'CloudFormation', 'Ansible', 'AWS', 'GCP', 'Azure'],
  },
  {
    canonical: 'Pulumi',
    category: 'DevOps',
    aliases: ['pulumi'],
    adjacentSkills: ['Terraform', 'CloudFormation', 'AWS'],
  },
  {
    canonical: 'CloudFormation',
    category: 'DevOps',
    aliases: ['cloudformation', 'aws cdk', 'cdk'],
    adjacentSkills: ['Terraform', 'AWS', 'Pulumi'],
  },
  {
    canonical: 'Ansible',
    category: 'DevOps',
    aliases: ['ansible', 'chef', 'puppet', 'saltstack'],
    adjacentSkills: ['Terraform', 'Linux', 'Bash'],
  },
  {
    canonical: 'CI/CD',
    category: 'DevOps',
    aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
    adjacentSkills: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'ArgoCD', 'Docker'],
  },
  {
    canonical: 'GitHub Actions',
    category: 'DevOps',
    aliases: ['github actions', 'gh actions'],
    adjacentSkills: ['CI/CD', 'GitLab CI', 'Jenkins', 'CircleCI', 'Git'],
  },
  {
    canonical: 'GitLab CI',
    category: 'DevOps',
    aliases: ['gitlab ci', 'gitlab ci/cd', 'gitlab'],
    adjacentSkills: ['CI/CD', 'GitHub Actions', 'Jenkins', 'Git'],
  },
  {
    canonical: 'Jenkins',
    category: 'DevOps',
    aliases: ['jenkins'],
    adjacentSkills: ['CI/CD', 'GitHub Actions', 'GitLab CI', 'Groovy'],
  },
  {
    canonical: 'CircleCI',
    category: 'DevOps',
    aliases: ['circleci', 'buildkite', 'travis ci', 'azure devops'],
    adjacentSkills: ['CI/CD', 'GitHub Actions', 'Jenkins'],
  },
  {
    canonical: 'ArgoCD',
    category: 'DevOps',
    aliases: ['argocd', 'argo cd', 'fluxcd', 'gitops'],
    adjacentSkills: ['Kubernetes', 'Helm', 'CI/CD'],
  },
  {
    canonical: 'Istio',
    category: 'DevOps',
    aliases: ['istio', 'linkerd', 'envoy', 'service mesh', 'cilium'],
    adjacentSkills: ['Kubernetes', 'Microservices', 'Nginx'],
  },
  {
    canonical: 'Nginx',
    category: 'DevOps',
    aliases: ['nginx', 'haproxy', 'traefik', 'caddy', 'apache http'],
    adjacentSkills: ['Linux', 'Docker', 'Kubernetes', 'Load Balancing'],
  },
  {
    canonical: 'Linux',
    category: 'DevOps',
    aliases: ['linux', 'ubuntu', 'debian', 'rhel', 'centos', 'alpine linux', 'unix'],
    adjacentSkills: ['Bash', 'Docker', 'Nginx', 'Networking'],
  },
  {
    canonical: 'Prometheus',
    category: 'DevOps',
    aliases: ['prometheus', 'promql', 'alertmanager'],
    adjacentSkills: ['Grafana', 'Datadog', 'OpenTelemetry', 'Kubernetes'],
  },
  {
    canonical: 'Grafana',
    category: 'DevOps',
    aliases: ['grafana', 'loki', 'tempo'],
    adjacentSkills: ['Prometheus', 'Datadog', 'OpenTelemetry', 'Elasticsearch'],
  },
  {
    canonical: 'Datadog',
    category: 'DevOps',
    aliases: ['datadog', 'new relic', 'dynatrace'],
    adjacentSkills: ['Prometheus', 'Grafana', 'OpenTelemetry', 'Sentry'],
  },
  {
    canonical: 'OpenTelemetry',
    category: 'DevOps',
    aliases: ['opentelemetry', 'otel', 'jaeger', 'zipkin', 'distributed tracing'],
    adjacentSkills: ['Prometheus', 'Grafana', 'Datadog', 'Observability'],
  },
  {
    canonical: 'Observability',
    category: 'DevOps',
    aliases: ['observability', 'sli', 'slo', 'sla', 'sre', 'site reliability engineering'],
    adjacentSkills: ['Prometheus', 'Grafana', 'OpenTelemetry', 'Datadog', 'PagerDuty'],
  },
  {
    canonical: 'Sentry',
    category: 'DevOps',
    aliases: ['sentry', 'splunk', 'cloudwatch', 'aws cloudwatch', 'pagerduty'],
    adjacentSkills: ['Datadog', 'Observability', 'Elasticsearch'],
  },
  {
    canonical: 'HashiCorp Vault',
    category: 'DevOps',
    aliases: ['hashicorp vault', 'consul', 'nomad'],
    adjacentSkills: ['Terraform', 'Kubernetes', 'Security'],
  },
  {
    canonical: 'Networking',
    category: 'DevOps',
    aliases: ['tcp/ip', 'dns', 'http/2', 'http/3', 'bgp', 'vpc', 'load balancing'],
    adjacentSkills: ['Linux', 'Nginx', 'AWS', 'Cloudflare'],
  },

  // ======================== AI / ML & GENAI (36) ========================
  {
    canonical: 'Machine Learning',
    category: 'AI/ML',
    aliases: ['machine learning', 'ml'],
    adjacentSkills: ['Deep Learning', 'Python', 'Scikit-learn', 'PyTorch', 'TensorFlow'],
  },
  {
    canonical: 'Deep Learning',
    category: 'AI/ML',
    aliases: ['deep learning', 'neural networks', 'cnn', 'rnn', 'transformers'],
    adjacentSkills: ['Machine Learning', 'PyTorch', 'TensorFlow', 'LLMs'],
  },
  {
    canonical: 'LLMs',
    category: 'AI/ML',
    aliases: ['llm', 'llms', 'large language models', 'large language model', 'generative ai', 'genai', 'foundation models'],
    adjacentSkills: ['RAG', 'LangChain', 'AI Agents', 'OpenAI API', 'Prompt Engineering', 'PyTorch'],
  },
  {
    canonical: 'RAG',
    category: 'AI/ML',
    aliases: ['retrieval-augmented generation', 'retrieval augmented generation'],
    caseSensitiveAliases: ['RAG'],
    adjacentSkills: ['LLMs', 'LangChain', 'LlamaIndex', 'AI Agents', 'Pinecone', 'pgvector', 'Embeddings'],
  },
  {
    canonical: 'AI Agents',
    category: 'AI/ML',
    aliases: ['ai agents', 'ai agent', 'agentic ai', 'agentic workflows', 'autonomous agents', 'llm agents', 'multi-agent', 'multi-agent systems'],
    adjacentSkills: ['LangChain', 'LangGraph', 'RAG', 'LLMs', 'MCP', 'Temporal'],
  },
  {
    canonical: 'LangChain',
    category: 'AI/ML',
    aliases: ['langchain', 'lang chain'],
    adjacentSkills: ['LlamaIndex', 'LangGraph', 'AI Agents', 'RAG', 'LLMs', 'Semantic Kernel'],
  },
  {
    canonical: 'LangGraph',
    category: 'AI/ML',
    aliases: ['langgraph', 'crewai', 'autogen'],
    adjacentSkills: ['LangChain', 'AI Agents', 'LLMs'],
  },
  {
    canonical: 'LlamaIndex',
    category: 'AI/ML',
    aliases: ['llamaindex', 'llama index', 'haystack', 'dspy'],
    adjacentSkills: ['LangChain', 'RAG', 'LLMs'],
  },
  {
    canonical: 'Semantic Kernel',
    category: 'AI/ML',
    aliases: ['semantic kernel', 'vercel ai sdk'],
    adjacentSkills: ['LangChain', 'AI Agents', 'LLMs'],
  },
  {
    canonical: 'MCP',
    category: 'AI/ML',
    aliases: ['model context protocol'],
    caseSensitiveAliases: ['MCP'],
    adjacentSkills: ['AI Agents', 'LLMs', 'OpenAI API', 'Anthropic Claude'],
  },
  {
    canonical: 'OpenAI API',
    category: 'AI/ML',
    aliases: ['openai', 'openai api', 'gpt-4', 'gpt-4o', 'chatgpt api'],
    adjacentSkills: ['Anthropic Claude', 'Vertex AI', 'AWS Bedrock', 'LLMs'],
  },
  {
    canonical: 'Anthropic Claude',
    category: 'AI/ML',
    aliases: ['anthropic', 'claude api'],
    adjacentSkills: ['OpenAI API', 'AWS Bedrock', 'Vertex AI', 'LLMs'],
  },
  {
    canonical: 'Vertex AI',
    category: 'AI/ML',
    aliases: ['vertex ai', 'gemini api'],
    adjacentSkills: ['GCP', 'AWS Bedrock', 'OpenAI API', 'LLMs'],
  },
  {
    canonical: 'AWS Bedrock',
    category: 'AI/ML',
    aliases: ['bedrock', 'aws bedrock', 'amazon bedrock', 'sagemaker', 'aws sagemaker'],
    adjacentSkills: ['AWS', 'Vertex AI', 'OpenAI API', 'LLMs', 'MLOps'],
  },
  {
    canonical: 'Prompt Engineering',
    category: 'AI/ML',
    aliases: ['prompt engineering', 'function calling', 'tool calling', 'structured outputs'],
    adjacentSkills: ['LLMs', 'RAG', 'AI Agents', 'LLM Evaluation'],
  },
  {
    canonical: 'Embeddings',
    category: 'AI/ML',
    aliases: ['embeddings', 'vector embeddings', 'semantic search', 'vector search', 'hybrid search'],
    adjacentSkills: ['RAG', 'Pinecone', 'Qdrant', 'pgvector', 'Elasticsearch'],
  },
  {
    canonical: 'Fine-Tuning',
    category: 'AI/ML',
    aliases: ['fine-tuning', 'fine tuning', 'lora', 'qlora', 'peft', 'rlhf'],
    adjacentSkills: ['LLMs', 'PyTorch', 'Hugging Face'],
  },
  {
    canonical: 'LLM Evaluation',
    category: 'AI/ML',
    aliases: ['llm evaluation', 'evals', 'ragas', 'langsmith', 'langfuse', 'braintrust'],
    adjacentSkills: ['LLMs', 'RAG', 'LangChain', 'AI Agents'],
  },
  {
    canonical: 'vLLM',
    category: 'AI/ML',
    aliases: ['vllm', 'ollama', 'tensorrt-llm', 'triton inference server', 'tgi'],
    adjacentSkills: ['LLMs', 'PyTorch', 'CUDA', 'MLOps'],
  },
  {
    canonical: 'PyTorch',
    category: 'AI/ML',
    aliases: ['pytorch', 'torch'],
    adjacentSkills: ['TensorFlow', 'JAX', 'Deep Learning', 'Hugging Face'],
  },
  {
    canonical: 'TensorFlow',
    category: 'AI/ML',
    aliases: ['tensorflow', 'keras'],
    adjacentSkills: ['PyTorch', 'JAX', 'Deep Learning'],
  },
  {
    canonical: 'JAX',
    category: 'AI/ML',
    aliases: ['google jax', 'flax'],
    caseSensitiveAliases: ['JAX'],
    adjacentSkills: ['PyTorch', 'TensorFlow', 'NumPy'],
  },
  {
    canonical: 'Hugging Face',
    category: 'AI/ML',
    aliases: ['hugging face', 'huggingface'],
    adjacentSkills: ['PyTorch', 'LLMs', 'NLP', 'Fine-Tuning'],
  },
  {
    canonical: 'Scikit-learn',
    category: 'AI/ML',
    aliases: ['scikit-learn', 'scikit learn', 'sklearn', 'xgboost', 'lightgbm', 'catboost'],
    adjacentSkills: ['Machine Learning', 'Python', 'Pandas', 'NumPy'],
  },
  {
    canonical: 'NLP',
    category: 'AI/ML',
    aliases: ['nlp', 'natural language processing', 'spacy', 'nltk'],
    adjacentSkills: ['LLMs', 'Hugging Face', 'Machine Learning'],
  },
  {
    canonical: 'Computer Vision',
    category: 'AI/ML',
    aliases: ['computer vision', 'opencv', 'yolo'],
    adjacentSkills: ['Deep Learning', 'PyTorch', 'TensorFlow'],
  },
  {
    canonical: 'CUDA',
    category: 'AI/ML',
    aliases: ['cuda', 'nccl', 'triton'],
    adjacentSkills: ['C++', 'PyTorch', 'vLLM'],
  },
  {
    canonical: 'MLOps',
    category: 'AI/ML',
    aliases: ['mlops', 'mlflow', 'kubeflow', 'weights & biases', 'wandb', 'bentoml', 'ray'],
    adjacentSkills: ['Machine Learning', 'Kubernetes', 'Docker', 'AWS Bedrock'],
  },

  // ======================== DATA ENGINEERING & ANALYTICS (26) ========================
  {
    canonical: 'Spark',
    category: 'Data Engineering',
    aliases: ['apache spark', 'pyspark'],
    caseSensitiveAliases: ['Spark'],
    adjacentSkills: ['Apache Flink', 'Databricks', 'Hadoop', 'Python', 'Scala'],
  },
  {
    canonical: 'Apache Flink',
    category: 'Data Engineering',
    aliases: ['flink', 'apache flink', 'apache beam', 'google dataflow'],
    adjacentSkills: ['Spark', 'Kafka', 'AWS Kinesis'],
  },
  {
    canonical: 'Airflow',
    category: 'Data Engineering',
    aliases: ['airflow', 'apache airflow'],
    adjacentSkills: ['Dagster', 'Prefect', 'Temporal', 'dbt', 'Python'],
  },
  {
    canonical: 'Dagster',
    category: 'Data Engineering',
    aliases: ['dagster'],
    adjacentSkills: ['Airflow', 'Prefect', 'dbt', 'Temporal'],
  },
  {
    canonical: 'Prefect',
    category: 'Data Engineering',
    aliases: ['prefect'],
    adjacentSkills: ['Airflow', 'Dagster', 'Temporal', 'Python'],
  },
  {
    canonical: 'dbt',
    category: 'Data Engineering',
    aliases: ['dbt', 'data build tool'],
    adjacentSkills: ['Snowflake', 'BigQuery', 'Redshift', 'SQL', 'Airflow'],
  },
  {
    canonical: 'Snowflake',
    category: 'Data Engineering',
    aliases: ['snowflake'],
    adjacentSkills: ['BigQuery', 'Redshift', 'Databricks', 'ClickHouse', 'dbt'],
  },
  {
    canonical: 'BigQuery',
    category: 'Data Engineering',
    aliases: ['bigquery', 'google bigquery'],
    adjacentSkills: ['GCP', 'Snowflake', 'Redshift', 'ClickHouse', 'SQL'],
  },
  {
    canonical: 'Redshift',
    category: 'Data Engineering',
    aliases: ['redshift', 'aws redshift', 'amazon redshift', 'athena', 'aws glue'],
    adjacentSkills: ['AWS', 'Snowflake', 'BigQuery', 'ClickHouse'],
  },
  {
    canonical: 'Databricks',
    category: 'Data Engineering',
    aliases: ['databricks', 'delta lake'],
    adjacentSkills: ['Spark', 'Snowflake', 'Apache Iceberg'],
  },
  {
    canonical: 'Apache Iceberg',
    category: 'Data Engineering',
    aliases: ['iceberg', 'apache iceberg', 'apache hudi', 'parquet', 'avro', 'trino', 'presto'],
    adjacentSkills: ['Spark', 'Databricks', 'Snowflake', 'ClickHouse'],
  },
  {
    canonical: 'Hadoop',
    category: 'Data Engineering',
    aliases: ['hadoop', 'hdfs', 'hive', 'apache hive'],
    adjacentSkills: ['Spark', 'Apache Iceberg'],
  },
  {
    canonical: 'ETL',
    category: 'Data Engineering',
    aliases: ['etl', 'elt', 'data pipelines', 'data pipeline', 'fivetran', 'airbyte', 'debezium', 'cdc'],
    adjacentSkills: ['Airflow', 'dbt', 'Spark', 'Kafka', 'SQL'],
  },
  {
    canonical: 'Data Modeling',
    category: 'Data Engineering',
    aliases: ['data modeling', 'data warehousing', 'dimensional modeling', 'star schema'],
    adjacentSkills: ['SQL', 'dbt', 'Snowflake', 'BigQuery'],
  },
  {
    canonical: 'Pandas',
    category: 'Data Engineering',
    aliases: ['pandas', 'polars'],
    adjacentSkills: ['NumPy', 'Python', 'Data Analysis', 'DuckDB'],
  },
  {
    canonical: 'NumPy',
    category: 'Data Engineering',
    aliases: ['numpy', 'scipy'],
    adjacentSkills: ['Pandas', 'Python', 'Scikit-learn', 'PyTorch'],
  },
  {
    canonical: 'Data Analysis',
    category: 'Data Engineering',
    aliases: ['data analysis', 'data analytics', 'a/b testing', 'experimentation', 'statistical analysis'],
    adjacentSkills: ['SQL', 'Python', 'Pandas', 'Tableau', 'Power BI'],
  },
  {
    canonical: 'Data Visualization',
    category: 'Data Engineering',
    aliases: ['data visualization', 'matplotlib', 'seaborn', 'plotly', 'streamlit'],
    adjacentSkills: ['Tableau', 'Power BI', 'D3.js', 'Chart.js'],
  },
  {
    canonical: 'Tableau',
    category: 'Data Engineering',
    aliases: ['tableau', 'looker', 'metabase', 'superset'],
    adjacentSkills: ['Power BI', 'SQL', 'Data Analysis'],
  },
  {
    canonical: 'Power BI',
    category: 'Data Engineering',
    aliases: ['power bi', 'powerbi'],
    adjacentSkills: ['Tableau', 'SQL', 'Data Analysis'],
  },

  // ======================== TESTING & QUALITY (20) ========================
  {
    canonical: 'Jest',
    category: 'Testing',
    aliases: ['jest'],
    adjacentSkills: ['Vitest', 'React Testing Library', 'Unit Testing', 'TypeScript'],
  },
  {
    canonical: 'Vitest',
    category: 'Testing',
    aliases: ['vitest'],
    adjacentSkills: ['Jest', 'Vite', 'Unit Testing'],
  },
  {
    canonical: 'React Testing Library',
    category: 'Testing',
    aliases: ['react testing library', 'testing-library', 'enzyme'],
    adjacentSkills: ['Jest', 'Vitest', 'React'],
  },
  {
    canonical: 'Cypress',
    category: 'Testing',
    aliases: ['cypress'],
    adjacentSkills: ['Playwright', 'Selenium', 'E2E Testing'],
  },
  {
    canonical: 'Playwright',
    category: 'Testing',
    aliases: ['playwright'],
    adjacentSkills: ['Cypress', 'Selenium', 'Puppeteer', 'E2E Testing'],
  },
  {
    canonical: 'Selenium',
    category: 'Testing',
    aliases: ['selenium', 'webdriver', 'webdriverio', 'appium'],
    adjacentSkills: ['Playwright', 'Cypress', 'E2E Testing'],
  },
  {
    canonical: 'Puppeteer',
    category: 'Testing',
    aliases: ['puppeteer'],
    adjacentSkills: ['Playwright', 'Node.js'],
  },
  {
    canonical: 'Mocha',
    category: 'Testing',
    aliases: ['mocha', 'chai', 'sinon', 'supertest'],
    adjacentSkills: ['Jest', 'Vitest', 'Node.js'],
  },
  {
    canonical: 'Pytest',
    category: 'Testing',
    aliases: ['pytest', 'unittest'],
    adjacentSkills: ['Python', 'Unit Testing'],
  },
  {
    canonical: 'JUnit',
    category: 'Testing',
    aliases: ['junit', 'junit5', 'mockito', 'testng'],
    adjacentSkills: ['Java', 'Spring Boot', 'Unit Testing'],
  },
  {
    canonical: 'Unit Testing',
    category: 'Testing',
    aliases: ['unit testing', 'unit tests', 'tdd', 'test-driven', 'test-driven development', 'bdd'],
    adjacentSkills: ['Integration Testing', 'Jest', 'Pytest', 'JUnit'],
  },
  {
    canonical: 'Integration Testing',
    category: 'Testing',
    aliases: ['integration testing', 'integration tests', 'contract testing', 'testcontainers'],
    adjacentSkills: ['Unit Testing', 'E2E Testing', 'Docker'],
  },
  {
    canonical: 'E2E Testing',
    category: 'Testing',
    aliases: ['e2e testing', 'end-to-end testing', 'qa automation', 'test automation'],
    adjacentSkills: ['Playwright', 'Cypress', 'Selenium'],
  },
  {
    canonical: 'Load Testing',
    category: 'Testing',
    aliases: ['load testing', 'k6', 'gatling', 'locust', 'jmeter', 'stress testing'],
    adjacentSkills: ['Performance Optimization', 'Observability'],
  },

  // ======================== MOBILE & CROSS-PLATFORM (12) ========================
  {
    canonical: 'React Native',
    category: 'Mobile',
    aliases: ['react native', 'react-native', 'expo'],
    adjacentSkills: ['React', 'Flutter', 'TypeScript', 'iOS', 'Android'],
  },
  {
    canonical: 'Flutter',
    category: 'Mobile',
    aliases: ['flutter'],
    adjacentSkills: ['Dart', 'React Native', 'iOS', 'Android'],
  },
  {
    canonical: 'iOS',
    category: 'Mobile',
    aliases: ['ios', 'ios development', 'uikit', 'xcode', 'cocoapods'],
    adjacentSkills: ['Swift', 'SwiftUI', 'Objective-C', 'React Native', 'Flutter'],
  },
  {
    canonical: 'SwiftUI',
    category: 'Mobile',
    aliases: ['swiftui'],
    adjacentSkills: ['Swift', 'iOS'],
  },
  {
    canonical: 'Android',
    category: 'Mobile',
    aliases: ['android', 'android sdk', 'android studio'],
    adjacentSkills: ['Kotlin', 'Jetpack Compose', 'Java', 'Flutter', 'React Native'],
  },
  {
    canonical: 'Jetpack Compose',
    category: 'Mobile',
    aliases: ['jetpack compose'],
    adjacentSkills: ['Kotlin', 'Android'],
  },
  {
    canonical: 'Electron',
    category: 'Mobile',
    aliases: ['electron', 'electronjs', 'tauri'],
    adjacentSkills: ['React', 'TypeScript', 'Node.js', 'Rust'],
  },
  {
    canonical: 'Capacitor',
    category: 'Mobile',
    aliases: ['capacitor', 'ionic', 'cordova'],
    adjacentSkills: ['React Native', 'Angular', 'Vue'],
  },

  // ======================== SECURITY & COMPLIANCE (16) ========================
  {
    canonical: 'Security',
    category: 'Security',
    aliases: ['security', 'application security', 'appsec', 'cybersecurity', 'devsecops'],
    adjacentSkills: ['OWASP', 'OAuth', 'JWT', 'SOC 2', 'IAM'],
  },
  {
    canonical: 'OWASP',
    category: 'Security',
    aliases: ['owasp', 'xss', 'csrf', 'ssrf', 'sql injection', 'penetration testing', 'sast', 'dast'],
    adjacentSkills: ['Security', 'OAuth', 'JWT'],
  },
  {
    canonical: 'OAuth',
    category: 'Security',
    aliases: ['oauth', 'oauth2', 'oauth 2.0', 'oidc', 'openid connect', 'saml', 'sso'],
    adjacentSkills: ['JWT', 'Security', 'IAM', 'RBAC'],
  },
  {
    canonical: 'JWT',
    category: 'Security',
    aliases: ['jwt', 'json web token', 'json web tokens'],
    adjacentSkills: ['OAuth', 'Security', 'REST APIs'],
  },
  {
    canonical: 'RBAC',
    category: 'Security',
    aliases: ['rbac', 'abac', 'role-based access control', 'open policy agent', 'opa'],
    adjacentSkills: ['IAM', 'OAuth', 'Security'],
  },
  {
    canonical: 'IAM',
    category: 'Security',
    aliases: ['iam', 'aws iam', 'zero trust', 'mtls', 'tls', 'ssl', 'pki', 'encryption'],
    adjacentSkills: ['AWS', 'GCP', 'Security', 'RBAC'],
  },
  {
    canonical: 'SOC 2',
    category: 'Security',
    aliases: ['soc 2', 'soc2', 'hipaa', 'gdpr', 'pci-dss', 'pci dss', 'iso 27001', 'fedramp'],
    adjacentSkills: ['Security', 'IAM'],
  },

  // ======================== TOOLS, ARCHITECTURE & PRACTICES (35) ========================
  {
    canonical: 'Git',
    category: 'Tools',
    aliases: ['git', 'github', 'bitbucket'],
    adjacentSkills: ['GitHub Actions', 'GitLab CI', 'CI/CD'],
  },
  {
    canonical: 'Monorepos',
    category: 'Tools',
    aliases: ['monorepo', 'monorepos', 'turborepo', 'nx', 'pnpm', 'lerna', 'bazel'],
    adjacentSkills: ['Git', 'CI/CD', 'TypeScript'],
  },
  {
    canonical: 'Gradle',
    category: 'Tools',
    aliases: ['gradle', 'maven'],
    adjacentSkills: ['Java', 'Kotlin', 'Spring Boot'],
  },
  {
    canonical: 'Postman',
    category: 'Tools',
    aliases: ['postman', 'insomnia'],
    adjacentSkills: ['REST APIs', 'OpenAPI'],
  },
  {
    canonical: 'Jira',
    category: 'Tools',
    aliases: ['jira', 'confluence', 'linear', 'notion'],
    adjacentSkills: ['Agile'],
  },
  {
    canonical: 'Figma',
    category: 'Tools',
    aliases: ['figma', 'sketch'],
    adjacentSkills: ['UI/UX', 'Design Systems', 'Storybook'],
  },
  {
    canonical: 'Stripe',
    category: 'Tools',
    aliases: ['stripe', 'stripe api', 'braintree', 'adyen', 'payment processing'],
    adjacentSkills: ['REST APIs', 'Webhooks', 'Node.js'],
  },
  {
    canonical: 'Webhooks',
    category: 'Tools',
    aliases: ['webhook', 'webhooks'],
    adjacentSkills: ['REST APIs', 'Event-Driven Architecture', 'Stripe'],
  },
  {
    canonical: 'Twilio',
    category: 'Tools',
    aliases: ['twilio', 'sendgrid', 'aws ses'],
    adjacentSkills: ['REST APIs', 'WebRTC'],
  },
  {
    canonical: 'Shopify',
    category: 'Tools',
    aliases: ['shopify', 'magento', 'woocommerce'],
    adjacentSkills: ['Stripe', 'React', 'Ruby', 'PHP'],
  },
  {
    canonical: 'WordPress',
    category: 'Tools',
    aliases: ['wordpress', 'contentful', 'sanity', 'strapi', 'headless cms'],
    adjacentSkills: ['PHP', 'Next.js', 'GraphQL'],
  },
  {
    canonical: 'Salesforce',
    category: 'Tools',
    aliases: ['salesforce', 'apex', 'hubspot'],
    adjacentSkills: ['REST APIs', 'Java'],
  },
  {
    canonical: 'Web3',
    category: 'Tools',
    aliases: ['web3', 'ethereum', 'blockchain', 'smart contracts', 'ethers.js', 'viem'],
    adjacentSkills: ['Solidity', 'TypeScript', 'Rust'],
  },
  {
    canonical: 'Embedded Systems',
    category: 'Tools',
    aliases: ['embedded systems', 'rtos', 'freertos', 'iot', 'firmware', 'arm cortex', 'fpga'],
    adjacentSkills: ['C', 'C++', 'Rust', 'Linux'],
  },
  {
    canonical: 'UI/UX',
    category: 'Practices',
    aliases: ['ui/ux', 'ux', 'user experience', 'wireframing', 'prototyping', 'user research'],
    adjacentSkills: ['Figma', 'Design Systems', 'Accessibility', 'React'],
  },
  {
    canonical: 'System Design',
    category: 'Practices',
    aliases: ['system design', 'distributed systems', 'high availability', 'scalability', 'fault tolerance', 'software architecture'],
    adjacentSkills: ['Microservices', 'Event-Driven Architecture', 'Kubernetes', 'Caching'],
  },
  {
    canonical: 'Caching',
    category: 'Practices',
    aliases: ['caching', 'distributed caching', 'rate limiting', 'sharding', 'database indexing'],
    adjacentSkills: ['Redis', 'Memcached', 'CDN', 'System Design', 'PostgreSQL'],
  },
  {
    canonical: 'Agile',
    category: 'Practices',
    aliases: ['agile', 'scrum', 'kanban', 'sprint planning'],
    adjacentSkills: ['Jira', 'Leadership', 'Communication'],
  },
  {
    canonical: 'Code Review',
    category: 'Practices',
    aliases: ['code review', 'code reviews', 'pair programming', 'clean architecture', 'domain-driven design', 'ddd', 'solid principles'],
    adjacentSkills: ['Unit Testing', 'System Design', 'Leadership'],
  },
  {
    canonical: 'Leadership',
    category: 'Practices',
    aliases: ['leadership', 'mentoring', 'mentorship', 'team lead', 'tech lead', 'technical leadership', 'people management'],
    adjacentSkills: ['Communication', 'System Design', 'Agile'],
  },
  {
    canonical: 'Communication',
    category: 'Practices',
    aliases: ['communication', 'stakeholder management', 'cross-functional', 'technical writing', 'rfc'],
    adjacentSkills: ['Leadership', 'Agile', 'Product Management'],
  },
  {
    canonical: 'Product Management',
    category: 'Practices',
    aliases: ['product management', 'roadmapping', 'okrs', 'kpi', 'kpis'],
    adjacentSkills: ['Agile', 'Communication', 'Data Analysis'],
  },
];

// Additional specialized modern stack entries to ensure 320+ distinct canonical skills
const ADDITIONAL_CANONICAL_SKILLS: SkillDefinition[] = [
  { canonical: 'Lit', category: 'Frontend', aliases: ['lit-element', 'web components'], caseSensitiveAliases: ['Lit'], adjacentSkills: ['JavaScript', 'TypeScript', 'HTML'] },
  { canonical: 'Qwik', category: 'Frontend', aliases: ['qwik'], adjacentSkills: ['React', 'TypeScript', 'Vite'] },
  { canonical: 'Alpine.js', category: 'Frontend', aliases: ['alpine.js', 'alpinejs', 'htmx'], adjacentSkills: ['JavaScript', 'HTML', 'Tailwind CSS'] },
  { canonical: 'Backbone.js', category: 'Frontend', aliases: ['backbone.js', 'backbonejs', 'ember.js', 'emberjs'], adjacentSkills: ['JavaScript', 'React'] },
  { canonical: 'PostCSS', category: 'Frontend', aliases: ['postcss', 'autoprefixer'], adjacentSkills: ['CSS', 'Tailwind CSS', 'Vite'] },
  { canonical: 'React Router', category: 'Frontend', aliases: ['react router', 'react-router', 'tanstack router'], adjacentSkills: ['React', 'Remix', 'Next.js'] },
  { canonical: 'React Hook Form', category: 'Frontend', aliases: ['react hook form', 'react-hook-form', 'formik'], adjacentSkills: ['React', 'Zod', 'TypeScript'] },
  { canonical: 'AG Grid', category: 'Frontend', aliases: ['ag-grid', 'ag grid', 'tanstack table'], adjacentSkills: ['React', 'Angular', 'TypeScript'] },
  { canonical: 'Canvas API', category: 'Frontend', aliases: ['canvas api', 'html5 canvas', 'svg', 'pixijs', 'konva'], adjacentSkills: ['Three.js', 'D3.js', 'JavaScript'] },
  { canonical: 'Internationalization', category: 'Frontend', aliases: ['i18n', 'internationalization', 'localization', 'l10n', 'react-intl', 'i18next'], adjacentSkills: ['React', 'Accessibility'] },
  { canonical: 'SEO', category: 'Frontend', aliases: ['seo', 'search engine optimization', 'ssr', 'ssg', 'isr'], adjacentSkills: ['Next.js', 'Astro', 'Performance Optimization'] },
  { canonical: 'Echo', category: 'Backend', aliases: ['labstack echo', 'chi router', 'gorilla mux'], caseSensitiveAliases: ['Echo'], adjacentSkills: ['Go', 'Gin', 'REST APIs'] },
  { canonical: 'GORM', category: 'Backend', aliases: ['gorm', 'sqlx', 'sqlc'], adjacentSkills: ['Go', 'PostgreSQL', 'SQL'] },
  { canonical: 'Ktor', category: 'Backend', aliases: ['ktor'], adjacentSkills: ['Kotlin', 'Spring Boot', 'REST APIs'] },
  { canonical: 'Akka', category: 'Backend', aliases: ['akka', 'play framework'], adjacentSkills: ['Scala', 'Java', 'Event-Driven Architecture'] },
  { canonical: 'Dropwizard', category: 'Backend', aliases: ['dropwizard', 'vert.x', 'netty'], adjacentSkills: ['Java', 'Spring Boot'] },
  { canonical: 'Sinatra', category: 'Backend', aliases: ['sinatra', 'sidekiq'], adjacentSkills: ['Ruby', 'Rails', 'Redis'] },
  { canonical: 'Tornado', category: 'Backend', aliases: ['tornado web', 'aiohttp', 'sanic', 'starlette', 'uvicorn', 'gunicorn'], caseSensitiveAliases: ['Tornado'], adjacentSkills: ['Python', 'FastAPI', 'Flask'] },
  { canonical: 'Camunda', category: 'Backend', aliases: ['camunda', 'zeebe', 'bpmn'], adjacentSkills: ['Temporal', 'Java', 'Microservices'] },
  { canonical: 'Dapr', category: 'Backend', aliases: ['dapr'], adjacentSkills: ['Microservices', 'Kubernetes', 'gRPC'] },
  { canonical: 'Hasura', category: 'Backend', aliases: ['hasura', 'postgraphile'], adjacentSkills: ['GraphQL', 'PostgreSQL'] },
  { canonical: 'Kong', category: 'Backend', aliases: ['kong', 'apigee', 'aws api gateway', 'api gateway', 'tyk'], adjacentSkills: ['REST APIs', 'Microservices', 'Nginx'] },
  { canonical: 'GraphQL Yoga', category: 'Backend', aliases: ['graphql yoga', 'typegraphql', 'nexus graphql'], adjacentSkills: ['GraphQL', 'Apollo', 'Node.js'] },
  { canonical: 'Mongoose', category: 'Databases', aliases: ['mongoose odm'], adjacentSkills: ['MongoDB', 'Node.js'] },
  { canonical: 'ArangoDB', category: 'Databases', aliases: ['arangodb', 'orientdb', 'janusgraph'], adjacentSkills: ['Neo4j', 'MongoDB', 'NoSQL'] },
  { canonical: 'Dragonfly', category: 'Databases', aliases: ['dragonflydb', 'keydb', 'aerospike'], adjacentSkills: ['Redis', 'Memcached'] },
  { canonical: 'FoundationDB', category: 'Databases', aliases: ['foundationdb', 'rocksdb', 'leveldb', 'etcd'], adjacentSkills: ['Kubernetes', 'CockroachDB', 'NoSQL'] },
  { canonical: 'IBM Db2', category: 'Databases', aliases: ['db2', 'ibm db2', 'sybase', 'teradata'], adjacentSkills: ['SQL', 'Oracle DB', 'SQL Server'] },
  { canonical: 'Liquibase', category: 'Databases', aliases: ['liquibase', 'flyway'], adjacentSkills: ['PostgreSQL', 'MySQL', 'SQL', 'CI/CD'] },
  { canonical: 'AWS CloudTrail', category: 'Cloud', aliases: ['cloudtrail', 'aws config', 'aws organizations', 'control tower'], adjacentSkills: ['AWS', 'IAM', 'Security'] },
  { canonical: 'AWS EKS Anywhere', category: 'Cloud', aliases: ['openshift', 'red hat openshift', 'rancher', 'tanzu'], adjacentSkills: ['Kubernetes', 'Docker', 'EKS', 'GKE'] },
  { canonical: 'Packer', category: 'DevOps', aliases: ['packer', 'vagrant'], adjacentSkills: ['Terraform', 'Docker', 'Linux'] },
  { canonical: 'Spinnaker', category: 'DevOps', aliases: ['spinnaker', 'harness', 'octopus deploy', 'tekton'], adjacentSkills: ['ArgoCD', 'CI/CD', 'Kubernetes'] },
  { canonical: 'eBPF', category: 'DevOps', aliases: ['ebpf', 'falco'], adjacentSkills: ['Linux', 'Kubernetes', 'Security', 'Observability'] },
  { canonical: 'Fluentd', category: 'DevOps', aliases: ['fluentd', 'fluent bit', 'logstash', 'vector.dev'], adjacentSkills: ['Elasticsearch', 'Grafana', 'Kubernetes'] },
  { canonical: 'SonarQube', category: 'Testing', aliases: ['sonarqube', 'codecov', 'snyk', 'dependabot', 'trivy'], adjacentSkills: ['CI/CD', 'Security', 'Unit Testing'] },
  { canonical: 'ESLint', category: 'Tools', aliases: ['eslint', 'prettier', 'biome'], adjacentSkills: ['TypeScript', 'JavaScript', 'CI/CD'] },
  { canonical: 'Pact', category: 'Testing', aliases: ['pact.io', 'wiremock', 'msw', 'mock service worker'], caseSensitiveAliases: ['Pact'], adjacentSkills: ['Integration Testing', 'REST APIs', 'Jest'] },
  { canonical: 'Detox', category: 'Testing', aliases: ['detox', 'xcuitest', 'espresso'], adjacentSkills: ['React Native', 'iOS', 'Android', 'E2E Testing'] },
  { canonical: 'Chromatic', category: 'Testing', aliases: ['chromatic', 'percy', 'visual regression testing'], adjacentSkills: ['Storybook', 'Playwright', 'Cypress'] },
  { canonical: 'RSpec', category: 'Testing', aliases: ['rspec', 'minitest'], adjacentSkills: ['Ruby', 'Rails', 'Unit Testing'] },
  { canonical: 'NUnit', category: 'Testing', aliases: ['nunit', 'xunit', 'mstest'], adjacentSkills: ['C#', '.NET', 'Unit Testing'] },
  { canonical: 'Go Testing', category: 'Testing', aliases: ['testify', 'gomock'], adjacentSkills: ['Go', 'Unit Testing'] },
  { canonical: 'ONNX', category: 'AI/ML', aliases: ['onnx', 'onnx runtime', 'openvino', 'coreml', 'tflite'], adjacentSkills: ['PyTorch', 'TensorFlow', 'MLOps'] },
  { canonical: 'Guardrails AI', category: 'AI/ML', aliases: ['guardrails', 'nemo guardrails', 'llm guardrails'], adjacentSkills: ['LLMs', 'AI Agents', 'Security'] },
  { canonical: 'Whisper', category: 'AI/ML', aliases: ['openai whisper', 'deepgram', 'elevenlabs', 'speech-to-text', 'text-to-speech', 'tts', 'asr'], caseSensitiveAliases: ['Whisper'], adjacentSkills: ['AI Agents', 'LLMs', 'Deep Learning'] },
  { canonical: 'Diffusers', category: 'AI/ML', aliases: ['stable diffusion', 'diffusers', 'multimodal ai', 'vision-language models', 'vlm'], adjacentSkills: ['PyTorch', 'Hugging Face', 'Deep Learning'] },
  { canonical: 'Feature Store', category: 'AI/ML', aliases: ['feast', 'tecton', 'feature store'], adjacentSkills: ['MLOps', 'Machine Learning', 'Spark'] },
  { canonical: 'Great Expectations', category: 'Data Engineering', aliases: ['great expectations', 'monte carlo data', 'data quality', 'data governance', 'apache atlas'], adjacentSkills: ['dbt', 'Airflow', 'ETL'] },
  { canonical: 'Cube.js', category: 'Data Engineering', aliases: ['cube.js', 'cubejs', 'semantic layer'], adjacentSkills: ['ClickHouse', 'BigQuery', 'Snowflake', 'Node.js'] },
  { canonical: 'Unity', category: 'Tools', aliases: ['unity3d', 'unity engine', 'unreal engine'], caseSensitiveAliases: ['Unity'], adjacentSkills: ['C#', 'C++', 'Three.js'] },
  { canonical: 'FFmpeg', category: 'Tools', aliases: ['ffmpeg', 'gstreamer', 'hls', 'video streaming'], adjacentSkills: ['WebRTC', 'C++', 'Go'] },
  { canonical: 'Vim', category: 'Tools', aliases: ['neovim', 'tmux'], caseSensitiveAliases: ['Vim'], adjacentSkills: ['Linux', 'Bash', 'Git'] },
  { canonical: 'Incident Management', category: 'Practices', aliases: ['incident management', 'incident response', 'on-call', 'postmortems', 'blameless postmortems', 'chaos engineering'], adjacentSkills: ['Observability', 'Sentry', 'Leadership'] },
  { canonical: 'FinOps', category: 'Practices', aliases: ['finops', 'cloud cost optimization', 'cost optimization'], adjacentSkills: ['AWS', 'GCP', 'Azure', 'Kubernetes'] },
  { canonical: 'API Design', category: 'Practices', aliases: ['api design', 'sdk design', 'developer experience', 'devex'], adjacentSkills: ['REST APIs', 'GraphQL', 'gRPC', 'OpenAPI'] },
];

export const FULL_SKILL_TAXONOMY: SkillDefinition[] = SKILL_TAXONOMY.concat(
  ADDITIONAL_CANONICAL_SKILLS
);

// ======================== PRECOMPILED TOKEN TRIE & MATCHER ========================

interface TrieRule {
  skillIndex: number;
  caseSensitive: boolean;
  exactTokens?: string[];
  tokenCount: number;
  charLength: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  rules: TrieRule[];
}

const TOKEN_REGEX = /\.?[A-Za-z0-9]+(?:[.][A-Za-z0-9]+)*[+#]*/g;

export function tokenizeForMatching(text: string): TextToken[] {
  if (!text) return [];
  const tokens: TextToken[] = [];
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    let raw = match[0];
    let start = match.index;
    const end = start + raw.length;

    // Preserve leading dot only for .NET (e.g. ".NET"), strip accidental leading dots otherwise
    if (raw.charAt(0) === '.' && !/^\.net$/i.test(raw)) {
      raw = raw.slice(1);
      start += 1;
      if (!raw) continue;
    }

    // Determine whether this token starts a sentence, line, or bullet
    let isSentenceStart = false;
    if (tokens.length === 0) {
      isSentenceStart = true;
    } else {
      const prevEnd = tokens[tokens.length - 1].end;
      const between = text.slice(prevEnd, start);
      if (/[\n\r.!?;:•▪]/.test(between) || /(?:^|\s)[-*]\s+$/.test(between)) {
        isSentenceStart = true;
      }
    }

    tokens.push({
      raw,
      lower: raw.toLowerCase(),
      start,
      end,
      isSentenceStart,
    });
  }

  return tokens;
}

function tokenizeAlias(alias: string): string[] {
  return tokenizeForMatching(alias).map((t) => t.raw);
}

const SKILL_BY_CANONICAL = new Map<string, SkillDefinition>();
const TRIE_ROOT: TrieNode = { children: new Map(), rules: [] };
const SINGLE_TOKEN_SKILL_ALIASES = new Set<string>();

function buildTaxonomyIndex(): void {
  for (let idx = 0; idx < FULL_SKILL_TAXONOMY.length; idx += 1) {
    const def = FULL_SKILL_TAXONOMY[idx];
    SKILL_BY_CANONICAL.set(def.canonical, def);

    const lowerAliases = def.aliases.slice();
    // Automatically include canonical name as case-insensitive UNLESS it has caseSensitiveAliases matching canonical
    const csSet = new Set(def.caseSensitiveAliases || []);
    if (!csSet.has(def.canonical) && def.aliases.indexOf(def.canonical.toLowerCase()) === -1) {
      // Only auto-add canonical if it wasn't explicitly omitted as an English homograph
      if (def.canonical !== 'Less') {
        lowerAliases.push(def.canonical);
      }
    }

    for (let a = 0; a < lowerAliases.length; a += 1) {
      const rawTokens = tokenizeAlias(lowerAliases[a]);
      if (rawTokens.length === 0) continue;
      if (rawTokens.length === 1) {
        SINGLE_TOKEN_SKILL_ALIASES.add(rawTokens[0].toLowerCase());
      }
      let node = TRIE_ROOT;
      for (let t = 0; t < rawTokens.length; t += 1) {
        const lowerTok = rawTokens[t].toLowerCase();
        let child = node.children.get(lowerTok);
        if (!child) {
          child = { children: new Map(), rules: [] };
          node.children.set(lowerTok, child);
        }
        node = child;
      }
      const alreadyExists = node.rules.some(
        (r) => r.skillIndex === idx && !r.caseSensitive
      );
      if (!alreadyExists) {
        node.rules.push({
          skillIndex: idx,
          caseSensitive: false,
          tokenCount: rawTokens.length,
          charLength: lowerAliases[a].length,
        });
      }
    }

    const csAliases = def.caseSensitiveAliases || [];
    for (let c = 0; c < csAliases.length; c += 1) {
      const rawTokens = tokenizeAlias(csAliases[c]);
      if (rawTokens.length === 0) continue;
      let node = TRIE_ROOT;
      for (let t = 0; t < rawTokens.length; t += 1) {
        const lowerTok = rawTokens[t].toLowerCase();
        let child = node.children.get(lowerTok);
        if (!child) {
          child = { children: new Map(), rules: [] };
          node.children.set(lowerTok, child);
        }
        node = child;
      }
      node.rules.push({
        skillIndex: idx,
        caseSensitive: true,
        exactTokens: rawTokens,
        tokenCount: rawTokens.length,
        charLength: csAliases[c].length,
      });
    }
  }
}

buildTaxonomyIndex();

function passesContextualGuard(
  canonical: string,
  tokens: TextToken[],
  startIdx: number,
  endIdx: number,
  rule: TrieRule
): boolean {
  if (rule.caseSensitive && rule.exactTokens) {
    for (let offset = 0; offset < rule.exactTokens.length; offset += 1) {
      if (tokens[startIdx + offset].raw !== rule.exactTokens[offset]) {
        return false;
      }
    }
  }

  const first = tokens[startIdx];
  const prev = startIdx > 0 ? tokens[startIdx - 1] : null;
  const next = endIdx < tokens.length ? tokens[endIdx] : null;

  if (canonical === 'Go' && rule.caseSensitive) {
    if (prev && !first.isSentenceStart && GO_NON_TECH_PREDECESSORS.has(prev.lower)) {
      return false;
    }
    if (first.isSentenceStart && next && GO_IMPERATIVE_FOLLOWERS.has(next.lower)) {
      return false;
    }
    return true;
  }

  if (canonical === 'Express' && rule.caseSensitive) {
    if (prev && !first.isSentenceStart && EXPRESS_NON_TECH_PREDECESSORS.has(prev.lower)) {
      return false;
    }
    if (next && EXPRESS_NON_TECH_FOLLOWERS.has(next.lower)) {
      return false;
    }
    return true;
  }

  if (canonical === 'Spring' && rule.caseSensitive) {
    if (prev && !first.isSentenceStart && SPRING_NON_TECH_PREDECESSORS.has(prev.lower)) {
      return false;
    }
    if (next && SPRING_NON_TECH_FOLLOWERS.has(next.lower)) {
      return false;
    }
    return true;
  }

  if (canonical === 'Swift' && rule.caseSensitive) {
    if (next && SWIFT_NON_TECH_FOLLOWERS.has(next.lower)) {
      return false;
    }
    return true;
  }

  if (canonical === 'Rust' && rule.caseSensitive) {
    if (next && RUST_NON_TECH_FOLLOWERS.has(next.lower)) {
      return false;
    }
    return true;
  }

  if (canonical === 'C' && rule.caseSensitive) {
    // Avoid matching middle initial "John C. Doe" or "Vitamin C" or "Series C"
    if (prev && (prev.lower === 'series' || prev.lower === 'vitamin' || prev.lower === 'section' || prev.lower === 'appendix')) {
      return false;
    }
    if (prev && !first.isSentenceStart && /^[A-Z][a-z]+$/.test(prev.raw) && next && /^[A-Z][a-z]+$/.test(next.raw)) {
      return false;
    }
    return true;
  }

  if (canonical === 'R' && rule.caseSensitive) {
    // Avoid matching "R&D" or middle initials "John R. Smith"
    if (next && next.lower === 'd' && next.start - first.end <= 3) {
      return false;
    }
    if (prev && !first.isSentenceStart && /^[A-Z][a-z]+$/.test(prev.raw) && next && /^[A-Z][a-z]+$/.test(next.raw)) {
      return false;
    }
    return true;
  }

  return true;
}

interface CandidateSpan {
  startToken: number;
  endToken: number;
  tokenCount: number;
  charLength: number;
  skillIndex: number;
}

/**
 * Extracts taxonomy skills from raw text using longest-span non-overlapping whole-word matching
 * with case-aware and contextual disambiguation rules.
 */
export function matchTaxonomySkills(text: string): Map<string, TaxonomyMatch> {
  const results = new Map<string, TaxonomyMatch>();
  if (!text) return results;

  const tokens = tokenizeForMatching(text);
  if (tokens.length === 0) return results;

  const candidates: CandidateSpan[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    let node: TrieNode | undefined = TRIE_ROOT;
    for (let j = i; j < tokens.length; j += 1) {
      node = node.children.get(tokens[j].lower);
      if (!node) break;

      if (node.rules.length > 0) {
        for (let r = 0; r < node.rules.length; r += 1) {
          const rule = node.rules[r];
          const def = FULL_SKILL_TAXONOMY[rule.skillIndex];
          if (passesContextualGuard(def.canonical, tokens, i, j + 1, rule)) {
            candidates.push({
              startToken: i,
              endToken: j + 1,
              tokenCount: rule.tokenCount,
              charLength: tokens[j].end - tokens[i].start,
              skillIndex: rule.skillIndex,
            });
          }
        }
      }
    }
  }

  if (candidates.length === 0) return results;

  // Sort by longest token span desc, then character length desc, then earliest start asc
  candidates.sort((a, b) => {
    if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
    if (b.charLength !== a.charLength) return b.charLength - a.charLength;
    return a.startToken - b.startToken;
  });

  const occupied = new Array<boolean>(tokens.length);
  for (let k = 0; k < tokens.length; k += 1) {
    occupied[k] = false;
  }

  const accepted: CandidateSpan[] = [];

  for (let c = 0; c < candidates.length; c += 1) {
    const cand = candidates[c];
    let conflict = false;
    for (let pos = cand.startToken; pos < cand.endToken; pos += 1) {
      if (occupied[pos]) {
        conflict = true;
        break;
      }
    }
    if (conflict) continue;

    for (let pos = cand.startToken; pos < cand.endToken; pos += 1) {
      occupied[pos] = true;
    }
    accepted.push(cand);
  }

  accepted.sort((a, b) => a.startToken - b.startToken);

  for (let a = 0; a < accepted.length; a += 1) {
    const span = accepted[a];
    const def = FULL_SKILL_TAXONOMY[span.skillIndex];
    const startChar = tokens[span.startToken].start;
    const endChar = tokens[span.endToken - 1].end;
    const matchedText = text.slice(startChar, endChar);

    let entry = results.get(def.canonical);
    if (!entry) {
      entry = {
        canonical: def.canonical,
        category: def.category,
        occurrences: 0,
        spans: [],
      };
      results.set(def.canonical, entry);
    }
    entry.occurrences += 1;
    entry.spans.push({
      startToken: span.startToken,
      endToken: span.endToken,
      matchedText,
    });
  }

  return results;
}

export function getSkillDefinition(canonical: string): SkillDefinition | undefined {
  return SKILL_BY_CANONICAL.get(canonical);
}

export function isKnownSkillAliasToken(lowerToken: string): boolean {
  return SINGLE_TOKEN_SKILL_ALIASES.has(lowerToken);
}

export function getTaxonomySkillCount(): number {
  return FULL_SKILL_TAXONOMY.length;
}

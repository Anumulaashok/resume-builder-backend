import {
  CanonicalSectionKind,
  PreparedSection,
  PreparedSectionItem,
  sanitizeSafeExternalUrl,
  sanitizeText,
} from './exportService';

export type TemplateLayout =
  | 'single'
  | 'two-column'
  | 'sidebar-left'
  | 'sidebar-right';

export type FontFamilyCategory = 'sans' | 'serif' | 'mono';
export type HeadingStyle = 'underline' | 'bar' | 'caps' | 'pill' | 'side-label';
export type SkillStyle = 'chips' | 'comma' | 'bars' | 'dots' | 'columns';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';
export type SpacingPreset = 'compact' | 'normal' | 'spacious';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface TemplateExportDefinition {
  id: string;
  layout: TemplateLayout;
  fontPairingId: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  headingColor: string;
  sectionSpacing: SpacingPreset;
  pageMargins: PageMarginPreset;
  headingStyle: HeadingStyle;
  skillStyle: SkillStyle;
  sidebarWidth: number;
  fontScale: number;
  lineHeight: number;
  sidebarKinds?: ReadonlySet<CanonicalSectionKind>;
}

export interface ResolvedExportTheme {
  templateId: string;
  layout: TemplateLayout;
  fontPairingId: string;
  headingFontCategory: FontFamilyCategory;
  bodyFontCategory: FontFamilyCategory;
  docxHeadingFont: string;
  docxBodyFont: string;
  primaryHex: string;
  accentHex: string;
  textHex: string;
  headingHex: string;
  primaryRgb: RgbColor;
  accentRgb: RgbColor;
  textRgb: RgbColor;
  headingRgb: RgbColor;
  fontScale: number;
  baseFontSizePt: number;
  lineHeight: number;
  pageMarginPt: number;
  pageMarginTwips: number;
  sectionSpacingPt: number;
  itemSpacingPt: number;
  headingStyle: HeadingStyle;
  skillStyle: SkillStyle;
  sidebarRatio: number;
  sidebarKinds: ReadonlySet<CanonicalSectionKind>;
}

const EMPTY_SET = new Set<CanonicalSectionKind>();

const TECH_SPLIT_SIDEBAR = new Set<CanonicalSectionKind>([
  'skills',
  'languages',
  'certificates',
  'awards',
  'courses',
  'interests',
  'references',
]);

const CREATIVE_SIDEBAR = new Set<CanonicalSectionKind>([
  'skills',
  'languages',
  'certificates',
  'interests',
  'awards',
]);

const TWO_COLUMN_SECONDARY = new Set<CanonicalSectionKind>([
  'skills',
  'education',
  'languages',
  'certificates',
  'awards',
  'courses',
  'interests',
  'references',
]);

const STARTUP_SIDEBAR = new Set<CanonicalSectionKind>([
  'skills',
  'education',
  'certificates',
  'awards',
  'languages',
  'interests',
  'courses',
]);

export const TEMPLATE_EXPORT_DEFINITIONS: Record<string, TemplateExportDefinition> = {
  modern: {
    id: 'modern',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#2563eb',
    textColor: '#374151',
    headingColor: '#111827',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'underline',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 1,
    lineHeight: 1.5,
  },
  professional: {
    id: 'professional',
    layout: 'single',
    fontPairingId: 'classic-serif',
    primaryColor: '#1e293b',
    accentColor: '#1e293b',
    textColor: '#334155',
    headingColor: '#1e293b',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'underline',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 1,
    lineHeight: 1.5,
  },
  minimal: {
    id: 'minimal',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#374151',
    accentColor: '#475569',
    textColor: '#374151',
    headingColor: '#111827',
    sectionSpacing: 'spacious',
    pageMargins: 'normal',
    headingStyle: 'caps',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 1,
    lineHeight: 1.55,
  },
  'tech-split': {
    id: 'tech-split',
    layout: 'sidebar-right',
    fontPairingId: 'technical-mono',
    primaryColor: '#0f766e',
    accentColor: '#0f766e',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'compact',
    pageMargins: 'narrow',
    headingStyle: 'bar',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 0.96,
    lineHeight: 1.45,
    sidebarKinds: TECH_SPLIT_SIDEBAR,
  },
  'creative-sidebar': {
    id: 'creative-sidebar',
    layout: 'sidebar-left',
    fontPairingId: 'elegant-hybrid',
    primaryColor: '#7c3aed',
    accentColor: '#7c3aed',
    textColor: '#374151',
    headingColor: '#1e1b4b',
    sectionSpacing: 'normal',
    pageMargins: 'narrow',
    headingStyle: 'pill',
    skillStyle: 'bars',
    sidebarWidth: 33,
    fontScale: 0.98,
    lineHeight: 1.5,
    sidebarKinds: CREATIVE_SIDEBAR,
  },
  'two-column': {
    id: 'two-column',
    layout: 'two-column',
    fontPairingId: 'elegant-hybrid',
    primaryColor: '#2563eb',
    accentColor: '#2563eb',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'compact',
    pageMargins: 'narrow',
    headingStyle: 'side-label',
    skillStyle: 'dots',
    sidebarWidth: 40,
    fontScale: 0.96,
    lineHeight: 1.45,
    sidebarKinds: TWO_COLUMN_SECONDARY,
  },
  classic: {
    id: 'classic',
    layout: 'single',
    fontPairingId: 'classic-serif',
    primaryColor: '#1e293b',
    accentColor: '#334155',
    textColor: '#1f2937',
    headingColor: '#111827',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'underline',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 1,
    lineHeight: 1.5,
  },
  executive: {
    id: 'executive',
    layout: 'single',
    fontPairingId: 'elegant-hybrid',
    primaryColor: '#1e293b',
    accentColor: '#2563eb',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'caps',
    skillStyle: 'columns',
    sidebarWidth: 32,
    fontScale: 1,
    lineHeight: 1.5,
  },
  compact: {
    id: 'compact',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#334155',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'compact',
    pageMargins: 'narrow',
    headingStyle: 'underline',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 0.85,
    lineHeight: 1.3,
  },
  timeline: {
    id: 'timeline',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#059669',
    textColor: '#374151',
    headingColor: '#0f172a',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'side-label',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 0.98,
    lineHeight: 1.5,
  },
  'bold-header': {
    id: 'bold-header',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#991b1b',
    textColor: '#374151',
    headingColor: '#111827',
    sectionSpacing: 'compact',
    pageMargins: 'narrow',
    headingStyle: 'bar',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 0.96,
    lineHeight: 1.45,
  },
  elegant: {
    id: 'elegant',
    layout: 'single',
    fontPairingId: 'elegant-hybrid',
    primaryColor: '#1e293b',
    accentColor: '#b45309',
    textColor: '#374151',
    headingColor: '#111827',
    sectionSpacing: 'compact',
    pageMargins: 'normal',
    headingStyle: 'underline',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 0.98,
    lineHeight: 1.52,
  },
  'accent-sidebar': {
    id: 'accent-sidebar',
    layout: 'sidebar-left',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#2563eb',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'normal',
    pageMargins: 'narrow',
    headingStyle: 'underline',
    skillStyle: 'chips',
    sidebarWidth: 33,
    fontScale: 0.98,
    lineHeight: 1.5,
    sidebarKinds: CREATIVE_SIDEBAR,
  },
  banded: {
    id: 'banded',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#1e293b',
    accentColor: '#0f766e',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'normal',
    pageMargins: 'narrow',
    headingStyle: 'side-label',
    skillStyle: 'columns',
    sidebarWidth: 32,
    fontScale: 0.97,
    lineHeight: 1.48,
  },
  developer: {
    id: 'developer',
    layout: 'single',
    fontPairingId: 'modern-sans',
    primaryColor: '#0f172a',
    accentColor: '#0284c7',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'compact',
    pageMargins: 'normal',
    headingStyle: 'bar',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 0.98,
    lineHeight: 1.48,
  },
  startup: {
    id: 'startup',
    layout: 'sidebar-right',
    fontPairingId: 'modern-sans',
    primaryColor: '#0f172a',
    accentColor: '#ea580c',
    textColor: '#334155',
    headingColor: '#0f172a',
    sectionSpacing: 'compact',
    pageMargins: 'narrow',
    headingStyle: 'pill',
    skillStyle: 'chips',
    sidebarWidth: 32,
    fontScale: 0.97,
    lineHeight: 1.48,
    sidebarKinds: STARTUP_SIDEBAR,
  },
  academic: {
    id: 'academic',
    layout: 'single',
    fontPairingId: 'classic-serif',
    primaryColor: '#1e293b',
    accentColor: '#7f1d1d',
    textColor: '#1f2937',
    headingColor: '#111827',
    sectionSpacing: 'normal',
    pageMargins: 'normal',
    headingStyle: 'underline',
    skillStyle: 'comma',
    sidebarWidth: 32,
    fontScale: 0.96,
    lineHeight: 1.48,
  },
};

const VALID_HEADING_STYLES = new Set<HeadingStyle>([
  'underline',
  'bar',
  'caps',
  'pill',
  'side-label',
]);

const VALID_SKILL_STYLES = new Set<SkillStyle>([
  'chips',
  'comma',
  'bars',
  'dots',
  'columns',
]);

const VALID_MARGIN_PRESETS = new Set<PageMarginPreset>(['narrow', 'normal', 'wide']);
const VALID_SPACING_PRESETS = new Set<SpacingPreset>(['compact', 'normal', 'spacious']);

export function normalizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback.replace('#', '');
  const trimmed = raw.trim();
  const six = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (six) return six[1].toLowerCase();
  const three = trimmed.match(/^#?([0-9a-fA-F]{3})$/);
  if (three) {
    return three[1]
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toLowerCase();
  }
  return fallback.replace('#', '').toLowerCase();
}

export function hexToRgbColor(hexNoHash: string): RgbColor {
  const clean = normalizeHexColor(hexNoHash, '1e293b');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function resolveFontCategories(
  fontPairingId: string,
  explicitHeadingFont?: unknown,
  explicitBodyFont?: unknown
): {
  headingFontCategory: FontFamilyCategory;
  bodyFontCategory: FontFamilyCategory;
  docxHeadingFont: string;
  docxBodyFont: string;
} {
  const classifyCssStack = (stack: string, fallback: FontFamilyCategory): FontFamilyCategory => {
    const lower = stack.toLowerCase();
    if (lower.includes('mono') || lower.includes('consolas') || lower.includes('menlo')) {
      return 'mono';
    }
    if (
      (lower.includes('serif') && !lower.includes('sans-serif')) ||
      lower.includes('georgia') ||
      lower.includes('merriweather') ||
      lower.includes('playfair') ||
      lower.includes('times')
    ) {
      return 'serif';
    }
    if (lower.includes('sans') || lower.includes('inter') || lower.includes('roboto')) {
      return 'sans';
    }
    return fallback;
  };

  let headingCat: FontFamilyCategory = 'sans';
  let bodyCat: FontFamilyCategory = 'sans';

  if (fontPairingId === 'classic-serif') {
    headingCat = 'serif';
    bodyCat = 'serif';
  } else if (fontPairingId === 'elegant-hybrid') {
    headingCat = 'serif';
    bodyCat = 'sans';
  } else if (fontPairingId === 'technical-mono') {
    headingCat = 'mono';
    bodyCat = 'sans';
  }

  if (typeof explicitHeadingFont === 'string' && explicitHeadingFont.trim()) {
    headingCat = classifyCssStack(explicitHeadingFont, headingCat);
  }
  if (typeof explicitBodyFont === 'string' && explicitBodyFont.trim()) {
    bodyCat = classifyCssStack(explicitBodyFont, bodyCat);
  }

  const toDocxName = (cat: FontFamilyCategory) =>
    cat === 'serif' ? 'Georgia' : cat === 'mono' ? 'Consolas' : 'Calibri';

  return {
    headingFontCategory: headingCat,
    bodyFontCategory: bodyCat,
    docxHeadingFont: toDocxName(headingCat),
    docxBodyFont: toDocxName(bodyCat),
  };
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function resolveExportTheme(rawResume: Record<string, any>): ResolvedExportTheme {
  const rawTemplateId =
    typeof rawResume?.templateId === 'string'
      ? rawResume.templateId.trim().toLowerCase()
      : 'modern';
  const def =
    TEMPLATE_EXPORT_DEFINITIONS[rawTemplateId] || TEMPLATE_EXPORT_DEFINITIONS.modern;

  const themeConfig =
    rawResume?.themeConfig && typeof rawResume.themeConfig === 'object'
      ? (rawResume.themeConfig as Record<string, unknown>)
      : {};

  const fontPairingId =
    typeof themeConfig.fontPairingId === 'string' && themeConfig.fontPairingId.trim()
      ? themeConfig.fontPairingId.trim()
      : def.fontPairingId;

  const fonts = resolveFontCategories(
    fontPairingId,
    themeConfig.headingFont,
    themeConfig.bodyFont
  );

  const primaryHex = normalizeHexColor(themeConfig.primaryColor, def.primaryColor);
  const accentHex = normalizeHexColor(
    themeConfig.accentColor ?? themeConfig.primaryColor,
    def.accentColor || `#${primaryHex}`
  );
  const textHex = normalizeHexColor(themeConfig.textColor, def.textColor);
  const headingHex = normalizeHexColor(
    themeConfig.headingColor ?? (themeConfig.primaryColor ? themeConfig.primaryColor : undefined),
    def.headingColor || `#${primaryHex}`
  );

  const fontScale = clampNumber(themeConfig.fontScale, 0.85, 1.2, def.fontScale);
  const lineHeight = clampNumber(themeConfig.lineHeight, 1.2, 1.8, def.lineHeight);

  const rawMargins =
    typeof themeConfig.pageMargins === 'string'
      ? (themeConfig.pageMargins.trim() as PageMarginPreset)
      : def.pageMargins;
  const marginPreset: PageMarginPreset = VALID_MARGIN_PRESETS.has(rawMargins)
    ? rawMargins
    : def.pageMargins;

  const pageMarginPt =
    marginPreset === 'narrow' ? 35.43 : marginPreset === 'wide' ? 63.78 : 49.61;
  const pageMarginTwips =
    marginPreset === 'narrow' ? 709 : marginPreset === 'wide' ? 1276 : 992;

  const rawSpacing =
    typeof themeConfig.sectionSpacing === 'string'
      ? (themeConfig.sectionSpacing.trim() as SpacingPreset)
      : def.sectionSpacing;
  const spacingPreset: SpacingPreset = VALID_SPACING_PRESETS.has(rawSpacing)
    ? rawSpacing
    : def.sectionSpacing;

  const sectionSpacingPt =
    spacingPreset === 'compact' ? 11 : spacingPreset === 'spacious' ? 20 : 15;
  const itemSpacingPt =
    spacingPreset === 'compact' ? 6 : spacingPreset === 'spacious' ? 12 : 8.5;

  const rawHeadingStyle =
    typeof themeConfig.headingStyle === 'string'
      ? (themeConfig.headingStyle.trim() as HeadingStyle)
      : def.headingStyle;
  const headingStyle: HeadingStyle = VALID_HEADING_STYLES.has(rawHeadingStyle)
    ? rawHeadingStyle
    : def.headingStyle;

  const rawSkillStyle =
    typeof themeConfig.skillStyle === 'string'
      ? (themeConfig.skillStyle.trim() as SkillStyle)
      : def.skillStyle;
  const skillStyle: SkillStyle = VALID_SKILL_STYLES.has(rawSkillStyle)
    ? rawSkillStyle
    : def.skillStyle;

  let sidebarPct = def.sidebarWidth;
  if (typeof themeConfig.sidebarWidth === 'number') {
    sidebarPct =
      themeConfig.sidebarWidth <= 60
        ? themeConfig.sidebarWidth
        : (themeConfig.sidebarWidth / 794) * 100;
  } else if (typeof themeConfig.sidebarWidth === 'string') {
    const parsed = parseFloat(themeConfig.sidebarWidth);
    if (Number.isFinite(parsed)) {
      sidebarPct =
        themeConfig.sidebarWidth.includes('px') || parsed > 60
          ? (parsed / 794) * 100
          : parsed;
    }
  }
  const clampedSidebarPct = clampNumber(sidebarPct, 25, 44, def.sidebarWidth);

  return {
    templateId: def.id,
    layout: def.layout,
    fontPairingId,
    ...fonts,
    primaryHex,
    accentHex,
    textHex,
    headingHex,
    primaryRgb: hexToRgbColor(primaryHex),
    accentRgb: hexToRgbColor(accentHex),
    textRgb: hexToRgbColor(textHex),
    headingRgb: hexToRgbColor(headingHex),
    fontScale,
    baseFontSizePt: Number((10 * fontScale).toFixed(2)),
    lineHeight,
    pageMarginPt,
    pageMarginTwips,
    sectionSpacingPt,
    itemSpacingPt,
    headingStyle,
    skillStyle,
    sidebarRatio: clampedSidebarPct / 100,
    sidebarKinds: def.sidebarKinds || EMPTY_SET,
  };
}

export interface StructuredExportItem {
  title: string;
  subtitle: string;
  dateRange: string;
  location: string;
  metaExtras: string[];
  links: Array<{ label: string; href: string }>;
  description: string;
  bullets: string[];
  keywordsLabel: string;
  keywords: string[];
  skillScore: number | null;
}

export function resolveSkillProficiencyScore(rawLevel: unknown): number | null {
  if (typeof rawLevel === 'number' && Number.isFinite(rawLevel)) {
    if (rawLevel <= 5) return Math.max(0.2, Math.min(1, rawLevel / 5));
    return Math.max(0.2, Math.min(1, rawLevel / 100));
  }
  if (typeof rawLevel === 'string') {
    const lower = rawLevel.trim().toLowerCase();
    if (!lower) return null;
    if (lower.includes('expert') || lower.includes('native') || lower.includes('master')) {
      return 1;
    }
    if (lower.includes('advanced') || lower.includes('fluent') || lower.includes('senior')) {
      return 0.85;
    }
    if (lower.includes('intermediate') || lower.includes('proficient')) {
      return 0.65;
    }
    if (lower.includes('beginner') || lower.includes('basic') || lower.includes('elementary')) {
      return 0.4;
    }
    const numeric = Number(lower.replace(/%/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric <= 5
        ? Math.max(0.2, Math.min(1, numeric / 5))
        : Math.max(0.2, Math.min(1, numeric / 100));
    }
  }
  return null;
}

export function extractStructuredItem(
  section: PreparedSection,
  item: PreparedSectionItem
): StructuredExportItem {
  const raw = item.raw;
  const links: Array<{ label: string; href: string }> = [];
  if (item.url) {
    links.push({ label: item.urlLabel || item.url, href: item.url });
  }
  const githubSafe = sanitizeSafeExternalUrl(raw.github ?? raw.repoUrl);
  if (githubSafe && githubSafe !== item.url) {
    const cleanLabel = githubSafe.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
    links.push({ label: cleanLabel || githubSafe, href: githubSafe });
  }

  const extraBullets: string[] = [];
  if (Array.isArray(raw.responsibilities)) {
    raw.responsibilities
      .slice(0, 40)
      .map((r) => sanitizeText(r, 1000))
      .filter(Boolean)
      .forEach((r) => {
        if (!item.highlights.includes(r)) extraBullets.push(r);
      });
  }
  if (section.kind === 'education' && Array.isArray(raw.courses)) {
    const courseNames = raw.courses
      .slice(0, 30)
      .map((c) => sanitizeText(c, 120))
      .filter(Boolean);
    if (courseNames.length > 0) {
      extraBullets.push(`Relevant Coursework: ${courseNames.join(', ')}`);
    }
  }
  const bullets = [...item.highlights, ...extraBullets];

  if (section.kind === 'work') {
    const position = sanitizeText(
      raw.position ?? raw.role ?? raw.jobTitle ?? raw.title,
      160
    );
    const company = sanitizeText(
      raw.company ?? raw.name ?? raw.organization ?? raw.employer,
      160
    );
    return {
      title: position || company,
      subtitle: position ? company : '',
      dateRange: item.dateRange,
      location: item.location,
      metaExtras: [],
      links,
      description: sanitizeText(raw.description ?? raw.summary),
      bullets,
      keywordsLabel: 'Technologies',
      keywords: item.keywords,
      skillScore: null,
    };
  }

  if (section.kind === 'education') {
    const degree =
      sanitizeText(raw.degree, 160) ||
      [sanitizeText(raw.studyType, 80), sanitizeText(raw.area, 80)]
        .filter(Boolean)
        .join(' in ');
    const field = sanitizeText(
      raw.field ?? (raw.degree && raw.area ? raw.area : ''),
      160
    );
    const institution = sanitizeText(
      raw.institution ?? raw.school ?? raw.name,
      160
    );
    const gpa = sanitizeText(raw.gpa ?? raw.score, 40);
    const degreeLine = [degree, field].filter(Boolean).join(' - ');
    return {
      title: degreeLine || institution,
      subtitle: degreeLine ? institution : '',
      dateRange: item.dateRange,
      location: item.location,
      metaExtras: gpa ? [`GPA: ${gpa}`] : [],
      links,
      description: sanitizeText(raw.description ?? raw.summary),
      bullets,
      keywordsLabel: 'Coursework',
      keywords: item.keywords,
      skillScore: null,
    };
  }

  if (section.kind === 'projects') {
    const title = sanitizeText(raw.name ?? raw.title, 160);
    const role = sanitizeText(raw.position ?? raw.role, 120);
    const company = sanitizeText(
      raw.company ?? raw.organization ?? raw.entity,
      120
    );
    const sub = [role, company].filter(Boolean).join(' · ');
    return {
      title: title || sub,
      subtitle: title ? sub : '',
      dateRange: item.dateRange,
      location: item.location,
      metaExtras: [],
      links,
      description: sanitizeText(raw.description ?? raw.summary),
      bullets,
      keywordsLabel: 'Technologies',
      keywords: item.keywords,
      skillScore: null,
    };
  }

  if (section.kind === 'publications') {
    const title = sanitizeText(raw.name ?? raw.title, 200);
    const publisher = sanitizeText(raw.publisher ?? raw.journal ?? raw.venue, 160);
    const authors = Array.isArray(raw.authors)
      ? raw.authors
          .slice(0, 20)
          .map((a) => sanitizeText(a, 80))
          .filter(Boolean)
          .join(', ')
      : sanitizeText(raw.authors, 200);
    return {
      title: title || publisher,
      subtitle: title ? publisher : '',
      dateRange: item.dateRange,
      location: item.location,
      metaExtras: authors ? [authors] : [],
      links,
      description: sanitizeText(raw.description ?? raw.summary),
      bullets,
      keywordsLabel: 'Keywords',
      keywords: item.keywords,
      skillScore: null,
    };
  }

  const primary = sanitizeText(
    raw.title ??
      raw.name ??
      raw.course ??
      raw.language ??
      raw.organization ??
      raw.institution ??
      raw.company ??
      raw.degree,
    160
  );
  const secondary = sanitizeText(
    raw.position ??
      raw.role ??
      raw.subtitle ??
      raw.issuer ??
      raw.awarder ??
      raw.publisher ??
      (raw.title && raw.company ? raw.company : '') ??
      (raw.course && raw.institution ? raw.institution : '') ??
      raw.fluency ??
      (typeof raw.level === 'string' ? raw.level : ''),
    160
  );
  const contact = sanitizeText(raw.contact ?? raw.email ?? raw.phone, 160);

  return {
    title: primary || secondary,
    subtitle: primary && secondary && primary !== secondary ? secondary : '',
    dateRange: item.dateRange,
    location: item.location,
    metaExtras: contact ? [contact] : [],
    links,
    description: sanitizeText(raw.description ?? raw.summary ?? raw.reference),
    bullets,
    keywordsLabel: 'Keywords',
    keywords: item.keywords,
    skillScore: resolveSkillProficiencyScore(raw.level ?? raw.fluency),
  };
}

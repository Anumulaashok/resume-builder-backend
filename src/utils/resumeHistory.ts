export const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_HISTORY_SNAPSHOTS = 30;

export const SUBSTANTIAL_WORD_DELTA = 20;
export const SUBSTANTIAL_CHAR_DELTA = 150;
export const SUBSTANTIAL_RELATIVE_WORD_RATIO = 0.3;
export const SUBSTANTIAL_RELATIVE_MIN_WORDS = 10;

const IGNORED_TEXT_KEYS = new Set([
  'id',
  '_id',
  'type',
  'sectionOrder',
  'isCustom',
  'enabled',
  'current',
]);

export interface HistoryEntryLike {
  title?: string;
  summary?: string;
  content?: any;
  themeConfig?: any;
  updatedAt?: Date | string;
}

export interface HistorySummaryItem {
  index: number;
  updatedAt: Date | string;
  title: string;
  summary: string;
  sectionCount: number;
  wordCount: number;
}

export function cloneSnapshotValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function collectTextFragments(
  value: unknown,
  fragments: string[],
  parentKey?: string,
  seen: WeakSet<object> = new WeakSet()
): void {
  if (value === null || value === undefined) {
    return;
  }

  // Guard against cyclic structures (e.g. Mongoose subdocument parent refs).
  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return;
    }
    seen.add(value as object);
  }

  if (parentKey && IGNORED_TEXT_KEYS.has(parentKey)) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      fragments.push(trimmed);
    }
    return;
  }

  if (typeof value === 'number') {
    if (parentKey === 'year' || parentKey === 'month') {
      fragments.push(String(value));
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, fragments, undefined, seen);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (IGNORED_TEXT_KEYS.has(key)) {
        continue;
      }
      collectTextFragments(nested, fragments, key, seen);
    }
  }
}

export function extractResumeWords(content: any, fallbackSummary?: string): string[] {
  if (!content || typeof content !== 'object') {
    if (typeof fallbackSummary === 'string' && fallbackSummary.trim().length > 0) {
      return fallbackSummary.trim().split(/\s+/).filter(Boolean);
    }
    return [];
  }

  const fragments: string[] = [];
  collectTextFragments(content.basics, fragments);

  const hasBasicsSummary =
    typeof content?.basics?.summary === 'string' && content.basics.summary.trim().length > 0;
  if (!hasBasicsSummary && typeof fallbackSummary === 'string' && fallbackSummary.trim().length > 0) {
    fragments.push(fallbackSummary.trim());
  }

  if (Array.isArray(content.sections)) {
    for (const section of content.sections) {
      collectTextFragments(section, fragments);
    }
  }

  if (fragments.length === 0) {
    return [];
  }

  return fragments
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function countResumeWords(content: any, fallbackSummary?: string): number {
  return extractResumeWords(content, fallbackSummary).length;
}

export function countResumeSections(content: any): number {
  return Array.isArray(content?.sections) ? content.sections.length : 0;
}

function getSectionSignature(content: any): string {
  if (!Array.isArray(content?.sections)) {
    return '';
  }
  return content.sections
    .map((sec: any, idx: number) => String(sec?.id ?? sec?.type ?? sec?.title ?? idx))
    .sort()
    .join('|');
}

function computeChangedWordCount(prevWords: string[], nextWords: string[]): number {
  const prevCounts = new Map<string, number>();
  for (const raw of prevWords) {
    const token = raw.toLowerCase();
    prevCounts.set(token, (prevCounts.get(token) || 0) + 1);
  }

  const nextCounts = new Map<string, number>();
  for (const raw of nextWords) {
    const token = raw.toLowerCase();
    nextCounts.set(token, (nextCounts.get(token) || 0) + 1);
  }

  let added = 0;
  let removed = 0;

  const allTokens = new Set<string>([...prevCounts.keys(), ...nextCounts.keys()]);
  for (const token of allTokens) {
    const p = prevCounts.get(token) || 0;
    const n = nextCounts.get(token) || 0;
    if (n > p) {
      added += n - p;
    } else if (p > n) {
      removed += p - n;
    }
  }

  return Math.max(added, removed);
}

export function isSubstantialContentChange(
  prevContent: any,
  nextContent: any,
  prevSummary?: string,
  nextSummary?: string
): boolean {
  const prevSectionCount = countResumeSections(prevContent);
  const nextSectionCount = countResumeSections(nextContent);
  if (prevSectionCount !== nextSectionCount) {
    return true;
  }

  if (getSectionSignature(prevContent) !== getSectionSignature(nextContent)) {
    return true;
  }

  const prevWords = extractResumeWords(prevContent, prevSummary);
  const nextWords = extractResumeWords(nextContent, nextSummary);

  const changedWords = computeChangedWordCount(prevWords, nextWords);
  if (changedWords >= SUBSTANTIAL_WORD_DELTA) {
    return true;
  }

  const prevCharLength = prevWords.join(' ').length;
  const nextCharLength = nextWords.join(' ').length;
  if (Math.abs(nextCharLength - prevCharLength) >= SUBSTANTIAL_CHAR_DELTA) {
    return true;
  }

  const baselineWords = Math.max(prevWords.length, 1);
  if (
    changedWords >= SUBSTANTIAL_RELATIVE_MIN_WORDS &&
    changedWords / baselineWords >= SUBSTANTIAL_RELATIVE_WORD_RATIO
  ) {
    return true;
  }

  return false;
}

export function shouldCreateSnapshot(params: {
  history?: HistoryEntryLike[];
  prevContent: any;
  nextContent: any;
  prevSummary?: string;
  nextSummary?: string;
  contentChanged: boolean;
  themeChanged: boolean;
  now?: Date;
}): boolean {
  const {
    history,
    prevContent,
    nextContent,
    prevSummary,
    nextSummary,
    contentChanged,
    themeChanged,
    now = new Date(),
  } = params;

  if (!contentChanged && !themeChanged) {
    return false;
  }

  const lastSnapshot =
    Array.isArray(history) && history.length > 0 ? history[history.length - 1] : undefined;

  if (!lastSnapshot) {
    return true;
  }

  if (!lastSnapshot.updatedAt) {
    return true;
  }

  const lastTimestamp = new Date(lastSnapshot.updatedAt).getTime();
  if (Number.isNaN(lastTimestamp) || now.getTime() - lastTimestamp > SNAPSHOT_MIN_INTERVAL_MS) {
    return true;
  }

  if (
    contentChanged &&
    isSubstantialContentChange(prevContent, nextContent, prevSummary, nextSummary)
  ) {
    return true;
  }

  return false;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`;
}

function formatSignedDelta(delta: number, singular: string, plural = `${singular}s`): string {
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${Math.abs(delta)} ${Math.abs(delta) === 1 ? singular : plural}`;
}

export function buildSnapshotChangeSummary(
  entry: HistoryEntryLike,
  previousEntry?: HistoryEntryLike
): { sectionCount: number; wordCount: number; summary: string } {
  const sectionCount = countResumeSections(entry?.content);
  const wordCount = countResumeWords(entry?.content, entry?.summary);
  const baseLabel = `${pluralize(sectionCount, 'section')} · ${pluralize(wordCount, 'word')}`;

  if (!previousEntry) {
    return { sectionCount, wordCount, summary: baseLabel };
  }

  const prevSectionCount = countResumeSections(previousEntry?.content);
  const prevWordCount = countResumeWords(previousEntry?.content, previousEntry?.summary);

  const sectionDelta = sectionCount - prevSectionCount;
  const wordDelta = wordCount - prevWordCount;

  const deltaParts: string[] = [];
  if (sectionDelta !== 0) {
    deltaParts.push(formatSignedDelta(sectionDelta, 'section'));
  }
  if (wordDelta !== 0) {
    deltaParts.push(formatSignedDelta(wordDelta, 'word'));
  }

  if (deltaParts.length > 0) {
    return {
      sectionCount,
      wordCount,
      summary: `${baseLabel} (${deltaParts.join(', ')})`,
    };
  }

  const themeDiff =
    JSON.stringify(entry?.themeConfig ?? null) !==
    JSON.stringify(previousEntry?.themeConfig ?? null);
  const contentDiff =
    JSON.stringify(entry?.content ?? null) !==
    JSON.stringify(previousEntry?.content ?? null);

  if (themeDiff && !contentDiff) {
    return { sectionCount, wordCount, summary: `${baseLabel} (theme updated)` };
  }
  if (contentDiff) {
    return { sectionCount, wordCount, summary: `${baseLabel} (content edited)` };
  }

  return { sectionCount, wordCount, summary: baseLabel };
}

export function buildHistorySummaryList(
  history: HistoryEntryLike[] | undefined,
  fallbackTitle: string
): HistorySummaryItem[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const items: HistorySummaryItem[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    const prevEntry = i > 0 ? history[i - 1] : undefined;
    const { sectionCount, wordCount, summary } = buildSnapshotChangeSummary(entry, prevEntry);
    const resolvedTitle =
      (typeof entry?.title === 'string' && entry.title.trim()) ||
      fallbackTitle ||
      'Untitled Resume';

    items.push({
      index: i,
      updatedAt: entry?.updatedAt ?? new Date(0),
      title: resolvedTitle,
      summary,
      sectionCount,
      wordCount,
    });
  }

  return items;
}

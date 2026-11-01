// One Google Doc, as exported to plain text, read into an edition.
//
// The contract (v1): the document is literal Markdown whose first lines are a
// small YAML header (schema_version, content_type, edition_date, generated_at,
// title, topics), then the briefing, untouched. The header is never shown.
// When it is missing or wrong, the filename (`YYYY-MM-DD_HHmm__<type>`) and
// Drive's own dates stand in, and `issues` says so: nothing is invented, and
// the edition still reads. The body is kept exactly as written. An optional
// `origin` says whether a scheduled run published it or it was imported by
// hand; without it, nobody knows, and the edition says nothing either way.
import { load, CORE_SCHEMA } from 'js-yaml';
import { TZ, isValidDayKey, dayKeyOf, type DayKey } from '../routine/dates';
import { feedById, type FeedId } from './feeds';

/** What the server sends for a document in a feed folder. */
export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime: string;
  webViewLink?: string;
}

export interface Edition {
  driveFileId: string;
  feedId: FeedId;
  title: string;
  /** The run's date in Paris, from the header, else the filename, else Drive. */
  editionDate: DayKey;
  /** From the header only, ISO 8601 with its offset. */
  generatedAt: string | null;
  /** The run's time in Paris, `HH:mm`, from the header or the filename. */
  time: string | null;
  topics: string[];
  /** Everything after the header, as written. */
  markdownBody: string;
  /** The private Google Doc. */
  sourceUrl: string;
  modifiedTime: string;
  /** What the header lacked or got wrong. Empty for a valid v1 document. */
  issues: string[];
  /** From the header's `origin`; null when it does not say. */
  origin: 'scheduled' | 'backfill' | null;
  /** The Drive file's name, for telling copies apart; never shown as a title. */
  fileName: string;
  /** When Drive created the file: a document still being written is young. */
  createdTime: string | null;
  /** Newest first sorts by this, descending: date, then time of day. */
  sortKey: string;
}

const FILENAME = /^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})__([a-z0-9-]+)$/;
const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

const parisTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

interface Header {
  values: Record<string, unknown> | null;
  body: string;
  problem?: string;
}

/** A header is a few lines; a "closing" line further down is the body's own rule. */
const MAX_HEADER_LINES = 40;

/** Splits off the YAML header. A header that cannot be read is still removed. */
function splitHeader(text: string): Header {
  if (!/^---[ \t]*\n/.test(text)) return { values: null, body: text, problem: 'no header' };
  const close = /\n---[ \t]*(?:\n|$)/.exec(text.slice(3));
  const yaml = close ? text.slice(text.indexOf('\n') + 1, 3 + close.index + 1) : '';
  if (!close || yaml.split('\n').length > MAX_HEADER_LINES) {
    return { values: null, body: text, problem: 'header not closed' };
  }
  const body = text.slice(3 + close.index + close[0].length).replace(/^\n+/, '');
  try {
    const values = load(yaml, { schema: CORE_SCHEMA });
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      return { values: values as Record<string, unknown>, body };
    }
    return { values: null, body, problem: 'header is not a list of fields' };
  } catch (e) {
    return { values: null, body, problem: `header could not be read (${(e as Error).message.split('\n')[0]})` };
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseEdition(feedId: FeedId, file: DriveFile, rawText: string): Edition {
  const issues: string[] = [];
  // Google's plain-text export starts with a byte-order mark and ends lines
  // with CRLF.
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '');
  const { values, body, problem } = splitHeader(text);
  if (problem) issues.push(problem);
  const h = values || {};
  const named = FILENAME.exec(file.name.trim());

  if (values) {
    if (h.schema_version !== 1) issues.push(`schema_version ${JSON.stringify(h.schema_version ?? null)}, expected 1`);
    if (h.content_type !== feedId) issues.push(`content_type ${JSON.stringify(h.content_type ?? null)} in the ${feedId} folder`);
  }

  let editionDate = str(h.edition_date);
  if (editionDate && !isValidDayKey(editionDate)) {
    issues.push(`edition_date ${JSON.stringify(editionDate)} is not a date`);
    editionDate = null;
  }
  if (values && h.edition_date === undefined) issues.push('no edition_date');
  if (!editionDate && named && isValidDayKey(named[1])) editionDate = named[1];
  if (!editionDate) {
    const drive = file.createdTime || file.modifiedTime;
    editionDate = dayKeyOf(new Date(drive));
    issues.push('date taken from Drive');
  }

  let generatedAt = str(h.generated_at);
  if (generatedAt && !(OFFSET_TIME.test(generatedAt) && !Number.isNaN(Date.parse(generatedAt)))) {
    issues.push(`generated_at ${JSON.stringify(generatedAt)} is not a time with its offset`);
    generatedAt = null;
  }
  if (values && h.generated_at === undefined) issues.push('no generated_at');
  const clock = generatedAt
    ? parisTime.format(new Date(generatedAt))
    : named ? `${named[2]}:${named[3]}:00` : null;

  let title = str(h.title);
  if (!title) {
    if (values) issues.push('no title');
    title = feedById(feedId)?.name ?? feedId;
  }

  let origin: Edition['origin'] = null;
  if (h.origin !== undefined) {
    if (h.origin === 'scheduled' || h.origin === 'backfill') origin = h.origin;
    else issues.push(`origin ${JSON.stringify(h.origin)}, expected "scheduled" or "backfill"`);
  }

  let topics: string[] = [];
  if (Array.isArray(h.topics)) {
    topics = h.topics.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim());
    if (topics.length !== h.topics.length) issues.push('some topics are not text');
  } else if (values) {
    issues.push('no topics');
  }

  return {
    driveFileId: file.id,
    feedId,
    title,
    editionDate,
    generatedAt,
    time: clock ? clock.slice(0, 5) : null,
    topics,
    markdownBody: body,
    sourceUrl: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
    modifiedTime: file.modifiedTime,
    issues,
    origin,
    fileName: file.name,
    createdTime: file.createdTime ?? null,
    sortKey: `${editionDate} ${clock ?? ''}`,
  };
}

/** Newest first; a tie keeps Drive's order. */
export function newestFirst(a: Edition, b: Edition): number {
  return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0;
}

// ── Sections ────────────────────────────────────────────────────────────────

export interface Section {
  /** Stable within the edition: the heading as a slug. */
  id: string;
  /** The heading as written; empty for text before the first heading. */
  title: string;
  /** Everything under the heading, as written, without the heading line. */
  markdown: string;
  /** The document's own title line, with any text before the first section. */
  role?: 'title';
}

/** Lower-case ASCII words joined by dashes: "À retenir" → "a-retenir". */
export function slugOf(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/**
 * The body cut at its top-level headings: the shallowest level it uses, so a
 * brief written with `##` sections keeps its `###` parts inside them. Text in
 * code fences is never taken for a heading. A document that opens with the
 * only heading of its level ("# Enterprise AI Sales Brief — 1 November") has
 * that line as its title: it is kept, with the text under it, as a section of
 * its own, and the sections are the next level down.
 */
export function splitSections(body: string): Section[] {
  const lines = body.split('\n');
  const headings: { line: number; level: number; title: string }[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = HEADING.exec(line);
    if (m) headings.push({ line: i, level: m[1].length, title: m[2] });
  });
  let top = Math.min(...headings.map(h => h.level));
  const atTop = headings.filter(h => h.level === top);
  const deeper = headings.filter(h => h.level > top);
  const opening = lines.findIndex(l => l.trim());
  const titleLine = atTop.length === 1 && atTop[0].line === opening && deeper.length ? atTop[0] : null;
  if (titleLine) top = Math.min(...deeper.map(h => h.level));
  const cuts = headings.filter(h => h.level === top);

  const sections: Section[] = [];
  const used = new Map<string, number>();
  const add = (title: string, from: number, to: number, role?: 'title') => {
    const markdown = lines.slice(from, to).join('\n').replace(/^\n+|\n+$/g, '');
    if (!title && !markdown.trim()) return;
    const base = slugOf(title) || `section-${sections.length + 1}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    sections.push({ id: n ? `${base}-${n + 1}` : base, title, markdown, ...(role && { role }) });
  };
  const first = cuts.length ? cuts[0].line : lines.length;
  if (titleLine) add(titleLine.title, titleLine.line + 1, first, 'title');
  else add('', 0, first);
  cuts.forEach((c, i) => add(c.title, c.line + 1, i + 1 < cuts.length ? cuts[i + 1].line : lines.length));
  return sections;
}

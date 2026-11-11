// Historical editions (INT-34): a scheduled task's past replies, taken from
// its ChatGPT conversation by `SUPPORTING FILES/backfill/extract-chatgpt-task.js`,
// made into documents of our contract: a YAML header, then the reply's
// Markdown exactly as the page gave it. Nothing is rewritten or invented:
//
//   - the time is the page's own (`<time datetime>`), in Paris time with its
//     real offset; a reply that showed no time of its own (the first, right
//     after the task was set up) takes the earlier one and says so in the
//     header (`time_note`) and the report;
//   - the title and topics are the edition's own (`ownTitleAndTopics`);
//   - `origin: "backfill"`, and `source_message` names the reply it came from;
//   - the only thing removed is what the task appended for its own archive
//     (a closing rule and "Google Drive archive" link, or a closing "Google
//     Drive archive" section), and, for a feed whose links are tidied
//     (`TIDY_LINKS`), what ChatGPT's page adds to links (`tidyLinks`).
//
// An edition already in Drive is skipped: the same reply, the same day with
// the same words, or a document of the same run (the same day, its
// `generated_at` within minutes: a task can write its Drive copy in other
// words than its reply). The same day with other words and another time is a
// conflict, left for a person to decide. Pure: it reads and writes nothing itself.
import { TZ, type DayKey } from '../routine/dates';
import type { FeedId } from './feeds';

export interface ExtractItem {
  role: string;
  kind: 'edition' | 'other-reply' | 'user-marker';
  edition?: number;
  messageId?: string;
  turnKey?: string;
  timeSource?: 'own-separator' | 'earlier-separator' | 'none';
  timestampText?: string | null;
  timeElement?: { datetime: string | null } | null;
  markdown?: string;
}

export interface Extract {
  format: 'chatgpt-task-extract';
  version: number;
  page: { conversationId: string | null; automationId: string | null };
  items: ExtractItem[];
}

/** A document already in the feed's folder, as Drive gives it. */
export interface Existing {
  name: string;
  text: string;
}

export interface BackfillDoc {
  edition: number;
  fileName: string;
  /** The whole document: header, then body. */
  text: string;
  editionDate: DayKey;
  generatedAt: string;
  title: string;
  topics: string[];
  messageId: string;
  timeNote: string | null;
  /** What `tidyLinks` changed: tracking tags removed, repeated links dropped. */
  tidied: { tags: number; repeats: string[] };
}

export interface Decision {
  edition: number;
  time: string | null;
  action: 'import' | 'skip' | 'conflict' | 'problem';
  reason: string;
  fileName?: string;
}

const paris = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** An instant as Paris wall-clock time with its offset: "2026-09-06T08:18:16+02:00". */
export function parisIso(instant: Date): string {
  const p = Object.fromEntries(paris.formatToParts(instant).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const minutes = Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const off = `${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

/** What the task appended for its own archive: a closing rule and the "Google Drive archive" link. */
const ARCHIVE_NOTE = /\n+(?:-{3,}|\*{3,}|_{3,})?\s*\n*\[Google Drive archive\]\([^)\n]*\)\s*$/;

/** The same, as a closing section of its own, with no heading after it. */
const ARCHIVE_SECTION = /\n+#{1,4} +Google Drive archive[ \t]*\n(?![\s\S]*\n#{1,4} )[\s\S]*$/;

export const bodyOf = (markdown: string) => markdown.replace(ARCHIVE_NOTE, '').replace(ARCHIVE_SECTION, '').trim();

/**
 * Feeds whose links are tidied (the user's choice for the Customer Engagement
 * Brief, 2026-11-11). The AI Challenge's editions were imported as the page
 * showed them.
 */
export const TIDY_LINKS: readonly FeedId[] = ['customer-engagement-brief', 'enterprise-ai-sales-brief'];

const LINK = /\[([^\]\n]*)\]\(([^()\s]+)\)/g;

/** An address without the tag ChatGPT adds to every source it links (`utm_source=chatgpt.com`). */
export const untagged = (url: string) => url.replace(/([?&])utm_source=chatgpt\.com(&?)/, (_, sep: string, more: string) => (more ? sep : ''));

/**
 * What ChatGPT's page adds to a reply's links, taken out: the tracking tag on
 * each address, and a source chip that repeats the address of the link right
 * before it (only spaces between). Every link to somewhere new is kept, and no
 * other text changes.
 */
export function tidyLinks(markdown: string): { markdown: string; tags: number; repeats: string[] } {
  let out = '';
  let from = 0;
  let tags = 0;
  const repeats: string[] = [];
  let prev: { end: number; url: string } | null = null;
  for (const m of markdown.matchAll(LINK)) {
    const start = m.index, end = start + m[0].length;
    const url = untagged(m[2]);
    if (prev && prev.url === url && /^[ \t]*$/.test(markdown.slice(prev.end, start))) {
      repeats.push(`[${m[1]}](${url})`);
      from = end;
      prev = { end, url };
      continue;
    }
    if (url !== m[2]) tags++;
    out += `${markdown.slice(from, start)}[${m[1]}](${url})`;
    from = end;
    prev = { end, url };
  }
  return { markdown: out + markdown.slice(from), tags, repeats };
}

/** The words of a body, for telling whether two documents say the same. */
export const wordsIn = (markdown: string) => markdown
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .split(/[^\p{L}\p{N}'’]+/u)
  .filter(Boolean)
  .join(' ')
  .toLowerCase();

/** A section's first line under a heading or bold label of that name. */
function firstLineUnder(markdown: string, label: string): string | null {
  const m = new RegExp(`(?:^|\\n)(?:#{1,4} |\\*\\*)${label}:?(?:\\*\\*)?:?[ \\t]*\\n+([^\\n]+)`, 'i').exec(markdown);
  return m ? m[1].trim() : null;
}

const plainTitle = (line: string) => line.replace(/\*\*|__/g, '').replace(/[.。]\s*$/, '').trim() || null;

/** A brief's standing sections, which never name the day's news (both briefs, every format they have had). */
const STANDING = new RegExp('^(?:executive take|three |competitive watchlist|contrarian insight|development to (?:monitor|watch)'
  + '|single development to watch|google drive archive|(?:two )?material (?:update|addendum|addition|additions|development|developments)\\b'
  + '|enterprise ai customer-conversation topic map|(?:hcl )?unica\\+ (?:verification basis|customer conversation)'
  + '|relevant executive themes|what i should remember|best executive question)', 'i');

/** A brief's first development headline: its first numbered heading, else its first heading that is neither its opening title nor a standing section. */
function firstDevelopment(markdown: string): string | null {
  const numbered = /(?:^|\n)#{2,4} +\d+\.\s*([^\n]+)/.exec(markdown);
  if (numbered) return numbered[1];
  const headings = [...markdown.matchAll(/(?:^|\n)(#{1,4}) +([^\n]+)/g)];
  const opening = headings[0] && markdown.slice(0, headings[0].index).trim() === '' ? 1 : 0;
  return headings.slice(opening).map(h => h[2].replace(/\*\*/g, '').trim()).find(h => !STANDING.test(h)) ?? null;
}

/**
 * The topics an edition says it is about, in its own words: a "**Relevant to
 * today's challenge:**", "**Relevant to this update:**" or "**Relevant to this
 * week's developments:**" line, or the bold line under a "Relevant executive
 * themes today" heading. Never the whole topic map. None when it says nothing.
 */
function relevantTopics(markdown: string): string[] {
  const line = /\*\*Relevant to [^*\n]{1,40}?:?\*\*:?[ \t]*([^\n]+)/i.exec(markdown)
    ?? /(?:^|\n)#{1,4} +Relevant executive themes today[^\n]*\n+[ \t]*\*\*([^\n]+?)\*\*[ \t]*(?:\n|$)/i.exec(markdown);
  return line ? line[1].split(/\s+[•·]\s+/).map(t => t.replace(/\*\*/g, '').replace(/[.\s]+$/, '').trim()).filter(Boolean) : [];
}

/**
 * The edition's own title and topics (`relevantTopics`). AI Challenge: its
 * Challenge sentence. The briefs: their first development headline (the
 * user's choice for Customer Engagement, 2026-11-11, whose replies list no
 * topics).
 */
export function ownTitleAndTopics(markdown: string, feedId: FeedId = 'enterprise-ai-challenge'): { title: string | null; topics: string[] } {
  const line = feedId === 'enterprise-ai-challenge' ? firstLineUnder(markdown, 'Challenge') : firstDevelopment(markdown);
  return { title: line ? plainTitle(line) : null, topics: relevantTopics(markdown) };
}

const yamlString = (s: string) => JSON.stringify(s);

function headerOf(f: { feedId: FeedId; editionDate: string; generatedAt: string; title: string; topics: string[]; messageId: string; conversationId: string | null; timeNote: string | null }) {
  return [
    '---',
    'schema_version: 1',
    `content_type: ${yamlString(f.feedId)}`,
    `edition_date: ${yamlString(f.editionDate)}`,
    `generated_at: ${yamlString(f.generatedAt)}`,
    'origin: "backfill"',
    `title: ${yamlString(f.title)}`,
    `topics: [${f.topics.map(yamlString).join(', ')}]`,
    `source_message: ${yamlString(f.messageId)}`,
    ...(f.conversationId ? [`source_conversation: ${yamlString(f.conversationId)}`] : []),
    ...(f.timeNote ? [`time_note: ${yamlString(f.timeNote)}`] : []),
    '---',
  ].join('\n');
}

const headerField = (text: string, field: string) => {
  const head = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n---[ \t]*\n/)[0];
  const m = new RegExp(`^${field}:\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(head);
  return m ? m[1] : null;
};
const bodyOfDocument = (text: string) => {
  const t = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const close = /\n---[ \t]*\n/.exec(t.slice(3));
  return t.startsWith('---') && close ? t.slice(3 + close.index + close[0].length) : t;
};

export const TIME_NOTE_EARLIER = 'ChatGPT showed no time for this reply; the time is the last one it showed above it in the same conversation, so the reply came then or a little later.';

/** How far apart a reply's time and a Drive document's `generated_at` can be for both to be the same run. */
export const SAME_RUN_MINUTES = 15;

/** The documents to import, and a decision for every edition in the extract. */
export function backfillDocs(extract: Extract, feedId: FeedId, existing: Existing[]): { docs: BackfillDoc[]; decisions: Decision[] } {
  const docs: BackfillDoc[] = [];
  const decisions: Decision[] = [];
  const fromMessage = new Set(existing.map(e => headerField(e.text, 'source_message')).filter(Boolean));
  const byDay = new Map<string, Existing[]>();
  for (const e of existing) {
    const day = headerField(e.text, 'edition_date') || e.name.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  for (const item of extract.items) {
    if (item.kind !== 'edition' || !item.edition) continue;
    const n = item.edition;
    const iso = item.timeElement?.datetime;
    const instant = iso ? new Date(iso) : null;
    if (!instant || Number.isNaN(instant.getTime()) || !item.markdown || !item.messageId) {
      decisions.push({ edition: n, time: null, action: 'problem', reason: 'no exact time, text or message id in the extract' });
      continue;
    }
    const generatedAt = parisIso(instant);
    const editionDate = generatedAt.slice(0, 10);
    const tidied = TIDY_LINKS.includes(feedId) ? tidyLinks(bodyOf(item.markdown)) : { markdown: bodyOf(item.markdown), tags: 0, repeats: [] };
    const body = tidied.markdown;
    if (fromMessage.has(item.messageId)) {
      decisions.push({ edition: n, time: generatedAt, action: 'skip', reason: 'already imported (same source message)' });
      continue;
    }
    const sameDay = byDay.get(editionDate) ?? [];
    const same = sameDay.find(e => wordsIn(bodyOfDocument(e.text)) === wordsIn(body));
    if (same) {
      decisions.push({ edition: n, time: generatedAt, action: 'skip', reason: `already in Drive with the same words (${same.name})` });
      continue;
    }
    const run = sameDay.find(e => {
      const at = Date.parse(headerField(e.text, 'generated_at') ?? '');
      return Math.abs(at - instant.getTime()) <= SAME_RUN_MINUTES * 60_000;
    });
    if (run) {
      decisions.push({ edition: n, time: generatedAt, action: 'skip', reason: `the same run is already in Drive, in its own words (${run.name})` });
      continue;
    }
    if (sameDay.length) {
      decisions.push({ edition: n, time: generatedAt, action: 'conflict', reason: `Drive has ${sameDay.map(e => e.name).join(', ')} that day, with other words: left for a person to decide` });
      continue;
    }
    const { title, topics } = ownTitleAndTopics(body, feedId);
    if (!title) {
      decisions.push({ edition: n, time: generatedAt, action: 'problem', reason: 'no title of its own to take' });
      continue;
    }
    const timeNote = item.timeSource === 'own-separator' ? null : TIME_NOTE_EARLIER;
    const fileName = `${editionDate}_${generatedAt.slice(11, 13)}${generatedAt.slice(14, 16)}__${feedId}`;
    const text = `${headerOf({ feedId, editionDate, generatedAt, title, topics, messageId: item.messageId, conversationId: extract.page.conversationId, timeNote })}\n\n${body}\n`;
    docs.push({ edition: n, fileName, text, editionDate, generatedAt, title, topics, messageId: item.messageId, timeNote, tidied: { tags: tidied.tags, repeats: tidied.repeats } });
    decisions.push({ edition: n, time: generatedAt, action: 'import', reason: timeNote ? 'new; time from the last one shown above it' : 'new', fileName });
  }
  return { docs, decisions };
}

/**
 * Days between the first and last edition with none, as runs of dates: the
 * task's pauses. With `weekdays` (0 = Sunday), only days the task runs on
 * count: a Tuesday is no gap for a Monday, Wednesday and Friday brief.
 */
export function pauses(days: string[], weekdays?: number[]): string[] {
  const sorted = [...new Set(days)].sort();
  const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const key = (t: number) => new Date(t).toISOString().slice(0, 10);
  const runs = (t: number) => !weekdays || weekdays.includes(new Date(t).getUTCDay());
  const out: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const missing: string[] = [];
    for (let t = noon(sorted[i - 1]) + 86_400_000; t < noon(sorted[i]); t += 86_400_000) if (runs(t)) missing.push(key(t));
    if (!missing.length) continue;
    const from = missing[0], to = missing[missing.length - 1];
    out.push(from === to ? from : weekdays ? `${missing.length} runs from ${from} to ${to}` : `${from} to ${to}`);
  }
  return out;
}

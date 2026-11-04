// Historical editions (INT-34): a scheduled task's past replies, taken from
// its ChatGPT conversation by `SUPPORTING FILES/backfill/extract-chatgpt-task.js`,
// made into documents of our contract: a YAML header, then the reply's
// Markdown exactly as the page gave it. Nothing is rewritten or invented:
//
//   - the time is the page's own (`<time datetime>`), in Paris time with its
//     real offset; a reply that showed no time of its own (the first, right
//     after the task was set up) takes the earlier one and says so in the
//     header (`time_note`) and the report;
//   - the title is the edition's own Challenge sentence, the topics its own
//     "Relevant to today's challenge" list (AI Challenge);
//   - `origin: "backfill"`, and `source_message` names the reply it came from;
//   - the only thing removed is what the task appended for its own archive
//     (a closing rule and "Google Drive archive" link).
//
// An edition already in Drive (the same reply, or the same day with the same
// words) is skipped; the same day with other words is a conflict, left for a
// person to decide. Pure: it reads and writes nothing itself.
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

export const bodyOf = (markdown: string) => markdown.replace(ARCHIVE_NOTE, '').trim();

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

/** The edition's own title and topics (AI Challenge). */
export function ownTitleAndTopics(markdown: string): { title: string | null; topics: string[] } {
  const line = firstLineUnder(markdown, 'Challenge');
  const title = line ? line.replace(/\*\*|__/g, '').replace(/[.。]\s*$/, '').trim() || null : null;
  const relevant = /\*\*Relevant to today'?s challenge:?\*\*:?\s*([^\n]+)/i.exec(markdown);
  const topics = relevant ? relevant[1].split(/\s+[•·]\s+/).map(t => t.replace(/[.\s]+$/, '').trim()).filter(Boolean) : [];
  return { title, topics };
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

export const TIME_NOTE_EARLIER = 'ChatGPT showed no time for this reply; the time is that of the message just before it, in the same conversation.';

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
    const body = bodyOf(item.markdown);
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
    if (sameDay.length) {
      decisions.push({ edition: n, time: generatedAt, action: 'conflict', reason: `Drive has ${sameDay.map(e => e.name).join(', ')} that day, with other words: left for a person to decide` });
      continue;
    }
    const { title, topics } = ownTitleAndTopics(body);
    if (!title) {
      decisions.push({ edition: n, time: generatedAt, action: 'problem', reason: 'no Challenge sentence to take the title from' });
      continue;
    }
    const timeNote = item.timeSource === 'own-separator' ? null : TIME_NOTE_EARLIER;
    const fileName = `${editionDate}_${generatedAt.slice(11, 13)}${generatedAt.slice(14, 16)}__${feedId}`;
    const text = `${headerOf({ feedId, editionDate, generatedAt, title, topics, messageId: item.messageId, conversationId: extract.page.conversationId, timeNote })}\n\n${body}\n`;
    docs.push({ edition: n, fileName, text, editionDate, generatedAt, title, topics, messageId: item.messageId, timeNote });
    decisions.push({ edition: n, time: generatedAt, action: 'import', reason: timeNote ? 'new; time from the message before it' : 'new', fileName });
  }
  return { docs, decisions };
}

/** Days between the first and last edition with none, as runs of dates: the task's pauses. */
export function pauses(days: string[]): string[] {
  const sorted = [...new Set(days)].sort();
  const out: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (Date.parse(`${sorted[i]}T12:00:00Z`) - Date.parse(`${sorted[i - 1]}T12:00:00Z`)) / 86_400_000;
    if (gap > 1) {
      const from = new Date(Date.parse(`${sorted[i - 1]}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      const to = new Date(Date.parse(`${sorted[i]}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      out.push(from === to ? from : `${from} to ${to}`);
    }
  }
  return out;
}

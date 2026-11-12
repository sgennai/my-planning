// The AI Challenge as an executive memo (INT-50): what the memo reader needs
// from an edition, worked out apart from how it is drawn. Nothing here
// changes or drops a word; it only says where each part goes.
//
//   - the topic map, the document's first section, becomes a disclosure at
//     the memo's end, its "Relevant to today's challenge" line the topic line
//     under the title (`memoTopics`);
//   - the Challenge's bold opening sentence becomes the summary block, the
//     rest of the Challenge its first section (`challengeLead`);
//   - every other section keeps its place and its words.
import type { Edition, Section } from './parse';
import type { Presentation } from './present';
import { fold, keyOf } from './blocks';
import type { DayKey } from '../routine/dates';

export interface MemoTopics {
  /** The document's own label ("Relevant to today's challenge"), else "Topics". */
  label: string;
  topics: string[];
}

/** The topic map's section, if the document has one. */
export const isTopicMap = (s: Section) => /topic map$/.test(keyOf(s.title));

/** The memo's order: the document's, with the topic map taken out for the end. */
export function memoOrder(sections: Section[]): { body: Section[]; map: Section | null } {
  const map = sections.find(isTopicMap) ?? null;
  return { body: sections.filter(s => s !== map), map };
}

/** The topics the edition says it is about: its own relevant list, else its header's. */
export function memoTopics(edition: Pick<Edition, 'topics'>, map: Presentation | undefined): MemoTopics | null {
  if (map?.kind === 'topics' && map.highlighted.length) return { label: map.label ?? 'Topics', topics: map.highlighted };
  return edition.topics.length ? { label: 'Topics', topics: edition.topics } : null;
}

/** How many topics show before "+n topics". */
export const TOPICS_SHOWN = 3;

/** The Challenge's opening sentence, for the summary block, and the rest for its section; null when it has no bold opening or nothing after it. */
export function challengeLead(section: Section, p: Presentation | undefined): { lead: string; rest: string } | null {
  return keyOf(section.title) === 'challenge' && p?.kind === 'lead' && p.rest ? { lead: p.lead, rest: p.rest } : null;
}

export const two = (n: number | string) => String(n).padStart(2, '0');

const at = (day: DayKey) => new Date(`${day}T12:00:00Z`);
const format = (day: DayKey, options: Intl.DateTimeFormatOptions) => at(day).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });

/** "11 November 2026": the memo's own date (the edition's Paris day). */
export const memoDate = (day: DayKey) => format(day, { day: 'numeric', month: 'long', year: 'numeric' });
/** "Wed 11 Nov 2026 · 09:03": the bar's. */
export const barDate = (day: DayKey, time: string | null) =>
  `${format(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '')}${time ? ` · ${time}` : ''}`;
/** "Wed 11 Nov": a list's. */
export const shortDate = (day: DayKey) => format(day, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
/** "November 2026": a month's heading in the history. */
export const monthOf = (day: DayKey) => format(day, { month: 'long', year: 'numeric' });

/** The editions (newest first, as the feed keeps them) matching a search, by month. */
export function historyGroups(editions: Edition[], query: string): { month: string; editions: Edition[] }[] {
  const q = fold(query.trim());
  const groups: { month: string; editions: Edition[] }[] = [];
  for (const e of editions) {
    const said = fold(`${e.title} ${e.editionDate} ${e.time ?? ''} ${shortDate(e.editionDate)} ${memoDate(e.editionDate)}`);
    if (q && !said.includes(q)) continue;
    const month = monthOf(e.editionDate);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.editions.push(e); else groups.push({ month, editions: [e] });
  }
  return groups;
}

/** "53 editions, from September to November 2026." */
export function historyNote(editions: Edition[]): string {
  const n = editions.length;
  if (!n) return 'No editions yet.';
  const count = `${n} edition${n === 1 ? '' : 's'}`;
  const days = editions.map(e => e.editionDate).sort();
  const first = days[0], last = days[days.length - 1];
  if (monthOf(first) === monthOf(last)) return `${count}, ${monthOf(last)}.`;
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${count}, from ${sameYear ? format(first, { month: 'long' }) : monthOf(first)} to ${monthOf(last)}.`;
}

// The executive memo (INT-50, the AI Challenge; INT-51, the Sales Brief;
// INT-52, the Customer Engagement Brief): what the memo reader needs from an
// edition, worked out apart from how it is drawn. Nothing here changes or
// drops a word; it only says where each part goes. The AI Challenge:
//
//   - the topic map, the document's first section, becomes a disclosure at
//     the memo's end, its "Relevant to today's challenge" line the topic line
//     under the title (`memoTopics`);
//   - the Challenge's bold opening sentence becomes the summary block, the
//     rest of the Challenge its first section (`challengeLead`);
//   - every other section keeps its place and its words.
//
// The two briefs read their developments as chapters of labelled fields
// (`Chapter`, `sales-memo.ts`, `engagement-memo.ts`).
import type { Edition, Section } from './parse';
import type { FeedId } from './feeds';
import type { Presentation } from './present';
import type { PartTone } from './briefs';
import type { SaveInput } from './saved';
import { fold, keyOf } from './blocks';
import type { DayKey } from '../routine/dates';

/** The feeds read as a memo, and what their memo calls itself. */
export interface MemoBrand {
  name: string;
}

const BRANDS: Partial<Record<FeedId, MemoBrand>> = {
  'enterprise-ai-challenge': { name: 'AI Challenge' },
  'enterprise-ai-sales-brief': { name: 'Enterprise AI Sales Brief' },
  'customer-engagement-brief': { name: 'Customer Engagement Brief' },
};

/** The feed's memo, or null for a feed read as a brief. */
export const memoBrand = (feedId: string | null | undefined): MemoBrand | null => (feedId && BRANDS[feedId as FeedId]) || null;

/** One of a development's labelled parts, its words as written. */
export interface Field { label: string | null; tone: PartTone; markdown: string }

export interface Chapter {
  /** Unique within the edition; the element is `intel-<id>`. */
  id: string;
  /** The heading as written. */
  title: string;
  /** Its labelled parts; null when it has none, and is shown as its Markdown. */
  fields: Field[] | null;
  markdown: string;
}

/** The body in its order: what a section says before its developments, and the developments. */
export type Flow =
  /** A section holding developments: its title (none for the Sales Brief's themes, which go to the fold) and its own words. */
  | { kind: 'part'; id: string; title: string | null; markdown: string }
  | { kind: 'chapter'; chapter: Chapter };

/** A development's heading without the number the chapter's kicker already gives ("1. …" for the first). */
export function chapterTitle(title: string, n: number): string {
  const m = /^(\d+)[.)][ \t]+(\S[\s\S]*)$/.exec(title);
  return m && Number(m[1]) === n ? m[2] : title;
}

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Three takeaways", "Two talking points": a list's length, in words. */
export const countLabel = (n: number, noun: string) => `${WORDS[n - 1] ?? n} ${noun}${n === 1 ? '' : 's'}`;

/** The same question, whatever its quotes, punctuation, case or spacing. */
export const questionWords = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A development's question as the briefs reader saved it, so what was kept there shows as kept here. */
export const questionInput = (chapter: Chapter, field: Field): SaveInput =>
  ({ kind: 'labelled', sectionId: chapter.id, sectionTitle: chapter.title, label: field.label ?? '', text: field.markdown });

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
/** "11 Nov 2026": the reading bar's, between its chevrons (INT-58). */
export const headDate = (day: DayKey) => format(day, { day: 'numeric', month: 'short', year: 'numeric' });
/** "Wed 11 Nov": a list's. */
export const shortDate = (day: DayKey) => format(day, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
/** "14 November": Today's queue (INT-55). */
export const dayMonth = (day: DayKey) => format(day, { day: 'numeric', month: 'long' });
/** "November 2026": a month's heading in the index. */
export const monthOf = (day: DayKey) => format(day, { month: 'long', year: 'numeric' });
/** "2026-11": a month's key (the edition's Paris day, never shifted by a time zone). */
export const monthKey = (day: DayKey) => day.slice(0, 7);

export interface MonthGroup { key: string; month: string; editions: Edition[] }

/**
 * The editions (newest first, as the feed keeps them) matching a search, by
 * month: their title and their date as written or said ("2026-11-12", "Thu
 * 12 Nov", "12 November 2026"), case and accents aside. A month with no
 * edition has no group.
 */
export function indexGroups(editions: Edition[], query: string): MonthGroup[] {
  const q = fold(query.trim());
  const groups: MonthGroup[] = [];
  for (const e of editions) {
    const said = fold(`${e.title} ${e.editionDate} ${shortDate(e.editionDate)} ${memoDate(e.editionDate)}`);
    if (q && !said.includes(q)) continue;
    const key = monthKey(e.editionDate);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.editions.push(e); else groups.push({ key, month: monthOf(e.editionDate), editions: [e] });
  }
  return groups;
}

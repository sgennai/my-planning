// Search across every edition this device holds, which once refreshed is the
// whole archive (each device downloads every edition in Drive). Every word of
// the query must appear somewhere in the edition (its title, topics, section
// titles or text), case and accents ignored. Each hit names the section where
// the words are, with a few words around them, so it opens right there.
import type { Edition } from './parse';
import { splitSections } from './parse';
import { plainText } from './present';
import { fold } from './blocks';
import type { FeedId } from './feeds';
import { addDaysKey, type DayKey } from '../routine/dates';

export type Since = 'any' | 'week' | 'month' | 'quarter';
export interface SearchFilters { feed: FeedId | null; since: Since; topic: string | null }
export const NO_FILTERS: SearchFilters = { feed: null, since: 'any', topic: null };

/** A piece of text with the ranges to highlight. */
export interface Marked { text: string; marks: [number, number][] }

export interface Hit {
  edition: Edition;
  /** The section the words are in, to open the edition there; null when only the title or topics match. */
  sectionId: string | null;
  sectionTitle: string | null;
  title: Marked;
  snippet: Marked | null;
}

interface IndexedSection { id: string; title: string; plain: string; folded: string }
export interface Indexed { edition: Edition; title: string; topics: string; sections: IndexedSection[] }

/** Each edition read once into folded text, so a search is a few string scans. */
export function indexOf(editions: Edition[]): Indexed[] {
  return editions.map(edition => ({
    edition,
    title: fold(edition.title),
    topics: fold(edition.topics.join(' · ')),
    sections: splitSections(edition.markdownBody).map(s => {
      const plain = plainText(s.markdown);
      return { id: s.id, title: s.title, plain, folded: fold(`${s.title} ${plain}`) };
    }),
  }));
}

export const queryWords = (query: string) => fold(query).split(/[^\p{L}\p{N}'’]+/u).filter(w => w.length > 0);

const DAYS: Record<Since, number | null> = { any: null, week: 7, month: 30, quarter: 90 };

/** Where each word occurs in `text`, as ranges in the original (folding keeps lengths for NFC text). */
function marksIn(text: string, words: string[]): [number, number][] {
  const folded = fold(text);
  const out: [number, number][] = [];
  for (const w of words) {
    for (let i = folded.indexOf(w); i !== -1; i = folded.indexOf(w, i + w.length)) out.push([i, i + w.length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 200;

/** A few words around the first match, cut at word boundaries. */
function snippetOf(plain: string, words: string[]): Marked | null {
  const first = marksIn(plain, words)[0];
  if (!first) return null;
  let start = Math.max(0, first[0] - SNIPPET_BEFORE);
  if (start > 0) start = plain.indexOf(' ', start) + 1 || start;
  let end = Math.min(plain.length, start + SNIPPET_LENGTH);
  if (end < plain.length) end = plain.lastIndexOf(' ', end) > first[1] ? plain.lastIndexOf(' ', end) : end;
  const text = `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
  return { text, marks: marksIn(text, words) };
}

/**
 * The editions matching every word of the query and the filters, newest
 * first. With no query, every edition the filters let through.
 */
export function search(index: Indexed[], query: string, filters: SearchFilters, today: DayKey): Hit[] {
  const words = queryWords(query);
  const days = DAYS[filters.since];
  const from = days === null ? null : addDaysKey(today, -(days - 1));
  const topic = filters.topic && fold(filters.topic);
  const hits: Hit[] = [];
  for (const it of index) {
    const e = it.edition;
    if (filters.feed && e.feedId !== filters.feed) continue;
    if (from && e.editionDate < from) continue;
    if (topic && !e.topics.some(t => fold(t) === topic)) continue;
    const all = `${it.title} ${it.topics} ${it.sections.map(s => s.folded).join(' ')}`;
    if (!words.every(w => all.includes(w))) continue;
    // The section holding the most of the words; the first such in the document.
    let best: IndexedSection | null = null;
    let most = 0;
    for (const s of it.sections) {
      const n = words.filter(w => s.folded.includes(w)).length;
      if (n > most) { best = s; most = n; }
    }
    hits.push({
      edition: e,
      sectionId: best?.title ? best.id : null,
      sectionTitle: best?.title || null,
      title: { text: e.title, marks: marksIn(e.title, words) },
      snippet: best && words.length ? snippetOf(best.plain, words) : null,
    });
  }
  return hits.sort((a, b) => (a.edition.sortKey < b.edition.sortKey ? 1 : a.edition.sortKey > b.edition.sortKey ? -1 : 0));
}

/** The topics editions carry in their header, most frequent first. */
export function topicsOf(editions: Edition[]): { topic: string; count: number }[] {
  const counts = new Map<string, { topic: string; count: number }>();
  for (const e of editions) for (const t of e.topics) {
    const k = fold(t);
    const c = counts.get(k);
    if (c) c.count++; else counts.set(k, { topic: t, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

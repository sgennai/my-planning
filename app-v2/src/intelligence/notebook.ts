// The executive notebook (INT-56): Takeaways as the approved Notebook ×
// Conversation Kit prototype shows them. What each kept item is called there
// (a Question or an Insight), where it stands in review, what the list shows
// for a filter and a search, and which other kept items support it. Nothing
// here changes a takeaway; the names are only how the existing kinds are
// shown: a question is a line kept under a label that says question (as
// review counts them), and everything else kept (a line to rehearse, a term,
// a passage, a section, an edition) is an insight.
import type { FeedId } from './feeds';
import { isFromArticle, searchSaved, type SavedInsight } from './saved';
import { reviewKindOf, statusOf, type ReviewIndex } from './review';
import { shortTitle, plainText } from './present';
import { wordingOf } from './kit';
import { topicKeys } from './topics';
import { formatDayCompact, type DayKey } from '../routine/dates';

export type NoteKind = 'question' | 'insight';

export const noteKindOf = (item: SavedInsight): NoteKind => (reviewKindOf(item) === 'question' ? 'question' : 'insight');
export const NOTE_KIND_LABEL: Record<NoteKind, string> = { question: 'Question', insight: 'Insight' };

/** What it is exactly, as kept: its label ("Executive question"), else its kind. */
export function keptAsOf(item: SavedInsight): string {
  switch (item.kind) {
    case 'edition': return 'Whole edition';
    case 'section': return 'Section';
    case 'term': return 'Vocabulary';
    case 'passage': return 'Passage';
    default: return item.label?.trim() || 'Line';
  }
}

/**
 * A takeaway named by its own words, short (an edition by its title, a term
 * by itself): for a button's name or a question, where several kept under
 * the same label ("Executive question") must still be told apart.
 */
export function wordsOf(item: SavedInsight): string {
  if (item.kind === 'edition') return item.editionTitle;
  if (item.kind === 'term' && item.label) return plainText(item.label);
  const plain = plainText(item.text);
  return plain.length > 60 ? `${plain.slice(0, 57).trimEnd()}…` : plain;
}

/** Where in the edition it was kept: its section's title, short, without the number the edition gives it. */
export const placeOf = (item: SavedInsight): string | null =>
  (item.sectionTitle && item.kind !== 'edition' ? shortTitle(item.sectionTitle).replace(/^\d+[.)]\s+/, '') || null : null);

/**
 * Where it stands in review, in words (never by colour alone): due (or
 * overdue) is "To review"; in review and rated before, "Reviewed"; in review
 * and not yet rated, "New"; a section never added or a card taken out, "Not
 * in review"; an edition, which is never reviewed, nothing.
 */
export type Standing = 'due' | 'reviewed' | 'new' | 'out';
export const STANDING_LABEL: Record<Standing, string> = { due: 'To review', reviewed: 'Reviewed', new: 'New', out: 'Not in review' };

export function standingOf(item: SavedInsight, reviews: ReviewIndex, today: DayKey): Standing | null {
  if (item.kind === 'edition') return null;
  const s = statusOf(item, reviews);
  if (!s.on) return 'out';
  if (s.due && s.due <= today) return 'due';
  return s.count > 0 ? 'reviewed' : 'new';
}

export type NotebookFilter = 'all' | 'questions' | 'insights' | 'due';

export const FILTERS: { id: NotebookFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'questions', label: 'Questions' },
  { id: 'insights', label: 'Insights' },
  { id: 'due', label: 'To review' },
];

export interface NotebookQuery {
  filter: NotebookFilter;
  query: string;
  tag: string | null;
}

/**
 * The items the list shows, newest first: of the filter's kind, carrying the
 * tag if one is chosen, and matching every word of the search in the words
 * kept, the note, the tags, the edition, its feed or its topics (case and
 * accents aside).
 */
export function notebookList(
  saved: SavedInsight[], q: NotebookQuery, reviews: ReviewIndex, today: DayKey,
  feedLabel: (id: FeedId) => string, topicsOf: (item: SavedInsight) => string[],
): SavedInsight[] {
  const kind = saved.filter(item => {
    switch (q.filter) {
      case 'questions': return noteKindOf(item) === 'question';
      case 'insights': return noteKindOf(item) === 'insight';
      case 'due': return standingOf(item, reviews, today) === 'due';
      default: return true;
    }
  });
  return searchSaved(kind, q.query, q.tag, feedLabel, topicsOf);
}

export interface Supporting {
  item: SavedInsight;
  /** Why it is offered, from what both carry: "Tagged risk", "Same edition", "Topic: Governance". */
  why: string;
}

/** At most this many supporting items. */
export const SUPPORTING_MAX = 2;

/**
 * Other kept items that support this one, only for what both carry: a tag of
 * yours (the strongest sign), the same edition, or a topic both editions
 * list (INT-46's canonical topics). The one sharing more comes first; between
 * equals, an item of the other kind (a question is backed by an insight, an
 * insight leads to a question), then the newest. Nothing is guessed: with
 * nothing shared, nothing is offered.
 */
export function supportingOf(item: SavedInsight, saved: SavedInsight[], topicsOf: (item: SavedInsight) => string[], max = SUPPORTING_MAX): Supporting[] {
  const tags = new Map(item.tags.map(t => [t.toLowerCase(), t]));
  const topics = new Map<string, string>();
  for (const t of topicsOf(item)) for (const k of topicKeys(t)) if (!topics.has(k)) topics.set(k, t);
  const kind = noteKindOf(item);
  const found: { item: SavedInsight; why: string; score: number }[] = [];
  for (const other of saved) {
    if (other.id === item.id) continue;
    const tag = other.tags.find(t => tags.has(t.toLowerCase()));
    const sameEdition = other.driveFileId === item.driveFileId;
    const topic = tag || sameEdition ? null : topicsOf(other).flatMap(topicKeys).find(k => topics.has(k));
    if (!tag && !sameEdition && !topic) continue;
    const why = tag ? `Tagged ${tags.get(tag.toLowerCase())}` : sameEdition ? (isFromArticle(item) ? 'Same article' : 'Same edition') : `Topic: ${topics.get(topic!)}`;
    found.push({ item: other, why, score: (tag ? 4 : 0) + (sameEdition ? 2 : 0) + (topic ? 1 : 0) + (noteKindOf(other) !== kind ? 0.5 : 0) });
  }
  return found
    .sort((a, b) => b.score - a.score || (a.item.savedAt < b.item.savedAt ? 1 : a.item.savedAt > b.item.savedAt ? -1 : 0))
    .slice(0, max)
    .map(({ item, why }) => ({ item, why }));
}

/** Short enough to stand as the page's quotation; a longer text reads as text. */
export const QUOTE_MAX = 320;

/** Whether the kept words are one short paragraph, shown large; else they read at text size. */
export function isQuotable(markdown: string): boolean {
  return markdown.trim().length <= QUOTE_MAX && !/\n\s*\n|^\s{0,3}(?:[-*+]|\d+[.)]|#{1,6})\s/m.test(markdown.trim());
}

export type NotebookView = 'notebook' | 'conversation' | 'kit';

/** What the notebook shows, kept by the screen so it is there on coming back. */
export interface NotebookState {
  selected: string | null;
  view: NotebookView;
  filter: NotebookFilter;
  query: string;
  tag: string | null;
}

export const NOTEBOOK_START: NotebookState = { selected: null, view: 'notebook', filter: 'all', query: '', tag: null };

/** "11 Nov 2026" */
export const dateOf = (day: DayKey) => `${formatDayCompact(day)} ${day.slice(0, 4)}`;

/** The words as the list shows them: plain, a term with its meaning, an edition by its title. */
export const listTextOf = (item: SavedInsight) => plainText(wordingOf(item));

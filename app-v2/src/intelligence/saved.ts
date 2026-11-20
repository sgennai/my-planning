// Takeaways (the brief's "À retenir"): what you keep from the briefings, synced. Each item is one record
// in `data.content` (`is:<uuid>`, type `intel-saved`), with the words exactly
// as the document had them and enough of the edition to show where they came
// from even on a device that has never fetched it. Never written to Drive.
// A takeaway can also come from an article read in Intake (`source`, Intake 2.0): it then names the
// article in place of an edition. Saved from Intake's reader (Phase 3, `saveArticleInsight`): a passage with
// its exact words, or the whole article with your note, each with the article's title, address, source,
// author and date, and the way back to the passage (its highlight's id and its anchor, kept on the takeaway
// itself so the way back outlives the highlight).
import type { Edition } from './parse';
import { feedById, type FeedId } from './feeds';
import { generateId } from '../ui/helpers';
import { fold } from './blocks';
import { dayKeyOf } from '../routine/dates';
import type { PassageAnchor } from '../intake/anchor';

export const SAVED_TYPE = 'intel-saved';

/**
 * edition: the whole edition · section: one section · labelled: a line under
 * its label (a discovery question, the sentence to rehearse) · term: a
 * vocabulary term and its definition · passage: text you selected.
 */
export type SavedKind = 'edition' | 'section' | 'labelled' | 'term' | 'passage';

export interface SavedInsight {
  id: string;
  type: typeof SAVED_TYPE;
  kind: SavedKind;
  feedId: FeedId;
  driveFileId: string;
  editionTitle: string;
  editionDate: string;
  editionTime: string | null;
  sourceUrl: string;
  sectionId: string | null;
  sectionTitle: string | null;
  /** The label or term the text sits under, as written. */
  label: string | null;
  /** The words saved, as written (Markdown). */
  text: string;
  note: string;
  tags: string[];
  savedAt: string;
  /** Where it was kept when not from a briefing: an article read in Intake. */
  source?: ArticleSource;
}

/** The article a takeaway was kept from, in Intake: enough to name it and find the passage again. */
export interface ArticleSource {
  kind: 'intake-article';
  bookmarkId: number;
  url: string | null;
  title: string;
  /** The source, as its domain: Instapaper gives no publication name. */
  publication: string | null;
  author: string | null;
  /** When the article was published (`YYYY-MM-DD`), when known. */
  published?: string | null;
  /** The highlight (or article note) it was saved from, in Intake. */
  annotationId?: string | null;
  /** The passage's words and what finds them again in the article (Intake's anchor.ts). */
  anchor?: PassageAnchor | null;
}

export const isFromArticle = (item: Pick<SavedInsight, 'source'>): boolean => item.source?.kind === 'intake-article';

/** The date its source bears: a briefing's edition date; an article's publication date, when known. */
export const sourceDateOf = (item: Pick<SavedInsight, 'editionDate' | 'source'>): string | null =>
  (isFromArticle(item) ? item.source!.published ?? null : item.editionDate);

/**
 * Whether its words are an article's own text rather than a briefing's Markdown: shown, copied and exported
 * exactly as they are, so an asterisk or a "1." at a line's start is never taken for formatting.
 */
export const isLiteral = (item: Pick<SavedInsight, 'kind' | 'source'>): boolean => isFromArticle(item) && item.kind !== 'edition';

/** What stands for a feed on a takeaway from an article: no feed of Intelligence's. */
export const ARTICLE_FEED = 'intake' as FeedId;

/** What Intake's reader knows when it saves: the article, and the passage or your note on the whole of it. */
export interface ArticleSaveInput {
  bookmarkId: number;
  url: string | null;
  title: string;
  publication: string | null;
  author: string | null;
  published: string | null;
  /** `passage`: its words; `edition`: the whole article (its title), with your note. */
  kind: 'passage' | 'edition';
  text: string;
  note: string;
  /** The heading the passage sits under, if the article has headings. */
  sectionTitle: string | null;
  annotationId: string | null;
  anchor: PassageAnchor | null;
}

/**
 * A takeaway from an article, added to Takeaways and dated as every takeaway is, by when you kept it:
 * `savedAt`, with its Paris day as `editionDate` (the date Takeaways shows beside it; an article has no
 * edition). The article's publication date is its source's, kept apart in `source.published` (`sourceDateOf`).
 */
export function saveArticleInsight(content: unknown[] | undefined, input: ArticleSaveInput, now = new Date()): { content: unknown[]; id: string } {
  const item: SavedInsight = {
    id: `is:${generateId()}`,
    type: SAVED_TYPE,
    kind: input.kind,
    feedId: ARTICLE_FEED,
    driveFileId: `ia:${input.bookmarkId}`,
    editionTitle: input.title,
    editionDate: dayKeyOf(now),
    editionTime: null,
    sourceUrl: input.url ?? '',
    sectionId: null,
    sectionTitle: input.sectionTitle,
    label: null,
    text: input.kind === 'edition' ? input.title : input.text,
    note: input.note.trim(),
    tags: [],
    savedAt: now.toISOString(),
    source: {
      kind: 'intake-article',
      bookmarkId: input.bookmarkId,
      url: input.url,
      title: input.title,
      publication: input.publication,
      author: input.author,
      published: input.published,
      annotationId: input.annotationId,
      anchor: input.anchor,
    },
  };
  return { content: [...(content || []), item], id: item.id };
}

/** The takeaway saved from this highlight or note, if it is still in Takeaways. */
export function takeawayOf(saved: SavedInsight[], annotationId: string, takeawayId?: string | null): SavedInsight | undefined {
  return saved.find(s => isFromArticle(s) && (s.id === takeawayId || s.source?.annotationId === annotationId));
}

/** Where a takeaway comes from, in words: its feed, or Intake's article. */
export const originOf = (item: Pick<SavedInsight, 'feedId' | 'source'>): string =>
  isFromArticle(item) ? 'Intake · Article' : feedById(item.feedId)?.label ?? item.feedId;

/** Its original's address and what to call the link. */
export const originalOf = (item: Pick<SavedInsight, 'sourceUrl' | 'source'>): { url: string | null; label: string } =>
  isFromArticle(item) ? { url: item.source!.url, label: 'Original article' } : { url: item.sourceUrl, label: 'Original in Google Docs' };

/** What a save button knows; the edition fills in the rest. */
export interface SaveInput {
  kind: SavedKind;
  sectionId?: string | null;
  sectionTitle?: string | null;
  label?: string | null;
  text: string;
}

const isSaved = (rec: unknown): rec is SavedInsight =>
  !!rec && (rec as SavedInsight).type === SAVED_TYPE && typeof (rec as SavedInsight).text === 'string';

/** Newest first. */
export function savedOf(content: unknown[] | undefined): SavedInsight[] {
  return (content || []).filter(isSaved).sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

const keyOf = (driveFileId: string, s: SaveInput) =>
  [driveFileId, s.kind, s.sectionId ?? '', s.label ?? '', s.text].join('\u0000');

/** The saved item that is this one, if it was saved already. */
export function findSaved(saved: SavedInsight[], edition: Edition, input: SaveInput): SavedInsight | undefined {
  const key = keyOf(edition.driveFileId, input);
  return saved.find(s => keyOf(s.driveFileId, s) === key);
}

export function saveInsight(content: unknown[] | undefined, edition: Edition, input: SaveInput): unknown[] {
  const now = new Date().toISOString();
  const item: SavedInsight = {
    id: `is:${generateId()}`,
    type: SAVED_TYPE,
    kind: input.kind,
    feedId: edition.feedId,
    driveFileId: edition.driveFileId,
    editionTitle: edition.title,
    editionDate: edition.editionDate,
    editionTime: edition.time,
    sourceUrl: edition.sourceUrl,
    sectionId: input.sectionId ?? null,
    sectionTitle: input.sectionTitle ?? null,
    label: input.label ?? null,
    text: input.text,
    note: '',
    tags: [],
    savedAt: now,
  };
  return [...(content || []), item];
}

export function removeInsight(content: unknown[] | undefined, id: string): unknown[] {
  return (content || []).filter(r => (r as { id?: string })?.id !== id);
}

export function updateInsight(content: unknown[] | undefined, id: string, patch: { note?: string; tags?: string[] }): unknown[] {
  return (content || []).map(r => (isSaved(r) && r.id === id ? { ...r, ...patch } : r));
}

/** "risk, Banking ,risk" → ["risk", "Banking"]: trimmed, no repeats whatever the case. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/^#/, '');
    if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
  }
  return out;
}


/**
 * Items matching every word of the query (in any field, the edition's topics
 * too when they are known) and carrying the tag, if one is chosen.
 */
export function searchSaved(
  saved: SavedInsight[], query: string, tag: string | null, feedLabel: (id: FeedId) => string,
  topicsOf: (item: SavedInsight) => string[] = () => [],
): SavedInsight[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return saved.filter(s => {
    if (tag && !s.tags.some(t => t.toLowerCase() === tag.toLowerCase())) return false;
    if (!words.length) return true;
    const hay = fold([s.text, s.label, s.note, s.sectionTitle, s.editionTitle, isFromArticle(s) ? originOf(s) : feedLabel(s.feedId), s.source?.publication, s.source?.author, ...s.tags, ...topicsOf(s)].join(' '));
    return words.every(w => hay.includes(w));
  });
}

/** Every tag in use, with how many items carry it, most used first. */
export function tagsOf(saved: SavedInsight[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const s of saved) for (const t of s.tags) {
    const k = t.toLowerCase();
    const c = counts.get(k);
    if (c) c.count++; else counts.set(k, { tag: t, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** A short name for the item, for a confirmation or a note. */
export function nameOf(item: Pick<SavedInsight, 'kind' | 'label' | 'sectionTitle' | 'text' | 'editionTitle' | 'source'>): string {
  if (item.kind === 'edition') return item.editionTitle;
  if (item.label) return item.label;
  if (item.kind === 'section' && item.sectionTitle) return item.sectionTitle;
  const plain = (isLiteral(item) ? item.text : item.text.replace(/[*_`#>]/g, '')).replace(/\s+/g, ' ').trim();
  return plain.length > 60 ? `${plain.slice(0, 57).trimEnd()}…` : plain;
}

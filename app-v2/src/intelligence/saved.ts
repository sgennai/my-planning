// Takeaways (the brief's "À retenir"): what you keep from the briefings, synced. Each item is one record
// in `data.content` (`is:<uuid>`, type `intel-saved`), with the words exactly
// as the document had them and enough of the edition to show where they came
// from even on a device that has never fetched it. Never written to Drive.
import type { Edition } from './parse';
import type { FeedId } from './feeds';
import { generateId } from '../ui/helpers';

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
}

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

/** Case and accents ignored: "resume" finds "Résumé". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Items matching every word of the query (in any field) and carrying the tag, if one is chosen. */
export function searchSaved(saved: SavedInsight[], query: string, tag: string | null, feedLabel: (id: FeedId) => string): SavedInsight[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return saved.filter(s => {
    if (tag && !s.tags.some(t => t.toLowerCase() === tag.toLowerCase())) return false;
    if (!words.length) return true;
    const hay = fold([s.text, s.label, s.note, s.sectionTitle, s.editionTitle, feedLabel(s.feedId), ...s.tags].join(' '));
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
export function nameOf(item: Pick<SavedInsight, 'kind' | 'label' | 'sectionTitle' | 'text' | 'editionTitle'>): string {
  if (item.kind === 'edition') return item.editionTitle;
  if (item.label) return item.label;
  if (item.kind === 'section' && item.sectionTitle) return item.sectionTitle;
  const plain = item.text.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 60 ? `${plain.slice(0, 57).trimEnd()}…` : plain;
}

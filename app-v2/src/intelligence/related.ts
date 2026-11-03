// Related editions (INT-42, decision D14): other editions that list a topic
// this one lists, from the topics written in the documents' headers and
// nothing else (no guessing, no vendors yet). Labels match after case,
// accents, hyphens and "&" are set aside, so "Customer-data governance"
// meets "Customer data governance". Shared topics are a reason to look, not
// proof of a link, and each match says which it shares. Other feeds come
// first; then the most topics in common; then the newest.
import { fold } from './blocks';
import type { Edition } from './parse';

/** At most this many. */
export const RELATED_MAX = 5;

// Labels repeat across thousands of editions: each is worked out once.
const keys = new Map<string, string>();

/** A topic label as compared: "Investment & budgets" → "investment and budgets". */
export function topicKey(topic: string): string {
  let key = keys.get(topic);
  if (key === undefined) {
    key = fold(topic).replace(/&/g, ' and ').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
    keys.set(topic, key);
  }
  return key;
}

export type TopicIndex = Map<string, Edition[]>;

/** Every edition under each of its topics, once. */
export function topicIndex(editions: Edition[]): TopicIndex {
  const index: TopicIndex = new Map();
  for (const e of editions) {
    for (const key of new Set(e.topics.map(topicKey))) {
      if (!key) continue;
      const list = index.get(key);
      if (list) list.push(e); else index.set(key, [e]);
    }
  }
  return index;
}

export interface Related {
  edition: Edition;
  /** The shared topics, as this edition writes them. */
  shares: string[];
}

export function relatedTo(edition: Edition, index: TopicIndex, max = RELATED_MAX): Related[] {
  const found = new Map<string, Related>();
  const seen = new Set<string>();
  for (const topic of edition.topics) {
    const key = topicKey(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    for (const other of index.get(key) ?? []) {
      if (other.driveFileId === edition.driveFileId) continue;
      const r = found.get(other.driveFileId);
      if (r) r.shares.push(topic); else found.set(other.driveFileId, { edition: other, shares: [topic] });
    }
  }
  const elsewhere = (r: Related) => (r.edition.feedId === edition.feedId ? 1 : 0);
  return [...found.values()]
    .sort((a, b) => elsewhere(a) - elsewhere(b)
      || b.shares.length - a.shares.length
      || (a.edition.sortKey < b.edition.sortKey ? 1 : a.edition.sortKey > b.edition.sortKey ? -1 : 0))
    .slice(0, max);
}

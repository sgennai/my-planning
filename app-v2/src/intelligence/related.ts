// Related editions (INT-42, decision D14): other editions that list a topic
// this one lists, from the topics written in the documents' headers and
// nothing else (no guessing, no vendors yet). Labels match after case,
// accents, hyphens and "&" are set aside, so "Customer-data governance"
// meets "Customer data governance", and a historical label matches the
// canonical topics it names (INT-46, `topics.ts`), so "Investment & budgets"
// meets "Investment". Shared topics are a reason to look, not proof of a
// link, and each match says which it shares, in this edition's words. Other
// feeds come first; then the most topics in common; then the newest.
import type { Edition } from './parse';
import { topicKeys } from './topics';

export { topicKey } from './topics';

/** At most this many. */
export const RELATED_MAX = 5;

export type TopicIndex = Map<string, Edition[]>;

/** Every edition under each of its topics, once. */
export function topicIndex(editions: Edition[]): TopicIndex {
  const index: TopicIndex = new Map();
  for (const e of editions) {
    for (const key of new Set(e.topics.flatMap(topicKeys))) {
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
    for (const key of topicKeys(topic)) {
      if (seen.has(key)) continue;
      seen.add(key);
      for (const other of index.get(key) ?? []) {
        if (other.driveFileId === edition.driveFileId) continue;
        const r = found.get(other.driveFileId);
        if (!r) found.set(other.driveFileId, { edition: other, shares: [topic] });
        else if (!r.shares.includes(topic)) r.shares.push(topic);
      }
    }
  }
  const elsewhere = (r: Related) => (r.edition.feedId === edition.feedId ? 1 : 0);
  return [...found.values()]
    .sort((a, b) => elsewhere(a) - elsewhere(b)
      || b.shares.length - a.shares.length
      || (a.edition.sortKey < b.edition.sortKey ? 1 : a.edition.sortKey > b.edition.sortKey ? -1 : 0))
    .slice(0, max);
}

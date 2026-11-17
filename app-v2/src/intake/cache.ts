// This device's copy of the Instapaper library: the articles, their bodies once fetched, and where the
// last sync got to. Rebuilt from Instapaper on any device, so never synced; deleted on signing out
// (ui/sign-out.ts). Bodies are Instapaper's HTML as received: untrusted, never shown without sanitizing.
import { openDB, type IDBPDatabase } from 'idb';
import { INTAKE_CACHE_DB } from './cache-name';
import type { Article } from './articles';

export interface Body {
  id: number;
  html: string;
  images: string[];
  words: number | null;
  paywalled: boolean;
  direction: 'ltr' | 'rtl' | null;
  fetchedAt: number;
}

export interface SyncMeta {
  /** Unix seconds: the next sync asks for what changed since then. */
  since: number | null;
  /** A sync cut short: where it goes on from, and when it began (Unix seconds). */
  pending: { since: number; offset: number; startedAt: number } | null;
  lastSyncAt: number | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  dbPromise ??= openDB(INTAKE_CACHE_DB, 1, {
    upgrade(d) {
      d.createObjectStore('articles', { keyPath: 'id' });
      d.createObjectStore('bodies', { keyPath: 'id' });
      d.createObjectStore('meta');
    },
    // Signing out deletes this database: let go of it rather than block that.
    blocking() { _closeCache(); },
  });
  return dbPromise;
}

/** Also for tests: as a new session. */
export function _closeCache() {
  dbPromise?.then(d => d.close());
  dbPromise = null;
}

export async function loadArticles(): Promise<Article[]> {
  return (await db()).getAll('articles');
}

export async function saveArticles(list: Article[]): Promise<void> {
  if (!list.length) return;
  const tx = (await db()).transaction('articles', 'readwrite');
  await Promise.all([...list.map(a => tx.store.put(a)), tx.done]);
}

export async function loadBody(id: number): Promise<Body | undefined> {
  return (await db()).get('bodies', id);
}

export async function saveBody(body: Body): Promise<void> {
  await (await db()).put('bodies', body);
}

const NO_META: SyncMeta = { since: null, pending: null, lastSyncAt: null };

export async function loadMeta(): Promise<SyncMeta> {
  return { ...NO_META, ...((await (await db()).get('meta', 'sync')) as Partial<SyncMeta> | undefined) };
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  await (await db()).put('meta', meta, 'sync');
}

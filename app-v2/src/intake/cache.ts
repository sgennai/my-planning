// This device's copy of the Instapaper library: the articles, their bodies once fetched, and where the
// last sync got to. Rebuilt from Instapaper on any device, so never synced; deleted on signing out
// (ui/sign-out.ts). Bodies are Instapaper's HTML as received: untrusted, never shown without sanitizing.
// Still version 1, as Phase 1 opens it: a rollback finds it as it left it (the reader's pictures have a
// database of their own, images.ts).
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
  /** The signatures of its pictures (images.ts). Absent on a body fetched before Phase 2. */
  sigs?: Record<string, string>;
}

export interface SyncMeta {
  /** Unix seconds: the next sync asks for what changed since then. */
  since: number | null;
  /** A sync cut short: where it goes on from, and when it began (Unix seconds). */
  pending: { since: number; offset: number; startedAt: number } | null;
  lastSyncAt: number | null;
  /** A whole sync has been made since bookmarks came with their picture's signature (Phase 2). */
  signed?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function intakeDb() {
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
  return (await intakeDb()).getAll('articles');
}

export async function saveArticles(list: Article[]): Promise<void> {
  if (!list.length) return;
  const tx = (await intakeDb()).transaction('articles', 'readwrite');
  await Promise.all([...list.map(a => tx.store.put(a)), tx.done]);
}

export async function loadBody(id: number): Promise<Body | undefined> {
  return (await intakeDb()).get('bodies', id);
}

export async function saveBody(body: Body): Promise<void> {
  await (await intakeDb()).put('bodies', body);
}

const NO_META: SyncMeta = { since: null, pending: null, lastSyncAt: null };

export async function loadMeta(): Promise<SyncMeta> {
  return { ...NO_META, ...((await (await intakeDb()).get('meta', 'sync')) as Partial<SyncMeta> | undefined) };
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  await (await intakeDb()).put('meta', meta, 'sync');
}

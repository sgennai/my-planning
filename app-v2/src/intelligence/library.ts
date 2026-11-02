// What this device holds of the feeds: each Google Doc's text as last fetched,
// in a database of its own ("my-planning-intel"), apart from the synced data.
// The documents belong to Google Drive; only what you do with them (read,
// saved) is yours and syncs. A refresh lists each folder and fetches only the
// documents that are new or changed since (by Drive's modifiedTime), so an
// edition opens at once and offline, and a new one appears without an app
// update. Texts are parsed once a visit, as they are first read, so a
// better parser needs no refetch. A new device downloads the archive newest
// first and shows it as it arrives, rather than after the last of it.
import { openDB, type IDBPDatabase } from 'idb';
import { parseEdition, newestFirst, type DriveFile, type Edition } from './parse';
import type { FeedId } from './feeds';
import { INTEL_CACHE_DB } from './cache-name';

const CONCURRENT_FETCHES = 6;
/** While a feed downloads, what has arrived is shown this often. */
const PROGRESS_MS = 1000;

interface StoredDoc {
  id: string;
  feedId: FeedId;
  file: DriveFile;
  text: string;
  fetchedAt: string;
}

interface StoredList {
  feedId: FeedId;
  files: DriveFile[];
  refreshedAt: string;
}

export type FeedStatus = 'ready' | 'not-configured' | 'offline' | 'error';

export interface FeedState {
  feedId: FeedId;
  /** Newest first. */
  editions: Edition[];
  /** Documents listed in Drive whose text could not be fetched. */
  missing: { file: DriveFile; message: string }[];
  status: FeedStatus;
  message: string | null;
  /** When the folder was last listed, from this device. */
  refreshedAt: string | null;
  /** Documents listed in Drive still downloading; 0 once a refresh is done. */
  pending: number;
}

/** A document this device holds: its Drive file, and its text read into an edition. */
interface Held {
  file: DriveFile;
  edition: Edition;
}

// Each feed's documents, read from the database once a visit to the section
// and kept up to date by refreshes. An edition stays the same object while its
// document is unchanged, so whatever is worked out from it (search, checks) is
// kept too, until the section is left (`releaseLibrary`).
const held = new Map<FeedId, Promise<Map<string, Held>>>();

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  dbPromise ??= openDB(INTEL_CACHE_DB, 2, {
    upgrade(d, from, _to, tx) {
      if (from < 1) {
        d.createObjectStore('docs', { keyPath: 'id' });
        d.createObjectStore('lists', { keyPath: 'feedId' });
      }
      // One feed's documents read without reading the others'.
      if (from < 2) tx.objectStore('docs').createIndex('feedId', 'feedId');
    },
    // Signing out deletes this database: let go of it rather than block that.
    blocking() {
      _closeLibrary();
    },
  });
  return dbPromise;
}

/** Lets go of the documents read into memory: the next read starts from the database. */
export function releaseLibrary() {
  held.clear();
}

/** Also for tests: as a new session. */
export function _closeLibrary() {
  dbPromise?.then(d => d.close());
  dbPromise = null;
  releaseLibrary();
}

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function api<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/intel/${path}`, { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    throw new ApiError('offline', 'No connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.code || 'error', body?.error?.message || `${res.status} ${res.statusText}`);
  return body as T;
}

function heldOf(doc: StoredDoc): Held {
  const edition = parseEdition(doc.feedId, doc.file, doc.text);
  if (edition.issues.length) console.warn(`[intel] ${doc.file.name} (${doc.id}): ${edition.issues.join('; ')}`);
  return { file: doc.file, edition };
}

function heldIn(feedId: FeedId): Promise<Map<string, Held>> {
  let docs = held.get(feedId);
  if (!docs) {
    const reading = db()
      .then(d => d.getAllFromIndex('docs', 'feedId', feedId) as Promise<StoredDoc[]>)
      .then(stored => new Map(stored.map(x => [x.id, heldOf(x)])));
    // A read that failed is tried again next time.
    reading.catch(() => { if (held.get(feedId) === reading) held.delete(feedId); });
    held.set(feedId, reading);
    docs = reading;
  }
  return docs;
}

const editionsIn = (docs: Map<string, Held>) => [...docs.values()].map(h => h.edition).sort(newestFirst);

async function lastListed(feedId: FeedId): Promise<string | null> {
  const list = await (await db()).get('lists', feedId) as StoredList | undefined;
  return list?.refreshedAt ?? null;
}

/** What this device already has, without asking Drive. */
export async function cachedFeed(feedId: FeedId): Promise<FeedState> {
  const [refreshedAt, docs] = await Promise.all([lastListed(feedId), heldIn(feedId)]);
  return { feedId, editions: editionsIn(docs), missing: [], status: 'ready', message: null, refreshedAt, pending: 0 };
}

/**
 * Lists the feed's folder and fetches what is new or changed, newest first,
 * showing what has arrived through `onProgress` while a long download runs
 * (first once the newest few are in). One document failing leaves it out,
 * and listed under `missing`; the list failing leaves the device's copy as it
 * was, with the reason in `status`.
 */
export async function refreshFeed(feedId: FeedId, onProgress?: (state: FeedState) => void): Promise<FeedState> {
  let files: DriveFile[];
  let complete: boolean;
  try {
    const listing = await api<{ files: DriveFile[]; complete?: boolean }>(`feeds/${feedId}`);
    files = listing.files;
    complete = listing.complete !== false;
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'error';
    return {
      ...(await cachedFeed(feedId)),
      status: code === 'not-configured' || code === 'offline' ? code : 'error',
      message: (e as Error).message,
    };
  }

  const d = await db();
  const [docs, before] = await Promise.all([heldIn(feedId), lastListed(feedId)]);
  // Drive lists a folder by name, newest first (a name starts with its date).
  const stale = files.filter(f => docs.get(f.id)?.file.modifiedTime !== f.modifiedTime);
  const missing: FeedState['missing'] = [];

  // A document taken out of the folder leaves this device too; but when the
  // list was cut short, what it leaves out may only be older.
  const listed = new Set(files.map(f => f.id));
  const gone = complete ? [...docs.keys()].filter(id => !listed.has(id)) : [];
  for (const id of gone) {
    await d.delete('docs', id);
    docs.delete(id);
  }

  const queue = [...stale];
  const newest = new Set(stale.slice(0, CONCURRENT_FETCHES).map(f => f.id));
  let settled = 0;
  let shownAt = 0;
  const settle = (id: string) => {
    settled++;
    newest.delete(id);
    if (!onProgress || settled === stale.length || newest.size || Date.now() - shownAt < PROGRESS_MS) return;
    shownAt = Date.now();
    onProgress({ feedId, editions: editionsIn(docs), missing: [...missing], status: 'ready', message: null, refreshedAt: before, pending: stale.length - settled });
  };
  await Promise.all(Array.from({ length: CONCURRENT_FETCHES }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const { file, text } = await api<{ file: DriveFile; text: string }>(`docs/${encodeURIComponent(f.id)}`);
        const doc: StoredDoc = { id: f.id, feedId, file: { ...f, ...file }, text, fetchedAt: new Date().toISOString() };
        await d.put('docs', doc);
        docs.set(f.id, heldOf(doc));
      } catch (e) {
        console.warn(`[intel] could not fetch ${f.name} (${f.id}): ${(e as Error).message}`);
        missing.push({ file: f, message: (e as Error).message });
      }
      settle(f.id);
    }
  }));

  const refreshedAt = new Date().toISOString();
  await d.put('lists', { feedId, files, refreshedAt } satisfies StoredList);
  return { feedId, editions: editionsIn(docs), missing, status: 'ready', message: null, refreshedAt, pending: 0 };
}

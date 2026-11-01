// What this device holds of the feeds: each Google Doc's text as last fetched,
// in a database of its own ("my-planning-intel"), apart from the synced data.
// The documents belong to Google Drive; only what you do with them (read,
// saved) is yours and syncs. A refresh lists each folder and fetches only the
// documents that are new or changed since (by Drive's modifiedTime), so an
// edition opens at once and offline, and a new one appears without an app
// update. Texts are parsed on every read, so a better parser needs no refetch.
import { openDB, type IDBPDatabase } from 'idb';
import { parseEdition, newestFirst, type DriveFile, type Edition } from './parse';
import type { FeedId } from './feeds';

const DB_NAME = 'my-planning-intel';
const CONCURRENT_FETCHES = 3;

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
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'id' });
      d.createObjectStore('lists', { keyPath: 'feedId' });
    },
  });
  return dbPromise;
}

/** For tests. */
export function _closeLibrary() {
  dbPromise?.then(d => d.close());
  dbPromise = null;
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

function editionsOf(feedId: FeedId, docs: StoredDoc[]): Edition[] {
  return docs.map(d => {
    const e = parseEdition(feedId, d.file, d.text);
    if (e.issues.length) console.warn(`[intel] ${d.file.name} (${d.id}): ${e.issues.join('; ')}`);
    return e;
  }).sort(newestFirst);
}

/** What this device already has, without asking Drive. */
export async function cachedFeed(feedId: FeedId): Promise<FeedState> {
  const d = await db();
  const [list, docs] = await Promise.all([
    d.get('lists', feedId) as Promise<StoredList | undefined>,
    d.getAll('docs') as Promise<StoredDoc[]>,
  ]);
  return {
    feedId,
    editions: editionsOf(feedId, docs.filter(x => x.feedId === feedId)),
    missing: [],
    status: 'ready',
    message: null,
    refreshedAt: list?.refreshedAt ?? null,
  };
}

/**
 * Lists the feed's folder and fetches what is new or changed. One document
 * failing leaves it out, and listed under `missing`; the list failing leaves
 * the device's copy as it was, with the reason in `status`.
 */
export async function refreshFeed(feedId: FeedId): Promise<FeedState> {
  let files: DriveFile[];
  try {
    ({ files } = await api<{ files: DriveFile[] }>(`feeds/${feedId}`));
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'error';
    return {
      ...(await cachedFeed(feedId)),
      status: code === 'not-configured' || code === 'offline' ? code : 'error',
      message: (e as Error).message,
    };
  }

  const d = await db();
  const held = new Map(((await d.getAll('docs')) as StoredDoc[]).filter(x => x.feedId === feedId).map(x => [x.id, x]));
  const stale = files.filter(f => held.get(f.id)?.file.modifiedTime !== f.modifiedTime);
  const missing: FeedState['missing'] = [];

  const queue = [...stale];
  await Promise.all(Array.from({ length: CONCURRENT_FETCHES }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const { file, text } = await api<{ file: DriveFile; text: string }>(`docs/${encodeURIComponent(f.id)}`);
        const doc: StoredDoc = { id: f.id, feedId, file: { ...f, ...file }, text, fetchedAt: new Date().toISOString() };
        await d.put('docs', doc);
        held.set(f.id, doc);
      } catch (e) {
        console.warn(`[intel] could not fetch ${f.name} (${f.id}): ${(e as Error).message}`);
        missing.push({ file: f, message: (e as Error).message });
      }
    }
  }));

  // A document taken out of the folder leaves this device too.
  const listed = new Set(files.map(f => f.id));
  for (const id of held.keys()) {
    if (!listed.has(id)) {
      await d.delete('docs', id);
      held.delete(id);
    }
  }
  const refreshedAt = new Date().toISOString();
  await d.put('lists', { feedId, files, refreshedAt } satisfies StoredList);

  return {
    feedId,
    editions: editionsOf(feedId, [...held.values()].filter(x => listed.has(x.id))),
    missing,
    status: 'ready',
    message: null,
    refreshedAt,
  };
}

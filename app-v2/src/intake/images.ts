// The reader's images on this device (D4). An article's pictures live on its publisher's site; the
// browser can show them but not keep them (another site's image can't be read). So the reader asks the
// app's own server for them (/api/intake/image, behind the login, images only) and keeps the bytes here,
// in a database of their own (my-planning-intake-images), apart from the rest of the app and its service
// worker:
// - only images the reader shows (as you scroll, near the screen) or that "Keep offline" asks for: nothing
//   downloads in the background by itself;
// - a budget: 400 images and 150 MB at most (an older iPad's share), each image 6 MB at most (the
//   server refuses more);
// - eviction in a fixed order: images unused for 60 days, then the least recently used, never an image an
//   article kept offline holds; when only those are left, a new image is simply not kept;
// - nothing of the app's own in it (no token, no cookie): picture bytes and their address; deleted with the
//   database on signing out.
// The bytes are kept as an ArrayBuffer, not a Blob: Safari can't store a Blob in IndexedDB in a private
// window (and WebKit under test), and a picture that can't be kept is still shown.
import { openDB, type IDBPDatabase } from 'idb';
import { INTAKE_IMAGES_DB } from './cache-name';

let dbPromise: Promise<IDBPDatabase> | null = null;
export function imagesDb() {
  dbPromise ??= openDB(INTAKE_IMAGES_DB, 1, {
    upgrade(d) {
      // What is known about each picture (small, read whole to choose what to evict), and its bytes apart.
      d.createObjectStore('imageMeta', { keyPath: 'url' });
      d.createObjectStore('imageData', { keyPath: 'url' });
    },
    // Signing out deletes this database: let go of it rather than block that.
    blocking() { _closeImages(); },
  });
  return dbPromise;
}

/** Also for tests: as a new session. */
export function _closeImages() {
  dbPromise?.then(d => d.close());
  dbPromise = null;
}

export interface ImageMeta {
  url: string;
  bytes: number;
  type: string;
  /** Its size once shown, so the reader can hold its place before it loads. */
  w: number | null;
  h: number | null;
  savedAt: number;
  usedAt: number;
  /** The articles kept offline that hold it. */
  keptBy: number[];
}

export const IMAGE_BUDGET = { count: 400, bytes: 150 * 1024 * 1024, unusedMs: 60 * 86_400_000 };
const TOUCH_MS = 3_600_000;
const AT_ONCE = 3;

export type ImageResult = { blob: Blob } | { missing: 'offline' | 'blocked' | 'full' };

export const proxiedUrl = (url: string) => `/api/intake/image?url=${encodeURIComponent(url)}`;
/** Pictures written into the article itself: shown as they are, never fetched. */
export const isInline = (url: string) => url.startsWith('data:');

let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= AT_ONCE) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await run(); } finally { active--; waiting.shift()?.(); }
}

/** The kept copy, if there is one (and when it was last used, noted at most once an hour). */
export async function cachedImage(url: string, keptBy?: number): Promise<Blob | null> {
  const db = await imagesDb();
  const [data, meta] = await Promise.all([db.get('imageData', url) as Promise<{ bytes: ArrayBuffer } | undefined>, db.get('imageMeta', url) as Promise<ImageMeta | undefined>]);
  if (!data?.bytes || !meta) return null;
  const now = Date.now();
  const keep = keptBy !== undefined && !meta.keptBy.includes(keptBy);
  if (keep || now - meta.usedAt > TOUCH_MS) await db.put('imageMeta', { ...meta, usedAt: now, keptBy: keep ? [...meta.keptBy, keptBy!] : meta.keptBy });
  return new Blob([data.bytes], { type: meta.type });
}

/** The image for the reader: the kept copy, else through the server, kept if the budget allows. */
export async function imageFor(url: string, keptBy?: number): Promise<ImageResult> {
  const kept = await cachedImage(url, keptBy).catch(() => null);
  if (kept) return { blob: kept };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { missing: 'offline' };
  return slot(async () => {
    let res: Response;
    try {
      res = await fetch(proxiedUrl(url), { credentials: 'same-origin' });
    } catch {
      return { missing: 'offline' as const };
    }
    const type = res.headers.get('Content-Type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return { missing: 'blocked' as const };
    const bytes = await res.arrayBuffer();
    const blob = new Blob([bytes], { type });
    const stored = await store(url, bytes, type, keptBy).catch(() => false);
    return stored || keptBy === undefined ? { blob } : { missing: 'full' as const };
  });
}

/** Keeps the bytes if there is room, making room first by the eviction order. False: not kept. */
async function store(url: string, bytes: ArrayBuffer, type: string, keptBy?: number): Promise<boolean> {
  if (!(await makeRoom(bytes.byteLength))) return false;
  const now = Date.now();
  const db = await imagesDb();
  const tx = db.transaction(['imageMeta', 'imageData'], 'readwrite');
  const meta: ImageMeta = { url, bytes: bytes.byteLength, type, w: null, h: null, savedAt: now, usedAt: now, keptBy: keptBy === undefined ? [] : [keptBy] };
  await Promise.all([tx.objectStore('imageData').put({ url, bytes }), tx.objectStore('imageMeta').put(meta), tx.done]);
  return true;
}

/**
 * Room for `bytes` more: first what hasn't been used for 60 days, then the least recently used, never what
 * an article kept offline holds. False when only those would make room.
 */
export async function makeRoom(bytes: number, now = Date.now()): Promise<boolean> {
  const db = await imagesDb();
  const all = (await db.getAll('imageMeta')) as ImageMeta[];
  const free = all.filter(m => !m.keptBy.length).sort((a, b) => a.usedAt - b.usedAt);
  const drop: string[] = free.filter(m => now - m.usedAt > IMAGE_BUDGET.unusedMs).map(m => m.url);
  let count = all.length - drop.length;
  let total = all.reduce((n, m) => n + m.bytes, 0) - free.filter(m => drop.includes(m.url)).reduce((n, m) => n + m.bytes, 0);
  for (const m of free) {
    if (count + 1 <= IMAGE_BUDGET.count && total + bytes <= IMAGE_BUDGET.bytes) break;
    if (drop.includes(m.url)) continue;
    drop.push(m.url);
    count--;
    total -= m.bytes;
  }
  if (drop.length) {
    const tx = db.transaction(['imageMeta', 'imageData'], 'readwrite');
    await Promise.all([...drop.flatMap(url => [tx.objectStore('imageMeta').delete(url), tx.objectStore('imageData').delete(url)]), tx.done]);
  }
  return count + 1 <= IMAGE_BUDGET.count && total + bytes <= IMAGE_BUDGET.bytes;
}

/** Notes an image's size once shown. */
export async function noteImageSize(url: string, w: number, h: number): Promise<void> {
  const db = await imagesDb();
  const meta = (await db.get('imageMeta', url)) as ImageMeta | undefined;
  if (meta && (meta.w !== w || meta.h !== h)) await db.put('imageMeta', { ...meta, w, h }).catch(() => undefined);
}

/** The sizes known for these images. */
export async function imageSizes(urls: string[]): Promise<Map<string, [number, number]>> {
  const db = await imagesDb();
  const out = new Map<string, [number, number]>();
  for (const url of urls) {
    const m = (await db.get('imageMeta', url)) as ImageMeta | undefined;
    if (m?.w && m.h) out.set(url, [m.w, m.h]);
  }
  return out;
}

export interface KeepOutcome { kept: number; failed: number; full: number }

/** Keep offline: every image of the article, held for it. */
export async function keepImages(articleId: number, urls: string[], onProgress?: (done: number) => void): Promise<KeepOutcome> {
  const out: KeepOutcome = { kept: 0, failed: 0, full: 0 };
  let done = 0;
  await Promise.all([...new Set(urls)].filter(u => !isInline(u)).map(async url => {
    const r = await imageFor(url, articleId);
    if ('blob' in r) out.kept++; else if (r.missing === 'full') out.full++; else out.failed++;
    onProgress?.(++done);
  }));
  return out;
}

/** No longer kept offline: its images become ordinary ones, evicted in turn. */
export async function releaseImages(articleId: number): Promise<void> {
  const db = await imagesDb();
  const all = (await db.getAll('imageMeta')) as ImageMeta[];
  const held = all.filter(m => m.keptBy.includes(articleId));
  if (!held.length) return;
  const tx = db.transaction('imageMeta', 'readwrite');
  await Promise.all([...held.map(m => tx.store.put({ ...m, keptBy: m.keptBy.filter(id => id !== articleId) })), tx.done]);
}

/** What the images take on this device. */
export async function imageUse(): Promise<{ count: number; bytes: number; keptBytes: number }> {
  const all = (await (await imagesDb()).getAll('imageMeta')) as ImageMeta[];
  return {
    count: all.length,
    bytes: all.reduce((n, m) => n + m.bytes, 0),
    keptBytes: all.filter(m => m.keptBy.length).reduce((n, m) => n + m.bytes, 0),
  };
}

// The reader's images on this device (D4). An article's pictures live on its publisher's site; the
// browser can show them but not keep them (another site's image can't be read). So the reader asks the
// app's own server for them (/api/intake/image, behind the login, images only, and only the addresses the
// server signed when it gave the article or the library) and keeps the bytes here, in a database of their
// own (my-planning-intake-images), apart from the rest of the app and its service worker:
// - only images the reader shows (as you scroll, near the screen) or that "Keep offline" asks for: nothing
//   downloads in the background by itself;
// - a budget: 400 images and 150 MB at most (an older iPad's share), less when the browser has less room
//   to give (half of what it says is free, beside what is kept already); each image 6 MB at most (the
//   server refuses more);
// - eviction in a fixed order: images unused for 60 days, then the least recently used, never an image an
//   article kept offline holds; when only those are left, a new image is simply not kept. A browser that
//   refuses to store (its quota) gets room made and one more try; refused again, nothing more is kept this
//   session, and pictures are still shown;
// - a picture's bytes and what is known of it are written together or not at all, after the whole of it
//   has arrived: an interrupted download leaves nothing behind, and a half-written pair is cleared on reading;
// - nothing of the app's own in it (no token, no cookie): picture bytes, their address, their size; and the
//   reader's font (reader-font.ts). Deleted with the database on signing out.
// The bytes are kept as an ArrayBuffer, not a Blob: Safari can't store a Blob in IndexedDB in a private
// window (and WebKit under test), and a picture that can't be kept is still shown.
import { openDB, type IDBPDatabase } from 'idb';
import { INTAKE_IMAGES_DB } from './cache-name';

let dbPromise: Promise<IDBPDatabase> | null = null;
export function imagesDb() {
  dbPromise ??= openDB(INTAKE_IMAGES_DB, 2, {
    upgrade(d, from) {
      if (from < 1) {
        // What is known about each picture (small, read whole to choose what to evict), and its bytes apart.
        d.createObjectStore('imageMeta', { keyPath: 'url' });
        d.createObjectStore('imageData', { keyPath: 'url' });
      }
      if (from < 2) {
        // Each picture's size once shown, kept or not, so its space is held before it loads next time.
        d.createObjectStore('sizes', { keyPath: 'url' });
        // The reader's own files (its font).
        d.createObjectStore('files');
      }
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
  budgetSeen = null;
  storing = true;
}

export interface ImageMeta {
  url: string;
  bytes: number;
  type: string;
  savedAt: number;
  usedAt: number;
  /** The articles kept offline that hold it. */
  keptBy: number[];
}

export const IMAGE_BUDGET = { count: 400, bytes: 150 * 1024 * 1024, unusedMs: 60 * 86_400_000 };
/** The share of the browser's free room the pictures may take, beside what they have. */
const SHARE_OF_FREE = 0.5;
const BUDGET_TTL_MS = 30_000;
const TOUCH_MS = 3_600_000;
const AT_ONCE = 3;
const SIZES_KEPT = 2000;
const WAIT_MAX_S = 20;

export type Missing = 'offline' | 'blocked' | 'full';
export type ImageResult = { blob: Blob } | { missing: Missing };

export const proxiedUrl = (url: string, sig: string) => `/api/intake/image?url=${encodeURIComponent(url)}&s=${encodeURIComponent(sig)}`;
/** Pictures written into the article itself: shown as they are, never fetched. */
export const isInline = (url: string) => url.startsWith('data:');
/** An address as the URL parser writes it, which is how the server signs it; null if it isn't http(s). */
export function imageAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= AT_ONCE) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await run(); } finally { active--; waiting.shift()?.(); }
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** The kept copy, if there is one (and when it was last used, noted at most once an hour). */
export async function cachedImage(url: string, keptBy?: number): Promise<Blob | null> {
  const db = await imagesDb();
  const [data, meta] = await Promise.all([db.get('imageData', url) as Promise<{ bytes: ArrayBuffer } | undefined>, db.get('imageMeta', url) as Promise<ImageMeta | undefined>]);
  if (!data && !meta) return null;
  // Half a pair, or bytes that aren't what was noted: cleared, and fetched again when online.
  if (!data?.bytes || !meta || data.bytes.byteLength !== meta.bytes) {
    const tx = db.transaction(['imageMeta', 'imageData'], 'readwrite');
    await Promise.all([tx.objectStore('imageMeta').delete(url), tx.objectStore('imageData').delete(url), tx.done]);
    return null;
  }
  const now = Date.now();
  const keep = keptBy !== undefined && !meta.keptBy.includes(keptBy);
  if (keep || now - meta.usedAt > TOUCH_MS) await db.put('imageMeta', { ...meta, usedAt: now, keptBy: keep ? [...meta.keptBy, keptBy!] : meta.keptBy });
  return new Blob([data.bytes], { type: meta.type });
}

export interface ImageAsk {
  /** The article kept offline that holds it. */
  keptBy?: number;
  /** The server's signature for the address; without one the server isn't asked. */
  sig?: string | null;
}

/** The image for the reader: the kept copy, else through the server, kept if the budget allows. */
export async function imageFor(url: string, { keptBy, sig }: ImageAsk = {}): Promise<ImageResult> {
  const kept = await cachedImage(url, keptBy).catch(() => null);
  if (kept) return { blob: kept };
  if (offline()) return { missing: 'offline' };
  if (!sig) return { missing: 'blocked' };
  return slot(async () => {
    let bytes: ArrayBuffer, type: string;
    try {
      let res = await fetch(proxiedUrl(url, sig), { credentials: 'same-origin' });
      if (res.status === 429) {
        // The server's share for the minute: wait as it says (briefly), once.
        const wait = Math.min(WAIT_MAX_S, Number(res.headers.get('Retry-After')) || 5);
        await sleep(wait * 1000);
        res = await fetch(proxiedUrl(url, sig), { credentials: 'same-origin' });
      }
      type = res.headers.get('Content-Type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return { missing: 'blocked' as const };
      bytes = await res.arrayBuffer();
    } catch {
      // No answer, or the download broke off: nothing is kept.
      return { missing: offline() ? 'offline' as const : 'blocked' as const };
    }
    const blob = new Blob([bytes], { type });
    const stored = await store(url, bytes, type, keptBy).catch(() => false);
    return stored || keptBy === undefined ? { blob } : { missing: 'full' as const };
  });
}

let budgetSeen: { at: number; bytes: number } | null = null;
/**
 * What the pictures may take: the fixed budget, or less when the browser has less room (half of what it
 * says is free, beside what they take already). Asked of the browser at most every 30 s.
 */
export async function imageBudget(now = Date.now()): Promise<{ count: number; bytes: number }> {
  if (!budgetSeen || now - budgetSeen.at > BUDGET_TTL_MS) {
    let bytes = IMAGE_BUDGET.bytes;
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota) {
        const ours = (await imageUse()).bytes;
        bytes = Math.min(IMAGE_BUDGET.bytes, ours + Math.floor(Math.max(0, e.quota - (e.usage ?? 0)) * SHARE_OF_FREE));
      }
    } catch { /* no estimate: the fixed budget, and the browser's own refusal as the last word */ }
    budgetSeen = { at: now, bytes };
  }
  return { count: IMAGE_BUDGET.count, bytes: budgetSeen.bytes };
}

/** False after the browser refused twice in a row: nothing more is kept this session. */
let storing = true;
// Safari and Chrome abort the transaction when it doesn't fit: the request or the commit fails.
const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'AbortError' || e.code === 22);

/** Keeps the bytes if there is room, making room first by the eviction order. False: not kept. */
async function store(url: string, bytes: ArrayBuffer, type: string, keptBy?: number): Promise<boolean> {
  if (!storing) return false;
  const budget = await imageBudget();
  if (!(await makeRoom(bytes.byteLength, Date.now(), budget))) return false;
  const write = async () => {
    const now = Date.now();
    const db = await imagesDb();
    const tx = db.transaction(['imageMeta', 'imageData'], 'readwrite');
    const meta: ImageMeta = { url, bytes: bytes.byteLength, type, savedAt: now, usedAt: now, keptBy: keptBy === undefined ? [] : [keptBy] };
    await Promise.all([tx.objectStore('imageData').put({ url, bytes }), tx.objectStore('imageMeta').put(meta), tx.done]);
  };
  try {
    await write();
    return true;
  } catch (e) {
    if (!isQuota(e)) return false;
  }
  // The browser has less room than it said: give back a quarter of what isn't held (at least four times
  // this picture), then try once more.
  budgetSeen = null;
  const used = await imageUse();
  const give = Math.max(bytes.byteLength * 4, Math.floor((used.bytes - used.keptBytes) / 4));
  await makeRoom(bytes.byteLength, Date.now(), { count: IMAGE_BUDGET.count, bytes: Math.max(0, used.bytes - give) });
  try {
    await write();
    return true;
  } catch {
    storing = false;
    return false;
  }
}

/**
 * Room for `bytes` more within `budget`: first what hasn't been used for 60 days, then the least recently
 * used, never what an article kept offline holds. False when only those would make room. Only this
 * database's pictures are ever removed (and bytes left without their record).
 */
export async function makeRoom(bytes: number, now = Date.now(), budget: { count: number; bytes: number } = IMAGE_BUDGET): Promise<boolean> {
  const db = await imagesDb();
  const [all, dataKeys] = await Promise.all([db.getAll('imageMeta') as Promise<ImageMeta[]>, db.getAllKeys('imageData')]);
  const known = new Set(all.map(m => m.url));
  const orphans = dataKeys.filter(k => !known.has(String(k)));
  const free = all.filter(m => !m.keptBy.length).sort((a, b) => a.usedAt - b.usedAt);
  const drop: string[] = free.filter(m => now - m.usedAt > IMAGE_BUDGET.unusedMs).map(m => m.url);
  let count = all.length - drop.length;
  let total = all.reduce((n, m) => n + m.bytes, 0) - free.filter(m => drop.includes(m.url)).reduce((n, m) => n + m.bytes, 0);
  for (const m of free) {
    if (count + 1 <= budget.count && total + bytes <= budget.bytes) break;
    if (drop.includes(m.url)) continue;
    drop.push(m.url);
    count--;
    total -= m.bytes;
  }
  if (drop.length || orphans.length) {
    const tx = db.transaction(['imageMeta', 'imageData'], 'readwrite');
    await Promise.all([
      ...drop.flatMap(url => [tx.objectStore('imageMeta').delete(url), tx.objectStore('imageData').delete(url)]),
      ...orphans.map(k => tx.objectStore('imageData').delete(k)),
      tx.done,
    ]);
  }
  return count + 1 <= budget.count && total + bytes <= budget.bytes;
}

/** Notes an image's size once shown, kept or not (the oldest notes go past 2,000). */
export async function noteImageSize(url: string, w: number, h: number): Promise<void> {
  const db = await imagesDb();
  const known = (await db.get('sizes', url)) as { w: number; h: number } | undefined;
  if (known?.w === w && known.h === h) return;
  await db.put('sizes', { url, w, h, at: Date.now() });
  if ((await db.count('sizes')) <= SIZES_KEPT) return;
  const all = (await db.getAll('sizes')) as { url: string; at: number }[];
  const tx = db.transaction('sizes', 'readwrite');
  await Promise.all([...all.sort((a, b) => a.at - b.at).slice(0, all.length - SIZES_KEPT + 200).map(s => tx.store.delete(s.url)), tx.done]);
}

/** The sizes known for these images. */
export async function imageSizes(urls: string[]): Promise<Map<string, [number, number]>> {
  const db = await imagesDb();
  const out = new Map<string, [number, number]>();
  for (const url of urls) {
    const s = (await db.get('sizes', url)) as { w: number; h: number } | undefined;
    if (s?.w && s.h) out.set(url, [s.w, s.h]);
  }
  return out;
}

export interface KeepOutcome { kept: number; failed: number; full: number }

/** Keep offline: every image of the article, held for it. */
export async function keepImages(articleId: number, images: { url: string; sig?: string | null }[], onProgress?: (done: number) => void): Promise<KeepOutcome> {
  const out: KeepOutcome = { kept: 0, failed: 0, full: 0 };
  const unique = [...new Map(images.filter(i => !isInline(i.url)).map(i => [i.url, i])).values()];
  let done = 0;
  await Promise.all(unique.map(async ({ url, sig }) => {
    const r = await imageFor(url, { keptBy: articleId, sig });
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

/** One of the reader's own files (its font), kept here so it is there offline. */
export async function readerFile(key: string): Promise<ArrayBuffer | null> {
  const v = (await (await imagesDb()).get('files', key)) as ArrayBuffer | undefined;
  return Object.prototype.toString.call(v) === '[object ArrayBuffer]' ? v! : null;
}

/** Keeps a file under its key, letting go of earlier ones with the same prefix (an older font). */
export async function keepReaderFile(key: string, bytes: ArrayBuffer, prefix: string): Promise<void> {
  const db = await imagesDb();
  const old = (await db.getAllKeys('files')).filter(k => String(k).startsWith(prefix) && k !== key);
  const tx = db.transaction('files', 'readwrite');
  await Promise.all([...old.map(k => tx.store.delete(k)), tx.store.put(bytes, key), tx.done]);
}

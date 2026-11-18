// The reader's images on the device: asked of the server only with its signature, kept within the budget
// (less when the browser has less room), evicted in a fixed order, never an image an article kept offline
// holds; nothing fetched when a copy is here; a refusal to store, a broken download or a half-written copy
// handled; nothing outside this database touched.
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  imageFor, makeRoom, keepImages, releaseImages, imageUse, imageBudget, noteImageSize, imageSizes, readerFile, keepReaderFile,
  IMAGE_BUDGET, _closeImages, imagesDb, type ImageMeta,
} from './images';

const fetched: { url: string; sig: string | null }[] = [];
const jpeg = (size = 1000) => new Response(new Uint8Array(size), { headers: { 'Content-Type': 'image/jpeg' } });
let answer: (url: string) => Response | Promise<Response> = () => jpeg();
const fakeFetch = vi.fn(async (url: string) => {
  const q = new URL(url, 'https://app.test').searchParams;
  fetched.push({ url: q.get('url')!, sig: q.get('s') });
  return answer(url);
});
vi.stubGlobal('fetch', fakeFetch);
const SIG = { sig: 'signed' };

async function seed(metas: Partial<ImageMeta>[]) {
  const db = await imagesDb();
  for (const m of metas) {
    await db.put('imageMeta', { bytes: 1000, type: 'image/jpeg', savedAt: 0, usedAt: 0, keptBy: [], ...m });
    await db.put('imageData', { url: m.url, bytes: new Uint8Array(m.bytes ?? 1000).buffer });
  }
}
const urls = async () => ((await (await imagesDb()).getAll('imageMeta')) as ImageMeta[]).map(m => m.url).sort();
const dataUrls = async () => (await (await imagesDb()).getAllKeys('imageData')).map(String).sort();
const deleteDb = (name: string) => new Promise<void>(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res(); });

beforeEach(async () => {
  _closeImages();
  await deleteDb('my-planning-intake-images');
  fetched.length = 0;
  answer = () => jpeg();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the image store', () => {
  it('asks the server once, with the signature it gave, then shows the kept copy', async () => {
    expect('blob' in await imageFor('https://cdn.example.com/a.jpg', SIG)).toBe(true);
    expect('blob' in await imageFor('https://cdn.example.com/a.jpg', SIG)).toBe(true);
    expect(fetched).toEqual([{ url: 'https://cdn.example.com/a.jpg', sig: 'signed' }]);
  });

  it('without a signature the server is not asked: the reader shows it from the publisher', async () => {
    expect(await imageFor('https://cdn.example.com/a.jpg')).toEqual({ missing: 'blocked' });
    expect(fetched).toEqual([]);
  });

  it('says when an image is refused, and keeps nothing of it', async () => {
    answer = () => new Response('{"error":{}}', { status: 502, headers: { 'Content-Type': 'application/json' } });
    expect(await imageFor('https://cdn.example.com/b.jpg', SIG)).toEqual({ missing: 'blocked' });
    expect(await urls()).toEqual([]);
  });

  it("waits as the server says when it is busy, once, then asks again", async () => {
    let n = 0;
    answer = () => (n++ === 0 ? new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }) : jpeg());
    const t0 = Date.now();
    expect('blob' in await imageFor('https://cdn.example.com/busy.jpg', SIG)).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(950);
    expect(fetched.length).toBe(2);
  });

  it('a download that breaks off leaves nothing behind', async () => {
    answer = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(500)); c.error(new TypeError('connection lost')); } }), { headers: { 'Content-Type': 'image/jpeg' } });
    expect(await imageFor('https://cdn.example.com/cut.jpg', SIG)).toEqual({ missing: 'blocked' });
    expect([await urls(), await dataUrls()]).toEqual([[], []]);
  });

  it('a half-written copy (its record or its bytes alone, or the wrong length) is cleared and fetched again', async () => {
    const db = await imagesDb();
    await db.put('imageMeta', { url: 'https://cdn.example.com/m.jpg', bytes: 1000, type: 'image/jpeg', savedAt: 0, usedAt: 0, keptBy: [] });
    await db.put('imageData', { url: 'https://cdn.example.com/d.jpg', bytes: new Uint8Array(1000).buffer });
    await seed([{ url: 'https://cdn.example.com/short.jpg', bytes: 1000 }]);
    await db.put('imageData', { url: 'https://cdn.example.com/short.jpg', bytes: new Uint8Array(10).buffer });
    for (const u of ['https://cdn.example.com/m.jpg', 'https://cdn.example.com/d.jpg', 'https://cdn.example.com/short.jpg']) {
      expect('blob' in await imageFor(u, SIG), u).toBe(true);
    }
    expect(fetched.map(f => f.url)).toEqual(['https://cdn.example.com/m.jpg', 'https://cdn.example.com/d.jpg', 'https://cdn.example.com/short.jpg']);
    expect(await urls()).toEqual(await dataUrls());
  });

  it('evicts in order: unused for 60 days, then least recently used; never what an article kept offline holds', async () => {
    const now = Date.now();
    await seed([
      { url: 'old', usedAt: now - IMAGE_BUDGET.unusedMs - 1 },
      { url: 'kept-old', usedAt: now - IMAGE_BUDGET.unusedMs - 1, keptBy: [9] },
      { url: 'a', usedAt: now - 3000 },
      { url: 'b', usedAt: now - 2000 },
      { url: 'c', usedAt: now - 1000 },
    ]);
    // Room for one more within 5 images: only the 60-day one goes.
    expect(await makeRoom(1000, now, { count: 5, bytes: IMAGE_BUDGET.bytes })).toBe(true);
    expect(await urls()).toEqual(['a', 'b', 'c', 'kept-old']);
    // Within 3: the least recently used goes, then the next.
    expect(await makeRoom(1000, now, { count: 3, bytes: IMAGE_BUDGET.bytes })).toBe(true);
    expect(await urls()).toEqual(['c', 'kept-old']);
    // Only what is kept offline is left: no room is made from it.
    expect(await makeRoom(1000, now, { count: 1, bytes: IMAGE_BUDGET.bytes })).toBe(false);
    expect(await urls()).toEqual(['kept-old']);
    expect(await dataUrls()).toEqual(['kept-old']);
  });

  it('holds the bytes to the budget, and clears bytes left without their record', async () => {
    await seed([{ url: 'x', usedAt: Date.now() - 2000, bytes: 1000 }, { url: 'y', usedAt: Date.now() - 1000, bytes: 1000 }]);
    await (await imagesDb()).put('imageData', { url: 'stray', bytes: new Uint8Array(5).buffer });
    expect(await makeRoom(1000, Date.now(), { count: 400, bytes: 2500 })).toBe(true);
    expect([await urls(), await dataUrls()]).toEqual([['y'], ['y']]);
  });

  it('takes less when the browser has less room: half of what is free, beside what it holds', async () => {
    const storage = { estimate: vi.fn(async () => ({ quota: 10_000_000, usage: 9_000_000 })) };
    vi.stubGlobal('navigator', { ...navigator, onLine: true, storage });
    try {
      await seed([{ url: 'p', usedAt: Date.now(), bytes: 1000 }]);
      expect((await imageBudget(1)).bytes).toBe(1000 + 500_000);
      // Asked again only after 30 s.
      await imageBudget(2);
      expect(storage.estimate).toHaveBeenCalledTimes(1);
      // Plenty of room: never more than the fixed budget.
      storage.estimate.mockResolvedValue({ quota: 50e9, usage: 0 });
      expect((await imageBudget(40_000)).bytes).toBe(IMAGE_BUDGET.bytes);
    } finally { vi.unstubAllGlobals(); vi.stubGlobal('fetch', fakeFetch); }
  });

  it("when the browser refuses to store, room is made and it tries once more; refused again, the picture is still shown, and nothing more is kept this session", async () => {
    const now = Date.now();
    await seed([{ url: 'lru', usedAt: now - 5000, bytes: 5000 }, { url: 'recent', usedAt: now - 1000, bytes: 5000 }, { url: 'held', usedAt: now - 9000, keptBy: [3] }]);
    const put = IDBObjectStore.prototype.put;
    let refusals = 1;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'imageData' && refusals-- > 0) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return put.apply(this, args);
    });
    expect('blob' in await imageFor('https://cdn.example.com/new.jpg', SIG)).toBe(true);
    // Room was made from the least recently used, never from what is kept offline; then it was kept.
    expect(await urls()).toEqual(['held', 'https://cdn.example.com/new.jpg', 'recent']);

    refusals = 99;
    expect('blob' in await imageFor('https://cdn.example.com/n2.jpg', SIG)).toBe(true);
    const tries = refusals;
    expect('blob' in await imageFor('https://cdn.example.com/n3.jpg', SIG)).toBe(true);
    expect(refusals).toBe(tries); // not even tried
    expect(await urls()).not.toContain('https://cdn.example.com/n3.jpg');
    expect(await urls()).toContain('held');
    // Kept offline, a picture with no room is said so.
    expect(await imageFor('https://cdn.example.com/n4.jpg', { ...SIG, keptBy: 3 })).toEqual({ missing: 'full' });
  });

  it('never touches anything but its own pictures: the library, the app data and the other databases stay', async () => {
    const lib = await openDB('my-planning-intake', 1, { upgrade(d) { d.createObjectStore('bodies', { keyPath: 'id' }); } });
    await lib.put('bodies', { id: 1, html: '<p>kept</p>' });
    lib.close();
    const app = await openDB('my-planning-db', 1, { upgrade(d) { d.createObjectStore('progressLog', { keyPath: 'id' }); } });
    await app.put('progressLog', { id: 'ar:1', value: { progress: 0.5 } });
    app.close();
    await seed([{ url: 'a', usedAt: 1 }, { url: 'b', usedAt: 2 }]);
    await keepReaderFile('font:x:1', new Uint8Array(10).buffer, 'font:x:');
    expect(await makeRoom(1000, Date.now(), { count: 400, bytes: 0 })).toBe(false);
    expect(await urls()).toEqual([]);
    expect(await readerFile('font:x:1')).not.toBeNull();
    const lib2 = await openDB('my-planning-intake', 1);
    expect(await lib2.get('bodies', 1)).toEqual({ id: 1, html: '<p>kept</p>' });
    lib2.close();
    const app2 = await openDB('my-planning-db', 1);
    expect(await app2.get('progressLog', 'ar:1')).toEqual({ id: 'ar:1', value: { progress: 0.5 } });
    app2.close();
  });

  it('Keep offline holds every image of the article until it is let go', async () => {
    const out = await keepImages(7, [{ url: 'https://cdn.example.com/1.jpg', sig: 's1' }, { url: 'https://cdn.example.com/2.jpg', sig: 's2' }, { url: 'https://cdn.example.com/1.jpg', sig: 's1' }, { url: 'data:image/png;base64,AAAA' }, { url: 'https://cdn.example.com/unsigned.jpg' }]);
    expect(out).toEqual({ kept: 2, failed: 1, full: 0 });
    expect((await imageUse()).keptBytes).toBe(2000);
    await releaseImages(7);
    expect((await imageUse()).keptBytes).toBe(0);
    expect((await imageUse()).count).toBe(2);
  });

  it('notes the size of any picture shown, kept or not, for its space to be held next time', async () => {
    await noteImageSize('https://cdn.example.com/direct.jpg', 1200, 800);
    expect([...(await imageSizes(['https://cdn.example.com/direct.jpg', 'https://cdn.example.com/never.jpg']))]).toEqual([['https://cdn.example.com/direct.jpg', [1200, 800]]]);
  });

  it("keeps the reader's font, a newer one replacing the older", async () => {
    await keepReaderFile('font:latin:/assets/a-1.woff2', new Uint8Array(3).buffer, 'font:latin:');
    await keepReaderFile('font:ext:/assets/b-1.woff2', new Uint8Array(4).buffer, 'font:ext:');
    await keepReaderFile('font:latin:/assets/a-2.woff2', new Uint8Array(5).buffer, 'font:latin:');
    expect(await readerFile('font:latin:/assets/a-1.woff2')).toBeNull();
    expect((await readerFile('font:latin:/assets/a-2.woff2'))?.byteLength).toBe(5);
    expect((await readerFile('font:ext:/assets/b-1.woff2'))?.byteLength).toBe(4);
  });

  it('offline, nothing is asked for, and it says so', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      expect(await imageFor('https://cdn.example.com/c.jpg', SIG)).toEqual({ missing: 'offline' });
      expect(fetched).toEqual([]);
    } finally { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); }
  });
});

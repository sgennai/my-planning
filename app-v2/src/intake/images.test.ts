// The reader's images on the device: kept within the budget, evicted in a fixed order, never an image an
// article kept offline holds; nothing fetched when a copy is here.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { imageFor, makeRoom, keepImages, releaseImages, imageUse, IMAGE_BUDGET, _closeImages, imagesDb as intakeDb, type ImageMeta } from './images';

const fetched: string[] = [];
let answer: (url: string) => Response = () => new Response(new Uint8Array(1000), { headers: { 'Content-Type': 'image/jpeg' } });
vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(decodeURIComponent(url.split('url=')[1])); return answer(url); }));

async function seed(metas: Partial<ImageMeta>[]) {
  const db = await intakeDb();
  for (const m of metas) {
    await db.put('imageMeta', { bytes: 1000, type: 'image/jpeg', w: null, h: null, savedAt: 0, usedAt: 0, keptBy: [], ...m });
    await db.put('imageData', { url: m.url, bytes: new Uint8Array(m.bytes ?? 1000).buffer });
  }
}
const urls = async () => ((await (await intakeDb()).getAll('imageMeta')) as ImageMeta[]).map(m => m.url).sort();

beforeEach(async () => {
  _closeImages();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('my-planning-intake-images'); r.onsuccess = () => res(); r.onerror = () => res(); });
  fetched.length = 0;
  answer = () => new Response(new Uint8Array(1000), { headers: { 'Content-Type': 'image/jpeg' } });
});

describe('the image store', () => {
  it('asks the server once, then shows the kept copy', async () => {
    expect('blob' in await imageFor('https://cdn.example.com/a.jpg')).toBe(true);
    expect('blob' in await imageFor('https://cdn.example.com/a.jpg')).toBe(true);
    expect(fetched).toEqual(['https://cdn.example.com/a.jpg']);
  });

  it('says when an image is refused, and keeps nothing of it', async () => {
    answer = () => new Response('{"error":{}}', { status: 502, headers: { 'Content-Type': 'application/json' } });
    expect(await imageFor('https://cdn.example.com/b.jpg')).toEqual({ missing: 'blocked' });
    expect(await urls()).toEqual([]);
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
    // Room for one more within 4 images: only the 60-day one goes.
    const before = IMAGE_BUDGET.count;
    IMAGE_BUDGET.count = 5;
    try {
      expect(await makeRoom(1000, now)).toBe(true);
      expect(await urls()).toEqual(['a', 'b', 'c', 'kept-old']);
      // Two more: the least recently used goes, then the next.
      IMAGE_BUDGET.count = 3;
      expect(await makeRoom(1000, now)).toBe(true);
      expect(await urls()).toEqual(['c', 'kept-old']);
      // Only what is kept offline is left: no room is made from it.
      IMAGE_BUDGET.count = 1;
      expect(await makeRoom(1000, now)).toBe(false);
      expect(await urls()).toEqual(['c', 'kept-old'].filter(u => u === 'kept-old'));
    } finally { IMAGE_BUDGET.count = before; }
  });

  it('holds the bytes to the budget', async () => {
    const before = IMAGE_BUDGET.bytes;
    IMAGE_BUDGET.bytes = 2500;
    try {
      await seed([{ url: 'x', usedAt: Date.now() - 2000, bytes: 1000 }, { url: 'y', usedAt: Date.now() - 1000, bytes: 1000 }]);
      expect(await makeRoom(1000)).toBe(true);
      expect(await urls()).toEqual(['y']);
    } finally { IMAGE_BUDGET.bytes = before; }
  });

  it('Keep offline holds every image of the article until it is let go', async () => {
    const out = await keepImages(7, ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg', 'https://cdn.example.com/1.jpg', 'data:image/png;base64,AAAA']);
    expect(out).toEqual({ kept: 2, failed: 0, full: 0 });
    expect((await imageUse()).keptBytes).toBe(2000);
    await releaseImages(7);
    expect((await imageUse()).keptBytes).toBe(0);
    expect((await imageUse()).count).toBe(2);
  });

  it('offline, nothing is asked for, and it says so', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      expect(await imageFor('https://cdn.example.com/c.jpg')).toEqual({ missing: 'offline' });
      expect(fetched).toEqual([]);
    } finally { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); }
  });
});

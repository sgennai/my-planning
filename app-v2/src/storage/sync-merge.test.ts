// @vitest-environment jsdom
// Two devices that have not caught up with each other, against a stand-in
// Worker that, like the real one, notes when each record reached it and hands
// out a cursor. Each device keeps its own database and sync markers, so these
// replay the two ways data was lost before the audit of 2026-10-29: a stale
// device's activity list replacing the other's newer edits, and changes made
// offline never reaching a device that had synced in between.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncData, loadData, saveData, initDB, STORES, _resetForTest } from './db';
import { mergeActivityLists } from './merge';
import { makeDefaultData } from '../main-app';
import { setCompletion, buildCompletionIndex, stateOf } from '../routine/engine';
import type { RoutineActivity } from '../routine/model';
import { readingIndex, withPosition, withReadMark, isRead, readingId, READING_TYPE } from '../intelligence/reading';
import { reviewIndex, withRating } from '../intelligence/review';
import type { Edition } from '../intelligence/parse';
import { savedOf, removeInsight, type SavedInsight } from '../intelligence/saved';
import { kitOf, roleOf, withRole, withMembership, withKitLabel, withoutKit } from '../intelligence/kit';
import { annotationsOf, newArticleNote, newPassage, withAnnotation, withNote, withoutAnnotation, withTakeaway } from '../intake/annotations';
import { saveArticleInsight } from '../intelligence/saved';
import type { PassageAnchor } from '../intake/anchor';
import { newWebsite, pinnedOf, moveTo, pinPatch, updateWebsite, updateWebsites, websitesOf, withWebsite, withoutWebsite, type Website } from '../intake/websites';

// ── Stand-in Worker: last-write-wins by updatedAt, listed by arrival ─────────
let clock = Date.parse('2026-10-29T08:00:00.000Z');
const tick = (ms = 1000) => { clock += ms; return new Date(clock).toISOString(); };
const server = new Map<string, Record<string, unknown> & { updatedAt: string; serverAt: string }>();
const online = { value: true };
const pulls: { since: string; cursor: string }[] = [];

(globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (url: string, opts: { body?: string }) => {
  if (!online.value) throw new Error('offline');
  if (url.includes('/sync/push')) {
    const now = tick(1);
    for (const r of JSON.parse(opts.body!)) {
      const key = `${r.storeName}:${r.id}`;
      const existing = server.get(key);
      if (!existing || r.updatedAt > existing.updatedAt) server.set(key, { ...r, serverAt: now });
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }
  if (url.includes('/sync/pull')) {
    const since = new URL(url, 'http://x').searchParams.get('since') || '';
    const cursor = tick(1);
    const records = [...server.values()].filter(r => r.serverAt > since)
      .map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'serverAt')));
    pulls.push({ since, cursor });
    return { ok: true, json: async () => ({ records, cursor }) };
  }
  return { ok: false, statusText: 'Not found' };
});

// ── Devices: each its own IndexedDB contents and localStorage ────────────────
type Device = { rows: Record<string, unknown[]>; storage: Record<string, string> };
const SYNC_URL = 'http://localhost/sync';
const SECRET = 'test-secret';

async function snapshot(): Promise<Device> {
  const db = await initDB();
  const rows: Record<string, unknown[]> = {};
  for (const s of Object.values(STORES)) rows[s] = await db.getAll(s);
  return { rows, storage: { ...localStorage } };
}
async function restore(d: Device) {
  _resetForTest();
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  for (const s of Object.values(STORES)) {
    await tx.objectStore(s).clear();
    for (const r of d.rows[s] || []) await tx.objectStore(s).put(r);
  }
  await tx.done;
  localStorage.clear();
  for (const [k, v] of Object.entries(d.storage)) localStorage.setItem(k, v);
}
/** Run `fn` as device `d` and keep what it leaves behind. */
async function as(d: Device, fn: () => Promise<void>): Promise<Device> {
  await restore(d);
  await fn();
  return snapshot();
}

type Data = { routineActivities: RoutineActivity[]; progressLog: unknown[]; [k: string]: unknown };
const read = async () => (await loadData()) as unknown as Data;
const save = async (d: Data) => { vi.setSystemTime(clock); await saveData(d); };
const sync = async () => { vi.setSystemTime(clock); return syncData(SYNC_URL, SECRET); };
const edit = (d: Data, id: string, patch: Partial<RoutineActivity>): Data => ({
  ...d,
  routineActivities: d.routineActivities.map(a => (a.id === id ? { ...a, ...patch, updatedAt: tick() } : a)),
});
const titleOf = (d: Data, id: string) => d.routineActivities.find(a => a.id === id)?.title;

/** Two devices that both start from the same synced routine. */
async function twoDevices(): Promise<[Device, Device]> {
  const blank: Device = { rows: {}, storage: {} };
  const ipad = await as(blank, async () => { await save(makeDefaultData() as unknown as Data); tick(); await sync(); });
  const iphone = await as(blank, async () => {
    tick();
    await sync();
  });
  // The iPhone's first pull hands it everything; mark it as caught up.
  return [ipad, await as(iphone, async () => { tick(); await sync(); })];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  server.clear();
  pulls.length = 0;
  online.value = true;
  clock = Date.parse('2026-10-29T08:00:00.000Z');
});

describe('two devices editing the routine', () => {
  it('a stale device adding an activity keeps the other device\'s rename', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    // iPad renames the plank and syncs.
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-plank', { title: 'Front plank' })); tick(); await sync(); });
    // The iPhone has not pulled since; it adds an activity from its older list.
    await as(iphone, async () => {
      const d = await read();
      tick();
      await save({ ...d, routineActivities: [...d.routineActivities, {
        ...d.routineActivities[0], id: 'ra-cold-shower', title: 'Cold shower', updatedAt: tick(),
      }] });
      tick();
      await sync();
      const after = await read();
      expect(titleOf(after, 'ra-plank')).toBe('Front plank');
      expect(titleOf(after, 'ra-cold-shower')).toBe('Cold shower');
    });
    // And the iPad gets the merged list back.
    await as(ipad, async () => {
      tick();
      await sync();
      const after = await read();
      expect(titleOf(after, 'ra-plank')).toBe('Front plank');
      expect(titleOf(after, 'ra-cold-shower')).toBe('Cold shower');
    });
  });

  it('a start-up migration on a stale device cannot undo a real edit', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-wall-sit', { photo: 'stretch' })); tick(); await sync(); });
    // The iPhone opens an update whose migration rewrites the wall sit's photo
    // and the plank's title without stamping either, as relabel.ts does.
    await as(iphone, async () => {
      const d = await read();
      tick();
      await save({ ...d, routineActivities: d.routineActivities.map(a =>
        a.id === 'ra-wall-sit' ? { ...a, photo: 'yoga' }
          : a.id === 'ra-plank' ? { ...a, title: 'Plank (migrated)' } : a) });
      tick();
      await sync();
      const after = await read();
      // The real edit wins over the migration's...
      expect(after.routineActivities.find(a => a.id === 'ra-wall-sit')?.photo).toBe('stretch');
      // ...and the migration's change to an activity nobody edited stays.
      expect(titleOf(after, 'ra-plank')).toBe('Plank (migrated)');
    });
    await as(ipad, async () => {
      tick();
      await sync();
      const after = await read();
      expect(after.routineActivities.find(a => a.id === 'ra-wall-sit')?.photo).toBe('stretch');
      expect(titleOf(after, 'ra-plank')).toBe('Plank (migrated)');
    });
  });

  it('the same activity edited on both keeps the later edit', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-plank', { title: 'iPad title' })); tick(); await sync(); });
    await as(iphone, async () => { await save(edit(await read(), 'ra-plank', { title: 'iPhone title' })); tick(); await sync(); });
    await as(ipad, async () => { tick(); await sync(); expect(titleOf(await read(), 'ra-plank')).toBe('iPhone title'); });
  });
});

describe('changes made offline', () => {
  it('reach a device that synced while the other was offline', async () => {
    let [ipad, iphone] = await twoDevices();
    // iPhone ticks the plank with no signal: stamped now, uploaded later.
    online.value = false;
    iphone = await as(iphone, async () => {
      const d = await read();
      await save({ ...d, progressLog: setCompletion(d.progressLog, 'ra-plank', '2026-10-29', 'done') });
      expect((await sync()).error).toBeTruthy();
    });
    online.value = true;
    // Meanwhile the iPad syncs, moving its cursor past the tick's own time.
    tick(60_000);
    ipad = await as(ipad, async () => { await sync(); });
    const ipadCursor = pulls[pulls.length - 1].cursor;
    // The iPhone gets signal and uploads the tick, stamped an hour ago.
    tick(3_600_000);
    await as(iphone, async () => { await sync(); });
    await as(ipad, async () => {
      tick();
      await sync();
      // The iPad asked for what reached the server since its last pull, by the
      // server's marker, not by its own clock.
      expect(pulls[pulls.length - 1].since).toBe(ipadCursor);
      expect(stateOf(buildCompletionIndex((await read()).progressLog), 'ra-plank', '2026-10-29')).toBe('done');
    });
  });
});

describe('two devices reading the same edition (INT-14, D11)', () => {
  const ed = { driveFileId: '1Edition0000000000000000000', feedId: 'enterprise-ai-challenge', modifiedTime: '2026-10-01T00:00:00.000Z' } as Edition;
  /** Changes this device's reading of the edition, at the clock's next second. */
  const reading = async (change: (log: unknown[]) => unknown[]) => {
    const d = await read();
    vi.setSystemTime(tick());
    await save({ ...d, progressLog: change(d.progressLog) });
  };
  const stateOn = async () => readingIndex((await read()).progressLog).get(ed.driveFileId);
  const onServer = () => (server.get(`progressLog:ir:${ed.driveFileId}`)?.payload as { value: unknown }).value;

  it('a device that had not caught up cannot make an edition read elsewhere unread, nor take its progress back', async () => {
    const [first, iphone] = await twoDevices();
    const ipad = await as(first, async () => { await reading(log => withPosition(log, ed, 1, 'vocabulary')); tick(); await sync(); });
    // The iPhone has not pulled since; it scrolls the same edition a little.
    await as(iphone, async () => {
      await reading(log => withPosition(log, ed, 0.35, 'challenge'));
      tick();
      await sync();
      expect(await stateOn()).toMatchObject({ progress: 1, section: 'challenge', readAt: expect.any(String) });
    });
    expect(onServer()).toMatchObject({ progress: 1, readAt: expect.any(String) });
    await as(ipad, async () => {
      tick();
      await sync();
      expect(await stateOn()).toMatchObject({ progress: 1, section: 'challenge', readAt: expect.any(String) });
    });
  });

  /** A start-over as the app wrote it before INT-57 (Mark as unread then reset the reading). */
  const startedOver = (log: unknown[]) => [
    ...log.filter(r => (r as { id?: string }).id !== readingId(ed.driveFileId)),
    { id: readingId(ed.driveFileId), type: READING_TYPE, refId: ed.driveFileId, at: new Date(clock).toISOString(), value: { feedId: ed.feedId, progress: 0, section: null, readAt: null, resetAt: new Date(clock).toISOString() } },
  ];

  it('a start-over written before INT-57 still holds on both, whatever the other did meanwhile', async () => {
    let [ipad, iphone] = await twoDevices();
    ipad = await as(ipad, async () => { await reading(log => withPosition(log, ed, 1, 'vocabulary')); tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); await reading(startedOver); tick(); await sync(); });
    // The iPad, not synced since it read it, scrolls back through it.
    await as(ipad, async () => {
      await reading(log => withPosition(log, ed, 0.5, 'approaches'));
      tick();
      await sync();
      expect(await stateOn()).toMatchObject({ progress: 0, readAt: null, section: 'approaches' });
    });
    await as(iphone, async () => {
      tick();
      await sync();
      expect(await stateOn()).toMatchObject({ progress: 0, readAt: null, section: 'approaches' });
    });
  });

  it('marked read on one, read on to the end on the other: read on both, where each was kept (INT-57)', async () => {
    let [ipad, iphone] = await twoDevices();
    ipad = await as(ipad, async () => { await reading(log => withPosition(log, ed, 0.4, 'challenge')); tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    online.value = false;
    ipad = await as(ipad, async () => { await reading(log => withReadMark(log, ed, true, new Date(clock))); await sync(); });
    iphone = await as(iphone, async () => { await reading(log => withPosition(log, ed, 1, 'vocabulary')); await sync(); });
    online.value = true;
    ipad = await as(ipad, async () => { tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    ipad = await as(ipad, async () => { tick(); await sync(); });
    for (const device of [ipad, iphone]) {
      await as(device, async () => {
        const r = readingIndex((await read()).progressLog);
        expect(isRead(ed, r)).toBe(true);
        expect(r.get(ed.driveFileId)).toMatchObject({ progress: 1, section: 'vocabulary' });
      });
    }
  });

  it('read on one, then unread on the other, both offline: the later stands on both; tapping fast leaves the last tap', async () => {
    let [ipad, iphone] = await twoDevices();
    online.value = false;
    ipad = await as(ipad, async () => { await reading(log => withReadMark(log, ed, true, new Date(clock))); await sync(); });
    iphone = await as(iphone, async () => {
      // Three quick taps: read, unread, read; then a fourth, later than the iPad's: unread.
      await reading(log => withReadMark(log, ed, true, new Date(clock)));
      await reading(log => withReadMark(log, ed, false, new Date(clock)));
      await reading(log => withReadMark(log, ed, true, new Date(clock)));
      await reading(log => withReadMark(log, ed, false, new Date(clock)));
      await sync();
      expect((await read()).progressLog.filter(r => (r as { id?: string }).id === `ic:${ed.driveFileId}`)).toHaveLength(1);
    });
    online.value = true;
    iphone = await as(iphone, async () => { tick(); await sync(); });
    ipad = await as(ipad, async () => { tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    for (const device of [ipad, iphone]) {
      await as(device, async () => { expect(isRead(ed, readingIndex((await read()).progressLog))).toBe(false); });
    }
  });

  it('a review given offline on each: the later rating stands, the count keeps the higher (D12)', async () => {
    const item = { id: 'is:q' } as SavedInsight;
    const review = async (confidence: number) => {
      const d = await read();
      vi.setSystemTime(tick());
      await save({ ...d, progressLog: withRating(d.progressLog, item, confidence, new Date(clock)) });
    };
    let [ipad, iphone] = await twoDevices();
    ipad = await as(ipad, async () => { await review(2); tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    online.value = false;
    ipad = await as(ipad, async () => { await review(4); await review(5); await sync(); });
    iphone = await as(iphone, async () => { tick(); await review(1); await sync(); });
    online.value = true;
    ipad = await as(ipad, async () => { tick(); await sync(); });
    await as(iphone, async () => { tick(); await sync(); expect(reviewIndex((await read()).progressLog).get('is:q')).toMatchObject({ confidence: 1, count: 3 }); });
    await as(ipad, async () => { tick(); await sync(); expect(reviewIndex((await read()).progressLog).get('is:q')).toMatchObject({ confidence: 1, count: 3 }); });
  });
});

describe('the meeting kit on two devices (INT-56)', () => {
  const kept = (id: string, text: string): SavedInsight => ({
    id, type: 'intel-saved', kind: 'labelled', feedId: 'enterprise-ai-challenge', driveFileId: '1Doc',
    editionTitle: 'Lanterns at the Harbour', editionDate: '2026-10-28', editionTime: '08:20', sourceUrl: 'https://docs.google.com/document/d/1Doc/edit',
    sectionId: 'questions', sectionTitle: 'Executive questions', label: 'Executive question', text, note: '', tags: [], savedAt: '2026-10-28T09:00:00Z',
  });
  const q = kept('is:q', 'Which lantern would you light first?');
  const r = kept('is:r', 'Who keeps the harbour lit?');
  /** Changes this device's content at the clock's next second. */
  const change = async (f: (content: unknown[]) => unknown[]) => {
    const d = await read();
    vi.setSystemTime(tick());
    await save({ ...d, content: f((d.content as unknown[]) || []) });
  };
  const kitHere = async () => { const d = await read(); return { kit: kitOf(d.content as unknown[]), saved: savedOf(d.content as unknown[]), log: d.progressLog }; };

  it('a role changed offline on one and the item taken out on the other: both stand, and the takeaways do not change', async () => {
    let [ipad, iphone] = await twoDevices();
    ipad = await as(ipad, async () => { await change(c => withMembership([...c, q, r], q, true, new Date(clock))); tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    online.value = false;
    ipad = await as(ipad, async () => { await change(c => withRole(c, q, 'challenge')); await sync(); });
    iphone = await as(iphone, async () => {
      await change(c => withMembership(c, q, false, new Date(clock)));
      await change(c => withMembership(c, r, true, new Date(clock)));
      await sync();
    });
    online.value = true;
    ipad = await as(ipad, async () => { tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    ipad = await as(ipad, async () => { tick(); await sync(); });
    for (const device of [ipad, iphone]) {
      await as(device, async () => {
        const { kit, saved, log } = await kitHere();
        expect(roleOf(kit, q)).toEqual({ role: 'challenge', chosen: true });
        expect([...kit.members.keys()]).toEqual(['is:r']);
        expect(saved.map(s => s.text).sort()).toEqual([q.text, r.text].sort());
        expect(log.filter(x => (x as { type?: string }).type === 'intel-review')).toEqual([]);
      });
    }
  });

  it('the same item added on both is in the kit once; the meeting\'s name typed later stands', async () => {
    let [ipad, iphone] = await twoDevices();
    ipad = await as(ipad, async () => { await change(c => [...c, q]); tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    online.value = false;
    ipad = await as(ipad, async () => { await change(c => withKitLabel(withMembership(c, q, true, new Date(clock)), 'Harbour board')); await sync(); });
    iphone = await as(iphone, async () => { await change(c => withKitLabel(withMembership(c, q, true, new Date(clock)), 'Port authority')); await sync(); });
    online.value = true;
    ipad = await as(ipad, async () => { tick(); await sync(); });
    iphone = await as(iphone, async () => { tick(); await sync(); });
    ipad = await as(ipad, async () => { tick(); await sync(); });
    for (const device of [ipad, iphone]) {
      await as(device, async () => {
        const { kit } = await kitHere();
        expect([...kit.members.keys()]).toEqual(['is:q']);
        expect(kit.label).toBe('Port authority');
        expect((await read()).content as unknown[]).toHaveLength(4);
      });
    }
  });

  it('a takeaway removed on one device leaves the kit on the other with nothing of it', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    ipad = await as(ipad, async () => { await change(c => withMembership(withRole([...c, q, r], q, 'follow-up'), q, true, new Date(clock))); tick(); await sync(); });
    await as(iphone, async () => { tick(); await sync(); await change(c => withoutKit(removeInsight(c, 'is:q'), 'is:q')); tick(); await sync(); });
    await as(ipad, async () => {
      tick();
      await sync();
      const { kit, saved } = await kitHere();
      expect(saved.map(s => s.id)).toEqual(['is:r']);
      expect(kit.members.size).toBe(0);
      expect(kit.roles.size).toBe(0);
    });
  });
});

describe('highlights and notes on two devices (Intake 2.0 Phase 3)', () => {
  const words = (start: number, quote: string): PassageAnchor => ({
    quote, prefix: '', suffix: '', start, end: start + quote.length, startBlock: null, endBlock: null, textLength: 900, textHash: 'h',
  });
  const put = (f: (c: unknown[] | undefined) => unknown[]) => async () => {
    const d = await read();
    tick();
    await save({ ...d, content: f(d.content as unknown[] | undefined) });
  };
  const notesOf = async () => annotationsOf((await read()).content as unknown[], 7);
  const syncNow = async () => { tick(); await sync(); };

  it('made on each, offline: both kept on both', async () => {
    const [first, second] = await twoDevices();
    online.value = false;
    let ipad = await as(first, put(c => withAnnotation(c, newPassage(7, words(10, 'from the iPad'), '', new Date(clock)))));
    let iphone = await as(second, put(c => withAnnotation(c, newArticleNote(7, 'from the iPhone', new Date(clock)))));
    online.value = true;
    ipad = await as(ipad, syncNow);
    iphone = await as(iphone, syncNow);
    ipad = await as(ipad, syncNow);
    for (const d of [ipad, iphone]) await as(d, async () => expect((await notesOf()).map(a => a.note || a.anchor?.quote).sort()).toEqual(['from the iPad', 'from the iPhone']));
  });

  it('the same note edited on both before they sync: the later edit stands on both', async () => {
    const [first, second] = await twoDevices();
    const a = newPassage(7, words(10, 'kept words'), 'first', new Date(clock));
    let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    ipad = await as(ipad, put(c => withNote(c, a.id, 'edited on the iPad')));
    iphone = await as(iphone, put(c => withNote(c, a.id, 'edited later on the iPhone')));
    online.value = true;
    ipad = await as(ipad, syncNow);
    iphone = await as(iphone, syncNow);
    ipad = await as(ipad, syncNow);
    for (const d of [ipad, iphone]) await as(d, async () => expect((await notesOf())[0].note).toBe('edited later on the iPhone'));
  });

  it('removed offline on one: stays removed on both, the other holding an older copy, in either order', async () => {
    for (const order of ['remover first', 'holder first']) {
      server.clear();
      const [first, second] = await twoDevices();
      const a = newPassage(7, words(10, 'to be removed'), 'with a note', new Date(clock));
      const b = newPassage(7, words(40, 'to stay'), '', new Date(clock));
      let ipad = await as(first, async () => { await put(c => withAnnotation(withAnnotation(c, a), b))(); await syncNow(); });
      let iphone = await as(second, syncNow);
      online.value = false;
      ipad = await as(ipad, put(c => withoutAnnotation(c, a.id)));
      online.value = true;
      if (order === 'remover first') { ipad = await as(ipad, syncNow); iphone = await as(iphone, syncNow); }
      else { iphone = await as(iphone, syncNow); ipad = await as(ipad, syncNow); iphone = await as(iphone, syncNow); }
      ipad = await as(ipad, syncNow);
      for (const d of [ipad, iphone]) await as(d, async () => expect((await notesOf()).map(x => x.id), order).toEqual([b.id]));
    }
  });

  it('a highlight removed on one and saved to Takeaways on the other: the takeaway stays, the highlight goes', async () => {
    const [first, second] = await twoDevices();
    const a = newPassage(7, words(10, 'worth keeping'), '', new Date(clock));
    let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    ipad = await as(ipad, put(c => withoutAnnotation(c, a.id)));
    // Later by the clock, as the reader saves: the takeaway, and its id written on the highlight.
    iphone = await as(iphone, put(c => {
      const out = saveArticleInsight(c, { bookmarkId: 7, url: null, title: 'T', publication: null, author: null, published: null, kind: 'passage', text: 'worth keeping', note: '', sectionTitle: null, annotationId: a.id, anchor: a.anchor }, new Date(clock));
      return withTakeaway(out.content, a.id, out.id);
    }));
    online.value = true;
    iphone = await as(iphone, syncNow);
    ipad = await as(ipad, syncNow);
    iphone = await as(iphone, syncNow);
    for (const d of [ipad, iphone]) {
      await as(d, async () => {
        expect(await notesOf()).toEqual([]);
        expect(savedOf((await read()).content as unknown[]).map(s => s.text)).toEqual(['worth keeping']);
      });
    }
  });

  it('removed on one, its note edited later offline on the other: removed on both, in either order', async () => {
    for (const order of ['remover first', 'editor first']) {
      server.clear();
      const [first, second] = await twoDevices();
      const a = newPassage(7, words(10, 'to be removed'), 'my note', new Date(clock));
      let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
      let iphone = await as(second, syncNow);
      online.value = false;
      ipad = await as(ipad, put(c => withoutAnnotation(c, a.id)));
      iphone = await as(iphone, put(c => withNote(c, a.id, 'edited after the removal')));
      online.value = true;
      if (order === 'remover first') { ipad = await as(ipad, syncNow); iphone = await as(iphone, syncNow); ipad = await as(ipad, syncNow); }
      else { iphone = await as(iphone, syncNow); ipad = await as(ipad, syncNow); iphone = await as(iphone, syncNow); }
      for (const d of [ipad, iphone]) await as(d, async () => expect(await notesOf(), order).toEqual([]));
      expect(server.get(`content:${a.id}`)?.deleted, order).toBe(true);
    }
  });

  it("the other device's clock a day ahead: the removal still wins", async () => {
    const [first, second] = await twoDevices();
    const a = newPassage(7, words(10, 'clock words'), '', new Date(clock));
    let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    ipad = await as(ipad, async () => { await put(c => withoutAnnotation(c, a.id))(); await syncNow(); });
    // The iPhone edits before it has synced, its clock a day fast: its copy is stamped long after the removal.
    iphone = await as(iphone, async () => {
      const d = await read();
      vi.setSystemTime(clock + 24 * 3600 * 1000);
      await saveData({ ...d, content: withNote(d.content as unknown[], a.id, 'a day ahead') } as never);
      await syncNow();
    });
    ipad = await as(ipad, syncNow);
    iphone = await as(iphone, syncNow);
    for (const d of [ipad, iphone]) await as(d, async () => expect(await notesOf()).toEqual([]));
  });

  it('a third device that saw the stale copy meanwhile ends with the removal too', async () => {
    const [first, second] = await twoDevices();
    const a = newPassage(7, words(10, 'three devices'), '', new Date(clock));
    let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    ipad = await as(ipad, put(c => withoutAnnotation(c, a.id)));
    iphone = await as(iphone, put(c => withNote(c, a.id, 'offline edit')));
    online.value = true;
    iphone = await as(iphone, syncNow);                 // the stale edit reaches the server first
    let mac = await as({ rows: {}, storage: {} }, syncNow);
    await as(mac, async () => expect((await notesOf()).map(x => x.note)).toEqual(['offline edit']));
    ipad = await as(ipad, syncNow);                     // the removal comes back up, stamped after the edit
    mac = await as(mac, syncNow);
    iphone = await as(iphone, syncNow);
    for (const d of [ipad, iphone, mac]) await as(d, async () => expect(await notesOf()).toEqual([]));
  });

  it('removed, then the same words highlighted again: a new record of its own, kept on both', async () => {
    const [first, second] = await twoDevices();
    const a = newPassage(7, words(10, 'again'), '', new Date(clock));
    let ipad = await as(first, async () => { await put(c => withAnnotation(c, a))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    const again = newPassage(7, words(10, 'again'), 'second time', new Date(clock));
    ipad = await as(ipad, async () => { await put(c => withAnnotation(withoutAnnotation(c, a.id), again))(); await syncNow(); });
    iphone = await as(iphone, syncNow);
    expect(again.id).not.toBe(a.id);
    for (const d of [ipad, iphone]) await as(d, async () => expect((await notesOf()).map(x => [x.id, x.note])).toEqual([[again.id, 'second time']]));
  });

  it('the rule is for highlights and notes only: a takeaway edited offline after its removal elsewhere still comes back, as before (D12)', async () => {
    const [first, second] = await twoDevices();
    const t = { id: 'is:kept', type: 'intel-saved', kind: 'passage', feedId: 'enterprise-ai-challenge', driveFileId: 'doc', editionTitle: 'E', editionDate: '2026-10-29', editionTime: null, sourceUrl: '', sectionId: null, sectionTitle: null, label: null, text: 'made-up', note: '', tags: [], savedAt: new Date(clock).toISOString() };
    let ipad = await as(first, async () => { await put(c => [...(c ?? []), t])(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    ipad = await as(ipad, put(c => removeInsight(c, t.id)));
    iphone = await as(iphone, put(c => (c ?? []).map(r => ((r as { id: string }).id === t.id ? { ...(r as object), note: 'edited later' } : r))));
    online.value = true;
    ipad = await as(ipad, syncNow);
    iphone = await as(iphone, syncNow);
    ipad = await as(ipad, syncNow);
    for (const d of [ipad, iphone]) await as(d, async () => expect(savedOf((await read()).content as unknown[]).map(x => x.note)).toEqual(['edited later']));
  });

  it("a takeaway removed in Takeaways leaves the highlight it came from", async () => {
    const [first] = await twoDevices();
    const a = newPassage(7, words(10, 'kept apart'), '', new Date(clock));
    await as(first, async () => {
      await put(c => {
        const out = saveArticleInsight(withAnnotation(c, a), { bookmarkId: 7, url: null, title: 'T', publication: null, author: null, published: null, kind: 'passage', text: 'kept apart', note: '', sectionTitle: null, annotationId: a.id, anchor: a.anchor }, new Date(clock));
        return withTakeaway(out.content, a.id, out.id);
      })();
      const id = savedOf((await read()).content as unknown[])[0].id;
      await put(c => removeInsight(c, id))();
      await syncNow();
      expect((await notesOf()).map(x => x.id)).toEqual([a.id]);
    });
  });
});

describe('websites on two devices (Intake › Websites)', () => {
  const put = (f: (c: unknown[] | undefined) => unknown[]) => async () => {
    const d = await read();
    tick();
    await save({ ...d, content: f(d.content as unknown[] | undefined) });
  };
  const sitesNow = async () => websitesOf((await read()).content as unknown[]);
  const syncNow = async () => { tick(); await sync(); };
  const site = (name: string, url: string, pinned = false, sites: Website[] = []) =>
    newWebsite({ url, name, description: '', category: 'Enterprise AI', tags: [], note: '', pinned }, sites, new Date(clock));
  /** Both devices sync until each has the other's changes. */
  const settle = async (a: Device, b: Device): Promise<[Device, Device]> => {
    a = await as(a, syncNow); b = await as(b, syncNow); a = await as(a, syncNow); b = await as(b, syncNow);
    return [a, b];
  };

  it('added on each, offline: both kept on both', async () => {
    const [first, second] = await twoDevices();
    online.value = false;
    let ipad = await as(first, put(c => withWebsite(c, site('HBR', 'https://hbr.org/'))));
    let iphone = await as(second, put(c => withWebsite(c, site('Stratechery', 'https://stratechery.com/'))));
    online.value = true;
    [ipad, iphone] = await settle(ipad, iphone);
    for (const d of [ipad, iphone]) await as(d, async () => expect((await sitesNow()).map(s => s.name).sort()).toEqual(['HBR', 'Stratechery']));
  });

  it('pinned on one and its note edited on the other, both offline: both changes kept on both, in either order', async () => {
    for (const order of ['pinner first', 'writer first']) {
      server.clear();
      const [first, second] = await twoDevices();
      const w = site('MIT Technology Review', 'https://www.technologyreview.com/');
      let ipad = await as(first, async () => { await put(c => withWebsite(c, w))(); await syncNow(); });
      let iphone = await as(second, syncNow);
      online.value = false;
      ipad = await as(ipad, put(c => updateWebsite(c, w.id, { pinned: true, pinRank: 1 }, new Date(clock))));
      iphone = await as(iphone, put(c => updateWebsite(c, w.id, { note: 'Weekly AI briefing' }, new Date(clock))));
      online.value = true;
      [ipad, iphone] = order === 'pinner first' ? await settle(ipad, iphone) : (await settle(iphone, ipad)).reverse() as [Device, Device];
      for (const d of [ipad, iphone]) await as(d, async () => {
        const [got] = await sitesNow();
        expect([got.pinned, got.note], order).toEqual([true, 'Weekly AI briefing']);
      });
    }
  });

  it('the same field edited on both before they sync: the later edit stands on both', async () => {
    const [first, second] = await twoDevices();
    const w = site('Braze', 'https://www.braze.com/resources');
    let ipad = await as(first, async () => { await put(c => withWebsite(c, w))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    ipad = await as(ipad, put(c => updateWebsite(c, w.id, { category: 'Customer Engagement' }, new Date(clock))));
    iphone = await as(iphone, put(c => updateWebsite(c, w.id, { category: 'Sales & GTM' }, new Date(clock))));
    online.value = true;
    [ipad, iphone] = await settle(ipad, iphone);
    for (const d of [ipad, iphone]) await as(d, async () => expect((await sitesNow())[0].category).toBe('Sales & GTM'));
  });

  it('deleted on one, edited offline later on the other: deleted on both, in either order', async () => {
    for (const order of ['deleter first', 'editor first']) {
      server.clear();
      const [first, second] = await twoDevices();
      const gone = site('OpenAI News', 'https://openai.com/news/');
      const kept = site('GitHub Blog', 'https://github.blog/');
      let ipad = await as(first, async () => { await put(c => withWebsite(withWebsite(c, gone), kept))(); await syncNow(); });
      let iphone = await as(second, syncNow);
      online.value = false;
      ipad = await as(ipad, put(c => withoutWebsite(c, gone.id)));
      iphone = await as(iphone, put(c => updateWebsite(c, gone.id, { note: 'edited after the deletion', pinned: true }, new Date(clock))));
      online.value = true;
      [ipad, iphone] = order === 'deleter first' ? await settle(ipad, iphone) : (await settle(iphone, ipad)).reverse() as [Device, Device];
      for (const d of [ipad, iphone]) await as(d, async () => expect((await sitesNow()).map(s => s.name), order).toEqual(['GitHub Blog']));
    }
  });

  it('the pinned reordered on one while another is pinned on the other: one order on both, each change kept', async () => {
    const [first, second] = await twoDevices();
    const a = site('A', 'https://a.example.com/', true);
    const b = site('B', 'https://b.example.com/', true, [a]);
    const c = site('C', 'https://c.example.com/', true, [a, b]);
    const d = site('D', 'https://d.example.com/');
    let ipad = await as(first, async () => { await put(x => [a, b, c, d].reduce((y, w) => withWebsite(y, w), x ?? []))(); await syncNow(); });
    let iphone = await as(second, syncNow);
    online.value = false;
    // iPad: C to the front. iPhone: D pinned (last).
    ipad = await as(ipad, put(x => updateWebsites(x, moveTo(websitesOf(x), c.id, 0).map(m => ({ id: m.id, patch: { pinRank: m.pinRank } })), new Date(clock))));
    iphone = await as(iphone, put(x => { const all = websitesOf(x); return updateWebsite(x, d.id, pinPatch(all, all.find(w => w.id === d.id)!, true), new Date(clock)); }));
    online.value = true;
    [ipad, iphone] = await settle(ipad, iphone);
    for (const dev of [ipad, iphone]) await as(dev, async () => expect(pinnedOf(await sitesNow()).map(s => s.name)).toEqual(['C', 'A', 'B', 'D']));
  });
});

describe('mergeActivityLists', () => {
  const a = (id: string, updatedAt?: string, title = id) => ({ id, updatedAt, title });
  it('keeps each activity\'s newer version and every activity added on either side', () => {
    const merged = mergeActivityLists(
      [a('x', '2026-10-29T09:00:00Z', 'local x'), a('y', '2026-10-29T07:00:00Z', 'local y'), a('mine')],
      [a('x', '2026-10-29T08:00:00Z', 'remote x'), a('y', '2026-10-29T10:00:00Z', 'remote y'), a('theirs')],
    );
    expect(merged.map(m => m.title)).toEqual(['local x', 'remote y', 'mine', 'theirs']);
  });
  it('keeps the local version on a tie, and an unstamped one loses to a stamped one', () => {
    expect(mergeActivityLists([a('x', undefined, 'local')], [a('x', undefined, 'remote')])[0].title).toBe('local');
    expect(mergeActivityLists([a('x', undefined, 'local')], [a('x', '2026-10-29T08:00:00Z', 'remote')])[0].title).toBe('remote');
  });
});

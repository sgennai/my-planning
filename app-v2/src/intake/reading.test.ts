// @vitest-environment jsdom
// Your place, your progress and Finished: kept apart, written only when worth it, and combined across
// devices. The place is found again by its words when the numbering of the blocks shifts.
import { describe, it, expect } from 'vitest';
import { withPosition, withFinished, mergeReading, readingOf, type ReadingRecord } from './reading';
import { placeAt, blockOf, goTo, progressOf, keyOf, type Place } from './place';
import { readingIndex, statusOf } from './articles';
import { mergeLogRecord } from '../storage/merge';

const at = (iso: string) => new Date(iso);
const keyFor = (text: string) => { const p = document.createElement('p'); p.textContent = text; return keyOf(p); };
const P = (block: number, within = 0, key = keyFor(`Block ${block}`)): Place => ({ block, key, within });

describe('reading records', () => {
  it('writes where you are, the furthest progress kept, and nothing for a move of less than a line', () => {
    let log = withPosition([], 7, 0.4, P(10, 0.5), at('2026-11-18T08:00:00Z'));
    expect(readingOf(log, 7)!.value).toEqual({ progress: 0.4, place: P(10, 0.5) });
    // Back up the article: the place moves, the furthest stays.
    log = withPosition(log, 7, 0.2, P(3), at('2026-11-18T08:01:00Z'));
    expect(readingOf(log, 7)!.value).toEqual({ progress: 0.4, place: P(3) });
    const same = withPosition(log, 7, 0.21, P(3, 0.02), at('2026-11-18T08:02:00Z'));
    expect(same).toBe(log);
  });

  it('opening at the top writes nothing', () => {
    const log: unknown[] = [];
    expect(withPosition(log, 7, 0, null)).toBe(log);
  });

  it('Finished is its own record, by your tap only; reading leaves it alone', () => {
    let log = withFinished([], 7, true, at('2026-11-18T09:00:00Z'));
    log = withPosition(log, 7, 1, P(40));
    const index = readingIndex(log);
    expect(statusOf(7, index)).toBe('finished');
    expect(index.get(7)!.place).toEqual(P(40));
    log = withFinished(log, 7, false);
    expect(statusOf(7, readingIndex(log))).toBe('progress');
    // Reading to the very end marks nothing.
    expect(statusOf(8, readingIndex(withPosition([], 8, 1, P(99))))).toBe('progress');
  });

  it('two devices combine: the furthest progress, the later place, in either order', () => {
    const ipad: ReadingRecord = { id: 'ar:7', type: 'intake-reading', refId: '7', at: '2026-11-18T08:00:00Z', value: { progress: 0.7, place: P(30) } };
    const phone: ReadingRecord = { id: 'ar:7', type: 'intake-reading', refId: '7', at: '2026-11-18T08:05:00Z', value: { progress: 0.4, place: P(18) } };
    const merged = mergeReading(ipad, phone);
    expect(merged).toEqual(mergeReading(phone, ipad));
    expect(merged.value).toEqual({ progress: 0.7, place: P(18) });
    expect(merged.at).toBe(phone.at);
    expect(mergeLogRecord(ipad, phone)).toEqual(merged);
  });
});

// jsdom lays nothing out: each block is given its box.
function article(heights: number[], top = 100) {
  const body = document.createElement('div');
  let y = top;
  heights.forEach((h, i) => {
    const p = document.createElement('p');
    p.setAttribute('data-b', String(i));
    p.textContent = `Block ${i}`;
    const t = y;
    p.getBoundingClientRect = () => ({ top: t - scroll.y, bottom: t + h - scroll.y, height: h, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} });
    body.append(p);
    y += h;
  });
  body.getBoundingClientRect = () => ({ top: top - scroll.y, bottom: y - scroll.y, height: y - top, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} });
  return body;
}
const scroll = { y: 0 };
const scroller = { get scrollTop() { return scroll.y; }, set scrollTop(v: number) { scroll.y = v; } } as unknown as HTMLElement;

describe('the place', () => {
  it('is the block at the reading line and how far through it; null at the top', () => {
    scroll.y = 0;
    const body = article([100, 200, 100]);
    expect(placeAt(body, 60)).toBeNull();
    scroll.y = 250; // the line at 60 is now 310 in the article: 110 into block 1
    expect(placeAt(body, 60)).toEqual(P(1, 0.55));
    expect(placeAt(body, 60, 2)).toEqual(P(1, 0.55));
  });

  it('comes back to the same words after the text reflows', () => {
    scroll.y = 0;
    const before = article([100, 200, 100]);
    scroll.y = 250;
    const place = placeAt(before, 60)!;
    // Larger text: every block twice as tall. The same words come back to the line.
    const after = article([200, 400, 200]);
    goTo(scroller, after, place, 60);
    expect(placeAt(after, 60)).toEqual(place);
  });

  it('is found by its words when the numbering shifts, else by its number', () => {
    const body = article([50, 50, 50, 50]);
    expect(blockOf(body, P(1, 0, keyFor('Block 3')))!.textContent).toBe('Block 3');
    expect(blockOf(body, P(2, 0, 'gone'))!.textContent).toBe('Block 2');
  });

  it('keeps no article text: the words become a short fingerprint', () => {
    const key = keyFor('Some words of an article, more than forty characters long in all');
    expect(key).toMatch(/^[0-9a-z]{1,7}$/);
    expect(key).not.toBe(keyFor('Other words of an article, more than forty characters long'));
  });

  it('progress is how far through the article the foot of the view is', () => {
    scroll.y = 0;
    const body = article([500, 500]);
    expect(progressOf(body, 600)).toBe(0.5);
    expect(progressOf(body, 2000)).toBe(1);
  });
});

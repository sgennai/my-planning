// @vitest-environment jsdom
// The reading place kept through a reflow (INT-35), on a stand-in layout:
// jsdom lays nothing out, so each paragraph's box comes from a row height
// that a "reflow" changes, as a new text size or a rotation would.
import { useRef } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useReadingAnchor } from './useReadingAnchor';

let resized: (() => void)[] = [];
vi.stubGlobal('ResizeObserver', class {
  constructor(cb: () => void) { resized.push(cb); }
  observe() {}
  disconnect() {}
});

let rowHeight = 100;
let scroller: HTMLElement;

function Reader({ at }: { at: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useReadingAnchor(ref, at);
  return (
    <div ref={ref} data-testid="reader">
      <article>{Array.from({ length: 20 }, (_, i) => <p key={i} data-row={i}>Paragraph {i}</p>)}</article>
    </div>
  );
}

const reflow = (height: number) => { rowHeight = height; resized.forEach(cb => cb()); };
const topOf = (row: number) => row * rowHeight - scroller.scrollTop;

beforeEach(() => {
  vi.useFakeTimers();
  resized = [];
  rowHeight = 100;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = (this as HTMLElement).dataset?.row;
    if (this === scroller) return { top: 0, bottom: 800, height: 800 } as DOMRect;
    if (row === undefined) return { top: 0, bottom: 0, height: 0 } as DOMRect;
    const top = topOf(Number(row));
    return { top, bottom: top + rowHeight - 20, height: rowHeight - 20 } as DOMRect;
  });
  const view = render(<Reader at="edition-1" />);
  scroller = view.getByTestId('reader');
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const scrollTo = (y: number) => {
  scroller.scrollTop = y;
  fireEvent.scroll(scroller);
  vi.advanceTimersByTime(150);
};

describe('the reading place', () => {
  it('stays put when the text grows, as after a new text size', () => {
    scrollTo(750); // paragraph 7 is at the top, 50 px of it above the edge
    expect(topOf(7)).toBe(-50);
    reflow(160);
    expect(topOf(7)).toBe(-50);
  });

  it('and when it shrinks, as after rotating to a wider screen', () => {
    scrollTo(1230);
    const before = topOf(12);
    reflow(70);
    expect(topOf(12)).toBe(before);
  });

  it('leaves a change the reader made on purpose alone (a tap just before)', () => {
    scrollTo(750);
    fireEvent.pointerDown(scroller);
    reflow(160);
    expect(scroller.scrollTop).toBe(750);
  });

  it('at the very top it stays at the top', () => {
    scrollTo(0);
    reflow(160);
    expect(scroller.scrollTop).toBe(0);
  });
});

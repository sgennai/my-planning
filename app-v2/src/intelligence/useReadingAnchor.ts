// Keeps the reading place when the text reflows: the iPad rotating, a new
// text size, the web font arriving. Safari keeps no scroll anchor of its own,
// so the line at the top of the reader used to move by as much as two
// screens (INT-35). As scrolling rests, the block at the top of the reading
// area (below the sticky section index) and its offset are noted; when the
// reader or its content then changes size with no tap or key just before
// (which means the reader moved things on purpose: a fold, a reveal, a jump),
// the reader scrolls back so that block sits where it was.
import { useEffect, type RefObject } from 'react';

const BLOCKS = 'h1, h2, h3, h4, p, li, blockquote, pre, table, dt, dd';
const REST_MS = 100;
/** A size change this soon after a tap or key is the reader's own doing. */
const AFTER_INPUT_MS = 700;

/** Where reading starts: the scroller's top, or the foot of the section index while it sticks there. */
function lineOf(box: HTMLElement): number {
  const top = box.getBoundingClientRect().top;
  const index = box.querySelector('.intel-index')?.getBoundingClientRect();
  return index && index.top <= top + 1 && index.bottom > top ? index.bottom : top;
}

/** The first block whose bottom is below the line, and how far below the line its top is. */
export function anchorIn(box: HTMLElement): { el: Element; offset: number } | null {
  if (box.scrollTop < 4) return null; // at the top, stay at the top
  const line = lineOf(box);
  for (const el of box.querySelectorAll(BLOCKS)) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > line) return { el, offset: r.top - line };
  }
  return null;
}

/** `key` changes when the reader shows something else: the place is then forgotten. */
export function useReadingAnchor(scroller: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const box = scroller.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    let anchor: { el: Element; offset: number } | null = null;
    let rest = 0;
    let input = 0;

    const onScroll = () => {
      window.clearTimeout(rest);
      rest = window.setTimeout(() => { anchor = anchorIn(box); }, REST_MS);
    };
    const onInput = () => { input = Date.now(); };
    const keep = () => {
      if (!anchor || !anchor.el.isConnected || Date.now() - input < AFTER_INPUT_MS) return;
      const drift = anchor.el.getBoundingClientRect().top - lineOf(box) - anchor.offset;
      if (Math.abs(drift) > 1) box.scrollTop += drift;
    };

    const observer = new ResizeObserver(keep);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    box.addEventListener('scroll', onScroll, { passive: true });
    box.addEventListener('pointerdown', onInput, true);
    box.addEventListener('keydown', onInput, true);
    return () => {
      observer.disconnect();
      window.clearTimeout(rest);
      box.removeEventListener('scroll', onScroll);
      box.removeEventListener('pointerdown', onInput, true);
      box.removeEventListener('keydown', onInput, true);
    };
  }, [scroller, key]);
}

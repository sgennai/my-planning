// Highlights drawn with the CSS Custom Highlight API, as WebKit before autumn 2026 redraws them: a Highlight's own
// add, delete and clear redraw their words; setting or deleting a name in the registry redraws nothing. So the
// words a highlight leaves must be redrawn by the Highlight itself, or they stay gold on the screen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearPaint, flash, holdPaint, paint, HL, HL_FLASH, HL_NOTED } from './highlights';

const registry = new Map<string, FakeHighlight>();
/** What each range's words show on the screen: the names drawn on them when they were last redrawn. */
const screen = new Map<Range, string>();
const redraw = (r: Range) =>
  screen.set(r, [...registry].filter(([, h]) => h.has(r)).map(([name]) => name).sort().join(' '));

class FakeHighlight extends Set<Range> {
  constructor(...ranges: Range[]) { super(); for (const r of ranges) super.add(r); }
  add(r: Range) { super.add(r); redraw(r); return this; }
  delete(r: Range) { const had = super.delete(r); redraw(r); return had; }
  clear() { const was = [...this]; super.clear(); was.forEach(redraw); }
}

let root: HTMLElement;
let a: Range, b: Range;
const words = (i: number) => {
  const r = document.createRange();
  r.selectNodeContents(root.children[i].firstChild!);
  return r;
};

beforeEach(() => {
  registry.clear();
  screen.clear();
  vi.stubGlobal('CSS', { highlights: registry, escape: (s: string) => s });
  vi.stubGlobal('Highlight', FakeHighlight);
  root = document.createElement('div');
  root.innerHTML = '<p data-b="0">First words.</p><p data-b="1">Second words.</p>';
  document.body.replaceChildren(root);
  a = words(0);
  b = words(1);
});
afterEach(() => {
  clearPaint(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('highlights redrawn where they were', () => {
  it('a removed highlight leaves its words unpainted at once; the other stays', () => {
    paint(root, [{ id: 'ih:a', range: a, noted: false }, { id: 'ih:b', range: b, noted: false }]);
    expect(screen.get(a)).toBe(HL);
    paint(root, [{ id: 'ih:b', range: b, noted: false }]);
    expect(screen.get(a)).toBe('');
    expect(screen.get(b)).toBe(HL);
    paint(root, []);
    expect(screen.get(b)).toBe('');
    expect(registry.size).toBe(0);
  });

  it('a note deleted: its words lose the noted style at once', () => {
    paint(root, [{ id: 'ih:a', range: a, noted: true }]);
    expect(screen.get(a)).toBe(HL_NOTED);
    paint(root, [{ id: 'ih:a', range: a, noted: false }]);
    expect(screen.get(a)).toBe(HL);
  });

  it('a flash ends on the words as they were', () => {
    vi.useFakeTimers();
    paint(root, [{ id: 'ih:a', range: a, noted: false }]);
    flash(root, b, null, 1000);
    expect(screen.get(b)).toBe(HL_FLASH);
    vi.advanceTimersByTime(1000);
    expect(screen.get(b)).toBe('');
    expect(registry.has(HL_FLASH)).toBe(false);
  });

  it('removed while the note editor is open: nothing drawn meanwhile, and only what remains drawn after', () => {
    paint(root, [{ id: 'ih:a', range: a, noted: true }, { id: 'ih:b', range: b, noted: false }]);
    const release = holdPaint();
    expect(screen.get(a)).toBe('');
    expect(screen.get(b)).toBe('');
    paint(root, [{ id: 'ih:b', range: b, noted: false }]);
    expect(screen.get(b)).toBe('');
    release();
    expect(screen.get(a)).toBe('');
    expect(screen.get(b)).toBe(HL);
  });

  it('leaving the article redraws every highlighted word', () => {
    paint(root, [{ id: 'ih:a', range: a, noted: true }, { id: 'ih:b', range: b, noted: false }]);
    clearPaint(null);
    expect(screen.get(a)).toBe('');
    expect(screen.get(b)).toBe('');
  });
});

// Where you are in an article, in words rather than pixels: the block of text at the reading line (a
// paragraph, a heading, a figure: `data-b`, numbered by sanitize.ts), a fingerprint of its first words to
// find it again if the numbering ever shifts (a hash: no article text goes into your synced data), and how
// far through it the line is. A new text size, width, line spacing, the panel or a rotation move every
// pixel, never this.
export interface Place {
  /** The block's number in the article. */
  block: number;
  /** A fingerprint of its first words, to recognise it. */
  key: string;
  /** How far through the block the reading line is, 0–1. */
  within: number;
}

const KEY_LENGTH = 40;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** FNV-1a, 32 bits, in base 36: short, and enough to tell a block from its neighbours. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function keyOf(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return hash(text ? text.slice(0, KEY_LENGTH) : `img:${(el.querySelector('img') ?? el).getAttribute('data-src') ?? ''}`);
}

const blocksOf = (body: Element) => body.querySelectorAll<HTMLElement>('[data-b]');

/**
 * The place at `line` (a height on the screen, as getBoundingClientRect gives it): the first block whose
 * foot is below the line. Null before the first block: at the top, among the title and what follows it.
 * `hint`, the block found last time, makes the search short while scrolling.
 */
export function placeAt(body: Element, line: number, hint = 0): Place | null {
  const blocks = blocksOf(body);
  if (!blocks.length) return null;
  let i = Math.min(Math.max(0, hint), blocks.length - 1);
  // Back while the block before still reaches the line, then on to the first that does.
  while (i > 0 && blocks[i - 1].getBoundingClientRect().bottom > line) i--;
  while (i < blocks.length - 1 && blocks[i].getBoundingClientRect().bottom <= line) i++;
  const r = blocks[i].getBoundingClientRect();
  if (i === 0 && r.top > line) return null;
  return { block: i, key: keyOf(blocks[i]), within: r.height > 0 ? clamp((line - r.top) / r.height) : 0 };
}

/** The block a place names: by its number, or by its words nearby if the numbering moved. */
export function blockOf(body: Element, place: Place): HTMLElement | null {
  const blocks = blocksOf(body);
  const at = blocks[place.block];
  if (at && keyOf(at) === place.key) return at;
  for (let d = 1; d <= 60; d++) {
    for (const i of [place.block - d, place.block + d]) {
      const b = blocks[i];
      if (b && keyOf(b) === place.key) return b;
    }
  }
  return at ?? blocks[blocks.length - 1] ?? null;
}

/** Scrolls so the place is at the reading line, `line` being where it is on the screen. Null: the top. */
export function goTo(scroller: HTMLElement, body: Element, place: Place | null, line: number): void {
  if (!place) { scroller.scrollTop = 0; return; }
  const el = blockOf(body, place);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const delta = r.top + place.within * r.height - line;
  if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
}

/** How far through the article the foot of the view is: 0 at its start, 1 at its end. */
export function progressOf(body: Element, viewBottom: number): number {
  const r = body.getBoundingClientRect();
  return r.height > 0 ? clamp((viewBottom - r.top) / r.height) : 0;
}

/** Close enough not to be worth a write: the same block, about a line apart. */
export const samePlace = (a: Place | null | undefined, b: Place | null | undefined) =>
  a === b || (!!a && !!b && a.block === b.block && a.key === b.key && Math.abs(a.within - b.within) < 0.05);

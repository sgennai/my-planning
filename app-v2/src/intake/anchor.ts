// A passage you keep in an article (Phase 3: a highlight, its note, a takeaway), and finding it again.
//
// The article's text is read into one string (`TextIndex`): every text node of the body in order, white
// space collapsed to one space, a newline where a block (a paragraph, an item, a heading…) or a line break
// ends, and nothing the reader adds itself (a missing picture's note, "View full size"). A passage is kept
// as its exact words in that string, the 32 characters on each side, where it stood (character offsets),
// the blocks it starts and ends in (place.ts's numbering and fingerprint), and the length and a fingerprint
// of the whole text, so the same version is known when it is met again.
//
// Finding it (`resolve`): in the same version, where it was. In another one (Instapaper's parse can change,
// and another device may have fetched the article at another time), where the same words stand with the
// same words around them. Only beyond doubt: words that are gone, or that stand in several places the
// context can't tell apart, leave the passage unavailable rather than on the wrong words. Finding a passage
// writes nothing: the record keeps what it was kept with. Never pixels, percentages, child indices or a
// first match alone.
import { hash, keyOf } from './place';

export interface BlockRef {
  /** The block's number in the article (`data-b`). */
  block: number;
  /** A fingerprint of its first words (place.ts). */
  key: string;
}

export interface PassageAnchor {
  /** The words, exactly as the article has them (white space as one space, a block's end as a newline). */
  quote: string;
  /** Up to 32 characters before them, and after. */
  prefix: string;
  suffix: string;
  /** Where they stood in the article's text when kept. */
  start: number;
  end: number;
  startBlock: BlockRef | null;
  endBlock: BlockRef | null;
  /** The text they were kept from: its length and fingerprint. */
  textLength: number;
  textHash: string;
}

export const CONTEXT = 32;
/** Shorter than this is not a passage. */
const MIN_LENGTH = 2;
/** What the reader puts in the article itself, which isn't the article's text. */
const SKIP = '.ikr-img-missing, .ikr-whole';
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION', 'TABLE',
  'CAPTION', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'HR', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE',
]);
const SPACE = 32;
const BREAK = 10;

export interface TextIndex {
  text: string;
  hash: string;
  nodes: Text[];
  /** Each character's text node (an index in `nodes`; -1 for a block's end, which the index adds) and its offset there. */
  nodeAt: Int32Array;
  offsetAt: Int32Array;
  /** For each node, how far `text` had reached before each of its offsets (0 to its length). */
  before: Int32Array[];
  ids: Map<Text, number>;
}

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 160;

function blockAround(node: Node, root: Element): Element | null {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) if (BLOCK_TAGS.has(el.tagName)) return el;
  return null;
}

/** The article's text, read from its body. */
export function indexText(root: Element): TextIndex {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeType === 1 && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const codes: number[] = [];
  const nodeAt: number[] = [];
  const offsetAt: number[] = [];
  const nodes: Text[] = [];
  const before: Int32Array[] = [];
  // White space waiting to be written as one character before the next word: 0 none, 1 a space, 2 a break.
  let pending = 0;
  let pendNode = -1;
  let pendOffset = 0;
  let block: Element | null | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) {
      if ((n as Element).tagName === 'BR') pending = 2;
      continue;
    }
    const t = n as Text;
    const b = blockAround(t, root);
    if (block !== undefined && b !== block) pending = 2;
    block = b;
    const id = nodes.length;
    nodes.push(t);
    const data = t.data;
    const map = new Int32Array(data.length + 1);
    for (let k = 0; k < data.length; k++) {
      map[k] = codes.length;
      const c = data.charCodeAt(k);
      if (isSpace(c)) {
        if (!pending) { pending = 1; pendNode = id; pendOffset = k; }
        continue;
      }
      if (pending && codes.length) {
        codes.push(pending === 2 ? BREAK : SPACE);
        nodeAt.push(pending === 2 ? -1 : pendNode);
        offsetAt.push(pending === 2 ? 0 : pendOffset);
      }
      pending = 0;
      codes.push(c);
      nodeAt.push(id);
      offsetAt.push(k);
    }
    map[data.length] = codes.length;
    before.push(map);
  }
  let text = '';
  for (let i = 0; i < codes.length; i += 8192) text += String.fromCharCode(...codes.slice(i, i + 8192));
  return {
    text,
    hash: hash(text),
    nodes,
    nodeAt: Int32Array.from(nodeAt),
    offsetAt: Int32Array.from(offsetAt),
    before,
    ids: new Map(nodes.map((t, i) => [t, i])),
  };
}

/** Where a point of the page (a range's start or end) falls in the text. */
export function indexAt(ix: TextIndex, container: Node, offset: number): number {
  if (container.nodeType === 3) {
    const id = ix.ids.get(container as Text);
    if (id !== undefined) return ix.before[id][Math.min(Math.max(0, offset), (container as Text).data.length)];
  }
  // Between elements, or in text that isn't the article's: the first of the article's text after the point.
  const at = (container.ownerDocument ?? document).createRange();
  at.setStart(container, offset);
  let lo = 0;
  let hi = ix.nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at.comparePoint(ix.nodes[mid], 0) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo < ix.nodes.length ? ix.before[lo][0] : ix.text.length;
}

/** The passage's ends without the white space around it; null when too short to keep. */
export function trimmed(ix: TextIndex, start: number, end: number): { start: number; end: number } | null {
  const t = ix.text;
  while (start < end && isSpace(t.charCodeAt(start))) start++;
  while (end > start && isSpace(t.charCodeAt(end - 1))) end--;
  return end - start >= MIN_LENGTH ? { start, end } : null;
}

/** The part of a selection that is in the article's text, as offsets; null when none of it is, or too little. */
export function offsetsOf(ix: TextIndex, range: Range, root: Element): { start: number; end: number } | null {
  if (range.collapsed || !range.intersectsNode(root)) return null;
  const start = root.contains(range.startContainer) ? indexAt(ix, range.startContainer, range.startOffset) : 0;
  const end = root.contains(range.endContainer) ? indexAt(ix, range.endContainer, range.endOffset) : ix.text.length;
  return trimmed(ix, start, end);
}

function blockAt(ix: TextIndex, i: number, step: 1 | -1): BlockRef | null {
  while (i >= 0 && i < ix.nodeAt.length && ix.nodeAt[i] < 0) i += step;
  const node = ix.nodes[ix.nodeAt[i]];
  const el = node?.parentElement?.closest('[data-b]');
  return el ? { block: Number(el.getAttribute('data-b')), key: keyOf(el) } : null;
}

/** What is kept of a passage, from its offsets. */
export function anchorAt(ix: TextIndex, start: number, end: number): PassageAnchor {
  const t = ix.text;
  return {
    quote: t.slice(start, end),
    prefix: t.slice(Math.max(0, start - CONTEXT), start),
    suffix: t.slice(end, end + CONTEXT),
    start,
    end,
    startBlock: blockAt(ix, start, 1),
    endBlock: blockAt(ix, end - 1, -1),
    textLength: t.length,
    textHash: ix.hash,
  };
}

/** The page's range for offsets of the text. */
export function rangeAt(ix: TextIndex, start: number, end: number): Range | null {
  let i = start;
  while (i < end && ix.nodeAt[i] < 0) i++;
  let j = end - 1;
  while (j >= i && ix.nodeAt[j] < 0) j--;
  if (j < i || i >= ix.nodeAt.length) return null;
  const first = ix.nodes[ix.nodeAt[i]];
  const r = first.ownerDocument.createRange();
  r.setStart(first, ix.offsetAt[i]);
  r.setEnd(ix.nodes[ix.nodeAt[j]], ix.offsetAt[j] + 1);
  return r;
}

export type Found =
  | { start: number; end: number; how: 'same' | 'found' }
  /** `gone`: its words aren't in this text; `ambiguous`: they are, in places that can't be told apart. */
  | { missing: 'gone' | 'ambiguous' };

const loose = (s: string) => s.replace(/\n/g, ' ');
function commonTail(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonHead(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Where a kept passage stands in this text. The same version: where it was. Otherwise every place its words
 * stand (a break and a space count as the same) is weighed by how much of the words kept around it are
 * there too, and by its first block's fingerprint. One is taken only when it stands out:
 * - the words before or after it are all the same (its own context, or the article's very start or end),
 *   and no other place weighs as much;
 * - or it is the only place, and the words are long enough (24 characters) or keep some context (8);
 * - or its context outweighs any other place's by far (16 against at most 8 less).
 * Otherwise it is unavailable: never on words that may not be the ones kept.
 */
export function resolve(ix: TextIndex, a: PassageAnchor): Found {
  const t = ix.text;
  if (t.slice(a.start, a.end) === a.quote && (a.textHash === ix.hash
    || (t.slice(Math.max(0, a.start - CONTEXT), a.start) === a.prefix && t.slice(a.end, a.end + CONTEXT) === a.suffix))) {
    return { start: a.start, end: a.end, how: 'same' };
  }
  const lt = loose(t);
  const lq = loose(a.quote);
  if (lq.trim().length < MIN_LENGTH) return { missing: 'gone' };
  const lp = loose(a.prefix);
  const ls = loose(a.suffix);
  const at: number[] = [];
  for (let i = lt.indexOf(lq); i >= 0 && at.length < 500; i = lt.indexOf(lq, i + 1)) at.push(i);
  if (!at.length) return { missing: 'gone' };
  const scored = at.map(c => {
    const p = lt.slice(Math.max(0, c - CONTEXT), c);
    const s = lt.slice(c + lq.length, c + lq.length + CONTEXT);
    const key = a.startBlock && blockAt(ix, c, 1)?.key === a.startBlock.key ? 6 : 0;
    return { c, score: commonTail(p, lp) + commonHead(s, ls) + key, full: p === lp || s === ls, near: Math.abs(c - a.start) };
  }).sort((x, y) => y.score - x.score || x.near - y.near);
  const [best, second] = scored;
  const margin = second ? best.score - second.score : Infinity;
  const ok = margin > 0 && (
    best.full
    || (scored.length === 1 && (lq.length >= 24 || best.score >= 8))
    || (best.score >= 16 && margin >= 8)
  );
  if (!ok) return { missing: scored.length > 1 ? 'ambiguous' : 'gone' };
  return { start: best.c, end: best.c + a.quote.length, how: 'found' };
}

/** The words of a passage to show or save: a block's end as a paragraph break. */
export const quoteText = (quote: string) => quote.replace(/\n/g, '\n\n');

// Your highlights drawn on the article (Phase 3). With the browser's own highlighting where it has it (the CSS
// Custom Highlight API: ranges painted under the text, so the article's HTML, its links, its pictures and the
// reading place's blocks are untouched), else by wrapping each piece of their text in a span (inline, with no
// box of its own: nothing moves, and the blocks' words, the place's fingerprint, stay the same). A tap on the
// words of a highlight finds it (`hitAt`); going to one makes it brighter for a moment (`flash`).

export const HL = 'ikr-hl';
export const HL_NOTED = 'ikr-hl-noted';
export const HL_FLASH = 'ikr-hl-flash';
const SPAN = 'ikr-hl';
const SKIP = '.ikr-img-missing, .ikr-whole';

export interface Painted {
  id: string;
  range: Range;
  /** It carries a note: drawn with a faint underline too. */
  noted: boolean;
}

interface Hl extends Iterable<Range> { add(r: Range): unknown; clear(): void }
type Registry = Map<string, Hl>;
const registry = (): Registry | null => {
  const css = (globalThis as { CSS?: { highlights?: Registry } }).CSS;
  return css?.highlights && typeof (globalThis as { Highlight?: unknown }).Highlight === 'function' ? css.highlights : null;
};
const highlight = () => new (globalThis as unknown as { Highlight: new () => Hl }).Highlight();

/**
 * Draws these ranges under one name, changing its Highlight in place. WebKit before autumn 2026 doesn't redraw
 * the words of a Highlight replaced in, or deleted from, the registry (WebKit bugs 306396, 321567): a removed
 * highlight stayed gold until something else redrew its lines. A Highlight's own clear and add redraw them.
 */
function show(reg: Registry, name: string, ranges: Range[]): void {
  let h = reg.get(name);
  if (!ranges.length) {
    if (h) { h.clear(); reg.delete(name); }
    return;
  }
  if (!h) { h = highlight(); reg.set(name, h); }
  h.clear();
  for (const r of ranges) h.add(r);
}

/** Whether this browser draws highlights itself. */
export const drawsHighlights = () => registry() !== null;

/** Takes the spans away (a browser without the API), the text joined back as it was. */
export function unwrap(root: Element): void {
  const spans = root.querySelectorAll(`span.${SPAN}`);
  if (!spans.length) return;
  const parents = new Set<Node>();
  for (const s of spans) {
    const parent = s.parentNode;
    if (!parent) continue;
    s.replaceWith(...s.childNodes);
    parents.add(parent);
  }
  for (const p of parents) p.normalize();
}

/** The pieces of text a range covers, white space between blocks left out. */
function piecesOf(range: Range): { node: Text; start: number; end: number }[] {
  const root = range.commonAncestorContainer;
  const out: { node: Text; start: number; end: number }[] = [];
  const take = (t: Text) => {
    if (t.parentElement?.closest(SKIP)) return;
    const start = t === range.startContainer ? range.startOffset : 0;
    const end = t === range.endContainer ? range.endOffset : t.data.length;
    if (end > start && t.data.slice(start, end).trim()) out.push({ node: t, start, end });
  };
  if (root.nodeType === 3) { take(root as Text); return out; }
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (range.intersectsNode(n)) take(n as Text);
  return out;
}

/**
 * Draws them, in place of what was drawn. Returns each with a range that stays right for finding a tap and
 * going to it (with spans, the range over its own spans).
 */
export function paint(root: Element, items: Painted[]): Painted[] {
  const reg = registry();
  if (reg) {
    const plain = items.filter(i => !i.noted).map(i => i.range);
    const noted = items.filter(i => i.noted).map(i => i.range);
    if (held) { held.set(HL, plain); held.set(HL_NOTED, noted); }
    else { show(reg, HL, plain); show(reg, HL_NOTED, noted); }
    return items;
  }
  // Spans: per text node, the stretches each highlight covers (two devices' overlapping highlights split into
  // pieces that don't overlap), wrapped from the last to the first so the offsets before hold.
  const byNode = new Map<Text, { start: number; end: number; id: string; noted: boolean }[]>();
  for (const it of items) {
    for (const p of piecesOf(it.range)) {
      const list = byNode.get(p.node) ?? [];
      list.push({ start: p.start, end: p.end, id: it.id, noted: it.noted });
      byNode.set(p.node, list);
    }
  }
  for (const [node, list] of byNode) {
    const cuts = [...new Set(list.flatMap(p => [p.start, p.end]))].sort((a, b) => a - b);
    for (let k = cuts.length - 2; k >= 0; k--) {
      const s = cuts[k], e = cuts[k + 1];
      const over = list.filter(p => p.start <= s && e <= p.end);
      if (!over.length) continue;
      const doc = node.ownerDocument;
      const piece = node.splitText(s);
      piece.splitText(e - s);
      const span = doc.createElement('span');
      span.className = SPAN + (over.some(p => p.noted) ? ' is-noted' : '');
      // Every highlight over these words, so each finds all of its own pieces (overlapping ones share some).
      span.dataset.hl = [...new Set(over.map(p => p.id))].join(' ');
      piece.replaceWith(span);
      span.append(piece);
    }
  }
  return items.flatMap(it => {
    const spans = root.querySelectorAll<HTMLElement>(`span.${SPAN}[data-hl~="${CSS.escape(it.id)}"]`);
    if (!spans.length) return [];
    const range = root.ownerDocument.createRange();
    range.setStartBefore(spans[0]);
    range.setEndAfter(spans[spans.length - 1]);
    return [{ ...it, range }];
  });
}

/** Nothing drawn any more (leaving the article). */
export function clearPaint(root: Element | null): void {
  const reg = registry();
  if (reg) for (const name of [HL, HL_NOTED, HL_FLASH]) show(reg, name, []);
  held?.clear();
  if (root) unwrap(root);
}

/**
 * WebKit (Safari 26) draws a page's custom highlights on the first words of an open <dialog> that holds a text
 * field, in place of their own words, for as long as it is open. So while the note editor is open none are drawn:
 * they are held back here (and any drawn meanwhile with them), and drawn again as it closes.
 */
let held: Map<string, Range[]> | null = null;
export function holdPaint(): () => void {
  const reg = registry();
  if (!reg || held) return () => {};
  const keep = new Map<string, Range[]>();
  for (const name of [HL, HL_NOTED]) {
    keep.set(name, [...(reg.get(name) ?? [])]);
    show(reg, name, []);
  }
  show(reg, HL_FLASH, []);
  held = keep;
  return () => {
    held = null;
    for (const [name, ranges] of keep) show(reg, name, ranges);
  };
}

/** The highlight under a point of the screen (a tap on its words), the shortest if several. */
export function hitAt(items: Painted[], x: number, y: number): string | null {
  let best: { id: string; size: number } | null = null;
  for (const it of items) {
    for (const r of it.range.getClientRects()) {
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) {
        const size = it.range.toString().length;
        if (!best || size < best.size) best = { id: it.id, size };
        break;
      }
    }
  }
  return best?.id ?? null;
}

let flashTimer = 0;
/** One highlight (or a passage found for a takeaway) brighter for a moment, then as it was. */
export function flash(root: Element, range: Range, id: string | null, ms = 1600): void {
  window.clearTimeout(flashTimer);
  const reg = registry();
  if (reg) {
    if (held) return;
    show(reg, HL_FLASH, [range]);
    flashTimer = window.setTimeout(() => show(reg, HL_FLASH, []), ms);
    return;
  }
  const spans = id ? [...root.querySelectorAll<HTMLElement>(`span.${SPAN}[data-hl~="${CSS.escape(id)}"]`)] : [];
  spans.forEach(s => s.classList.add('is-flash'));
  flashTimer = window.setTimeout(() => spans.forEach(s => s.classList.remove('is-flash')), ms);
}

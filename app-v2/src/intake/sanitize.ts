// An article's HTML, as Instapaper parsed it, made safe and plain for the reader (D5: DOMPurify, a short
// allowlist). What is kept: the text and its structure (headings, paragraphs, lists, quotations, code,
// tables, figures and captions), links, images. What goes: scripts, styles, classes, ids, forms, and
// anything that runs or loads by itself. Embedded media (video, iframes) become a link to the original.
//
// It also prepares the article for the reader:
// - headings are shifted so the article's own start at h2 (the title is the page's h1), and h2/h3 get
//   ids for the contents;
// - images keep their address in `data-src` and load through the reader, never by themselves;
// - links open beside the app, without referrer or opener; other schemes lose their link, keep their text;
// - every block of text (a paragraph, a heading, an item, a figure…) is numbered (`data-b`): the reading
//   place is a block and how far through it, so it survives a new text size or width.
import DOMPurify from 'dompurify';

export interface Heading { id: string; text: string; level: 2 | 3 }
export interface CleanArticle {
  html: string;
  headings: Heading[];
  /** Every image's address, in order. */
  images: string[];
  /** The text of the first block, to tell whether a description only repeats it. */
  opening: string;
}

const TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'img', 'a',
  'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'code', 'pre', 'kbd', 'samp', 'var', 'table', 'thead',
  'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'hr', 'br', 'sup', 'sub', 'small', 'span', 'div', 'section',
  'article', 'header', 'footer', 'aside', 'dl', 'dt', 'dd', 'abbr', 'cite', 'q', 'time',
];
const ATTRS = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'dir', 'lang', 'datetime', 'start', 'reversed', 'scope'];
const EMBEDS = 'iframe, video, audio, embed, object';
/** What the reading place counts: a block of text, or a figure. */
export const BLOCKS = 'p, h2, h3, h4, h5, h6, li, blockquote, pre, figure, table, dt, dd, hr, img';
const TEXT_BLOCKS = BLOCKS.replace(', img', '');
const CONTAINERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE']);
const IMAGE_DATA = /^data:image\/(png|gif|jpe?g|webp);base64,/i;
const EMBED_MARK = 'ikr-embed';

const absolute = (raw: string | null, base: string | null): URL | null => {
  if (!raw) return null;
  try { return new URL(raw.trim(), base ?? undefined); } catch { return null; }
};
const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

let purify: ReturnType<typeof DOMPurify> | null = null;
const purifier = () => (purify ??= DOMPurify(window));

/** `base`: the article's address, against which relative links and images resolve. */
export function cleanArticle(html: string, base: string | null): CleanArticle {
  // Parsed inert first (nothing loads or runs in a parsed document), to turn embeds into links.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll(EMBEDS)) {
    const src = absolute(el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? el.getAttribute('data') ?? null, base);
    if (!src || !/^https?:$/.test(src.protocol)) { el.remove(); continue; }
    const p = doc.createElement('p');
    const a = doc.createElement('a');
    a.setAttribute('href', src.href);
    a.setAttribute('title', EMBED_MARK); // the allowlist keeps no data attribute: found again below
    a.textContent = `${el.tagName === 'AUDIO' ? 'Audio' : 'Embedded media'} (opens beside the app)`;
    p.append(a);
    el.replaceWith(p);
  }
  const body = purifier().sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM: true,
  }) as HTMLElement;

  for (const a of body.querySelectorAll(`a[title="${EMBED_MARK}"]`)) {
    a.removeAttribute('title');
    a.parentElement?.setAttribute('data-embed', '');
  }
  // Links: http(s) and mail beside the app; anything else keeps its words only.
  for (const a of body.querySelectorAll('a')) {
    const url = absolute(a.getAttribute('href'), base);
    if (url && /^(https?|mailto):$/.test(url.protocol) && !(url.hash && base && url.href.split('#')[0] === base.split('#')[0])) {
      a.setAttribute('href', url.href);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else a.replaceWith(...a.childNodes);
  }
  // Images: the address kept for the reader to load; none without one it can use.
  const images: string[] = [];
  for (const img of body.querySelectorAll('img')) {
    const raw = img.getAttribute('src');
    const url = raw && IMAGE_DATA.test(raw) ? raw : absolute(raw, base)?.href;
    img.removeAttribute('src');
    if (!url || !(IMAGE_DATA.test(url) || /^https?:/.test(url))) { img.remove(); continue; }
    img.setAttribute('data-src', url);
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
    images.push(url);
  }
  // Empty paragraphs and wrappers (a body often ends with a few).
  for (const el of [...body.querySelectorAll('p, span, div, section, figure, li, blockquote, h1, h2, h3, h4, h5, h6')].reverse()) {
    if (!textOf(el) && !el.querySelector('img, hr, br, table, pre, a[href]')) el.remove();
  }
  shiftHeadings(body);
  for (const table of body.querySelectorAll('table')) {
    const wrap = body.ownerDocument.createElement('div');
    wrap.className = 'ikr-table';
    table.replaceWith(wrap);
    wrap.append(table);
  }

  const headings: Heading[] = [];
  body.querySelectorAll('h2, h3').forEach((h, i) => {
    const text = textOf(h);
    if (!text) return;
    h.id = `ikh-${i + 1}`;
    headings.push({ id: h.id, text, level: h.tagName === 'H2' ? 2 : 3 });
  });

  // The blocks the reading place counts: the innermost ones (a paragraph in a quotation, not both), and a
  // wrapper that holds its own text.
  // (An image in a paragraph belongs to the paragraph.)
  const isLeaf = (el: Element) => !el.querySelector(TEXT_BLOCKS);
  const leaves = [...body.querySelectorAll(`${BLOCKS}, div, section, article, header, footer, aside`)].filter(el =>
    CONTAINERS.has(el.tagName)
      ? isLeaf(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())
      : el.tagName === 'IMG' ? !el.parentElement?.closest(BLOCKS) : isLeaf(el) || el.tagName === 'FIGURE' || el.tagName === 'TABLE');
  // A figure or table counts once, not again for what is inside it.
  const counted = leaves.filter(el => !el.parentElement?.closest('figure, table'));
  counted.forEach((el, i) => el.setAttribute('data-b', String(i)));

  const first = counted.find(el => textOf(el));
  return { html: body.innerHTML, headings, images, opening: first ? textOf(first) : '' };
}

/** The article's own headings start at h2: an h1 in the body becomes h2, and the rest follow. */
function shiftHeadings(body: HTMLElement) {
  const found = [1, 2, 3, 4, 5, 6].find(n => body.querySelector(`h${n}`));
  if (!found || found >= 2) return;
  for (const h of [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')]) {
    const level = Math.min(6, Number(h.tagName[1]) + 1);
    const next = body.ownerDocument.createElement(`h${level}`);
    next.append(...h.childNodes);
    for (const { name, value } of [...h.attributes]) next.setAttribute(name, value);
    h.replaceWith(next);
  }
}

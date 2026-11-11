// Publication integrity (INT-45): does a feed's Drive document say what the
// task's ChatGPT reply said? The reply is the authority. The contract
// (`SUPPORTING FILES/intelligence-publication-integrity-contract.md`) allows
// only these differences, which are set aside before comparing:
//   - the YAML header;
//   - the publication receipt (the closing "Google Drive archive" note);
//   - ChatGPT's own interface messages (`artifacts.ts`);
//   - ChatGPT's link artifacts, when the address is kept: its tracking tag,
//     a source chip repeating the link before it (`tidyLinks`), and a source
//     chip, named by its domain ("[prnewswire.com](…)") or standing right
//     after another link ("… [Reuters, 4 May](…) [OCC](…)"), whose name is
//     not compared as words: its address is, with every other source;
//   - formatting: line breaks and blank lines, emphasis, heading, list and
//     quote markers, a label written as a heading or in bold, punctuation,
//     quote and dash styles, letter case.
// Everything else fails, and is named: changed, missing or added words (with
// their section and the words on either side), missing or added sections, and
// missing or added source addresses. Pure: it reads and writes nothing.
import { bodyOf, bodyOfDocument, tidyLinks, untagged } from './backfill';
import { setAside } from './artifacts';

export interface Hunk {
  kind: 'changed' | 'missing' | 'added';
  /** The section it is in, as the reply heads it. */
  section: string;
  /** The reply's words, with a few around them. */
  reply: string;
  /** The Drive document's words in their place. */
  drive: string;
}

export interface Fidelity {
  pass: boolean;
  hunks: Hunk[];
  missingSections: string[];
  addedSections: string[];
  missingSources: string[];
  addedSources: string[];
  /** A missing source whose page the copy has at another address (another query string or fragment). */
  samePage: Record<string, string>;
  /** What was set aside as allowed. */
  allowed: { receipt: boolean; interface: number; trackingTags: number; repeatChips: number; sourceChips: boolean };
  /** The comparison gave up: the two are too different to align. */
  tooDifferent?: boolean;
}

/** Hunks this many words apart or closer read as one. */
const JOIN = 3;
/** A run of this many words or more, with nothing in its place, is missing or added text. */
const PARAGRAPH = 12;
/** Beyond this many differing words, say so rather than align. */
const MAX_EDITS = 3000;
const CONTEXT = 4;

/** The receipt as the briefs' replies write it: "**Google Drive archive:** [Open the verified Google Doc](…)". */
const RECEIPT_LINE = /\n+(?:(?:-{3,}|\*{3,}|_{3,})[ \t]*\n+)?\*\*Google Drive archive:?\*\*:?[^\n]*\s*$/i;

function withoutReceipt(markdown: string): { markdown: string; receipt: boolean } {
  const a = bodyOf(markdown);
  const b = a.replace(RECEIPT_LINE, '').replace(/\n+(?:-{3,}|\*{3,}|_{3,})[ \t]*$/, '').trim();
  return { markdown: b, receipt: b !== markdown.trim() };
}

interface Prepared { markdown: string; tags: number; repeats: number; interface: number; receipt: boolean }

function prepare(markdown: string): Prepared {
  const { markdown: noReceipt, receipt } = withoutReceipt(markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  const { body, aside } = setAside(noReceipt);
  const tidied = tidyLinks(body);
  return { markdown: tidied.markdown, tags: tidied.tags, repeats: tidied.repeats.length, interface: aside.length, receipt };
}

const URL = /https?:\/\/[^\s)<>\]"]+/g;
const address = (u: string) => untagged(u.replace(/[.,;:!?]+$/, '')).replace(/\/$/, '');

function sourcesOf(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const m of markdown.matchAll(/\]\(([^()\s]+)\)/g)) out.add(address(m[1]));
  for (const m of markdown.replace(/\]\([^()\s]+\)/g, ']').matchAll(URL)) out.add(address(m[0]));
  return out;
}

/** A line's words without its Markdown: link text kept, addresses and markers dropped. */
function plainLine(line: string): string {
  return line
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(URL, ' ')
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\W)[*_](\S)/g, '$1$2').replace(/(\S)[*_](?=\W|$)/g, '$1')
    .replace(/\|/g, ' ');
}

const norm = (w: string) => w.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase();

interface Token { w: string; shown: string; section: string }

function tokensOf(markdown: string): { tokens: Token[]; titles: string[] } {
  const tokens: Token[] = [];
  const titles: string[] = [];
  let section = '';
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const title = /^#{1,6}\s+(.+?)\s*#*$/.exec(line)?.[1] ?? /^\*\*((?:(?!\*\*)[^\n]){1,80}?)\*\*:?$/.exec(line)?.[1];
    const text = plainLine(line);
    if (title) {
      section = plainLine(title).replace(/:$/, '').trim();
      titles.push(section);
    }
    for (const m of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)) tokens.push({ w: norm(m[0]), shown: m[0], section });
  }
  return { tokens, titles };
}

type Op = ['=' | '-' | '+', number, number];

/** Myers' difference of two word lists, or null past `MAX_EDITS`. */
function difference(a: string[], b: string[]): Op[] | null {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let edits = -1;
  outer: for (let d = 0; d <= Math.min(max, MAX_EDITS); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { edits = d; break outer; }
    }
  }
  if (edits < 0) return null;
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = edits; d > 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push(['=', x - 1, y - 1]); x--; y--; }
    if (x === prevX) ops.push(['+', -1, y - 1]); else ops.push(['-', x - 1, -1]);
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { ops.push(['=', x - 1, y - 1]); x--; y--; }
  return ops.reverse();
}

function hunksOf(ops: Op[], reply: Token[], drive: Token[]): Hunk[] {
  // Runs of edits, joined across short stretches of equal words.
  const runs: { from: number; to: number }[] = [];
  ops.forEach((op, i) => {
    if (op[0] === '=') return;
    const last = runs[runs.length - 1];
    const gap = last ? ops.slice(last.to + 1, i).length : Infinity;
    if (last && gap <= JOIN) last.to = i; else runs.push({ from: i, to: i });
  });
  const words = (ts: Token[]) => ts.map(t => t.shown).join(' ');
  return runs.map(({ from, to }) => {
    const span = ops.slice(from, to + 1);
    const del = span.filter(o => o[0] !== '+').map(o => reply[o[1]]);
    const ins = span.filter(o => o[0] !== '-').map(o => drive[o[2]]);
    const before = ops.slice(Math.max(0, from - CONTEXT), from).filter(o => o[0] === '=').map(o => reply[o[1]]);
    const after = ops.slice(to + 1, to + 1 + CONTEXT).filter(o => o[0] === '=').map(o => reply[o[1]]);
    const removed = span.filter(o => o[0] === '-').length, added = span.filter(o => o[0] === '+').length;
    const kind = removed >= PARAGRAPH && !added ? 'missing' : added >= PARAGRAPH && !removed ? 'added' : 'changed';
    const anchor = span.find(o => o[0] === '-') ?? ops[from - 1] ?? span[0];
    const section = anchor[0] === '+' ? drive[anchor[2]].section : reply[anchor[1]].section;
    const ctx = (mid: Token[]) => [words(before), mid.length ? `[${words(mid)}]` : '[—]', words(after)].filter(Boolean).join(' ');
    return { kind, section, reply: ctx(del), drive: ctx(ins) } as Hunk;
  });
}

/** A link named only by a domain, as ChatGPT's source chips are: "[help.example.com](…)". */
const DOMAIN_CHIP = /[ \t]*\[((?:[a-z0-9-]+\.)+[a-z]{2,})\]\(([^()\s]+)\)/gi;
/** A link right after another, only spaces between: a source chip. */
const NEXT_CHIP = /(\]\([^()\s]+\))(?:[ \t]+\[[^\]\n]*\]\([^()\s]+\))+/g;

/** The words compared: a document without its source chips' names. */
const withoutChips = (md: string) => md.replace(DOMAIN_CHIP, '').replace(NEXT_CHIP, '$1');
const pageOf = (u: string) => u.replace(/[?#].*$/, '').replace(/\/$/, '');

/** The reply against the Drive document (its plain-text export, header and all). */
export function compareFidelity(replyMarkdown: string, driveText: string): Fidelity {
  const r = prepare(replyMarkdown);
  const d = prepare(bodyOfDocument(driveText));
  const chips = (md: string) => (sourcesOf(md).size ? md.length - withoutChips(md).length : 0);
  const allowed = {
    receipt: r.receipt || d.receipt, interface: r.interface + d.interface, trackingTags: r.tags + d.tags,
    repeatChips: r.repeats + d.repeats, sourceChips: chips(r.markdown) !== chips(d.markdown),
  };

  const rs = sourcesOf(r.markdown), ds = sourcesOf(d.markdown);
  const missingSources = [...rs].filter(u => !ds.has(u));
  const addedSources = [...ds].filter(u => !rs.has(u));
  const samePage = Object.fromEntries(missingSources.flatMap(u => {
    const kept = [...ds].find(k => pageOf(k) === pageOf(u));
    return kept ? [[u, kept]] : [];
  }));

  const rt = tokensOf(withoutChips(r.markdown)), dt = tokensOf(withoutChips(d.markdown));
  const titleKey = (t: string) => norm(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const dTitles = new Set(dt.titles.map(titleKey)), rTitles = new Set(rt.titles.map(titleKey));
  const missingSections = rt.titles.filter(t => !dTitles.has(titleKey(t)));
  const addedSections = dt.titles.filter(t => !rTitles.has(titleKey(t)));

  const ops = difference(rt.tokens.map(t => t.w), dt.tokens.map(t => t.w));
  const hunks = ops ? hunksOf(ops, rt.tokens, dt.tokens) : [];
  const pass = !!ops && !hunks.length && !missingSections.length && !addedSections.length && !missingSources.length && !addedSources.length;
  return { pass, hunks, missingSections, addedSections, missingSources, addedSources, samePage, allowed, ...(!ops && { tooDifferent: true }) };
}

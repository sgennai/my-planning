// How each section of an edition is shown. The document's words are never
// changed or dropped: a section takes a richer form (a topic cloud, numbered
// cards, question callouts, vocabulary cards) only when every one of its
// blocks fits that form. Anything else is shown as the Markdown it is.
import type { FeedId } from './feeds';
import type { Section } from './parse';

export type Presentation =
  | { kind: 'markdown'; markdown: string }
  /** A paragraph that is bold throughout opens the section. */
  | { kind: 'lead'; lead: string; rest: string }
  | { kind: 'topics'; topics: string[]; label: string | null; highlighted: string[] }
  | { kind: 'numbered'; items: { n: string; title: string; body: string }[] }
  /** Markdown whose list items are things people say. */
  | { kind: 'quotes'; markdown: string }
  | { kind: 'questions'; items: Labelled[] }
  | { kind: 'vocabulary'; terms: Term[]; notes: Labelled[] };

export interface Labelled { label: string; text: string }
export interface Term { n: string | null; term: string; definition: string }

/** Paragraphs, lists and the like: the text between blank lines. */
export function blocksOf(markdown: string): string[] {
  return markdown.split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean);
}

const keyOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A short name for the section index: the title up to a dash or colon. */
export function shortTitle(title: string): string {
  return title.split(/\s+[—–]\s+|:\s/)[0].trim() || title;
}

const BOLD_ONLY = /^\*\*((?:(?!\*\*)[^\n])+?)\*\*$/;
const LABEL = /^\*\*((?:(?!\*\*)[^\n])+?)\*\*:?$/;
const NUMBERED = /^\*\*\s*(\d+)[.)]\s+((?:(?!\*\*)[^\n])+?)\s*\*\*$/;
const TERM = /^\*\*\s*(?:(\d+)[.)]\s*)?((?:(?!\*\*)[^\n])+?)\s*\*\*\s*(?:[—–-]|:)\s*([\s\S]+)$/;
const LABELLED_LINE = /^\*\*((?:(?!\*\*)[^\n])+?)\*\*:?\s+([^\n]+)$/;
const SEPARATOR = /\s+[•·]\s+/;
/** Topic names are plain words: no emphasis, links or code to lose. */
const PLAIN = /^[^*_`[\]<>#\n]+$/;

const unlabel = (label: string) => label.replace(/\s*:\s*$/, '').trim();

function lead(markdown: string): Presentation {
  const first = /^\s*(\S[^\n]*)(?:\n[ \t]*\n|\s*$)/.exec(markdown);
  const bold = first && BOLD_ONLY.exec(first[1].trim());
  if (!first || !bold) return { kind: 'markdown', markdown };
  return { kind: 'lead', lead: bold[1].trim(), rest: markdown.slice(first[0].length).trim() };
}

function topics(markdown: string): Presentation | null {
  let all: string[] | null = null;
  let label: string | null = null;
  let highlighted: string[] = [];
  for (const block of blocksOf(markdown)) {
    const line = LABELLED_LINE.exec(block);
    if (line && !label && PLAIN.test(line[2])) {
      label = unlabel(line[1]);
      highlighted = line[2].split(SEPARATOR).map(t => t.trim()).filter(Boolean);
      continue;
    }
    const items = block.split(SEPARATOR);
    if (!all && items.length >= 3 && PLAIN.test(block)) {
      all = items.map(t => t.trim()).filter(Boolean);
      continue;
    }
    return null;
  }
  if (!all) return null;
  const known = new Set(all.map(t => t.toLowerCase()));
  // A highlighted topic missing from the map still shows, at the end.
  const extra = highlighted.filter(t => !known.has(t.toLowerCase()));
  return { kind: 'topics', topics: [...all, ...extra], label, highlighted };
}

function numbered(markdown: string): Presentation | null {
  const items: { n: string; title: string; body: string[] }[] = [];
  for (const block of blocksOf(markdown)) {
    const m = NUMBERED.exec(block);
    if (m) items.push({ n: m[1], title: m[2].trim(), body: [] });
    else if (items.length) items[items.length - 1].body.push(block);
    else return null;
  }
  if (items.length < 2) return null;
  return { kind: 'numbered', items: items.map(i => ({ n: i.n, title: i.title, body: i.body.join('\n\n') })) };
}

function labelled(blocks: string[]): Labelled[] | null {
  const items: { label: string; text: string[] }[] = [];
  for (const block of blocks) {
    const m = LABEL.exec(block);
    if (m) items.push({ label: unlabel(m[1]), text: [] });
    else if (items.length) items[items.length - 1].text.push(block);
    else return null;
  }
  if (!items.length || items.some(i => !i.text.length)) return null;
  return items.map(i => ({ label: i.label, text: i.text.join('\n\n') }));
}

function questions(markdown: string): Presentation | null {
  const items = labelled(blocksOf(markdown));
  return items ? { kind: 'questions', items } : null;
}

function vocabulary(markdown: string): Presentation | null {
  const blocks = blocksOf(markdown);
  const terms: Term[] = [];
  let i = 0;
  for (; i < blocks.length; i++) {
    const m = TERM.exec(blocks[i]);
    if (!m) break;
    terms.push({ n: m[1] ?? null, term: m[2].trim(), definition: m[3].trim() });
  }
  if (!terms.length) return null;
  const rest = blocks.slice(i);
  const notes = rest.length ? labelled(rest) : [];
  return notes ? { kind: 'vocabulary', terms, notes } : null;
}

/** The form a section takes. Only the AI Challenge has its own forms so far. */
export function presentSection(feedId: FeedId, section: Section): Presentation {
  const { markdown } = section;
  const fallback: Presentation = { kind: 'markdown', markdown };
  if (feedId !== 'enterprise-ai-challenge') return fallback;
  const key = keyOf(section.title);
  if (/topic map$/.test(key)) return topics(markdown) ?? fallback;
  if (key === 'challenge') return lead(markdown);
  if (/^(\d+|three) approaches$/.test(key)) return numbered(markdown) ?? fallback;
  if (key === 'what to listen for') return { kind: 'quotes', markdown };
  if (/discovery questions$/.test(key)) return questions(markdown) ?? fallback;
  if (/vocabulary/.test(key)) return vocabulary(markdown) ?? fallback;
  return fallback;
}

/** What Copy puts on the clipboard: the words, without the quotation marks around them. */
export function copyText(markdown: string): string {
  const plain = markdown.replace(/\*\*|__/g, '').trim();
  const quoted = /^(["“«'‘])\s*([\s\S]*?)\s*(["”»'’])$/.exec(plain);
  return quoted ? quoted[2] : plain;
}

/** Markdown as the words it shows: no emphasis, link targets, markers or headings. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREVIEW_MAX = 220;

/**
 * A few lines to know an edition by, taken from its own words: the first
 * paragraph of "What I should remember today", else of the Challenge, else of
 * the first section that is prose. Cut at a word, with an ellipsis.
 */
export function previewOf(sections: Section[]): string | null {
  const prose = (s: Section) => blocksOf(s.markdown).find(b => !/^\s*(?:[-*+]|\d+[.)])\s/.test(b) && !SEPARATOR.test(b));
  const pick = sections.find(s => /what i should remember/.test(keyOf(s.title)))
    ?? sections.find(s => keyOf(s.title) === 'challenge')
    ?? sections.find(s => s.title && prose(s));
  const block = pick && prose(pick);
  if (!block) return null;
  const text = plainText(block);
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, text.lastIndexOf(' ', PREVIEW_MAX - 1)).replace(/[,;:.\s]+$/, '')}…`;
}

/** Minutes to read, at 220 words a minute; never under one. */
export function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / 220));
}

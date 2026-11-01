// The Enterprise AI Sales Brief and the Customer Engagement Brief, read as
// their tasks write them. Their developments are made of labelled parts: a
// label on its own line ("**What happened**", "**Executive question**") or at
// the head of a paragraph ("**Sales implication:** …"). Each part keeps its
// label and its words; a label the app does not know is still a part, shown
// plainly. The other sections take a form (a summary, a callout, a list of
// questions or points, a watchlist) only when they fit it entirely, and are
// otherwise shown as the Markdown they are.
import { slugOf, type Section } from './parse';
import { blocksOf, keyOf, SEPARATOR, PLAIN, unlabel } from './blocks';

export type PartTone =
  | 'fact' | 'interpretation' | 'question' | 'response' | 'quote'
  | 'banks' | 'usecase' | 'unica' | 'implication' | 'prep' | 'plain';

export interface Part { label: string | null; tone: PartTone; markdown: string }

export interface Development {
  /** Unique within the edition: the section's id and the development's. */
  id: string;
  title: string;
  /** The development's text as written, for saving it whole. */
  markdown: string;
  parts: Part[];
}

export type BriefPresentation =
  /** What to remember, the executive take: the edition in brief. */
  | { kind: 'summary'; markdown: string }
  /** A section holding developments under deeper headings (the Sales Brief's themes). */
  | { kind: 'developments'; themes: string[] | null; intro: string; items: Development[] }
  /** A section that is itself one development (the Engagement Brief's numbered ones). */
  | { kind: 'development'; parts: Part[] }
  | { kind: 'callout'; tone: 'question' | 'insight' | 'watch'; markdown: string }
  /** Questions to ask, each to copy or keep. */
  | { kind: 'question-list'; items: string[] }
  | { kind: 'points'; items: { lead: string; text: string }[] }
  | { kind: 'watchlist'; items: { name: string; text: string }[] };

const LABEL_ONLY = /^\*\*((?:(?!\*\*)[^\n]){1,80}?)\*\*:?$/;
const LABEL_INLINE = /^\*\*((?:(?!\*\*)[^\n]){1,80}?)(?::\*\*|\*\*:)\s+([\s\S]+)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const HEADING = /^(#{2,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const QUOTED = /^["“«]/;

/** What a part is, from its label, for how it is shown. */
export function toneOf(label: string): PartTone {
  const k = keyOf(label);
  if (/^(confirmed|what happened|reported)/.test(k)) return 'fact';
  if (/^interpretation/.test(k)) return 'interpretation';
  if (/how i can respond/.test(k)) return 'response';
  if (/question/.test(k)) return 'question';
  if (/linkedin/.test(k)) return 'quote';
  if (/banking use case/.test(k)) return 'usecase';
  if (/banks|banking relevance/.test(k)) return 'banks';
  if (/unica/.test(k)) return 'unica';
  if (/sales implication|why it matters to me/.test(k)) return 'implication';
  if (/be ready to discuss/.test(k)) return 'prep';
  return 'plain';
}

/**
 * A development's text as labelled parts. A label on its own line opens a
 * part; so does a paragraph that starts with one, unless it is the first thing
 * under a label of its own ("**What happened**" then "**Confirmed — 1 Nov:** …"
 * stays one part). The rule that closes a development is not a word, and goes.
 */
export function partsOf(markdown: string): Part[] {
  const blocks = blocksOf(markdown);
  while (blocks.length && RULE.test(blocks[blocks.length - 1])) blocks.pop();
  const parts: { label: string | null; blocks: string[] }[] = [];
  for (const block of blocks) {
    const current = parts[parts.length - 1];
    const only = LABEL_ONLY.exec(block);
    if (only) { parts.push({ label: unlabel(only[1]), blocks: [] }); continue; }
    const inline = LABEL_INLINE.exec(block);
    if (inline && (!current || current.blocks.length)) {
      parts.push({ label: unlabel(inline[1]), blocks: [inline[2].trim()] });
      continue;
    }
    if (current) current.blocks.push(block);
    else parts.push({ label: null, blocks: [block] });
  }
  return parts.map(p => ({ label: p.label, tone: p.label ? toneOf(p.label) : 'plain', markdown: p.blocks.join('\n\n') }));
}

/** The items of a section that is one list and nothing else, or null. */
function listItems(markdown: string): string[] | null {
  const blocks = blocksOf(markdown);
  if (blocks.length !== 1) return null;
  const items: string[] = [];
  for (const line of blocks[0].split('\n')) {
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (item) items.push(item[1].trim());
    else if (items.length && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
    else return null;
  }
  return items.length ? items : null;
}

/** "**Name:** text" items: the watchlist, the talking points. */
function labelledItems(markdown: string): { lead: string; text: string }[] | null {
  const items = listItems(markdown);
  if (!items) return null;
  const out: { lead: string; text: string }[] = [];
  for (const item of items) {
    const m = LABEL_INLINE.exec(item);
    if (!m) return null;
    out.push({ lead: unlabel(m[1]), text: m[2].trim() });
  }
  return out;
}

/** A section holding its developments under deeper headings, or null. */
function developments(section: Section): BriefPresentation | null {
  const lines = section.markdown.split('\n');
  const heads = lines.map((l, i) => ({ i, m: HEADING.exec(l) })).filter(h => h.m);
  if (!heads.length) return null;
  const level = Math.min(...heads.map(h => h.m![1].length));
  const cuts = heads.filter(h => h.m![1].length === level);
  const introBlocks = blocksOf(lines.slice(0, cuts[0].i).join('\n'));
  let themes: string[] | null = null;
  const first = introBlocks[0] && /^\*\*([^*\n]+)\*\*$/.exec(introBlocks[0]);
  if (first && first[1].split(SEPARATOR).length >= 2 && PLAIN.test(first[1])) {
    themes = first[1].split(SEPARATOR).map(t => t.trim()).filter(Boolean);
    introBlocks.shift();
  }
  const used = new Map<string, number>();
  const items = cuts.map((c, n) => {
    const title = c.m![2];
    const body = lines.slice(c.i + 1, n + 1 < cuts.length ? cuts[n + 1].i : lines.length).join('\n').trim();
    const base = `${section.id}--${slugOf(title) || `development-${n + 1}`}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return { id: seen ? `${base}-${seen + 1}` : base, title, markdown: body, parts: partsOf(body) };
  });
  return { kind: 'developments', themes, intro: introBlocks.join('\n\n'), items };
}

/** The form a section of the Sales or Engagement Brief takes, or null for Markdown as written. */
export function presentBrief(section: Section): BriefPresentation | null {
  const { markdown } = section;
  const key = keyOf(section.title);
  if (!key || section.role === 'title') return null;
  if (/what i should remember|^executive take$/.test(key)) return { kind: 'summary', markdown };
  if (/executive themes/.test(key)) return developments(section);
  if (/^\d+ /.test(key)) {
    const parts = partsOf(markdown);
    return parts.some(p => p.label) ? { kind: 'development', parts } : null;
  }
  if (/^best executive question/.test(key)) return { kind: 'callout', tone: 'question', markdown };
  if (/contrarian/.test(key)) return { kind: 'callout', tone: 'insight', markdown };
  if (/^development to (watch|monitor)/.test(key)) return { kind: 'callout', tone: 'watch', markdown };
  if (/questions/.test(key)) {
    const items = listItems(markdown);
    return items && items.every(i => QUOTED.test(i)) ? { kind: 'question-list', items } : null;
  }
  if (/talking points/.test(key)) {
    const items = labelledItems(markdown);
    return items ? { kind: 'points', items } : null;
  }
  if (/watchlist/.test(key)) {
    const items = labelledItems(markdown);
    return items ? { kind: 'watchlist', items: items.map(i => ({ name: i.lead, text: i.text })) } : null;
  }
  return null;
}

// The Enterprise AI Sales Brief as an executive memo (INT-51): what the memo
// reader needs from an edition, worked out apart from how it is drawn.
// Nothing here changes or drops a word; it only says where each part goes.
//
//   - each development is a chapter, its labelled parts the chapter's fields;
//   - the closing sections ("What I should remember today", the best
//     question, the contrarian insight, the development to watch, and the
//     older editions' talking points and discovery questions) come after;
//   - the document's own title line, its executive themes and its own topic
//     map go to the reference fold at the end, with the topic map;
//   - anything else keeps its place, as the Markdown it is.
//
// The archive holds five layouts (August to November 2026): the weekly briefs
// (numbered "##" developments of inline labels), the daily addenda ("Material
// update since yesterday" holding "###" developments, a separate "HCL Unica+
// customer conversation" part), and the daily brief since 22 September
// (themes, "###" developments of labels on their own lines, four closing
// sections), which the briefs of 6 to 12 November write in bold lines
// (`layout.ts` reads those as the earlier editions wrote them).
import type { Section } from './parse';
import { blocksOf, fold, keyOf, unlabel } from './blocks';
import { shortTitle } from './present';
import { developments, listItems, toneOf, LABEL_INLINE, LABEL_ONLY, RULE, type PartTone } from './briefs';
import { isTopicMap } from './memo';
import type { SaveInput } from './saved';

/** One of a development's labelled parts, its words as written (an inline label stays in them). */
export interface Field { label: string | null; tone: PartTone; markdown: string }

export interface Chapter {
  /** Unique within the edition; the element is `intel-<id>`. */
  id: string;
  /** The heading as written. */
  title: string;
  /** Its labelled parts; null when it has none, and is shown as its Markdown. */
  fields: Field[] | null;
  markdown: string;
}

/** The body in its order: what a section says before its developments, and the developments. */
export type Flow =
  /** A section holding developments: its title (none for the themes, which go to the fold) and its own words. */
  | { kind: 'part'; id: string; title: string | null; markdown: string }
  | { kind: 'chapter'; chapter: Chapter };

export interface SalesMemo {
  /** The document's own title line ("Daily Enterprise AI Sales Brief — 12 November 2026"). */
  heading: string | null;
  /** What it says under that line, before its first section. */
  lead: string;
  /** "Relevant executive themes today": its list, or its words as written when they are not one. */
  themes: { label: string; list: string[] | null; markdown: string } | null;
  /** The document's own topic map (September's editions). */
  map: Section | null;
  flow: Flow[];
  chapters: Chapter[];
  remember: Section | null;
  /** The other closing sections, in their order. */
  rows: Section[];
}

const HEADING_BLOCK = /^#{2,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
/** The older addenda's Unica+ part, written as a development of its own though it is the one before's. */
const UNICA_PART = /^(hcl )?unica customer conversation$/;

const closingKind = (s: Section): 'remember' | 'row' | null => {
  const key = keyOf(s.title);
  if (/what i should remember/.test(key)) return 'remember';
  if (/^best executive question|contrarian|development to (watch|monitor)|talking points|discovery questions/.test(key)) return 'row';
  return null;
};

/**
 * A development's text as fields. A label on its own line opens a field; so
 * does a heading inside it. Where a development writes its labels mostly on
 * their own lines, a paragraph that opens with a label stays in its field as
 * written ("**Interpretation:** …" under What happened, as the brief lays it
 * out); in the older editions, which write their labels mostly inline, it
 * opens a field of its own, except that a fact's interpretation stays with
 * the fact. The rule that closes a development is not a word, and goes.
 */
export function fieldsOf(markdown: string): Field[] {
  const blocks = blocksOf(markdown);
  while (blocks.length && RULE.test(blocks[blocks.length - 1])) blocks.pop();
  // Labels on their own lines against paragraphs opening with one (the first under a label aside).
  const onOwnLines = blocks.filter(b => LABEL_ONLY.test(b)).length;
  const opening = blocks.filter((b, i) => LABEL_INLINE.test(b) && !(i > 0 && LABEL_ONLY.test(blocks[i - 1]))).length;
  const ownLines = onOwnLines > opening;
  const fields: { label: string | null; tone: PartTone; blocks: string[] }[] = [];
  const open = (label: string | null, first?: string) =>
    fields.push({ label, tone: label ? toneOf(label) : 'plain', blocks: first ? [first] : [] });
  for (const block of blocks) {
    const current = fields[fields.length - 1];
    const heading = block.includes('\n') ? null : HEADING_BLOCK.exec(block);
    if (heading) { open(heading[1]); continue; }
    const only = LABEL_ONLY.exec(block);
    if (only) { open(unlabel(only[1])); continue; }
    const inline = LABEL_INLINE.exec(block);
    if (inline && current && current.blocks.length && !ownLines) {
      const tone = toneOf(inline[1]);
      const withFact = current.tone === 'fact' && (tone === 'fact' || tone === 'interpretation');
      if (!withFact) { open(unlabel(inline[1]), inline[2].trim()); continue; }
    } else if (inline && !current) {
      open(unlabel(inline[1]), inline[2].trim());
      continue;
    }
    if (current) current.blocks.push(block);
    else open(null, block);
  }
  return fields.map(f => ({ label: f.label, tone: f.tone, markdown: f.blocks.join('\n\n') }));
}

const chapterOf = (id: string, title: string, markdown: string): Chapter => {
  const fields = fieldsOf(markdown);
  return { id, title, markdown, fields: fields.some(f => f.label) ? fields : null };
};

/** What a section says before its first heading. */
const introOf = (markdown: string) => {
  const lines = markdown.split('\n');
  const at = lines.findIndex(l => HEADING_BLOCK.test(l));
  return (at === -1 ? markdown : lines.slice(0, at).join('\n')).trim();
};

/** The memo's reading of an edition's sections, in the document's order. */
export function salesMemo(sections: Section[]): SalesMemo {
  const memo: SalesMemo = { heading: null, lead: '', themes: null, map: null, flow: [], chapters: [], remember: null, rows: [] };
  const lead = (markdown: string) => { if (markdown.trim()) memo.lead = memo.lead ? `${memo.lead}\n\n${markdown}` : markdown; };
  const chapter = (c: Chapter) => { memo.flow.push({ kind: 'chapter', chapter: c }); memo.chapters.push(c); };
  for (const s of sections) {
    const title = s.role === 'title';
    if (title) memo.heading = s.title;
    else if (!s.title) { lead(s.markdown); continue; }
    else if (isTopicMap(s) && !memo.map) { memo.map = s; continue; }
    else {
      const closing = closingKind(s);
      if (closing === 'remember' && !memo.remember) { memo.remember = s; continue; }
      if (closing) { memo.rows.push(s); continue; }
    }
    // A section holding developments under its own headings: the themes, an
    // addendum's "Material update since yesterday". A development whose only
    // heading is its Unica+ part is a development.
    const held = developments(s);
    const holds = held?.kind === 'developments' && held.items.some(i => !UNICA_PART.test(keyOf(i.title)));
    if (!holds || held?.kind !== 'developments') {
      if (title) lead(s.markdown);
      else chapter(chapterOf(s.id, s.title, s.markdown));
      continue;
    }
    const themes = !title && /executive themes/.test(keyOf(s.title));
    if (themes) memo.themes = held.themes ? { label: s.title, list: held.themes, markdown: '' } : { label: s.title, list: null, markdown: held.intro };
    if (title) lead(introOf(s.markdown));
    memo.flow.push({
      kind: 'part',
      id: s.id,
      title: themes || title ? null : s.title,
      markdown: themes ? (held.themes ? held.intro : '') : title ? '' : introOf(s.markdown),
    });
    for (const item of held.items) {
      const last = memo.flow[memo.flow.length - 1];
      // "HCL Unica+ customer conversation" right after a development is that development's.
      if (UNICA_PART.test(keyOf(item.title)) && last.kind === 'chapter') {
        const merged = chapterOf(last.chapter.id, last.chapter.title, `${last.chapter.markdown}\n\n#### ${item.title}\n\n${item.markdown}`);
        memo.chapters[memo.chapters.length - 1] = merged;
        memo.flow[memo.flow.length - 1] = { kind: 'chapter', chapter: merged };
        continue;
      }
      chapter(chapterOf(item.id, item.title, item.markdown));
    }
  }
  return memo;
}

/** A development's heading without the number the chapter's kicker already gives ("1. …" for the first). */
export function chapterTitle(title: string, n: number): string {
  const m = /^(\d+)[.)][ \t]+(\S[\s\S]*)$/.exec(title);
  return m && Number(m[1]) === n ? m[2] : title;
}

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Three takeaways": what to remember, when it is one list, by its length; else null. */
export function takeawaysOf(section: Section): { label: string; items: string[] } | null {
  const items = listItems(section.markdown);
  if (!items) return null;
  const n = items.length;
  return { label: `${WORDS[n - 1] ?? n} takeaway${n === 1 ? '' : 's'}`, items };
}

/** The same question, whatever its quotes, punctuation, case or spacing. */
const wordsOf = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A development's question as the briefs reader saved it, so what was kept there shows as kept here. */
export const questionInput = (chapter: Chapter, field: Field): SaveInput =>
  ({ kind: 'labelled', sectionId: chapter.id, sectionTitle: chapter.title, label: field.label ?? '', text: field.markdown });

/**
 * The best question and the Takeaways records its Save reads and writes: its
 * own, as the briefs reader saved it; and when it repeats a development's
 * question word for word, that question's record first, so the two controls
 * are one and the question is never kept twice.
 */
export function bestQuestion(memo: SalesMemo): { section: Section; inputs: SaveInput[] } | null {
  const section = memo.rows.find(s => /^best executive question/.test(keyOf(s.title)));
  if (!section || !section.markdown.trim()) return null;
  const own: SaveInput = { kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label: shortTitle(section.title), text: section.markdown };
  const words = wordsOf(section.markdown);
  for (const c of memo.chapters) {
    const f = c.fields?.find(f => f.tone === 'question' && f.label && f.markdown && wordsOf(f.markdown) === words);
    if (f) return { section, inputs: [questionInput(c, f), own] };
  }
  return { section, inputs: [own] };
}

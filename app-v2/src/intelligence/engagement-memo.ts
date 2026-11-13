// The Customer Engagement Brief as an executive memo (INT-52): what the memo
// reader needs from an edition, worked out apart from how it is drawn.
// Nothing here changes or drops a word; it only says where each part goes.
//
//   - the document's own title line goes to the reference fold at the end,
//     with the topic map; the bold line under it ("Coverage: 7–13 November
//     2026 — …") is the coverage line under the memo's title, and whatever
//     else it says before the first section, the memo's opening;
//   - "Executive take" opens the memo, before the contents;
//   - each development is a chapter, every labelled part of it a field
//     ("**Confirmed — 11 November:**", "**Interpretation — why it
//     matters:**", "**Sales implication:**" …), a paragraph without a label
//     staying in the field before it;
//   - the closing: the talking points first ("The essentials"), then the
//     customer questions, the competitive watchlist, the contrarian insight
//     and the development to monitor, numbered on, and anything after them,
//     in their order.
//
// The archive (September to November 2026) holds two layouts: the weekly
// brief of 20 September ("## Weekly executive briefing — …" holding "###"
// developments), and since 21 September the brief under a "#" title line,
// its developments numbered "##" sections (one, unnumbered, when there is
// only one), with or without an Executive take.
import type { Section } from './parse';
import { blocksOf, keyOf } from './blocks';
import { shortTitle } from './present';
import { developments, listItems, partsOf } from './briefs';
import { isTopicMap, questionInput, questionWords, type Chapter, type Flow } from './memo';
import type { SaveInput } from './saved';

export interface EngagementMemo {
  /** The document's own title line ("Enterprise Customer Engagement Brief"). */
  heading: string | null;
  /** The bold line under it, without its bold: "Coverage: 7–13 November 2026 — …". */
  coverage: string | null;
  /** What else it says before its first section. */
  lead: string;
  take: Section | null;
  /** The document's own topic map, if it ever has one. */
  map: Section | null;
  flow: Flow[];
  chapters: Chapter[];
  /** The talking points, when the closing opens with them. */
  essentials: Section | null;
  /** The rest of the closing, and anything after it, in their order. */
  rows: Section[];
}

const BOLD_LINE = /^\*\*((?:(?!\*\*)[^\n])+)\*\*$/;

/** A closing section's heading; a numbered heading is a development's, whatever it says. */
const isClosing = (s: Section) => {
  const key = keyOf(s.title);
  return !/^\d+ /.test(key) && /talking points|customer questions|discovery questions|questions worth asking|watchlist|^contrarian|^development to (watch|monitor)/.test(key);
};

const chapterOf = (id: string, title: string, markdown: string): Chapter => {
  const fields = partsOf(markdown);
  return { id, title, markdown, fields: fields.some(f => f.label) ? fields : null };
};

/** What a section says before its first heading. */
const introOf = (markdown: string) => {
  const lines = markdown.split('\n');
  const at = lines.findIndex(l => /^#{2,6}[ \t]/.test(l));
  return (at === -1 ? markdown : lines.slice(0, at).join('\n')).trim();
};

/** The memo's reading of an edition's sections, in the document's order. */
export function engagementMemo(sections: Section[]): EngagementMemo {
  const memo: EngagementMemo = { heading: null, coverage: null, lead: '', take: null, map: null, flow: [], chapters: [], essentials: null, rows: [] };
  const lead = (markdown: string) => { if (markdown.trim()) memo.lead = memo.lead ? `${memo.lead}\n\n${markdown}` : markdown; };
  const chapter = (c: Chapter) => { memo.flow.push({ kind: 'chapter', chapter: c }); memo.chapters.push(c); };
  let closing = false;
  for (const s of sections) {
    if (s.role === 'title') {
      memo.heading = s.title;
      const blocks = blocksOf(introOf(s.markdown));
      const bold = !memo.coverage && blocks.length ? BOLD_LINE.exec(blocks[0]) : null;
      if (bold) { memo.coverage = bold[1].trim(); blocks.shift(); }
      lead(blocks.join('\n\n'));
    } else if (!s.title) {
      lead(s.markdown);
      continue;
    } else if (isTopicMap(s) && !memo.map) {
      memo.map = s;
      continue;
    } else if (keyOf(s.title) === 'executive take' && !memo.take && !memo.chapters.length && !closing) {
      memo.take = s;
      continue;
    } else if (closing || isClosing(s)) {
      // Once the closing begins, everything after it is the closing's, in its order.
      if (!closing && /talking points/.test(keyOf(s.title))) memo.essentials = s;
      else memo.rows.push(s);
      closing = true;
      continue;
    }
    // A section holding its developments under its own headings: the weekly
    // brief's "Weekly executive briefing", over its chapters, its own words a note.
    const held = developments(s);
    if (held?.kind === 'developments') {
      memo.flow.push({ kind: 'part', id: s.id, title: s.role === 'title' ? null : s.title, markdown: s.role === 'title' ? '' : introOf(s.markdown) });
      for (const item of held.items) chapter(chapterOf(item.id, item.title, item.markdown));
    } else if (s.role !== 'title') {
      chapter(chapterOf(s.id, s.title, s.markdown));
    }
  }
  return memo;
}

/** The customer questions, when the section is one list of them; else null. */
export function questionsOf(section: Section): string[] | null {
  return /customer questions|discovery questions|questions worth asking/.test(keyOf(section.title)) ? listItems(section.markdown) : null;
}

/** A closing question as the briefs reader saved it. */
export const closingQuestionInput = (section: Section, text: string): SaveInput =>
  ({ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label: shortTitle(section.title), text });

/**
 * The Takeaways records each question's Save reads and writes. The same
 * question asked twice (in a development and again among the customer
 * questions, or twice in a list) is one record: each place shows it, the
 * first place's record is the one written, and either removes it.
 */
export function questionSaves(memo: EngagementMemo): (own: SaveInput) => { input: SaveInput; also: SaveInput[] } {
  const groups = new Map<string, SaveInput[]>();
  const add = (input: SaveInput) => {
    const key = questionWords(input.text);
    const group = groups.get(key);
    if (!group) groups.set(key, [input]);
    else if (!group.some(i => i.sectionId === input.sectionId && i.text === input.text)) group.push(input);
  };
  for (const c of memo.chapters) for (const f of c.fields ?? []) if (f.tone === 'question' && f.label && f.markdown) add(questionInput(c, f));
  for (const s of memo.rows) for (const q of questionsOf(s) ?? []) add(closingQuestionInput(s, q));
  return own => {
    const group = groups.get(questionWords(own.text)) ?? [own];
    return { input: group[0], also: group.slice(1) };
  };
}

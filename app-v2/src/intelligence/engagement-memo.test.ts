// The Customer Engagement Brief read as a memo (INT-52): the coverage line,
// the Executive take, developments as chapters of every labelled part, the
// closing in its order, in each of the archive's layouts; a question asked
// twice is one Takeaways record. Made-up words, the real documents' structures.
import { describe, it, expect } from 'vitest';
import { splitSections } from './parse';
import { laidOut } from './layout';
import { engagementMemo, questionsOf, questionSaves, closingQuestionInput } from './engagement-memo';
import { questionInput } from './memo';
import { ENGAGEMENT_BODY } from './test-fixtures';

const memoOf = (body: string) => engagementMemo(splitSections(laidOut('customer-engagement-brief', body)));

/** The weekly brief of 20 September: one section holding numbered "###" developments, no title line. */
const WEEKLY = `## Weekly executive briefing — 1–7 March 2026

The week’s signal: alpha moves first.

### 1. Vendor A ships a gateway

**Confirmed — 2 March:** Vendor A shipped it. [Vendor A](https://example.com/a)

**Why it matters:** Control moves to the gateway.

**Discovery question:** “Who owns the gateway?”

---

### 2. Vendor B follows

**Confirmed — 3 March:** Vendor B followed.

## Three executive talking points

- Gateways matter.
- Followers follow.

## Contrarian insight

Nobody needs a gateway.`;

/** An October edition: a bold line and a paragraph under the title, no Executive take, one unnumbered development. */
const ADDENDUM = `# Customer Engagement Executive Brief

**Material update since 7 March 2026**

Only one new development cleared the threshold.

## Vendor C opens a lab

**Confirmed — 7 March:** Vendor C opened a lab.

**Regulated-enterprise relevance:** Banks rent labs.

**Executive discovery question:** “Which lab would you trust?”

## Three executive talking points

- Labs are cheap.

## Three customer questions

- “Which lab?”

## Development to monitor next

**Vendor C’s lab:** whether it opens.

A note after the last section.`;

describe('the current layout', () => {
  const memo = memoOf(ENGAGEMENT_BODY);

  it('its title line goes to the fold, its bold line is the coverage, the Executive take opens it', () => {
    expect(memo.heading).toBe('Enterprise Customer Engagement Brief');
    expect(memo.coverage).toBe('Coverage: 26 October – 2 November 2026 — new since Friday');
    expect(memo.lead).toBe('');
    expect(memo.take?.title).toBe('Executive take');
  });

  it('each numbered section is a chapter, each labelled part a field, a paragraph without a label staying in the one before', () => {
    expect(memo.chapters.map(c => c.title)).toEqual(['1. Vendor A connects agents end to end', '2. Vendor B exposes its CDP to assistants']);
    expect(memo.chapters[0].id).toBe('1-vendor-a-connects-agents-end-to-end');
    expect(memo.chapters[0].fields!.map(f => [f.label, f.tone])).toEqual([
      ['Confirmed — 30 October', 'fact'], ['Interpretation — why it matters', 'interpretation'], ['Sales implication', 'implication'],
      ['Banking relevance', 'banks'], ['Be ready to discuss', 'prep'], ['Executive discovery question', 'question'],
    ]);
    expect(memo.chapters[0].fields![0].markdown).toBe(
      'Vendor A opened a beta of connected agents:\n\n- Ideation Agent, using signals.\n- Compliance Agent, checking rules.\n\nHumans keep approvals. [Vendor A, 30 October 2026](https://example.com/vendor-a/agents)',
    );
    expect(memo.flow.every(f => f.kind === 'chapter')).toBe(true);
  });

  it('the closing: the talking points, then the other sections in their order', () => {
    expect(memo.essentials?.title).toBe('Three executive talking points');
    expect(memo.rows.map(s => s.title)).toEqual(['Three customer questions worth asking', 'Competitive watchlist', 'Contrarian insight', 'Development to monitor next']);
    expect(questionsOf(memo.rows[0])).toEqual(['“Which workflows could run headless?”', '“Which system keeps the approval record?”']);
    expect(questionsOf(memo.rows[1])).toBeNull();
  });

  it('a numbered heading is a development whatever it says', () => {
    const odd = memoOf(ENGAGEMENT_BODY.replace('## 2. Vendor B exposes its CDP to assistants', '## 2. Regulators publish customer questions and a watchlist'));
    expect(odd.chapters).toHaveLength(2);
    expect(odd.essentials?.title).toBe('Three executive talking points');
  });
});

describe('the older layouts', () => {
  it('the weekly brief: its section over its chapters, its own words a note', () => {
    const memo = memoOf(WEEKLY);
    expect(memo.heading).toBeNull();
    expect(memo.take).toBeNull();
    expect(memo.flow.map(f => (f.kind === 'part' ? `part:${f.title}:${f.markdown}` : `dev:${f.chapter.title}`))).toEqual([
      'part:Weekly executive briefing — 1–7 March 2026:The week’s signal: alpha moves first.', 'dev:1. Vendor A ships a gateway', 'dev:2. Vendor B follows',
    ]);
    expect(memo.chapters[0].fields!.map(f => f.label)).toEqual(['Confirmed — 2 March', 'Why it matters', 'Discovery question']);
    expect(memo.essentials?.title).toBe('Three executive talking points');
    expect(memo.rows.map(s => s.title)).toEqual(['Contrarian insight']);
  });

  it('without an Executive take: the bold line is the coverage, the paragraph the opening; one development, unnumbered', () => {
    const memo = memoOf(ADDENDUM);
    expect(memo.coverage).toBe('Material update since 7 March 2026');
    expect(memo.lead).toBe('Only one new development cleared the threshold.');
    expect(memo.take).toBeNull();
    expect(memo.chapters.map(c => c.fields!.map(f => f.label))).toEqual([['Confirmed — 7 March', 'Regulated-enterprise relevance', 'Executive discovery question']]);
    expect(memo.rows.map(s => s.title)).toEqual(['Three customer questions', 'Development to monitor next']);
    expect(memo.rows[1].markdown).toContain('A note after the last section.');
  });

  it('a section after the closing begins stays after it, in its order', () => {
    const memo = memoOf(`${ENGAGEMENT_BODY}\n\n## Sources\n\nAll from vendors.`);
    expect(memo.rows.map(s => s.title).slice(-2)).toEqual(['Development to monitor next', 'Sources']);
    expect(memo.chapters).toHaveLength(2);
  });
});

describe('a question in Takeaways', () => {
  it('asked once, its own record, as the brief saved it', () => {
    const memo = memoOf(ENGAGEMENT_BODY);
    const saves = questionSaves(memo);
    const own = closingQuestionInput(memo.rows[0], '“Which workflows could run headless?”');
    expect(own).toEqual({ kind: 'labelled', sectionId: 'three-customer-questions-worth-asking', sectionTitle: 'Three customer questions worth asking', label: 'Three customer questions worth asking', text: '“Which workflows could run headless?”' });
    expect(saves(own)).toEqual({ input: own, also: [] });
  });

  it('asked again among the customer questions: one record, the development’s first, whichever place saves it', () => {
    const memo = memoOf(ENGAGEMENT_BODY.replace('- “Which workflows could run headless?”', '- "Where does your campaign process lose the most time?"'));
    const saves = questionSaves(memo);
    const asked = memo.chapters[0].fields!.find(f => f.tone === 'question')!;
    const dev = questionInput(memo.chapters[0], asked);
    const again = closingQuestionInput(memo.rows[0], '"Where does your campaign process lose the most time?"');
    expect(saves(dev)).toEqual({ input: dev, also: [again] });
    expect(saves(again)).toEqual({ input: dev, also: [again] });
  });
});

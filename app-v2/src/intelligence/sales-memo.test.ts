// The Sales Brief read as a memo (INT-51): developments as chapters of
// labelled fields, the closing apart, the document's heading, themes and own
// topic map for the fold, in each of the archive's layouts; the best question
// and a development's the same Takeaways record. Made-up words, the real
// documents' structures.
import { describe, it, expect } from 'vitest';
import { splitSections } from './parse';
import { laidOut } from './layout';
import { fieldsOf, salesMemo, chapterTitle, takeawaysOf, bestQuestion, questionInput } from './sales-memo';
import { SALES_BODY } from './test-fixtures';

const memoOf = (body: string) => salesMemo(splitSections(laidOut('enterprise-ai-sales-brief', body)));

/** The weekly brief of August and September: numbered developments of inline labels. */
const WEEKLY = `# Weekly Brief — 1–7 March 2026

The week’s signal: alpha moves first.

## 1. Vendor A ships a gateway

**Confirmed:** Vendor A shipped it. [Vendor A — 2 March](https://example.com/a)

**Interpretation:** Control moves to the gateway.

**Why it matters:** Because traffic needs a home.

**LinkedIn angle:** “Gateways are the new perimeter.”

---

## 2. Vendor B follows

**Confirmed:** Vendor B followed.

## Three executive talking points

- Gateways matter.
- Followers follow.

## Contrarian insight

Nobody needs a gateway.`;

/** The daily addendum of September: a topic map first, a section holding its development, a separate Unica+ part. */
const ADDENDUM = `## Enterprise AI customer-conversation topic map

**Alpha • Beta • Gamma**

**Relevant to this update:** Alpha • Beta

## Material update since yesterday

### Vendor C opens a lab

**Confirmed — 1 March:** Vendor C opened a lab.

**Interpretation:** Labs are cheap.

**Customer-conversation angle:**

> “Which lab would you trust?”

**Banking use case:** A bank rents a lab.

### HCL Unica+ customer conversation

- **What to say:** “Labs need rules.”

**LinkedIn angle:** “A lab is not a product.”

## Single development to watch next week

Watch Vendor D.`;

describe('a development’s fields', () => {
  it('labels on their own lines open fields; a paragraph opening with a label stays in its field, as written', () => {
    const fields = fieldsOf('**What happened**\n\n**Confirmed fact:** A thing.\n\n**Interpretation:** It means this.\n\n**Why it matters to me**\n\nA better opening.\n\n**Banking use case**\n\n**Journey:** onboarding. **KPI:** time.\n\n**Expected outcome:** faster.');
    expect(fields.map(f => [f.label, f.tone])).toEqual([['What happened', 'fact'], ['Why it matters to me', 'implication'], ['Banking use case', 'usecase']]);
    expect(fields[0].markdown).toBe('**Confirmed fact:** A thing.\n\n**Interpretation:** It means this.');
    expect(fields[2].markdown).toBe('**Journey:** onboarding. **KPI:** time.\n\n**Expected outcome:** faster.');
  });

  it('in the older editions every inline label opens a field, a fact keeping its interpretation, and the closing rule goes', () => {
    const fields = fieldsOf('**Confirmed — 1 March:** Opened.\n\nMore of it.\n\n**Interpretation:** Cheap.\n\n**Banking use case:** A bank.\n\n---');
    expect(fields.map(f => f.label)).toEqual(['Confirmed — 1 March', 'Banking use case']);
    expect(fields[0].markdown).toBe('Opened.\n\nMore of it.\n\n**Interpretation:** Cheap.');
  });

  it('a heading inside a development is a field of it; text before any label is a field without one', () => {
    expect(fieldsOf('Lead words.\n\n#### HCL Unica+ customer conversation\n\n- One.').map(f => [f.label, f.markdown]))
      .toEqual([[null, 'Lead words.'], ['HCL Unica+ customer conversation', '- One.']]);
  });
});

describe('the current layout', () => {
  const memo = memoOf(SALES_BODY);

  it('its developments are chapters, the themes and the heading go to the fold, the note stays before the developments', () => {
    expect(memo.chapters.map(c => c.title)).toEqual(['Agent pricing moves to outcomes', 'Sovereign clouds add capacity']);
    expect(memo.chapters[0].id).toBe('relevant-executive-themes-today--agent-pricing-moves-to-outcomes');
    expect(memo.chapters[0].fields!.map(f => f.label)).toEqual([
      'What happened', 'Why it matters to the industry', 'Why it matters to me', 'Why it matters to banks',
      'Executive question', 'How I can respond', 'Banking use case', 'Unica+ interpretation', 'LinkedIn angle',
    ]);
    expect(memo.heading).toBe('Enterprise AI Sales Brief — 3 November 2026');
    expect(memo.themes).toEqual({ label: 'Relevant executive themes today', list: ['Budgets', 'Vendor strategy', 'Resilience'], markdown: '' });
    expect(memo.flow[0]).toEqual({ kind: 'part', id: 'relevant-executive-themes-today', title: null, markdown: 'Two developments met today’s significance threshold.' });
    expect(memo.map).toBeNull();
  });

  it('the closing: what to remember, then the other sections in their order', () => {
    expect(memo.remember?.title).toBe('What I should remember today');
    expect(memo.rows.map(s => s.title)).toEqual(['Best executive question today', 'Contrarian or non-obvious insight', 'Development to watch']);
    expect(takeawaysOf(memo.remember!)).toEqual({ label: 'Two takeaways', items: ['Outcome pricing is arriving.', 'Sovereign capacity is growing.'] });
  });

  it('the bold lines of 6 to 12 November read as the same memo', () => {
    const bold = SALES_BODY
      .replace('## Relevant executive themes today\n\n\n**Budgets • Vendor strategy • Resilience**', '**Relevant executive themes today:** Budgets • Vendor strategy • Resilience')
      .replace(/^## (What I should remember today|Best executive question today|Contrarian or non-obvious insight|Development to watch)$/gm, '**$1**');
    const again = memoOf(bold);
    expect(again.chapters.map(c => c.fields?.length)).toEqual(memo.chapters.map(c => c.fields?.length));
    expect(again.themes?.list).toEqual(['Budgets', 'Vendor strategy', 'Resilience']);
    expect([again.remember?.title, ...again.rows.map(s => s.title)]).toEqual([memo.remember?.title, ...memo.rows.map(s => s.title)]);
  });

  it('themes that are not a list stay as written, for the fold', () => {
    const odd = memoOf(SALES_BODY.replace('**Budgets • Vendor strategy • Resilience**', 'Budgets; Vendor strategy.'));
    expect(odd.themes).toEqual({ label: 'Relevant executive themes today', list: null, markdown: 'Budgets; Vendor strategy.\n\nTwo developments met today’s significance threshold.' });
    expect(odd.flow[0]).toMatchObject({ kind: 'part', title: null, markdown: '' });
  });
});

describe('the older layouts', () => {
  it('the weekly brief: its opening as the lead, numbered developments, its own closing headings', () => {
    const memo = memoOf(WEEKLY);
    expect(memo.heading).toBe('Weekly Brief — 1–7 March 2026');
    expect(memo.lead).toBe('The week’s signal: alpha moves first.');
    expect(memo.chapters.map((c, i) => chapterTitle(c.title, i + 1))).toEqual(['Vendor A ships a gateway', 'Vendor B follows']);
    expect(memo.chapters[0].fields!.map(f => f.label)).toEqual(['Confirmed', 'Why it matters', 'LinkedIn angle']);
    expect(memo.rows.map(s => s.title)).toEqual(['Three executive talking points', 'Contrarian insight']);
    expect(memo.remember).toBeNull();
  });

  it('the addendum: its topic map for the fold, its section over its development, the Unica+ part the development’s', () => {
    const memo = memoOf(ADDENDUM);
    expect(memo.map?.title).toBe('Enterprise AI customer-conversation topic map');
    expect(memo.flow.map(f => (f.kind === 'part' ? `part:${f.title}` : `dev:${f.chapter.title}`))).toEqual(['part:Material update since yesterday', 'dev:Vendor C opens a lab']);
    expect(memo.chapters[0].fields!.map(f => f.label)).toEqual([
      'Confirmed — 1 March', 'Customer-conversation angle', 'Banking use case', 'HCL Unica+ customer conversation', 'LinkedIn angle',
    ]);
    expect(memo.rows.map(s => s.title)).toEqual(['Single development to watch next week']);
  });

  it('a number is dropped from a heading only where the kicker gives the same', () => {
    expect(chapterTitle('1. Vendor A', 1)).toBe('Vendor A');
    expect(chapterTitle('2. Vendor A', 1)).toBe('2. Vendor A');
    expect(chapterTitle('2026 in review', 1)).toBe('2026 in review');
  });
});

describe('the best question in Takeaways', () => {
  it('when it repeats a development’s question, it reads and writes that question’s record first', () => {
    const memo = memoOf(SALES_BODY);
    const best = bestQuestion(memo)!;
    const asked = memo.chapters[0].fields!.find(f => f.label === 'Executive question')!;
    expect(best.inputs).toEqual([
      questionInput(memo.chapters[0], asked),
      { kind: 'labelled', sectionId: 'best-executive-question-today', sectionTitle: 'Best executive question today', label: 'Best executive question today', text: '“Which outcomes would you be willing to pay for?”' },
    ]);
    expect(best.inputs[0]).toEqual({
      kind: 'labelled', sectionId: 'relevant-executive-themes-today--agent-pricing-moves-to-outcomes', sectionTitle: 'Agent pricing moves to outcomes',
      label: 'Executive question', text: '“Which outcomes would you be willing to pay for?”',
    });
  });

  it('a question of its own keeps its own record', () => {
    const memo = memoOf(SALES_BODY.replace('## Best executive question today\n\n\n“Which outcomes', '## Best executive question today\n\n\n“Which budgets'));
    expect(bestQuestion(memo)!.inputs.map(i => i.sectionId)).toEqual(['best-executive-question-today']);
  });
});

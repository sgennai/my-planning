// @vitest-environment jsdom
// The Enterprise AI Sales Brief and the Customer Engagement Brief: their
// developments as labelled parts, their other sections in their forms,
// developments that fold and come back when sent to, and the promise behind
// all of it: every word on screen. Both are drawn as their memos
// (`SalesMemo.test.tsx`, `EngagementMemo.test.tsx`); a feed without a memo
// keeps this reader, shown here with the Engagement Brief's text.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { parseEdition, splitSections } from './parse';
import type { FeedId } from './feeds';
import { presentSection } from './present';
import { partsOf, toneOf } from './briefs';
import { EditionReader } from './EditionReader';
import { SALES_BODY, ENGAGEMENT_DOC, ENGAGEMENT_FILE, ENGAGEMENT_BODY, wordsOf } from './test-fixtures';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

/** The Engagement Brief's text in a feed that has no memo. */
const brief = { ...parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC), feedId: 'a-brief' as FeedId };
const sectionOf = (body: string, title: string) => splitSections(body).find(s => s.title.startsWith(title))!;
const show = (e: ReturnType<typeof parseEdition>) =>
  render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} onToggleSave={() => {}} />).container;

describe('labelled parts', () => {
  it('a label on its own line opens a part, and keeps the dated line under it', () => {
    const parts = partsOf('**What happened**\n\n**Confirmed — 1 Nov:** A thing. [Src](https://example.com)\n\n**Interpretation:** It means this.\n\n**Executive question**\n\n“Why?”');
    expect(parts.map(p => [p.label, p.tone])).toEqual([['What happened', 'fact'], ['Interpretation', 'interpretation'], ['Executive question', 'question']]);
    expect(parts[0].markdown).toBe('**Confirmed — 1 Nov:** A thing. [Src](https://example.com)');
    expect(parts[1].markdown).toBe('It means this.');
  });

  it('a paragraph opening with its label is a part of its own, and the closing rule goes', () => {
    const parts = partsOf('**Confirmed — 30 Oct:** Opened a beta:\n\n- One.\n- Two.\n\n**Sales implication:** Do this.\n\n**Executive discovery question:** “Where?”\n\n---');
    expect(parts.map(p => p.label)).toEqual(['Confirmed — 30 Oct', 'Sales implication', 'Executive discovery question']);
    expect(parts[0].markdown).toBe('Opened a beta:\n\n- One.\n- Two.');
    expect(parts[2]).toEqual({ label: 'Executive discovery question', tone: 'question', markdown: '“Where?”' });
  });

  it('labels the app does not know are still parts; the known ones get their tone', () => {
    expect(toneOf('Why it matters to banks')).toBe('banks');
    expect(toneOf('Banking use case')).toBe('usecase');
    expect(toneOf('How I can respond')).toBe('response');
    expect(toneOf('LinkedIn angle')).toBe('quote');
    expect(toneOf('Unica+ interpretation')).toBe('unica');
    expect(toneOf('Something new')).toBe('plain');
    expect(partsOf('Plain text with no label.')).toEqual([{ label: null, tone: 'plain', markdown: 'Plain text with no label.' }]);
  });
});

describe('the Sales Brief', () => {
  it('its themes section holds its developments, each with its parts', () => {
    const p = presentSection('enterprise-ai-sales-brief', sectionOf(SALES_BODY, 'Relevant executive themes'));
    expect(p.kind).toBe('developments');
    if (p.kind !== 'developments') return;
    expect(p.themes).toEqual(['Budgets', 'Vendor strategy', 'Resilience']);
    expect(p.intro).toBe('Two developments met today’s significance threshold.');
    expect(p.items.map(d => d.title)).toEqual(['Agent pricing moves to outcomes', 'Sovereign clouds add capacity']);
    expect(p.items[0].parts.map(x => x.label)).toEqual([
      'What happened', 'Interpretation', 'Why it matters to the industry', 'Why it matters to me', 'Why it matters to banks',
      'Executive question', 'How I can respond', 'Banking use case', 'Expected business outcome and KPIs', 'Unica+ interpretation', 'LinkedIn angle',
    ]);
    expect(p.items[0].id).toBe('relevant-executive-themes-today--agent-pricing-moves-to-outcomes');
  });
});

describe('the Customer Engagement Brief', () => {
  it('its numbered sections are developments of labelled parts', () => {
    const p = presentSection('customer-engagement-brief', sectionOf(ENGAGEMENT_BODY, '1. Vendor A'));
    expect(p.kind).toBe('development');
    if (p.kind !== 'development') return;
    expect(p.parts.map(x => [x.label, x.tone])).toEqual([
      ['Confirmed — 30 October', 'fact'], ['Interpretation — why it matters', 'interpretation'], ['Sales implication', 'implication'],
      ['Banking relevance', 'banks'], ['Be ready to discuss', 'prep'], ['Executive discovery question', 'question'],
    ]);
  });

  it('talking points, customer questions and the watchlist each take their form', () => {
    const kind = (t: string) => presentSection('customer-engagement-brief', sectionOf(ENGAGEMENT_BODY, t));
    expect(kind('Executive take').kind).toBe('summary');
    expect(kind('Three executive talking points')).toEqual({ kind: 'points', items: [
      { lead: 'Engagement is going headless', text: 'value shifts to governed data.' },
      { lead: 'Agents automate the operating model', text: 'approvals need design.' },
    ] });
    expect(kind('Three customer questions worth asking')).toEqual({ kind: 'question-list', items: ['“Which workflows could run headless?”', '“Which system keeps the approval record?”'] });
    expect(kind('Competitive watchlist')).toEqual({ kind: 'watchlist', items: [
      { name: 'Vendor A', text: 'Production evidence after beta.' },
      { name: 'Vendor B', text: 'Permission granularity.' },
      { name: 'Vendor C and Vendor D', text: 'Third-party agent coverage.' },
    ] });
    expect(kind('Contrarian insight')).toEqual({ kind: 'callout', tone: 'insight', markdown: 'Headless can deepen lock-in.' });
    expect(kind('Development to monitor next').kind).toBe('callout');
  });

  it('a list that is not all questions, or a watchlist without names, stays as written', () => {
    const odd = { id: 'x', title: 'Three customer questions worth asking', markdown: '- “A question?”\n- A statement.' };
    expect(presentSection('customer-engagement-brief', odd).kind).toBe('markdown');
    const loose = { id: 'y', title: 'Competitive watchlist', markdown: '- Vendor A is one to watch.' };
    expect(presentSection('customer-engagement-brief', loose).kind).toBe('markdown');
  });

  it('read as a brief: every word, the coverage line under its title, each development folding', () => {
    const c = show(brief);
    const text = c.textContent!;
    for (const word of wordsOf(ENGAGEMENT_BODY)) expect(text).toContain(word);
    expect(c.querySelector('.intel-doc-title')).toHaveTextContent('Enterprise Customer Engagement BriefCoverage: 26 October – 2 November 2026');
    expect(c.querySelectorAll('.intel-watchlist dt')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Copy: Executive discovery question$/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Copy: Three customer questions worth asking$/ })).toHaveLength(2);
    const heading = screen.getByRole('heading', { level: 2, name: '1. Vendor A connects agents end to end' });
    expect(heading.querySelector('ol, li')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fold 1. Vendor A connects agents end to end' }));
    expect(c.querySelector('#intel-1-vendor-a-connects-agents-end-to-end')!.textContent).not.toContain('Integration beats single agents');
  });
});

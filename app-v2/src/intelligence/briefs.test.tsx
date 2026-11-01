// @vitest-environment jsdom
// The Enterprise AI Sales Brief: its developments as labelled parts, its
// other sections in their forms, leading with what to remember, and the
// promise behind all of it: every word on screen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { parseEdition, splitSections } from './parse';
import { presentSection, displayOrder } from './present';
import { partsOf, toneOf } from './briefs';
import { EditionReader } from './EditionReader';
import { SALES_DOC, SALES_FILE, SALES_BODY, wordsOf } from './test-fixtures';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

const sales = parseEdition('enterprise-ai-sales-brief', SALES_FILE, SALES_DOC);
const sectionOf = (body: string, title: string) => splitSections(body).find(s => s.title.startsWith(title))!;
const show = (e: typeof sales) =>
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

  it('leads with what to remember, then keeps the document order', () => {
    expect(displayOrder('enterprise-ai-sales-brief', splitSections(SALES_BODY)).map(s => s.title)).toEqual([
      'Enterprise AI Sales Brief — 3 November 2026', 'What I should remember today', 'Relevant executive themes today',
      'Best executive question today', 'Contrarian or non-obvious insight', 'Development to watch',
    ]);
  });

  it('on screen: every word, the developments in the index, questions to copy and keep', () => {
    const c = show(sales);
    const text = c.textContent!;
    for (const word of wordsOf(SALES_BODY)) expect(text).toContain(word);
    expect([...c.querySelectorAll('.intel-index button')].map(b => [b.textContent, b.className])).toEqual([
      ['What I should remember today', ''], ['Relevant executive themes today', ''],
      ['Agent pricing moves to outcomes', 'is-sub'], ['Sovereign clouds add capacity', 'is-sub'],
      ['Best executive question today', ''], ['Contrarian or non-obvious insight', ''], ['Development to watch', ''],
    ]);
    expect(c.querySelector('.intel-sec .intel-summary')).toHaveTextContent('Outcome pricing is arriving.');
    expect(screen.getByRole('button', { name: 'Save Executive question to Takeaways' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy: How I can respond' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy: LinkedIn angle' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy: Best executive question today' })).toHaveLength(1);
  });
});

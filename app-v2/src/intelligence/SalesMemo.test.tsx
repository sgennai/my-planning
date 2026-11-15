// @vitest-environment jsdom
// The Sales Brief as an executive memo (INT-51), on screen: every word and
// link of the document, nothing of its header; the bar, subline and topics;
// the folded contents and its jumps; each development a chapter of fields,
// numbered, ending on the way to the next; the closing; the best question and
// a development's sharing one Takeaways record; the reference folded at the
// end. Made-up editions, the real structure.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { EditionReader } from './EditionReader';
import { parseEdition } from './parse';
import { saveInsight, savedOf, type SaveInput } from './saved';
import { SALES_DOC, SALES_BODY, SALES_FILE, linksOf, wordsOf } from './test-fixtures';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

const edition = parseEdition('enterprise-ai-sales-brief', SALES_FILE, SALES_DOC);
const memo = (props: Partial<Parameters<typeof EditionReader>[0]> = {}) => {
  const scroller = { current: document.createElement('div') };
  return { scroller, ...render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} {...props} />) };
};
const DEV = '#intel-relevant-executive-themes-today--agent-pricing-moves-to-outcomes';

describe('the Sales memo', () => {
  it('shows every word and link of the document, folds open, and nothing of its header', () => {
    const { container } = memo();
    for (const fold of container.querySelectorAll('details')) fold.setAttribute('open', '');
    const text = container.textContent!;
    for (const word of wordsOf(SALES_BODY)) expect(text).toContain(word);
    expect(text).not.toMatch(/schema_version|content_type|generated_at|__enterprise-ai-sales-brief/);
    const hrefs = [...container.querySelectorAll('article a[href]:not([href^="#"])')].map(a => a.getAttribute('href'));
    for (const url of linksOf(SALES_BODY)) expect(hrefs).toContain(url);
  });

  it('the reader\'s header, the title and the relevant topics', () => {
    const { container } = memo();
    expect(container.querySelector('.memo > .memo-head')!.textContent).toBe('');
    expect(container.querySelector('.memo-content article')!.firstElementChild).toHaveClass('memo-title');
    expect(container.querySelector('.memo-title + .memo-readtime')).toHaveTextContent('01 min read');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Outcome Pricing and Sovereign Capacity');
    expect(container.querySelector('.memo-topics')).toHaveTextContent('Relevant topicsInvestment & budgetsVendor strategy');
    expect(container.querySelector('.memo-footer')).toHaveTextContent('Enterprise AI Sales Brief · End of edition3 November 2026');
  });

  it('a folded table of contents whose links jump to each development, below the bar', () => {
    const { container, scroller } = memo();
    const contents = container.querySelector('details.memo-toc') as HTMLDetailsElement;
    expect(contents.open).toBe(false);
    expect(contents.querySelector('summary')).toHaveTextContent('In this edition · 2 developments');
    const links = within(contents).getAllByRole('link');
    expect(links.map(l => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Agent pricing moves to outcomes', `${DEV}`],
      ['Sovereign clouds add capacity', '#intel-relevant-executive-themes-today--sovereign-clouds-add-capacity'],
    ]);
    const scrollTo = vi.fn();
    scroller.current.scrollTo = scrollTo as never;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 0; });
    fireEvent.click(links[1]);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    expect(document.activeElement).toBe(container.querySelector('#intel-relevant-executive-themes-today--sovereign-clouds-add-capacity'));
    fireEvent.click(within(container.querySelector(DEV) as HTMLElement).getByRole('link', { name: /Back to contents/ }));
    expect(contents.open).toBe(true);
    vi.restoreAllMocks();
  });

  it('each development: its number, heading, labelled fields, and the way on', () => {
    const { container } = memo();
    const devs = [...container.querySelectorAll('.memo-dev')];
    expect(devs.map(d => d.querySelector('.memo-dev-kicker span')!.textContent)).toEqual(['Development 01 / 02', 'Development 02 / 02']);
    expect(within(devs[0] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent('Agent pricing moves to outcomes');
    expect([...devs[0].querySelectorAll('.memo-field-label')].map(l => l.textContent)).toEqual([
      'What happened', 'Why it matters to the industry', 'Why it matters to me', 'Why it matters to banks',
      'Executive question', 'How I can respond', 'Banking use case', 'Unica+ interpretation', 'LinkedIn angle',
    ]);
    expect(devs[0].querySelector('.memo-field--sources')).toHaveTextContent('Confirmed reporting — 2 November: A vendor priced agents per resolved case.');
    expect(devs[0].querySelector('.memo-field--sources')).toHaveTextContent('Interpretation: Pricing follows outcomes, not seats.');
    expect(devs[0].querySelector('.memo-field--question .memo-question-label')).toHaveTextContent('Development 01 · Executive question');
    expect(devs[0].querySelector('.memo-field--linkedin')).toHaveTextContent('“Seats are a proxy. Outcomes are the product.”');
    expect(within(devs[0] as HTMLElement).getByRole('link', { name: /Next development/ })).toHaveAttribute('href', '#intel-relevant-executive-themes-today--sovereign-clouds-add-capacity');
    expect(within(devs[1] as HTMLElement).getByRole('link', { name: /Executive takeaways/ })).toHaveAttribute('href', '#intel-what-i-should-remember-today');
    expect(container.querySelector('.memo-part .memo-note')).toHaveTextContent('Two developments met today’s significance threshold.');
  });

  it('the closing: what to remember, then the best question, the insight and the development to watch, numbered on', () => {
    const { container } = memo();
    const closing = container.querySelector('.memo-closing')!;
    expect(closing.querySelector('.memo-closing-heading')).toHaveTextContent('The essentialsWhat I should remember today');
    expect(closing.querySelector('.memo-summary--end .memo-summary-label')).toHaveTextContent('Two takeaways');
    expect([...closing.querySelectorAll('.memo-summary--end li')].map(l => l.textContent)).toEqual(['Outcome pricing is arriving.', 'Sovereign capacity is growing.']);
    expect([...closing.querySelectorAll('.memo-row .memo-index')].map(i => i.textContent)).toEqual([
      '03Best executive question today', '04Contrarian or non-obvious insight', '05Development to watch',
    ]);
    expect(closing.querySelector('.memo-row .memo-question-label')).toHaveTextContent('The question to remember');
  });

  it('the topic map and related editions folded at the end; the document’s heading and themes kept there', () => {
    const { container } = memo();
    const [map] = [...container.querySelectorAll('.memo-refs details')] as HTMLDetailsElement[];
    expect(map.open).toBe(false);
    expect(map.querySelector('summary')).toHaveTextContent('Enterprise AI topic map · All 27 topics');
    expect(map).toHaveTextContent('Original briefing heading: Enterprise AI Sales Brief — 3 November 2026');
    expect(map).toHaveTextContent('Relevant executive themes today: Budgets • Vendor strategy • Resilience');
    expect(screen.queryByRole('heading', { name: /Enterprise AI Sales Brief — 3 November/ })).toBeNull();
  });
});

describe('saving the questions', () => {
  const devQuestion: SaveInput = {
    kind: 'labelled', sectionId: 'relevant-executive-themes-today--agent-pricing-moves-to-outcomes', sectionTitle: 'Agent pricing moves to outcomes',
    label: 'Executive question', text: '“Which outcomes would you be willing to pay for?”',
  };
  const bestQuestion: SaveInput = {
    kind: 'labelled', sectionId: 'best-executive-question-today', sectionTitle: 'Best executive question today',
    label: 'Best executive question today', text: '“Which outcomes would you be willing to pay for?”',
  };
  const saves = () => [
    screen.getByRole('button', { name: /the executive question of development 1/ }),
    screen.getByRole('button', { name: /the best executive question/ }),
  ];

  it('the best question repeats a development’s: saving either keeps that one record, as the briefs did', () => {
    const onToggleSave = vi.fn();
    memo({ onToggleSave });
    fireEvent.click(saves()[1]);
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
    fireEvent.click(saves()[0]);
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
  });

  it('once kept, both show it, and either removes it', () => {
    const onToggleSave = vi.fn();
    memo({ saved: savedOf(saveInsight([], edition, devQuestion)), onToggleSave });
    for (const b of saves()) expect(b).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(saves()[1]);
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
  });

  it('the best question kept before on its own shows on both too, and is the one removed', () => {
    const onToggleSave = vi.fn();
    memo({ saved: savedOf(saveInsight([], edition, bestQuestion)), onToggleSave });
    for (const b of saves()) expect(b).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(saves()[0]);
    expect(onToggleSave).toHaveBeenLastCalledWith(bestQuestion);
  });
});

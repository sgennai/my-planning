// @vitest-environment jsdom
// The Customer Engagement Brief as an executive memo (INT-52), on screen:
// every word and link of the document, nothing of its header; the bar,
// subline, title, coverage line and topics; the Executive take; the folded
// contents and its jumps; each development a chapter of fields, numbered,
// its question to ask with Save, ending on the way to the next; the closing,
// numbered on, every customer question with its own Save; a question asked
// twice one Takeaways record; the reference folded at the end. Made-up
// editions, the real structure.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { EditionReader } from './EditionReader';
import { parseEdition } from './parse';
import { saveInsight, savedOf, type SaveInput } from './saved';
import { ENGAGEMENT_DOC, ENGAGEMENT_BODY, ENGAGEMENT_FILE, linksOf, wordsOf } from './test-fixtures';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

const edition = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC);
const memo = (props: Partial<Parameters<typeof EditionReader>[0]> = {}, e = edition) => {
  const scroller = { current: document.createElement('div') };
  return { scroller, ...render(<EditionReader edition={e} scroller={scroller} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} {...props} />) };
};
const DEV1 = '#intel-1-vendor-a-connects-agents-end-to-end';
const DEV2 = '#intel-2-vendor-b-exposes-its-cdp-to-assistants';

describe('the Customer Engagement memo', () => {
  it('shows every word and link of the document, folds open, and nothing of its header', () => {
    const { container } = memo();
    for (const fold of container.querySelectorAll('details')) fold.setAttribute('open', '');
    const text = container.textContent!;
    for (const word of wordsOf(ENGAGEMENT_BODY)) expect(text).toContain(word);
    expect(text).not.toMatch(/schema_version|content_type|generated_at|customer-engagement-brief/);
    const hrefs = [...container.querySelectorAll('article a[href]:not([href^="#"])')].map(a => a.getAttribute('href'));
    for (const url of linksOf(ENGAGEMENT_BODY)) expect(hrefs).toContain(url);
  });

  it('the bar, the subline, the title, the coverage line and the relevant topics', () => {
    const { container } = memo({ onHistory: () => {} });
    expect(container.querySelector('.memo')).toHaveClass('memo--engagement');
    expect(container.querySelector('.memo-bar')).toHaveTextContent('Customer Engagement BriefMon 2 Nov 2026 · 08:00');
    expect(screen.getByRole('button', { name: 'Open edition history' })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.memo-subline')).toHaveTextContent('The executive memo / 2 November 2026');
    expect(container.querySelector('.memo-subline')).toHaveTextContent(/02 developments\s*01 min read/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connected Agents and Headless CDPs');
    expect(container.querySelector('.memo-title + .memo-coverage')).toHaveTextContent('Coverage: 26 October – 2 November 2026 — new since Friday');
    expect(container.querySelector('.memo-topics')).toHaveTextContent('Relevant topicsAgentic AIHeadless CDP');
    expect(container.querySelector('.memo-more-topics')).toBeNull();
    expect(container.querySelector('.memo-footer')).toHaveTextContent('Customer Engagement Brief · End of edition2 November 2026');
  });

  it('seven topics: three, then “+4 topics”; none: no topic line at all', () => {
    const seven = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC.replace('topics: ["Agentic AI", "Headless CDP"]', 'topics: ["Risk", "Architecture", "Data", "Governance", "Integration", "Agentic AI", "Compliance"]'));
    const { container } = memo({}, seven);
    expect(container.querySelectorAll('.memo-topics-list b')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '+4 topics' }));
    expect(container.querySelector('.memo-topics')).toHaveTextContent('RiskArchitectureDataGovernanceIntegrationAgentic AICompliance');
    cleanup();
    const none = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC.replace('topics: ["Agentic AI", "Headless CDP"]', 'topics: []'));
    expect(memo({}, none).container.querySelector('.memo-topics')).toBeNull();
  });

  it('the Executive take opens the memo, before the contents, every word as written', () => {
    const { container } = memo();
    const take = screen.getByRole('region', { name: 'The Executive take' });
    expect(take.nextElementSibling).toHaveClass('memo-toc');
    expect(take.querySelector('.memo-take-text > p')).toHaveTextContent('Two developments cleared the threshold:');
    expect([...take.querySelectorAll('li')].map(l => l.textContent)).toEqual(['A vendor connected its agents end to end.', 'Another exposed its CDP to assistants.']);
    expect(container.querySelector('.memo-lead')).toBeNull();
  });

  it('a folded table of contents: each development, then the way to the closing; its links jump below the bar', () => {
    const { container, scroller } = memo();
    const contents = container.querySelector('details.memo-toc') as HTMLDetailsElement;
    expect(contents.open).toBe(false);
    expect(contents.querySelector('summary')).toHaveTextContent('In this edition · 2 developments');
    const links = within(contents).getAllByRole('link');
    expect(links.map(l => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Vendor A connects agents end to end', DEV1],
      ['Vendor B exposes its CDP to assistants', DEV2],
      ['Executive talking points & conclusions', '#intel-three-executive-talking-points'],
    ]);
    expect([...contents.querySelectorAll('.memo-toc-n')].map(n => n.textContent)).toEqual(['01', '02', '03']);
    const scrollTo = vi.fn();
    scroller.current.scrollTo = scrollTo as never;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 0; });
    fireEvent.click(links[1]);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    expect(document.activeElement).toBe(container.querySelector(DEV2));
    fireEvent.click(within(container.querySelector(DEV1) as HTMLElement).getByRole('link', { name: /Back to contents/ }));
    expect(contents.open).toBe(true);
    vi.restoreAllMocks();
  });

  it('each development: its number, heading, every labelled part a field, its question to ask, and the way on', () => {
    const { container } = memo();
    const devs = [...container.querySelectorAll('.memo-dev')];
    expect(devs.map(d => d.querySelector('.memo-dev-kicker span')!.textContent)).toEqual(['Development 01 / 02', 'Development 02 / 02']);
    expect(within(devs[0] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent(/^Vendor A connects agents end to end$/);
    expect([...devs[0].querySelectorAll('.memo-field-label')].map(l => l.textContent)).toEqual([
      'Confirmed — 30 October', 'Interpretation — why it matters', 'Sales implication', 'Banking relevance', 'Be ready to discuss', 'Executive discovery question',
    ]);
    const fact = devs[0].querySelector('.memo-field--sources')!;
    expect(fact.querySelectorAll('li')).toHaveLength(2);
    expect(fact).toHaveTextContent('Humans keep approvals. Vendor A, 30 October 2026');
    expect(devs[0].querySelector('.memo-field--response')).toHaveTextContent('The whole cycle gets automated.');
    expect(devs[0].querySelector('.memo-field--question .memo-question-label')).toHaveTextContent('Ask the executive');
    expect(devs[0].querySelector('.memo-field--question blockquote')).toHaveTextContent('“Where does your campaign process lose the most time?”');
    expect(within(devs[0] as HTMLElement).getByRole('link', { name: /Next development/ })).toHaveAttribute('href', DEV2);
    expect(within(devs[1] as HTMLElement).getByRole('link', { name: /The essentials/ })).toHaveAttribute('href', '#intel-three-executive-talking-points');
    expect(devs[1].querySelectorAll('.memo-field--sources a')).toHaveLength(2);
  });

  it('the closing: the talking points as the essentials, then the rest numbered on, each customer question with Save', () => {
    const { container } = memo();
    const closing = container.querySelector('.memo-closing')!;
    expect(closing.querySelector('.memo-closing-heading')).toHaveTextContent('The essentialsThree executive talking points');
    expect(closing.querySelector('.memo-summary--end .memo-summary-label')).toHaveTextContent('Two talking points');
    expect([...closing.querySelectorAll('.memo-summary--end li')].map(l => l.textContent)).toEqual([
      'Engagement is going headless: value shifts to governed data.', 'Agents automate the operating model: approvals need design.',
    ]);
    expect(closing.querySelectorAll('.memo-summary--end li strong')).toHaveLength(2);
    expect([...closing.querySelectorAll('.memo-row .memo-index')].map(i => i.textContent)).toEqual([
      '03Three customer questions worth asking', '04Competitive watchlist', '05Contrarian insight', '06Development to monitor next',
    ]);
    expect([...closing.querySelectorAll('.memo-customer-question .memo-question-label')].map(l => l.textContent)).toEqual(['Question 01', 'Question 02']);
    expect(closing.querySelectorAll('.memo-watchlist li')).toHaveLength(3);
    expect([...container.querySelectorAll('.memo-question .memo-save')].map(b => b.getAttribute('aria-label'))).toEqual([
      'Save the executive discovery question of development 1', 'Save the executive discovery question of development 2',
      'Save customer question 1', 'Save customer question 2',
    ]);
  });

  it('the topic map and related editions folded at the end; the document’s title line kept there', () => {
    const { container } = memo();
    const [map] = [...container.querySelectorAll('.memo-refs details')] as HTMLDetailsElement[];
    expect(map.open).toBe(false);
    expect(map.querySelector('summary')).toHaveTextContent('Enterprise AI topic map · All 27 topics');
    expect(map).toHaveTextContent('Original briefing heading: Enterprise Customer Engagement Brief');
    expect(screen.queryByRole('heading', { name: 'Enterprise Customer Engagement Brief' })).toBeNull();
  });

  it('an edition without an Executive take shows its own opening, and no take', () => {
    const body = ENGAGEMENT_BODY.replace(/## Executive take[\s\S]*?(?=## 1\.)/, 'Only two developments cleared the threshold.\n\n\n');
    const older = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC.replace(ENGAGEMENT_BODY, body));
    const { container } = memo({}, older);
    expect(container.querySelector('.memo-take')).toBeNull();
    expect(container.querySelector('.memo-lead')).toHaveTextContent('Only two developments cleared the threshold.');
  });
});

describe('saving the questions', () => {
  const devQuestion: SaveInput = {
    kind: 'labelled', sectionId: '1-vendor-a-connects-agents-end-to-end', sectionTitle: '1. Vendor A connects agents end to end',
    label: 'Executive discovery question', text: '“Where does your campaign process lose the most time?”',
  };
  const customerQuestion: SaveInput = {
    kind: 'labelled', sectionId: 'three-customer-questions-worth-asking', sectionTitle: 'Three customer questions worth asking',
    label: 'Three customer questions worth asking', text: '“Which system keeps the approval record?”',
  };

  it('each question saves itself, as the brief saved it', () => {
    const onToggleSave = vi.fn();
    memo({ onToggleSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save the executive discovery question of development 1' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
    fireEvent.click(screen.getByRole('button', { name: 'Save customer question 2' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(customerQuestion);
  });

  it('kept before in the brief, it shows as kept here, and is the one removed', () => {
    const onToggleSave = vi.fn();
    memo({ saved: savedOf(saveInsight([], edition, customerQuestion)), onToggleSave });
    const kept = screen.getByRole('button', { name: 'Remove saved customer question 2' });
    expect(kept).toHaveAttribute('aria-pressed', 'true');
    expect(kept).toHaveTextContent('Saved');
    expect(screen.getByRole('button', { name: 'Save customer question 1' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(kept);
    expect(onToggleSave).toHaveBeenLastCalledWith(customerQuestion);
  });

  it('a question asked twice is one record: either Save writes the first place’s, both show it, either removes it', () => {
    const twice = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE,
      ENGAGEMENT_DOC.replace('- “Which workflows could run headless?”', '- “Where does your campaign process lose the most time?”'));
    const onToggleSave = vi.fn();
    memo({ onToggleSave }, twice);
    fireEvent.click(screen.getByRole('button', { name: 'Save customer question 1' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
    cleanup();
    memo({ saved: savedOf(saveInsight([], twice, devQuestion)), onToggleSave }, twice);
    expect(screen.getByRole('button', { name: 'Remove saved the executive discovery question of development 1' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved customer question 1' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(devQuestion);
  });
});

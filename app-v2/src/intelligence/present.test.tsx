// @vitest-environment jsdom
// How an edition's sections are shown, and the promise behind it: whatever
// form a section takes, every word of the document is on the screen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { parseEdition, splitSections } from './parse';
import { presentSection, shortTitle, copyText, readingMinutes, blocksOf, previewOf, plainText } from './present';
import { EditionReader } from './EditionReader';
import { CHALLENGE_DOC, CHALLENGE_BODY, CHALLENGE_FILE, wordsOf } from './test-fixtures';

const sections = splitSections(CHALLENGE_BODY);
const section = (title: string) => sections.find(s => s.title.startsWith(title))!;
const present = (title: string) => presentSection('enterprise-ai-challenge', section(title));

afterEach(cleanup);

describe('the AI Challenge sections', () => {
  it('the topic map is a cloud, with the label and topics the document gives for today', () => {
    expect(present('Enterprise AI topic map')).toEqual({
      kind: 'topics',
      topics: ['Strategy', 'Governance', 'Agentic AI', 'Operating models', 'ROI'],
      label: "Relevant to today's challenge",
      highlighted: ['Governance', 'Agentic AI', 'Operating models'],
    });
  });

  it('the challenge opens with its bold line, the rest as written', () => {
    expect(present('Challenge')).toEqual({
      kind: 'lead',
      lead: 'Teams are deploying AI agents faster than anyone can list them.',
      rest: 'Each department builds its own **agents** to automate requests, and nobody keeps an [inventory](https://example.com/inventory).',
    });
  });

  it('the approaches are numbered cards', () => {
    const p = present('3 approaches');
    expect(p.kind).toBe('numbered');
    if (p.kind !== 'numbered') return;
    expect(p.items.map(i => [i.n, i.title])).toEqual([
      ['1', 'Keep one register of agents'], ['2', 'Fund a platform team'], ['3', 'Retire what nobody owns'],
    ]);
    expect(p.items[2].body).toBe('Review the register each quarter and switch off orphans.');
  });

  it('the discovery questions keep their labels', () => {
    expect(present('Executive discovery questions')).toEqual({
      kind: 'questions',
      items: [
        { label: 'Opening question', text: '"How many AI agents are running in your organisation today?"' },
        { label: 'Follow-up question', text: '"Who would switch one off if it misbehaved tonight?"' },
      ],
    });
  });

  it('the vocabulary is three terms and the sentence to rehearse', () => {
    const p = present('Executive Vocabulary');
    expect(p.kind).toBe('vocabulary');
    if (p.kind !== 'vocabulary') return;
    expect(p.terms).toEqual([
      { n: '1', term: 'Agent sprawl', definition: 'Uncontrolled growth in the number of AI agents.' },
      { n: '2', term: 'Agent register', definition: 'The list of every agent, its owner and its permissions.' },
      { n: '3', term: 'Orphaned agent', definition: 'An agent whose owner has left.' },
    ]);
    expect(p.notes).toEqual([{ label: 'Use it in a conversation', text: '"Before agent sprawl sets in, an agent register makes sure no orphaned agent stays live."' }]);
  });

  it('a section that does not fit its form is shown as written', () => {
    const odd = { id: 'x', title: '3 approaches', markdown: 'First, a word of context.\n\n**1. Keep one register**\n\nRecord it.\n\n**2. Fund it**\n\nPay.' };
    expect(presentSection('enterprise-ai-challenge', odd)).toEqual({ kind: 'markdown', markdown: odd.markdown });
    const loose = { id: 'y', title: 'Executive discovery questions', markdown: '1. How many agents?\n2. Who owns them?' };
    expect(presentSection('enterprise-ai-challenge', loose).kind).toBe('markdown');
    const vocab = { id: 'z', title: 'Executive Vocabulary', markdown: '**1. Agent sprawl** — Growth.\n\nA closing thought with no label.' };
    expect(presentSection('enterprise-ai-challenge', vocab).kind).toBe('markdown');
  });

  it('a section the other feeds have no form for is shown as written', () => {
    expect(presentSection('enterprise-ai-sales-brief', section('Business impact')).kind).toBe('markdown');
  });
});

describe('small things', () => {
  it('index names stop at a dash or colon', () => {
    expect(shortTitle('Executive Vocabulary — 3 Terms to Remember')).toBe('Executive Vocabulary');
    expect(shortTitle('Market signal: banks')).toBe('Market signal');
    expect(shortTitle('3 approaches')).toBe('3 approaches');
  });

  it('copy takes the words without their quotation marks or emphasis', () => {
    expect(copyText('"How many AI agents are running?"')).toBe('How many AI agents are running?');
    expect(copyText('“Who owns **this** one?”')).toBe('Who owns this one?');
    expect(copyText('Plain question?')).toBe('Plain question?');
  });

  it('reading time is at least a minute', () => {
    expect(readingMinutes('A few words.')).toBe(1);
    expect(readingMinutes('word '.repeat(660))).toBe(3);
  });

  it("Today's preview is the edition's own words: what to remember, the executive take, else the challenge", () => {
    expect(previewOf(sections)).toBe('Teams are deploying AI agents faster than anyone can list them.');
    const brief = splitSections('# Brief — 1 Nov\n\n## Themes\n\nBanks buy.\n\n## What I should remember today\n\n- One **thing**.\n- Another, [linked](https://x.y).');
    expect(previewOf(brief)).toBe('One thing. Another, linked.');
    const engagement = splitSections('# Engagement Brief\n\n**Coverage: last week**\n\n## Executive take\n\nTwo things cleared the bar:\n\n- First thing.\n- Second thing.\n\n## 1. Vendor news\n\nText.');
    expect(previewOf(engagement)).toBe('First thing. Second thing.');
    const long = splitSections(`## Note\n\n${'word '.repeat(80)}`);
    expect(previewOf(long)!.length).toBeLessThanOrEqual(221);
    expect(previewOf(long)).toMatch(/word…$/);
    expect(previewOf(splitSections('## List only\n\n- a\n- b'))).toBe('a b');
    expect(previewOf(splitSections('Just a line, no sections.'))).toBeNull();
    expect(plainText('> **Bold** and [link](https://x.y) `code`')).toBe('Bold and link code');
  });

  it('blocks are what blank lines separate, lists kept whole', () => {
    expect(blocksOf('One\n\n\n- a\n- b\n  \nTwo')).toEqual(['One', '- a\n- b', 'Two']);
  });
});

describe('the edition on screen', () => {
  const edition = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, CHALLENGE_DOC);
  const scroller = { current: document.createElement('div') };
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Element.prototype.scrollTo = function scrollTo() {};

  it('shows every word of the document, and nothing of its header or filename', () => {
    const { container } = render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} />);
    for (const card of screen.getAllByRole('button', { expanded: false })) fireEvent.click(card);
    const text = container.textContent!;
    for (const word of wordsOf(CHALLENGE_BODY)) expect(text).toContain(word);
    expect(text).not.toMatch(/schema_version|content_type|generated_at|__enterprise-ai-challenge/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agent Sprawl: Who Owns the Bots?');
    expect(text).toContain('AI Challenge · Monday 2 November · 08:20');
  });

  it('in the forms chosen for each section', () => {
    const { container } = render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} />);
    expect(container.querySelectorAll('.intel-cloud li.on')).toHaveLength(3);
    expect(container.querySelectorAll('.intel-step')).toHaveLength(3);
    expect(container.querySelectorAll('.intel-question')).toHaveLength(2);
    expect(container.querySelectorAll('.intel-term')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'inventory' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Open original in Google Docs' })).toHaveAttribute('href', CHALLENGE_FILE.webViewLink);
    expect(screen.getAllByRole('button', { name: /^(Enterprise AI topic map|Challenge|Executive Vocabulary)$/ })).toHaveLength(3);
  });

  it("the topic map leads with today's topics; the whole map is a tap away", () => {
    const { container } = render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} />);
    const map = container.querySelector('#intel-enterprise-ai-topic-map')!;
    const shown = () => [...map.querySelectorAll('.intel-cloud li')].map(li => li.textContent);
    expect(shown()).toEqual(['Governance', 'Agentic AI', 'Operating models']);
    expect(map.textContent).toContain("Relevant to today's challenge");
    fireEvent.click(screen.getByRole('button', { name: 'All topics (5)' }));
    expect(shown()).toEqual(['Governance', 'Agentic AI', 'Operating models', 'Strategy', 'Governance', 'Agentic AI', 'Operating models', 'ROI']);
    expect(map.querySelectorAll('.intel-cloud li.on')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the full map' }));
    expect(shown()).toHaveLength(3);
  });

  it('a vocabulary card reveals its definition on a tap', () => {
    render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} />);
    expect(screen.queryByText('Uncontrolled growth in the number of AI agents.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Agent sprawl/ }));
    expect(screen.getByText('Uncontrolled growth in the number of AI agents.')).toBeInTheDocument();
  });

  it('copies a discovery question as words, and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onNote = vi.fn();
    render(<EditionReader edition={edition} scroller={scroller} onNote={onNote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy: Opening question' }));
    expect(writeText).toHaveBeenCalledWith('How many AI agents are running in your organisation today?');
    await vi.waitFor(() => expect(onNote).toHaveBeenCalledWith('Copied'));
  });

  it('raw HTML in a document shows as text, never as markup', () => {
    const odd = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, '## Note\n\nSee <img src=x onerror="alert(1)"> here.');
    const { container } = render(<EditionReader edition={odd} scroller={scroller} onNote={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('here.');
  });
});

// @vitest-environment jsdom
// The AI Challenge as an executive memo (INT-50): every word of the document
// on the screen, in the memo's forms, nothing of its header; its relevant
// topics once, under the title; its sections numbered in their order, absent
// ones absent; saving through Takeaways; the topic map and related editions
// folded at the end. Made-up editions, the real structure.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { EditionReader } from './EditionReader';
import { parseEdition, type Edition } from './parse';
import { saveInsight, savedOf } from './saved';
import { CHALLENGE_DOC, CHALLENGE_BODY, CHALLENGE_FILE, wordsOf } from './test-fixtures';
import type { Related } from './related';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

const scroller = { current: document.createElement('div') };
const edition = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, CHALLENGE_DOC);
const memo = (props: Partial<Parameters<typeof EditionReader>[0]> = {}) =>
  render(<EditionReader edition={edition} scroller={scroller} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} {...props} />);
const doc = (body: string, topics = '["Risk"]') => parseEdition('enterprise-ai-challenge', CHALLENGE_FILE,
  `---\nschema_version: 1\ncontent_type: "enterprise-ai-challenge"\nedition_date: "2026-09-07"\ngenerated_at: "2026-09-07T08:54:00+02:00"\ntitle: "An Older Challenge"\ntopics: ${topics}\n---\n\n${body}\n`);

describe('the memo', () => {
  it('shows every word of the document, the folded topic map included, and nothing of its header', () => {
    const { container } = memo();
    const text = container.textContent!;
    for (const word of wordsOf(CHALLENGE_BODY)) expect(text).toContain(word);
    expect(text).not.toMatch(/schema_version|content_type|generated_at|__enterprise-ai-challenge/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agent Sprawl: Who Owns the Bots?');
  });

  it('dates itself by the run: the memo, its end (the bar is the workspace’s, MemoWorkspace.test.tsx)', () => {
    const { container } = memo();
    expect(container.querySelector('.memo-bar, .memo-readbar')).toBeNull();
    expect(container.querySelector('.memo-subline')).toHaveTextContent('The executive memo / 2 November 2026');
    expect(container.querySelector('.memo-subline')).toHaveTextContent('01 min read');
    expect(container.querySelector('.memo-footer')).toHaveTextContent('AI Challenge · End of edition2 November 2026');
  });

  it('opens the challenge in one sentence, said once, and numbers the sections in their order, the topic map apart', () => {
    const { container } = memo();
    expect(container.querySelector('.memo-summary')).toHaveTextContent('In one sentenceTeams are deploying AI agents faster than anyone can list them.');
    expect(screen.getAllByText('Teams are deploying AI agents faster than anyone can list them.')).toHaveLength(1);
    const numbered = [...container.querySelectorAll('.memo-section')].map(s => s.querySelector('.memo-index')!.textContent);
    expect(numbered).toEqual(['01Challenge', '02Business impact', '03Approaches', '04What to listen for', '05Executive discovery questions', '06Executive Vocabulary — 3 Terms to Remember'].map(t => t.replace('Approaches', '3 approaches')));
    expect(container.querySelector('#intel-challenge')).toHaveTextContent('Each department builds its own agents to automate requests, and nobody keeps an inventory.');
    expect(screen.getByRole('link', { name: 'inventory' })).toHaveAttribute('target', '_blank');
  });

  it('in the memo’s forms: approaches, what people say, the questions, the vocabulary', () => {
    const { container } = memo();
    expect([...container.querySelectorAll('.memo-approach h3')].map(h => h.textContent)).toEqual(['Keep one register of agents', 'Fund a platform team', 'Retire what nobody owns']);
    expect([...container.querySelectorAll('.memo-approach-no')].map(n => n.textContent)).toEqual(['01', '02', '03']);
    expect(container.querySelectorAll('.memo-listen li')).toHaveLength(2);
    expect([...container.querySelectorAll('.memo-question-label')].map(l => l.textContent)).toEqual(['Opening question', 'Follow-up question']);
    expect([...container.querySelectorAll('.memo-term strong')].map(t => t.textContent)).toEqual(['Agent sprawl', 'Agent register', 'Orphaned agent']);
    expect(container.querySelector('.memo-conversation')).toHaveTextContent('Use it in a conversation:');
    // No section index of chips, no card per section.
    expect(container.querySelector('.intel-index, .intel-sec')).toBeNull();
  });

  it('names the edition’s relevant topics once, the first three, the rest a tap away', () => {
    const six = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, CHALLENGE_DOC.replace(
      "**Relevant to today's challenge:** Governance • Agentic AI • Operating models",
      "**Relevant to today's challenge:** Compliance • Governance • Risk • AI risk • Operating models • ROI",
    ));
    const { container } = memo({ edition: six });
    const line = container.querySelector('.memo-topics')!;
    expect([...line.querySelectorAll('b')].map(b => b.textContent)).toEqual(['Compliance', 'Governance', 'Risk']);
    expect(line).not.toHaveTextContent('AI risk');
    const more = within(line as HTMLElement).getByRole('button', { name: '+3 topics' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect([...line.querySelectorAll('.memo-topics-list > span')].map(t => t.textContent)).toEqual(['Compliance', 'Governance', 'Risk', 'AI risk', 'Operating models', 'ROI']);
    expect(within(line as HTMLElement).getByRole('button')).toHaveTextContent('Show less');
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(line).not.toHaveTextContent('AI risk');
    // Three or fewer: all shown, no control.
    cleanup();
    const plain = memo().container.querySelector('.memo-topics')!;
    expect(plain.querySelectorAll('b')).toHaveLength(3);
    expect(within(plain as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('folds the whole topic map at its end, with its own count', () => {
    const { container } = memo();
    const fold = container.querySelector('details#intel-enterprise-ai-topic-map')!;
    expect(fold).not.toHaveAttribute('open');
    expect(fold.querySelector('summary')).toHaveTextContent('Enterprise AI topic map · All 5 topics');
    expect(fold.querySelector('.memo-map')).toHaveTextContent('Strategy • Governance • Agentic AI • Operating models • ROI');
  });

  it('an older edition: only the sections it has, numbered in order, a new one in its words, no empty placeholder', () => {
    const older = doc("## Challenge\n\n**Data is not ready.**\n\nIt lives in silos.\n\n## Business impact\n\nSlow projects.\n\n## Field notes\n\nA section the memo has never seen.");
    const { container } = memo({ edition: older });
    expect([...container.querySelectorAll('.memo-index')].map(i => i.textContent)).toEqual(['01Challenge', '02Business impact', '03Field notes']);
    expect(container.textContent).toContain('A section the memo has never seen.');
    expect(container.querySelector('.memo-vocab, .memo-questions, details')).toBeNull();
    // No relevant line in the document: the header's topics.
    expect(container.querySelector('.memo-topics')).toHaveTextContent('TopicsRisk');
  });

  it('a Challenge without a bold opening keeps all its words in its section, and has no summary', () => {
    const { container } = memo({ edition: doc('## Challenge\n\nPlain words only.') });
    expect(container.querySelector('.memo-summary')).toBeNull();
    expect(container.querySelector('#intel-challenge')).toHaveTextContent('Plain words only.');
  });
});

describe('saving from the memo', () => {
  it('each question saves to Takeaways with where it came from, and says when it is saved', () => {
    const onToggleSave = vi.fn();
    memo({ onToggleSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save opening question' }));
    expect(onToggleSave).toHaveBeenCalledWith({
      kind: 'labelled', sectionId: 'executive-discovery-questions', sectionTitle: 'Executive discovery questions',
      label: 'Opening question', text: '"How many AI agents are running in your organisation today?"',
    });
    expect(screen.getAllByRole('button', { name: /^Save (opening|follow-up) question$/ })).toHaveLength(2);
  });

  it('what Takeaways already holds shows as saved, in the same records as before', () => {
    const content = saveInsight([], edition, { kind: 'labelled', sectionId: 'executive-discovery-questions', sectionTitle: 'Executive discovery questions', label: 'Follow-up question', text: '"Who would switch one off if it misbehaved tonight?"' });
    memo({ saved: savedOf(content) });
    const saved = screen.getByRole('button', { name: 'Remove saved follow-up question' });
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    expect(saved).toHaveTextContent('Saved');
    expect(screen.getByRole('button', { name: 'Save opening question' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('terms, the conversation line and the edition save, quietly; no save in the sections\u2019 margin', () => {
    const onToggleSave = vi.fn();
    memo({ onToggleSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save the term Agent sprawl' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'term', label: 'Agent sprawl', text: 'Uncontrolled growth in the number of AI agents.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save the line use it in a conversation' }));
    expect(onToggleSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'labelled', label: 'Use it in a conversation' }));
    expect(screen.queryByRole('button', { name: /^Save the section/ })).toBeNull();
    expect(document.querySelector('.memo-index button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save this edition' }));
    expect(onToggleSave).toHaveBeenLastCalledWith({ kind: 'edition', text: 'Agent Sprawl: Who Owns the Bots?' });
  });
});

describe('the memo’s related editions', () => {
  const other = (n: number, feedId: Edition['feedId'] = 'enterprise-ai-challenge'): Related => ({
    edition: { driveFileId: `r${n}`, feedId, title: `Related ${n}`, editionDate: `2026-10-${String(10 + n).padStart(2, '0')}`, time: '08:30' } as Edition,
    shares: ['Governance', 'Agentic AI'],
  });

  it('related editions are folded under the topic map, a few at a time, each opening its edition', () => {
    const onOpenRelated = vi.fn();
    const related = [other(1, 'customer-engagement-brief'), ...Array.from({ length: 11 }, (_, i) => other(i + 2))];
    const { container } = memo({ related, onOpenRelated });
    const folds = [...container.querySelectorAll('details')];
    expect(folds.map(d => d.querySelector('summary')!.textContent)).toEqual(['Enterprise AI topic map · All 5 topics', 'Related by topic']);
    expect(folds[1]).not.toHaveAttribute('open');
    const rows = () => within(folds[1]).getAllByRole('button', { name: /^Related \d+/ });
    expect(rows()).toHaveLength(5);
    expect(rows()[0]).toHaveTextContent('Related 1Sun 11 Oct 2026 · 08:30 · Customer Engagement BriefShared: Governance · Agentic AI');
    expect(rows()[1]).not.toHaveTextContent('Brief');
    fireEvent.click(within(folds[1]).getByRole('button', { name: 'Show more (7)' }));
    expect(rows()).toHaveLength(12);
    expect(within(folds[1]).queryByRole('button', { name: /Show more/ })).toBeNull();
    fireEvent.click(rows()[0]);
    expect(onOpenRelated).toHaveBeenCalledWith(related[0].edition);
  });

  it('no related edition, no fold', () => {
    const { container } = memo({ related: [] });
    expect(container.querySelectorAll('details')).toHaveLength(1);
  });
});

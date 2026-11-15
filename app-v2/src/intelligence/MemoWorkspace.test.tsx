// @vitest-environment jsdom
// The memos' workspace (INT-53): the reading bar (Hide or Show editions, the
// run's date and time between the chevrons; the feed is named by its tab
// above, INT-54) and the paper index
// (the feed's editions by month, newest first, each month opening on its own,
// a search over titles and dates, the edition read marked, no times). Made-up
// editions.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { createRef } from 'react';
import { MemoIndex, MemoReadbar } from './MemoWorkspace';
import type { Edition } from './parse';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

const ed = (day: string, time: string, title: string): Edition => ({ editionDate: day, time, title, driveFileId: `id-${day}`, feedId: 'enterprise-ai-challenge' } as Edition);
const EDITIONS = [
  ed('2026-11-12', '08:50', 'Shadow AI and sensitive data exposure'),
  ed('2026-11-02', '08:20', 'Agent sprawl'),
  ed('2026-10-31', '08:16', 'Defensible decisions'),
  ed('2026-10-09', '08:12', 'Unit économics'),
  ed('2026-09-05', '14:12', 'Ownership'),
];

describe('the reading bar', () => {
  const bar = (props: Partial<Parameters<typeof MemoReadbar>[0]> = {}) => render(
    <MemoReadbar edition={EDITIONS[1]} shown onToggle={() => {}} toggleRef={createRef()} fillRef={createRef()} {...props} />,
  );

  it('shows or hides the editions and says which; the feed is not named again', () => {
    const onToggle = vi.fn();
    const { rerender } = bar({ onToggle });
    const toggle = screen.getByRole('button', { name: 'Hide editions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'memo-editions');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
    rerender(<MemoReadbar edition={EDITIONS[1]} shown={false} onToggle={onToggle} toggleRef={createRef()} fillRef={createRef()} />);
    expect(screen.getByRole('button', { name: 'Show editions' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.memo-readbar')).not.toHaveTextContent('AI Challenge');
    expect(document.querySelector('.memo-readbar-left')!.children).toHaveLength(1);
  });

  it('the edition’s date, without the run’s time (INT-58), between the chevrons to the older and newer edition; none, faded, at an end', () => {
    const onOpenAdjacent = vi.fn();
    bar({ adjacent: { older: EDITIONS[2], newer: null }, onOpenAdjacent });
    fireEvent.click(screen.getByRole('button', { name: 'Previous edition: Sat 31 Oct, Defensible decisions' }));
    expect(onOpenAdjacent).toHaveBeenCalledWith(EDITIONS[2]);
    expect(screen.getByRole('button', { name: 'Next edition: none' })).toBeDisabled();
    expect([...document.querySelector('.memo-readbar-right')!.children].map(c => [c.className, c.textContent])).toEqual([
      ['memo-step', '‹'], ['memo-readbar-date', '2 Nov 2026'], ['memo-step', '›'],
    ]);
  });

  it('before a feed has an edition: the toggle, no date', () => {
    bar({ edition: null });
    expect(document.querySelector('.memo-readbar-right')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide editions' })).toBeInTheDocument();
  });
});

/**
 * The AI Challenge's index, the edition of 2 November being read; the one of
 * 31 October marked read, the oldest imported (the archive: neither read nor unread).
 */
function Index({ current = EDITIONS[1], shown = true, onChoose = () => {}, onStatus = () => {}, read = [EDITIONS[2]] }: {
  current?: Edition | null; shown?: boolean; onChoose?: (e: Edition) => void; onStatus?: () => void; read?: Edition[];
}) {
  return (
    <MemoIndex
      feedId="enterprise-ai-challenge"
      editions={EDITIONS}
      current={current}
      shown={shown}
      readOf={e => read.includes(e)}
      unreadOf={e => !read.includes(e) && e !== EDITIONS[4]}
      tagsOf={e => (e === EDITIONS[0] ? [{ text: 'Updated', alert: false }] : [])}
      onChoose={onChoose}
      onStatus={onStatus}
      indexRef={createRef()}
    />
  );
}
const head = (month: RegExp) => screen.getByRole('button', { name: month });
const listed = () => [...document.querySelectorAll('.memo-month-list:not([hidden]) .memo-edition-title')].map(t => t.textContent);

describe('the paper index', () => {
  it('its head: “Edition history”, how many read and unread, the search, the filter; no feed name, no legend (INT-57)', () => {
    render(<Index />);
    const index = screen.getByRole('complementary', { name: 'Edition history' });
    expect(index.querySelector('.memo-editions-head')).toHaveTextContent(/^Edition history1 read · 3 unread · 5 editionsAll editionsUnread only$/);
    expect(within(index).getByRole('searchbox', { name: 'Search edition history' })).toHaveAttribute('placeholder', 'Search editions');
    expect(within(within(index).getByRole('group', { name: 'Show' })).getAllByRole('button').map(b => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['All editions', 'true'], ['Unread only', 'false']]);
    expect(index.querySelector('.memo-editions-foot')).toHaveTextContent('5 editions');
  });

  it('a read edition is marked apart from the one chosen: all four combinations show', () => {
    const { rerender } = render(<Index />);
    fireEvent.click(head(/^October 2026/));
    const item = (name: RegExp) => screen.getByRole('button', { name });
    // Chosen and unread; read, not chosen; neither.
    expect(item(/Agent sprawl/)).toHaveAttribute('aria-current', 'page');
    expect(item(/Agent sprawl/)).not.toHaveClass('is-read');
    expect(item(/Defensible decisions/)).toHaveClass('is-read');
    expect(item(/Defensible decisions/)).not.toHaveAttribute('aria-current');
    expect(item(/Defensible decisions/)).toHaveAccessibleName(/^Sat 31 Oct, read:\s?Defensible decisions$/);
    expect(item(/Unit économics/)).toHaveAccessibleName(/^Fri 9 Oct:\s?Unit économics$/);
    expect(item(/Unit économics/)).not.toHaveClass('is-read');
    // Chosen and read.
    rerender(<Index current={EDITIONS[2]} />);
    expect(item(/Defensible decisions/)).toHaveClass('is-read');
    expect(item(/Defensible decisions/)).toHaveAttribute('aria-current', 'page');
  });

  it('Unread only lists what is not marked read (the archive aside); one marked read leaves it, the one open stays open', () => {
    const { rerender } = render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread only' }));
    expect(screen.getByRole('button', { name: 'Unread only' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(head(/^October 2026/));
    expect(listed()).toEqual(['Shadow AI and sensitive data exposure', 'Agent sprawl', 'Unit économics']);
    expect(document.querySelector('.memo-editions-foot')).toHaveTextContent('3 editions');
    // The one being read is marked read: it leaves the list, the counts follow; it is still the one chosen.
    rerender(<Index read={[EDITIONS[1], EDITIONS[2]]} />);
    expect(listed()).toEqual(['Shadow AI and sensitive data exposure', 'Unit économics']);
    expect(document.querySelector('.memo-editions-sub')).toHaveTextContent('2 read · 2 unread · 5 editions');
    fireEvent.click(screen.getByRole('button', { name: 'All editions' }));
    expect(screen.getByRole('button', { name: /Agent sprawl/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Agent sprawl/ })).toHaveClass('is-read');
    fireEvent.click(screen.getByRole('button', { name: 'Unread only' }));
    rerender(<Index read={EDITIONS.slice(0, 4)} />);
    expect(screen.getByText('No unread editions.')).toBeInTheDocument();
  });

  it('the months newest first, each with its count; only the open ones list their editions', () => {
    render(<Index />);
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.textContent)).toEqual(['November 2026, 2 editions', 'October 2026, 2 editions', 'September 2026, 1 edition']);
    expect(head(/^November 2026/)).toHaveAttribute('aria-expanded', 'true');
    expect(head(/^October 2026/)).toHaveAttribute('aria-expanded', 'false');
    expect(listed()).toEqual(['Shadow AI and sensitive data exposure', 'Agent sprawl']);
  });

  it('each edition: its date without the time, its title, quiet tags; the one being read marked', () => {
    render(<Index />);
    const items = [...document.querySelectorAll('.memo-month-list:not([hidden]) .memo-edition')];
    expect(items.map(i => i.querySelector('.memo-edition-date')!.textContent)).toEqual(['Thu 12 Nov, Updated', 'Mon 2 Nov']);
    expect(document.querySelector('.memo-editions')!.textContent).not.toMatch(/\d\d:\d\d/);
    expect(screen.getByRole('button', { name: /Agent sprawl/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Shadow AI/ })).not.toHaveAttribute('aria-current');
  });

  it('the month of the edition being read opens, as it opens and as it changes; the months are kept for the feed', () => {
    const { rerender } = render(<Index />);
    expect(JSON.parse(localStorage.getItem('my-planning-intel-months:enterprise-ai-challenge')!)).toEqual(['2026-11']);
    rerender(<Index current={EDITIONS[4]} />);
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'true']);
    cleanup();
    // Drawn anew (another feed, and back): the months as they were.
    render(<Index current={EDITIONS[4]} />);
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'true']);
  });

  it('months open and close on their own: several stay open at once', () => {
    render(<Index />);
    fireEvent.click(head(/^September 2026/));
    fireEvent.click(head(/^October 2026/));
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true']);
    fireEvent.click(head(/^November 2026/));
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'true']);
    expect(listed()).toEqual(['Defensible decisions', 'Unit économics', 'Ownership']);
  });

  it('choosing an edition is the caller’s; the index stays', () => {
    const onChoose = vi.fn();
    render(<Index onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Shadow AI/ }));
    expect(onChoose).toHaveBeenCalledWith(EDITIONS[0]);
    expect(screen.getByRole('complementary', { name: 'Edition history' })).toBeInTheDocument();
  });

  it('a search shows the matching editions in their months, open; cleared, the months are as they were', () => {
    const { unmount } = render(<Index />);
    const search = screen.getByRole('searchbox', { name: 'Search edition history' });
    fireEvent.change(search, { target: { value: 'DECI' } });
    expect([...document.querySelectorAll('.memo-month-head')].map(b => [b.textContent, b.getAttribute('aria-expanded')])).toEqual([['October 2026, 1 edition', 'true']]);
    expect(listed()).toEqual(['Defensible decisions']);
    expect(document.querySelector('.memo-editions-foot')).toHaveTextContent('1 edition');
    fireEvent.change(search, { target: { value: 'sept' } });
    expect(listed()).toEqual(['Ownership']);
    fireEvent.change(search, { target: { value: 'economics' } });
    expect(listed()).toEqual(['Unit économics']);
    fireEvent.click(head(/^October 2026/));
    expect(listed()).toEqual([]);
    fireEvent.change(search, { target: { value: 'nothing like this' } });
    expect(screen.getByText('No matching editions.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect([...document.querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    expect(listed()).toEqual(['Shadow AI and sensitive data exposure', 'Agent sprawl']);
    // A search is kept for the feed this session, as the index is drawn anew.
    fireEvent.change(search, { target: { value: 'ownership' } });
    unmount();
    render(<Index />);
    expect(screen.getByRole('searchbox', { name: 'Search edition history' })).toHaveValue('ownership');
    expect(listed()).toEqual(['Ownership']);
  });

  it('hidden, it is out of reach (inert); the foot opens the feed’s status', () => {
    const onStatus = vi.fn();
    const { rerender } = render(<Index onStatus={onStatus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Feed status' }));
    expect(onStatus).toHaveBeenCalled();
    rerender(<Index shown={false} />);
    expect(document.querySelector('.memo-editions')).toHaveAttribute('inert');
  });
});

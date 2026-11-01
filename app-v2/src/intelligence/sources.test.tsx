// @vitest-environment jsdom
// Sources: every link a briefing gives arrives as that very link, and a
// ChatGPT citation marker (a source that cannot be followed outside ChatGPT)
// is shown and reported as such, never replaced by a guessed link.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { parseEdition } from './parse';
import { EditionReader } from './EditionReader';
import { citationsIn } from './citations';
import { conformanceOf, labelOf, noticeOf } from './conformance';
import {
  SALES_DOC, SALES_FILE, ENGAGEMENT_DOC, ENGAGEMENT_FILE, CHALLENGE_DOC, CHALLENGE_FILE, linksOf,
} from './test-fixtures';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
Element.prototype.scrollTo = function scrollTo() {};
afterEach(cleanup);

const show = (e: ReturnType<typeof parseEdition>) =>
  render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} />).container;
const hrefsIn = (c: HTMLElement) => [...c.querySelectorAll('.intel-col a[href]')].map(a => a.getAttribute('href'));

describe('source links', () => {
  for (const [name, feed, file, doc] of [
    ['Sales Brief', 'enterprise-ai-sales-brief', SALES_FILE, SALES_DOC],
    ['Customer Engagement Brief', 'customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC],
  ] as const) {
    it(`${name}: every link arrives as written, and none is added`, () => {
      const e = parseEdition(feed, file, doc);
      const written = linksOf(e.markdownBody);
      expect(written.length).toBeGreaterThan(2);
      const shown = hrefsIn(show(e));
      for (const url of written) expect(shown).toContain(url);
      expect(shown.filter(h => !written.includes(h!) && h !== e.sourceUrl)).toEqual([]);
    });
  }
});

describe('ChatGPT citation markers', () => {
  const MARKED = CHALLENGE_DOC.replace(
    'nobody keeps an [inventory](https://example.com/inventory).',
    'nobody keeps an inventory【4:2†source】, as surveys show citeturn0search3 and citeturn1news2.',
  );

  it('finds the three forms ChatGPT writes', () => {
    expect(citationsIn('a【4:2†source】 b citeturn0search3turn1news2 c citeturn1news2 d')).toEqual([
      '【4:2†source】', 'citeturn0search3turn1news2', 'citeturn1news2',
    ]);
    expect(citationsIn('A plain sentence citing [a source](https://example.com).')).toEqual([]);
  });

  it('shows each as "source not linked", keeps the marker for whoever fixes it, and links nothing', () => {
    const e = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, MARKED);
    const c = show(e);
    const markers = [...c.querySelectorAll('.intel-cite')];
    expect(markers.map(m => m.textContent)).toEqual(['source not linked', 'source not linked', 'source not linked']);
    expect(markers[0].getAttribute('title')).toContain('【4:2†source】');
    expect(markers[1].getAttribute('title')).toContain('citeturn0search3');
    expect(c.textContent).toContain('nobody keeps an inventory');
    expect(c.textContent).toContain(', as surveys show');
    expect(c.textContent).not.toMatch(/citeturn|【/);
    expect(hrefsIn(c).filter(h => h !== e.sourceUrl)).toEqual([]);
  });

  it('are reported, as a problem that wants a look', () => {
    const e = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, createdTime: '2026-01-01T00:00:00Z' }, MARKED);
    const flags = conformanceOf([e], Date.parse('2026-11-03T12:00:00Z')).flags.get(e.driveFileId)!;
    expect(flags).toContainEqual({ kind: 'citations', count: 3 });
    expect(labelOf(flags)).toBe('Unlinked sources');
    expect(noticeOf({ kind: 'citations', count: 3 })).toContain('3 sources are cited with a ChatGPT marker instead of a link');
  });
});

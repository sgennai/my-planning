// Search across the archive: every word must be there, whatever its case or
// accents; the hit names the section the words are in and quotes them; and
// the filters (feed, recent days, topic) narrow it.
import { describe, it, expect } from 'vitest';
import { parseEdition } from './parse';
import { indexOf, search, topicsOf, queryWords, NO_FILTERS } from './search';
import { CHALLENGE_DOC, CHALLENGE_FILE, SALES_DOC, SALES_FILE, ENGAGEMENT_DOC, ENGAGEMENT_FILE } from './test-fixtures';

const challenge = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, CHALLENGE_DOC);
const sales = parseEdition('enterprise-ai-sales-brief', SALES_FILE, SALES_DOC);
const engagement = parseEdition('customer-engagement-brief', ENGAGEMENT_FILE, ENGAGEMENT_DOC);
const older = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, id: '1OlderChallenge00000000000', name: '2026-09-15_0812__enterprise-ai-challenge' },
  CHALLENGE_DOC.replace('2026-11-02', '2026-09-15').replace('2026-11-02T08:20:00', '2026-09-15T08:20:00').replace('Agent Sprawl: Who Owns the Bots?', 'Résumé of agent governance'));
const index = indexOf([challenge, sales, engagement, older]);
const TODAY = '2026-11-03';
const titles = (q: string, f = NO_FILTERS) => search(index, q, f, TODAY).map(h => h.edition.title);

describe('archive search', () => {
  it('finds every word, anywhere in the edition, newest first', () => {
    expect(titles('agent register')).toEqual(['Agent Sprawl: Who Owns the Bots?', 'Résumé of agent governance']);
    expect(titles('headless lock-in')).toEqual(['Connected Agents and Headless CDPs']);
    expect(titles('agent register unicorn')).toEqual([]);
  });

  it('ignores case and accents, both ways', () => {
    expect(titles('RESUME')).toEqual(['Résumé of agent governance']);
    expect(queryWords('Résumé, AGENTS!')).toEqual(['resume', 'agents']);
  });

  it('names the section holding the words and quotes them, marked', () => {
    const [hit] = search(index, 'licence costs', NO_FILTERS, TODAY).filter(h => h.edition === challenge);
    expect(hit.sectionTitle).toBe('Business impact');
    expect(hit.sectionId).toBe('business-impact');
    expect(hit.snippet!.text).toContain('Duplicated agents multiply licence costs.');
    const marked = hit.snippet!.marks.map(([a, b]) => hit.snippet!.text.slice(a, b));
    expect(marked).toEqual(['licence', 'costs']);
  });

  it('marks the words where they are, after a middle dot, a backtick or an accent', () => {
    const dotted = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, id: '1DottedChallenge0000000000' },
      CHALLENGE_DOC.replace('Agent Sprawl: Who Owns the Bots?', 'Agents · `Résumé` · licence costs'));
    const [hit] = search(indexOf([dotted]), 'costs', NO_FILTERS, TODAY);
    expect(hit.title.marks.map(([a, b]) => hit.title.text.slice(a, b))).toEqual(['costs']);
  });

  it('keeps what it read of an edition for the next search', () => {
    expect(indexOf([challenge])[0]).toBe(index[0]);
  });

  it('marks the words in the title too', () => {
    const [hit] = search(index, 'sprawl', NO_FILTERS, TODAY);
    expect(hit.title.marks.map(([a, b]) => hit.title.text.slice(a, b))).toEqual(['Sprawl']);
  });

  it('with no words, lists what the filters let through', () => {
    expect(titles('', { ...NO_FILTERS, feed: 'enterprise-ai-challenge' })).toEqual(['Agent Sprawl: Who Owns the Bots?', 'Résumé of agent governance']);
    expect(titles('', { ...NO_FILTERS, since: 'week' })).toEqual(['Outcome Pricing and Sovereign Capacity', 'Agent Sprawl: Who Owns the Bots?', 'Connected Agents and Headless CDPs']);
    expect(titles('', { ...NO_FILTERS, since: 'quarter' })).toHaveLength(4);
    expect(titles('', { ...NO_FILTERS, topic: 'headless cdp' })).toEqual(['Connected Agents and Headless CDPs']);
  });

  it('lists the topics in use, most frequent first', () => {
    expect(topicsOf([challenge, older, engagement]).slice(0, 2)).toEqual([
      { topic: 'Agentic AI', count: 3 }, { topic: 'Governance', count: 2 },
    ]);
  });
});

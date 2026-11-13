// The memo's arrangement of an AI Challenge (INT-50): the topic map moved to
// the end, the relevant topics under the title, the Challenge's opening
// sentence as the summary; dates in the edition's own Paris day; the edition
// index by month, searched (INT-53). Made-up editions.
import { describe, it, expect } from 'vitest';
import { memoOrder, memoTopics, challengeLead, memoDate, barDate, shortDate, indexGroups, monthKey, two } from './memo';
import { parseEdition, splitSections, type Edition } from './parse';
import { presentSection } from './present';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';

const edition = parseEdition('enterprise-ai-challenge', CHALLENGE_FILE, CHALLENGE_DOC);
const sections = splitSections(edition.markdownBody);
const presented = (s = sections[0]) => presentSection('enterprise-ai-challenge', s);

describe('an edition as a memo', () => {
  it('keeps every section in order, the topic map apart for the end', () => {
    const { body, map } = memoOrder(sections);
    expect(map?.title).toBe('Enterprise AI topic map');
    expect(body.map(s => s.title)).toEqual(['Challenge', 'Business impact', '3 approaches', 'What to listen for', 'Executive discovery questions', 'Executive Vocabulary — 3 Terms to Remember']);
    expect(memoOrder(body)).toEqual({ body, map: null });
  });

  it('takes the relevant topics from the document’s own line, else from its header', () => {
    expect(memoTopics(edition, presented())).toEqual({ label: 'Relevant to today\'s challenge', topics: ['Governance', 'Agentic AI', 'Operating models'] });
    expect(memoTopics({ topics: ['Data', 'Risk'] }, { kind: 'markdown', markdown: 'x' })).toEqual({ label: 'Topics', topics: ['Data', 'Risk'] });
    expect(memoTopics({ topics: [] }, undefined)).toBeNull();
  });

  it('splits the Challenge into its opening sentence and the rest, only when both are there', () => {
    const challenge = sections.find(s => s.title === 'Challenge')!;
    const split = challengeLead(challenge, presented(challenge));
    expect(split?.lead).toBe('Teams are deploying AI agents faster than anyone can list them.');
    expect(split?.rest).toContain('Each department builds its own **agents**');
    expect(challengeLead(challenge, { kind: 'lead', lead: 'Only a lead.', rest: '' })).toBeNull();
    expect(challengeLead(sections[2], presented(sections[2]))).toBeNull();
  });

  it('dates the memo by its own day, never by the device’s clock', () => {
    expect(memoDate('2026-11-11')).toBe('11 November 2026');
    expect(barDate('2026-11-11', '09:03')).toBe('Wed 11 Nov 2026 · 09:03');
    expect(barDate('2026-03-29', null)).toBe('Sun 29 Mar 2026');
    expect(shortDate('2026-11-11')).toBe('Wed 11 Nov');
    expect(two(3)).toBe('03');
  });
});

describe('the edition index', () => {
  const ed = (day: string, time: string, title: string) => ({ editionDate: day, time, title, driveFileId: day } as Edition);
  const all = [ed('2026-11-11', '09:03', 'Accountable decisions'), ed('2026-11-02', '08:20', 'Unit économics'), ed('2026-10-31', '08:16', 'Defensible decisions'), ed('2026-08-05', '14:12', 'Ownership')];

  it('groups the editions by month, newest first, as the feed keeps them; a month without one has no group', () => {
    expect(indexGroups(all, '').map(g => [g.key, g.month, g.editions.length])).toEqual([
      ['2026-11', 'November 2026', 2], ['2026-10', 'October 2026', 1], ['2026-08', 'August 2026', 1],
    ]);
  });

  it('a month is the edition’s own Paris day’s, never shifted by a time zone', () => {
    expect(monthKey('2026-11-01')).toBe('2026-11');
    expect(indexGroups([ed('2026-10-31', '23:50', 'Late'), ed('2026-11-01', '00:05', 'Early')], '').map(g => g.month)).toEqual(['October 2026', 'November 2026']);
  });

  it('finds by title, accents and case aside, or by date as written or said', () => {
    expect(indexGroups(all, 'ECONOMICS').flatMap(g => g.editions.map(e => e.title))).toEqual(['Unit économics']);
    expect(indexGroups(all, 'decisions').flatMap(g => g.editions.map(e => e.editionDate))).toEqual(['2026-11-11', '2026-10-31']);
    expect(indexGroups(all, 'deci').flatMap(g => g.key)).toEqual(['2026-11', '2026-10']);
    expect(indexGroups(all, '31 Oct')).toHaveLength(1);
    expect(indexGroups(all, '2 November 2026').flatMap(g => g.editions.map(e => e.title))).toEqual(['Unit économics']);
    expect(indexGroups(all, '2026-08')).toHaveLength(1);
    expect(indexGroups(all, '08:20')).toEqual([]);
    expect(indexGroups(all, 'nothing like this')).toEqual([]);
  });
});

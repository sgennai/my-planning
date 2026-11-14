import { describe, it, expect } from 'vitest';
import { noteKindOf, keptAsOf, placeOf, standingOf, notebookList, supportingOf, isQuotable, type NotebookQuery } from './notebook';
import { reviewIndex, withRating, withReviewing } from './review';
import { feedById, type FeedId } from './feeds';
import type { SavedInsight } from './saved';

const kept = (id: string, patch: Partial<SavedInsight> = {}): SavedInsight => ({
  id, type: 'intel-saved', kind: 'labelled', feedId: 'enterprise-ai-challenge', driveFileId: '1Doc',
  editionTitle: 'Lanterns at the Harbour', editionDate: '2026-11-11', editionTime: '08:20',
  sourceUrl: 'https://docs.google.com/document/d/1Doc/edit', sectionId: 'questions', sectionTitle: '2. Executive questions',
  label: 'Executive question', text: 'Which lantern would you light first?', note: '', tags: [], savedAt: '2026-11-11T09:00:00Z',
  ...patch,
});
const feedLabel = (id: FeedId) => feedById(id)!.label;
const TODAY = '2026-11-14';

const question = kept('is:q');
const line = kept('is:l', { label: 'Sentence to rehearse', text: 'Light the harbour before the boats ask.', savedAt: '2026-11-12T09:00:00Z' });
const term = kept('is:t', { kind: 'term', label: 'Tide window', text: 'The hour between two tides.', driveFileId: '1Other', editionTitle: 'Tides and Timetables', savedAt: '2026-11-10T09:00:00Z' });
const section = kept('is:s', { kind: 'section', label: null, text: '- One point.\n- Another.', sectionTitle: 'Business impact', driveFileId: '1Other', editionTitle: 'Tides and Timetables', savedAt: '2026-11-09T09:00:00Z' });
const edition = kept('is:e', { kind: 'edition', label: null, text: 'Lanterns at the Harbour', sectionId: null, sectionTitle: null, savedAt: '2026-11-08T09:00:00Z' });

describe('the executive notebook (INT-56)', () => {
  it('shows each kind kept as a Question or an Insight, saying exactly what it is', () => {
    expect([question, line, term, section, edition].map(noteKindOf)).toEqual(['question', 'insight', 'insight', 'insight', 'insight']);
    expect([question, line, term, section, edition].map(keptAsOf)).toEqual(['Executive question', 'Sentence to rehearse', 'Vocabulary', 'Section', 'Whole edition']);
    expect(placeOf(question)).toBe('Executive questions');
    expect(placeOf(edition)).toBeNull();
  });

  it('says where each stands in review, in words, from the review records', () => {
    const log = withReviewing(withRating([], line, 3, new Date('2026-11-12T10:00:00Z')), section, false);
    const reviews = reviewIndex(log);
    // The question, kept on the 11th, came due on the 12th; the line was rated (back on the 19th); the section is not in review.
    expect([question, line, term, section, edition].map(i => standingOf(i, reviews, TODAY))).toEqual(['due', 'reviewed', 'due', 'out', null]);
    expect(standingOf(kept('is:new', { savedAt: '2026-11-14T08:00:00Z' }), reviews, TODAY)).toBe('new');
  });

  it('lists by filter, tag and search, newest first, without changing anything', () => {
    const all = [line, question, term, section, edition];
    const reviews = reviewIndex([]);
    const topics = (i: SavedInsight) => (i.driveFileId === '1Other' ? ['Maritime safety'] : []);
    const list = (q: Partial<NotebookQuery>) => notebookList(all, { filter: 'all', query: '', tag: null, ...q }, reviews, TODAY, feedLabel, topics).map(i => i.id);
    expect(list({})).toEqual(['is:l', 'is:q', 'is:t', 'is:s', 'is:e']);
    expect(list({ filter: 'questions' })).toEqual(['is:q']);
    expect(list({ filter: 'insights' })).toEqual(['is:l', 'is:t', 'is:s', 'is:e']);
    expect(list({ filter: 'due' })).toEqual(['is:l', 'is:q', 'is:t']);
    // Case and accents aside, in the words, the feed and the edition's topics.
    expect(list({ query: 'LANTERN' })).toEqual(['is:l', 'is:q', 'is:e']);
    expect(list({ query: 'challenge window' })).toEqual(['is:t']);
    expect(list({ query: 'timetables' })).toEqual(['is:t', 'is:s']);
    expect(list({ query: 'maritime' })).toEqual(['is:t', 'is:s']);
    const tagged = [{ ...question, tags: ['Harbours'] }, line];
    expect(notebookList(tagged, { filter: 'all', query: '', tag: 'harbours' }, reviews, TODAY, feedLabel, topics).map(i => i.id)).toEqual(['is:q']);
    expect(all.map(i => i.text)).toEqual([line, question, term, section, edition].map(i => i.text));
  });

  it('offers as support only what shares a tag, the edition or a topic, saying which', () => {
    const topics = (i: SavedInsight) => (i.driveFileId === '1Doc' ? ['Maritime safety', 'Ports'] : i.driveFileId === '1Third' ? ['Maritime-safety'] : []);
    const tagged = kept('is:a', { kind: 'passage', label: null, text: 'Ports change slowly.', driveFileId: '1Far', tags: ['harbours'] });
    const sameEdition = kept('is:b', { kind: 'passage', label: null, text: 'Quiet before the tide.' });
    const sameTopic = kept('is:c', { kind: 'passage', label: null, text: 'Safety is a habit.', driveFileId: '1Third' });
    const unrelated = kept('is:d', { kind: 'passage', label: null, text: 'Something else.', driveFileId: '1Far' });
    const q = { ...question, tags: ['Harbours'] };
    expect(supportingOf(q, [q, unrelated, sameTopic, sameEdition, tagged], topics, 5)).toEqual([
      { item: tagged, why: 'Tagged Harbours' },
      { item: sameEdition, why: 'Same edition' },
      { item: sameTopic, why: 'Topic: Maritime safety' },
    ]);
    // Between equals, the other kind first: a question is backed by an insight.
    const otherQuestion = kept('is:q2', { text: 'Who keeps watch?', savedAt: '2026-11-13T09:00:00Z' });
    expect(supportingOf(question, [question, otherQuestion, sameEdition], topics).map(s => s.item.id)).toEqual(['is:b', 'is:q2']);
    expect(supportingOf(unrelated, [question, unrelated], () => [])).toEqual([]);
  });

  it('shows one short paragraph as a quotation, anything longer as text', () => {
    expect(isQuotable('Which lantern would you light first?')).toBe(true);
    expect(isQuotable('One.\n\nTwo.')).toBe(false);
    expect(isQuotable('- One point.\n- Another.')).toBe(false);
    expect(isQuotable('x'.repeat(321))).toBe(false);
  });
});

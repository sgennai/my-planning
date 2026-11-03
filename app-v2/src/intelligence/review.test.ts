// Takeaways back for review: which come back and when (the day after they
// are kept, then by the Practice section's intervals), in what order, what
// each card asks, and the synced record each leaves.
import { describe, it, expect } from 'vitest';
import type { SavedInsight } from './saved';
import {
  reviewIndex, statusOf, dueOf, dueOn, withRating, withReviewing, withoutReview, kindsOf, cueOf, whenText, dayText, reviewId,
  mergeReview, type ReviewRecord,
} from './review';
import { getNextPracticeDate } from '../practice/practice-logic';

const item = (id: string, kind: SavedInsight['kind'], savedAt: string, label: string | null = null): SavedInsight => ({
  id, type: 'intel-saved', kind, feedId: 'enterprise-ai-sales-brief', driveFileId: '1Doc0000000000000000000000',
  editionTitle: 'An edition', editionDate: '2026-11-01', editionTime: '09:30', sourceUrl: 'https://docs.google.com/document/d/x/edit',
  sectionId: 's', sectionTitle: 'A section', label, text: 'The words kept.', note: '', tags: [], savedAt,
});
const question = item('is:q', 'labelled', '2026-11-01T10:00:00Z', 'Executive question');
const line = item('is:l', 'labelled', '2026-11-01T11:00:00Z', 'LinkedIn angle');
const term = item('is:t', 'term', '2026-11-02T08:00:00Z', 'Shadow AI');
const passage = item('is:p', 'passage', '2026-10-30T08:00:00Z');
const section = item('is:s', 'section', '2026-10-30T08:00:00Z');
const edition = item('is:e', 'edition', '2026-10-30T08:00:00Z');
const all = [question, line, term, passage, section, edition];
const at = (iso: string) => new Date(iso);

describe('what comes back for review', () => {
  it('questions, lines, terms and passages, from the day after they are kept; sections only when added; editions never', () => {
    const none = reviewIndex([]);
    expect(statusOf(question, none)).toMatchObject({ on: true, due: '2026-11-02' });
    expect(statusOf(term, none)).toMatchObject({ on: true, due: '2026-11-03' });
    expect(statusOf(passage, none)).toMatchObject({ on: true, due: '2026-10-31' });
    expect(statusOf(section, none)).toMatchObject({ on: false, due: null });
    expect(statusOf(edition, none)).toMatchObject({ on: false, due: null });
    expect(dueOf(all, none, '2026-11-02').map(i => i.id)).toEqual(['is:p', 'is:q', 'is:l']);
    expect(dueOn(all, none, '2026-11-03')).toBe(1);
  });

  it('a rating sends it back after the Practice section’s interval, and the least known comes first', () => {
    const now = at('2026-11-02T18:30:00Z');
    let log = withRating([], question, 5, now);
    log = withRating(log, line, 1, now);
    const index = reviewIndex(log);
    expect(index.get('is:q')).toMatchObject({ on: true, due: '2026-12-02', confidence: 5, count: 1 });
    expect(index.get('is:l')).toMatchObject({ due: '2026-11-03', confidence: 1 });
    // The same day as the Practice section schedules it.
    expect(new Date(getNextPracticeDate(5, now)).toISOString().slice(0, 10)).toBe('2026-12-02');
    expect(dueOf(all, index, '2026-11-03').map(i => i.id)).toEqual(['is:p', 'is:t', 'is:l']);
    expect(withRating(log, line, 2, at('2026-11-03T08:00:00Z')).length).toBe(2);
    expect(reviewIndex(withRating(log, line, 2, at('2026-11-03T08:00:00Z'))).get('is:l')).toMatchObject({ count: 2, due: '2026-11-06' });
  });

  it('taken out, it stays out; added back, it returns the next day, keeping what it knew', () => {
    const out = withReviewing(withRating([], term, 4, at('2026-11-03T08:00:00Z')), term, false, at('2026-11-04T08:00:00Z'));
    expect(statusOf(term, reviewIndex(out))).toMatchObject({ on: false, due: null, confidence: 4 });
    const back = withReviewing(out, term, true, at('2026-11-05T08:00:00Z'));
    expect(statusOf(term, reviewIndex(back))).toMatchObject({ on: true, due: '2026-11-06', confidence: 4, count: 1 });
    const added = withReviewing([], section, true, at('2026-11-05T08:00:00Z'));
    expect(statusOf(section, reviewIndex(added))).toMatchObject({ on: true, due: '2026-11-06' });
  });

  it('one synced record per takeaway, gone with the takeaway', () => {
    const log = withRating(withRating([{ id: 'ir:x', type: 'intel-reading' }], question, 3), question, 4);
    expect(log.filter(r => (r as { id: string }).id === reviewId('is:q'))).toHaveLength(1);
    expect(withoutReview(log, 'is:q')).toEqual([{ id: 'ir:x', type: 'intel-reading' }]);
    expect(withoutReview(log, 'is:nothing')).toBe(log);
  });
});

describe('two devices\' copies of one review (D12)', () => {
  it('the later action stands, the count keeps the higher, in either order', () => {
    const recordOf = (log: unknown[]) => log.find(r => (r as { id: string }).id === reviewId('is:q')) as ReviewRecord;
    const base = withRating([], question, 2, at('2026-11-03T08:00:00Z'));
    const ipad = recordOf(withRating(withRating(base, question, 3, at('2026-11-04T08:00:00Z')), question, 4, at('2026-11-05T08:00:00Z')));
    const iphone = recordOf(withRating(base, question, 1, at('2026-11-06T08:00:00Z')));
    const merged = mergeReview(ipad, iphone);
    expect(mergeReview(iphone, ipad)).toEqual(merged);
    expect(merged.value).toMatchObject({ confidence: 1, due: '2026-11-07', count: 3 });
    const stopped = recordOf(withReviewing([iphone], question, false, at('2026-11-06T09:00:00Z')));
    expect(mergeReview(ipad, stopped).value).toMatchObject({ on: false, count: 3 });
  });
});

describe('what a card says', () => {
  it('asks to recall before showing', () => {
    expect(cueOf(question).prompt).toBe('What would you ask a customer about this?');
    expect(cueOf(term)).toEqual({ prompt: 'What does it mean?', reveal: 'Show the meaning' });
    expect(cueOf(item('is:r', 'labelled', '2026-11-01T00:00:00Z', 'How I can respond')).prompt).toBe('How would you respond?');
    expect(cueOf(line).prompt).toBe('How would you put it?');
    expect(cueOf(passage).prompt).toBe('What was the point?');
  });

  it('counts what is due in words, and says when a rating brings it back', () => {
    expect(kindsOf([question, line, term, item('is:t2', 'term', '2026-11-01T00:00:00Z', 'Control gap')])).toEqual(['1 question', '1 line to rehearse', '2 terms']);
    expect([1, 2, 3, 4, 5].map(whenText)).toEqual(['tomorrow', 'in 3 days', 'in a week', 'in 2 weeks', 'in a month']);
    expect(dayText('2026-11-03', '2026-11-02')).toBe('tomorrow');
    expect(dayText('2026-11-05', '2026-11-02')).toBe('Thu 5 Nov');
  });
});

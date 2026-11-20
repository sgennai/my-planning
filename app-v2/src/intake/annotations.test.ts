// Your highlights and notes as records (Phase 3), and what a highlight over others does. Made-up words.
import { describe, it, expect } from 'vitest';
import {
  annotationsOf, countsOf, isAnnotation, newArticleNote, newPassage, planHighlight, summaryOf, withAnnotation, withJoin,
  withNote, withoutAnnotation, withTakeaway, type Annotation, type Placed,
} from './annotations';
import type { PassageAnchor } from './anchor';
import { saveArticleInsight, savedOf, takeawayOf, isFromArticle, originOf, removeInsight } from '../intelligence/saved';

const anchor = (start: number, quote: string): PassageAnchor => ({
  quote, prefix: '', suffix: '', start, end: start + quote.length, startBlock: null, endBlock: null, textLength: 1000, textHash: 'h',
});
const at = new Date('2026-11-19T10:00:00Z');
const later = new Date('2026-11-19T11:00:00Z');

describe('the records', () => {
  it('are one per highlight or note, of their own type, in content beside the rest', () => {
    const takeaway = { id: 'is:1', type: 'intel-saved', kind: 'passage', text: 'x' };
    const a = newPassage(1, anchor(10, 'kept words'), '', at);
    const n = newArticleNote(1, '  My thought.  ', at);
    const content = withAnnotation(withAnnotation([takeaway], a), n);
    expect(a.id).toMatch(/^ih:/);
    expect(n.id).toMatch(/^in:/);
    expect(n.note).toBe('My thought.');
    expect(content).toHaveLength(3);
    expect(isAnnotation(takeaway)).toBe(false);
    expect(annotationsOf(content, 1).map(x => x.id)).toEqual([n.id, a.id]);
    expect(annotationsOf(content, 2)).toEqual([]);
  });

  it("lists an article's notes first, then its passages in the article's order", () => {
    const late = newPassage(7, anchor(500, 'later words'), '', at);
    const early = newPassage(7, anchor(20, 'earlier words'), '', later);
    const note = newArticleNote(7, 'On the whole.', later);
    expect(annotationsOf([late, early, note], 7).map(x => x.id)).toEqual([note.id, early.id, late.id]);
  });

  it('ignore a removed record (its tombstone) and anything malformed', () => {
    expect(isAnnotation({ id: 'ih:1', _deleted: true })).toBe(false);
    expect(isAnnotation({ id: 'ih:2', type: 'intake-annotation', kind: 'passage', bookmarkId: 1, anchor: null })).toBe(false);
  });

  it('a note written, changed and emptied, and unchanged words writing nothing', () => {
    const a = newPassage(1, anchor(0, 'words'), '', at);
    let c = withAnnotation([], a);
    c = withNote(c, a.id, 'First thought.', later);
    expect((c[0] as Annotation).note).toBe('First thought.');
    expect((c[0] as Annotation).editedAt).toBe(later.toISOString());
    expect(withNote(c, a.id, ' First thought. ', new Date())).toEqual(c);
    expect((withNote(c, a.id, '', later)[0] as Annotation).note).toBe('');
  });

  it('removing one removes only it', () => {
    const a = newPassage(1, anchor(0, 'one'), '', at);
    const b = newPassage(1, anchor(10, 'two'), '', at);
    expect(annotationsOf(withoutAnnotation([a, b], a.id), 1).map(x => x.id)).toEqual([b.id]);
  });
});

describe('highlighting where highlights are', () => {
  const placed = (a: Annotation): Placed => ({ a, start: a.anchor!.start, end: a.anchor!.end });
  const one = newPassage(1, anchor(10, 'abcdefghij'), 'first note', at);   // 10–20
  const two = newPassage(1, anchor(30, 'klmnopqrst'), 'second note', at);  // 30–40

  it('inside a highlight (or the same words again): that highlight, nothing new', () => {
    expect(planHighlight([placed(one)], 12, 18)).toEqual({ kind: 'existing', a: one });
    expect(planHighlight([placed(one)], 10, 20)).toEqual({ kind: 'existing', a: one });
  });

  it('touching none: a new one', () => {
    expect(planHighlight([placed(one), placed(two)], 21, 29)).toEqual({ kind: 'new', start: 21, end: 29 });
  });

  it('over two: one highlight over both, in the first one’s record, both notes kept in order, the other gone', () => {
    const p = planHighlight([placed(two), placed(one)], 15, 35);
    expect(p).toMatchObject({ kind: 'join', keep: one, absorb: [two], start: 10, end: 40 });
    if (p.kind !== 'join') return;
    const withTk = withTakeaway([one, two], two.id, 'is:9');
    const { content, a } = withJoin(withTk, { ...p, absorb: [(withTk[1] as Annotation)] }, anchor(10, 'x'.repeat(30)), later);
    expect(a.id).toBe(one.id);
    expect(a.note).toBe('first note\n\nsecond note');
    expect(a.takeawayId).toBe('is:9');
    expect(annotationsOf(content, 1).map(x => x.id)).toEqual([one.id]);
  });

  it('partly over one: that one grows to cover both', () => {
    expect(planHighlight([placed(one)], 5, 15)).toMatchObject({ kind: 'join', keep: one, absorb: [], start: 5, end: 20 });
  });

  it('done twice: the second time finds the highlight the first made', () => {
    const made = newPassage(1, anchor(50, 'twice over'), '', at);
    expect(planHighlight([placed(made)], 50, 60)).toEqual({ kind: 'existing', a: made });
  });
});

describe('what the panel says', () => {
  it('counts highlights, notes and takeaways, leaving out what there is none of', () => {
    const a = newPassage(1, anchor(0, 'one'), 'noted', at);
    const b = { ...newPassage(1, anchor(10, 'two'), '', at), takeawayId: 'is:1' };
    const n = newArticleNote(1, 'whole', at);
    const c = countsOf([a, b, n], x => x.takeawayId === 'is:1');
    expect(c).toEqual({ highlights: 2, notes: 2, takeaways: 1 });
    expect(summaryOf(c)).toBe('2 highlights · 2 notes · 1 in Takeaways');
    expect(summaryOf({ highlights: 1, notes: 0, takeaways: 0 })).toBe('1 highlight');
    expect(summaryOf({ highlights: 0, notes: 0, takeaways: 0 })).toBeNull();
  });
});

describe('a takeaway from an article (Takeaways, Phase 3B)', () => {
  const article = {
    bookmarkId: 42, url: 'https://example.com/a', title: 'A made-up article', publication: 'example.com', author: 'A. Writer',
    published: '2026-06-02',
  };

  it('keeps the exact words, the article, its source, author and date, and the way back', () => {
    const a = newPassage(42, anchor(5, 'Exact words, as kept.'), '', at);
    const { content, id } = saveArticleInsight([a], {
      ...article, kind: 'passage', text: 'Exact words, as kept.', note: ' Why it matters. ', sectionTitle: 'A heading', annotationId: a.id, anchor: a.anchor,
    }, at);
    const [t] = savedOf(content);
    expect(t.id).toBe(id);
    expect(t).toMatchObject({
      type: 'intel-saved', kind: 'passage', text: 'Exact words, as kept.', note: 'Why it matters.', editionTitle: 'A made-up article',
      editionDate: '2026-06-02', sourceUrl: 'https://example.com/a', sectionTitle: 'A heading', driveFileId: 'ia:42',
    });
    expect(t.source).toMatchObject({ kind: 'intake-article', bookmarkId: 42, url: 'https://example.com/a', publication: 'example.com', author: 'A. Writer', published: '2026-06-02', annotationId: a.id });
    expect(t.source!.anchor!.quote).toBe('Exact words, as kept.');
    expect(isFromArticle(t)).toBe(true);
    expect(originOf(t)).toBe('Intake · Article');
  });

  it('a note on the whole article saves the article itself, with the note; an undated one is dated today', () => {
    const n = newArticleNote(42, 'My view of it.', at);
    const { content } = saveArticleInsight([n], { ...article, published: null, kind: 'edition', text: '', note: n.note, sectionTitle: null, annotationId: n.id, anchor: null }, at);
    expect(savedOf(content)[0]).toMatchObject({ kind: 'edition', text: 'A made-up article', note: 'My view of it.', editionDate: '2026-11-19' });
  });

  it('is found from its highlight, and each lives on its own', () => {
    const a = newPassage(42, anchor(5, 'Words.'), '', at);
    const out = saveArticleInsight([a], { ...article, kind: 'passage', text: 'Words.', note: '', sectionTitle: null, annotationId: a.id, anchor: a.anchor }, at);
    const linked = withTakeaway(out.content, a.id, out.id);
    expect(takeawayOf(savedOf(linked), a.id, out.id)?.id).toBe(out.id);
    // The highlight removed: the takeaway stays.
    expect(savedOf(withoutAnnotation(linked, a.id))).toHaveLength(1);
    // The takeaway removed: the highlight stays, and no longer counts as in Takeaways.
    const left = removeInsight(linked, out.id);
    expect(annotationsOf(left, 42)).toHaveLength(1);
    expect(takeawayOf(savedOf(left), a.id, out.id)).toBeUndefined();
  });

  it("never takes a briefing's takeaway for an article's", () => {
    const briefing = { id: 'is:b', type: 'intel-saved', kind: 'passage', text: 'x', savedAt: '2026-11-01T00:00:00Z', tags: [], note: '' };
    expect(takeawayOf(savedOf([briefing]), 'ih:x', 'is:b')).toBeUndefined();
  });
});

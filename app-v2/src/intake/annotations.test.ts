// Your highlights and notes as records (Phase 3), and what a highlight over others does: it keeps its own record. Made-up words.
import { describe, it, expect } from 'vitest';
import {
  annotationsOf, countsOf, isAnnotation, isAnnotationId, newArticleNote, newPassage, planHighlight, summaryOf, withAnnotation,
  withNote, withoutAnnotation, withTakeaway, type Annotation, type Placed,
} from './annotations';
import type { PassageAnchor } from './anchor';
import { saveArticleInsight, savedOf, sourceDateOf, takeawayOf, isFromArticle, originOf, removeInsight, type SavedInsight } from '../intelligence/saved';

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

  it('over two: a new highlight of its own; the two stay as they were', () => {
    expect(planHighlight([placed(two), placed(one)], 15, 35)).toEqual({ kind: 'new', start: 15, end: 35 });
  });

  it('partly over one: a new one; that one stays', () => {
    expect(planHighlight([placed(one)], 5, 15)).toEqual({ kind: 'new', start: 5, end: 15 });
  });

  it('two overlapping highlights, each with its own note and takeaway, and a third over both: three records, nothing joined or lost', () => {
    const save = (c: unknown[], a: Annotation, note: string) => {
      const out = saveArticleInsight(c, { bookmarkId: 1, url: null, title: 'A made-up article', publication: null, author: null, published: null, kind: 'passage', text: a.anchor!.quote, note, sectionTitle: null, annotationId: a.id, anchor: a.anchor }, at);
      return withTakeaway(out.content, a.id, out.id);
    };
    const first = newPassage(1, anchor(10, 'x'.repeat(20)), 'my first note', at);   // 10–30
    const second = newPassage(1, anchor(20, 'y'.repeat(20)), 'my second note', at); // 20–40, over the first's end
    let content: unknown[] = save(save(withAnnotation(withAnnotation([], first), second), first, 'first insight'), second, 'second insight');
    const now = annotationsOf(content, 1);
    expect(planHighlight(now.map(placed), 5, 45)).toEqual({ kind: 'new', start: 5, end: 45 });
    const third = newPassage(1, anchor(5, 'z'.repeat(40)), '', later);
    content = withAnnotation(content, third);
    const all = annotationsOf(content, 1);
    expect(all.map(a => a.id)).toEqual([third.id, first.id, second.id]);
    expect(all.find(a => a.id === first.id)).toMatchObject({ note: 'my first note' });
    expect(all.find(a => a.id === second.id)).toMatchObject({ note: 'my second note' });
    const saved = savedOf(content);
    for (const [a, insight] of [[first, 'first insight'], [second, 'second insight']] as const) {
      const own = all.find(x => x.id === a.id)!;
      const t = takeawayOf(saved, own.id, own.takeawayId);
      expect(t).toMatchObject({ note: insight, text: a.anchor!.quote, source: { annotationId: a.id } });
    }
    expect(takeawayOf(saved, third.id, third.takeawayId)).toBeUndefined();
    expect(countsOf(all, a => !!takeawayOf(saved, a.id, a.takeawayId))).toEqual({ highlights: 3, notes: 2, takeaways: 2 });
  });

  it('done twice: the second time finds the highlight the first made', () => {
    const made = newPassage(1, anchor(50, 'twice over'), '', at);
    expect(planHighlight([placed(made)], 50, 60)).toEqual({ kind: 'existing', a: made });
  });
});

describe('their ids', () => {
  it('a highlight and a note are told from every other record by their prefix', () => {
    expect(isAnnotationId(newPassage(1, anchor(0, 'a'), '', at).id)).toBe(true);
    expect(isAnnotationId(newArticleNote(1, 'n', at).id)).toBe(true);
    for (const other of ['is:1', 'mk:main', 'km:main:is:1', 'kr:main:is:1', 'ar:1', 'ac:1', 'rc:x:2026-11-19', 'ir:doc']) expect(isAnnotationId(other)).toBe(false);
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
      editionDate: '2026-11-19', savedAt: at.toISOString(), sourceUrl: 'https://example.com/a', sectionTitle: 'A heading', driveFileId: 'ia:42',
    });
    expect(t.source).toMatchObject({ kind: 'intake-article', bookmarkId: 42, url: 'https://example.com/a', publication: 'example.com', author: 'A. Writer', published: '2026-06-02', annotationId: a.id });
    expect(t.source!.anchor!.quote).toBe('Exact words, as kept.');
    expect(isFromArticle(t)).toBe(true);
    expect(originOf(t)).toBe('Intake · Article');
  });

  it('is dated when it was kept, never by the article: an article from 2019 kept today is today’s takeaway, its publication kept apart', () => {
    const a = newPassage(42, anchor(5, 'Old words.'), '', at);
    const { content } = saveArticleInsight([a], { ...article, published: '2019-03-12', kind: 'passage', text: 'Old words.', note: '', sectionTitle: null, annotationId: a.id, anchor: a.anchor }, at);
    const [t] = savedOf(content);
    expect(t.savedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(t.editionDate).toBe('2026-11-19');
    expect(t.source!.published).toBe('2019-03-12');
    expect(sourceDateOf(t)).toBe('2019-03-12');
    // Listed by when kept, among takeaways from briefings.
    const older = { ...t, id: 'is:older', savedAt: '2026-11-18T09:00:00.000Z', source: undefined, feedId: 'enterprise-ai-challenge' as SavedInsight['feedId'], editionDate: '2026-11-18' };
    expect(savedOf([older, ...content]).map(x => x.id)).toEqual([t.id, 'is:older']);
    expect(sourceDateOf(older)).toBe('2026-11-18');
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

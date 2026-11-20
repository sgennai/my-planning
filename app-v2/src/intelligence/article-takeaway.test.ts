// Takeaways kept from an Intake article (Intake 2.0, D7): named as Intake's, linked to the article, found
// by its source; a briefing's takeaway reads exactly as before.
import { describe, it, expect } from 'vitest';
import { originOf, originalOf, isFromArticle, isLiteral, nameOf, searchSaved, sourceDateOf, type SavedInsight } from './saved';
import { takeawaysMarkdown } from './export';
import { kitText, wordingOf, ROLES } from './kit';
import { listTextOf, wordsOf } from './notebook';

const briefing: SavedInsight = {
  id: 'is:1', type: 'intel-saved', kind: 'passage', feedId: 'enterprise-ai-challenge', driveFileId: 'doc-1',
  editionTitle: 'An edition', editionDate: '2026-11-14', editionTime: '08:42', sourceUrl: 'https://docs.google.com/document/d/doc-1',
  sectionId: null, sectionTitle: null, label: null, text: 'Made-up words from a briefing.', note: '', tags: [], savedAt: '2026-11-14T09:00:00.000Z',
};
const article: SavedInsight = {
  ...briefing, id: 'is:2', feedId: 'intake' as SavedInsight['feedId'], driveFileId: 'ia:1234567890', sourceUrl: '',
  editionTitle: 'An article', text: 'Made-up words from an article.',
  source: { kind: 'intake-article', bookmarkId: 1234567890, url: 'https://example.com/story', title: 'An article', publication: 'example.com', author: 'A. Writer' },
};

describe('where a takeaway comes from', () => {
  it('names a briefing by its feed and links its Google Doc, as before', () => {
    expect(isFromArticle(briefing)).toBe(false);
    expect(originOf(briefing)).toBe('AI Challenge');
    expect(originalOf(briefing)).toEqual({ url: 'https://docs.google.com/document/d/doc-1', label: 'Original in Google Docs' });
  });

  it("names an article as Intake's and links the article", () => {
    expect(isFromArticle(article)).toBe(true);
    expect(originOf(article)).toBe('Intake · Article');
    expect(originalOf(article)).toEqual({ url: 'https://example.com/story', label: 'Original article' });
  });

  it('finds an article takeaway by its source and author', () => {
    const label = (id: string) => id;
    expect(searchSaved([briefing, article], 'example.com', null, label as never).map(s => s.id)).toEqual(['is:2']);
    expect(searchSaved([briefing, article], 'writer intake', null, label as never).map(s => s.id)).toEqual(['is:2']);
  });

  it('exports each with its own origin and original', () => {
    const text = takeawaysMarkdown([briefing, article], { now: new Date('2026-11-17T08:00:00Z') });
    expect(text).toContain('AI Challenge');
    expect(text).toContain('[Open the original in Google Docs](https://docs.google.com/document/d/doc-1)');
    expect(text).toContain('Intake · Article');
    expect(text).toContain('[Open the original article](https://example.com/story)');
  });
});

describe("an article's words are kept exactly: never read as Markdown (Phase 3 review)", () => {
  const tricky = '*Not emphasis* and **not bold**, `not code` ~~nor this~~\n\n1. Not a list\n- nor this\n# Nor a heading [nor a link](x) <b>nor HTML</b>';
  const quote: SavedInsight = { ...article, id: 'is:3', text: tricky, editionDate: '2026-11-20', savedAt: '2026-11-20T09:00:00.000Z',
    source: { ...article.source!, published: '2019-03-12' } };
  const md: SavedInsight = { ...briefing, id: 'is:4', text: '**Bold** in a briefing, as its Markdown.' };

  it('is told apart from a briefing’s Markdown', () => {
    expect(isLiteral(quote)).toBe(true);
    expect(isLiteral(md)).toBe(false);
    expect(isLiteral({ ...quote, kind: 'edition' })).toBe(false);
  });

  it('lists, names and copies every character as kept', () => {
    const flat = tricky.replace(/\s+/g, ' ');
    expect(listTextOf(quote)).toBe(flat);
    expect(nameOf(quote)).toBe(`${flat.slice(0, 57).trimEnd()}…`);
    expect(wordsOf(quote).startsWith('*Not emphasis* and **not bold**')).toBe(true);
    expect(wordingOf(quote)).toBe(tricky);
  });

  it('a briefing’s Markdown reads as before', () => {
    expect(listTextOf(md)).toBe('Bold in a briefing, as its Markdown.');
    expect(wordingOf(md)).toBe('Bold in a briefing, as its Markdown.');
    expect(nameOf(md)).toBe('Bold in a briefing, as its Markdown.');
  });

  it('exports with its Markdown characters escaped, so the file reads as the article did; a briefing’s as before', () => {
    const text = takeawaysMarkdown([quote, md], { now: new Date('2026-11-20T10:00:00Z') });
    expect(text).toContain('> \\*Not emphasis\\* and \\*\\*not bold\\*\\*, \\`not code\\` \\~\\~nor this\\~\\~');
    expect(text).toContain('> 1\\. Not a list');
    expect(text).toContain('> \\- nor this');
    expect(text).toContain('> \\# Nor a heading \\[nor a link\\](x) \\<b\\>nor HTML\\</b\\>');
    expect(text).toContain('> **Bold** in a briefing, as its Markdown.');
  });

  it('names the article’s publication as its source’s date, and the day it was kept apart', () => {
    expect(sourceDateOf(quote)).toBe('2019-03-12');
    expect(sourceDateOf(md)).toBe('2026-11-14');
    const text = takeawaysMarkdown([quote, md], { now: new Date('2026-11-20T10:00:00Z') });
    expect(text).toContain('*Intake · Article · published Tue 12 Mar 2019 · An article*');
    expect(text).toContain('kept on Fri 20 Nov 2026');
    expect(text).toContain('*AI Challenge · Sat 14 Nov 2026, 08:42 · An edition*');
    const undated = takeawaysMarkdown([{ ...quote, source: { ...quote.source!, published: null } }], { now: new Date('2026-11-20T10:00:00Z') });
    expect(undated).toContain('*Intake · Article · An article*');
  });

  it('in the meeting kit: the exact words, the article with its publication; a briefing as before', () => {
    const text = kitText([{ role: ROLES[0], items: [quote, md] }], 'Meeting');
    expect(text).toContain('*Not emphasis* and **not bold**');
    expect(text).toContain('Intake · Article, published Tue 12 Mar 2019');
    expect(text).toContain('AI Challenge, Sat 14 Nov 2026');
  });
});

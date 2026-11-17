// Takeaways kept from an Intake article (Intake 2.0, D7): named as Intake's, linked to the article, found
// by its source; a briefing's takeaway reads exactly as before.
import { describe, it, expect } from 'vitest';
import { originOf, originalOf, isFromArticle, searchSaved, type SavedInsight } from './saved';
import { takeawaysMarkdown } from './export';

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

// @vitest-environment jsdom
// Takeaways as a Markdown file: every kind of item with where it came from,
// the words exactly as kept (quotes, accents, links), note and tags; the list's
// order; and the file handed over through the share sheet on a touch device,
// downloaded elsewhere.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SavedInsight } from './saved';
import { takeawaysMarkdown, exportFileName, handOver } from './export';

const kept = (over: Partial<SavedInsight>): SavedInsight => ({
  id: 'is:x', type: 'intel-saved', kind: 'labelled', feedId: 'enterprise-ai-sales-brief', driveFileId: '1Doc',
  editionTitle: 'Frontier AI: Capital & Resilience', editionDate: '2026-11-02', editionTime: '09:29',
  sourceUrl: 'https://docs.google.com/document/d/1Doc/edit', sectionId: 's', sectionTitle: 'Capital availability — what it means',
  label: 'Executive question', text: '“Which processes would be difficult to move?”', note: '', tags: [], savedAt: '2026-11-02T10:00:00Z',
  ...over,
});
const NOW = new Date('2026-11-03T13:05:00Z');

describe('the Markdown export', () => {
  const question = kept({ note: 'For the CIO meeting.\nAsk early.', tags: ['banking', 'cio'] });
  const term = kept({ id: 'is:t', kind: 'term', feedId: 'enterprise-ai-challenge', label: 'Shadow AI', text: 'AI used **without** approval.', sectionTitle: 'Executive Vocabulary — 3 Terms' });
  const section = kept({ id: 'is:s', kind: 'section', label: null, sectionTitle: 'What I should remember today', text: '- Capital is a constraint.\n- See [Reuters](https://www.reuters.com/a?b=1&c=2).\n\n## Not a heading of the file' });
  const passage = kept({ id: 'is:p', kind: 'passage', label: null, text: 'Résumé of the “control gap”.' });
  const edition = kept({ id: 'is:e', kind: 'edition', label: null, sectionTitle: null, text: 'Frontier AI: Capital & Resilience' });
  const md = takeawaysMarkdown([question, term, section, passage, edition], { now: NOW, narrowedBy: null });

  it('opens with what it is, when, and how many, newest first as listed', () => {
    expect(md.startsWith('# Takeaways\n\nExported from My Planning · Intelligence on Tuesday 3 November 2026 at 14:05 (Paris time). 5 takeaways, newest first.')).toBe(true);
    const headings = md.split('\n').filter(l => l.startsWith('## '));
    expect(headings).toEqual(['## Executive question', '## Vocabulary · Shadow AI', '## Section · What I should remember today', '## Passage', '## Edition · Frontier AI: Capital & Resilience']);
  });

  it('says where each came from, with the original’s link', () => {
    expect(md).toContain('*Enterprise AI · Mon 2 Nov 2026, 09:29 · Frontier AI: Capital & Resilience · Capital availability*');
    expect(md).toContain('[Open the original in Google Docs](https://docs.google.com/document/d/1Doc/edit) · kept on Mon 2 Nov 2026');
  });

  it('keeps the words exactly, quoted line by line, so their own Markdown cannot break the file', () => {
    expect(md).toContain('> “Which processes would be difficult to move?”');
    expect(md).toContain('> AI used **without** approval.');
    expect(md).toContain('> - See [Reuters](https://www.reuters.com/a?b=1&c=2).\n>\n> ## Not a heading of the file');
    expect(md).toContain('> Résumé of the “control gap”.');
    expect(takeawaysMarkdown([kept({ text: 'One.\n\n\n  \nTwo.' })], { now: NOW })).toContain('> One.\n>\n> Two.');
  });

  it('adds the note and tags', () => {
    expect(md).toContain('**Note:** For the CIO meeting.  \nAsk early.');
    expect(md).toContain('**Tags:** banking, cio');
  });

  it('an edition is its title and link only; a narrowed list says so', () => {
    const one = takeawaysMarkdown([edition], { now: NOW, narrowedBy: 'tagged banking' });
    expect(one).toContain('1 takeaway, newest first, only those tagged banking.');
    expect(one).not.toContain('> ');
    expect(exportFileName(NOW)).toBe('takeaways-2026-11-03.md');
  });

  it('takes Markdown characters in a title literally', () => {
    expect(takeawaysMarkdown([kept({ label: 'Q*1* [draft]' })], { now: NOW })).toContain('## Q\\*1\\* \\[draft\\]');
  });
});

describe('handing the file over', () => {
  afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true }); });

  it('on an iPad or iPhone, through the share sheet', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    expect(await handOver('takeaways-2026-11-03.md', 'text')).toBe(true);
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0].name).toBe('takeaways-2026-11-03.md');
    expect(await files[0].text()).toBe('text');
  });

  it('a dismissed share sheet is no export', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    Object.assign(navigator, { share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }, canShare: () => true });
    expect(await handOver('t.md', 'text')).toBe(false);
  });

  it('on a Mac, a download', async () => {
    const created = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('takeaways-2026-11-03.md');
      expect(this.href).toBe('blob:x');
    });
    expect(await handOver('takeaways-2026-11-03.md', 'text')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});

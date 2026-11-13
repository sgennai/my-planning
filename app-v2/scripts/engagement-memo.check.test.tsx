// @vitest-environment jsdom
// The Customer Engagement memo against the real archive (INT-52), run by hand, never in the normal suite:
//
//   ENGAGEMENT_DRIVE=<folder of the Customer Engagement Brief's Drive docs as JSON, from /api/intel/docs/<id>>
//   ENGAGEMENT_SOURCE=<optional: an edition's original Markdown, checked against its Drive copy on screen>
//   npx vitest run scripts/engagement-memo.check
//
// Every Customer Engagement edition is drawn as the memo, its folds open, and
// must show every word of its document and every link exactly as written,
// nothing of its header, no empty chapter, and a Save on every question it
// asks. With ENGAGEMENT_SOURCE, the edition of the same date must also show
// every word and link of that original. Prints one line per edition (its
// layout as the memo read it); nothing is sent anywhere, and the real texts
// stay outside the repository.
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseEdition, splitSections } from '../src/intelligence/parse';
import { EditionReader } from '../src/intelligence/EditionReader';
import { engagementMemo, questionsOf } from '../src/intelligence/engagement-memo';
import { linksOf, wordsOf } from '../src/intelligence/test-fixtures';

const { ENGAGEMENT_DRIVE, ENGAGEMENT_SOURCE } = process.env;

const draw = (e: ReturnType<typeof parseEdition>) => {
  const { container } = render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} />);
  for (const fold of container.querySelectorAll('details')) fold.setAttribute('open', '');
  return container;
};
const hrefsIn = (c: HTMLElement) => [...c.querySelectorAll('article a[href]:not([href^="#"])')].map(a => a.getAttribute('href')!);
/** The questions a memo asks: each development's, and each customer question. */
const asked = (memo: ReturnType<typeof engagementMemo>) =>
  memo.chapters.flatMap(c => (c.fields ?? []).filter(f => f.tone === 'question' && f.label && f.markdown)).length
  + memo.rows.flatMap(s => questionsOf(s) ?? []).length;

describe.skipIf(!ENGAGEMENT_DRIVE)('the Customer Engagement memo on the real archive', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollTo = function scrollTo() {};
  const docs = ENGAGEMENT_DRIVE ? readdirSync(ENGAGEMENT_DRIVE).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(ENGAGEMENT_DRIVE, f), 'utf8')))
    .filter(d => d.feedId === 'customer-engagement-brief')
    .sort((a, b) => (a.file.name < b.file.name ? -1 : 1)) : [];

  it('shows every word and link of every Customer Engagement edition, and a Save on every question', () => {
    const lines: string[] = [];
    for (const d of docs) {
      const e = parseEdition('customer-engagement-brief', d.file, d.text);
      const container = draw(e);
      const shown = container.textContent ?? '';
      const lost = wordsOf(e.markdownBody).filter(w => !shown.includes(w));
      expect(lost, `${e.fileName}: words not on screen`).toEqual([]);
      expect(shown, e.fileName).not.toMatch(/schema_version|source_message|generated_at|time_note|content_type/);
      const hrefs = hrefsIn(container);
      const written = linksOf(e.markdownBody);
      expect(written.filter(u => !hrefs.includes(u)), `${e.fileName}: links not on screen`).toEqual([]);
      expect(hrefs.filter(h => !written.includes(h) && h !== e.sourceUrl), `${e.fileName}: links added`).toEqual([]);
      const memo = engagementMemo(splitSections(e.markdownBody));
      const devs = [...container.querySelectorAll('.memo-dev')];
      expect(devs.length, e.fileName).toBe(memo.chapters.length);
      expect(devs.filter(c => !c.querySelector('.memo-fields, .memo-dev-text')?.textContent?.trim()), `${e.fileName}: an empty chapter`).toEqual([]);
      const saves = container.querySelectorAll('.memo-question .memo-save').length;
      expect(saves, `${e.fileName}: a question without Save`).toBe(asked(memo));
      const fielded = memo.chapters.filter(c => c.fields).length;
      const labels = new Set(memo.chapters.flatMap(c => (c.fields ?? []).map(f => f.label).filter(Boolean)));
      lines.push([
        e.fileName.slice(0, 15),
        `${String(wordsOf(e.markdownBody).length).padStart(4)} words`,
        `${String(written.length).padStart(2)} links`,
        `${memo.chapters.length} dev (${fielded} in fields, ${labels.size} labels)`,
        `take ${memo.take ? '✓' : '·'} coverage ${memo.coverage ? '✓' : '·'} lead ${memo.lead ? '✓' : '·'}`,
        `essentials ${memo.essentials ? '✓' : '·'} rows ${memo.rows.length} saves ${saves}`,
        `heading ${memo.heading ? '✓' : '·'} parts ${memo.flow.filter(f => f.kind === 'part' && (f.title || f.markdown)).length} topics ${e.topics.length}`,
      ].join(' · '));
      cleanup();
    }
    process.stdout.write(`${lines.join('\n')}\n${docs.length} editions, every word and link on screen.\n`);
  });

  it.skipIf(!ENGAGEMENT_SOURCE)('shows every word and link of the original briefing', () => {
    const source = readFileSync(ENGAGEMENT_SOURCE!, 'utf8');
    const day = /^edition_date:\s*"?([\d-]+)"?/m.exec(source)?.[1];
    const d = docs.find(x => new RegExp(`^edition_date:\\s*"?${day}"?`, 'm').test(x.text));
    expect(d, `no Drive edition of ${day}`).toBeTruthy();
    const e = parseEdition('customer-engagement-brief', d.file, d.text);
    const container = draw(e);
    const shown = container.textContent ?? '';
    const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
    expect(wordsOf(body).filter(w => !shown.includes(w)), 'words of the original not on screen').toEqual([]);
    const hrefs = hrefsIn(container);
    expect(linksOf(body).filter(u => !hrefs.includes(u)), 'links of the original not on screen').toEqual([]);
    const memo = engagementMemo(splitSections(e.markdownBody));
    process.stdout.write([
      `${e.fileName}: "${e.title}"`,
      `bar: ${container.querySelector('.memo-bar-date')?.textContent}`,
      `subline: ${container.querySelector('.memo-subline')?.textContent}`,
      `coverage: ${container.querySelector('.memo-coverage')?.textContent}`,
      `topics: ${e.topics.join(', ')} (${container.querySelectorAll('.memo-topics-list b').length} shown, then "${container.querySelector('.memo-more-topics')?.textContent}")`,
      `take: ${container.querySelectorAll('.memo-take-text li').length} points, ${container.querySelectorAll('.memo-take-text > p').length} paragraphs`,
      `contents: ${[...container.querySelectorAll('.memo-toc-list li')].map(l => l.textContent).join(' | ')}`,
      `${memo.chapters.length} developments: ${memo.chapters.map(c => c.title).join(' | ')}`,
      `fields: ${memo.chapters.map(c => (c.fields ?? []).map(f => f.label).join(', ')).join(' | ')}`,
      `closing: ${[memo.essentials, ...memo.rows].map(s => s?.title).join(' | ')}`,
      `talking points: ${container.querySelector('.memo-summary--end .memo-summary-label')?.textContent} (${container.querySelectorAll('.memo-summary--end li').length})`,
      `watchlist: ${container.querySelectorAll('.memo-watchlist li').length} entries`,
      `saves: ${[...container.querySelectorAll('.memo-question .memo-save')].map(b => b.getAttribute('aria-label')).join(' | ')}`,
      `links: ${linksOf(body).length} in the original, ${hrefs.length} on screen`,
      `fold: ${[...container.querySelectorAll('.memo-map p strong')].map(s => s.parentElement?.textContent).join(' | ')}`,
      '',
    ].join('\n'));
    cleanup();
  });
});

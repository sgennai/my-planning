// @vitest-environment jsdom
// The Sales Brief memo against the real archive (INT-51), run by hand, never in the normal suite:
//
//   SALES_DRIVE=<folder of the Sales Brief's Drive docs as JSON, from /api/intel/docs/<id>>
//   SALES_SOURCE=<optional: an edition's original Markdown, checked against its Drive copy on screen>
//   npx vitest run scripts/sales-memo.check
//
// Every Sales Brief edition is drawn as the memo, its folds open, and must
// show every word of its document and every link exactly as written, nothing
// of its header and no empty chapter. With SALES_SOURCE, the edition of the
// same title line must also show every word and link of that original.
// Prints one line per edition (its layout as the memo read it); nothing is
// sent anywhere, and the real texts stay outside the repository.
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseEdition, splitSections } from '../src/intelligence/parse';
import { EditionReader } from '../src/intelligence/EditionReader';
import { salesMemo } from '../src/intelligence/sales-memo';
import { linksOf, wordsOf } from '../src/intelligence/test-fixtures';

const { SALES_DRIVE, SALES_SOURCE } = process.env;

const draw = (e: ReturnType<typeof parseEdition>) => {
  const { container } = render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} />);
  for (const fold of container.querySelectorAll('details')) fold.setAttribute('open', '');
  return container;
};
const hrefsIn = (c: HTMLElement) => [...c.querySelectorAll('article a[href]:not([href^="#"])')].map(a => a.getAttribute('href')!);

describe.skipIf(!SALES_DRIVE)('the Sales memo on the real archive', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Element.prototype.scrollTo = function scrollTo() {};
  const docs = SALES_DRIVE ? readdirSync(SALES_DRIVE).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(SALES_DRIVE, f), 'utf8')))
    .filter(d => d.feedId === 'enterprise-ai-sales-brief')
    .sort((a, b) => (a.file.name < b.file.name ? -1 : 1)) : [];

  it('shows every word and link of every Sales Brief edition', () => {
    const lines: string[] = [];
    for (const d of docs) {
      const e = parseEdition('enterprise-ai-sales-brief', d.file, d.text);
      const container = draw(e);
      const shown = container.textContent ?? '';
      const lost = wordsOf(e.markdownBody).filter(w => !shown.includes(w));
      expect(lost, `${e.fileName}: words not on screen`).toEqual([]);
      expect(shown, e.fileName).not.toMatch(/schema_version|source_message|generated_at|time_note/);
      const hrefs = hrefsIn(container);
      const written = linksOf(e.markdownBody);
      expect(written.filter(u => !hrefs.includes(u)), `${e.fileName}: links not on screen`).toEqual([]);
      expect(hrefs.filter(h => !written.includes(h) && h !== e.sourceUrl), `${e.fileName}: links added`).toEqual([]);
      const memo = salesMemo(splitSections(e.markdownBody));
      const devs = [...container.querySelectorAll('.memo-dev')];
      expect(devs.length, e.fileName).toBe(memo.chapters.length);
      expect(devs.filter(c => !c.querySelector('.memo-fields, .memo-dev-text')?.textContent?.trim()), `${e.fileName}: an empty chapter`).toEqual([]);
      const fielded = memo.chapters.filter(c => c.fields).length;
      const labels = new Set(memo.chapters.flatMap(c => (c.fields ?? []).map(f => f.label).filter(Boolean)));
      lines.push([
        e.fileName.slice(0, 15),
        `${String(wordsOf(e.markdownBody).length).padStart(4)} words`,
        `${String(written.length).padStart(2)} links`,
        `${memo.chapters.length} dev (${fielded} in fields, ${labels.size} labels)`,
        `remember ${memo.remember ? '✓' : '·'} rows ${memo.rows.length}`,
        `heading ${memo.heading ? '✓' : '·'} themes ${memo.themes ? (memo.themes.list ? 'list' : 'text') : '·'} map ${memo.map ? 'own' : '27'}`,
        `parts ${memo.flow.filter(f => f.kind === 'part' && (f.title || f.markdown)).length} lead ${memo.lead ? '✓' : '·'}`,
      ].join(' · '));
      cleanup();
    }
    process.stdout.write(`${lines.join('\n')}\n${docs.length} editions, every word and link on screen.\n`);
  });

  it.skipIf(!SALES_SOURCE)('shows every word and link of the original briefing', () => {
    const source = readFileSync(SALES_SOURCE!, 'utf8');
    const heading = /^# (.+)$/m.exec(source)?.[1];
    const d = docs.find(x => x.text.includes(`# ${heading}`));
    expect(d, `no Drive edition with the heading ${heading}`).toBeTruthy();
    const e = parseEdition('enterprise-ai-sales-brief', d.file, d.text);
    const container = draw(e);
    const shown = container.textContent ?? '';
    expect(wordsOf(source).filter(w => !shown.includes(w)), 'words of the original not on screen').toEqual([]);
    const hrefs = hrefsIn(container);
    expect(linksOf(source).filter(u => !hrefs.includes(u)), 'links of the original not on screen').toEqual([]);
    const memo = salesMemo(splitSections(e.markdownBody));
    process.stdout.write([
      `${e.fileName}: "${e.title}"`,
      `bar: ${container.querySelector('.memo-bar-date')?.textContent}`,
      `topics: ${e.topics.join(', ')} (${container.querySelectorAll('.memo-topics-list b').length} shown, then "${container.querySelector('.memo-more-topics')?.textContent}")`,
      `${memo.chapters.length} developments: ${memo.chapters.map(c => c.title).join(' | ')}`,
      `fields: ${memo.chapters.map(c => (c.fields ?? []).map(f => f.label).join(', ')).join(' | ')}`,
      `closing: ${[memo.remember, ...memo.rows].map(s => s?.title).join(' | ')}`,
      `links: ${linksOf(source).length} in the original, ${hrefs.length} on screen`,
      `takeaways: ${container.querySelector('.memo-summary--end .memo-summary-label')?.textContent} (${container.querySelectorAll('.memo-summary--end li').length})`,
      `fold: ${[...container.querySelectorAll('.memo-map p strong')].map(s => s.textContent).join(' | ')}`,
      '',
    ].join('\n'));
    cleanup();
  });
});

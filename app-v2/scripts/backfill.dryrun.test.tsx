// @vitest-environment jsdom
// The backfill's dry run (INT-34), run by hand, never in the normal suite:
//
//   BACKFILL_EXTRACT=<extract.json> BACKFILL_EXISTING=<folder of Drive docs as JSON>
//   BACKFILL_OUT=<folder> BACKFILL_FEED=enterprise-ai-challenge npx vitest run scripts/backfill.dryrun
//
// It converts the extract against what the feed's folder already holds,
// writes each document to import as <name>.md and a report, and checks every
// one with the app's own parser and reader: no header issue, origin
// "backfill", the page's date and time, and every word of the body on screen.
// Nothing is sent anywhere. The real texts stay outside the repository.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { backfillDocs, pauses, type Extract, type Existing } from '../src/intelligence/backfill';
import { parseEdition } from '../src/intelligence/parse';
import { EditionReader } from '../src/intelligence/EditionReader';
import { wordsOf } from '../src/intelligence/test-fixtures';
import type { FeedId } from '../src/intelligence/feeds';

const { BACKFILL_EXTRACT, BACKFILL_EXISTING, BACKFILL_OUT, BACKFILL_FEED } = process.env;

describe.skipIf(!BACKFILL_EXTRACT || !BACKFILL_OUT)('backfill dry run', () => {
  it('converts, checks and writes every edition', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = function scrollTo() {};
    const feed = (BACKFILL_FEED || 'enterprise-ai-challenge') as FeedId;
    const extract = JSON.parse(readFileSync(BACKFILL_EXTRACT!, 'utf8')) as Extract;
    const existing: Existing[] = BACKFILL_EXISTING
      ? readdirSync(BACKFILL_EXISTING).filter((f: string) => f.endsWith('.json')).map((f: string) => {
        const d = JSON.parse(readFileSync(join(BACKFILL_EXISTING, f), 'utf8'));
        return { name: d.file.name as string, text: d.text as string };
      })
      : [];
    const { docs, decisions } = backfillDocs(extract, feed, existing);
    mkdirSync(BACKFILL_OUT!, { recursive: true });

    const checks: string[] = [];
    for (const doc of docs) {
      const e = parseEdition(feed, { id: `dry-run-${doc.edition}`, name: doc.fileName, modifiedTime: new Date().toISOString() }, doc.text);
      expect(e.issues, doc.fileName).toEqual([]);
      expect(e.origin).toBe('backfill');
      expect(`${e.editionDate} ${e.time}`).toBe(`${doc.generatedAt.slice(0, 10)} ${doc.generatedAt.slice(11, 16)}`);
      const { container, getAllByRole } = render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} />);
      for (const fold of getAllByRole('button', { expanded: false })) fireEvent.click(fold);
      const shown = container.textContent ?? '';
      const lost = wordsOf(e.markdownBody).filter(w => !shown.includes(w));
      expect(lost, `${doc.fileName}: words not on screen`).toEqual([]);
      expect(shown).not.toMatch(/schema_version|source_message|time_note/);
      cleanup();
      checks.push(doc.fileName);
      writeFileSync(join(BACKFILL_OUT!, `${doc.fileName}.md`), doc.text);
    }

    const days = decisions.filter(d => d.time).map(d => d.time!.slice(0, 10));
    const count = (a: string) => decisions.filter(d => d.action === a).length;
    const report = [
      `# Backfill dry run · ${feed}`,
      '',
      `${new Date().toISOString()} · extract: ${BACKFILL_EXTRACT} · conversation ${extract.page.conversationId}`,
      '',
      `Editions in the extract: ${decisions.length}. To import: ${count('import')}. Skipped (already in Drive): ${count('skip')}. Conflicts: ${count('conflict')}. Problems: ${count('problem')}.`,
      `Checked with the app's parser and reader (no header issue, origin backfill, date and time, every word on screen): ${checks.length} of ${docs.length}.`,
      '',
      `Days with no edition (the task's pauses): ${pauses(days).join(', ') || 'none'}.`,
      '',
      '| # | Paris time | Title | Decision | Why |',
      '|---:|---|---|---|---|',
      ...decisions.map(d => {
        const doc = docs.find(x => x.edition === d.edition);
        return `| ${d.edition} | ${d.time ?? '—'} | ${doc ? doc.title.replace(/\|/g, '\\|') : '—'} | ${d.action} | ${d.reason} |`;
      }),
      '',
    ].join('\n');
    writeFileSync(join(BACKFILL_OUT!, 'report.md'), report);
    writeFileSync(join(BACKFILL_OUT!, 'report.json'), JSON.stringify({ feed, decisions, docs: docs.map(d => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'text'))) }, null, 2));
    expect(count('problem')).toBe(0);
  });
});

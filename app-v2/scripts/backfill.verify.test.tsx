// @vitest-environment jsdom
// The backfill's read-back check (INT-34), run by hand after documents were
// uploaded to the feed's Drive folder, never in the normal suite:
//
//   BACKFILL_DRIVE=<folder of the feed's Drive docs as JSON, from /api/intel/docs/<id>>
//   BACKFILL_DRY=<the dry run's folder> BACKFILL_EXPECT=<how many should be in Drive>
//   BACKFILL_FEED=enterprise-ai-challenge npx vitest run scripts/backfill.verify
//
// Each dry-run document found in Drive (by its `source_message`) must read
// back as it was checked: the same name, no header issue, origin "backfill",
// the same date, time, title and topics, the same words and lines (blank
// lines aside), and every word on screen. Two Drive documents from the same
// reply are a duplicate. Nothing is sent anywhere.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseEdition, type Edition } from '../src/intelligence/parse';
import { EditionReader } from '../src/intelligence/EditionReader';
import { wordsIn } from '../src/intelligence/backfill';
import { wordsOf } from '../src/intelligence/test-fixtures';
import type { FeedId } from '../src/intelligence/feeds';

const { BACKFILL_DRIVE, BACKFILL_DRY, BACKFILL_EXPECT, BACKFILL_FEED } = process.env;

const sourceOf = (text: string) => /^source_message:\s*"([^"\n]+)"/m.exec(text)?.[1] ?? null;
const linesOf = (body: string) => body.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).filter(Boolean);

describe.skipIf(!BACKFILL_DRIVE || !BACKFILL_DRY)('backfill read-back', () => {
  it('finds every uploaded document as it was checked, once', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = function scrollTo() {};
    const feed = (BACKFILL_FEED || 'enterprise-ai-challenge') as FeedId;
    const drive = readdirSync(BACKFILL_DRIVE!).filter(f => f.endsWith('.json')).map(f => {
      const d = JSON.parse(readFileSync(join(BACKFILL_DRIVE!, f), 'utf8'));
      return { file: d.file as { id: string; name: string; modifiedTime: string }, text: d.text as string };
    });
    const dry = readdirSync(BACKFILL_DRY!).filter(f => /^\d{4}-\d{2}-\d{2}_\d{4}__.+\.md$/.test(f)).map(f => {
      const text = readFileSync(join(BACKFILL_DRY!, f), 'utf8');
      return { name: f.replace(/\.md$/, ''), text, source: sourceOf(text) };
    });

    const found: string[] = [];
    const differences: string[] = [];
    for (const want of dry) {
      const copies = drive.filter(d => sourceOf(d.text.replace(/^\uFEFF/, '')) === want.source);
      if (!copies.length) continue;
      found.push(want.name);
      if (copies.length > 1) differences.push(`${want.name}: ${copies.length} copies in Drive (${copies.map(c => c.file.name).join(', ')})`);
      const got = copies[0];
      const expected = parseEdition(feed, { id: 'dry', name: want.name, modifiedTime: got.file.modifiedTime }, want.text);
      const e: Edition = parseEdition(feed, got.file, got.text);
      const pick = (x: Edition) => ({ fileName: x.fileName, issues: x.issues, origin: x.origin, editionDate: x.editionDate, time: x.time, generatedAt: x.generatedAt, title: x.title, topics: x.topics });
      if (JSON.stringify(pick(e)) !== JSON.stringify(pick(expected))) differences.push(`${want.name}: header ${JSON.stringify(pick(e))} ≠ ${JSON.stringify(pick(expected))}`);
      if (wordsIn(e.markdownBody) !== wordsIn(expected.markdownBody)) differences.push(`${want.name}: the words differ`);
      const a = linesOf(e.markdownBody), b = linesOf(expected.markdownBody);
      const at = b.findIndex((l, i) => a[i] !== l);
      if (at >= 0 || a.length !== b.length) {
        const i = at >= 0 ? at : Math.min(a.length, b.length);
        differences.push(`${want.name}: line ${i + 1} reads ${JSON.stringify(a[i] ?? '(nothing)')} instead of ${JSON.stringify(b[i] ?? '(nothing)')}`);
      }
      const { container, queryAllByRole } = render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} />);
      for (const fold of queryAllByRole('button', { expanded: false })) fireEvent.click(fold);
      const shown = container.textContent ?? '';
      const lost = wordsOf(e.markdownBody).filter(w => !shown.includes(w));
      if (lost.length) differences.push(`${want.name}: not on screen: ${lost.slice(0, 5).join(' ')}`);
      if (/schema_version|source_message|time_note/.test(shown)) differences.push(`${want.name}: header text on screen`);
      cleanup();
    }

    process.stdout.write(`${[
      `In Drive: ${drive.length} documents. Uploaded editions found: ${found.length} of ${dry.length}${BACKFILL_EXPECT ? ` (expected ${BACKFILL_EXPECT})` : ''}.`,
      ...found.map(n => `  found ${n}`),
      ...(differences.length ? ['Differences:', ...differences.map(d => `  ${d}`)] : ['No differences.']),
    ].join('\n')}\n`);
    expect(differences).toEqual([]);
    if (BACKFILL_EXPECT) expect(found.length).toBe(Number(BACKFILL_EXPECT));
  });
});

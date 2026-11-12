// @vitest-environment jsdom
// The memo against the real archive (INT-50), run by hand, never in the normal suite:
//
//   MEMO_DRIVE=<folder of the AI Challenge's Drive docs as JSON, from /api/intel/docs/<id>>
//   npx vitest run scripts/memo.check
//
// Every AI Challenge edition is drawn as the memo, with its topic map and
// related editions unfolded, and must show every word of its document,
// nothing of its header, its sections in order and no empty one. Prints one
// line per edition; nothing is sent anywhere, and the real texts stay outside
// the repository.
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseEdition, splitSections } from '../src/intelligence/parse';
import { EditionReader } from '../src/intelligence/EditionReader';
import { memoOrder } from '../src/intelligence/memo';
import { wordsOf } from '../src/intelligence/test-fixtures';

const { MEMO_DRIVE } = process.env;

describe.skipIf(!MEMO_DRIVE)('the memo on the real archive', () => {
  it('shows every word of every AI Challenge edition', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = function scrollTo() {};
    const docs = readdirSync(MEMO_DRIVE!).filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(MEMO_DRIVE!, f), 'utf8')))
      .filter(d => d.feedId === 'enterprise-ai-challenge')
      .sort((a, b) => (a.file.name < b.file.name ? -1 : 1));
    const lines: string[] = [];
    for (const d of docs) {
      const e = parseEdition('enterprise-ai-challenge', d.file, d.text);
      const { container } = render(<EditionReader edition={e} scroller={{ current: document.createElement('div') }} onNote={() => {}} onToggleSave={() => {}} onToggleRead={() => {}} />);
      for (const fold of container.querySelectorAll('details')) fold.setAttribute('open', '');
      const shown = container.textContent ?? '';
      const lost = wordsOf(e.markdownBody).filter(w => !shown.includes(w));
      expect(lost, `${e.fileName}: words not on screen`).toEqual([]);
      expect(shown, e.fileName).not.toMatch(/schema_version|source_message|generated_at|time_note/);
      const { body } = memoOrder(splitSections(e.markdownBody));
      const numbered = [...container.querySelectorAll('.memo-section')];
      expect(numbered.length, e.fileName).toBe(body.length);
      expect(numbered.filter(s => !s.querySelector('.memo-body')?.textContent?.trim()), `${e.fileName}: an empty section`).toEqual([]);
      const has = (sel: string) => (container.querySelector(sel) ? '✓' : '·');
      lines.push(`${e.fileName.slice(0, 15)} ${String(wordsOf(e.markdownBody).length).padStart(4)} words, ${body.length} sections · summary ${has('.memo-summary')} topics ${container.querySelectorAll('.memo-topics b, .memo-topics-list > span').length ? '✓' : '·'} approaches ${has('.memo-approach')} questions ${has('.memo-question')} vocabulary ${has('.memo-term')} map ${has('.memo-map')} set aside ${e.setAside.length}`);
      cleanup();
    }
    process.stdout.write(`${lines.join('\n')}\n${docs.length} editions, every word on screen.\n`);
  });
});

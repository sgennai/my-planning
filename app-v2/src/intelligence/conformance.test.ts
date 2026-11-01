// What the app says about a feed's documents: the format, copies, empty
// documents, where an edition came from, and patience with one being written.
import { describe, it, expect } from 'vitest';
import { parseEdition, type DriveFile } from './parse';
import { conformanceOf, labelOf, noticeOf, WRITING_GRACE_MS } from './conformance';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const LONG_AGO = '2026-11-02T07:20:30.000Z';
const file = (over: Partial<DriveFile> = {}): DriveFile => ({ ...CHALLENGE_FILE, createdTime: LONG_AGO, ...over });
const edition = (text: string, over: Partial<DriveFile> = {}) => parseEdition('enterprise-ai-challenge', file(over), text);
const withOrigin = (origin: string) => CHALLENGE_DOC.replace('schema_version: 1', `schema_version: 1\norigin: "${origin}"`);
const kinds = (list: { kind: string }[] | undefined) => (list ?? []).map(f => f.kind);

describe('conformance', () => {
  it('a scheduled edition in the format raises nothing, and counts as the last scheduled one', () => {
    const e = edition(withOrigin('scheduled'));
    const c = conformanceOf([e], NOW);
    expect(c.flags.get(e.driveFileId)).toBeUndefined();
    expect(c.problems).toEqual([]);
    expect(c.lastScheduled).toBe(e);
  });

  it('an imported edition is labelled, not a problem, and never the last scheduled one', () => {
    const e = edition(withOrigin('backfill'));
    const c = conformanceOf([e], NOW);
    expect(kinds(c.flags.get(e.driveFileId))).toEqual(['imported']);
    expect(c.problems).toEqual([]);
    expect(c.lastScheduled).toBeNull();
    expect(labelOf(c.flags.get(e.driveFileId))).toBe('Imported');
  });

  it('without origin, provenance is unknown; a long gap is only a suspicion', () => {
    const close = edition(CHALLENGE_DOC, { createdTime: '2026-11-02T07:21:00.000Z' });
    expect(conformanceOf([close], NOW).flags.get(close.driveFileId)).toBeUndefined();
    // Like the real 2026-11-01 sample: stated 08:20 Paris, created 15:57.
    const late = edition(CHALLENGE_DOC, { createdTime: '2026-11-02T14:57:30.000Z' });
    const c = conformanceOf([late], NOW);
    expect(c.flags.get(late.driveFileId)).toEqual([{ kind: 'possibly-imported', hours: 8 }]);
    expect(labelOf(c.flags.get(late.driveFileId))).toBeNull();
    expect(c.lastScheduled).toBeNull();
  });

  it('two documents with the same name are both kept and both labelled', () => {
    const a = edition(CHALLENGE_DOC, { id: '1CopyA0000000000000000' });
    const b = edition(CHALLENGE_DOC, { id: '1CopyB0000000000000000' });
    const c = conformanceOf([a, b], NOW);
    expect(c.flags.get(a.driveFileId)).toContainEqual({ kind: 'duplicate', copies: 2 });
    expect(c.flags.get(b.driveFileId)).toContainEqual({ kind: 'duplicate', copies: 2 });
    expect(c.problems).toHaveLength(2);
  });

  it('a header-only or empty document is incomplete, once it has had time to be written', () => {
    const headerOnly = CHALLENGE_DOC.split('---\n').slice(0, 2).join('---\n') + '---\n';
    for (const text of [headerOnly, '']) {
      const old = edition(text);
      expect(kinds(conformanceOf([old], NOW).flags.get(old.driveFileId))).toContain('incomplete');
      const young = edition(text, { createdTime: new Date(NOW - WRITING_GRACE_MS / 2).toISOString() });
      const youngKinds = kinds(conformanceOf([young], NOW).flags.get(young.driveFileId));
      expect(youngKinds).toContain('writing');
      expect(youngKinds).not.toContain('incomplete');
    }
  });

  it('a header problem is named, but not while the document is still young', () => {
    const broken = CHALLENGE_DOC.replace(/generated_at: .*\n/, '');
    const old = edition(broken);
    const flags = conformanceOf([old], NOW).flags.get(old.driveFileId)!;
    expect(flags).toEqual([{ kind: 'format', issues: ['no generated_at'] }]);
    expect(noticeOf(flags[0])).toContain('(no generated_at)');
    const young = edition(broken, { createdTime: new Date(NOW - 60_000).toISOString() });
    const youngKinds = kinds(conformanceOf([young], NOW).flags.get(young.driveFileId));
    expect(youngKinds).toContain('writing');
    expect(youngKinds).not.toContain('format');
  });

  it('an origin that is neither value is a format issue', () => {
    const e = edition(withOrigin('manual'));
    expect(e.origin).toBeNull();
    expect(conformanceOf([e], NOW).flags.get(e.driveFileId)).toEqual([
      { kind: 'format', issues: ['origin "manual", expected "scheduled" or "backfill"'] },
    ]);
  });

  it('lists show the one most important label', () => {
    expect(labelOf([{ kind: 'imported' }, { kind: 'duplicate', copies: 2 }])).toBe('Duplicate');
    expect(labelOf([{ kind: 'format', issues: ['x'] }, { kind: 'incomplete' }])).toBe('Incomplete');
    expect(labelOf(undefined)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { parseEdition, splitSections, slugOf, newestFirst, type DriveFile } from './parse';

const FILE: DriveFile = {
  id: '1F0t_R2-YRaBscFFbUXbnd2g-p10zSR8H92D7Wkhc-FY',
  name: '2026-11-01_0820__enterprise-ai-challenge',
  createdTime: '2026-11-01T07:21:00.000Z',
  modifiedTime: '2026-11-01T07:25:00.000Z',
  webViewLink: 'https://docs.google.com/document/d/1F0t_R2-YRaBscFFbUXbnd2g-p10zSR8H92D7Wkhc-FY/edit',
};

const BODY = `## Enterprise AI topic map
Security · Governance · **Risk**

## Challenge
Employees paste client data into “free” AI tools — see [the survey](https://example.com/survey).

## Business impact
- Regulatory exposure
- Data leakage`;

const DOC = `---
schema_version: 1
content_type: "enterprise-ai-challenge"
edition_date: "2026-11-01"
generated_at: "2026-11-01T08:20:02+01:00"
title: "Shadow AI: Closing the Control Gap"
topics: ["Security", "Governance", "Risk", "AI risk"]
---

${BODY}
`;

const parse = (text: string, file: Partial<DriveFile> = {}) =>
  parseEdition('enterprise-ai-challenge', { ...FILE, ...file }, text);

describe('an edition', () => {
  it('reads a valid v1 document: header hidden, body as written', () => {
    const e = parse(DOC);
    expect(e.issues).toEqual([]);
    expect(e.title).toBe('Shadow AI: Closing the Control Gap');
    expect(e.editionDate).toBe('2026-11-01');
    expect(e.generatedAt).toBe('2026-11-01T08:20:02+01:00');
    expect(e.time).toBe('08:20');
    expect(e.topics).toEqual(['Security', 'Governance', 'Risk', 'AI risk']);
    expect(e.markdownBody).toBe(`${BODY}\n`);
    expect(e.markdownBody).not.toContain('schema_version');
    expect(e.sourceUrl).toBe(FILE.webViewLink);
  });

  it("copes with Google's plain-text export: byte-order mark, CRLF, a blank first line", () => {
    const e = parse(`\uFEFF\r\n${DOC.replace(/\n/g, '\r\n')}`);
    expect(e.issues).toEqual([]);
    expect(e.markdownBody).toBe(`${BODY}\n`);
  });

  it('shows the time in Paris whatever offset the header carries', () => {
    expect(parse(DOC.replace('2026-11-01T08:20:02+01:00', '2026-11-01T07:20:02Z')).time).toBe('08:20');
    // Summer time: +02:00.
    expect(parse(DOC.replace('2026-11-01T08:20:02+01:00', '2026-07-01T08:05:00+02:00')).time).toBe('08:05');
  });

  it('accepts topics written as a YAML list', () => {
    const e = parse(DOC.replace('topics: ["Security", "Governance", "Risk", "AI risk"]', 'topics:\n  - Security\n  - Risk'));
    expect(e.topics).toEqual(['Security', 'Risk']);
    expect(e.issues).toEqual([]);
  });

  it('without a header, falls back to the filename and says so', () => {
    const e = parse(BODY);
    expect(e.issues).toEqual(['no header']);
    expect(e.editionDate).toBe('2026-11-01');
    expect(e.time).toBe('08:20');
    expect(e.generatedAt).toBeNull();
    expect(e.title).toBe('Enterprise AI Challenge');
    expect(e.topics).toEqual([]);
    expect(e.markdownBody).toBe(BODY);
  });

  it('with neither header nor a dated filename, takes the date from Drive and the time from nowhere', () => {
    const e = parse(BODY, { name: 'Untitled document' });
    expect(e.editionDate).toBe('2026-11-01');
    expect(e.time).toBeNull();
    expect(e.issues).toContain('date taken from Drive');
  });

  it('a header that cannot be read is removed, never shown, and noted', () => {
    const e = parse(DOC.replace('title: "Shadow AI: Closing the Control Gap"', 'title: "unterminated'));
    expect(e.issues[0]).toMatch(/^header could not be read/);
    expect(e.markdownBody).toBe(`${BODY}\n`);
    expect(e.title).toBe('Enterprise AI Challenge');
    expect(e.editionDate).toBe('2026-11-01'); // from the filename
  });

  it('a header that is never closed leaves the whole text as the body', () => {
    const long = `---\nschema_version: 1\n\n${BODY}\n\n${'Paragraph.\n\n'.repeat(30)}---\n\nAfter a rule.`;
    const e = parse(long);
    expect(e.issues).toEqual(['header not closed']);
    expect(e.markdownBody).toContain('After a rule.');
    expect(e.markdownBody).toContain('## Challenge');
  });

  it('names each wrong field and keeps going', () => {
    const e = parse(DOC
      .replace('schema_version: 1', 'schema_version: 2')
      .replace('"enterprise-ai-challenge"', '"customer-engagement-brief"')
      .replace('"2026-11-01T08:20:02+01:00"', '"2026-11-01 08:20"')
      .replace('edition_date: "2026-11-01"', 'edition_date: "1 Nov"'));
    expect(e.issues).toEqual([
      'schema_version 2, expected 1',
      'content_type "customer-engagement-brief" in the enterprise-ai-challenge folder',
      'edition_date "1 Nov" is not a date',
      'generated_at "2026-11-01 08:20" is not a time with its offset',
    ]);
    expect(e.editionDate).toBe('2026-11-01');
    expect(e.generatedAt).toBeNull();
    expect(e.time).toBe('08:20');
    expect(e.feedId).toBe('enterprise-ai-challenge');
  });

  it('notes missing fields', () => {
    const e = parse('---\nschema_version: 1\ncontent_type: enterprise-ai-challenge\n---\n\nBody.');
    expect(e.issues).toEqual(['no edition_date', 'no generated_at', 'no title', 'no topics']);
    expect(e.markdownBody).toBe('Body.');
  });

  it('sorts newest first by date, then time of day', () => {
    const a = parse(DOC);
    const b = parse(DOC.replace('2026-11-01T08:20:02+01:00', '2026-11-01T18:00:00+01:00'), { id: 'b' });
    const c = parse(DOC.replace('edition_date: "2026-11-01"', 'edition_date: "2026-10-31"'), { id: 'c' });
    expect([c, a, b].sort(newestFirst).map(e => e.driveFileId)).toEqual(['b', FILE.id, 'c']);
  });
});

describe('sections', () => {
  it('cuts at the top-level headings, keeping order and text', () => {
    const s = splitSections(BODY);
    expect(s.map(x => [x.id, x.title])).toEqual([
      ['enterprise-ai-topic-map', 'Enterprise AI topic map'],
      ['challenge', 'Challenge'],
      ['business-impact', 'Business impact'],
    ]);
    expect(s[1].markdown).toBe('Employees paste client data into “free” AI tools — see [the survey](https://example.com/survey).');
  });

  it('keeps deeper headings inside their section, and text before the first heading', () => {
    const s = splitSections('Intro line.\n\n## 3 approaches\n### Approach 1\nA\n### Approach 2\nB\n## What to listen for\nC');
    expect(s.map(x => x.title)).toEqual(['', '3 approaches', 'What to listen for']);
    expect(s[0].markdown).toBe('Intro line.');
    expect(s[1].markdown).toBe('### Approach 1\nA\n### Approach 2\nB');
  });

  it('does not take a # inside a code fence for a heading', () => {
    const s = splitSections('## One\n```\n## not a heading\n```\n## Two\nx');
    expect(s.map(x => x.title)).toEqual(['One', 'Two']);
  });

  it('gives repeated headings distinct ids', () => {
    expect(splitSections('## Notes\na\n## Notes\nb').map(x => x.id)).toEqual(['notes', 'notes-2']);
  });

  it('makes ASCII slugs of any heading', () => {
    expect(slugOf('Executive Vocabulary — 3 Terms to Remember')).toBe('executive-vocabulary-3-terms-to-remember');
    expect(slugOf('À retenir')).toBe('a-retenir');
    expect(slugOf('🔥')).toBe('');
  });
});

describe('a document with its own title line', () => {
  it('keeps the title and what follows it apart, and cuts at the next level', () => {
    const s = splitSections('# Brief — 1 Nov\n\n**Coverage: last week**\n\n## Themes\n\nText.\n\n### A development\n\nMore.\n\n## Remember\n\n- One.');
    expect(s.map(x => [x.title, x.role ?? null])).toEqual([['Brief — 1 Nov', 'title'], ['Themes', null], ['Remember', null]]);
    expect(s[0].markdown).toBe('**Coverage: last week**');
    expect(s[1].markdown).toBe('Text.\n\n### A development\n\nMore.');
  });

  it('only when that heading opens the document and is the only one of its level', () => {
    expect(splitSections('Intro.\n\n# One\n\n## A\n\nx').map(x => x.role ?? null)).toEqual([null, null]);
    expect(splitSections('# One\n\n## A\n\n# Two\n\nx').map(x => x.title)).toEqual(['One', 'Two']);
    expect(splitSections('# Only\n\nAll the text.').map(x => [x.title, x.role ?? null])).toEqual([['Only', null]]);
  });
});


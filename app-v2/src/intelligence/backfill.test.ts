// Historical editions into our documents (INT-34), on a made-up extract: the
// page's own time in Paris time, the reply's words as given, its own title and
// topics, origin "backfill"; what Drive already has skipped, a same-day
// difference left to a person, and nothing guessed.
import { describe, it, expect } from 'vitest';
import { backfillDocs, parisIso, pauses, ownTitleAndTopics, TIME_NOTE_EARLIER, type Extract, type ExtractItem } from './backfill';
import { parseEdition } from './parse';

const reply = (title: string, extra = '') => `## Enterprise AI topic map

Strategy • Risk • Data

**Relevant to today's challenge:** Risk • Data

## Challenge

**${title}.**

Words that explain it, with “quotes” and é.

## Business impact

More words.${extra}`;

const item = (edition: number, iso: string | null, over: Partial<ExtractItem> = {}): ExtractItem => ({
  role: 'assistant', kind: 'edition', edition, messageId: `msg-${edition}`, turnKey: `turn-${edition}`,
  timeSource: 'own-separator', timeElement: iso ? { datetime: iso } : null, markdown: reply(`Challenge number ${edition}`), ...over,
});
const extract = (items: ExtractItem[]): Extract => ({
  format: 'chatgpt-task-extract', version: 2, page: { conversationId: 'conv-1', automationId: 'auto-1' },
  items: [{ role: 'user', kind: 'user-marker' }, { role: 'assistant', kind: 'other-reply', markdown: 'Got it.' }, ...items],
});
const drive = (name: string, day: string, body: string) => ({
  name, text: `---\nschema_version: 1\ncontent_type: "enterprise-ai-challenge"\nedition_date: "${day}"\ngenerated_at: "${day}T08:20:00+01:00"\norigin: "scheduled"\ntitle: "X"\ntopics: []\n---\n\n\n${body.replace(/\n\n/g, '\n\n\n')}\n`,
});

describe('the time', () => {
  it('is Paris wall-clock time with its real offset, either side of the clock change', () => {
    expect(parisIso(new Date('2026-09-06T06:18:16.700Z'))).toBe('2026-09-06T08:18:16+02:00');
    expect(parisIso(new Date('2026-10-25T07:19:02.305Z'))).toBe('2026-10-25T08:19:02+01:00');
    expect(parisIso(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25T00:30:00+02:00');
  });
});

describe('historical editions into documents', () => {
  const items = [
    item(1, '2026-09-05T12:12:30.592Z', { timeSource: 'earlier-separator' }),
    item(2, '2026-09-06T06:18:16.700Z', { markdown: `${reply('Challenge number 2')}\n\n---\n\n[Google Drive archive](https://docs.google.com/document/d/x/edit)` }),
    item(3, '2026-11-02T08:02:35.904Z'),
    item(4, '2026-11-03T07:42:10.388Z'),
    item(5, null),
  ];
  const existing = [
    drive('2026-11-02_0901__enterprise-ai-challenge', '2026-11-02', reply('Challenge number 3')),
    drive('2026-11-03_0841__enterprise-ai-challenge', '2026-11-03', reply('Something else entirely')),
  ];
  const { docs, decisions } = backfillDocs(extract(items), 'enterprise-ai-challenge', existing);

  it('decides for every edition, guessing nothing', () => {
    expect(decisions.map(d => [d.edition, d.action])).toEqual([[1, 'import'], [2, 'import'], [3, 'skip'], [4, 'conflict'], [5, 'problem']]);
    expect(decisions[2].reason).toContain('same words');
    expect(decisions[3].reason).toContain('left for a person');
  });

  it('writes a document the app reads with no issue: the page’s time, its own title and topics, origin backfill', () => {
    const [first, second] = docs;
    expect(first.fileName).toBe('2026-09-05_1412__enterprise-ai-challenge');
    expect(first.timeNote).toBe(TIME_NOTE_EARLIER);
    const e = parseEdition('enterprise-ai-challenge', { id: 'new', name: second.fileName, modifiedTime: '2026-11-04T08:00:00Z' }, second.text);
    expect(e.issues).toEqual([]);
    expect(e).toMatchObject({ editionDate: '2026-09-06', time: '08:18', origin: 'backfill', title: 'Challenge number 2', topics: ['Risk', 'Data'] });
    expect(second.text).toContain('source_message: "msg-2"');
    expect(second.text).not.toContain('time_note');
  });

  it('keeps the reply’s words exactly, without the task’s archive note', () => {
    const e = parseEdition('enterprise-ai-challenge', { id: 'new', name: docs[1].fileName, modifiedTime: 'x' }, docs[1].text);
    expect(e.markdownBody.trim()).toBe(reply('Challenge number 2'));
  });

  it('running again creates nothing new', () => {
    const again = backfillDocs(extract(items), 'enterprise-ai-challenge', [...existing, ...docs.map(d => ({ name: d.fileName, text: d.text }))]);
    expect(again.docs).toEqual([]);
    expect(again.decisions.filter(d => d.action === 'skip').map(d => d.edition)).toEqual([1, 2, 3]);
  });
});

describe('what an edition says of itself', () => {
  it('its title is its Challenge sentence, its topics its own list', () => {
    expect(ownTitleAndTopics(reply('Unclear ownership of AI'))).toEqual({ title: 'Unclear ownership of AI', topics: ['Risk', 'Data'] });
    expect(ownTitleAndTopics('**Challenge:**\nPlain sentence.\n\n**Business impact**\nX')).toEqual({ title: 'Plain sentence', topics: [] });
  });

  it('days with no edition are the task’s pauses', () => {
    expect(pauses(['2026-10-05', '2026-10-06', '2026-10-22', '2026-10-23', '2026-10-25', '2026-10-27'])).toEqual(['2026-10-07 to 2026-10-21', '2026-10-24', '2026-10-26']);
  });
});

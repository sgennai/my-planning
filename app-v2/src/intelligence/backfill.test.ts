// Historical editions into our documents (INT-34), on a made-up extract: the
// page's own time in Paris time, the reply's words as given, its own title and
// topics, origin "backfill"; what Drive already has skipped, a same-day
// difference left to a person, and nothing guessed.
import { describe, it, expect } from 'vitest';
import { backfillDocs, bodyOf, parisIso, pauses, ownTitleAndTopics, tidyLinks, untagged, TIME_NOTE_EARLIER, type Extract, type ExtractItem } from './backfill';
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

describe('a brief whose task writes its Drive copy in other words', () => {
  const brief = (lead: string, extra = '') => `# Engagement Brief\n\n## Executive take\n\n${lead}\n\n## 1. Vendor A ships an agent\n\nWords [Vendor A](https://example.com/a).${extra}`;
  const items = [
    item(1, '2026-09-21T06:03:16.000Z', { markdown: brief('Plain lead.') }),
    item(2, '2026-11-02T07:01:06.000Z', { markdown: brief('Reply wording.', '\n\n## Google Drive archive\n\nThe document was verified in the folder.') }),
    item(3, '2026-11-04T09:30:00.000Z', { markdown: brief('Another run that day.') }),
  ];
  const existing = [
    { name: '2026-11-02_0757__customer-engagement-brief', text: `---\nedition_date: "2026-11-02"\ngenerated_at: "2026-11-02T07:57:43+01:00"\n---\n\n${brief('Drive wording.')}\n` },
    { name: '2026-11-04_0800__customer-engagement-brief', text: `---\nedition_date: "2026-11-04"\ngenerated_at: "2026-11-04T08:00:41+01:00"\n---\n\n${brief('Drive wording.')}\n` },
  ];
  const { docs, decisions } = backfillDocs(extract(items), 'customer-engagement-brief', existing);

  it('skips the same run, within minutes, whatever its words; another time that day is still a conflict', () => {
    expect(decisions.map(d => [d.edition, d.action])).toEqual([[1, 'import'], [2, 'skip'], [3, 'conflict']]);
    expect(decisions[1].reason).toContain('same run');
  });

  it('writes the brief with its own title, no topics, and no archive section', () => {
    const e = parseEdition('customer-engagement-brief', { id: 'new', name: docs[0].fileName, modifiedTime: 'x' }, docs[0].text);
    expect(e.issues).toEqual([]);
    expect(e).toMatchObject({ title: 'Vendor A ships an agent', topics: [], origin: 'backfill', editionDate: '2026-09-21', time: '08:03' });
    expect(bodyOf(items[1].markdown!)).not.toContain('Google Drive archive');
    expect(bodyOf(`${brief('x')}\n\n## Google Drive archive\n\nNotes.\n\n## Later section\n\nY`)).toContain('Google Drive archive');
  });
});

describe('links as ChatGPT’s page shows them, tidied', () => {
  it('drops the tracking tag, keeping the rest of the address', () => {
    expect(untagged('https://a.example/x?utm_source=chatgpt.com')).toBe('https://a.example/x');
    expect(untagged('https://a.example/x?utm_source=chatgpt.com&id=2')).toBe('https://a.example/x?id=2');
    expect(untagged('https://a.example/x?id=2&utm_source=chatgpt.com')).toBe('https://a.example/x?id=2');
    expect(untagged('https://a.example/x?id=2&utm_source=chatgpt.com&p=3#top')).toBe('https://a.example/x?id=2&p=3#top');
    expect(untagged('https://a.example/x?utm_source=newsletter')).toBe('https://a.example/x?utm_source=newsletter');
  });

  it('drops a chip repeating the link right before it, and nothing else', () => {
    const md = 'One. [Vendor A, 1 May](https://a.example/x?utm_source=chatgpt.com) [a.example](https://a.example/x?utm_source=chatgpt.com) [A](https://a.example/x?utm_source=chatgpt.com)\n\n'
      + 'Two [B](https://b.example/?utm_source=chatgpt.com) [Reuters](https://r.example/y?utm_source=chatgpt.com), then [B again](https://b.example/).';
    const t = tidyLinks(md);
    expect(t.markdown).toBe('One. [Vendor A, 1 May](https://a.example/x)\n\nTwo [B](https://b.example/) [Reuters](https://r.example/y), then [B again](https://b.example/).');
    expect(t.tags).toBe(3);
    expect(t.repeats).toEqual(['[a.example](https://a.example/x)', '[A](https://a.example/x)']);
  });

  it('applies to the Customer Engagement Brief, not to the AI Challenge as imported', () => {
    const tagged = (feed: 'customer-engagement-brief' | 'enterprise-ai-challenge') => backfillDocs(extract([item(1, '2026-09-21T06:03:16.000Z', {
      markdown: `# Engagement Brief\n\n## 1. Vendor A ships an agent\n\n## Challenge\n\nThe challenge.\n\nWords [V](https://v.example/?utm_source=chatgpt.com) [v.example](https://v.example/?utm_source=chatgpt.com).`,
    })]), feed, []).docs[0];
    expect(tagged('customer-engagement-brief').text).toContain('Words [V](https://v.example/).');
    expect(tagged('customer-engagement-brief').tidied).toEqual({ tags: 1, repeats: ['[v.example](https://v.example/)'] });
    expect(tagged('enterprise-ai-challenge').text).toContain('[v.example](https://v.example/?utm_source=chatgpt.com)');
  });
});

describe('what an edition says of itself', () => {
  it('its title is its Challenge sentence, its topics its own list', () => {
    expect(ownTitleAndTopics(reply('Unclear ownership of AI'))).toEqual({ title: 'Unclear ownership of AI', topics: ['Risk', 'Data'] });
    expect(ownTitleAndTopics('**Challenge:**\nPlain sentence.\n\n**Business impact**\nX')).toEqual({ title: 'Plain sentence', topics: [] });
  });

  it('a Customer Engagement brief’s title is its first development headline, and it has no topics', () => {
    const own = (md: string) => ownTitleAndTopics(md, 'customer-engagement-brief');
    expect(own('# Engagement Brief\n\n**Coverage: a week**\n\n## Executive take\n\nWords.\n\n## 1. Vendor A ships **an agent**.\n\nMore.\n\n## 2. Vendor B\n\nX'))
      .toEqual({ title: 'Vendor A ships an agent', topics: [] });
    expect(own('## Weekly briefing — a week\n\nWords.\n\n### 1. Vendor C buys Vendor D\n\nX').title).toBe('Vendor C buys Vendor D');
    expect(own('# Engagement Brief — Addendum\n\n## Executive take\n\nOne more.\n\n## Vendor E patches a flaw\n\nX\n\n## Three executive talking points\n\nY').title).toBe('Vendor E patches a flaw');
    expect(own('# Engagement Brief\n\n## Executive take\n\nNothing new.\n\n## Competitive watchlist\n\nY').title).toBeNull();
  });

  it('a Sales Brief’s title is its first development headline, past its standing sections; its topics its own relevant list', () => {
    const own = (md: string) => ownTitleAndTopics(md, 'enterprise-ai-sales-brief');
    const map = '**Strategy • Risk • Data • People**';
    expect(own(`## Enterprise AI customer-conversation topic map\n\n${map}\n\n**Relevant to this update:** Risk • Data\n\n## Material update since yesterday\n\n### Vendor F opens an agent store\n\nX\n\n### HCL Unica+ customer conversation\n\nY`))
      .toEqual({ title: 'Vendor F opens an agent store', topics: ['Risk', 'Data'] });
    expect(own(`# Sales Brief — 1 May\n\n## Relevant executive themes today\n\n**Strategy • People**\n\n### 1. Bank G adopts agents\n\n**What happened**\n\nZ`))
      .toEqual({ title: 'Bank G adopts agents', topics: ['Strategy', 'People'] });
    expect(own('## Material addendum since Sunday\n\n### Vendor H buys Vendor I\n\nWords.')).toEqual({ title: 'Vendor H buys Vendor I', topics: [] });
  });

  it('days with no edition are the task’s pauses', () => {
    expect(pauses(['2026-10-05', '2026-10-06', '2026-10-22', '2026-10-23', '2026-10-25', '2026-10-27'])).toEqual(['2026-10-07 to 2026-10-21', '2026-10-24', '2026-10-26']);
    // Monday, Wednesday and Friday: the days between runs are no pause, a missed Monday is.
    expect(pauses(['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-23', '2026-10-28'], [1, 3, 5])).toEqual(['5 runs from 2026-10-12 to 2026-10-21', '2026-10-26']);
  });
});

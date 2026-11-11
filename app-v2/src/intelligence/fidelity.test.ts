// Publication integrity (INT-45): the reply is the authority; the Drive copy
// passes when it differs only as the contract allows, and fails, naming what
// changed and where, for any word, paragraph, section or source otherwise.
// Made-up briefs.
import { describe, it, expect } from 'vitest';
import { compareFidelity } from './fidelity';

const REPLY = `# Sales Brief — 4 May

## Relevant executive themes today

**Strategy • Data**

### Vendor A ships a governed agent

**What happened**

**Confirmed fact — 3 May:** Vendor A shipped an agent with positive and negative controls. [Vendor A, 3 May](https://a.example/news?utm_source=chatgpt.com) [a.example](https://a.example/news?utm_source=chatgpt.com)

**Executive question**

“Who approves what the agent does?”

## What I should remember today

- Agents need owners.
- Controls come first, not last.

## Development to watch

Whether Bank B follows. [Bank B](https://b.example/plan?utm_source=chatgpt.com)

---

[Google Drive archive](https://docs.google.com/document/d/x/edit)`;

const HEADER = '---\nschema_version: 1\ncontent_type: "enterprise-ai-sales-brief"\nedition_date: "2026-05-04"\ngenerated_at: "2026-05-04T09:00:00+02:00"\norigin: "scheduled"\ntitle: "T"\ntopics: []\n---\n';

/** The reply as a faithful Drive copy: header, no receipt, clean links. */
const faithful = () => `${HEADER}\n${REPLY.split('\n\n---\n\n[Google Drive archive]')[0]
  .replace(/\?utm_source=chatgpt\.com/g, '')
  .replace(' [a.example](https://a.example/news)', '')}\n`;

/** Drive's plain-text export: CRLF line ends and a blank line doubled. */
const exported = (doc: string) => doc.replace(/\n\n/g, '\n\n\n').replace(/\n/g, '\r\n');

describe('a Drive copy that differs only as allowed', () => {
  it('passes, and says what it set aside', () => {
    const f = compareFidelity(REPLY, exported(faithful()));
    expect(f).toMatchObject({ pass: true, hunks: [], missingSources: [], addedSources: [], missingSections: [], addedSections: [] });
    expect(f.allowed).toEqual({ receipt: true, interface: 0, trackingTags: 2, repeatChips: 1, sourceChips: false });
  });

  it('passes when a source chip is gone but its address is kept elsewhere; fails when the address went with it', () => {
    const domain = REPLY.replace('Whether Bank B follows. [Bank B]', 'Whether Bank B follows. [a.example](https://a.example/news) [Bank B]');
    expect(compareFidelity(domain, faithful())).toMatchObject({ pass: true, allowed: { sourceChips: true } });
    const named = REPLY.replace('[Bank B](https://b.example/plan?utm_source=chatgpt.com)', '[Bank B](https://b.example/plan?utm_source=chatgpt.com) [Vendor A](https://a.example/news)');
    expect(compareFidelity(named, faithful()).pass).toBe(true);
    const gone = REPLY.replace('Whether Bank B follows.', 'Whether Bank B follows. [c.example](https://c.example/x)');
    expect(compareFidelity(gone, faithful())).toMatchObject({ pass: false, missingSources: ['https://c.example/x'], hunks: [] });
  });

  it('a source kept at another address of the same page still fails, and says where the page is', () => {
    const f = compareFidelity(REPLY.replace('https://b.example/plan?utm_source=chatgpt.com', 'https://b.example/plan?ref=x'), faithful());
    expect(f).toMatchObject({ pass: false, missingSources: ['https://b.example/plan?ref=x'], samePage: { 'https://b.example/plan?ref=x': 'https://b.example/plan' } });
  });

  it('passes whatever its formatting: labels as headings or bold, soft breaks, list markers, quotes, case', () => {
    const reformatted = faithful()
      .replace('## What I should remember today\n\n', '**What I should remember today**\n')
      .replace('**What happened**\n\n', '**What happened**\n')
      .replace(/^- /gm, '* ')
      .replace('“Who approves what the agent does?”', '"who approves what the agent does?"')
      .replace('Strategy • Data', 'Strategy · Data');
    expect(compareFidelity(REPLY, reformatted).pass).toBe(true);
  });

  it('passes when the reply carries ChatGPT’s own message after the briefing', () => {
    const reply = REPLY.replace('\n\n---\n\n[Google Drive archive]', "\n\nI've paused this task because updates haven't been viewed in a while. You can resume it in the Scheduled tab or by asking ChatGPT.\n\n---\n\n[Google Drive archive]");
    const f = compareFidelity(reply, faithful());
    expect(f.pass).toBe(true);
    expect(f.allowed.interface).toBe(1);
  });
});

describe('a Drive copy that departs from the reply', () => {
  it('fails on reworded text, quoting both, in its section', () => {
    const f = compareFidelity(REPLY, faithful().replace('positive and negative controls', 'negative and positive controls'));
    expect(f.pass).toBe(false);
    expect(f.hunks).toHaveLength(1);
    expect(f.hunks[0]).toMatchObject({ kind: 'changed', section: 'What happened' });
    expect(f.hunks[0].reply).toContain('[positive and negative]');
    expect(f.hunks[0].drive).toContain('[negative and positive]');
  });

  it('fails on a missing paragraph, and on a missing section', () => {
    const noLead = compareFidelity(REPLY, faithful().replace(/\*\*Confirmed fact[^\n]*\n/, ''));
    expect(noLead.hunks.map(h => h.kind)).toEqual(['missing']);
    expect(noLead.missingSources).toEqual(['https://a.example/news']);
    const noWatch = compareFidelity(REPLY, faithful().replace(/## Development to watch[\s\S]*$/, ''));
    expect(noWatch.missingSections).toEqual(['Development to watch']);
    expect(noWatch.pass).toBe(false);
  });

  it('fails on a source dropped from a sentence that keeps its words, and on a source added', () => {
    const dropped = compareFidelity(REPLY, faithful().replace(' [Bank B](https://b.example/plan)', ' Bank B'));
    expect(dropped).toMatchObject({ pass: false, hunks: [], missingSources: ['https://b.example/plan'] });
    const added = compareFidelity(REPLY, faithful().replace('Agents need owners.', 'Agents need owners. [Survey](https://c.example/s)'));
    expect(added.addedSources).toEqual(['https://c.example/s']);
    expect(added.hunks.map(h => h.kind)).toEqual(['changed']);
  });

  it('fails on text added by the copy, and on a section of its own', () => {
    const extra = 'An extra paragraph written for the archive only, with several more words than any short edit has.';
    const f = compareFidelity(REPLY, faithful().replace('## Development to watch', `${extra}\n\n## Archive notes\n\nNotes.\n\n## Development to watch`));
    expect(f.hunks.map(h => h.kind)).toEqual(['added']);
    expect(f.addedSections).toEqual(['Archive notes']);
  });
});

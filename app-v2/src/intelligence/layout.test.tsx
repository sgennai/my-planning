// The Sales Brief's newer layout (INT-48): labels on their own line with
// the text right under them, themes and closing sections as bold lines. Read
// as the earlier editions were written, with every word kept; the earlier
// layouts and the other briefs untouched. Made-up words, the real structure.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { laidOut } from './layout';
import { parseEdition, splitSections } from './parse';
import { presentBrief } from './briefs';
import { EditionReader } from './EditionReader';
import { SALES_BODY, ENGAGEMENT_BODY, CHALLENGE_BODY, SALES_FILE, wordsOf } from './test-fixtures';

const development = (title: string) => `### ${title}

**What happened**
**Confirmed fact:** Vendor A shipped a thing on 1 May.

**Why it matters to banks**
Banks will ask about it.

**Executive question**
“Who owns the thing?”

**LinkedIn angle**
A short line to post.`;

const NEWER = `# Enterprise AI Sales Brief — 8 May 2027

**Relevant executive themes today:** Strategy • Data • Governance

${development('Vendor A ships a governed agent')}

${development('Bank B moves agents into production')}

**What I should remember today**
- First point.
- Second point.

**Best executive question today**
“Where does the agent stop?”

**Contrarian or non-obvious insight**
The slow bank may be right.

**Development to watch**
Whether regulators follow.`;

const presented = (body: string) => splitSections(laidOut('enterprise-ai-sales-brief', body)).map(s => {
  const p = presentBrief(s);
  return p?.kind === 'developments' ? `devs:${p.items.map(i => i.parts.map(x => x.label).join('+')).join('|')}:${p.themes?.join(',') ?? '-'}` : p?.kind ?? (s.role ? 'title' : 'md');
});

describe('the Sales Brief’s newer layout', () => {
  it('finds its themes, developments with their labelled parts, and closing sections', () => {
    expect(presented(NEWER)).toEqual([
      'title',
      'devs:What happened+Why it matters to banks+Executive question+LinkedIn angle|What happened+Why it matters to banks+Executive question+LinkedIn angle:Strategy,Data,Governance',
      'summary', 'callout', 'callout', 'callout',
    ]);
  });

  it('keeps themes written another way as the text under their heading', () => {
    const r = presented(NEWER.replace('Strategy • Data • Governance', 'Strategy; Data; Governance.'));
    expect(r[1]).toMatch(/^devs:.*:-$/);
    expect(laidOut('enterprise-ai-sales-brief', NEWER.replace('Strategy • Data • Governance', 'Strategy; Data.'))).toContain('## Relevant executive themes today\n\nStrategy; Data.');
  });

  it('changes no word, and shows every one', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = function scrollTo() {};
    expect(wordsOf(laidOut('enterprise-ai-sales-brief', NEWER))).toEqual(wordsOf(NEWER));
    const doc = `---\nschema_version: 1\ncontent_type: "enterprise-ai-sales-brief"\nedition_date: "2027-05-08"\ngenerated_at: "2027-05-08T09:00:00+02:00"\ntitle: "T"\ntopics: []\n---\n\n${NEWER}\n`;
    const edition = parseEdition('enterprise-ai-sales-brief', { ...SALES_FILE, name: '2027-05-08_0900__enterprise-ai-sales-brief' }, doc);
    const { container, queryAllByRole } = render(<EditionReader edition={edition} scroller={{ current: document.createElement('div') }} onNote={() => {}} />);
    for (const fold of queryAllByRole('button', { expanded: false })) fireEvent.click(fold);
    const shown = container.textContent ?? '';
    expect(wordsOf(NEWER).filter(w => !shown.includes(w))).toEqual([]);
  });

  it('leaves the earlier layouts, the Engagement Brief and the AI Challenge as written', () => {
    expect(laidOut('enterprise-ai-sales-brief', SALES_BODY)).toBe(SALES_BODY);
    expect(laidOut('customer-engagement-brief', ENGAGEMENT_BODY)).toBe(ENGAGEMENT_BODY);
    expect(laidOut('enterprise-ai-challenge', NEWER)).toBe(NEWER);
    expect(laidOut('enterprise-ai-challenge', CHALLENGE_BODY)).toBe(CHALLENGE_BODY);
  });

  it('turns only a whole bold line into a heading, and only the brief’s own closing names', () => {
    const body = 'Intro.\n\n**What I should remember today:** inline text stays.\n\n**Development to watch closely**\nStays a label.\n\n- **What I should remember today**';
    expect(laidOut('enterprise-ai-sales-brief', body)).toBe('Intro.\n\n**What I should remember today:** inline text stays.\n\n**Development to watch closely**\n\nStays a label.\n\n- **What I should remember today**');
  });
});

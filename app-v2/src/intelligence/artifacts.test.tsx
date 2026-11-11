// ChatGPT's own messages in imported editions (INT-47): only the exact
// sentences, only where they stood, are left out of the reading, which says
// so; briefing text that mentions a pause or a schedule is never touched.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setAside, asideNote } from './artifacts';
import { parseEdition } from './parse';
import { EditionReader } from './EditionReader';
import { CHALLENGE_FILE } from './test-fixtures';

const INACTIVITY = 'I noticed you haven’t viewed this scheduled task in a while. Would you like me to keep it running?';
const PAUSED = "I've paused this task because updates haven't been viewed in a while. You can resume it in the Scheduled tab or by asking ChatGPT.";
const BRIEF = '# Sales Brief — 1 May\n\n## Executive take\n\nVendor A paused its agent pilot.\n\n## Development to watch\n\nWhether others follow.';

describe('ChatGPT’s own messages', () => {
  it('leaves out its inactivity question or pause note when it is the last paragraph', () => {
    for (const [text, kind] of [[INACTIVITY, 'inactivity'], [PAUSED, 'paused'], [INACTIVITY.replace('’', "'"), 'inactivity']] as const) {
      const r = setAside(`${BRIEF}\n\n${text}\n`);
      expect(r.body).toBe(BRIEF);
      expect(r.aside).toEqual([{ kind, where: 'end', text }]);
    }
  });

  it('leaves out a set-up confirmation before the first heading, with its list', () => {
    const lead = 'Scheduled successfully for every Sunday evening, starting 3 May.\n\n\nEach briefing will include:\n\n- Developments\n- Questions';
    const r = setAside(`${lead}\n\n\n${BRIEF}`);
    expect(r.body).toBe(BRIEF);
    expect(r.aside).toEqual([{ kind: 'setup', where: 'start', text: lead }]);
  });

  it('touches nothing else: the same words inside a paragraph, a longer paragraph, or a lead of other words', () => {
    const cases = [
      `${BRIEF}\n\nThe vendor said: “${PAUSED}”`,
      `${BRIEF}\n\n${INACTIVITY} The team will decide on Monday.`,
      `${BRIEF}\n\n${PAUSED}\n\nOne more paragraph of the briefing.`,
      `Scheduled maintenance at Vendor B delayed the launch.\n\n${BRIEF}`,
      `${BRIEF}\n\nScheduled successfully for every Sunday.`,
      BRIEF,
    ];
    for (const body of cases) expect(setAside(body)).toEqual({ body, aside: [] });
  });

  it('the reader shows the briefing without it, and says what was left out; the edition keeps it', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = function scrollTo() {};
    const doc = `---\nschema_version: 1\ncontent_type: "enterprise-ai-challenge"\nedition_date: "2026-10-06"\ngenerated_at: "2026-10-06T09:05:00+02:00"\norigin: "backfill"\ntitle: "T"\ntopics: []\n---\n\n${BRIEF}\n\n\n${PAUSED}\n`;
    const edition = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, name: '2026-10-06_0905__enterprise-ai-challenge' }, doc);
    expect(edition.issues).toEqual([]);
    expect(edition.markdownBody).not.toContain('paused this task');
    expect(edition.setAside.map(a => a.kind)).toEqual(['paused']);
    const { container } = render(<EditionReader edition={edition} scroller={{ current: document.createElement('div') }} onNote={() => {}} />);
    expect(container.textContent).not.toContain('Scheduled tab');
    expect(screen.getByText(asideNote(edition.setAside[0]))).toBeInTheDocument();
    expect(container.textContent).toContain('Whether others follow.');
  });
});

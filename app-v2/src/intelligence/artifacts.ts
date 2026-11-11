// ChatGPT's own messages that came into a few imported editions with the
// reply they followed (INT-47): a scheduled task's set-up confirmation, its
// question whether to keep the task running, and its note that it paused the
// task. They are not briefing text. The reader leaves them out and says so;
// the Drive document keeps them. Only these exact sentences, in these places
// (the set-up before the first heading, the other two as the last
// paragraph), are taken: a briefing that mentions a pause or a schedule in
// its own words is never touched.

export type AsideKind = 'setup' | 'inactivity' | 'paused';

export interface SetAside {
  kind: AsideKind;
  /** Where it stood: before the briefing or after it. */
  where: 'start' | 'end';
  /** As written. */
  text: string;
}

const SETUP = /^Scheduled successfully for /;
const LAST: [AsideKind, RegExp][] = [
  ['inactivity', /^I noticed you haven't viewed this scheduled task in a while\. Would you like me to keep it running\?$/],
  ['paused', /^I've paused this task because updates haven't been viewed in a while\. You can resume it in the Scheduled tab or by asking ChatGPT\.$/],
];

const plain = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** The body without ChatGPT's own messages, and what was left out. */
export function setAside(body: string): { body: string; aside: SetAside[] } {
  const aside: SetAside[] = [];
  let rest = body;

  const heading = /(?:^|\n)#{1,6}[ \t]/.exec(rest);
  if (heading && heading.index > 0) {
    const lead = rest.slice(0, heading.index).trim();
    if (SETUP.test(lead)) {
      aside.push({ kind: 'setup', where: 'start', text: lead });
      rest = rest.slice(heading.index).replace(/^\n+/, '');
    }
  }

  const trimmed = rest.replace(/\s+$/, '');
  const gap = [...trimmed.matchAll(/\n[ \t]*\n/g)].pop();
  if (gap) {
    const last = trimmed.slice(gap.index + gap[0].length);
    const kind = LAST.find(([, re]) => re.test(plain(last)))?.[0];
    if (kind) {
      aside.push({ kind, where: 'end', text: last.trim() });
      rest = trimmed.slice(0, gap.index);
    }
  }

  return aside.length ? { body: rest, aside } : { body, aside };
}

/** What the reader says in its place. */
export function asideNote(a: SetAside): string {
  const what = a.kind === 'setup' ? 'ChatGPT’s confirmation that the task was set up'
    : a.kind === 'inactivity' ? 'ChatGPT asking whether to keep the task running'
      : 'ChatGPT’s note that it paused the task';
  return `Left out here: ${what}. It is in the original.`;
}

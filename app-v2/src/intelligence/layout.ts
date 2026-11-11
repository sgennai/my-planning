// The briefs as their tasks lay them out now (INT-48). Since 6 November the
// Sales Brief writes its themes as a bold line ("**Relevant executive themes
// today:** A • B") and, since 8 November, its closing sections ("**What I
// should remember today**", "**Development to watch**"…) as bold lines rather
// than headings, with each part's text on the line right under its label.
// Under Markdown's rules a label and the line under it make one paragraph
// ("What happened Confirmed fact: …"), and without its headings the reader
// cannot find the developments. Read here as the earlier editions wrote them:
// those exact labels become the headings they were, and a label line stands
// apart from its text. No word changes; the document itself is untouched.
import type { FeedId } from './feeds';

/** A line that is only a bold label; trailing spaces (a hard break) aside. */
const LABEL_LINE = /^\*\*((?:(?!\*\*)[^\n]){1,80}?)\*\*:?[ \t]*$/;
const THEMES = /^\*\*Relevant executive themes today:?\*\*:?[ \t]+(\S.*?)[ \t]*$/i;
/** The Sales Brief's closing sections, as its earlier editions headed them. */
const CLOSING = /^(?:what i should remember today|best executive question today|contrarian(?: or non-obvious)? insight|development to (?:watch|monitor)(?: next(?: week)?)?)$/i;
const FENCE = /^[ \t]{0,3}(?:`{3,}|~{3,})/;

/** A brief's body laid out as its earlier editions were; the AI Challenge's as written. */
export function laidOut(feedId: FeedId, body: string): string {
  if (feedId === 'enterprise-ai-challenge') return body;
  const sales = feedId === 'enterprise-ai-sales-brief';
  const lines = body.split('\n');
  const out: string[] = [];
  const heading = (title: string) => {
    if (out.length && out[out.length - 1].trim()) out.push('');
    out.push(`## ${title}`, '');
  };
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced || FENCE.test(line)) { out.push(line); return; }
    const themes = sales ? THEMES.exec(line) : null;
    if (themes) {
      heading('Relevant executive themes today');
      // "A • B" in bold, as the earlier editions wrote it, shows as the themes; other text stays as written.
      out.push(themes[1].includes('•') && !themes[1].includes('**') ? `**${themes[1]}**` : themes[1]);
      return;
    }
    const label = LABEL_LINE.exec(line);
    if (label && sales && CLOSING.test(label[1].replace(/:$/, '').trim())) {
      heading(label[1].replace(/:$/, '').trim());
      return;
    }
    if (label && lines[i + 1]?.trim()) {
      out.push(line.replace(/[ \t]+$/, ''), '');
      return;
    }
    out.push(line);
  });
  return out.join('\n');
}

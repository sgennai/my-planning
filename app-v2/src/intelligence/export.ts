// Takeaways as a Markdown file to keep or send (INT-43, decision D15): what
// the list shows, newest first, each item with what it is, where it came from
// (feed, date, edition, section, the Google Doc's link), the words as kept,
// and your note and tags. The words are quoted line by line, as written, so
// their own headings, lists and links survive without breaking the file's
// structure. The full JSON backup in Settings is unchanged.
import type { SavedInsight } from './saved';
import { feedById } from './feeds';
import { shortTitle } from './present';
import { clockOf, dayKeyOf, dayNameShort, formatDayAnchor, formatDayCompact, type DayKey } from '../routine/dates';

/** Plain text in a heading, an emphasis or a link: its Markdown characters are taken literally. */
const literal = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, '\\$1');

/** Quoted line by line; a run of blank lines is one, which changes no Markdown. */
const quoted = (text: string) => text.trim().replace(/\n[ \t]*(?:\n[ \t]*)+\n/g, '\n\n')
  .split('\n').map(line => (line.trim() ? `> ${line}` : '>')).join('\n');

const dayOf = (day: DayKey) => `${dayNameShort(day)} ${formatDayCompact(day)} ${day.slice(0, 4)}`;

function headingOf(item: SavedInsight): string {
  switch (item.kind) {
    case 'edition': return `Edition · ${literal(item.editionTitle)}`;
    case 'section': return `Section · ${literal(item.sectionTitle ?? item.editionTitle)}`;
    case 'term': return `Vocabulary · ${literal(item.label ?? '')}`;
    case 'passage': return 'Passage';
    default: return literal(item.label ?? 'Saved');
  }
}

function itemOf(item: SavedInsight): string {
  const from = [
    feedById(item.feedId)?.label ?? item.feedId,
    `${dayOf(item.editionDate)}${item.editionTime ? `, ${item.editionTime}` : ''}`,
    ...(item.kind === 'edition' ? [] : [literal(item.editionTitle)]),
    ...(item.sectionTitle && item.kind !== 'section' ? [literal(shortTitle(item.sectionTitle))] : []),
  ].join(' · ');
  const parts = [`## ${headingOf(item)}`, `*${from}*`];
  if (item.kind !== 'edition') parts.push(quoted(item.text));
  if (item.note.trim()) parts.push(`**Note:** ${item.note.trim().replace(/\n/g, '  \n')}`);
  if (item.tags.length) parts.push(`**Tags:** ${item.tags.map(literal).join(', ')}`);
  parts.push(`[Open the original in Google Docs](${item.sourceUrl}) · kept on ${dayOf(dayKeyOf(new Date(item.savedAt)))}`);
  return parts.join('\n\n');
}

export interface ExportOptions {
  /** When it was exported, for the header. */
  now: Date;
  /** What narrowed the list, if anything: "matching “cio”", "tagged banking". */
  narrowedBy?: string | null;
}

export function takeawaysMarkdown(items: SavedInsight[], { now, narrowedBy }: ExportOptions): string {
  // Written out here rather than by the browser's locale, which words it differently by engine.
  const today = dayKeyOf(now);
  const when = `${formatDayAnchor(today)} ${today.slice(0, 4)} at ${clockOf(now)}`;
  const count = `${items.length} ${items.length === 1 ? 'takeaway' : 'takeaways'}`;
  const head = [
    '# Takeaways',
    `Exported from My Planning · Intelligence on ${when} (Paris time). ${count}, newest first${narrowedBy ? `, only those ${narrowedBy}` : ''}.`,
  ].join('\n\n');
  return `${[head, ...items.map(itemOf)].join('\n\n---\n\n')}\n`;
}

/** takeaways-2026-11-03.md, by the Paris day. */
export const exportFileName = (now: Date) => `takeaways-${dayKeyOf(now)}.md`;

/**
 * Hands the file over: the share sheet on an iPad or iPhone (Save to Files,
 * Mail…), a download elsewhere or when sharing a file is not possible.
 * Resolves to false only when the share sheet was dismissed.
 */
export async function handOver(name: string, text: string): Promise<boolean> {
  const file = new File([text], name, { type: 'text/plain' });
  if (navigator.maxTouchPoints > 0 && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Takeaways' });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // Anything else: download instead.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

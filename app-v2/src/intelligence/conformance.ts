// Whether each edition is what a scheduled run should publish, said plainly
// and never by hiding anything: a header that breaks the format, two documents
// with the same name (both kept), a document with no briefing in it, and where
// the edition came from when its header says so.
//
// A document a few minutes old may still be being written, so nothing is
// called incomplete or malformed until it has had time to finish; each refresh
// checks again. Whether a scheduled run is late or missing is for feed health,
// which knows the schedules; this only reports what Drive holds.
import type { Edition } from './parse';
import { citationsIn } from './citations';

/** How long a new document may take to be written before it is judged. */
export const WRITING_GRACE_MS = 30 * 60 * 1000;
/** Created this long after its stated time: probably imported by hand. */
const IMPORT_GAP_MS = 6 * 60 * 60 * 1000;

export type EditionFlag =
  /** Created moments ago and not yet complete or well-formed. */
  | { kind: 'writing' }
  /** No briefing text after the header. */
  | { kind: 'incomplete' }
  /** The header breaks contract v1; the edition reads with fallbacks. */
  | { kind: 'format'; issues: string[] }
  /** Another document in the feed has the same name. */
  | { kind: 'duplicate'; copies: number }
  /** ChatGPT citation markers with no link: sources that cannot be followed. */
  | { kind: 'citations'; count: number }
  /** `origin: "backfill"`. */
  | { kind: 'imported' }
  /** No `origin`, and created in Drive long after its stated time. Never proof. */
  | { kind: 'possibly-imported'; hours: number };

export interface FeedConformance {
  flags: Map<string, EditionFlag[]>;
  /** Every flag that wants attention, edition by edition, newest first. */
  problems: { edition: Edition; flag: EditionFlag }[];
  /** The newest edition whose header says a scheduled run published it. */
  lastScheduled: Edition | null;
}

/** Flags that make the feed's status line ask for a look. */
export const NEEDS_A_LOOK: EditionFlag['kind'][] = ['incomplete', 'format', 'duplicate', 'citations'];

const age = (e: Edition, now: number) => now - Date.parse(e.createdTime ?? e.modifiedTime);

export function conformanceOf(editions: Edition[], now: number): FeedConformance {
  const byName = new Map<string, number>();
  for (const e of editions) byName.set(e.fileName, (byName.get(e.fileName) ?? 0) + 1);

  const flags = new Map<string, EditionFlag[]>();
  const problems: FeedConformance['problems'] = [];
  for (const e of editions) {
    const list: EditionFlag[] = [];
    const empty = !e.markdownBody.trim();
    if ((empty || e.issues.length) && age(e, now) < WRITING_GRACE_MS) list.push({ kind: 'writing' });
    else {
      if (empty) list.push({ kind: 'incomplete' });
      if (e.issues.length) list.push({ kind: 'format', issues: e.issues });
    }
    const markers = citationsIn(e.markdownBody).length;
    if (markers) list.push({ kind: 'citations', count: markers });
    const copies = byName.get(e.fileName) ?? 1;
    if (copies > 1) list.push({ kind: 'duplicate', copies });
    if (e.origin === 'backfill') list.push({ kind: 'imported' });
    if (!e.origin && e.generatedAt && e.createdTime) {
      const gap = Date.parse(e.createdTime) - Date.parse(e.generatedAt);
      if (gap > IMPORT_GAP_MS) list.push({ kind: 'possibly-imported', hours: Math.round(gap / 3_600_000) });
    }
    if (list.length) flags.set(e.driveFileId, list);
    for (const flag of list) if (flag.kind !== 'imported') problems.push({ edition: e, flag });
  }
  return { flags, problems, lastScheduled: editions.find(e => e.origin === 'scheduled') ?? null };
}

/** One line for an edition's notice, or null for flags that are labels only. */
export function noticeOf(flag: EditionFlag): string | null {
  switch (flag.kind) {
    case 'writing': return 'Created a few minutes ago and may still be being written. It is checked again on each refresh.';
    case 'incomplete': return 'This document has no briefing text after its header. It may not have finished publishing.';
    case 'format': return `This document doesn't follow the publication format (${flag.issues.join('; ')}). It is shown as written, with the date and title taken from what is there.`;
    case 'duplicate': return `${flag.copies} documents in this feed have the same name. All of them are kept.`;
    case 'citations': return `${flag.count === 1 ? 'One source is' : `${flag.count} sources are`} cited with a ChatGPT marker instead of a link, shown as “source not linked”. No link is guessed; the publishing task should write the source's own link.`;
    case 'possibly-imported': return `Its header doesn't say how it was published, and Drive created it ${flag.hours} h after its stated time: it was probably imported by hand.`;
    default: return null;
  }
}

/** The one short label an edition carries in lists, most important first. */
export function labelOf(list: EditionFlag[] | undefined): string | null {
  const kinds = new Set((list ?? []).map(f => f.kind));
  if (kinds.has('writing')) return 'Being written';
  if (kinds.has('incomplete')) return 'Incomplete';
  if (kinds.has('duplicate')) return 'Duplicate';
  if (kinds.has('citations')) return 'Unlinked sources';
  if (kinds.has('format')) return 'Format issue';
  if (kinds.has('imported')) return 'Imported';
  return null;
}

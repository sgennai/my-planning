// Merging a synced record that both devices changed since they last synced.
//
// Most records are small and last-write-wins is fine. The routine's activity
// list is not: it is one record holding every activity, so a device that had
// not caught up and saved anything (an edit, or the start-up migration that
// adjusts seeded labels and photos) used to replace the whole list and erase
// the other device's newer edits. Each activity carries its own `updatedAt`,
// stamped by every real edit (settings, reorder, archive, the Plan screen) and
// never by a migration, so the two lists merge activity by activity.

interface Stamped {
  id: string;
  updatedAt?: string;
}

/**
 * Both lists, one entry per activity id: the more recently edited version of
 * each, with an activity added on either side kept. On a tie the local one
 * stays, which is what this device last showed. Nothing is ever dropped, as
 * activities are archived, not deleted.
 */
export function mergeActivityLists<T extends Stamped>(local: T[], remote: T[]): T[] {
  const theirs = new Map(remote.map(a => [a.id, a]));
  const merged = local.map(a => {
    const r = theirs.get(a.id);
    if (!r) return a;
    theirs.delete(a.id);
    return (r.updatedAt ?? '') > (a.updatedAt ?? '') ? r : a;
  });
  return [...merged, ...theirs.values()];
}

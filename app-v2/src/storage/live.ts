// The app's working copy of its data, and the one way to change it.
//
// An edit replaces the working copy at once, so the screen shows it straight
// away, and is saved in the order it was made. After a sync has written other
// devices' changes into the database, `refresh` swaps in what the database
// now holds, but only at a moment when every edit made so far is saved and
// none arrived while it read. Swapping at any other moment let a copy read a
// moment before a tap replace the copy that had it, and the next save then
// marked the tap's record deleted: a tick made during a sync could vanish.
import { readData, saveData, adoptSnapshot } from './db';

/** Reads that kept being overtaken by edits before `refresh` gives up for now. */
const MAX_READS = 5;

export interface LiveData<T> {
  /** The copy the screen shows. */
  current(): T | null;
  /** Start from `data`, as just loaded and saved at start-up. */
  start(data: T): void;
  /** Show `next` now and save it after any edit still being saved. */
  edit(next: T): Promise<void>;
  /**
   * Show what the database holds, once it holds every edit made so far.
   * False when edits kept arriving, or the database is empty: the working
   * copy stays, and `behind` says a later refresh is still owed.
   */
  refresh(): Promise<boolean>;
  /** A refresh gave up and the database holds changes the screen lacks. */
  behind(): boolean;
}

interface Store<T> {
  read: () => Promise<T | null>;
  save: (data: T) => Promise<void>;
  adopt: (data: T) => void;
}

const DATABASE: Store<unknown> = { read: readData, save: saveData, adopt: adoptSnapshot };

export function createLiveData<T>(show: (data: T) => void, store = DATABASE as Store<T>): LiveData<T> {
  let working: T | null = null;
  let edits = 0;
  let saved: Promise<unknown> = Promise.resolve();
  let owed = false;

  /** Resolves once no save is running or queued. */
  async function settled() {
    let last;
    do { last = saved; await last; } while (last !== saved);
  }

  return {
    current: () => working,
    start(data) { working = data; },
    edit(next) {
      edits += 1;
      working = next;
      show(next);
      const save = saved.then(() => store.save(next));
      saved = save.catch(() => {});
      return save;
    },
    async refresh() {
      for (let i = 0; i < MAX_READS; i++) {
        await settled();
        const seen = edits;
        const fresh = await store.read();
        if (edits !== seen) continue;
        if (!fresh) return false;
        // Nothing can run between these lines, so the baseline and the screen
        // change together.
        store.adopt(fresh);
        working = fresh;
        owed = false;
        show(fresh);
        return true;
      }
      owed = true;
      return false;
    },
    behind: () => owed,
  };
}

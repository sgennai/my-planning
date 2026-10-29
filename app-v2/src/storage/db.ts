import { mergeActivityLists } from './merge';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'my-planning-db';
const DB_VERSION = 1;

export const STORES = {
  PROJECTS: 'projects',
  TODOS: 'todos',
  SCHEDULED_BLOCKS: 'scheduledBlocks',
  PRACTICE_ITEMS: 'practiceItems',
  STORIES: 'stories',
  REVIEWS: 'reviews',
  PROGRESS_LOG: 'progressLog',
  MODULES: 'modules',
  LEARNING: 'learning',
  CONTENT: 'content',
  CREATE_IDEAS: 'create_ideas',
  CREATE_POSTS: 'create_posts',
  SINGLETONS: 'singletons' // prefs, routine, userProfile, featureFlags, etc.
};

let dbPromise: Promise<IDBPDatabase> | null = null;
let currentSnapshot: any = null;

export function _resetForTest() {
  currentSnapshot = null;
}

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt');
          }
        });
      },
    });
  }
  return dbPromise;
}

// Helpers for generic deep equality to check if a record changed
function deepEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    // Ignore updatedAt for diff purposes
    if (k === 'updatedAt') continue;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export async function loadData() {
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readonly');
  
  // Singletons
  const [
    schemaVersionRec, createdAtRec, lastModifiedRec,
    prefsRec, featureFlagsRec, userProfileRec,
    routineRec, routineActivitiesRec, routineArchiveRec, overridesRec, routineCompletionsRec, calendarsRec,
    elsewhereTogglesRec, weatherRec,
    inboxRec, referenceLibraryRec, practiceContentRec, interviewPrepRec,
    completedActionsRec, todoistRec, todoistSlotsRec, todoistPendingRec
  ] = await Promise.all([
    tx.objectStore(STORES.SINGLETONS).get('schemaVersion'),
    tx.objectStore(STORES.SINGLETONS).get('createdAt'),
    tx.objectStore(STORES.SINGLETONS).get('lastModified'),
    tx.objectStore(STORES.SINGLETONS).get('prefs'),
    tx.objectStore(STORES.SINGLETONS).get('featureFlags'),
    tx.objectStore(STORES.SINGLETONS).get('userProfile'),
    tx.objectStore(STORES.SINGLETONS).get('routine'),
    tx.objectStore(STORES.SINGLETONS).get('routineActivities'),
    tx.objectStore(STORES.SINGLETONS).get('routineArchive'),
    tx.objectStore(STORES.SINGLETONS).get('overrides'),
    tx.objectStore(STORES.SINGLETONS).get('routineCompletions'),
    tx.objectStore(STORES.SINGLETONS).get('calendars'),
    tx.objectStore(STORES.SINGLETONS).get('elsewhereToggles'),
    tx.objectStore(STORES.SINGLETONS).get('weather'),
    tx.objectStore(STORES.SINGLETONS).get('inbox'),
    tx.objectStore(STORES.SINGLETONS).get('referenceLibrary'),
    tx.objectStore(STORES.SINGLETONS).get('practiceContent'),
    tx.objectStore(STORES.SINGLETONS).get('interviewPrep'),
    tx.objectStore(STORES.SINGLETONS).get('completedActions'),
    tx.objectStore(STORES.SINGLETONS).get('todoist'),
    tx.objectStore(STORES.SINGLETONS).get('todoistSlots'),
    tx.objectStore(STORES.SINGLETONS).get('todoistPending')
  ]);

  // If no schema version, DB is empty
  if (!schemaVersionRec) {
    return null;
  }

  // Load collections
  const loadList = async (store: string) => {
    const all = await tx.objectStore(store).getAll();
    // Filter out tombstones
    return all.filter(r => !r._deleted);
  };

  const projects = await loadList(STORES.PROJECTS);
  const todos = await loadList(STORES.TODOS);
  const scheduledBlocks = await loadList(STORES.SCHEDULED_BLOCKS);
  const practiceItems = await loadList(STORES.PRACTICE_ITEMS);
  const stories = await loadList(STORES.STORIES);
  const reviews = await loadList(STORES.REVIEWS);
  const progressLog = await loadList(STORES.PROGRESS_LOG);
  const modules = await loadList(STORES.MODULES);
  const learning = await loadList(STORES.LEARNING);
  const content = await loadList(STORES.CONTENT);
  const createIdeas = await loadList(STORES.CREATE_IDEAS);
  const createPosts = await loadList(STORES.CREATE_POSTS);

  const data = {
    schemaVersion: schemaVersionRec.value,
    createdAt: createdAtRec ? createdAtRec.value : new Date().toISOString(),
    lastModified: lastModifiedRec ? lastModifiedRec.value : new Date().toISOString(),
    prefs: prefsRec ? prefsRec.value : undefined,
    featureFlags: featureFlagsRec ? featureFlagsRec.value : undefined,
    userProfile: userProfileRec ? userProfileRec.value : undefined,
    
    routine: routineRec ? routineRec.value : [],
    routineActivities: routineActivitiesRec ? routineActivitiesRec.value : [],
    routineArchive: routineArchiveRec ? routineArchiveRec.value : undefined,
    overrides: overridesRec ? overridesRec.value : {},
    routineCompletions: routineCompletionsRec ? routineCompletionsRec.value : {},
    calendars: calendarsRec ? calendarsRec.value : {},
    elsewhereToggles: elsewhereTogglesRec ? elsewhereTogglesRec.value : {},
    weather: weatherRec ? weatherRec.value : {},
    inbox: inboxRec ? inboxRec.value : [],
    referenceLibrary: referenceLibraryRec ? referenceLibraryRec.value : [],
    practiceContent: practiceContentRec ? practiceContentRec.value : undefined,
    interviewPrep: interviewPrepRec ? interviewPrepRec.value : undefined,
    completedActions: completedActionsRec ? completedActionsRec.value : [],
    todoist: todoistRec ? todoistRec.value : undefined,
    todoistSlots: todoistSlotsRec ? todoistSlotsRec.value : {},
    todoistPending: todoistPendingRec ? todoistPendingRec.value : [],

    projects,
    todos,
    scheduledBlocks,
    practiceItems,
    stories,
    weeklyResets: reviews,
    progressLog,
    modules,
    learning,
    content,
    create: { ideas: createIdeas, posts: createPosts }
  };

  currentSnapshot = JSON.parse(JSON.stringify(data));
  return data;
}

export async function saveData(nextData: any) {
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  const now = new Date().toISOString();
  
  if (!currentSnapshot) {
    currentSnapshot = {};
  }

  // Helper to diff and persist collections
  const syncCollection = (storeName: string, nextList: any[], prevList: any[]) => {
    const store = tx.objectStore(storeName);
    const nextMap = new Map((nextList || []).map(r => [r.id, r]));
    const prevMap = new Map((prevList || []).map(r => [r.id, r]));

    // Check for additions and updates
    for (const [id, nextRecord] of nextMap.entries()) {
      const prevRecord = prevMap.get(id);
      if (!prevRecord || !deepEqual(nextRecord, prevRecord)) {
        const recordToSave = { ...nextRecord, updatedAt: now };
        store.put(recordToSave);
      }
    }

    // Check for deletions (tombstoning)
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        store.put({ id, _deleted: true, updatedAt: now });
      }
    }
  };

  // Helper to sync singletons
  const syncSingleton = (key: string, nextVal: any, prevVal: any) => {
    if (!deepEqual(nextVal, prevVal)) {
      tx.objectStore(STORES.SINGLETONS).put({ id: key, value: nextVal, updatedAt: now });
    }
  };

  syncSingleton('schemaVersion', nextData.schemaVersion, currentSnapshot.schemaVersion);
  syncSingleton('createdAt', nextData.createdAt, currentSnapshot.createdAt);
  syncSingleton('lastModified', nextData.lastModified, currentSnapshot.lastModified);
  syncSingleton('prefs', nextData.prefs, currentSnapshot.prefs);
  syncSingleton('featureFlags', nextData.featureFlags, currentSnapshot.featureFlags);
  syncSingleton('userProfile', nextData.userProfile, currentSnapshot.userProfile);
  syncSingleton('routine', nextData.routine, currentSnapshot.routine);
  syncSingleton('routineActivities', nextData.routineActivities, currentSnapshot.routineActivities);
  syncSingleton('routineArchive', nextData.routineArchive, currentSnapshot.routineArchive);
  syncSingleton('overrides', nextData.overrides, currentSnapshot.overrides);
  syncSingleton('routineCompletions', nextData.routineCompletions, currentSnapshot.routineCompletions);
  syncSingleton('calendars', nextData.calendars, currentSnapshot.calendars);
  syncSingleton('elsewhereToggles', nextData.elsewhereToggles, currentSnapshot.elsewhereToggles);
  syncSingleton('weather', nextData.weather, currentSnapshot.weather);
  syncSingleton('inbox', nextData.inbox, currentSnapshot.inbox);
  syncSingleton('referenceLibrary', nextData.referenceLibrary, currentSnapshot.referenceLibrary);
  
  // These objects might be removed eventually once everything is in practiceItems and stories
  syncSingleton('practiceContent', nextData.practiceContent, currentSnapshot.practiceContent);
  syncSingleton('interviewPrep', nextData.interviewPrep, currentSnapshot.interviewPrep);

  // Project action history + Todoist config/state (token, project, AM/PM slots,
  // pending tasks). Previously omitted here, so they were lost on reload/sync.
  syncSingleton('completedActions', nextData.completedActions, currentSnapshot.completedActions);
  syncSingleton('todoist', nextData.todoist, currentSnapshot.todoist);
  syncSingleton('todoistSlots', nextData.todoistSlots, currentSnapshot.todoistSlots);
  syncSingleton('todoistPending', nextData.todoistPending, currentSnapshot.todoistPending);

  syncCollection(STORES.PROJECTS, nextData.projects, currentSnapshot.projects);
  syncCollection(STORES.TODOS, nextData.todos, currentSnapshot.todos);
  syncCollection(STORES.SCHEDULED_BLOCKS, nextData.scheduledBlocks, currentSnapshot.scheduledBlocks);
  syncCollection(STORES.PRACTICE_ITEMS, nextData.practiceItems, currentSnapshot.practiceItems);
  syncCollection(STORES.STORIES, nextData.stories, currentSnapshot.stories);
  syncCollection(STORES.REVIEWS, nextData.weeklyResets, currentSnapshot.weeklyResets);
  syncCollection(STORES.PROGRESS_LOG, nextData.progressLog, currentSnapshot.progressLog);
  syncCollection(STORES.MODULES, nextData.modules, currentSnapshot.modules);
  syncCollection(STORES.LEARNING, nextData.learning, currentSnapshot.learning);
  syncCollection(STORES.CONTENT, nextData.content, currentSnapshot.content);
  
  if (nextData.create) {
    syncCollection(STORES.CREATE_IDEAS, nextData.create.ideas, currentSnapshot.create?.ideas);
    syncCollection(STORES.CREATE_POSTS, nextData.create.posts, currentSnapshot.create?.posts);
  }

  await tx.done;
  currentSnapshot = JSON.parse(JSON.stringify(nextData));
}

// For the import/export functionality
export function exportDataBlob(data: any) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-planning-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDataBlob(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Wipe existing DB for a clean import
        const db = await initDB();
        const tx = db.transaction(Object.values(STORES), 'readwrite');
        for (const storeName of Object.values(STORES)) {
          tx.objectStore(storeName).clear();
        }
        await tx.done;
        
        // Reset snapshot and save
        currentSnapshot = null;
        await saveData(data);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export interface SyncResult {
  pulledIds: { id: string; storeName: string }[];
  error: Error | null;
}

// Set on a fresh device (empty IndexedDB) when the initial pull from the Worker
// fails (offline, Worker down, auth error). Cleared after the first successful pull.
// While set, syncData() skips push and force-applies all remote records, preventing
// local defaults (stamped updatedAt=now) from overwriting the Worker's authoritative
// data via last-write-wins. Trade-off: offline edits made before this first sync are
// overwritten on next online sync — correct for a personal single-user app.
export const NEEDS_INITIAL_PULL_KEY = 'my-planning-needs-initial-pull';

export async function pullAndReplaceFromWorker(
  syncUrl: string,
  secret: string
): Promise<{ ok: boolean; error: Error | null }> {
  if (!syncUrl || !secret) return { ok: false, error: null };
  const normalizedUrl = syncUrl.replace(/\/+$/, '');
  const db = await initDB();
  try {
    const res = await fetch(`${normalizedUrl}/sync/pull?since=1970-01-01T00:00:00.000Z`, {
      headers: { 'X-Sync-Secret': secret }
    });
    if (!res.ok) throw new Error(`Pull failed: ${res.statusText}`);
    const { records = [], cursor } = await res.json();
    if (typeof cursor === 'string') localStorage.setItem(SYNC_CURSOR_KEY, cursor);
    if (records.length > 0) {
      const tx = db.transaction(Object.values(STORES), 'readwrite');
      for (const rec of records) {
        if (!Object.values(STORES).includes(rec.storeName)) continue;
        const store = tx.objectStore(rec.storeName);
        if (rec.deleted) {
          await store.put({ id: rec.id, _deleted: true, updatedAt: rec.updatedAt });
        } else {
          // Unconditional write — no LWW check. On initial device boot the Worker is
          // authoritative regardless of local timestamps.
          await store.put({ ...rec.payload, updatedAt: rec.updatedAt });
        }
      }
      await tx.done;
    }
    console.info('[sync] first-load pull from Worker:', { records: records.length });
    return { ok: true, error: null };
  } catch (e) {
    console.warn('[sync] first-load pull failed, will retry; offline edits at risk', e);
    return { ok: false, error: e as Error };
  }
}

// The server's own marker of what this device has already pulled. Records are
// listed by when they reached the server, not by the time the sending device
// stamped on them: a device that was offline uploads changes stamped hours
// ago, and a cursor made of those stamps let a device that synced meanwhile
// skip them for good. An older Worker sends no marker, and the device falls
// back to its own last-sync time as before.
export const SYNC_CURSOR_KEY = 'my-planning-sync-cursor';
const SYNC_TIME_KEY = 'my-planning-sync-time';

const ACTIVITY_LIST_ID = 'routineActivities';

/** One millisecond later than an ISO time: a merged record has to beat both sides. */
function after(iso: string): string {
  return new Date(new Date(iso).getTime() + 1).toISOString();
}

export async function syncData(syncUrl: string, secret: string): Promise<SyncResult> {
  if (!syncUrl || !secret) return { pulledIds: [], error: null };

  // Fresh-device guard: flag is set when the initial pull on first boot failed
  // (offline, Worker down). Skip push entirely and force-apply all remote records.
  // Prevents local defaults (updatedAt=now) from overwriting the Worker's canonical
  // data via last-write-wins. Cleared after first successful pull.
  if (localStorage.getItem(NEEDS_INITIAL_PULL_KEY) === 'true') {
    const { ok, error } = await pullAndReplaceFromWorker(syncUrl, secret);
    if (!ok) return { pulledIds: [], error };
    localStorage.removeItem(NEEDS_INITIAL_PULL_KEY);
    localStorage.setItem(SYNC_TIME_KEY, new Date().toISOString());
    return { pulledIds: [{ id: 'initial', storeName: STORES.SINGLETONS }], error: null };
  }

  const normalizedUrl = syncUrl.replace(/\/+$/, '');
  const db = await initDB();
  const lastSyncStr = localStorage.getItem(SYNC_TIME_KEY) || '1970-01-01T00:00:00.000Z';
  const since = localStorage.getItem(SYNC_CURSOR_KEY) || lastSyncStr;
  // Taken before gathering: anything saved after this point stays dirty for
  // the next sync.
  const mark = new Date().toISOString();

  // What this device changed since it last synced, keyed store:id.
  const dirty = new Map<string, { storeName: string; id: string; payload: any; updatedAt: string; deleted: boolean }>();
  const toPush = (storeName: string, r: any) => {
    const payload = { ...r };
    delete payload.updatedAt;
    delete payload._deleted;
    return { storeName, id: r.id, payload, updatedAt: r.updatedAt, deleted: !!r._deleted };
  };
  const txGather = db.transaction(Object.values(STORES), 'readonly');
  for (const storeName of Object.values(STORES)) {
    for (const r of await txGather.objectStore(storeName).getAll()) {
      if (r.updatedAt > lastSyncStr) dirty.set(`${storeName}:${r.id}`, toPush(storeName, r));
    }
  }
  await txGather.done;

  try {
    // Pull first, so a change made elsewhere is seen before this device's
    // copy goes up: pushing first let a device that had not caught up
    // overwrite the other's newer work.
    const pullRes = await fetch(`${normalizedUrl}/sync/pull?since=${encodeURIComponent(since)}`, {
      headers: { 'X-Sync-Secret': secret }
    });
    if (!pullRes.ok) throw new Error(`Pull failed: ${pullRes.statusText}`);
    const pullData = await pullRes.json();
    const remoteRecords = pullData.records || [];

    const changedEntities: {id: string, storeName: string}[] = [];

    if (remoteRecords.length > 0) {
      const txApply = db.transaction(Object.values(STORES), 'readwrite');
      for (const rec of remoteRecords) {
        if (!Object.values(STORES).includes(rec.storeName)) continue;
        const store = txApply.objectStore(rec.storeName);
        const key = `${rec.storeName}:${rec.id}`;
        const localRec = await store.get(rec.id);
        const mine = dirty.get(key);

        // Both sides changed the activity list: keep each activity's newest
        // edit from either side, and send the result up.
        if (mine && rec.storeName === STORES.SINGLETONS && rec.id === ACTIVITY_LIST_ID
          && localRec && !localRec._deleted && !rec.deleted
          && Array.isArray(localRec.value) && Array.isArray(rec.payload?.value)) {
          const value = mergeActivityLists(localRec.value, rec.payload.value);
          const stamp = [mark, after(rec.updatedAt), after(localRec.updatedAt)].sort().pop()!;
          const merged = { ...localRec, value, updatedAt: stamp };
          await store.put(merged);
          dirty.set(key, toPush(rec.storeName, merged));
          changedEntities.push({ id: rec.id, storeName: rec.storeName });
          continue;
        }

        if (!localRec || rec.updatedAt > localRec.updatedAt) {
          if (rec.deleted) {
            await store.put({ id: rec.id, _deleted: true, updatedAt: rec.updatedAt });
          } else {
            await store.put({ ...rec.payload, updatedAt: rec.updatedAt });
          }
          // The newer remote copy replaces whatever this device had pending.
          dirty.delete(key);
          changedEntities.push({ id: rec.id, storeName: rec.storeName });
        }
      }
      await txApply.done;
    }

    // Push what is still this device's newest.
    if (dirty.size > 0) {
      const pushRes = await fetch(`${normalizedUrl}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': secret },
        body: JSON.stringify([...dirty.values()])
      });
      if (!pushRes.ok) throw new Error(`Push failed: ${pushRes.statusText}`);
    }

    // Both directions succeeded: record where this device stands.
    localStorage.setItem(SYNC_TIME_KEY, mark);
    if (typeof pullData.cursor === 'string') localStorage.setItem(SYNC_CURSOR_KEY, pullData.cursor);
    return { pulledIds: changedEntities, error: null };
  } catch (e) {
    // Fail silently (offline or server error). Changes remain dirty for next sync.
    console.warn('Sync failed silently (will retry next time):', e);
    return { pulledIds: [], error: e as Error };
  }
}


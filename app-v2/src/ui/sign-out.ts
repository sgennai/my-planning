// Signing out of this device. The server forgets the session first (and a
// password the browser remembers stops working here); then the device drops
// what it keeps for reading without the network: the briefings' cache and the
// offline copy of the app, so the next open goes through the sign-in page.
// The app's own database stays: it mirrors synced data and may hold edits not
// yet sent, which go up once you sign back in.
import { INTEL_CACHE_DB } from '../intelligence/cache-name';

export type SignOutResult = 'signed-out' | 'offline' | 'refused';

/** How long a cache deletion may wait on an open connection before moving on. */
const DELETE_WAIT_MS = 3000;

function deleteDatabase(name: string): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, DELETE_WAIT_MS);
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = done;
    request.onerror = done;
  });
}

async function dropOfflineCopy(): Promise<void> {
  const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
  await Promise.all(registrations.map(r => r.unregister()));
  if (typeof caches !== 'undefined') {
    for (const key of await caches.keys()) await caches.delete(key);
  }
}

export async function signOutOfThisDevice(): Promise<SignOutResult> {
  let response: Response;
  try {
    response = await fetch('/__auth/sign-out', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return 'offline';
  }
  // Local development runs without the gate, so without its sign-out either.
  if (!response.ok && response.status !== 404) return 'refused';
  await Promise.allSettled([deleteDatabase(INTEL_CACHE_DB), dropOfflineCopy()]);
  return 'signed-out';
}

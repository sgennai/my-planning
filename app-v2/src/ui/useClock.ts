import { useSyncExternalStore } from 'react';

/**
 * The wall clock, read the way React wants an external mutable source read.
 *
 * `Date.now()` during render is impure: two renders of the same component can
 * disagree. useSyncExternalStore subscribes to the tick instead, and the
 * snapshot is bucketed to `periodMs` so it is stable between ticks — without
 * that, every render would see a new number and loop.
 */
export function useClock(periodMs: number): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = window.setInterval(onChange, periodMs);
      return () => window.clearInterval(id);
    },
    // No getServerSnapshot: this app is client-only, and a stub value here
    // would mean callers have to handle a clock that reads zero.
    () => Math.floor(Date.now() / periodMs) * periodMs,
  );
}

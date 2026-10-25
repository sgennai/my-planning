// Europe/Paris calendar arithmetic.
//
// Every routine date in the app is a "day key": `YYYY-MM-DD` as seen in
// Europe/Paris, regardless of where the device thinks it is. Completion records
// are stored under these keys, so a tick made on the iPad in Plouhinec and one
// made on a Mac in another timezone land on the same day.
//
// Why not Date objects: a Date is an instant, not a day. `new Date()` on a
// device set to UTC-5 is still "yesterday" in Paris for five hours every night,
// which would file a completion under the wrong day and make it vanish from the
// dashboard. Formatting the instant through an Intl formatter pinned to
// Europe/Paris sidesteps the whole class of bug, including DST transitions —
// the formatter owns the offset table, we never compute one.

export const TZ = 'Europe/Paris';

export type DayKey = string; // 'YYYY-MM-DD'

// en-CA renders ISO-ordered dates (2026-10-25), which is exactly the key shape.
const keyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** The Europe/Paris day that `instant` falls in, as `YYYY-MM-DD`. */
export function dayKeyOf(instant: Date = new Date()): DayKey {
  return keyFmt.format(instant);
}

/** Today in Europe/Paris. */
export function todayKey(): DayKey {
  return dayKeyOf(new Date());
}

/** Minutes since Paris midnight for `instant` — 0..1439. */
export function minutesOfDay(instant: Date = new Date()): number {
  const [h, m] = clockFmt.format(instant).split(':').map(Number);
  return h * 60 + m;
}

/** `HH:MM` wall-clock time in Paris for `instant`. */
export function clockOf(instant: Date = new Date()): string {
  return clockFmt.format(instant);
}

// A day key is anchored at noon UTC to read its calendar fields back out. Noon
// is never within 12h of a UTC day boundary, so no timezone offset can push it
// onto an adjacent date — unlike midnight, which would.
function noonUTC(key: DayKey): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Day of week for a day key: 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export function dayOfWeek(key: DayKey): number {
  return noonUTC(key).getUTCDay();
}

/** The day key `n` days after `key` (negative walks backwards). */
export function addDaysKey(key: DayKey, n: number): DayKey {
  const d = noonUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday-first week start for the week containing `key`. */
export function weekStartKey(key: DayKey): DayKey {
  const dow = dayOfWeek(key);
  const backToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysKey(key, backToMonday);
}

/** The seven day keys of the week containing `key`, Monday first. */
export function weekKeys(key: DayKey): DayKey[] {
  const start = weekStartKey(key);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((noonUTC(b).getTime() - noonUTC(a).getTime()) / 86400000);
}

export function isValidDayKey(value: unknown): value is DayKey {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(noonUTC(value).getTime());
}

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function dayName(key: DayKey): string { return DOW_LONG[dayOfWeek(key)]; }
export function dayNameShort(key: DayKey): string { return DOW_SHORT[dayOfWeek(key)]; }

/** 'Sunday 25 October' — the dashboard's date anchor. */
export function formatDayAnchor(key: DayKey): string {
  const d = noonUTC(key);
  return `${DOW_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]}`;
}

/** '25 Oct' — compact, for week strips. */
export function formatDayCompact(key: DayKey): string {
  const d = noonUTC(key);
  return `${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()].slice(0, 3)}`;
}

/** Day-of-month only. */
export function dayOfMonth(key: DayKey): number { return noonUTC(key).getUTCDate(); }

/**
 * The local-midnight ISO string the Plan calendar uses to key an occurrence.
 * Bridges day keys to the legacy `${itemId}:${startOfDay(date).toISOString()}`
 * completion/override keys that CalendarScreen and calendar-utils still speak.
 */
export function legacyDateKey(key: DayKey): string {
  const [y, m, d] = key.split('-').map(Number);
  const local = new Date(y, m - 1, d, 0, 0, 0, 0);
  return local.toISOString();
}

/** Inverse of `legacyDateKey` — a local Date at midnight for a day key. */
export function toLocalDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * The day key for a Date the calendar is rendering. The Plan grids build
 * their Dates from local calendar fields (local midnight for a column), so
 * the key is read back off those same fields rather than by re-formatting the
 * instant — which would shift the date on a device far from Paris.
 */
export function dayKeyFromLocalDate(d: Date): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

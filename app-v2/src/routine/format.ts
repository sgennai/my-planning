// Presentation helpers for the Routine dashboard. Kept out of the component
// so the metadata line can be asserted directly in tests.
import type { RoutineActivity } from './model';
import type { DayKey } from './dates';
import { setsOf, timerOf } from './engine';

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function dayParts(key: DayKey) {
  const d = new Date(`${key}T12:00:00Z`);
  return {
    name: DOW_LONG[d.getUTCDay()],
    rest: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

/** The days an activity runs, for one that isn't daily. */
export function daysLabel(a: RoutineActivity): string {
  if (a.schedule.type !== 'weekdays') return '';
  const days = [...(a.schedule.days || [])].sort((x, y) => (x === 0 ? 7 : x) - (y === 0 ? 7 : y));
  if (days.length === 0 || days.length === 7) return '';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d as never))) return 'Mon–Fri';
  return days.map(d => DOW_SHORT[d]).join(' & ');
}

/**
 * The tile's single metadata line — one fact, in priority order: a clock time
 * if it has one, else what it is anchored to, else its timer or target, else
 * its own note, and only then the days it runs.
 */
export function metaFor(a: RoutineActivity): string {
  if (a.timing.type === 'fixed') return a.timing.start;
  if (a.timing.type === 'anchored') return a.timing.anchor;
  const sets = setsOf(a);
  const timer = timerOf(a);
  if (timer) return `${sets ? `${sets} × ` : ''}${Math.round(timer / 60)} min timer`;
  if (a.target) return targetLabel(a.target.kind, a.target.value, sets);
  if (sets) return `${sets} times a day`;
  if (a.description) return a.description;
  return daysLabel(a);
}

/** "40 reps", or split over sets: "4 × 10 reps", and "4 sets · 45 reps" when it doesn't divide. */
export function targetLabel(kind: 'reps' | 'minutes', value: number, sets: number): string {
  const unit = kind === 'reps' ? 'reps' : 'min';
  if (!sets) return `${value} ${unit}`;
  return value % sets === 0 ? `${sets} × ${value / sets} ${unit}` : `${sets} sets · ${value} ${unit}`;
}

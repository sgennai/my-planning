import { describe, it, expect } from 'vitest';
import { combinedDayItems, startOfWeek } from './calendar-utils';

describe('combinedDayItems — all-day events', () => {
  const weekStart = startOfWeek(new Date('2026-06-08T12:00:00')); // a Monday
  const day = new Date(weekStart);
  const mk = (h: number, m: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

  it('keeps all-day events out of the timed overlap packing and flags them', () => {
    const ics = [
      { source: 'household', title: 'Bin day', start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0), end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59), allDay: true, uid: 'a' },
      { source: 'work', title: 'Standup', start: mk(9, 0), end: mk(9, 30), allDay: false, uid: 'b' },
    ];
    const items = combinedDayItems(0, [], [], weekStart, {}, {}, day, ics, {});
    const allDay = items.find((i: any) => i._ics && i._ics.title === 'Bin day');
    const timed = items.find((i: any) => i._ics && i._ics.title === 'Standup');

    expect(allDay._isAllDay).toBe(true);
    // The timed event must NOT be squashed into a sub-lane by the 24h block.
    expect(timed._isAllDay).toBeFalsy();
    expect(timed._totalLanes).toBe(1);
    expect(timed._lane).toBe(0);
  });
});

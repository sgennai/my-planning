// CALENDAR UTILS
import type { RoutineItem } from '../storage/types';
import { VISUAL_TO_JS_DAY } from '../storage/data';

export function pad(n: number) { return String(n).padStart(2, '0'); }

export function startOfDay(d: Date | string | number) {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}

export function startOfWeek(d: Date | string | number) {
  const x = startOfDay(d);
  const jsDay = x.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Mon as week start
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date | string | number, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatDateShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatRange(a: Date, b: Date) {
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${formatDateShort(a)} – ${formatDateShort(b)}, ${b.getFullYear()}`;
}

export function describeDays(days: number[]) {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  const set = new Set(sorted);
  if (sorted.length === 7) return 'Daily';
  if (sorted.length === 5 && [1,2,3,4,5].every(d => set.has(d))) return 'Mon–Fri';
  if (sorted.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  const SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return sorted.map(d => SHORT[d]).join(' · ');
}

export function itemsForVisualColumn(visualCol: number, routine: RoutineItem[]) {
  const jsDay = VISUAL_TO_JS_DAY[visualCol];
  return routine.filter(item =>
    item.days.includes(jsDay.toString()) && !item.recurrence
  );
}

export function layoutDay(items: any[]) {
  const VISUAL_MIN_MIN = 22;
  const visualEnd = (it: any) => {
    const start = toMinutes(it.start);
    return start + Math.max(it.duration || it.durationMin, VISUAL_MIN_MIN);
  };
  const sorted = [...items].sort((a, b) => {
    const sd = toMinutes(a.start) - toMinutes(b.start);
    if (sd !== 0) return sd;
    return (b.duration || b.durationMin) - (a.duration || a.durationMin);
  });
  const annotated = sorted.map(item => ({ ...item }));

  const clusters: any[] = [];
  annotated.forEach(it => {
    const start = toMinutes(it.start);
    const end = visualEnd(it);
    const c = clusters.find(c => c.maxEnd > start);
    if (c) {
      c.events.push(it);
      c.maxEnd = Math.max(c.maxEnd, end);
    } else {
      clusters.push({ events: [it], maxEnd: end });
    }
  });

  clusters.forEach(cluster => {
    const evs = cluster.events;
    const columns: any[] = [];
    const eventColumn = new Map();
    evs.forEach((it: any) => {
      const start = toMinutes(it.start);
      const end = visualEnd(it);
      let col = 0;
      while (true) {
        const occupants = columns[col] || [];
        const conflict = occupants.some((o: any) => !(o.end <= start || o.start >= end));
        if (!conflict) {
          columns[col] = [...occupants, { start, end, id: it.id || it._key }];
          eventColumn.set(it, col);
          break;
        }
        col++;
      }
    });
    const totalCols = columns.length;
    evs.forEach((it: any) => {
      const myCol = eventColumn.get(it);
      const start = toMinutes(it.start);
      const end = visualEnd(it);
      let span = 1;
      for (let c = myCol + 1; c < totalCols; c++) {
        const conflict = (columns[c] || []).some((o: any) => !(o.end <= start || o.start >= end));
        if (conflict) break;
        span++;
      }
      it._lane = myCol;
      it._totalLanes = totalCols;
      it._colspan = span;
    });
  });

  return annotated;
}

export function blocksForDate(blocks: any[], date: Date) {
  const dateKey = startOfDay(date).getTime();
  return blocks.filter(b => {
    if (b.status === 'skipped') return false;
    const d = new Date(b.date || b.start);
    return startOfDay(d).getTime() === dateKey;
  });
}

export function blocksForWeek(blocks: any[], weekStart: Date) {
  const start = startOfDay(weekStart).getTime();
  const end = startOfDay(addDays(weekStart, 7)).getTime();
  return blocks.filter(b => {
    if (b.status === 'skipped') return false;
    const t = new Date(b.date || b.start).getTime();
    return t >= start && t < end;
  });
}

export function makeOverrideKey(itemId: string, date: Date) {
  return `${itemId}:${startOfDay(date).toISOString()}`;
}

export function makeCompletionKey(itemId: string, date: Date) {
  return `${itemId}:${startOfDay(date).toISOString()}`;
}

export function resolvedRoutineForDate(routine: any[], overrides: any, date: Date, completions: any) {
  const dateKey = startOfDay(date).toISOString();
  const dateMs = startOfDay(date).getTime();
  const jsDay = date.getDay();
  const out: any[] = [];
  const compMap = completions || {};

  const isCompleted = (itemId: string) => !!compMap[`${itemId}:${dateKey}`];

  routine.forEach(item => {
    if (!item.days.includes(jsDay) && !item.days.includes(jsDay.toString())) return;
    if (item.recurrence) return;
    const key = makeOverrideKey(item.id, date);
    const ov = overrides[key];
    if (!ov) {
      out.push({ ...item, _kind: 'routine', _completed: isCompleted(item.id) });
      return;
    }
    if (ov.type === 'skip') return;
    if (ov.type === 'move') return;
    if (ov.type === 'edit') {
      const hasChange =
        (ov.title != null && ov.title !== item.title) ||
        (ov.note != null && ov.note !== item.note) ||
        (ov.start != null && ov.start !== item.start) ||
        (ov.duration != null && (ov.duration !== item.duration && ov.duration !== item.durationMin));
      out.push({
        ...item,
        title: ov.title != null ? ov.title : item.title,
        note: ov.note != null ? ov.note : item.note,
        start: ov.start != null ? ov.start : item.start,
        duration: ov.duration != null ? ov.duration : (item.duration || item.durationMin),
        _kind: 'routine',
        _overridden: hasChange,
        _completed: isCompleted(item.id),
      });
    }
  });

  Object.entries(overrides || {}).forEach(([key, ov]: [string, any]) => {
    if (!ov || ov.type !== 'move' || !ov.moveToDate) return;
    if (startOfDay(new Date(ov.moveToDate)).getTime() !== dateMs) return;
    const itemId = key.split(':')[0];
    const item = routine.find(r => r.id === itemId);
    if (!item) return;
    out.push({
      ...item,
      start: ov.start != null ? ov.start : item.start,
      duration: ov.duration != null ? ov.duration : (item.duration || item.durationMin),
      title: ov.title != null ? ov.title : item.title,
      note: ov.note != null ? ov.note : item.note,
      _kind: 'routine',
      _moved: true,
      _movedFromDate: key.split(':').slice(1).join(':'),
      _overrideKey: key,
      _completed: isCompleted(item.id),
    });
  });

  return out;
}

export function applyElsewhereFilter(items: any[], date: Date, elsewhereToggles: any, today: Date) {
  if (!elsewhereToggles || !today) return items;
  if (!isSameDay(date, today)) return items;
  const t = elsewhereToggles;
  if (!t.morning && !t.afternoon && !t.allDay) return items;
  return items.filter(it => {
    if (!it.homeOnly) return true;
    const startMin = toMinutes(it.start);
    if (t.allDay) return false;
    if (t.morning && startMin < 12 * 60) return false;
    if (t.afternoon && startMin >= 12 * 60) return false;
    return true;
  });
}

export function plannedMinutesForProject(blocks: any[], weekStart: Date, projectId: string) {
  return blocksForWeek(blocks, weekStart)
    .filter(b => b.projectId === projectId && b.status !== 'completed')
    .reduce((sum, b) => sum + (b.duration || b.durationMin || 0), 0);
}

export function spentMinutesForProject(blocks: any[], weekStart: Date, projectId: string) {
  return blocksForWeek(blocks, weekStart)
    .filter(b => b.projectId === projectId && (b.status === 'completed' || b.status === 'partial'))
    .reduce((sum, b) => sum + (b.actualMinutes || 0), 0);
}

export function combinedDayItems(visualCol: number, routine: any[], blocks: any[], weekStart: Date, overrides: any, elsewhereToggles: any, today: Date, icsOccurrences: any[], completions: any) {
  const date = addDays(weekStart, visualCol);
  let routineItems = resolvedRoutineForDate(routine, overrides || {}, date, completions);
  routineItems = applyElsewhereFilter(routineItems, date, elsewhereToggles, today);
  const blockItems = blocksForDate(blocks, date).map(b => ({
    id: b.id,
    title: b.title,
    start: b.start,
    duration: b.duration || b.durationMin,
    category: 'project-block',
    _kind: 'block',
    _block: b,
  }));
  const icsItems = (icsOccurrences || []).filter(occ => isSameDay(occ.start, date)).map((occ, i) => {
    const startStr = `${pad(occ.start.getHours())}:${pad(occ.start.getMinutes())}`;
    const durationMin = Math.max(15, Math.round((occ.end.getTime() - occ.start.getTime()) / 60000));
    return {
      id: `ics-${occ.source}-${occ.uid || i}-${occ.start.getTime()}`,
      title: occ.title,
      start: startStr,
      duration: durationMin,
      category: 'ics-event',
      _kind: 'ics',
      _ics: occ,
    };
  });
  const allItems = [...routineItems, ...blockItems, ...icsItems];
  const elsewhereItems = allItems.filter(it => it._kind === 'routine' && it.category === 'elsewhere');
  const commuteItems = allItems.filter(it => it._kind === 'routine' && it.category === 'commute');
  const mainItems = allItems.filter(it => !(it._kind === 'routine' && (it.category === 'elsewhere' || it.category === 'commute')));
  const laid = layoutDay(mainItems);
  const ewRanges = elsewhereItems.map(ew => ({ s: toMinutes(ew.start), e: toMinutes(ew.start) + ew.duration }));
  laid.forEach(it => {
    const s = toMinutes(it.start), e = s + it.duration;
    if (ewRanges.some(ew => ew.e > s && ew.s < e)) it._elsewhereOverlap = true;
  });
  elsewhereItems.forEach(it => { it._isElsewhereBar = true; });
  commuteItems.forEach(it => { it._isCommuteMarker = true; });
  return [...laid, ...elsewhereItems, ...commuteItems];
}

export function actionStateMap(blocks: any[]) {
  const map: any = {};
  blocks.forEach(b => {
    if (!b.actionId) return;
    if (b.status === 'skipped') return;
    const cur = map[b.actionId];
    const rank: any = { partial: 1, scheduled: 2, completed: 3 };
    if (!cur || rank[b.status] > rank[cur.status]) {
      map[b.actionId] = { status: b.status, blockId: b.id, duration: b.duration || b.durationMin };
    }
  });
  return map;
}

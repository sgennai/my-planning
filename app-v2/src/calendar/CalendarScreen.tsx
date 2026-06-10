// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { parseColorVal, categoryStylesWith, CATEGORY_STYLES, SEED_PRACTICE_CONTENT } from '../storage/data';
import { pad, hexToRgba, colorValToBackground, ViewSwitcher } from '../ui/helpers';
import { startOfDay, startOfWeek, addDays, isSameDay, toMinutes, formatDateShort, formatRange, blocksForDate, makeOverrideKey, makeCompletionKey, resolvedRoutineForDate, applyElsewhereFilter } from '../helpers/calendar-utils';
import { expandEventsForWindow } from '../helpers/ics-parser';
import { fetchWeather, wmoIcon } from '../helpers/weather';
import { useMediaQuery, useTickingClock } from '../main-app';
import { TodayScreen } from './today/TodayScreen';
import { TodayMiniMonth } from './today/TodayMiniMonth';
import { ProjectsRailPanel, WeekGrid } from './week/WeekScreen';
import { BlockPopover } from './week/BlockPopover';
import { AgendaView, ReferenceLibraryModal } from '../routine/Routine';
import { RoutineItemPopover } from '../routine/RoutineItemPopover';
import { WeatherStrip, InboxModal, SettingsModal, WeeklyResetOverlay } from '../ui/widgets';
import { scheduleModuleBlocks } from '../modules/generator';

// Stable empty defaults — hoisted so inline `|| []`/`|| {}` don't create
// new references on every render and silently invalidate useMemo deps.
export const _EMPTY_ARRAY = [];
export const _EMPTY_OBJ = {};
export const _DEFAULT_ELSEWHERE = { morning: false, afternoon: false, allDay: false, date: null };

// ─── Micro-strength tracker widget ────────────────────────────────────────────
export function MicroTracker({ tracker, onToggle, viewDate }) {
  const [showTip, setShowTip] = React.useState(false);
  const hideTimer = React.useRef(null);
  const enter = () => { clearTimeout(hideTimer.current); setShowTip(true); };
  const leave = () => { hideTimer.current = setTimeout(() => setShowTip(false), 180); };

  const { slots, doneCount, total, exercises, title, nowH, nowM } = tracker;

  let nextLabel = '';
  const atTopOfHour = nowM <= 3;
  const curSlot = slots.find(s => s.hour === nowH && s.status === 'upcoming');
  const nxtSlot = slots.find(s => s.status === 'upcoming' && s.hour > nowH);
  if (curSlot && atTopOfHour) {
    nextLabel = 'now';
  } else if (nxtSlot) {
    const mins = (nxtSlot.hour - nowH) * 60 - nowM;
    nextLabel = `next in ${mins}m`;
  }

  return (
    <div className="micro-tracker">
      <div className="micro-tracker-line1">
        <span className="micro-tracker-label" onMouseEnter={enter} onMouseLeave={leave} style={{ position: 'relative' }}>
          ⚡ {title}
          {showTip && exercises.length > 0 && (
            <div className="micro-tracker-tip" onMouseEnter={enter} onMouseLeave={leave}>
              {exercises.map((ex, i) => <div key={i} className="micro-tracker-ex">{ex}</div>)}
            </div>
          )}
        </span>
        <span className="micro-tracker-meta">
          {doneCount} / {total} done{nextLabel ? ` · ${nextLabel}` : ''}
        </span>
      </div>
      <div className="micro-tracker-dots">
        {slots.map(s => (
          <span
            key={s.hour}
            title={`${pad(s.hour)}:00`}
            className={`micro-dot micro-dot--${s.status}${s.status === 'missed' || s.status === 'done' ? ' micro-dot--clickable' : ''}`}
            onClick={s.status === 'missed' || s.status === 'done' ? () => onToggle(s.hour, viewDate) : undefined}
          >
            {s.status === 'done' ? '●' : s.status === 'missed' ? '●' : '○'}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CalendarScreen({ data, saving, lastSyncedAt, error, onReload, onSignOut, onPersist, onOpenPractice, onOpenModules, onOpenIntake, onOpenCreate, pendingCalAction, onClearPendingAction }) {
  const isMobile = useMediaQuery('(max-width: 759px)');
  const now = useTickingClock(60000);
  // View routing: 'today' = daily compass (default landing), 'plan' = full week canvas
  const [mainView, setMainView] = useState('today');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dayView, setDayView] = useState(null); // null = week view, 0..6 = visual column
  // Plan view selector: 'timeline' (agenda bands) | 'day' (single-day grid) | 'week' (week grid)
  const [planView, setPlanView] = useState('timeline');
  const [todoPickerOpen, setTodoPickerOpen] = useState(false); // ＋ Add from Todoist picker (Commit 2)
  const [openBlockId, setOpenBlockId] = useState(null); // scheduled block popover
  const [openRoutineEdit, setOpenRoutineEdit] = useState(null); // { itemId, date } for routine click popover
  const [refLibraryOpen, setRefLibraryOpen] = useState(false);
  const [refExpandedId, setRefExpandedId] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [resetOverlayOpen, setResetOverlayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [scrollToNowTick, setScrollToNowTick] = useState(0);
  const [heroDropTarget, setHeroDropTarget] = useState(null);
  const [heroTaskDetail, setHeroTaskDetail] = useState(null); // { id, title } task detail modal
  const [allTodoistTasks, setAllTodoistTasks] = useState([]);
  const [todoistLoading, setTodoistLoading] = useState(false);
  const [todoistError, setTodoistError] = useState(null);
  const [todoistRefreshTick, setTodoistRefreshTick] = useState(0);
  const todoistPendingRef = React.useRef([]); // tracks data.todoistPending without adding to effect deps
  // ICS imported events: per-feed parsed events in memory (not synced to Drive)
  // Shape: { work: { events: [...], lastFetched: Date, error: '' }, household: { ... } }
  const [icsCache, setIcsCache] = useState({ work: null, household: null });
  const [icsRefreshing, setIcsRefreshing] = useState(false);
  // Weather state (memory-only — like ICS, not synced to Drive)
  const [weatherCache, setWeatherCache] = useState(null); // { hours, fetchedAt, tz }
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherDayTab, setWeatherDayTab] = useState(0); // 0=today, 1=tomorrow, 2=day-after
  const [weatherVisible, setWeatherVisible] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true); // daily=true, weekly=false by default
  const [calendarToggles, setCalendarToggles] = useState({ routine: true, work: true, household: true });
  const [todosExpanded, setTodosExpanded] = useState(true);
  const [calendarsExpanded, setCalendarsExpanded] = useState(true);

  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const persistData = useCallback((mutator) => {
    const nextData = typeof mutator === 'function' ? mutator(data) : mutator;
    const withTimestamp = { ...nextData, lastModified: new Date().toISOString() };
    onPersist(withTimestamp);
  }, [data, onPersist]);

  // Theme toggle — flips between light and dark, persists to data file
  const setTheme = useCallback((theme) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), theme } }));
  }, [persistData]);
  const currentTheme = (data.prefs && data.prefs.theme) || 'light';

  // Keep <meta name="theme-color"> in sync with the JS-toggled theme
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', currentTheme === 'dark' ? '#0C0C0E' : '#F9F9F7');
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);


  // Per-category color overrides — read user prefs, build merged style map
  const userCategoryColors = (data.prefs && data.prefs.categoryColors) || _EMPTY_OBJ;
  const userCategoryEmojis = (data.prefs && data.prefs.categoryEmojis) || _EMPTY_OBJ;
  const userCategoryLabels = (data.prefs && data.prefs.categoryLabels) || _EMPTY_OBJ;
  const userCategories = (data.prefs && data.prefs.userCategories) || _EMPTY_OBJ;
  const categoryStyles = useMemo(() => categoryStylesWith(userCategoryColors, userCategoryEmojis, userCategoryLabels, userCategories), [userCategoryColors, userCategoryEmojis, userCategoryLabels, userCategories]);
  const setCategoryColor = useCallback((category, color) => {
    persistData(d => ({
      ...d,
      prefs: {
        ...(d.prefs || {}),
        categoryColors: { ...((d.prefs && d.prefs.categoryColors) || {}), [category]: color },
      },
    }));
  }, [persistData]);
  const resetCategoryColor = useCallback((category) => {
    persistData(d => {
      const map = { ...((d.prefs && d.prefs.categoryColors) || {}) };
      delete map[category];
      return { ...d, prefs: { ...(d.prefs || {}), categoryColors: map } };
    });
  }, [persistData]);
  const setCategoryEmoji = useCallback((category, emoji) => {
    persistData(d => ({
      ...d,
      prefs: {
        ...(d.prefs || {}),
        categoryEmojis: { ...((d.prefs && d.prefs.categoryEmojis) || {}), [category]: emoji },
      },
    }));
  }, [persistData]);
  const resetCategoryEmoji = useCallback((category) => {
    persistData(d => {
      const map = { ...((d.prefs && d.prefs.categoryEmojis) || {}) };
      delete map[category];
      return { ...d, prefs: { ...(d.prefs || {}), categoryEmojis: map } };
    });
  }, [persistData]);

  const setCategoryLabel = useCallback((category, label) => {
    persistData(d => ({
      ...d,
      prefs: {
        ...(d.prefs || {}),
        categoryLabels: { ...((d.prefs && d.prefs.categoryLabels) || {}), [category]: label },
      },
    }));
  }, [persistData]);
  const resetCategoryLabel = useCallback((category) => {
    persistData(d => {
      const map = { ...((d.prefs && d.prefs.categoryLabels) || {}) };
      delete map[category];
      return { ...d, prefs: { ...(d.prefs || {}), categoryLabels: map } };
    });
  }, [persistData]);

  const addUserCategory = useCallback((slug, def) => {
    persistData(d => ({
      ...d,
      prefs: { ...(d.prefs || {}), userCategories: { ...((d.prefs && d.prefs.userCategories) || {}), [slug]: def } },
    }));
  }, [persistData]);

  const updateUserCategory = useCallback((slug, patch) => {
    persistData(d => {
      const cats = { ...((d.prefs && d.prefs.userCategories) || {}) };
      cats[slug] = { ...(cats[slug] || {}), ...patch };
      return { ...d, prefs: { ...(d.prefs || {}), userCategories: cats } };
    });
  }, [persistData]);

  const deleteUserCategory = useCallback((slug) => {
    persistData(d => {
      const cats = { ...((d.prefs && d.prefs.userCategories) || {}) };
      delete cats[slug];
      return { ...d, prefs: { ...(d.prefs || {}), userCategories: cats } };
    });
  }, [persistData]);

  const usedCategories = useMemo(() => {
    const s = new Set();
    (data.routine || []).forEach(r => r.category && s.add(r.category));
    (data.scheduledBlocks || []).forEach(b => b.category && s.add(b.category));
    return s;
  }, [data.routine, data.scheduledBlocks]);

  const nowLineColor = (data.prefs && data.prefs.nowLineColor) || '';
  const setNowLineColor = useCallback((color) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), nowLineColor: color } }));
  }, [persistData]);

  useEffect(() => {
    const root = document.documentElement;
    if (nowLineColor) {
      root.style.setProperty('--now-line-color', nowLineColor);
      root.style.setProperty('--now-line-color-soft', hexToRgba(nowLineColor, 0.25));
    } else {
      root.style.removeProperty('--now-line-color');
      root.style.removeProperty('--now-line-color-soft');
    }
  }, [nowLineColor]);

  const nowEventColor = (data.prefs && data.prefs.nowEventColor) || '';
  const setNowEventColor = useCallback((color) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), nowEventColor: color } }));
  }, [persistData]);

  useEffect(() => {
    const root = document.documentElement;
    if (nowEventColor) {
      root.style.setProperty('--now-event-color', nowEventColor);
      root.style.setProperty('--now-event-color-soft', hexToRgba(nowEventColor, 0.15));
    } else {
      root.style.removeProperty('--now-event-color');
      root.style.removeProperty('--now-event-color-soft');
    }
  }, [nowEventColor]);

  const miniMonthTodayColor = (data.prefs && data.prefs.miniMonthTodayColor) || '';
  const setMiniMonthTodayColor = useCallback((color) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), miniMonthTodayColor: color } }));
  }, [persistData]);

  useEffect(() => {
    const root = document.documentElement;
    if (miniMonthTodayColor) {
      root.style.setProperty('--mini-month-today-color', miniMonthTodayColor);
    } else {
      root.style.removeProperty('--mini-month-today-color');
    }
  }, [miniMonthTodayColor]);

  const setTodayView = useCallback((view) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), todayView: view } }));
  }, [persistData]);
  const todayViewMode = (data.prefs && data.prefs.todayView) || 'timeline';

  const lunchSlot = (data.prefs && data.prefs.lunchSlot) || { start: '12:30', duration: 60 };
  const setLunchSlot = useCallback((slot) => {
    persistData(d => ({ ...d, prefs: { ...(d.prefs || {}), lunchSlot: slot } }));
  }, [persistData]);

  const createBlock = useCallback((block) => {
    const newBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'scheduled',
      actualMinutes: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      ...block,
    };
    persistData(d => ({
      ...d,
      scheduledBlocks: [...(d.scheduledBlocks || []), newBlock],
    }));
  }, [persistData]);

  const updateBlock = useCallback((blockId, changes) => {
    persistData(d => {
      const blocks = d.scheduledBlocks || [];
      const block = blocks.find(b => b.id === blockId);
      if (!block) return d;
      const updated = { ...block, ...changes };
      // If this block is tied to a todo and its status flipped to/from 'completed',
      // propagate that to the todo.
      let todos = d.todos || [];
      if (block.todoId && changes.status !== undefined) {
        const newDone = changes.status === 'completed';
        const cur = todos.find(t => t.id === block.todoId);
        if (cur && cur.done !== newDone) {
          todos = todos.map(t => t.id === block.todoId ? { ...t, done: newDone } : t);
        }
      }
      return {
        ...d,
        scheduledBlocks: blocks.map(b => b.id === blockId ? updated : b),
        todos,
      };
    });
  }, [persistData]);

  const deleteBlock = useCallback((blockId) => {
    persistData(d => ({
      ...d,
      scheduledBlocks: (d.scheduledBlocks || []).filter(b => b.id !== blockId),
    }));
  }, [persistData]);

  // ─── Reference library handlers ─────────────────
  const updateRefEntry = useCallback((id, body) => {
    persistData(d => ({
      ...d,
      referenceLibrary: (d.referenceLibrary || []).map(r =>
        r.id === id ? { ...r, body } : r
      ),
    }));
  }, [persistData]);

  // ─── Routine handlers ───────────────────────────
  // "From now on" = mutate the underlying routine item
  const updateRoutineItem = useCallback((itemId, changes) => {
    persistData(d => ({
      ...d,
      routine: (d.routine || []).map(r =>
        r.id === itemId ? { ...r, ...changes } : r
      ),
    }));
  }, [persistData]);

  const addRoutineItem = useCallback((newItem) => {
    const item = {
      id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...newItem,
    };
    persistData(d => ({
      ...d,
      routine: [...(d.routine || []), item],
    }));
  }, [persistData]);

  const deleteRoutineItem = useCallback((itemId) => {
    persistData(d => ({
      ...d,
      routine: (d.routine || []).filter(r => r.id !== itemId),
      // Also clean up any overrides for this item
      overrides: Object.fromEntries(
        Object.entries(d.overrides || {}).filter(([k]) => !k.startsWith(`${itemId}:`))
      ),
    }));
  }, [persistData]);

  // "This week only" = create/update an override
  const setOverride = useCallback((itemId, date, override) => {
    const key = makeOverrideKey(itemId, date);
    persistData(d => {
      const next = { ...(d.overrides || {}) };
      if (override == null) {
        delete next[key];
      } else {
        next[key] = override;
      }
      return { ...d, overrides: next };
    });
  }, [persistData]);

  // ─── Inbox handlers ─────────────────────────────
  const addInboxItem = useCallback((text) => {
    const t = text.trim();
    if (!t) return;
    const item = {
      id: `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: t,
      createdAt: new Date().toISOString(),
      actioned: false,
    };
    persistData(d => ({ ...d, inbox: [item, ...(d.inbox || [])] }));
  }, [persistData]);
  const toggleInboxItem = useCallback((id) => {
    persistData(d => ({
      ...d,
      inbox: (d.inbox || []).map(it =>
        it.id === id ? { ...it, actioned: !it.actioned } : it
      ),
    }));
  }, [persistData]);
  const deleteInboxItem = useCallback((id) => {
    persistData(d => ({
      ...d,
      inbox: (d.inbox || []).filter(it => it.id !== id),
    }));
  }, [persistData]);

  // ─── Elsewhere toggles ──────────────────────────
  // Auto-reset toggles when the date changes (each new day they start fresh).
  const elsewhere = data.elsewhereToggles || _DEFAULT_ELSEWHERE;
  const todayDateKey = startOfDay(now).toISOString();
  useEffect(() => {
    if (!elsewhere.date || elsewhere.date !== todayDateKey) {
      // Past their date — silently reset, but only if any was on
      if (elsewhere.morning || elsewhere.afternoon || elsewhere.allDay) {
        persistData(d => ({
          ...d,
          elsewhereToggles: { morning: false, afternoon: false, allDay: false, date: todayDateKey },
        }));
      }
    }
  }, [todayDateKey]); // eslint-disable-line

  const toggleElsewhere = useCallback((mode) => {
    persistData(d => {
      const cur = d.elsewhereToggles || { morning: false, afternoon: false, allDay: false, date: null };
      const next = { ...cur, date: todayDateKey };
      if (mode === 'allDay') {
        const nv = !cur.allDay;
        next.allDay = nv;
        if (nv) { next.morning = false; next.afternoon = false; }
      } else {
        next[mode] = !cur[mode];
        if (next[mode]) next.allDay = false;
      }
      return { ...d, elsewhereToggles: next };
    });
  }, [persistData, todayDateKey]);

  const isWorkingAway = !!(elsewhere && (elsewhere.allDay || elsewhere.morning || elsewhere.afternoon));
  const toggleWorkingAway = useCallback(() => {
    if (isWorkingAway) toggleElsewhere('allDay'); // toggleElsewhere off
    else persistData(d => ({ ...d, elsewhereToggles: { morning: false, afternoon: false, allDay: true, date: todayDateKey } }));
  }, [isWorkingAway, toggleElsewhere, persistData, todayDateKey]);
  const openInboxCount = (data.inbox || []).filter(i => !i.done).length;

  // ─── Weekly reset save ──────────────────────────
  const saveWeeklyReset = useCallback((answers) => {
    const weekLabel = `Week of ${formatDateShort(weekStart)}, ${weekStart.getFullYear()}`;
    const entry = {
      id: `reset-${Date.now()}`,
      week: weekLabel,
      weekStart: weekStart.toISOString(),
      date: new Date().toISOString(),
      answers,
    };
    persistData(d => ({
      ...d,
      weeklyResets: [entry, ...(d.weeklyResets || [])].slice(0, 52),
    }));
  }, [persistData, weekStart]);

  // ─── Routine completion handlers ───────────────
  // Per-occurrence done state. Key shape: `${itemId}:${dateISO}`.
  const toggleRoutineCompletion = useCallback((itemId, date) => {
    const key = makeCompletionKey(itemId, date);
    persistData(d => {
      const next = { ...(d.routineCompletions || {}) };
      if (next[key]) { delete next[key]; } else { next[key] = true; }
      return { ...d, routineCompletions: next };
    });
  }, [persistData]);

  const toggleMicroSlot = useCallback((hour, date) => {
    const key = `micro-strength:h${hour}:${startOfDay(date).toISOString()}`;
    persistData(d => {
      const next = { ...(d.routineCompletions || {}) };
      if (next[key]) { delete next[key]; } else { next[key] = true; }
      return { ...d, routineCompletions: next };
    });
  }, [persistData]);

  // ─── Todo handlers ──────────────────────────────
  // Todos sit in their own list. A todo can be "scheduled" (a calendar block exists
  // pointing back to it) or unscheduled. Marking a todo done also marks its scheduled
  // block done; marking the block done flips the todo done. Done state is the source
  // of truth on the todo itself.
  const addTodo = useCallback((title) => {
    const t = title.trim();
    if (!t) return;
    const todo = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: t,
      note: '',
      done: false,
      createdAt: new Date().toISOString(),
    };
    persistData(d => ({ ...d, todos: [todo, ...(d.todos || [])] }));
  }, [persistData]);

  const updateTodo = useCallback((id, changes) => {
    persistData(d => ({
      ...d,
      todos: (d.todos || []).map(t => t.id === id ? { ...t, ...changes } : t),
      // Also propagate done-state to any scheduled block tied to this todo
      scheduledBlocks: (d.scheduledBlocks || []).map(b => {
        if (b.todoId !== id) return b;
        if (changes.done === true) return { ...b, status: 'completed', completedAt: new Date().toISOString() };
        if (changes.done === false) return { ...b, status: 'scheduled', completedAt: null };
        return b;
      }),
    }));
  }, [persistData]);

  const deleteTodo = useCallback((id) => {
    persistData(d => ({
      ...d,
      todos: (d.todos || []).filter(t => t.id !== id),
      // Cascade: remove any scheduled blocks tied to this todo
      scheduledBlocks: (d.scheduledBlocks || []).filter(b => b.todoId !== id),
    }));
  }, [persistData]);

  // ─── Project action handlers ─────────────────────
  const completeProjectAction = useCallback((projectId, moduleId, actionId) => {
    persistData(d => {
      const proj = (d.projects || []).find(p => p.id === projectId);
      let text = '';
      if (proj) {
        if (moduleId) {
          const mod = (proj.modules || []).find(m => m.id === moduleId);
          if (mod) { const a = (mod.nextActions || []).find(a => a.id === actionId); if (a) text = a.text; }
        } else {
          const a = (proj.nextActions || []).find(a => a.id === actionId); if (a) text = a.text;
        }
      }
      return {
        ...d,
        completedActions: [...(d.completedActions || []), { projectId, moduleId: moduleId || null, actionId, text, completedAt: new Date().toISOString() }],
        projects: (d.projects || []).map(p => {
          if (p.id !== projectId) return p;
          if (moduleId) {
            return { ...p, modules: (p.modules || []).map(m => m.id !== moduleId ? m : { ...m, nextActions: (m.nextActions || []).filter(a => a.id !== actionId) }) };
          }
          return { ...p, nextActions: (p.nextActions || []).filter(a => a.id !== actionId) };
        }),
      };
    });
  }, [persistData]);

  const addProjectAction = useCallback((projectId, moduleId, text, estimatedMin) => {
    const newAction = { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, estimatedMin: estimatedMin || null, status: 'open' };
    persistData(d => ({
      ...d,
      projects: (d.projects || []).map(p => {
        if (p.id !== projectId) return p;
        if (moduleId) {
          return { ...p, modules: (p.modules || []).map(m => m.id !== moduleId ? m : { ...m, nextActions: [...(m.nextActions || []), newAction] }) };
        }
        return { ...p, nextActions: [...(p.nextActions || []), newAction] };
      }),
    }));
  }, [persistData]);

  const deleteProjectAction = useCallback((projectId, moduleId, actionId) => {
    persistData(d => ({
      ...d,
      projects: (d.projects || []).map(p => {
        if (p.id !== projectId) return p;
        if (moduleId) {
          return { ...p, modules: (p.modules || []).map(m => m.id !== moduleId ? m : { ...m, nextActions: (m.nextActions || []).filter(a => a.id !== actionId) }) };
        }
        return { ...p, nextActions: (p.nextActions || []).filter(a => a.id !== actionId) };
      }),
    }));
  }, [persistData]);

  const updatePracticeItem = useCallback((tab, updatedItem) => {
    persistData(d => ({
      ...d,
      practiceContent: {
        ...(d.practiceContent || SEED_PRACTICE_CONTENT),
        [tab]: ((d.practiceContent && d.practiceContent[tab]) || []).map(it =>
          it.id === updatedItem.id ? updatedItem : it
        ),
      },
    }));
  }, [persistData]);

  const setTodoSlot = useCallback((todoId, slot) => {
    persistData(d => ({
      ...d,
      todos: (d.todos || []).map(t => t.id === todoId ? { ...t, slot: slot || null } : t),
    }));
  }, [persistData]);

  const updateTodoistSettings = useCallback((patch) => {
    persistData(d => ({ ...d, todoist: { ...(d.todoist || {}), ...patch } }));
  }, [persistData]);

  const setTodoistTaskSlot = useCallback((taskId, slot) => {
    persistData(d => ({
      ...d,
      todoistSlots: { ...(d.todoistSlots || {}), [taskId]: slot || null },
    }));
  }, [persistData]);

  const deletePendingTask = useCallback((id) => {
    persistData(d => ({ ...d, todoistPending: (d.todoistPending || []).filter(p => p.id !== id) }));
  }, [persistData]);

  // Keep ref in sync so the fetch effect can read latest pending without it being a dep
  React.useEffect(() => { todoistPendingRef.current = data.todoistPending || []; }, [data.todoistPending]);

  const completeTodoistTask = useCallback(async (taskId) => {
    const token = (data.todoist || {}).token;
    const proxy = ((data.calendars || {}).proxyUrl || '').replace(/\/+$/, '');
    if (!token || !proxy) return;
    try {
      await fetch(`${proxy}/todoist/tasks/${taskId}/close`, {
        method: 'POST',
        headers: { 'X-Todoist-Token': token },
      });
      setAllTodoistTasks(prev => prev.filter(t => t.id !== taskId));
      setTodoistTaskSlot(taskId, null);
    } catch { /* silent */ }
  }, [data.todoist, data.calendars, setTodoistTaskSlot]);

  // ─── ICS handlers ───────────────────────────────
  const calendarSettings = data.calendars || { workIcs: '', householdIcs: '', proxyUrl: '' };

  const updateCalendarSettings = useCallback((patch) => {
    persistData(d => ({
      ...d,
      calendars: { ...(d.calendars || {}), ...patch },
    }));
  }, [persistData]);

  const refreshICS = useCallback(async () => {
    const settings = data.calendars || {};
    if (!settings.proxyUrl) return;
    setIcsRefreshing(true);
    const next = { work: null, household: null };
    const fetchOne = async (key, url) => {
      if (!url) return;
      try {
        const events = await fetchICS(settings.proxyUrl, url);
        next[key] = { events, lastFetched: new Date(), error: '' };
      } catch (e) {
        next[key] = { events: [], lastFetched: new Date(), error: e.message || 'Fetch failed' };
      }
    };
    await Promise.all([
      fetchOne('work', settings.workIcs),
      fetchOne('household', settings.householdIcs),
    ]);
    setIcsCache(next);
    setIcsRefreshing(false);
  }, [data.calendars]);

  // Auto-fetch on mount + when feed URLs change
  const cfgKey = `${calendarSettings.proxyUrl}|${calendarSettings.workIcs}|${calendarSettings.householdIcs}`;
  useEffect(() => {
    if (calendarSettings.proxyUrl && (calendarSettings.workIcs || calendarSettings.householdIcs)) {
      refreshICS();
    }
    // eslint-disable-next-line
  }, [cfgKey]);

  // ─── Weather handlers ───────────────────────────
  const weatherSettings = data.weather || { lat: null, lon: null, label: '', source: 'unset' };

  const refreshWeather = useCallback(async (overrideLat, overrideLon) => {
    const lat = overrideLat != null ? overrideLat : weatherSettings.lat;
    const lon = overrideLon != null ? overrideLon : weatherSettings.lon;
    if (lat == null || lon == null) return;
    setWeatherRefreshing(true);
    setWeatherError('');
    try {
      const result = await fetchWeather(lat, lon);
      setWeatherCache(result);
    } catch (e) {
      setWeatherError(e.message || 'Weather fetch failed');
    } finally {
      setWeatherRefreshing(false);
    }
  }, [weatherSettings.lat, weatherSettings.lon]);

  // Browser geolocation prompt — only triggered if we have no coords yet AND user hasn't declined manually.
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setWeatherError('Geolocation not supported by your browser');
      return;
    }
    setWeatherRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const label = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
        persistData(d => ({
          ...d,
          weather: { lat, lon, label, source: 'geolocation' },
        }));
        // Fetch immediately with the fresh coords
        refreshWeather(lat, lon);
      },
      (err) => {
        setWeatherRefreshing(false);
        setWeatherError(`Location: ${err.message || 'permission denied'}`);
        // Mark as user-declined so we don't re-prompt every load
        persistData(d => ({
          ...d,
          weather: { ...(d.weather || {}), source: 'declined' },
        }));
      },
      { timeout: 10000, maximumAge: 24 * 60 * 60 * 1000 } // accept up to 24h-old position
    );
  }, [persistData, refreshWeather]);

  const updateWeatherLocation = useCallback((lat, lon, label) => {
    persistData(d => ({
      ...d,
      weather: { lat, lon, label: label || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, source: 'manual' },
    }));
  }, [persistData]);

  // Auto-prompt geolocation on first load if we don't have coords + user hasn't declined
  useEffect(() => {
    if (weatherSettings.source === 'unset' && weatherSettings.lat == null) {
      requestGeolocation();
    }
    // eslint-disable-next-line
  }, []); // run once on mount

  // Auto-fetch weather when coords are available (and on coord change)
  useEffect(() => {
    if (weatherSettings.lat != null && weatherSettings.lon != null && !weatherCache) {
      refreshWeather();
    }
    // eslint-disable-next-line
  }, [weatherSettings.lat, weatherSettings.lon]);

  // Compute ICS occurrences for the visible week (memoized — recomputes when week, cache, or colors change)
  const icsOccurrences = useMemo(() => {
    const winStart = startOfDay(weekStart);
    const winEnd = startOfDay(addDays(weekStart, 7));
    const out = [];
    const colorValByKey = {
      work: calendarSettings.workColor || '#8C8C96',
      household: calendarSettings.householdColor || '#7896AF',
    };
    const colorHexByKey = {
      work: parseColorVal(colorValByKey.work).hex || '#8C8C96',
      household: parseColorVal(colorValByKey.household).hex || '#7896AF',
    };
    ['work', 'household'].forEach(source => {
      const entry = icsCache[source];
      if (!entry || !entry.events) return;
      const occs = expandEventsForWindow(entry.events, winStart, winEnd, source);
      occs.forEach(o => {
        o.color = colorHexByKey[source];
        o.colorVal = colorValByKey[source];
        if (source === 'work' && o.title && o.title.trim().toLowerCase() === 'busy') o.title = 'Busy · Work';
      });
      out.push(...occs);
    });
    return out;
  }, [weekStart, icsCache, calendarSettings.workColor, calendarSettings.householdColor]);

  const goPrev = () => {
    if (dayView !== null) {
      if (dayView === 0) {
        setWeekStart(addDays(weekStart, -7));
        setDayView(6);
      } else {
        setDayView(dayView - 1);
      }
    } else {
      setWeekStart(addDays(weekStart, -7));
    }
  };
  const goNext = () => {
    if (dayView !== null) {
      if (dayView === 6) {
        setWeekStart(addDays(weekStart, 7));
        setDayView(0);
      } else {
        setDayView(dayView + 1);
      }
    } else {
      setWeekStart(addDays(weekStart, 7));
    }
  };
  const goToday = () => {
    setWeekStart(startOfWeek(new Date()));
    if (dayView !== null) {
      const d = now.getDay();
      setDayView(d === 0 ? 6 : d - 1);
    }
  };

  const handleDayClick = (col) => {
    if (isMobile) return;
    if (dayView === col) setDayView(null);
    else setDayView(col);
  };

  const handleRoutineClick = useCallback((itemId, date) => {
    setOpenRoutineEdit({ itemId, date: date.toISOString() });
  }, []);

  const blocks = data.scheduledBlocks || _EMPTY_ARRAY;
  const projects = data.projects || _EMPTY_ARRAY;
  const openBlock = openBlockId ? blocks.find(b => b.id === openBlockId) : null;
  const refLibrary = data.referenceLibrary || [];

  // ── TODAY-VIEW STATE (lifted so hero banner + shared rail work in both views) ──
  const [viewDayOffset, setViewDayOffset] = useState(0);
  const [todoInput, setTodoInput] = useState('');
  const [todoistDueInput, setTodoistDueInput] = useState('');
  const todoistDueRef = React.useRef(null);

  const viewDate = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + viewDayOffset);
    return d;
  }, [now, viewDayOffset]);
  const isToday = viewDayOffset === 0;

  const tdOverrides = data.overrides || _EMPTY_OBJ;
  const tdCompletions = data.routineCompletions || _EMPTY_OBJ;
  const CATS = categoryStyles || CATEGORY_STYLES;

  const todayItems = useMemo(() => {
    const items = [];
    const routineToday = applyElsewhereFilter(
      resolvedRoutineForDate(data.routine || [], tdOverrides, viewDate, tdCompletions),
      viewDate, elsewhere, now
    );
    routineToday.forEach(it => {
      items.push({ kind: 'routine', id: `routine-${it.id}`, itemId: it.id,
        title: it.title, note: it.note, startMin: toMinutes(it.start), duration: it.duration,
        completed: !!it._completed, category: it.category, homeOnly: it.homeOnly });
    });
    blocksForDate(blocks, viewDate).forEach(b => {
      const proj = projects.find(p => p.id === b.projectId);
      items.push({ kind: 'block', id: `block-${b.id}`, blockId: b.id,
        title: b.title, note: proj ? proj.name.replace('APP - ', '') : '',
        startMin: toMinutes(b.start), duration: b.duration,
        completed: b.status === 'completed', partial: b.status === 'partial',
        color: (proj && proj.color) || 'var(--primary)', isTodo: !!b.todoId });
    });
    icsOccurrences.forEach(occ => {
      if (!isSameDay(occ.start, viewDate)) return;
      const startMin = occ.start.getHours() * 60 + occ.start.getMinutes();
      const dur = Math.max(1, Math.round((occ.end - occ.start) / 60000));
      const icsTitle = occ.title || (occ.source === 'work' ? 'Work' : '(untitled)');
      items.push({ kind: 'ics', id: `ics-${occ.uid}-${startMin}`, title: icsTitle,
        note: occ.source === 'work' ? 'WORK' : 'HOUSEHOLD', startMin, duration: dur,
        color: occ.color || (occ.source === 'work' ? '#8C8C96' : '#7896AF'), colorVal: occ.colorVal, _ics: occ, allDay: occ.allDay });
    });
    items.sort((a, b) => a.startMin - b.startMin);
    return items.filter(it => {
      if (it.kind === 'routine' && !calendarToggles.routine) return false;
      if (it.kind === 'ics') {
        if (it.note === 'WORK' && !calendarToggles.work) return false;
        if (it.note === 'HOUSEHOLD' && !calendarToggles.household) return false;
      }
      return true;
    });
  }, [data.routine, tdOverrides, tdCompletions, elsewhere, now, viewDate, blocks, projects, icsOccurrences, calendarToggles]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tdCurrentItems = todayItems.filter(it => it.startMin <= nowMin && (it.startMin + it.duration) > nowMin && !it.completed && it.category !== 'elsewhere' && it.category !== 'supplement');
  const tdCurrent = tdCurrentItems[0];
  const tdUpcoming = todayItems.filter(it => it.startMin > nowMin && !it.completed && it.category !== 'elsewhere' && it.category !== 'supplement');
  const tdNext = tdUpcoming[0];
  const tdThen = tdUpcoming[1];
  const fmtHeroTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  const microItem = (data.routine || []).find(r => r.recurrence && r.recurrence.kind === 'top-of-hour');
  let microTracker = null;
  if (microItem) {
    const sh = microItem.recurrence.startHour ?? 9;
    const eh = microItem.recurrence.endHour ?? 18;
    const days = microItem.days || [];
    if (days.includes(viewDate.getDay())) {
      const dateKey = startOfDay(viewDate).toISOString();
      const comps = data.routineCompletions || {};
      const nowH = isToday ? now.getHours() : (viewDayOffset > 0 ? -1 : 24);
      const slots = [];
      for (let h = sh; h <= eh; h++) {
        const done = !!comps[`micro-strength:h${h}:${dateKey}`];
        slots.push({ hour: h, status: done ? 'done' : (nowH > h ? 'missed' : 'upcoming') });
      }
      const ref = refLibrary.find(r => r.id === 'ref-micro-strength');
      let exercises = [];
      if (ref && ref.body) {
        exercises = ref.body.split(/\r?\n/).map(l => l.trim())
          .filter(l => /^\d+\./.test(l))
          .map(l => l.replace(/^\d+\.\s*/, '').replace(/\s*—.*$/, '').trim())
          .filter(Boolean);
      }
      microTracker = {
        slots, title: microItem.title,
        doneCount: slots.filter(s => s.status === 'done').length,
        total: slots.length,
        exercises,
        nowH: isToday ? now.getHours() : -1,
        nowM: isToday ? now.getMinutes() : 0,
      };
    }
  }

  const todos = data.todos || _EMPTY_ARRAY;
  const sortedTodos = useMemo(() => [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aSlot = !!a.slot, bSlot = !!b.slot;
    if (aSlot !== bSlot) return aSlot ? -1 : 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  }), [todos]);
  const submitTodo = useCallback(() => {
    if (!todoInput.trim()) return;
    addTodo(todoInput);
    setTodoInput('');
  }, [todoInput, addTodo]);
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Reset hero visibility to view-appropriate default when switching between daily and weekly
  React.useEffect(() => {
    setHeroVisible(mainView === 'today');
  }, [mainView]);

  // Open overlay requested by the IP page menu before navigating back
  React.useEffect(() => {
    if (!pendingCalAction) return;
    if (pendingCalAction === 'weeklyReview') setResetOverlayOpen(true);
    else if (pendingCalAction === 'refLibrary') setRefLibraryOpen(true);
    else if (pendingCalAction === 'settings') setSettingsOpen(true);
    if (onClearPendingAction) onClearPendingAction();
  }, [pendingCalAction]);

  const todoistToken = (data.todoist || {}).token || '';
  const todoistProjectId = (data.todoist || {}).projectId || '';
  const todoistProjectName = (data.todoist || {}).projectName || '';
  const todoistDaysAhead = (data.todoist || {}).daysAhead != null ? (data.todoist || {}).daysAhead : 7;
  const todoistSlots = data.todoistSlots || _EMPTY_OBJ;

  const todoistProxyBase = calendarSettings.proxyUrl ? `${calendarSettings.proxyUrl.replace(/\/+$/, '')}/todoist` : null;

  // Client-side days filter — instant, no re-fetch
  const todoistTasks = React.useMemo(() => {
    if (todoistDaysAhead === 0) return allTodoistTasks;
    const today = startOfDay(new Date());
    const cutoff = new Date(today.getTime() + todoistDaysAhead * 24 * 60 * 60 * 1000);
    return allTodoistTasks.filter(t => {
      if (!t.due) return false;
      const due = startOfDay(new Date(t.due.date));
      return due < cutoff;
    });
  }, [allTodoistTasks, todoistDaysAhead]);

  const todoistPendingTasks = React.useMemo(() => data.todoistPending || [], [data.todoistPending]);

  // Backfill project name if missing (e.g. saved before this field existed)
  React.useEffect(() => {
    if (!todoistToken || !todoistProjectId || !todoistProxyBase || todoistProjectName) return;
    fetch(`${todoistProxyBase}/projects`, { headers: { 'X-Todoist-Token': todoistToken } })
      .then(r => r.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (json.results || []);
        const proj = list.find(p => p.id === todoistProjectId);
        if (proj) updateTodoistSettings({ projectName: proj.name });
      })
      .catch(() => {});
  }, [todoistToken, todoistProjectId, todoistProxyBase, todoistProjectName]);

  React.useEffect(() => {
    if (!todoistToken || !todoistProjectId || !todoistProxyBase) { setAllTodoistTasks([]); setTodoistError(null); return; }
    let cancelled = false;
    const fetchTasks = async () => {
      setTodoistLoading(true);
      // Flush any pending tasks before fetching — they'll appear in the fetch result on success
      const pending = todoistPendingRef.current;
      if (pending.length) {
        const stillPending = [];
        for (const p of pending) {
          try {
            const payload = { content: p.content, project_id: todoistProjectId };
            if (p.due_string) payload.due_string = p.due_string;
            const res = await fetch(`${todoistProxyBase}/tasks`, {
              method: 'POST',
              headers: { 'X-Todoist-Token': todoistToken, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!res.ok) stillPending.push(p);
          } catch { stillPending.push(p); }
        }
        if (!cancelled && stillPending.length !== pending.length) {
          persistData(d => ({ ...d, todoistPending: stillPending }));
        }
      }
      try {
        const res = await fetch(`${todoistProxyBase}/tasks?project_id=${todoistProjectId}`, {
          headers: { 'X-Todoist-Token': todoistToken },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
        }
        const json = await res.json();
        const tasks = Array.isArray(json) ? json : (json.results || json.items || json.tasks || []);
        if (!cancelled) { setAllTodoistTasks(tasks.filter(t => !t.is_completed)); setTodoistError(null); }
      } catch (err) {
        console.error('Todoist fetch error:', err);
        if (!cancelled) setTodoistError(err.message || 'Could not load Todoist tasks');
      } finally {
        if (!cancelled) setTodoistLoading(false);
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [todoistToken, todoistProjectId, todoistProxyBase, todoistRefreshTick]);

  const submitTodoistTask = useCallback(async () => {
    if (!todoInput.trim() || !todoistProxyBase) return;
    const content = todoInput.trim();
    const dueString = todoistDueInput.trim();
    setTodoInput('');
    setTodoistDueInput('');
    try {
      const payload = { content, project_id: todoistProjectId };
      if (dueString) payload.due_string = dueString;
      const res = await fetch(`${todoistProxyBase}/tasks`, {
        method: 'POST',
        headers: { 'X-Todoist-Token': todoistToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = JSON.parse(body);
      setAllTodoistTasks(prev => [task, ...prev]);
    } catch {
      // API unreachable — save to pending queue, will retry on next fetch cycle
      persistData(d => ({
        ...d,
        todoistPending: [
          { id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content, due_string: dueString || null, createdAt: new Date().toISOString() },
          ...(d.todoistPending || []),
        ],
      }));
    }
  }, [todoInput, todoistDueInput, todoistProjectId, todoistProxyBase, todoistToken, persistData]);

  const onTodoRailDragStart = (e, todo) => {
    if (todo.done) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(
      { type: 'todo-promote', todoId: todo.id, title: todo.title }
    ));
  };

  // ── Plan-screen header + aside derivations (presentation only) ──
  const _hr = now.getHours();
  const greeting = _hr < 12 ? 'Good morning' : _hr < 18 ? 'Good afternoon' : 'Good evening';
  const planEyebrow = isToday
    ? `Today · ${viewDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : viewDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const planTitle = isToday ? `${greeting}, Stephane` : viewDate.toLocaleDateString(undefined, { weekday: 'long' });
  const currentTemp = (() => {
    if (!weatherCache || !weatherCache.hours || !weatherCache.hours.length) return null;
    const target = now.getTime();
    let best = null, bestDiff = Infinity;
    for (const h of weatherCache.hours) {
      const diff = Math.abs(new Date(h.time).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; best = h; }
    }
    return best && best.temp != null ? Math.round(best.temp) : null;
  })();
  // Next 3 days, summarised for the discrete weather hover popover.
  const weatherDays = (() => {
    if (!weatherCache || !weatherCache.hours || !weatherCache.hours.length) return [];
    const today0 = startOfDay(now).getTime();
    const out = [];
    for (let d = 1; d <= 3; d++) {
      const dayStart = today0 + d * 86400000;
      const dayHours = weatherCache.hours.filter(h => {
        const t = h.time.getTime();
        return t >= dayStart && t < dayStart + 86400000;
      });
      if (!dayHours.length) continue;
      const temps = dayHours.map(h => h.temp).filter(v => v != null);
      if (!temps.length) continue;
      // Condition: the hour nearest midday is representative of the day.
      const mid = dayHours.reduce((best, h) =>
        Math.abs(h.time.getHours() - 13) < Math.abs(best.time.getHours() - 13) ? h : best, dayHours[0]);
      out.push({
        label: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }),
        hi: Math.round(Math.max(...temps)),
        lo: Math.round(Math.min(...temps)),
        code: mid.code,
        precip: Math.round(Math.max(...dayHours.map(h => h.precip ?? 0))),
      });
    }
    return out;
  })();
  const planAgendaItems = todayItems.filter(it => it.category !== 'supplement' && it.category !== 'elsewhere');
  const planWeekStreak = (() => {
    const comps = data.routineCompletions || {};
    const keys = Object.keys(comps).filter(k => comps[k]);
    return Array.from({ length: 7 }, (_, i) => {
      const key = startOfDay(addDays(weekStart, i)).toISOString();
      return keys.some(k => k.includes(key));
    });
  })();
  const planWeekStreakDone = planWeekStreak.filter(Boolean).length;

  // ── View toggle (Timeline · Day · Week) navigation ──
  const planDayIndex = (d) => { const x = d.getDay(); return x === 0 ? 6 : x - 1; }; // Mon=0
  const dayGridWeekStart = startOfWeek(viewDate);
  const planToday = () => {
    if (planView === 'week') setWeekStart(startOfWeek(new Date()));
    else { setViewDayOffset(0); setScrollToNowTick(n => n + 1); }
  };
  const planPrev = () => {
    if (planView === 'week') setWeekStart(addDays(weekStart, -7));
    else setViewDayOffset(o => o - 1);
  };
  const planNext = () => {
    if (planView === 'week') setWeekStart(addDays(weekStart, 7));
    else setViewDayOffset(o => o + 1);
  };
  const planNavLabel = planView === 'week'
    ? formatRange(weekStart, weekEnd)
    : viewDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // Clicking a day header in Week drills into that day; in Day it returns to Week.
  const planDayClick = (col) => {
    const d = addDays(weekStart, col);
    const off = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
    setViewDayOffset(off);
    setPlanView('day');
  };
  // Supplements + micro for the Tasks & routine band
  const supplementItems = todayItems.filter(it => it.kind === 'routine' && it.category === 'supplement');
  const supplementsTaken = supplementItems.filter(s => s.completed).length;

  return (
    <>

    {/* ── PLAN SCREEN (reference layout) ── */}
    <div className="plan-screen fade-in">

      {/* Page header */}
      <div className="ph">
        <div className="ph-top">
          <div>
            <div className="eb">{planEyebrow}</div>
            <h2 className="t">{planTitle}</h2>
            <div className="p">Your routine, calendar, and the rep that matters today.</div>
          </div>
          {currentTemp != null && (
            <div className="plan-weather" tabIndex={0} aria-label="Weather, next 3 days">
              <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /></svg>
              <span className="tmp">{currentTemp}°</span>
              {weatherDays.length > 0 && (
                <div className="plan-weather-pop" role="tooltip">
                  <div className="pw-h">Next 3 days</div>
                  {weatherDays.map(d => (
                    <div key={d.label} className="pw-row">
                      <span className="pw-day">{d.label}</span>
                      <span className="pw-ic">{wmoIcon(d.code)}</span>
                      <span className="pw-temp">{d.hi}°<span className="pw-lo"> / {d.lo}°</span></span>
                      <span className="pw-precip">{d.precip >= 20 ? `${d.precip}%` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls: day nav (left) · Timeline/Day/Week (right) */}
      <div className="plan-controls">
        <div className="plan-daynav">
          <button className="plan-textbtn" onClick={planToday}>Today</button>
          <button className="plan-iconbtn" onClick={planPrev} aria-label="Previous">‹</button>
          <span className="lbl">{planNavLabel}</span>
          <button className="plan-iconbtn" onClick={planNext} aria-label="Next">›</button>
        </div>
        <div className="plan-seg">
          <button className={planView === 'timeline' ? 'on' : ''} onClick={() => setPlanView('timeline')}>Timeline</button>
          <button className={planView === 'day' ? 'on' : ''} onClick={() => setPlanView('day')}>Day</button>
          <button className={planView === 'week' ? 'on' : ''} onClick={() => setPlanView('week')}>Week</button>
        </div>
      </div>

    {planView !== 'week' ? (
    <>
    {/* BAND 1 — the day. Timeline shows the agenda list; Day swaps the same
        left column for a single-day hour-grid — the aside + bands stay put. */}
    <div className="plan-grid">

      {/* LEFT — agenda (Timeline) or single-day hour-grid (Day) */}
      <div className="plan-agenda">
        {planView === 'day' && !isMobile ? (
          <div className="plan-day-grid day-view">
            <WeekGrid
              routine={(data.routine || []).filter(it => it.category !== 'supplement')}
              overrides={data.overrides || {}}
              scheduledBlocks={blocks}
              projects={projects}
              weekStart={dayGridWeekStart}
              now={now}
              singleCol={planDayIndex(viewDate)}
              onDayClick={() => setPlanView('week')}
              onCreateBlock={createBlock}
              onBlockClick={(blockId) => setOpenBlockId(blockId)}
              onRoutineClick={handleRoutineClick}
              onUpdateBlock={updateBlock}
              elsewhereToggles={elsewhere}
              icsOccurrences={icsOccurrences}
              completions={data.routineCompletions || {}}
              onToggleComplete={toggleRoutineCompletion}
              categoryStyles={categoryStyles}
              calendarToggles={calendarToggles}
            />
          </div>
        ) : planAgendaItems.length === 0 ? (
          <div className="plan-agenda-empty">Nothing scheduled for this day.</div>
        ) : planAgendaItems.map(it => {
          const isPast = isToday && (it.startMin + it.duration) <= nowMin;
          const isRoutine = it.kind === 'routine';
          const isBlock = it.kind === 'block';
          // Calm 4-colour palette per the spec, not per-category rainbow.
          const variant = it.category === 'practice' ? 'practice'
            : (it.category === 'gym' || it.category === 'physical') ? 'physical'
            : (it.kind === 'ics' || it.kind === 'block') ? 'cal'
            : 'routine';
          const meta = isRoutine ? (it.note || (CATS[it.category] && CATS[it.category].label) || `${it.duration} min`)
            : isBlock ? `${it.note ? it.note + ' · ' : ''}${it.duration} min`
            : `From ${it.note === 'WORK' ? 'work' : 'household'} calendar · ${it.duration} min`;
          return (
            <div className="ag-item" key={it.id}>
              <div className="ag-time">{fmtHeroTime(it.startMin)}</div>
              <div
                className={`ag-card ${variant}${it.completed ? ' done' : ''}${isPast ? ' is-past' : ''}`}
                style={{ cursor: (isRoutine || isBlock) ? 'pointer' : 'default' }}
                onClick={isRoutine ? () => handleRoutineClick(it.itemId, viewDate) : isBlock ? () => setOpenBlockId(it.blockId) : undefined}
              >
                <div className="h">
                  {isRoutine && (
                    <button
                      className={`ag-dot${it.completed ? ' done' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleRoutineCompletion(it.itemId, viewDate); }}
                      aria-label={it.completed ? 'Mark not done' : 'Mark done'}
                    />
                  )}
                  {it.title}
                </div>
                {meta && <div className="s">{meta}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* RIGHT — this week / up next, then the supporting panels */}
      <div className="plan-aside">
        <div className="mini-card">
          <div className="mt">This week</div>
          <div className="streak">{planWeekStreak.map((on, i) => <i key={i} className={on ? '' : 'off'} />)}</div>
          <div className="mp">{planWeekStreakDone} of 7 days with activity logged.</div>
        </div>
        <div className="mini-card">
          <div className="mt">Up next</div>
          {tdNext ? (
            <>
              <div className="mlead">{tdNext.kind === 'routine' && CATS[tdNext.category] && CATS[tdNext.category].emoji ? `${CATS[tdNext.category].emoji} ` : ''}{tdNext.title}</div>
              <div className="msub">{fmtHeroTime(tdNext.startMin)}{tdThen ? ` · then ${fmtHeroTime(tdThen.startMin)} ${tdThen.title}` : ''}</div>
            </>
          ) : (
            <div className="mp">Nothing else scheduled today.</div>
          )}
        </div>
          <div className="mini-card">
            <TodayMiniMonth
              viewDate={viewDate}
              now={now}
              onSelectDate={(d) => {
                const start = startOfDay(d).getTime();
                const today0 = startOfDay(now).getTime();
                const offset = Math.round((start - today0) / (24 * 60 * 60 * 1000));
                setViewDayOffset(offset);
              }}
            />
          </div>
      </div>{/* end .plan-aside */}
    </div>{/* end BAND 1 .plan-grid */}

    {/* BAND 2 — tasks & routine */}
    <div className="band">
      <div className="band-label">Tasks &amp; routine<span className="ln" /></div>
      <div className="routine-grid">

        {/* LEFT (wide) — today's tasks, fed by the To-dos source below */}
        <div className="rcol">
          <div className="mini-card">
            <div className="tt-head">
              <div className="mt">Today's tasks</div>
            </div>
            <div className="tt-grid">
              {['morning', 'afternoon'].map(slot => {
                const label = slot === 'morning' ? 'Morning' : 'Afternoon';
                const localItems = todos.filter(t => t.slot === slot).map(t => ({ id: t.id, title: t.title, done: !!t.done, source: 'local' }));
                const tdItems = todoistTasks.filter(t => todoistSlots[t.id] === slot).map(t => ({ id: t.id, title: t.content, done: false, source: 'todoist' }));
                const slotItems = [...localItems, ...tdItems];
                const isTarget = heroDropTarget === slot;
                return (
                  <div
                    key={slot}
                    className={`tt-col${isTarget ? ' drop-active' : ''}`}
                    onDragOver={e => { if (e.dataTransfer.types.includes('application/json')) { e.preventDefault(); setHeroDropTarget(slot); } }}
                    onDragEnter={e => { if (e.dataTransfer.types.includes('application/json')) setHeroDropTarget(slot); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeroDropTarget(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      setHeroDropTarget(null);
                      try {
                        const payload = JSON.parse(e.dataTransfer.getData('application/json'));
                        if (payload.type === 'todo-promote' || payload.type === 'todo-col-move') {
                          const src = payload.source || 'local';
                          const combined = todos.filter(x => x.slot === slot).length + todoistTasks.filter(x => todoistSlots[x.id] === slot).length;
                          if (combined >= 5) return;
                          if (src === 'todoist') { if (todoistSlots[payload.todoId] !== slot) setTodoistTaskSlot(payload.todoId, slot); }
                          else { const t = todos.find(x => x.id === payload.todoId); if (t && t.slot !== slot) setTodoSlot(payload.todoId, slot); }
                        }
                      } catch {}
                    }}
                  >
                    <div className="tt-label">
                      <b>{label}</b>
                      <span className="tt-label-right">
                        <button className="tt-add-mini" onClick={() => { setTodoPickerOpen(true); setTodoistRefreshTick(v => v + 1); }} title="Add from Todoist" aria-label="Add from Todoist">+</button>
                        <span className="c">{slotItems.length} / 5</span>
                      </span>
                    </div>
                    {slotItems.map(item => (
                      <div
                        key={item.id}
                        className={`tt-task${item.done ? ' done' : ''}`}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/json', JSON.stringify({ type: 'todo-col-move', todoId: item.id, source: item.source })); }}
                      >
                        <button
                          className={`tt-check${item.done ? ' done' : ''}`}
                          onClick={() => item.source === 'todoist' ? completeTodoistTask(item.id) : updateTodo(item.id, { done: !item.done })}
                          aria-label={item.done ? 'Mark not done' : 'Mark done'}
                        />
                        <span className="tt-name tt-name--link" onClick={() => setHeroTaskDetail(item)}>{item.title}</span>
                        <button className="tt-remove" onClick={() => item.source === 'todoist' ? setTodoistTaskSlot(item.id, null) : setTodoSlot(item.id, null)} title="Remove from today">×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — supplements + micro-strength */}
        <div className="rcol">
          <div className="mini-card">
            <div className="mt-row"><div className="mt">Supplements</div><span className="mt-count">{supplementsTaken} / {supplementItems.length} taken</span></div>
            {supplementItems.length === 0 ? (
              <div className="empty-line">No supplements today.</div>
            ) : (
              <div className="supp-list">
                {supplementItems.map(s => (
                  <div key={s.id} className={`supp${s.completed ? ' done' : ''}`} onClick={() => toggleRoutineCompletion(s.itemId, viewDate)}>
                    <span className={`s-circle${s.completed ? ' done' : ''}`} />
                    <span className="s-time">{fmtHeroTime(s.startMin)}</span>
                    <span className="s-name">{s.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {microTracker && (
            <div className="mini-card">
              <div className="mt-row"><div className="mt">Micro-Strength</div><span className="mt-count">{microTracker.doneCount} / {microTracker.total} done</span></div>
              <div className="ms-dots">
                {microTracker.slots.map(s => (
                  <button key={s.hour} className={`ms-dot ${s.status}`} onClick={() => toggleMicroSlot(s.hour, viewDate)} title={`${pad(s.hour)}:00`} aria-label={`${pad(s.hour)}:00`} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* BAND 3 — projects */}
    <div className="band">
      <div className="band-label">Projects<span className="ln" /></div>
      <div className="proj-strip">
        {projects.length === 0 ? (
          <div className="empty-line">No projects yet.</div>
        ) : projects.map(p => (
          <span key={p.id} className="pchip">
            <span className="pdot" style={{ background: p.color || 'var(--muted-soft)' }} />
            <span className="pname">{(p.name || '').replace('APP - ', '')}</span>
            {p.tier != null && <span className="tcode">T{p.tier}</span>}
          </span>
        ))}
      </div>
    </div>
    </>
    ) : (
      /* WEEK — the full week hour-grid, kept at its current look (dedicated
         restyle later). Calendar show/hide toggles live here. */
      <>
        <div className="wk-cal-toggles">
          {[
            { key: 'routine', label: 'Routine', dot: 'var(--gold)' },
            { key: 'work', label: 'Work', dot: parseColorVal(calendarSettings.workColor).hex || '#8C8C96' },
            { key: 'household', label: 'Household', dot: parseColorVal(calendarSettings.householdColor).hex || '#7896AF' },
          ].map(({ key, label, dot }) => (
            <button
              key={key}
              className={`wk-cal-toggle ${calendarToggles[key] ? 'on' : 'off'}`}
              onClick={() => setCalendarToggles(t => ({ ...t, [key]: !t[key] }))}
            >
              <span className="dot" style={{ background: dot }} />
              {label}
            </button>
          ))}
        </div>
        <div className="calendar-panel">
          {isMobile ? (
            <AgendaView
              routine={(data.routine || []).filter(it => it.category !== 'supplement')}
              overrides={data.overrides || {}}
              scheduledBlocks={blocks}
              projects={projects}
              weekStart={weekStart}
              now={now}
              onBlockClick={(blockId) => setOpenBlockId(blockId)}
              onRoutineClick={handleRoutineClick}
              elsewhereToggles={elsewhere}
              icsOccurrences={icsOccurrences}
              completions={data.routineCompletions || {}}
              onToggleComplete={toggleRoutineCompletion}
              categoryStyles={categoryStyles}
            />
          ) : (
            <WeekGrid
              routine={(data.routine || []).filter(it => it.category !== 'supplement')}
              overrides={data.overrides || {}}
              scheduledBlocks={blocks}
              projects={projects}
              weekStart={weekStart}
              now={now}
              singleCol={null}
              onDayClick={planDayClick}
              onCreateBlock={createBlock}
              onBlockClick={(blockId) => setOpenBlockId(blockId)}
              onRoutineClick={handleRoutineClick}
              onUpdateBlock={updateBlock}
              elsewhereToggles={elsewhere}
              icsOccurrences={icsOccurrences}
              completions={data.routineCompletions || {}}
              onToggleComplete={toggleRoutineCompletion}
              categoryStyles={categoryStyles}
              calendarToggles={calendarToggles}
            />
          )}
        </div>
      </>
    )}
    </div>{/* end .plan-screen */}

    {/* ＋ Add from Todoist — pulls the configured (Perso) project; tap AM/PM to
        promote into today. Reuses the existing fetch + promote logic untouched. */}
    {todoPickerOpen && (
      <div className="tt-picker-backdrop" onClick={() => setTodoPickerOpen(false)}>
        <div className="tt-picker" onClick={e => e.stopPropagation()}>
          <div className="pk-h">
            <span>From Todoist · {todoistProjectName || 'Perso'}</span>
            <button className="pk-close" onClick={() => setTodoPickerOpen(false)} aria-label="Close">×</button>
          </div>
          <div className="pk-list">
            {(() => {
              const available = todoistTasks.filter(t => !todoistSlots[t.id]);
              if (todoistError) return <div className="pk-empty" style={{ color: 'var(--coral)' }}>{todoistError}</div>;
              if (todoistLoading && available.length === 0) return <div className="pk-empty">Loading…</div>;
              if (available.length === 0) return <div className="pk-empty">Nothing left to add.</div>;
              const slotCount = (slot) => todos.filter(x => x.slot === slot).length + todoistTasks.filter(x => todoistSlots[x.id] === slot).length;
              return available.map(t => (
                <div key={t.id} className="pk-task">
                  <span className="pk-name">{t.content}</span>
                  <span className="pk-btns">
                    <button className="pk-btn" disabled={slotCount('morning') >= 5} onClick={() => setTodoistTaskSlot(t.id, 'morning')} title="Add to Morning">AM</button>
                    <button className="pk-btn" disabled={slotCount('afternoon') >= 5} onClick={() => setTodoistTaskSlot(t.id, 'afternoon')} title="Add to Afternoon">PM</button>
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    )}

    {/* ─── Modals (rendered for both Today and Plan views) ─── */}
    {openBlock && (
      <BlockPopover
        block={openBlock}
        projects={projects}
        onClose={() => setOpenBlockId(null)}
        onUpdate={(changes) => updateBlock(openBlock.id, changes)}
        onDelete={() => { deleteBlock(openBlock.id); setOpenBlockId(null); }}
      />
    )}

    {openRoutineEdit && (
      <RoutineItemPopover
        context={openRoutineEdit}
        routine={data.routine || []}
        overrides={data.overrides || {}}
        onClose={() => setOpenRoutineEdit(null)}
        onUpdateItem={updateRoutineItem}
        onDeleteItem={deleteRoutineItem}
        onSetOverride={setOverride}
        categoryStyles={categoryStyles}
      />
    )}

    {refLibraryOpen && (
      <ReferenceLibraryModal
        entries={refLibrary}
        expandedId={refExpandedId}
        onChangeExpanded={setRefExpandedId}
        onClose={() => setRefLibraryOpen(false)}
        onUpdate={updateRefEntry}
      />
    )}

    {inboxOpen && (
      <InboxModal
        inbox={data.inbox || []}
        onClose={() => setInboxOpen(false)}
        onDelete={deleteInboxItem}
        onAdd={addInboxItem}
      />
    )}

    {resetOverlayOpen && (
      <WeeklyResetOverlay
        weekStart={weekStart}
        now={now}
        onClose={() => setResetOverlayOpen(false)}
        onSave={(answers) => { saveWeeklyReset(answers); }}
        onGenerateBlocks={() => {
          let nextData = data;
          const weekStartIso = weekStart.toISOString();
          (data.modules || []).forEach(m => {
            if (m.type === 'generator' && m.status === 'active') {
              nextData = scheduleModuleBlocks(nextData, m.id, weekStartIso);
            }
          });
          if (nextData !== data) {
            onPersist(nextData);
          }
        }}
      />
    )}


    {settingsOpen && (
      <SettingsModal
        calendars={calendarSettings}
        icsCache={icsCache}
        icsRefreshing={icsRefreshing}
        onUpdate={updateCalendarSettings}
        onRefresh={refreshICS}
        weather={weatherSettings}
        onUpdateWeather={updateWeatherLocation}
        onRequestGeo={requestGeolocation}
        lunchSlot={lunchSlot}
        onSetLunchSlot={setLunchSlot}
        onClose={() => setSettingsOpen(false)}
        routine={data.routine || []}
        onUpdateRoutineItem={updateRoutineItem}
        onAddRoutineItem={addRoutineItem}
        onDeleteRoutineItem={deleteRoutineItem}
        categoryStyles={categoryStyles}
        onSetCategoryColor={setCategoryColor}
        onResetCategoryColor={resetCategoryColor}
        userCategoryColors={userCategoryColors}
        onSetCategoryEmoji={setCategoryEmoji}
        onResetCategoryEmoji={resetCategoryEmoji}
        userCategoryEmojis={userCategoryEmojis}
        onSetCategoryLabel={setCategoryLabel}
        onResetCategoryLabel={resetCategoryLabel}
        userCategoryLabels={userCategoryLabels}
        userCategories={userCategories}
        onAddUserCategory={addUserCategory}
        onUpdateUserCategory={updateUserCategory}
        onDeleteUserCategory={deleteUserCategory}
        usedCategories={usedCategories}
        todoist={data.todoist || _EMPTY_OBJ}
        onUpdateTodoist={updateTodoistSettings}
        nowLineColor={nowLineColor}
        onSetNowLineColor={setNowLineColor}
        miniMonthTodayColor={miniMonthTodayColor}
        onSetMiniMonthTodayColor={setMiniMonthTodayColor}
        nowEventColor={nowEventColor}
        onSetNowEventColor={setNowEventColor}
      />
    )}

    {heroTaskDetail && (
      <div className="hero-task-modal-backdrop" onClick={() => setHeroTaskDetail(null)}>
        <div className="hero-task-modal" onClick={e => e.stopPropagation()}>
          <div className="hero-task-modal-title">{heroTaskDetail.title}</div>
          <button className="hero-task-modal-close" onClick={() => setHeroTaskDetail(null)} aria-label="Close">×</button>
        </div>
      </div>
    )}

    </>
  );
}

// ═════════════════════════════════════════════════════════════

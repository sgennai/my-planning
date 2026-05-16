// Stable empty defaults — hoisted so inline `|| []`/`|| {}` don't create
// new references on every render and silently invalidate useMemo deps.
const _EMPTY_ARRAY = [];
const _EMPTY_OBJ = {};
const _DEFAULT_ELSEWHERE = { morning: false, afternoon: false, allDay: false, date: null };

function CalendarScreen({ data, saving, lastSyncedAt, error, onReload, onSignOut, onPersist }) {
  const isMobile = useMediaQuery('(max-width: 759px)');
  const now = useTickingClock(60000);
  // View routing: 'today' = daily compass (default landing), 'plan' = full week canvas
  const [mainView, setMainView] = useState('today');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dayView, setDayView] = useState(null); // null = week view, 0..6 = visual column
  const [openBlockId, setOpenBlockId] = useState(null); // scheduled block popover
  const [openRoutineEdit, setOpenRoutineEdit] = useState(null); // { itemId, date } for routine click popover
  const [refLibraryOpen, setRefLibraryOpen] = useState(false);
  const [refExpandedId, setRefExpandedId] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [resetOverlayOpen, setResetOverlayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef(null);
  const [scrollToNowTick, setScrollToNowTick] = useState(0);
  const [heroDropTarget, setHeroDropTarget] = useState(null);
  const [todoistTasks, setTodoistTasks] = useState([]);
  const [todoistLoading, setTodoistLoading] = useState(false);
  const [todoistError, setTodoistError] = useState(null);
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
  const userCategoryColors = (data.prefs && data.prefs.categoryColors) || {};
  const userCategoryEmojis = (data.prefs && data.prefs.categoryEmojis) || {};
  const categoryStyles = useMemo(() => categoryStylesWith(userCategoryColors, userCategoryEmojis), [userCategoryColors, userCategoryEmojis]);
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
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
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

  const completeTodoistTask = useCallback(async (taskId) => {
    const token = (data.todoist || {}).token;
    const proxy = (data.calendars || {}).proxyUrl;
    if (!token || !proxy) return;
    try {
      await fetch(`${proxy}/todoist/tasks/${taskId}/close`, {
        method: 'POST',
        headers: { 'X-Todoist-Token': token },
      });
      setTodoistTasks(prev => prev.filter(t => t.id !== taskId));
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
    const colorByKey = {
      work: calendarSettings.workColor || '#8C8C96',
      household: calendarSettings.householdColor || '#7896AF',
    };
    ['work', 'household'].forEach(source => {
      const entry = icsCache[source];
      if (!entry || !entry.events) return;
      const occs = expandEventsForWindow(entry.events, winStart, winEnd, source);
      occs.forEach(o => { o.color = colorByKey[source]; });
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
      items.push({ kind: 'ics', id: `ics-${occ.uid}-${startMin}`, title: occ.summary || (occ.source === 'work' ? 'Work' : '(untitled)'),
        note: occ.source === 'work' ? 'WORK' : 'HOUSEHOLD', startMin, duration: dur,
        color: occ.color || (occ.source === 'work' ? '#8C8C96' : '#7896AF'), allDay: occ.allDay });
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
  const tdCurrent = todayItems.find(it => it.startMin <= nowMin && (it.startMin + it.duration) > nowMin && !it.completed);
  const tdUpcoming = todayItems.filter(it => it.startMin > nowMin && !it.completed);
  const tdNext = tdUpcoming[0];
  const tdThen = tdUpcoming[1];
  const fmtHeroTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  const microItem = (data.routine || []).find(r => r.recurrence && r.recurrence.kind === 'top-of-hour');
  let microBanner = null;
  if (microItem) {
    const days = microItem.days || [];
    const sh = microItem.recurrence.startHour ?? 9;
    const eh = microItem.recurrence.endHour ?? 18;
    const jsDay = now.getDay();
    if (days.includes(jsDay) && now.getHours() >= sh && now.getHours() <= eh && now.getMinutes() < 2) {
      const ref = refLibrary.find(r => r.id === 'ref-micro-strength');
      let summary = '~60–80s · take a movement break';
      if (ref && ref.body) {
        const moves = ref.body.split(/\r?\n/).map(l => l.trim())
          .filter(l => /^\d+\./.test(l))
          .map(l => l.replace(/^\d+\.\s*/, '').replace(/\s*—.*$/, '').trim())
          .filter(Boolean);
        if (moves.length) summary = `~60–80s · ${moves.join(' · ')}`;
      }
      microBanner = { title: microItem.title, summary };
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

  const todoistToken = (data.todoist || {}).token || '';
  const todoistProjectId = (data.todoist || {}).projectId || '';
  const todoistSlots = data.todoistSlots || _EMPTY_OBJ;

  const todoistProxyBase = calendarSettings.proxyUrl ? `${calendarSettings.proxyUrl}/todoist` : null;

  React.useEffect(() => {
    if (!todoistToken || !todoistProjectId || !todoistProxyBase) { setTodoistTasks([]); setTodoistError(null); return; }
    let cancelled = false;
    const fetchTasks = async () => {
      setTodoistLoading(true);
      try {
        const res = await fetch(`${todoistProxyBase}/tasks?project_id=${todoistProjectId}`, {
          headers: { 'X-Todoist-Token': todoistToken },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const tasks = await res.json();
        if (!cancelled) { setTodoistTasks(tasks.filter(t => !t.is_completed)); setTodoistError(null); }
      } catch (err) {
        if (!cancelled) setTodoistError('Could not load Todoist tasks');
      } finally {
        if (!cancelled) setTodoistLoading(false);
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [todoistToken, todoistProjectId, todoistProxyBase]);

  const onTodoRailDragStart = (e, todo) => {
    if (todo.done) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(
      { type: 'todo-promote', todoId: todo.id, title: todo.title }
    ));
  };

  return (
    <>
    {/* ── FIXED APP TOPBAR ── */}
    <div className="app-topbar">
      <div className="app-topbar-center">
        <ViewSwitcher view={mainView} onSwitchView={setMainView} />
      </div>
      <div className="app-topbar-right">
        <button className="app-topbar-btn app-topbar-btn-icon" onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')} title="Toggle theme" aria-label="Toggle theme">{currentTheme === 'light' ? '◐' : '◑'}</button>
        <button className="app-topbar-btn app-topbar-btn-icon" style={{ opacity: weatherVisible ? 1 : 0.4 }} onClick={() => setWeatherVisible(v => !v)} title={weatherVisible ? 'Hide weather' : 'Show weather'} aria-label={weatherVisible ? 'Hide weather' : 'Show weather'}>☁</button>
        <button className={`app-topbar-btn ${isWorkingAway ? 'active' : ''}`} onClick={toggleWorkingAway}>{isWorkingAway ? 'Away' : 'At home'}</button>
        <button className="app-topbar-btn" onClick={() => setInboxOpen(true)}>{openInboxCount > 0 ? `Inbox · ${openInboxCount}` : 'Inbox'}</button>
        <div className="app-menu-wrap" ref={menuRef}>
          <button className="app-topbar-btn app-topbar-btn-icon" onClick={() => setMenuOpen(v => !v)} aria-label="Menu" title="Menu">☰</button>
          {menuOpen && (() => {
            const thisWeekStart = startOfWeek(now);
            const reviewDone = (data.weeklyResets || []).some(r => r.weekStart && startOfDay(new Date(r.weekStart)).getTime() === thisWeekStart.getTime());
            return (
              <div className="app-menu-dropdown">
                <button className="app-menu-item" onClick={() => { setResetOverlayOpen(true); setMenuOpen(false); }}>
                  {reviewDone ? '✓ Weekly Review' : 'Weekly Review'}
                </button>
                <button className="app-menu-item" onClick={() => { setPracticeOpen(true); setMenuOpen(false); }}>Practice</button>
                <button className="app-menu-item" onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>Settings</button>
                <div className="app-menu-divider" />
                <button className="app-menu-item app-menu-item--danger" onClick={() => { onSignOut(); setMenuOpen(false); }}>Sign out</button>
              </div>
            );
          })()}
        </div>
      </div>
    </div>

    <div className={`today-wrap fade-in${mainView === 'plan' && dayView !== null ? ' day-view' : ''}`}>

      {/* LEFT RAIL — full-height glass card, edge to edge */}
      <div className="today-rail">
          {/* Nav header: Today · ‹ · date · › */}
          <div className="today-rail-nav">
            <button className="app-topbar-btn" onClick={mainView === 'today' ? () => { setViewDayOffset(0); setScrollToNowTick(n => n + 1); } : goToday}>Today</button>
            <button className="app-topbar-nav-btn" onClick={mainView === 'today' ? () => setViewDayOffset(o => o - 1) : goPrev} aria-label="Previous">‹</button>
            <span className="today-rail-nav-date">
              {mainView === 'today'
                ? viewDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
                : (dayView !== null
                    ? formatDateShort(addDays(weekStart, dayView))
                    : formatRange(weekStart, weekEnd))
              }
            </span>
            <button className="app-topbar-nav-btn" onClick={mainView === 'today' ? () => setViewDayOffset(o => o + 1) : goNext} aria-label="Next">›</button>
          </div>
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
          <ProjectsRailPanel
            projects={projects}
            scheduledBlocks={blocks}
            onCompleteAction={completeProjectAction}
            onAddAction={addProjectAction}
            onDeleteAction={deleteProjectAction}
          />
          <div className="today-rail-section">
            <div className="today-rail-header">
              <div className="today-rail-eyebrow">Todos</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div className="today-rail-count">{todos.filter(t => !t.done).length} open</div>
                <button className="rail-section-toggle" onClick={() => setTodosExpanded(v => !v)} aria-label={todosExpanded ? 'Collapse todos' : 'Expand todos'}>
                  <span className={`rail-section-toggle-icon${todosExpanded ? '' : ' collapsed'}`}>⌄</span>
                </button>
              </div>
            </div>
            {todosExpanded && (
              <>
                <div className="today-todo-add">
                  <input
                    type="text"
                    className="today-todo-add-input"
                    placeholder="+ add todo, Enter to save"
                    value={todoInput}
                    onChange={e => setTodoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitTodo(); } }}
                  />
                </div>
                <div className="today-rail-list">
                  {sortedTodos.length === 0 ? (
                    <div className="today-rail-empty">No todos.</div>
                  ) : sortedTodos.map(t => (
                    <div
                      key={t.id}
                      className={`today-todo-row ${t.done ? 'done' : ''}`}
                      draggable={!t.done}
                      onDragStart={(e) => onTodoRailDragStart(e, t)}
                    >
                      <input
                        type="checkbox"
                        className="today-todo-check"
                        checked={!!t.done}
                        onChange={() => updateTodo(t.id, { done: !t.done })}
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="today-todo-title">{t.title}</div>
                      <div className="today-todo-slots">
                        <button
                          className={`today-todo-slot-btn${t.slot === 'morning' ? ' active' : ''}`}
                          onClick={e => { e.stopPropagation(); if (t.slot === 'morning') { setTodoSlot(t.id, null); } else { if (todos.filter(x => x.slot === 'morning').length < 5) setTodoSlot(t.id, 'morning'); } }}
                          title="Add to Morning"
                        >AM</button>
                        <button
                          className={`today-todo-slot-btn${t.slot === 'afternoon' ? ' active' : ''}`}
                          onClick={e => { e.stopPropagation(); if (t.slot === 'afternoon') { setTodoSlot(t.id, null); } else { if (todos.filter(x => x.slot === 'afternoon').length < 5) setTodoSlot(t.id, 'afternoon'); } }}
                          title="Add to Afternoon"
                        >PM</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {todoistToken && todoistProjectId && (
            <div className="today-rail-section">
              <div className="today-rail-header">
                <div className="today-rail-eyebrow">{(data.todoist || {}).projectName || 'Todoist'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {todoistLoading && <span style={{ fontSize: 11, color: 'var(--muted-4)', lineHeight: 1 }}>↻</span>}
                  <div className="today-rail-count">{todoistTasks.length}</div>
                </div>
              </div>
              <div className="today-rail-list">
                {todoistError ? (
                  <div className="today-rail-empty">{todoistError}</div>
                ) : todoistTasks.length === 0 ? (
                  <div className="today-rail-empty">{todoistLoading ? 'Loading…' : 'No open tasks.'}</div>
                ) : todoistTasks.map(t => (
                  <div
                    key={t.id}
                    className="today-todo-row"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'todo-promote', todoId: t.id, title: t.content, source: 'todoist' }));
                    }}
                  >
                    <input
                      type="checkbox"
                      className="today-todo-check"
                      checked={false}
                      onChange={() => completeTodoistTask(t.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="today-todo-title">{t.content}</div>
                    <div className="today-todo-slots">
                      <button
                        className={`today-todo-slot-btn${todoistSlots[t.id] === 'morning' ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); if (todoistSlots[t.id] === 'morning') setTodoistTaskSlot(t.id, null); else { const total = todos.filter(x => x.slot === 'morning').length + todoistTasks.filter(x => todoistSlots[x.id] === 'morning').length; if (total < 5) setTodoistTaskSlot(t.id, 'morning'); } }}
                        title="Add to Morning"
                      >AM</button>
                      <button
                        className={`today-todo-slot-btn${todoistSlots[t.id] === 'afternoon' ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); if (todoistSlots[t.id] === 'afternoon') setTodoistTaskSlot(t.id, null); else { const total = todos.filter(x => x.slot === 'afternoon').length + todoistTasks.filter(x => todoistSlots[x.id] === 'afternoon').length; if (total < 5) setTodoistTaskSlot(t.id, 'afternoon'); } }}
                        title="Add to Afternoon"
                      >PM</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="today-rail-section">
            <div className="today-rail-header">
              <div className="today-rail-eyebrow">Calendars</div>
              <button className="rail-section-toggle" onClick={() => setCalendarsExpanded(v => !v)} aria-label={calendarsExpanded ? 'Collapse calendars' : 'Expand calendars'}>
                <span className={`rail-section-toggle-icon${calendarsExpanded ? '' : ' collapsed'}`}>⌄</span>
              </button>
            </div>
            {calendarsExpanded && <div className="today-cal-toggles">
              {[
                { key: 'routine', label: 'Routine', color: 'var(--primary)' },
                { key: 'work', label: 'Work', color: calendarSettings.workColor || '#8C8C96' },
                { key: 'household', label: 'Household', color: calendarSettings.householdColor || '#7896AF' },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  className={`cal-toggle-btn ${calendarToggles[key] ? 'active' : ''}`}
                  onClick={() => setCalendarToggles(t => ({ ...t, [key]: !t[key] }))}
                >
                  <span className="cal-toggle-check" style={{ '--cal-check-color': color }}>
                    {calendarToggles[key] && <span className="cal-toggle-check-mark">✓</span>}
                  </span>
                  {label}
                </button>
              ))}
            </div>}
          </div>
        </div>

      {/* RIGHT PANE — weather + hero + calendar + footer */}
      <div className="today-right-col">

        {/* WEATHER — same width as hero/calendar (hidden by default) */}
        {weatherVisible && (
          <WeatherStrip
            settings={weatherSettings}
            cache={weatherCache}
            refreshing={weatherRefreshing}
            error={weatherError}
            dayTab={weatherDayTab}
            now={now}
            onChangeDayTab={setWeatherDayTab}
            onRefresh={() => refreshWeather()}
            onRequestGeo={requestGeolocation}
          />
        )}

        {/* HERO BANNER — 3 cards side by side */}
        <div className="today-hero-row">

          {/* Card 1: Next up / Right now */}
          <div className="today-hero">
            {tdCurrent ? (
              <>
                <div className="today-hero-eyebrow">Right now</div>
                <div className="today-hero-now">
                  {tdCurrent.kind === 'routine' && CATS[tdCurrent.category] && CATS[tdCurrent.category].emoji ? `${CATS[tdCurrent.category].emoji} ` : ''}
                  {tdCurrent.title}
                </div>
                <div className="today-hero-now-meta">
                  ends {fmtHeroTime(tdCurrent.startMin + tdCurrent.duration)}
                  {tdCurrent.note && <span> · {tdCurrent.note}</span>}
                </div>
                {tdNext && (
                  <div className="today-hero-next">
                    <span className="today-hero-next-label">Next</span>
                    <span className="today-hero-next-time">{fmtHeroTime(tdNext.startMin)}</span>
                    <span>{tdNext.kind === 'routine' && CATS[tdNext.category] && CATS[tdNext.category].emoji ? `${CATS[tdNext.category].emoji} ` : ''}{tdNext.title}</span>
                  </div>
                )}
                {tdThen && (
                  <div className="today-hero-then">
                    <span className="today-hero-then-label">Then</span>
                    <span className="today-hero-then-time">{fmtHeroTime(tdThen.startMin)}</span>
                    <span>{tdThen.kind === 'routine' && CATS[tdThen.category] && CATS[tdThen.category].emoji ? `${CATS[tdThen.category].emoji} ` : ''}{tdThen.title}</span>
                  </div>
                )}
              </>
            ) : tdNext ? (
              <>
                <div className="today-hero-eyebrow">Next up</div>
                <div className="today-hero-now">
                  <span className="today-hero-next-time" style={{ marginRight: 'var(--space-3)' }}>{fmtHeroTime(tdNext.startMin)}</span>
                  {tdNext.kind === 'routine' && CATS[tdNext.category] && CATS[tdNext.category].emoji ? `${CATS[tdNext.category].emoji} ` : ''}{tdNext.title}
                </div>
                {tdNext.note && <div className="today-hero-now-meta">{tdNext.note}</div>}
                {tdThen && (
                  <div className="today-hero-then">
                    <span className="today-hero-then-label">Then</span>
                    <span className="today-hero-then-time">{fmtHeroTime(tdThen.startMin)}</span>
                    <span>{tdThen.kind === 'routine' && CATS[tdThen.category] && CATS[tdThen.category].emoji ? `${CATS[tdThen.category].emoji} ` : ''}{tdThen.title}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="today-hero-eyebrow">Today</div>
                <div className="today-hero-now" style={{ color: 'var(--muted-3)' }}>Nothing else scheduled.</div>
              </>
            )}
            {microBanner && (
              <div className="today-hero-micro">⚡ {microBanner.title} · {microBanner.summary}</div>
            )}
          </div>

          {/* Card 2: Routine — supplements only, checkable */}
          <div className="today-hero today-hero--secondary">
            <div className="today-hero-eyebrow">Routine</div>
            {(() => {
              const supplements = todayItems.filter(it => it.kind === 'routine' && it.category === 'supplement');
              if (supplements.length === 0) return <div className="today-hero-empty">No supplements today.</div>;
              const half = Math.ceil(supplements.length / 2);
              const col1 = supplements.slice(0, half);
              const col2 = supplements.slice(half);
              const renderRow = (it) => (
                <div
                  key={it.id}
                  className={`today-hero-list-item today-hero-sup-row${it.completed ? ' done' : ''}`}
                  onClick={() => toggleRoutineCompletion(it.itemId, viewDate)}
                >
                  <span className={`today-hero-sup-check${it.completed ? ' checked' : ''}`}>
                    {it.completed ? '✓' : ''}
                  </span>
                  <span className="today-hero-list-time">{fmtHeroTime(it.startMin)}</span>
                  <span className="today-hero-list-title">{it.title}</span>
                </div>
              );
              return (
                <div className="today-hero-sup-cols">
                  <div className="today-hero-list">{col1.map(renderRow)}</div>
                  <div className="today-hero-list">{col2.map(renderRow)}</div>
                </div>
              );
            })()}
          </div>

          {/* Card 3: Personal tasks — Morning / Afternoon columns */}
          <div className="today-hero today-hero--secondary">
            <div className="today-hero-eyebrow">Personal tasks</div>
            <div className="today-hero-pt-cols">
              {['morning', 'afternoon'].map(slot => {
                const label = slot === 'morning' ? 'Morning' : 'Afternoon';
                const localItems = todos.filter(t => t.slot === slot).map(t => ({ id: t.id, title: t.title, done: !!t.done, source: 'local' }));
                const tdItems = todoistTasks.filter(t => todoistSlots[t.id] === slot).map(t => ({ id: t.id, title: t.content, done: false, source: 'todoist' }));
                const slotItems = [...localItems, ...tdItems];
                const isTarget = heroDropTarget === slot;
                return (
                  <div
                    key={slot}
                    className={`today-hero-pt-col${isTarget ? ' drop-active' : ''}`}
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
                    <div className="today-hero-pt-col-header">
                      {label} <span className="today-hero-pt-count">{slotItems.length}/5</span>
                    </div>
                    <div className="today-hero-list">
                      {slotItems.length === 0
                        ? <div className="today-hero-pt-empty">Drop here</div>
                        : slotItems.map(item => (
                          <div
                            key={item.id}
                            className={`today-hero-list-item today-hero-pt-item${item.done ? ' done' : ''}`}
                            draggable
                            onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/json', JSON.stringify({ type: 'todo-col-move', todoId: item.id, source: item.source })); }}
                          >
                            <input
                              type="checkbox"
                              className="today-hero-pt-check"
                              checked={item.done}
                              onChange={() => item.source === 'todoist' ? completeTodoistTask(item.id) : updateTodo(item.id, { done: !item.done })}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="today-hero-list-title">{item.title}</span>
                            <button className="today-hero-pt-remove" onClick={() => item.source === 'todoist' ? setTodoistTaskSlot(item.id, null) : setTodoSlot(item.id, null)} title="Unpromote">×</button>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {mainView === 'today' ? (
          <TodayScreen
            viewDate={viewDate}
            isToday={isToday}
            viewDayOffset={viewDayOffset}
            todayItems={todayItems.filter(it => it.category !== 'supplement')}
            current={tdCurrent}
            nowMin={nowMin}
            now={now}
            elsewhere={elsewhere}
            categoryStyles={categoryStyles}
            lunchSlot={lunchSlot}
            todayViewMode={todayViewMode}
            onSetTodayView={setTodayView}
            onCreateBlock={createBlock}
            onOpenBlock={(blockId) => setOpenBlockId(blockId)}
            onRoutineClick={handleRoutineClick}
            onToggleRoutineCompletion={toggleRoutineCompletion}
            scrollToNowTick={scrollToNowTick}
          />
        ) : (
          <div className="calendar-panel">
            {dayView !== null && !isMobile && (
              <button className="day-view-back" onClick={() => setDayView(null)}>← Back to week</button>
            )}
            {isMobile ? (
              <AgendaView
                routine={data.routine}
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
                routine={data.routine}
                overrides={data.overrides || {}}
                scheduledBlocks={blocks}
                projects={projects}
                weekStart={weekStart}
                now={now}
                singleCol={dayView}
                onDayClick={handleDayClick}
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
            <Legend />
          </div>
        )}

        {/* FOOTER */}
      </div>{/* end today-right-col */}
    </div>

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
        onToggle={toggleInboxItem}
        onDelete={deleteInboxItem}
      />
    )}

    {resetOverlayOpen && (
      <WeeklyResetOverlay
        weekStart={weekStart}
        now={now}
        onClose={() => setResetOverlayOpen(false)}
        onSave={(answers) => { saveWeeklyReset(answers); }}
      />
    )}

    {practiceOpen && (
      <DailyPracticeHub
        data={data}
        onClose={() => setPracticeOpen(false)}
        onUpdateItem={updatePracticeItem}
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
        todoist={data.todoist || _EMPTY_OBJ}
        onUpdateTodoist={updateTodoistSettings}
        proxyUrl={calendarSettings.proxyUrl || ''}
      />
    )}

    </>
  );
}

// ═════════════════════════════════════════════════════════════

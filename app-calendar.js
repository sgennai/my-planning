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
  // ICS imported events: per-feed parsed events in memory (not synced to Drive)
  // Shape: { work: { events: [...], lastFetched: Date, error: '' }, household: { ... } }
  const [icsCache, setIcsCache] = useState({ work: null, household: null });
  const [icsRefreshing, setIcsRefreshing] = useState(false);
  // Weather state (memory-only — like ICS, not synced to Drive)
  const [weatherCache, setWeatherCache] = useState(null); // { hours, fetchedAt, tz }
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherDayTab, setWeatherDayTab] = useState(0); // 0=today, 1=tomorrow, 2=day-after

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
  const elsewhere = data.elsewhereToggles || { morning: false, afternoon: false, allDay: false, date: null };
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

  // Drag-drop: pending drop captured by WeekGrid, then a duration prompt asks "how long".
  // Shape: { todoId, date, start, dropX, dropY } | null
  const [pendingTodoDrop, setPendingTodoDrop] = useState(null);

  const confirmTodoDrop = useCallback((duration) => {
    if (!pendingTodoDrop) return;
    const todo = (data.todos || []).find(t => t.id === pendingTodoDrop.todoId);
    if (!todo) { setPendingTodoDrop(null); return; }
    const block = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: todo.title,
      date: pendingTodoDrop.date,
      start: pendingTodoDrop.start,
      duration,
      todoId: todo.id,
      status: 'scheduled',
      actualMinutes: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    persistData(d => ({
      ...d,
      scheduledBlocks: [...(d.scheduledBlocks || []), block],
    }));
    setPendingTodoDrop(null);
  }, [pendingTodoDrop, persistData, data.todos]);

  const cancelTodoDrop = useCallback(() => setPendingTodoDrop(null), []);

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

  const blocks = data.scheduledBlocks || [];
  const projects = data.projects || [];
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

  const tdOverrides = data.overrides || {};
  const tdCompletions = data.routineCompletions || {};
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
      items.push({ kind: 'ics', id: `ics-${occ.uid}-${startMin}`, title: occ.summary || '(untitled)',
        note: occ.source === 'work' ? 'WORK' : 'HOUSEHOLD', startMin, duration: dur,
        color: occ.color || (occ.source === 'work' ? '#8C8C96' : '#7896AF'), allDay: occ.allDay });
    });
    items.sort((a, b) => a.startMin - b.startMin);
    return items;
  }, [data.routine, tdOverrides, tdCompletions, elsewhere, now, viewDate, blocks, projects, icsOccurrences]);

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

  const todos = data.todos || [];
  const scheduledTodoIds = new Set((blocks).filter(b => b.todoId && b.status !== 'completed').map(b => b.todoId));
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aSched = scheduledTodoIds.has(a.id);
    const bSched = scheduledTodoIds.has(b.id);
    if (aSched !== bSched) return aSched ? 1 : -1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  const submitTodo = () => {
    if (!todoInput.trim()) return;
    addTodo(todoInput);
    setTodoInput('');
  };
  const onTodoRailDragStart = (e, todo) => {
    if (todo.done) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(
      { type: 'todo', todoId: todo.id, title: todo.title, duration: 30 }
    ));
  };

  return (
    <>
    {/* ── FIXED APP TOPBAR ── */}
    <div className="app-topbar">
      <div className="app-topbar-left">
        <button className="app-topbar-btn" onClick={mainView === 'today' ? () => setViewDayOffset(0) : goToday}>Today</button>
        <button className="app-topbar-nav-btn" onClick={mainView === 'today' ? () => setViewDayOffset(o => o - 1) : goPrev}>‹</button>
        <button className="app-topbar-nav-btn" onClick={mainView === 'today' ? () => setViewDayOffset(o => o + 1) : goNext}>›</button>
        <span className="app-topbar-date">
          {mainView === 'today'
            ? viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
            : (dayView !== null
                ? (isSameDay(addDays(weekStart, dayView), now) ? 'Today' : `${DAY_NAMES_LONG[dayView]}, ${formatDateShort(addDays(weekStart, dayView))}`)
                : (isCurrentWeek ? 'This week' : formatRange(weekStart, weekEnd)))
          }
        </span>
      </div>
      <div className="app-topbar-center">
        <ViewSwitcher view={mainView} onSwitchView={setMainView} />
      </div>
      <div className="app-topbar-right">
        <button className="app-topbar-btn app-topbar-btn-icon" onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')} title="Toggle theme">{currentTheme === 'light' ? '◐' : '◑'}</button>
        <button className={`app-topbar-btn ${isWorkingAway ? 'active' : ''}`} onClick={toggleWorkingAway}>{isWorkingAway ? 'Away' : 'At home'}</button>
        <button className="app-topbar-btn" onClick={() => setPracticeOpen(true)}>Practice</button>
        <button className="app-topbar-btn" onClick={() => setInboxOpen(true)}>{openInboxCount > 0 ? `Inbox · ${openInboxCount}` : 'Inbox'}</button>
        <button className="app-topbar-btn" onClick={() => setSettingsOpen(true)}>Settings</button>
      </div>
    </div>

    <div className={`today-wrap fade-in${mainView === 'plan' && dayView !== null ? ' day-view' : ''}`}>

      {/* ── WEATHER (identical in both views) ── */}
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

      {/* ── HERO BANNER (identical in both views) ── */}
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

      {/* ── BODY: shared left rail + switching right pane ── */}
      <div className="today-body">

        {/* LEFT RAIL — same in both views */}
        <div className="today-rail">
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
              <div className="today-rail-count">{todos.filter(t => !t.done).length} open</div>
            </div>
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
              ) : sortedTodos.map(t => {
                const sched = !t.done && scheduledTodoIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    className={`today-todo-row ${t.done ? 'done' : ''} ${sched ? 'scheduled' : ''}`}
                    draggable={!t.done}
                    onDragStart={(e) => onTodoRailDragStart(e, t)}
                    title={t.done ? 'Done' : (sched ? 'Scheduled · drag to reschedule' : 'Drag onto timeline to schedule')}
                  >
                    <input
                      type="checkbox"
                      className="today-todo-check"
                      checked={!!t.done}
                      onChange={() => updateTodo(t.id, { done: !t.done })}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="today-todo-title">{t.title}</div>
                    {sched && <div className="today-todo-badge">SCHED</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT PANE — today timeline OR week grid */}
        {mainView === 'today' ? (
          <TodayScreen
            viewDate={viewDate}
            isToday={isToday}
            viewDayOffset={viewDayOffset}
            todayItems={todayItems}
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
            onTodoDrop={setPendingTodoDrop}
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
                onTodoDrop={setPendingTodoDrop}
                completions={data.routineCompletions || {}}
                onToggleComplete={toggleRoutineCompletion}
                categoryStyles={categoryStyles}
              />
            )}
            <Legend />
          </div>
        )}
      </div>

      {/* ── FOOTER (identical in both views) ── */}
      <div className="today-footer">
        <FridayReviewLauncher now={now} weeklyResets={data.weeklyResets || []} onLaunch={() => setResetOverlayOpen(true)} />
        <span className="today-footer-status">
          {saving ? 'Saving…' : (error ? 'Save error' : (lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''))}
        </span>
        <button className="today-footer-btn" onClick={onSignOut} style={{ marginLeft: 'auto' }}>Sign out</button>
      </div>
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
      />
    )}

    {pendingTodoDrop && (
      <TodoDurationPrompt
        drop={pendingTodoDrop}
        todo={(data.todos || []).find(t => t.id === pendingTodoDrop.todoId)}
        onConfirm={confirmTodoDrop}
        onCancel={cancelTodoDrop}
      />
    )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════

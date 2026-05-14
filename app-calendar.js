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
  const [routineManagerOpen, setRoutineManagerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [resetOverlayOpen, setResetOverlayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // View routing: Today is the daily compass; Plan is the full week canvas.
  // Both share the modals rendered at the bottom of this component.
  return (
    <>
    {mainView === 'today' ? (
      <TodayScreen
        data={data}
        now={now}
        isMobile={isMobile}
        saving={saving}
        error={error}
        lastSyncedAt={lastSyncedAt}
        onSwitchToPlan={() => setMainView('plan')}
        projects={projects}
        blocks={blocks}
        refLibrary={refLibrary}
        elsewhere={elsewhere}
        weatherSettings={weatherSettings}
        weatherCache={weatherCache}
        weatherRefreshing={weatherRefreshing}
        weatherError={weatherError}
        icsOccurrences={icsOccurrences}
        onRefreshWeather={() => refreshWeather()}
        onRequestGeo={requestGeolocation}
        onCreateBlock={createBlock}
        onAddTodo={addTodo}
        onUpdateTodo={updateTodo}
        onDeleteTodo={deleteTodo}
        onCompleteAction={completeProjectAction}
        onAddAction={addProjectAction}
        onDeleteAction={deleteProjectAction}
        onToggleRoutineCompletion={toggleRoutineCompletion}
        onSetElsewhere={(patch) => persistData(d => ({
          ...d,
          elsewhereToggles: { ...(d.elsewhereToggles || { morning: false, afternoon: false, allDay: false, date: null }), ...patch, date: todayDateKey },
        }))}
        onOpenReference={(id) => { setRefExpandedId(id); setRefLibraryOpen(true); }}
        onOpenBlock={(blockId) => setOpenBlockId(blockId)}
        onRoutineClick={handleRoutineClick}
        onTodoDrop={setPendingTodoDrop}
        onLaunchReview={() => setResetOverlayOpen(true)}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        inbox={data.inbox || []}
        weeklyResets={data.weeklyResets || []}
        currentTheme={currentTheme}
        onSetTheme={setTheme}
        categoryStyles={categoryStyles}
        todayViewMode={todayViewMode}
        onSetTodayView={setTodayView}
        lunchSlot={lunchSlot}
      />
    ) : (
    <div className={`wrap-wide screen-pad-top-sm fade-in ${dayView !== null ? 'day-view' : ''}`}>
      <div className="today-topbar">
        <div className="today-topbar-left">
          <div className="today-date-block">
            <div className="today-date">
              <span className="today-date-day">
                {dayView !== null
                  ? (isSameDay(addDays(weekStart, dayView), now) ? 'Today' : DAY_NAMES_LONG[dayView])
                  : (isCurrentWeek ? 'This week' : `Week of ${formatDateShort(weekStart)}`)}
              </span>
              <span className="today-date-rest">
                {dayView !== null
                  ? `${formatDateShort(addDays(weekStart, dayView))}, ${addDays(weekStart, dayView).getFullYear()}`
                  : formatRange(weekStart, weekEnd)}
              </span>
            </div>
            <div className="today-date-time">
              {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </div>
        <div className="today-topbar-right">
          <button className="today-plan-link" onClick={() => setMainView('today')}>← Today</button>
        </div>
      </div>
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

      <div className="main-layout">
        <div className="portfolio">
          <ProjectsRailPanel projects={projects} scheduledBlocks={blocks} onCompleteAction={completeProjectAction} onAddAction={addProjectAction} onDeleteAction={deleteProjectAction} />
          <TodosPane
            todos={data.todos || []}
            scheduledBlocks={blocks}
            onAdd={addTodo}
            onUpdate={updateTodo}
            onDelete={deleteTodo}
          />
        </div>

        <div className="calendar-panel">
          <CalendarHeader
            weekStart={weekStart}
            weekEnd={weekEnd}
            isCurrentWeek={isCurrentWeek}
            dayView={dayView}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            saving={saving}
            error={error}
            lastSyncedAt={lastSyncedAt}
            onManageRoutine={() => setRoutineManagerOpen(true)}
            now={now}
            isWorkingAway={!!(elsewhere && (elsewhere.allDay || elsewhere.morning || elsewhere.afternoon))}
            onToggleWorkingAway={() => {
              const isAway = !!(elsewhere && (elsewhere.allDay || elsewhere.morning || elsewhere.afternoon));
              toggleElsewhere({ morning: false, afternoon: false, allDay: !isAway });
            }}
            hideTitle={true}
          />

          {dayView !== null && !isMobile && (
            <button className="day-view-back" onClick={() => setDayView(null)}>
              ← Back to week
            </button>
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
      </div>

      <details className="raw">
        <summary>Diagnostics · raw data</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>

      <div className="footer">
        <div className="footer-info">{FILE_NAME}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FridayReviewLauncher
            now={now}
            weeklyResets={data.weeklyResets || []}
            onLaunch={() => setResetOverlayOpen(true)}
          />
          {(calendarSettings.workIcs || calendarSettings.householdIcs) && (
            <button className="btn-tertiary" onClick={refreshICS} disabled={icsRefreshing}>
              {icsRefreshing ? '↻ Refreshing…' : '↻ Calendars'}
            </button>
          )}
          <button
            className="btn-tertiary"
            onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')}
            title={currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {currentTheme === 'light' ? '◐ Dark' : '◑ Light'}
          </button>
          <button className="btn-tertiary" onClick={() => setSettingsOpen(true)}>⚙ Settings</button>
          <button className="btn-tertiary" onClick={onReload}>↻ Reload</button>
          <button className="btn-tertiary" onClick={onSignOut}>Sign out</button>
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

    {routineManagerOpen && (
      <RoutineManagerModal
        routine={data.routine || []}
        onClose={() => setRoutineManagerOpen(false)}
        onUpdateItem={updateRoutineItem}
        onAddItem={addRoutineItem}
        onDeleteItem={deleteRoutineItem}
        categoryStyles={categoryStyles}
        onSetCategoryColor={setCategoryColor}
        onResetCategoryColor={resetCategoryColor}
        userCategoryColors={userCategoryColors}
        onSetCategoryEmoji={setCategoryEmoji}
        onResetCategoryEmoji={resetCategoryEmoji}
        userCategoryEmojis={userCategoryEmojis}
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

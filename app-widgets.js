// CAPTURE BAR — single text input for fleeting thoughts
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
// WEATHER STRIP — thin top-of-page band, 24h with day tabs
// ═════════════════════════════════════════════════════════════
function WeatherStrip({ settings, cache, refreshing, error, dayTab, now, onChangeDayTab, onRefresh, onRequestGeo }) {
  // Empty state: no coordinates yet
  const hasCoords = settings && settings.lat != null && settings.lon != null;

  if (!hasCoords) {
    const declined = settings && settings.source === 'declined';
    return (
      <div className="weather-strip">
        <div className="weather-strip-status">
          {declined
            ? 'Set your location in Settings to enable the forecast.'
            : (refreshing ? 'Asking for location…' : 'Browser will prompt for location once.')}
        </div>
        {(declined || error) && (
          <button className="weather-strip-refresh" onClick={onRequestGeo}>
            Ask again
          </button>
        )}
      </div>
    );
  }

  // Build the cells for the selected day tab
  const targetDate = addDays(startOfDay(now), dayTab);
  const targetDateMs = targetDate.getTime();
  const nextDayMs = targetDateMs + 24 * 60 * 60 * 1000;
  const nowHour = now.getHours();
  const nowDateMs = startOfDay(now).getTime();
  const isToday = targetDateMs === nowDateMs;

  // Filter to the requested day's hours, then pick the cell closest to each checkpoint hour.
  const allCells = (cache && Array.isArray(cache.hours))
    ? cache.hours.filter(h => {
        const t = h.time.getTime();
        return t >= targetDateMs && t < nextDayMs;
      })
    : [];
  const checkpointHours = [7, 12, 17, 22];
  const checkpointLabels = ['Morning', 'Midday', 'Afternoon', 'Evening'];
  const cells = checkpointHours.map(target => {
    // Find exact match first; fall back to nearest non-past cell.
    let cell = allCells.find(h => h.time.getHours() === target);
    if (!cell && allCells.length) {
      cell = allCells.reduce((best, c) => {
        const dist = Math.abs(c.time.getHours() - target);
        return (!best || dist < Math.abs(best.time.getHours() - target)) ? c : best;
      }, null);
    }
    return cell;
  });

  const tabs = [
    { idx: 0, label: 'Today' },
    { idx: 1, label: 'Tomorrow' },
    { idx: 2, label: addDays(now, 2).toLocaleDateString(undefined, { weekday: 'short' }) },
  ];

  const renderTabBar = () => (
    <div className="weather-strip-tabs">
      {tabs.map(t => (
        <button
          key={t.idx}
          className={`weather-strip-tab ${dayTab === t.idx ? 'active' : ''}`}
          onClick={() => onChangeDayTab(t.idx)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="weather-strip">
      {renderTabBar()}
      {refreshing && cells.length === 0 ? (
        <div className="weather-strip-status">Loading forecast…</div>
      ) : error ? (
        <div className="weather-strip-status error">{error}</div>
      ) : cells.every(c => !c) ? (
        <div className="weather-strip-status">No data for this day</div>
      ) : (
        <div className="weather-strip-cells">
          {cells.map((h, i) => {
            if (!h) {
              return (
                <div key={i} className="weather-cell">
                  <div className="weather-cell-hour">{checkpointLabels[i]}</div>
                  <div className="weather-cell-icon" style={{ opacity: 0.3 }}>—</div>
                  <div className="weather-cell-temp">—</div>
                  <div className="weather-cell-precip dry">—</div>
                </div>
              );
            }
            const hour = h.time.getHours();
            const isNowCell = isToday && hour === nowHour;
            const dry = (h.precip ?? 0) < 5;
            const checkpointHour = checkpointHours[i];
            const fmtH = checkpointHour === 0 ? '12 AM' : checkpointHour < 12 ? `${checkpointHour} AM` : checkpointHour === 12 ? '12 PM' : `${checkpointHour - 12} PM`;
            return (
              <div
                key={i}
                className={`weather-cell ${isNowCell ? 'now' : ''}`}
                title={`${checkpointLabels[i]} · ${fmtH} · ${h.temp != null ? Math.round(h.temp) + '°C' : '—'} · ${h.precip ?? 0}% precip`}
              >
                <div className="weather-cell-hour">{fmtH}</div>
                <div className="weather-cell-icon">{wmoIcon(h.code)}</div>
                <div className="weather-cell-temp">
                  {h.temp != null ? Math.round(h.temp) + '°' : '—'}
                </div>
                <div className={`weather-cell-precip ${dry ? 'dry' : ''}`}>
                  💧 {h.precip ?? 0}%
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="weather-strip-refresh" onClick={onRefresh} disabled={refreshing} title="Refresh forecast">
        {refreshing ? '↻…' : '↻'}
      </button>
    </div>
  );
}


function CaptureBar({ inbox, onAdd, onOpenInbox }) {
  const [value, setValue] = useState('');
  const submit = () => {
    if (!value.trim()) return;
    onAdd(value);
    setValue('');
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };
  const openCount = inbox.filter(i => !i.actioned).length;
  return (
    <div className="capture-bar">
      <input
        type="text"
        className="capture-input"
        placeholder="Capture a fleeting thought — Enter to save…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        className={`capture-count ${openCount > 0 ? 'has-items' : ''}`}
        onClick={onOpenInbox}
        title={`${openCount} open · ${inbox.length} total`}
      >
        Inbox · {openCount}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// INBOX MODAL — review captured thoughts
// ═════════════════════════════════════════════════════════════
function InboxModal({ inbox, onClose, onToggle, onDelete }) {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };
  const open = inbox.filter(i => !i.actioned);
  const actioned = inbox.filter(i => i.actioned);

  const formatTimestamp = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);
    if (diffHrs < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`;
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
    if (diffHrs < 24 * 7) return `${Math.floor(diffHrs / 24)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal inbox-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <div className="modal-eyebrow">Capture Inbox</div>
          <div className="modal-title">{open.length} open · {inbox.length} total</div>
          <div className="modal-meta">
            <span style={{ fontStyle: 'italic' }}>If a thought becomes an action, re-create it on a project card</span>
          </div>
        </div>
        <div className="modal-body">
          {inbox.length === 0 ? (
            <div className="inbox-empty">No captures yet. Use the bar above the calendar to drop thoughts in.</div>
          ) : (
            <>
              {open.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="modal-section-label">Open</div>
                  <div className="inbox-list">
                    {open.map(item => (
                      <div key={item.id} className="inbox-item">
                        <input
                          type="checkbox"
                          className="inbox-item-checkbox"
                          checked={false}
                          onChange={() => onToggle(item.id)}
                        />
                        <div className="inbox-item-text">{item.text}</div>
                        <div className="inbox-item-time">{formatTimestamp(item.createdAt)}</div>
                        <button
                          className="inbox-item-delete"
                          onClick={() => { if (confirm('Delete this capture?')) onDelete(item.id); }}
                          title="Delete"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {actioned.length > 0 && (
                <div>
                  <div className="modal-section-label">Done</div>
                  <div className="inbox-list">
                    {actioned.map(item => (
                      <div key={item.id} className="inbox-item actioned">
                        <input
                          type="checkbox"
                          className="inbox-item-checkbox"
                          checked={true}
                          onChange={() => onToggle(item.id)}
                        />
                        <div className="inbox-item-text">{item.text}</div>
                        <div className="inbox-item-time">{formatTimestamp(item.createdAt)}</div>
                        <button
                          className="inbox-item-delete"
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ELSEWHERE TOGGLES — hide home-only items for today
// ═════════════════════════════════════════════════════════════
function ElsewhereToggles({ elsewhere, onToggle }) {
  return (
    <div className="elsewhere-toggles">
      <span className="elsewhere-label">Today, I'm</span>
      <button
        className={`elsewhere-btn ${elsewhere.morning ? 'active' : ''}`}
        onClick={() => onToggle('morning')}
        disabled={elsewhere.allDay}
      >Out · Morning</button>
      <button
        className={`elsewhere-btn ${elsewhere.afternoon ? 'active' : ''}`}
        onClick={() => onToggle('afternoon')}
        disabled={elsewhere.allDay}
      >Out · Afternoon</button>
      <button
        className={`elsewhere-btn ${elsewhere.allDay ? 'active' : ''}`}
        onClick={() => onToggle('allDay')}
      >Out · All day</button>
      {(elsewhere.morning || elsewhere.afternoon || elsewhere.allDay) && (
        <span style={{ fontSize: 10, color: 'var(--coral)', fontFamily: 'var(--mono)', letterSpacing: '0.15em', marginLeft: 8 }}>
          Home-only items hidden · resets at midnight
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ELSEWHERE SUGGESTIONS — one banner per homeOnly supplement
// that conflicts with today's elsewhere toggles. One-tap move.
// ═════════════════════════════════════════════════════════════
function ElsewhereSuggestions({ routine, overrides, elsewhere, today, onMove, onDismiss }) {
  const anyToggleOn = elsewhere && (elsewhere.morning || elsewhere.afternoon || elsewhere.allDay);
  if (!anyToggleOn) return null;

  const jsDay = today.getDay();

  // Find affected supplements: homeOnly + supplement category + scheduled today
  // and falling in the period(s) blocked by the toggles, AND not yet handled by an override today.
  const affected = routine.filter(item => {
    if (item.recurrence) return false;
    if (item.category !== 'supplement') return false;
    if (!item.homeOnly) return false;
    if (!item.days.includes(jsDay)) return false;
    const startMin = toMinutes(item.start);
    if (elsewhere.allDay) return true;
    if (elsewhere.morning && startMin < 12 * 60) return true;
    if (elsewhere.afternoon && startMin >= 12 * 60) return true;
    return false;
  }).filter(item => {
    // Skip if user has already handled this with an override (moved or dismissed)
    const key = makeOverrideKey(item.id, today);
    const ov = overrides[key];
    if (!ov) return true;
    // If they've already edited the start time today, the suggestion is resolved.
    return false;
  });

  if (affected.length === 0) return null;

  // Suggest 3 candidate times based on which period is free.
  // If morning is blocked (or all-day), suggest afternoon/evening times.
  // If only afternoon is blocked, suggest morning times.
  const buildSuggestions = (item) => {
    const startMin = toMinutes(item.start);
    const inMorning = startMin < 12 * 60;
    // Default suggestion sets — three sensible chips
    let candidates;
    if (elsewhere.allDay) {
      // Push to evening regardless of original time
      candidates = ['18:00', '19:30', '21:00'];
    } else if (inMorning) {
      // Originally morning, push to afternoon/evening
      candidates = ['14:00', '17:00', '19:00'];
    } else {
      // Originally afternoon, push to morning
      candidates = ['08:00', '10:00', '11:30'];
    }
    // Drop any candidate that's STILL in a blocked period
    return candidates.filter(t => {
      const m = toMinutes(t);
      if (elsewhere.allDay) return false ? false : true; // keep all if all-day (you have to pick something)
      if (elsewhere.morning && m < 12 * 60) return false;
      if (elsewhere.afternoon && m >= 12 * 60) return false;
      return true;
    });
  };

  return (
    <>
      {affected.map(item => {
        const suggestions = buildSuggestions(item);
        return (
          <div key={item.id} className="suggest-banner">
            <span className="suggest-banner-icon">⚡</span>
            <div className="suggest-banner-text">
              <b>{item.title}</b> at {item.start} conflicts with being out today. Move to:
            </div>
            <div className="suggest-chips">
              {suggestions.map(t => (
                <button key={t} className="suggest-chip" onClick={() => onMove(item.id, t)}>
                  {t}
                </button>
              ))}
            </div>
            <button className="suggest-dismiss" onClick={() => onDismiss(item.id)} title="Dismiss this suggestion for today">×</button>
          </div>
        );
      })}
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// TODOS PANE — vertical pane with add/edit/remove + drag onto calendar
// ═════════════════════════════════════════════════════════════
function TodosPane({ todos, scheduledBlocks, onAdd, onUpdate, onDelete }) {
  const [value, setValue] = useState('');
  // Build a quick lookup: todoId -> is it currently scheduled (has a non-completed block)?
  const scheduledMap = {};
  (scheduledBlocks || []).forEach(b => {
    if (b.todoId && b.status !== 'completed') scheduledMap[b.todoId] = true;
  });

  const submit = () => {
    if (!value.trim()) return;
    onAdd(value);
    setValue('');
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  // Sort: open first (newest first), done at bottom
  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const openCount = todos.filter(t => !t.done).length;

  const onDragStart = (e, todo) => {
    if (todo.done) { e.preventDefault(); return; }
    const payload = { type: 'todo', todoId: todo.id, title: todo.title, duration: 30 };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  return (
    <div className="todos-pane">
      <div className="todos-pane-header">
        <div className="todos-pane-eyebrow">Todos</div>
        <div className="todos-pane-count">{openCount} open · {todos.length} total</div>
      </div>
      <div className="todos-add-bar">
        <input
          type="text"
          className="todos-add-input"
          placeholder="Add a one-time todo — Enter to save"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {sorted.length === 0 ? (
        <div className="todos-empty">No todos. Add one above, then drag it onto the calendar to schedule.</div>
      ) : (
        <div className="todos-list">
          {sorted.map(todo => {
            const isScheduled = !todo.done && scheduledMap[todo.id];
            const cls = `todo-item ${todo.done ? 'done' : ''} ${isScheduled ? 'scheduled' : ''}`;
            return (
              <div
                key={todo.id}
                className={cls}
                draggable={!todo.done}
                onDragStart={(e) => onDragStart(e, todo)}
                title={todo.done ? 'Done' : (isScheduled ? 'Scheduled · drag to reschedule' : 'Drag onto calendar to schedule')}
              >
                <input
                  type="checkbox"
                  className="todo-checkbox"
                  checked={!!todo.done}
                  onChange={() => onUpdate(todo.id, { done: !todo.done })}
                />
                <div className="todo-item-title">{todo.title}</div>
                {isScheduled && <div className="todo-item-badge">SCHED</div>}
                <button
                  className="todo-item-delete"
                  onClick={() => { if (confirm(`Delete "${todo.title}"?`)) onDelete(todo.id); }}
                  title="Delete"
                >×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// TODO DURATION PROMPT — small popover after dropping a todo on calendar
// ═════════════════════════════════════════════════════════════
function TodoDurationPrompt({ drop, todo, onConfirm, onCancel }) {
  const [duration, setDuration] = useState(30);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Backdrop dismiss + escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') {
        const dur = Number(duration);
        if (!isNaN(dur) && dur >= 5) onConfirm(dur);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [duration, onConfirm, onCancel]);

  // Position the prompt near the drop point, but keep it on screen
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const promptW = 280;
  const promptH = 200;
  const left = Math.min(Math.max(12, drop.dropX + 12), winW - promptW - 12);
  const top = Math.min(Math.max(12, drop.dropY + 12), winH - promptH - 12);

  const date = new Date(drop.date);
  const dayName = DAY_NAMES_LONG[(date.getDay() === 0 ? 6 : date.getDay() - 1)];

  const handleChip = (mins) => onConfirm(mins);
  const handleConfirm = () => {
    const dur = Number(duration);
    if (isNaN(dur) || dur < 5) return;
    onConfirm(dur);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 80, background: 'var(--modal-backdrop)',
        }}
        onClick={onCancel}
      />
      <div className="duration-prompt" style={{ left, top }} onClick={e => e.stopPropagation()}>
        <div className="duration-prompt-label">Schedule todo</div>
        <div className="duration-prompt-title">{todo ? todo.title : '(unknown todo)'}</div>
        <div className="duration-prompt-meta">{dayName} · starts at {drop.start}</div>
        <div className="duration-prompt-chips">
          {[15, 30, 45, 60, 90].map(m => (
            <button key={m} className="duration-prompt-chip" onClick={() => handleChip(m)}>
              {m < 60 ? `${m}m` : (m === 60 ? '1h' : '1h 30m')}
            </button>
          ))}
        </div>
        <div className="duration-prompt-input-row">
          <input
            ref={inputRef}
            type="number"
            className="duration-prompt-input"
            value={duration}
            min="5" max="600" step="5"
            onChange={e => setDuration(e.target.value)}
            placeholder="custom (min)"
          />
          <button className="modal-btn primary" onClick={handleConfirm}>
            <span>OK</span>
          </button>
          <button className="modal-btn" onClick={onCancel}>
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// SETTINGS MODAL — calendar feeds + proxy URL
// ═════════════════════════════════════════════════════════════
// Curated muted palette for calendar colors — matches the dark/serif aesthetic
const CALENDAR_COLORS = [
  '#8C8C96', // slate
  '#7896AF', // soft blue
  '#7EB8A4', // muted teal
  '#A78BCA', // muted violet
  '#C9A84C', // gold
  '#E07B6A', // coral
  '#9C7B5C', // warm tan
  '#5A8FA3', // cool steel
];

function ColorSwatchPicker({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--muted-3)', textTransform: 'uppercase', fontFamily: 'var(--mono)', minWidth: 60 }}>
        {label}
      </div>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 40,
          height: 28,
          border: '1px solid var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          padding: 2,
        }}
      />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted-3)', letterSpacing: '0.05em' }}>
        {value}
      </span>
    </div>
  );
}

function SettingsModal({ calendars, icsCache, icsRefreshing, onUpdate, onRefresh, weather, onUpdateWeather, onRequestGeo, lunchSlot, onSetLunchSlot, onClose,
  routine, onUpdateRoutineItem, onAddRoutineItem, onDeleteRoutineItem, categoryStyles, onSetCategoryColor, onResetCategoryColor, userCategoryColors, onSetCategoryEmoji, onResetCategoryEmoji, userCategoryEmojis,
  todoist, onUpdateTodoist,
  nowLineColor, onSetNowLineColor,
  miniMonthTodayColor, onSetMiniMonthTodayColor,
  nowEventColor, onSetNowEventColor
}) {
  const [activeTab, setActiveTab] = useState('calendars');
  const [lunchStart, setLunchStart] = useState((lunchSlot && lunchSlot.start) || '12:30');
  const [lunchDuration, setLunchDuration] = useState((lunchSlot && lunchSlot.duration) || 60);
  const [proxyUrl, setProxyUrl] = useState(calendars.proxyUrl || '');
  const [workIcs, setWorkIcs] = useState(calendars.workIcs || '');
  const [householdIcs, setHouseholdIcs] = useState(calendars.householdIcs || '');
  const [workColor, setWorkColor] = useState(calendars.workColor || '#8C8C96');
  const [householdColor, setHouseholdColor] = useState(calendars.householdColor || '#7896AF');
  const [latInput, setLatInput] = useState(weather && weather.lat != null ? String(weather.lat) : '');
  const [lonInput, setLonInput] = useState(weather && weather.lon != null ? String(weather.lon) : '');
  const [labelInput, setLabelInput] = useState(weather && weather.label ? weather.label : '');
  const [todoistToken, setTodoistToken] = useState((todoist && todoist.token) || '');
  const [showToken, setShowToken] = useState(false);
  const [todoistProjectId, setTodoistProjectId] = useState((todoist && todoist.projectId) || '');
  const [todoistProjectName, setTodoistProjectName] = useState((todoist && todoist.projectName) || '');
  const [todoistDaysAhead, setTodoistDaysAhead] = useState((todoist && todoist.daysAhead != null) ? String(todoist.daysAhead) : '7');
  const [todoistProjects, setTodoistProjects] = useState([]);
  const [todoistProjectsLoading, setTodoistProjectsLoading] = useState(false);
  const [todoistProjectsError, setTodoistProjectsError] = useState(null);

  const fetchTodoistProjects = async () => {
    const token = todoistToken.trim();
    const base = proxyUrl.trim().replace(/\/+$/, '');
    if (!token || !base) { setTodoistProjectsError('Proxy URL and token are required.'); return; }
    setTodoistProjectsLoading(true);
    setTodoistProjectsError(null);
    try {
      const res = await fetch(`${base}/todoist/projects`, { headers: { 'X-Todoist-Token': token } });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      const parsed = JSON.parse(body);
      // API v1 returns {results:[...]} (paginated); REST v2 returned a plain array
      const list = Array.isArray(parsed) ? parsed : (parsed.results || parsed.projects || parsed.items || []);
      if (list.length === 0) throw new Error('No projects returned. Raw: ' + body.slice(0, 120));
      setTodoistProjects(list);
    } catch (err) {
      setTodoistProjectsError(err.message);
    } finally {
      setTodoistProjectsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = () => {
    onUpdate({
      proxyUrl: proxyUrl.trim(),
      workIcs: workIcs.trim(),
      householdIcs: householdIcs.trim(),
      workColor,
      householdColor,
    });
    // Don't close — let user trigger refresh first
  };

  const handleSaveAndRefresh = async () => {
    onUpdate({
      proxyUrl: proxyUrl.trim(),
      workIcs: workIcs.trim(),
      householdIcs: householdIcs.trim(),
      workColor,
      householdColor,
    });
    // Note: useEffect on cfgKey will trigger refresh automatically
    onClose();
  };

  const renderStatus = (key) => {
    const cache = icsCache[key];
    if (icsRefreshing) return <span className="sm-status loading"><span className="sm-status-dot" /></span>;
    if (!cache) return null;
    if (cache.error) {
      const msg = cache.error.includes('429') ? 'Google rate limit hit — will retry next refresh (redeploy Worker to fix caching)' : cache.error;
      return <span className="sm-status error"><span className="sm-status-dot" /><span>{msg}</span></span>;
    }
    const ts = cache.lastFetched ? cache.lastFetched.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
    return <span className="sm-status ok"><span className="sm-status-dot" /><span>{cache.events.length} events · {ts}</span></span>;
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal settings-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="sm-header">
          <div className="sm-header-eyebrow">App configuration</div>
          <div className="sm-title">Settings</div>
        </div>

        <div className="sm-tabs">
          <button className={`sm-tab ${activeTab === 'calendars' ? 'active' : ''}`} onClick={() => setActiveTab('calendars')}>Calendars & Settings</button>
          <button className={`sm-tab ${activeTab === 'routines' ? 'active' : ''}`} onClick={() => setActiveTab('routines')}>Routines</button>
        </div>

        {activeTab === 'routines' ? (
          <div className="sm-body">
            <RoutineManagerModal
              embedded={true}
              routine={routine || []}
              onClose={() => setActiveTab('calendars')}
              onUpdateItem={onUpdateRoutineItem}
              onAddItem={onAddRoutineItem}
              onDeleteItem={onDeleteRoutineItem}
              categoryStyles={categoryStyles}
              onSetCategoryColor={onSetCategoryColor}
              onResetCategoryColor={onResetCategoryColor}
              userCategoryColors={userCategoryColors}
              onSetCategoryEmoji={onSetCategoryEmoji}
              onResetCategoryEmoji={onResetCategoryEmoji}
              userCategoryEmojis={userCategoryEmojis}
            />
          </div>
        ) : (
          <div className="sm-body">

            {/* ── PROXY ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Cloudflare Proxy</div>
              <div className="sm-card">
                <div className="sm-field">
                  <div className="sm-field-label">Worker URL</div>
                  <input type="text" className="sm-input" value={proxyUrl}
                    placeholder="https://your-worker.your-subdomain.workers.dev"
                    onChange={e => setProxyUrl(e.target.value)} />
                  <div className="sm-hint">Relays ICS feeds and Todoist requests — required for calendar imports.</div>
                </div>
              </div>
            </div>

            {/* ── APPEARANCE ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Appearance</div>
              <div className="sm-card">
                <div className="sm-field sm-nowline-row">
                  <span className="sm-field-label">Now line color</span>
                  <div className="sm-nowline-controls">
                    <input
                      type="color"
                      className="sm-color-swatch"
                      value={nowLineColor || '#2563EB'}
                      onChange={e => onSetNowLineColor && onSetNowLineColor(e.target.value)}
                    />
                    {nowLineColor && (
                      <button className="sm-reset-btn" onClick={() => onSetNowLineColor && onSetNowLineColor('')} title="Reset to default">↺</button>
                    )}
                  </div>
                </div>
                <div className="sm-divider" />
                <div className="sm-field sm-nowline-row">
                  <span className="sm-field-label">Today highlight</span>
                  <div className="sm-nowline-controls">
                    <input
                      type="color"
                      className="sm-color-swatch"
                      value={miniMonthTodayColor || '#2563EB'}
                      onChange={e => onSetMiniMonthTodayColor && onSetMiniMonthTodayColor(e.target.value)}
                    />
                    {miniMonthTodayColor && (
                      <button className="sm-reset-btn" onClick={() => onSetMiniMonthTodayColor && onSetMiniMonthTodayColor('')} title="Reset to default">↺</button>
                    )}
                  </div>
                </div>
                <div className="sm-divider" />
                <div className="sm-field sm-nowline-row">
                  <span className="sm-field-label">Current event ring</span>
                  <div className="sm-nowline-controls">
                    <input
                      type="color"
                      className="sm-color-swatch"
                      value={nowEventColor || '#2563EB'}
                      onChange={e => onSetNowEventColor && onSetNowEventColor(e.target.value)}
                    />
                    {nowEventColor && (
                      <button className="sm-reset-btn" onClick={() => onSetNowEventColor && onSetNowEventColor('')} title="Reset to default">↺</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── CALENDARS ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Calendars</div>
              <div className="sm-card">
                <div className="sm-cal-item">
                  <div className="sm-cal-header">
                    <ColorPickerExtended value={workColor} defaultHex="#8C8C96" onChange={val => { setWorkColor(val); onUpdate({ workColor: val }); }} />
                    <span className="sm-cal-name">Work</span>
                    {renderStatus('work')}
                  </div>
                  <input type="text" className="sm-input" value={workIcs}
                    placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                    onChange={e => setWorkIcs(e.target.value)} />
                  <div className="sm-hint" style={{ marginTop: 6 }}>Google Calendar → Settings → Integrate calendar → Secret iCal address. Company-managed calendars may disallow ICS export.</div>
                </div>
                <div className="sm-divider" />
                <div className="sm-cal-item">
                  <div className="sm-cal-header">
                    <ColorPickerExtended value={householdColor} defaultHex="#7896AF" onChange={val => { setHouseholdColor(val); onUpdate({ householdColor: val }); }} />
                    <span className="sm-cal-name">Household</span>
                    {renderStatus('household')}
                  </div>
                  <input type="text" className="sm-input" value={householdIcs}
                    placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                    onChange={e => setHouseholdIcs(e.target.value)} />
                  <div className="sm-hint" style={{ marginTop: 6 }}>Settings → Integrate calendar → Secret iCal address.</div>
                </div>
                <div className="sm-divider" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sm-btn primary" onClick={handleSaveAndRefresh}>Save & fetch</button>
                  <button className="sm-btn" onClick={handleSave}>Save</button>
                </div>
              </div>
            </div>

            {/* ── WEATHER ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Weather Location</div>
              <div className="sm-card">
                <div className="sm-hint" style={{ marginBottom: 12 }}>
                  {weather && weather.source === 'geolocation' ? 'Currently from browser geolocation.' : weather && weather.source === 'manual' ? 'Currently set manually.' : weather && weather.source === 'declined' ? 'Geolocation declined — set manually below.' : 'Not yet configured.'}
                </div>
                <button className="sm-btn" style={{ marginBottom: 14 }} onClick={onRequestGeo}>↻ Use my browser location</button>
                <div className="sm-row half" style={{ marginBottom: 12 }}>
                  <div className="sm-field">
                    <div className="sm-field-label">Latitude</div>
                    <input type="text" className="sm-input" value={latInput} placeholder="47.99" onChange={e => setLatInput(e.target.value)} />
                  </div>
                  <div className="sm-field">
                    <div className="sm-field-label">Longitude</div>
                    <input type="text" className="sm-input" value={lonInput} placeholder="-4.49" onChange={e => setLonInput(e.target.value)} />
                  </div>
                </div>
                <div className="sm-field" style={{ marginBottom: 14 }}>
                  <div className="sm-field-label">Label (optional)</div>
                  <input type="text" className="sm-input" value={labelInput} placeholder="e.g. Plouhinec" onChange={e => setLabelInput(e.target.value)} />
                </div>
                <button className="sm-btn primary" onClick={() => {
                  const lat = parseFloat(latInput), lon = parseFloat(lonInput);
                  if (isNaN(lat) || isNaN(lon)) { alert('Latitude and longitude must be numbers.'); return; }
                  if (lat < -90 || lat > 90) { alert('Latitude must be between -90 and 90.'); return; }
                  if (lon < -180 || lon > 180) { alert('Longitude must be between -180 and 180.'); return; }
                  onUpdateWeather(lat, lon, labelInput.trim());
                }}>Save location</button>
              </div>
            </div>

            {/* ── LUNCH SLOT ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Lunch Slot</div>
              <div className="sm-card">
                <div className="sm-hint" style={{ marginBottom: 12 }}>Shown as a tinted band in the Today calendar view.</div>
                <div className="sm-row half" style={{ marginBottom: 14 }}>
                  <div className="sm-field">
                    <div className="sm-field-label">Start time</div>
                    <input type="text" className="sm-input" value={lunchStart} placeholder="12:30"
                      onChange={e => setLunchStart(e.target.value)} style={{ fontFamily: 'var(--mono)' }} />
                  </div>
                  <div className="sm-field">
                    <div className="sm-field-label">Duration (min)</div>
                    <input type="number" className="sm-input" value={lunchDuration} min="15" max="240" step="5"
                      onChange={e => setLunchDuration(e.target.value)} style={{ fontFamily: 'var(--mono)' }} />
                  </div>
                </div>
                <button className="sm-btn primary" onClick={() => {
                  if (!/^\d{1,2}:\d{2}$/.test(lunchStart)) { alert('Start must be HH:MM.'); return; }
                  const d = Number(lunchDuration);
                  if (isNaN(d) || d < 15) { alert('Duration must be at least 15 minutes.'); return; }
                  onSetLunchSlot({ start: lunchStart, duration: d });
                }}>Save lunch slot</button>
              </div>
            </div>

            {/* ── TODOIST ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Todoist</div>
              <div className="sm-card">
                <div className="sm-hint" style={{ marginBottom: 14 }}>Connect Todoist to surface tasks in the left rail. Get your API token from Todoist → Settings → Integrations → Developer.</div>
                <div className="sm-field" style={{ marginBottom: 12 }}>
                  <div className="sm-field-label">API Token</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type={showToken ? 'text' : 'password'} className="sm-input" style={{ flex: 1 }}
                      value={todoistToken} placeholder="Paste your Todoist API token…"
                      onChange={e => setTodoistToken(e.target.value)} autoComplete="off" />
                    <button className="sm-btn" style={{ flexShrink: 0 }} onClick={() => setShowToken(v => !v)}>{showToken ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
                <div className="sm-field" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div className="sm-field-label" style={{ margin: 0 }}>Project</div>
                    <button className="sm-btn" style={{ padding: '4px 12px', fontSize: 12 }}
                      disabled={!todoistToken.trim() || todoistProjectsLoading} onClick={fetchTodoistProjects}>
                      {todoistProjectsLoading ? 'Fetching…' : 'Fetch projects'}
                    </button>
                  </div>
                  {todoistProjects.length > 0 ? (
                    <select className="sm-input" value={todoistProjectId}
                      onChange={e => { const p = todoistProjects.find(p => p.id === e.target.value); setTodoistProjectId(e.target.value); setTodoistProjectName(p ? p.name : ''); }}>
                      <option value="">— pick a project —</option>
                      {todoistProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" className="sm-input" style={{ fontFamily: 'var(--mono)' }}
                      value={todoistProjectId} placeholder="Click 'Fetch projects' to pick one"
                      onChange={e => setTodoistProjectId(e.target.value)} />
                  )}
                  {todoistProjectsError && <div className="sm-hint" style={{ color: 'var(--coral)', marginTop: 5 }}>{todoistProjectsError}</div>}
                </div>
                <div className="sm-field" style={{ marginBottom: 16 }}>
                  <div className="sm-field-label">Days ahead (0 = show all)</div>
                  <input type="number" className="sm-input" style={{ fontFamily: 'var(--mono)', width: 100 }}
                    value={todoistDaysAhead} min="0" max="365" onChange={e => setTodoistDaysAhead(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sm-btn primary"
                    disabled={!todoistToken.trim() || !todoistProjectId.trim()}
                    onClick={() => {
                      const days = parseInt(todoistDaysAhead, 10);
                      onUpdateTodoist({ token: todoistToken.trim(), projectId: todoistProjectId.trim(), projectName: todoistProjectName.trim(), daysAhead: isNaN(days) ? 7 : days });
                      onClose();
                    }}>Save Todoist settings</button>
                  {todoist && todoist.token && (
                    <button className="sm-btn danger" onClick={() => {
                      if (confirm('Disconnect Todoist?')) {
                        onUpdateTodoist({ token: '', projectId: '', daysAhead: 7 });
                        setTodoistToken(''); setTodoistProjectId('');
                      }
                    }}>Disconnect</button>
                  )}
                </div>
              </div>
            </div>

            {/* ── SETUP GUIDE ── */}
            <div className="sm-section">
              <div className="sm-eyebrow">Cloudflare Setup Guide</div>
              <div className="sm-card sm-card-subtle">
                <ol className="sm-guide-list">
                  <li>Sign up free at <code>workers.cloudflare.com</code></li>
                  <li>Create a Worker, paste the proxy code (provided alongside this app), deploy</li>
                  <li>Copy the Worker URL (e.g. <code>https://my-planning-proxy.&lt;you&gt;.workers.dev</code>)</li>
                  <li>Paste it into the Worker URL field above</li>
                </ol>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// WEEKLY REVIEW LAUNCHER — same look every day, marks completion
// ═════════════════════════════════════════════════════════════
function FridayReviewLauncher({ now, weeklyResets, onLaunch }) {
  // Has the current week already been reset?
  const thisWeekStart = startOfWeek(now);
  const alreadyDone = (weeklyResets || []).some(r => {
    if (!r.weekStart) return false;
    return startOfDay(new Date(r.weekStart)).getTime() === thisWeekStart.getTime();
  });

  const label = alreadyDone ? '✓ Reviewed this week' : 'Weekly Review';
  const style = alreadyDone
    ? { color: 'var(--teal)', borderColor: 'var(--teal)' }
    : {};

  return (
    <button
      className="btn-tertiary"
      onClick={onLaunch}
      style={{ ...style, padding: '8px 14px', border: '1px solid var(--border)', letterSpacing: '0.15em' }}
    >{label}</button>
  );
}

// ═════════════════════════════════════════════════════════════
// WEEKLY RESET OVERLAY — full-screen guided reflection
// ═════════════════════════════════════════════════════════════
function WeeklyResetOverlay({ weekStart, now, onClose, onSave }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(WEEKLY_RESET_PHASES[0].duration);
  const [running, setRunning] = useState(false);
  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState(false);
  const timerRef = useRef(null);

  const currentPhase = WEEKLY_RESET_PHASES[phaseIdx];
  const elapsedInPhase = currentPhase.duration - secondsLeft;
  const phaseProgress = elapsedInPhase / currentPhase.duration;
  const totalElapsed = WEEKLY_RESET_PHASES.slice(0, phaseIdx).reduce((a, p) => a + p.duration, 0) + elapsedInPhase;
  const totalProgress = totalElapsed / WEEKLY_RESET_TOTAL_SECONDS;

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            if (phaseIdx < WEEKLY_RESET_PHASES.length - 1) {
              const next = phaseIdx + 1;
              setPhaseIdx(next);
              setSecondsLeft(WEEKLY_RESET_PHASES[next].duration);
              setRunning(false);
            } else {
              setRunning(false);
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running, phaseIdx]);

  const goPhase = (i) => {
    setPhaseIdx(i);
    setSecondsLeft(WEEKLY_RESET_PHASES[i].duration);
    setRunning(false);
  };
  const update = (key, val) => setAnswers(a => ({ ...a, [key]: val }));
  const handleSave = () => {
    onSave(answers);
    setSaved(true);
  };

  const fmtTime = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const weekLabel = `Week of ${formatDateShort(weekStart)}, ${weekStart.getFullYear()}`;

  return (
    <div className="reset-overlay">
      <div className="reset-wrap">
        <div className="reset-header">
          <div>
            <div className="reset-eyebrow">CEO Weekly Reset</div>
            <div style={{ fontSize: 22, marginTop: 4, letterSpacing: '-0.01em' }}>{weekLabel}</div>
          </div>
          <button className="reset-exit" onClick={onClose}>✕ Exit</button>
        </div>

        <div className="reset-progress-total">
          <div className="reset-progress-total-fill" style={{ width: `${totalProgress * 100}%` }} />
        </div>

        <div className="reset-phase-tabs">
          {WEEKLY_RESET_PHASES.map((p, i) => (
            <button
              key={p.id}
              className={`reset-phase-tab ${i === phaseIdx ? 'active' : ''}`}
              onClick={() => goPhase(i)}
              style={i === phaseIdx ? { background: p.color, borderColor: p.color } : {}}
            >{p.label}</button>
          ))}
        </div>

        <div className="reset-phase-bar">
          <div>
            <div className="reset-phase-label" style={{ color: currentPhase.color }}>{currentPhase.label}</div>
            <div className="reset-phase-meta">{phaseIdx + 1} of {WEEKLY_RESET_PHASES.length} · {currentPhase.prompts.length} prompts</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={`reset-timer ${secondsLeft < 30 ? 'warning' : ''}`} style={{ color: secondsLeft < 30 ? 'var(--coral)' : currentPhase.color }}>
              {fmtTime(secondsLeft)}
            </div>
            <div className="reset-timer-controls">
              <button
                className="reset-timer-btn"
                onClick={() => setRunning(r => !r)}
                style={{
                  borderColor: running ? 'var(--coral)' : currentPhase.color,
                  color: running ? 'var(--coral)' : currentPhase.color,
                  background: running ? 'rgba(224,123,106,0.1)' : 'rgba(201,168,76,0.1)',
                }}
              >{running ? '⏸ Pause' : '▶ Start'}</button>
              {phaseIdx < WEEKLY_RESET_PHASES.length - 1 && (
                <button
                  className="reset-timer-btn"
                  onClick={() => goPhase(phaseIdx + 1)}
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-3)' }}
                >Next →</button>
              )}
            </div>
          </div>
        </div>

        <div className="reset-phase-progress">
          <div className="reset-phase-progress-fill" style={{ width: `${phaseProgress * 100}%`, background: currentPhase.color }} />
        </div>

        <div className="reset-prompts">
          {currentPhase.prompts.map((p, i) => (
            <ResetPrompt
              key={p.key}
              prompt={p}
              index={i}
              value={answers[p.key]}
              scorecardValue={answers.scorecard}
              storyValue={answers.story}
              phaseColor={currentPhase.color}
              onUpdate={(val) => update(p.key, val)}
            />
          ))}
        </div>

        <div className="reset-nav">
          <button
            className="btn-secondary"
            onClick={() => phaseIdx > 0 && goPhase(phaseIdx - 1)}
            disabled={phaseIdx === 0}
            style={{ opacity: phaseIdx === 0 ? 0.3 : 1 }}
          >← Previous</button>
          {phaseIdx < WEEKLY_RESET_PHASES.length - 1 ? (
            <button className="btn-primary" onClick={() => goPhase(phaseIdx + 1)}>Next Phase →</button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSave}
              style={{ background: saved ? 'var(--teal)' : 'var(--primary)' }}
              disabled={saved}
            >{saved ? '✓ Saved' : 'Save & Sync'}</button>
          )}
        </div>

        {saved && (
          <div className="reset-saved-card">
            <div className="reset-saved-eyebrow">Session Saved</div>
            <div className="reset-saved-text">
              Close your eyes. Take three slow breaths.<br />
              Name one thing you are grateful for.<br />
              State your experiment for next week aloud.<br />
              You are done. Go rest.
            </div>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResetPrompt({ prompt, index, value, scorecardValue, storyValue, phaseColor, onUpdate }) {
  return (
    <div>
      <label className="reset-prompt-label">
        <span className="reset-prompt-num" style={{ color: phaseColor }}>{String(index + 1).padStart(2, '0')}</span>
        {prompt.q}
      </label>
      {prompt.type === 'scale' && (
        <div className="reset-scale">
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button
              key={n}
              className={`reset-scale-btn ${value === n ? 'active' : ''}`}
              onClick={() => onUpdate(n)}
              style={value === n ? { borderColor: phaseColor, color: phaseColor, background: hexToRgba(phaseColor, 0.13) } : {}}
            >{n}</button>
          ))}
        </div>
      )}
      {prompt.type === 'short' && (
        <input
          type="text"
          className="reset-input"
          placeholder="Type here…"
          value={value || ''}
          onChange={e => onUpdate(e.target.value)}
        />
      )}
      {prompt.type === 'long' && (
        <textarea
          className="reset-input reset-textarea"
          placeholder="Write without filtering. Honesty is the only standard here."
          value={value || ''}
          onChange={e => onUpdate(e.target.value)}
        />
      )}
      {prompt.type === 'scorecard' && (
        <div>
          {[
            { key: 'sc_strategic', label: 'Strategic work' },
            { key: 'sc_execution', label: 'Execution quality' },
            { key: 'sc_learning', label: 'Learning & growth' },
            { key: 'sc_leadership', label: 'Leadership presence' },
          ].map(row => {
            const sc = scorecardValue || {};
            return (
              <div key={row.key} className="reset-scorecard-row">
                <div className="reset-scorecard-label">{row.label}</div>
                <div className="reset-scorecard-buttons">
                  {[1,2,3,4,5].map(n => (
                    <button
                      key={n}
                      className="reset-scorecard-btn"
                      onClick={() => onUpdate({ ...sc, [row.key]: n })}
                      style={sc[row.key] === n ? {
                        borderColor: phaseColor,
                        color: phaseColor,
                        background: hexToRgba(phaseColor, 0.2),
                      } : {}}
                    >{n}</button>
                  ))}
                </div>
                {sc[row.key] && (
                  <div className="reset-scorecard-rating">
                    {['', 'Critical gap', 'Below standard', 'On track', 'Strong', 'Exceptional'][sc[row.key]]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {prompt.type === 'story' && (
        <div>
          {[
            { key: 'story_situation', label: 'Situation', placeholder: 'What was the context or challenge?' },
            { key: 'story_action', label: 'Action', placeholder: 'What did you specifically do or decide?' },
            { key: 'story_value', label: 'Value demonstrated', placeholder: 'e.g. ownership, courage, clarity, strategic thinking, integrity' },
          ].map(row => {
            const st = storyValue || {};
            return (
              <div key={row.key} className="reset-story-block">
                <div className="reset-story-label">{row.label}</div>
                <textarea
                  className="reset-story-input"
                  placeholder={row.placeholder}
                  value={st[row.key] || ''}
                  onChange={e => onUpdate({ ...st, [row.key]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

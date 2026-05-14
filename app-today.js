// ═════════════════════════════════════════════════════════════
// CALENDAR SCREEN
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
// TODAY CALENDAR VIEW — single-column hour grid for today
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
// TODAY MINI-MONTH — small month picker (Google-Cal style)
// ═════════════════════════════════════════════════════════════
function TodayMiniMonth({ viewDate, now, onSelectDate }) {
  const [shownMonth, setShownMonth] = useState(() => {
    const d = new Date(viewDate);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Re-anchor when the viewDate jumps to a different month externally
  useEffect(() => {
    const vm = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getTime();
    const sm = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1).getTime();
    if (vm !== sm) {
      const d = new Date(viewDate);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      setShownMonth(d);
    }
  }, [viewDate]);

  const monthLabel = shownMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();

  // Build the 6×7 grid: start from the Monday on or before day 1.
  const firstOfMonth = new Date(year, month, 1);
  const jsDay = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = (jsDay + 6) % 7;
  const gridStart = new Date(year, month, 1 - offsetToMonday);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const goPrev = () => setShownMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setShownMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="mini-month">
      <div className="mini-month-header">
        <div className="mini-month-label">{monthLabel}</div>
        <div className="mini-month-nav">
          <button className="mini-month-nav-btn" onClick={goPrev} aria-label="Previous month">‹</button>
          <button className="mini-month-nav-btn" onClick={goNext} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="mini-month-weekdays">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((wd, i) => (
          <div key={i} className="mini-month-weekday">{wd}</div>
        ))}
      </div>
      <div className="mini-month-grid">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isNow = isSameDay(d, now);
          const isSelected = isSameDay(d, viewDate);
          const cls = `mini-month-day ${inMonth ? '' : 'out'} ${isNow ? 'today' : ''} ${isSelected && !isNow ? 'selected' : ''}`;
          return (
            <button key={i} className={cls} onClick={() => onSelectDate(d)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// TODAY CALENDAR VIEW — single-column hour grid for today
// ═════════════════════════════════════════════════════════════
function TodayCalendarView({ items, now, viewDate, isToday, lunchSlot, onItemClick, onToggleRoutineComplete, CATS, onDrop, onCreateAtTime }) {
  const HOUR_START = 6;
  const HOUR_END = 23;
  const HOUR_HEIGHT = 64;
  const totalHours = HOUR_END - HOUR_START;
  // Visual minimum: 20px min block height ≈ 20 min at 64px/hr. Use same floor as weekly view.
  const VISUAL_MIN_MIN = Math.ceil(22 / HOUR_HEIGHT * 60); // ~21 min
  const gridRef = useRef(null);
  // Inline composer for click-to-create: { startMin, top, x } | null
  const [composer, setComposer] = useState(null);
  const [composerTitle, setComposerTitle] = useState('');
  const composerInputRef = useRef(null);

  useEffect(() => {
    if (composer && composerInputRef.current) composerInputRef.current.focus();
  }, [composer]);
  useEffect(() => {
    if (!composer) return;
    const onKey = (e) => { if (e.key === 'Escape') setComposer(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [composer]);

  const submitComposer = () => {
    if (composerTitle.trim() && composer) {
      onCreateAtTime(composer.startMin, composerTitle.trim());
    }
    setComposer(null);
    setComposerTitle('');
  };

  const minToY = (m) => ((m / 60) - HOUR_START) * HOUR_HEIGHT;
  // Convert a clientY position over the grid to a snapped time-string (15-min snap).
  const yToMin = (clientY) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const totalMin = Math.round((y / HOUR_HEIGHT) * 60);
    const snapped = Math.round(totalMin / 15) * 15;
    return Math.max(0, snapped) + HOUR_START * 60;
  };
  const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  // Drag-over preview (ghost block)
  const [dragGhost, setDragGhost] = useState(null); // { startMin, duration }
  const onGridDragOver = (e) => {
    if (!Array.from(e.dataTransfer.types).includes('application/json')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const startMin = yToMin(e.clientY);
    if (startMin == null) return;
    setDragGhost({ startMin, duration: 30 });
  };
  const onGridDragLeave = (e) => {
    // Only clear if leaving the grid root
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      setDragGhost(null);
    }
  };
  const onGridDrop = (e) => {
    e.preventDefault();
    const startMin = yToMin(e.clientY);
    setDragGhost(null);
    if (startMin == null) return;
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); }
    catch { return; }
    if (onDrop) onDrop(payload, startMin, e.clientX, e.clientY);
  };

  // Click-to-create on empty grid space (only fires if click is on the grid itself,
  // not on an existing block — blocks have their own onClick which stops propagation).
  const onGridClick = (e) => {
    if (e.target !== gridRef.current && !e.target.classList.contains('today-cal-empty-zone')) return;
    const startMin = yToMin(e.clientY);
    if (startMin == null) return;
    const top = minToY(startMin);
    setComposer({ startMin, top });
    setComposerTitle('');
  };

  const lunchStartMin = toMinutes(lunchSlot.start || '12:30');
  const lunchTop = minToY(lunchStartMin);
  const lunchHeight = (lunchSlot.duration || 60) / 60 * HOUR_HEIGHT;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowY = minToY(nowMin);
  const inWindow = isToday && nowMin >= HOUR_START * 60 && nowMin < HOUR_END * 60;

  // Google-style packing algorithm:
  // 1. Cluster events that transitively overlap.
  // 2. Within a cluster, assign each event to the leftmost column where it doesn't conflict.
  // 3. Width = column count to the right that the event can extend through without conflict.
  const sorted = [...items].sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return (b.duration - (b.startMin)) - (a.duration - (a.startMin)); // longer first when ties
  });

  // Build clusters using visual end (accounts for 20px minimum block height)
  const visualEnd = (it) => it.startMin + Math.max(it.duration, VISUAL_MIN_MIN);
  const clusters = [];
  sorted.forEach(it => {
    const end = visualEnd(it);
    const c = clusters.find(c => c.maxEnd > it.startMin);
    if (c) {
      c.events.push(it);
      c.maxEnd = Math.max(c.maxEnd, end);
    } else {
      clusters.push({ events: [it], maxEnd: end });
    }
  });

  const positioned = [];
  clusters.forEach(cluster => {
    const evs = cluster.events;
    // Assign each event to a column (lane) using leftmost-fit
    const columns = []; // each column: array of {startMin, end}
    const eventColumn = new Map();
    evs.forEach(it => {
      const end = visualEnd(it);
      let col = 0;
      while (true) {
        const occupants = columns[col] || [];
        const conflict = occupants.some(o => !(o.end <= it.startMin || o.startMin >= end));
        if (!conflict) {
          columns[col] = [...occupants, { startMin: it.startMin, end, id: it.id }];
          eventColumn.set(it.id, col);
          break;
        }
        col++;
      }
    });
    const totalCols = columns.length;
    // For each event, find max colspan (how far right it can extend without conflict)
    evs.forEach(it => {
      const myCol = eventColumn.get(it.id);
      const end = visualEnd(it);
      let span = 1;
      for (let c = myCol + 1; c < totalCols; c++) {
        const conflict = (columns[c] || []).some(o => !(o.end <= it.startMin || o.startMin >= end));
        if (conflict) break;
        span++;
      }
      positioned.push({
        ...it,
        _col: myCol,
        _colspan: span,
        _totalCols: totalCols,
      });
    });
  });

  return (
    <div
      ref={gridRef}
      className="today-cal-grid"
      style={{ height: totalHours * HOUR_HEIGHT }}
      onDragOver={onGridDragOver}
      onDragLeave={onGridDragLeave}
      onDrop={onGridDrop}
      onClick={onGridClick}
    >
      {/* Hour lines + labels */}
      {Array.from({ length: totalHours + 1 }, (_, i) => {
        const hour = HOUR_START + i;
        return (
          <div key={hour} className="today-cal-hour-line" style={{ top: i * HOUR_HEIGHT }}>
            <span className="today-cal-hour-label">
              {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
            </span>
          </div>
        );
      })}
      {/* Lunch slot tint */}
      {lunchHeight > 0 && (
        <div
          className="today-cal-lunch"
          style={{ top: lunchTop, height: lunchHeight }}
          title={`Lunch · ${lunchSlot.start} for ${lunchSlot.duration} min`}
        >
          <span className="today-cal-lunch-label">Lunch</span>
        </div>
      )}
      {/* Drag ghost preview */}
      {dragGhost && (
        <div
          className="today-cal-drag-ghost"
          style={{
            top: minToY(dragGhost.startMin),
            height: dragGhost.duration / 60 * HOUR_HEIGHT,
          }}
        >
          <span className="today-cal-drag-ghost-time">{minToHHMM(dragGhost.startMin)}</span>
        </div>
      )}
      {/* Now line */}
      {inWindow && (
        <div className="today-cal-now-line" style={{ top: nowY }}>
          <span className="today-cal-now-dot" />
        </div>
      )}
      {/* Inline composer */}
      {composer && (
        <div
          className="today-cal-composer"
          style={{ top: composer.top, height: HOUR_HEIGHT / 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="today-cal-composer-time">{minToHHMM(composer.startMin)}</span>
          <input
            ref={composerInputRef}
            type="text"
            className="today-cal-composer-input"
            placeholder="Add event…"
            value={composerTitle}
            onChange={(e) => setComposerTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitComposer(); }
            }}
            onBlur={() => {
              if (!composerTitle.trim()) setComposer(null);
            }}
          />
        </div>
      )}
      {/* Items */}
      {positioned.map(it => {
        const top = minToY(it.startMin);
        const height = Math.max(20, it.duration / 60 * HOUR_HEIGHT - 2);
        const totalCols = it._totalCols;
        const colWidth = (100 - 8) / totalCols; // wider right gutter so blocks don't kiss the edge
        const leftPct = it._col * colWidth;
        const widthPct = colWidth * it._colspan;
        const stripeColor = it.kind === 'routine'
          ? ((CATS[it.category] || CATS.supplement).color)
          : (it.color || 'var(--primary)');
        const isHex = stripeColor.startsWith('#');
        const isNow = isToday && it.startMin <= nowMin && (it.startMin + it.duration) > nowMin;
        const cls = `today-cal-block ${it.completed ? 'is-completed' : ''} ${isNow && !it.completed ? 'is-now' : ''} ${it.kind === 'ics' ? 'is-ics' : ''}`;
        const isShort = height < 36;
        // 12-hour time format with am/pm: "2 – 3pm" style
        const fmt12 = (m) => {
          const h = Math.floor(m / 60);
          const min = m % 60;
          const period = h >= 12 ? 'pm' : 'am';
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return min === 0 ? `${h12}` : `${h12}:${pad(min)}`;
        };
        const startStr = fmt12(it.startMin);
        const endStr = fmt12(it.startMin + it.duration);
        const period = (it.startMin + it.duration) % (24 * 60) >= 12 * 60 ? 'pm' : 'am';
        const startPeriod = it.startMin >= 12 * 60 ? 'pm' : 'am';
        // Show period only on the end if both are same period (e.g. "2 – 3pm");
        // otherwise show on both ("11am – 1pm")
        const timeLabel = startPeriod === period
          ? `${startStr} – ${endStr}${period}`
          : `${startStr}${startPeriod} – ${endStr}${period}`;
        return (
          <div
            key={it.id}
            className={`${cls} ${isShort ? 'is-short' : ''}`}
            onClick={(e) => { e.stopPropagation(); onItemClick(it); }}
            style={{
              top, height,
              left: `calc(64px + ${leftPct}% - ${64 * leftPct / 100}px + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              background: it.completed ? 'var(--bg-card-deep)' : stripeColor,
            }}
            title={`${it.title} · ${timeLabel}`}
          >
            {it.kind === 'routine' && (
              <button
                className="today-cal-block-check"
                onClick={(e) => { e.stopPropagation(); onToggleRoutineComplete(it.itemId); }}
                title={it.completed ? 'Mark not done' : 'Mark done'}
              >{it.completed ? '✓' : ''}</button>
            )}
            <div className="today-cal-block-title">
              {it.kind === 'routine' && CATS[it.category] && CATS[it.category].emoji ? `${CATS[it.category].emoji} ` : ''}
              {it.title}
            </div>
            <div className="today-cal-block-time">{timeLabel}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// TODAY SCREEN — daily compass (default landing surface)
// ═════════════════════════════════════════════════════════════
function TodayScreen({
  data, now, isMobile, saving, error, lastSyncedAt,
  onSwitchView,
  projects, blocks, refLibrary, elsewhere,
  weatherSettings, weatherCache, weatherRefreshing, weatherError,
  icsOccurrences,
  onRefreshWeather, onRequestGeo,
  onCreateBlock, onAddTodo, onUpdateTodo, onDeleteTodo,
  onCompleteAction, onAddAction, onDeleteAction,
  onToggleRoutineCompletion, onSetElsewhere,
  onOpenReference, onOpenBlock, onRoutineClick, onTodoDrop,
  onLaunchReview, onOpenPractice, onOpenInbox, onOpenSettings, onOpenRoutineManager, onSignOut,
  inbox, weeklyResets,
  currentTheme, onSetTheme,
  categoryStyles,
  todayViewMode, onSetTodayView, lunchSlot,
}) {
  const [weatherDayTab, setWeatherDayTab] = useState(0);
  const CATS = categoryStyles || CATEGORY_STYLES;
  const todos = data.todos || [];
  const completions = data.routineCompletions || {};
  const overrides = data.overrides || {};

  // Build today's timeline: routine + scheduled blocks + ICS, sorted, with completion state
  // viewDate: the day being shown. Defaults to today (now), can be navigated +/- 1 day.
  // MUST be declared before any memo that depends on viewDate.
  const [viewDayOffset, setViewDayOffset] = useState(0);
  const viewDate = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + viewDayOffset);
    return d;
  }, [now, viewDayOffset]);
  const isToday = viewDayOffset === 0;

  const todayItems = useMemo(() => {
    const items = [];
    // Routine items happening on the viewed date
    const routineToday = applyElsewhereFilter(
      resolvedRoutineForDate(data.routine || [], overrides, viewDate, completions),
      viewDate,
      elsewhere,
      now
    );
    routineToday.forEach(it => {
      items.push({
        kind: 'routine',
        id: `routine-${it.id}`,
        itemId: it.id,
        title: it.title,
        note: it.note,
        startMin: toMinutes(it.start),
        duration: it.duration,
        completed: !!it._completed,
        category: it.category,
        homeOnly: it.homeOnly,
      });
    });
    // Scheduled project blocks today
    blocksForDate(blocks || [], viewDate).forEach(b => {
      const proj = (projects || []).find(p => p.id === b.projectId);
      items.push({
        kind: 'block',
        id: `block-${b.id}`,
        blockId: b.id,
        title: b.title,
        note: proj ? proj.name.replace('APP - ', '') : '',
        startMin: toMinutes(b.start),
        duration: b.duration,
        completed: b.status === 'completed',
        partial: b.status === 'partial',
        color: (proj && proj.color) || 'var(--primary)',
        isTodo: !!b.todoId,
      });
    });
    // ICS events today
    (icsOccurrences || []).forEach(occ => {
      if (!isSameDay(occ.start, viewDate)) return;
      const startMin = occ.start.getHours() * 60 + occ.start.getMinutes();
      const dur = Math.max(1, Math.round((occ.end - occ.start) / 60000));
      items.push({
        kind: 'ics',
        id: `ics-${occ.uid}-${startMin}`,
        title: occ.summary || '(untitled)',
        note: occ.source === 'work' ? 'WORK' : 'HOUSEHOLD',
        startMin,
        duration: dur,
        color: occ.color || (occ.source === 'work' ? '#8C8C96' : '#7896AF'),
        allDay: occ.allDay,
      });
    });
    items.sort((a, b) => a.startMin - b.startMin);
    return items;
  }, [data.routine, overrides, completions, elsewhere, now, viewDate, blocks, projects, icsOccurrences]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = todayItems.find(it => it.startMin <= nowMin && (it.startMin + it.duration) > nowMin && !it.completed);
  const upcoming = todayItems.filter(it => it.startMin > nowMin && !it.completed);
  const nextItem = upcoming[0];
  const thenItem = upcoming[1];

  // Micro-strength banner detection
  const microItem = (data.routine || []).find(r => r.recurrence && r.recurrence.kind === 'top-of-hour');
  let microBanner = null;
  if (microItem) {
    const days = microItem.days || [];
    const sh = microItem.recurrence.startHour ?? 9;
    const eh = microItem.recurrence.endHour ?? 18;
    const jsDay = now.getDay();
    if (days.includes(jsDay) && now.getHours() >= sh && now.getHours() <= eh && now.getMinutes() < 2) {
      const ref = (refLibrary || []).find(r => r.id === 'ref-micro-strength');
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

  // Today's weather summary (one line)
  const weatherInline = (() => {
    if (!weatherCache || !Array.isArray(weatherCache.hours)) return null;
    const today = startOfDay(now).getTime();
    const tomorrow = today + 24 * 60 * 60 * 1000;
    const todayHours = weatherCache.hours.filter(h => {
      const t = h.time.getTime();
      return t >= today && t < tomorrow;
    });
    if (!todayHours.length) return null;
    const temps = todayHours.map(h => h.temp).filter(t => t != null);
    if (!temps.length) return null;
    const min = Math.round(Math.min(...temps));
    const max = Math.round(Math.max(...temps));
    // Use the current/next hour code for the icon
    const currentHourEntry = todayHours.find(h => h.time.getHours() === now.getHours()) || todayHours[0];
    const icon = wmoIcon(currentHourEntry.code);
    return { min, max, icon };
  })();

  // Single elsewhere toggle: active if any of morning/afternoon/allDay set
  const isWorkingAway = !!(elsewhere && (elsewhere.morning || elsewhere.afternoon || elsewhere.allDay));
  const toggleWorkingAway = () => {
    if (isWorkingAway) {
      onSetElsewhere({ morning: false, afternoon: false, allDay: false });
    } else {
      onSetElsewhere({ allDay: true });
    }
  };

  // Drag handlers for the timeline drop zone (project actions or todos)
  const [dragOver, setDragOver] = useState(false);
  const onTimelineDragOver = (e) => {
    if (Array.from(e.dataTransfer.types).includes('application/json')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  };
  const onTimelineDragLeave = () => setDragOver(false);
  const onTimelineDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); }
    catch { return; }
    // Drop into the next reasonable slot — if there's a current item, drop right after it; else now (rounded).
    const dropMin = current
      ? Math.min(current.startMin + current.duration, 23 * 60 + 45)
      : Math.round(nowMin / 15) * 15;
    const startStr = `${pad(Math.floor(dropMin / 60))}:${pad(dropMin % 60)}`;
    const dateISO = startOfDay(viewDate).toISOString();
    if (payload.type === 'next-action') {
      onCreateBlock({
        projectId: payload.projectId,
        actionId: payload.actionId,
        title: payload.title,
        date: dateISO,
        start: startStr,
        duration: payload.duration || 30,
      });
    } else if (payload.type === 'todo') {
      onTodoDrop({
        todoId: payload.todoId,
        date: dateISO,
        start: startStr,
        dropX: e.clientX,
        dropY: e.clientY,
      });
    }
  };

  const dateLabel = viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const openInboxCount = (inbox || []).filter(i => !i.actioned).length;

  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  const [todoInput, setTodoInput] = useState('');
  const submitTodo = () => {
    if (!todoInput.trim()) return;
    onAddTodo(todoInput);
    setTodoInput('');
  };

  // Sort todos: open + unscheduled first, then scheduled, then done
  const scheduledTodoIds = new Set((blocks || []).filter(b => b.todoId && b.status !== 'completed').map(b => b.todoId));
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aSched = scheduledTodoIds.has(a.id);
    const bSched = scheduledTodoIds.has(b.id);
    if (aSched !== bSched) return aSched ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const onTodoRailDragStart = (e, todo) => {
    if (todo.done) { e.preventDefault(); return; }
    const payload = { type: 'todo', todoId: todo.id, title: todo.title, duration: 30 };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const renderTimelineItem = (it) => {
    const isPast = (it.startMin + it.duration) <= nowMin && !it.completed;
    const isNow = it.startMin <= nowMin && (it.startMin + it.duration) > nowMin;
    const cls = `today-timeline-row ${isPast ? 'is-past' : ''} ${isNow && !it.completed ? 'is-now' : ''} ${it.completed ? 'is-completed' : ''}`;
    const stripeColor = it.kind === 'routine'
      ? ((CATS[it.category] || CATS.supplement).color)
      : (it.color || 'var(--primary)');
    const tagText = it.kind === 'ics' ? it.note : (it.kind === 'block' ? it.note : null);

    const handleRowClick = () => {
      if (it.kind === 'block') onOpenBlock(it.blockId);
      else if (it.kind === 'routine') onRoutineClick(it.itemId, now);
      // ICS events are read-only
    };

    const handleCheckClick = (e) => {
      e.stopPropagation();
      if (it.kind === 'routine') onToggleRoutineCompletion(it.itemId, now);
      // For project blocks and todos, no inline check on Today view (popover only — per scope)
    };

    return (
      <div key={it.id} className={cls} onClick={handleRowClick}>
        <div className="today-timeline-time">{fmtTime(it.startMin)}–{fmtTime(it.startMin + it.duration)}</div>
        <div className="today-timeline-stripe" style={{ background: stripeColor }} />
        <div className="today-timeline-content">
          <div className="today-timeline-title">
            {it.completed && '✓ '}{it.partial && '½ '}
            {it.kind === 'routine' && CATS[it.category] && CATS[it.category].emoji ? `${CATS[it.category].emoji} ` : ''}
            {it.title}
          </div>
          {it.note && (
            <div className="today-timeline-meta-line">{it.note}</div>
          )}
        </div>
        {tagText && (
          <div className="today-timeline-tag" style={{ color: stripeColor, opacity: 0.7 }}>{tagText}</div>
        )}
        {it.kind === 'routine' && (
          <button
            className="today-timeline-check"
            onClick={handleCheckClick}
            title={it.completed ? 'Mark not done' : 'Mark done'}
            aria-label={it.completed ? 'Mark not done' : 'Mark done'}
          >
            {it.completed ? '✓' : ''}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="today-wrap fade-in">
      {/* Top bar */}
      <div className="today-topbar">
        <div className="today-topbar-left">
          <button
            className="today-day-nav-btn"
            onClick={() => setViewDayOffset(o => o - 1)}
            title="Previous day"
            aria-label="Previous day"
          >‹</button>
          <div className="today-date-block">
            <div className="today-date">
              <span className="today-date-day">{dateLabel.split(',')[0]}</span>
              <span className="today-date-rest">{dateLabel.split(',').slice(1).join(',').trim()}</span>
            </div>
            <div className="today-date-time">
              {isToday
                ? now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : (viewDayOffset === 1 ? 'Tomorrow' : viewDayOffset === -1 ? 'Yesterday' : `${viewDayOffset > 0 ? '+' : ''}${viewDayOffset} days`)}
            </div>
          </div>
          <button
            className="today-day-nav-btn"
            onClick={() => setViewDayOffset(o => o + 1)}
            title="Next day"
            aria-label="Next day"
          >›</button>
          {viewDayOffset !== 0 && (
            <button
              className="today-day-nav-today"
              onClick={() => setViewDayOffset(0)}
              title="Jump to today"
            >Today</button>
          )}
        </div>
        <div className="today-topbar-right">
          <button
            className="today-theme-toggle"
            onClick={() => onSetTheme(currentTheme === 'light' ? 'dark' : 'light')}
            title={currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label="Toggle theme"
          >
            {currentTheme === 'light' ? '◐' : '◑'}
          </button>
          <button
            className={`today-elsewhere-toggle ${isWorkingAway ? 'active' : ''}`}
            onClick={toggleWorkingAway}
            title={isWorkingAway ? 'Working away — tap to switch back to home' : 'Tap if you\'re away from home today'}
          >
            {isWorkingAway ? 'Away' : 'At home'}
          </button>
          <button className="today-practice-btn" onClick={onOpenPractice}>
            Practice
          </button>
          <button className="today-footer-btn" onClick={onOpenInbox}>
            {openInboxCount > 0 ? `Inbox · ${openInboxCount}` : '+ Inbox'}
          </button>
          <button className="today-footer-btn" onClick={onOpenSettings}>⚙ Settings</button>
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
        onRefresh={onRefreshWeather}
        onRequestGeo={onRequestGeo}
      />

      {/* Right Now hero */}
      <div className="today-hero">
        {current ? (
          <>
            <div className="today-hero-eyebrow">Right now</div>
            <div className="today-hero-now">
              {current.kind === 'routine' && CATS[current.category] && CATS[current.category].emoji ? `${CATS[current.category].emoji} ` : ''}
              {current.title}
            </div>
            <div className="today-hero-now-meta">
              ends {fmtTime(current.startMin + current.duration)}
              {current.note && <span> · {current.note}</span>}
            </div>
            {nextItem && (
              <div className="today-hero-next">
                <span className="today-hero-next-label">Next</span>
                <span className="today-hero-next-time">{fmtTime(nextItem.startMin)}</span>
                <span>
                  {nextItem.kind === 'routine' && CATS[nextItem.category] && CATS[nextItem.category].emoji ? `${CATS[nextItem.category].emoji} ` : ''}
                  {nextItem.title}
                </span>
              </div>
            )}
            {thenItem && (
              <div className="today-hero-then">
                <span className="today-hero-then-label">Then</span>
                <span className="today-hero-then-time">{fmtTime(thenItem.startMin)}</span>
                <span>
                  {thenItem.kind === 'routine' && CATS[thenItem.category] && CATS[thenItem.category].emoji ? `${CATS[thenItem.category].emoji} ` : ''}
                  {thenItem.title}
                </span>
              </div>
            )}
          </>
        ) : nextItem ? (
          <>
            <div className="today-hero-eyebrow">Next up</div>
            <div className="today-hero-now">
              <span className="today-hero-next-time" style={{ marginRight: 'var(--space-3)' }}>{fmtTime(nextItem.startMin)}</span>
              {nextItem.kind === 'routine' && CATS[nextItem.category] && CATS[nextItem.category].emoji ? `${CATS[nextItem.category].emoji} ` : ''}
              {nextItem.title}
            </div>
            {nextItem.note && (
              <div className="today-hero-now-meta">{nextItem.note}</div>
            )}
            {thenItem && (
              <div className="today-hero-then">
                <span className="today-hero-then-label">Then</span>
                <span className="today-hero-then-time">{fmtTime(thenItem.startMin)}</span>
                <span>
                  {thenItem.kind === 'routine' && CATS[thenItem.category] && CATS[thenItem.category].emoji ? `${CATS[thenItem.category].emoji} ` : ''}
                  {thenItem.title}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="today-hero-eyebrow">Today</div>
            <div className="today-hero-now" style={{ color: 'var(--muted-3)' }}>
              Nothing else scheduled.
            </div>
          </>
        )}
        {microBanner && (
          <div className="today-hero-micro">
            ⚡ {microBanner.title} · {microBanner.summary}
          </div>
        )}
      </div>

      {/* Body: rail (left) + timeline (right) */}
      <div className="today-body">
        <div className="today-rail">
          {/* Portfolio */}
          <ProjectsRailPanel projects={projects} scheduledBlocks={blocks} onCompleteAction={onCompleteAction} onAddAction={onAddAction} onDeleteAction={onDeleteAction} />

          {/* Todos */}
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
                      onChange={() => onUpdateTodo(t.id, { done: !t.done })}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="today-todo-title">{t.title}</div>
                    {sched && <div className="today-todo-badge">SCHED</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini month — day navigation */}
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

        <div
          className="today-timeline"
          onDragOver={onTimelineDragOver}
          onDragLeave={onTimelineDragLeave}
          onDrop={onTimelineDrop}
        >
          <div className="today-timeline-header">
            <div className="today-timeline-eyebrow">
              {viewDayOffset === 0 ? 'Today'
                : viewDayOffset === 1 ? 'Tomorrow'
                : viewDayOffset === -1 ? 'Yesterday'
                : viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="today-timeline-header-right">
              <div className="today-view-toggle" role="group" aria-label="View mode">
                <button
                  className={`today-view-toggle-btn ${todayViewMode === 'timeline' ? 'active' : ''}`}
                  onClick={() => onSetTodayView('timeline')}
                  title="List view"
                  aria-label="List view"
                >☰</button>
                <button
                  className={`today-view-toggle-btn ${todayViewMode === 'calendar' ? 'active' : ''}`}
                  onClick={() => onSetTodayView('calendar')}
                  title="Calendar view"
                  aria-label="Calendar view"
                >▦</button>
              </div>
              <div className="today-timeline-meta">
                {todayItems.filter(i => !i.completed).length} open · {todayItems.length} total
              </div>
            </div>
          </div>
          {todayItems.length === 0 ? (
            <div className="today-timeline-empty">
              No events scheduled yet.
              <br />
              Drag a project action or todo from the right to plan the day.
            </div>
          ) : todayViewMode === 'calendar' ? (
            <TodayCalendarView
              items={todayItems}
              now={now}
              viewDate={viewDate}
              isToday={isToday}
              lunchSlot={lunchSlot}
              onItemClick={(it) => {
                if (it.kind === 'block') onOpenBlock(it.blockId);
                else if (it.kind === 'routine') onRoutineClick(it.itemId, now);
              }}
              onToggleRoutineComplete={(itemId) => onToggleRoutineCompletion(itemId, now)}
              CATS={CATS}
              onDrop={(payload, startMin, dropX, dropY) => {
                const startStr = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
                const dateISO = startOfDay(viewDate).toISOString();
                if (payload.type === 'next-action') {
                  onCreateBlock({
                    projectId: payload.projectId,
                    actionId: payload.actionId,
                    title: payload.title,
                    date: dateISO,
                    start: startStr,
                    duration: payload.duration || 30,
                  });
                } else if (payload.type === 'todo') {
                  onTodoDrop({ todoId: payload.todoId, date: dateISO, start: startStr, dropX, dropY });
                }
              }}
              onCreateAtTime={(startMin, title) => {
                if (!title || !title.trim()) return;
                const startStr = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
                onCreateBlock({
                  title: title.trim(),
                  date: startOfDay(viewDate).toISOString(),
                  start: startStr,
                  duration: 30,
                });
              }}
            />
          ) : (
            <div className="today-timeline-list">
              {todayItems.map(renderTimelineItem)}
            </div>
          )}
          <div className={`today-timeline-drop-hint ${dragOver ? 'drag-over' : ''}`}>
            {dragOver ? 'Release to schedule for now' : 'Drag a project action or todo here to schedule it for today'}
          </div>
        </div>

      </div>

      {/* Footer / utility row */}
      <div className="today-footer">
        <FridayReviewLauncher now={now} weeklyResets={weeklyResets} onLaunch={onLaunchReview} />
        <button className="today-footer-btn" onClick={onOpenRoutineManager}>⚙ Routines</button>
        <span className="today-footer-status">
          {saving ? 'Saving…' : (error ? 'Save error' : (lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''))}
        </span>
        <button className="today-footer-btn" onClick={onSignOut} style={{ marginLeft: 'auto' }}>Sign out</button>
      </div>
    </div>
  );
}


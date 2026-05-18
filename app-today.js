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
function TodayCalendarView({ items, now, viewDate, isToday, lunchSlot, onItemClick, onToggleRoutineComplete, CATS, onDrop, onCreateAtTime, scrollToNowTick }) {
  const HOUR_START = 6;
  const HOUR_END = 23;
  const HOUR_HEIGHT = 48;
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

  // Scroll so the now-line is vertically centred — runs on mount and whenever scrollToNowTick changes
  const scrollToNow = () => {
    requestAnimationFrame(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const container = grid.parentElement;
      if (!container) return;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < HOUR_START * 60 || nowMin >= HOUR_END * 60) return;
      const nowTop = ((nowMin / 60) - HOUR_START) * HOUR_HEIGHT;
      container.scrollTop = Math.max(0, nowTop - container.clientHeight / 2);
    });
  };
  useEffect(() => { scrollToNow(); }, []);
  useEffect(() => { if (scrollToNowTick) scrollToNow(); }, [scrollToNowTick]);

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

  // Column-split layout: overlapping events placed side-by-side, each at its actual time position.
  // Conflict detection uses VISUAL_MIN_MIN so very short events don't visually collide.
  const sorted = [...items].sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return b.duration - a.duration;
  });

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
    const columns = [];
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
    evs.forEach(it => {
      const myCol = eventColumn.get(it.id);
      const end = visualEnd(it);
      let span = 1;
      for (let c = myCol + 1; c < totalCols; c++) {
        const conflict = (columns[c] || []).some(o => !(o.end <= it.startMin || o.startMin >= end));
        if (conflict) break;
        span++;
      }
      positioned.push({ ...it, _col: myCol, _colspan: span, _totalCols: totalCols });
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
          <span className="today-cal-now-time">{pad(now.getHours())}:{pad(now.getMinutes())}</span>
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
        const totalCols = it._totalCols || 1;
        const colWidth = (100 - 8) / totalCols;
        const leftPct = (it._col || 0) * colWidth;
        const widthPct = colWidth * (it._colspan || 1);
        const stripeColor = it.kind === 'routine'
          ? ((CATS[it.category] || CATS.supplement).color)
          : (it.color || 'var(--primary)');
        const isHex = stripeColor.startsWith('#');
        const isNow = isToday && it.startMin <= nowMin && (it.startMin + it.duration) > nowMin;
        const isPast = !it.completed && (
          startOfDay(viewDate).getTime() < startOfDay(now).getTime() ||
          (isToday && (it.startMin + it.duration) <= nowMin)
        );
        const cls = `today-cal-block ${it.completed ? 'is-completed' : ''} ${isNow && !it.completed ? 'is-now' : ''} ${isPast ? 'is-past' : ''} ${it.kind === 'ics' ? 'is-ics' : ''}`;
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
        // Thin left-edge bar for 'elsewhere' routine items
        if (it.kind === 'routine' && it.category === 'elsewhere') {
          return (
            <div
              key={it.id}
              className={`cal-elsewhere-bar${isPast ? ' is-past' : ''}`}
              onClick={(e) => { e.stopPropagation(); onItemClick(it); }}
              title={`${it.title} · ${timeLabel}`}
              style={{
                top, height,
                left: `calc(64px + ${leftPct}% - ${64 * leftPct / 100}px + 2px)`,
                width: 6,
                background: stripeColor,
              }}
            />
          );
        }
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
  viewDate, isToday, viewDayOffset,
  todayItems, current, nowMin, now,
  elsewhere, categoryStyles, lunchSlot,
  todayViewMode, onSetTodayView,
  onCreateBlock, onOpenBlock, onRoutineClick, onToggleRoutineCompletion,
  scrollToNowTick,
}) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

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
    const dropMin = current
      ? Math.min(current.startMin + current.duration, 23 * 60 + 45)
      : Math.round(nowMin / 15) * 15;
    const startStr = `${pad(Math.floor(dropMin / 60))}:${pad(dropMin % 60)}`;
    const dateISO = startOfDay(viewDate).toISOString();
    if (payload.type === 'next-action') {
      onCreateBlock({ projectId: payload.projectId, actionId: payload.actionId, title: payload.title,
        date: dateISO, start: startStr, duration: payload.duration || 30 });
    }
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
        </div>
      </div>
      {todayViewMode === 'calendar' ? (
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
          onDrop={(payload, startMin) => {
            if (payload.type === 'next-action') {
              const startStr = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
              const dateISO = startOfDay(viewDate).toISOString();
              onCreateBlock({ projectId: payload.projectId, actionId: payload.actionId,
                title: payload.title, date: dateISO, start: startStr, duration: payload.duration || 30 });
            }
          }}
          onCreateAtTime={(startMin, title) => {
            if (!title || !title.trim()) return;
            const startStr = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
            onCreateBlock({ title: title.trim(), date: startOfDay(viewDate).toISOString(),
              start: startStr, duration: 30 });
          }}
          scrollToNowTick={scrollToNowTick}
        />
      ) : (
        <div className="today-timeline-list">
          {todayItems.map(renderTimelineItem)}
        </div>
      )}
    </div>
  );
}


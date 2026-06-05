import React, { useState, useEffect } from 'react';

// ═════════════════════════════════════════════════════════════
// TODAY MINI-MONTH — small month picker (Google-Cal style)
// ═════════════════════════════════════════════════════════════
export function TodayMiniMonth({ viewDate, now, onSelectDate }: any) {
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
  }, [viewDate, shownMonth]);

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

  const isSameDay = (a: Date, b: Date) =>
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

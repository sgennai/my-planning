// HELPERS
// ═════════════════════════════════════════════════════════════
function pad(n) { return String(n).padStart(2, '0'); }

// Convert a hex color + alpha (0-1) to an rgba() string.
function hexToRgba(hex, a) {
  if (!hex || !hex.startsWith('#')) return hex;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Produce a CSS background value from a stored color value ({hex,opacity,striped} or hex string).
function colorValToBackground(val, fallbackHex) {
  const { hex, opacity, striped } = parseColorVal(val);
  const base = hex || fallbackHex || '#888';
  const rgba = hexToRgba(base, opacity);
  if (striped) {
    return `repeating-linear-gradient(45deg, ${rgba} 0px, ${rgba} 11px, rgba(255,255,255,0.35) 11px, rgba(255,255,255,0.35) 17px)`;
  }
  return rgba;
}

// ColorPickerExtended — written without JSX to avoid any Babel parse issues
// at the top of this file before other definitions are in scope.
// `value` may be a hex string (legacy) or {hex,opacity,striped}.
// `onChange` receives {hex,opacity,striped}.
function ColorPickerExtended(props) {
  var value = props.value, defaultHex = props.defaultHex, onChange = props.onChange;
  var parsed = parseColorVal(value || defaultHex);
  var currentHex = parsed.hex || defaultHex || '#888888';
  function emit(patch) {
    onChange(Object.assign({ hex: currentHex, opacity: parsed.opacity, striped: parsed.striped }, patch));
  }
  return React.createElement('span', { className: 'cpx' },
    React.createElement('input', {
      type: 'color', value: currentHex, className: 'cpx-swatch', title: 'Pick colour',
      onChange: function(e) { emit({ hex: e.target.value }); },
    }),
    React.createElement('span', { className: 'cpx-sep' }),
    React.createElement('span', { className: 'cpx-group' },
      React.createElement('span', { className: 'cpx-label' }, 'Opacity'),
      React.createElement('input', {
        type: 'range', min: '0.1', max: '1', step: '0.05',
        value: parsed.opacity, className: 'cpx-slider',
        onChange: function(e) { emit({ opacity: Number(e.target.value) }); },
      }),
      React.createElement('span', { className: 'cpx-pct' }, Math.round(parsed.opacity * 100) + '%')
    ),
    React.createElement('button', {
      className: 'cpx-stripe-btn' + (parsed.striped ? ' active' : ''),
      onClick: function() { emit({ striped: !parsed.striped }); },
      title: 'Toggle diagonal stripes', type: 'button',
    }, parsed.striped ? 'On' : 'Off')
  );
}

function startOfDay(d) {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
function startOfWeek(d) {
  const x = startOfDay(d);
  const jsDay = x.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Mon as week start
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function formatDateShort(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatRange(a, b) {
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${formatDateShort(a)} – ${formatDateShort(b)}, ${b.getFullYear()}`;
}

// Describe an array of JS day numbers (0=Sun..6=Sat) compactly:
//   [0,1,2,3,4,5,6] -> "Daily"
//   [1,2,3,4,5]     -> "Mon–Fri"
//   [0,6]           -> "Weekends"
//   [1,3,5]         -> "Mon · Wed · Fri"
function describeDays(days) {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  const set = new Set(sorted);
  if (sorted.length === 7) return 'Daily';
  if (sorted.length === 5 && [1,2,3,4,5].every(d => set.has(d))) return 'Mon–Fri';
  if (sorted.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  const SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return sorted.map(d => SHORT[d]).join(' · ');
}

// ─────────────────────────────────────────────────────────────
// ROUTINE SELECTION + LANE LAYOUT
// ─────────────────────────────────────────────────────────────
function itemsForVisualColumn(visualCol, routine) {
  const jsDay = VISUAL_TO_JS_DAY[visualCol];
  return routine.filter(item =>
    item.days.includes(jsDay) && !item.recurrence
  );
}

function layoutDay(items) {
  // Visual minimum: very short events still render with a min height of 20px,
  // which at 56px/hour ≈ 21 min. We treat that floor as the "visual end" so
  // back-to-back 10-min events don't render stacked on top of each other.
  const VISUAL_MIN_MIN = 22;
  const visualEnd = (it) => {
    const start = toMinutes(it.start);
    return start + Math.max(it.duration, VISUAL_MIN_MIN);
  };
  const sorted = [...items].sort((a, b) => {
    const sd = toMinutes(a.start) - toMinutes(b.start);
    if (sd !== 0) return sd;
    return b.duration - a.duration;
  });
  const annotated = sorted.map(item => ({ ...item }));

  // Build clusters of events that visually overlap
  const clusters = [];
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
    const columns = [];
    const eventColumn = new Map();
    evs.forEach(it => {
      const start = toMinutes(it.start);
      const end = visualEnd(it);
      let col = 0;
      while (true) {
        const occupants = columns[col] || [];
        const conflict = occupants.some(o => !(o.end <= start || o.start >= end));
        if (!conflict) {
          columns[col] = [...occupants, { start, end, id: it.id || it._key }];
          eventColumn.set(it, col);
          break;
        }
        col++;
      }
    });
    const totalCols = columns.length;
    evs.forEach(it => {
      const myCol = eventColumn.get(it);
      const start = toMinutes(it.start);
      const end = visualEnd(it);
      let span = 1;
      for (let c = myCol + 1; c < totalCols; c++) {
        const conflict = (columns[c] || []).some(o => !(o.end <= start || o.start >= end));
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

// ─────────────────────────────────────────────────────────────
// SCHEDULED BLOCKS — date matching, week filtering, layout combining
// ─────────────────────────────────────────────────────────────
function blocksForDate(blocks, date) {
  const dateKey = startOfDay(date).getTime();
  return blocks.filter(b => {
    if (b.status === 'skipped') return false;
    const d = new Date(b.date);
    return startOfDay(d).getTime() === dateKey;
  });
}

function blocksForWeek(blocks, weekStart) {
  const start = startOfDay(weekStart).getTime();
  const end = startOfDay(addDays(weekStart, 7)).getTime();
  return blocks.filter(b => {
    if (b.status === 'skipped') return false;
    const t = new Date(b.date).getTime();
    return t >= start && t < end;
  });
}

// ─────────────────────────────────────────────────────────────
// ROUTINE OVERRIDES — per-occurrence "this week only" changes
// ─────────────────────────────────────────────────────────────
// Override key format: `${routineItemId}:${dateISO}` where dateISO = startOfDay(date).toISOString()
// Override types:
//   { type: 'skip' } — don't render this occurrence
//   { type: 'edit', start?, duration?, title?, note? } — edit just this occurrence
//   { type: 'move', moveToDate, start?, duration? } — move to a different date
function makeOverrideKey(itemId, date) {
  return `${itemId}:${startOfDay(date).toISOString()}`;
}

// ─────────────────────────────────────────────────────────────
// ICS PARSER — handles the subset of iCalendar that real Google
// Calendar feeds actually emit: VEVENT with DTSTART/DTEND,
// RRULE (DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/BYDAY),
// EXDATE for skipped occurrences. Anything else is treated as a
// single occurrence at DTSTART.
// ─────────────────────────────────────────────────────────────

// Unfold continuation lines (RFC 5545: lines starting with space/tab continue the previous line)
function unfoldICS(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

// Parse an ICS DATE-TIME value into a JS Date.
// Handles "20260101T093000Z" (UTC), "20260101T093000" (local), "TZID=...:20260101T093000" (timezone).
// For TZID values we treat them as local — good enough for visual display.
function parseICSDate(value) {
  if (!value) return null;
  // Strip TZID prefix if present (handled at param level, not here)
  const v = value.replace(/^.*:/, '').trim();
  // All-day "20260101"
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
    return new Date(y, mo, d, 0, 0, 0);
  }
  // Datetime "20260101T093000" or "20260101T093000Z"
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

// Parse a single VEVENT block into a structured object
function parseVEvent(lines) {
  const ev = { rrule: null, exdates: [] };
  lines.forEach(line => {
    // Split on the first colon, but watch for parameters before it (e.g. DTSTART;TZID=...:value)
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const lhs = line.slice(0, colonIdx);
    const rhs = line.slice(colonIdx + 1);
    // Property name is everything before the first ;
    const semiIdx = lhs.indexOf(';');
    const propName = (semiIdx === -1 ? lhs : lhs.slice(0, semiIdx)).toUpperCase();
    const propParams = semiIdx === -1 ? '' : lhs.slice(semiIdx + 1);
    switch (propName) {
      case 'SUMMARY':
        ev.title = rhs.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';');
        break;
      case 'DTSTART':
        ev.startRaw = rhs;
        ev.start = parseICSDate(rhs);
        ev.allDay = /^\d{8}$/.test(rhs.trim()) || /VALUE=DATE/i.test(propParams);
        break;
      case 'DTEND':
        ev.end = parseICSDate(rhs);
        break;
      case 'DURATION':
        // Simple ISO 8601 duration (PT1H30M)
        ev.durationStr = rhs;
        break;
      case 'RRULE':
        ev.rrule = parseRRule(rhs);
        break;
      case 'EXDATE': {
        const parts = rhs.split(',');
        parts.forEach(p => {
          const d = parseICSDate(p);
          if (d) ev.exdates.push(d.getTime());
        });
        break;
      }
      case 'UID':
        ev.uid = rhs;
        break;
      case 'STATUS':
        ev.status = rhs;
        break;
      case 'LOCATION':
        ev.location = rhs;
        break;
    }
  });
  // Fill in end if missing — default to 1 hour after start, or end-of-day for all-day
  if (ev.start && !ev.end) {
    if (ev.allDay) {
      ev.end = new Date(ev.start);
      ev.end.setHours(23, 59, 0, 0);
    } else {
      ev.end = new Date(ev.start.getTime() + 60 * 60 * 1000);
    }
  }
  return ev;
}

function parseRRule(value) {
  const out = {};
  value.split(';').forEach(part => {
    const [k, v] = part.split('=');
    if (!k || !v) return;
    out[k.toUpperCase()] = v;
  });
  const r = {
    freq: (out.FREQ || '').toUpperCase(), // DAILY/WEEKLY/MONTHLY/YEARLY
    interval: out.INTERVAL ? parseInt(out.INTERVAL, 10) : 1,
    count: out.COUNT ? parseInt(out.COUNT, 10) : null,
    until: out.UNTIL ? parseICSDate(out.UNTIL) : null,
    byday: out.BYDAY ? out.BYDAY.split(',').map(s => s.trim().toUpperCase()) : null,
  };
  return r;
}

// Map RRULE BYDAY codes to JS Date.getDay() values
const RRULE_DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Expand a VEVENT's recurrence into concrete instances within [windowStart, windowEnd]
function expandEvent(ev, windowStart, windowEnd) {
  if (!ev.start) return [];
  const occurrences = [];
  const startMs = ev.start.getTime();
  const endMs = ev.end ? ev.end.getTime() : startMs + 60 * 60 * 1000;
  const durationMs = endMs - startMs;

  const isExcluded = (d) => ev.exdates.includes(d.getTime());

  // No RRULE — single event
  if (!ev.rrule || !ev.rrule.freq) {
    if (ev.start <= windowEnd && (ev.end || ev.start) >= windowStart && !isExcluded(ev.start)) {
      occurrences.push({ start: ev.start, end: ev.end || new Date(startMs + durationMs) });
    }
    return occurrences;
  }

  const r = ev.rrule;
  // Safety bound
  const maxIter = 500;
  let iter = 0;
  let count = 0;

  const pushIf = (d) => {
    if (isExcluded(d)) return;
    if (d > windowEnd) return false; // stop
    const e = new Date(d.getTime() + durationMs);
    if (e >= windowStart) {
      occurrences.push({ start: new Date(d), end: e });
    }
    return true;
  };

  if (r.freq === 'DAILY') {
    let cursor = new Date(ev.start);
    while (iter++ < maxIter) {
      if (r.until && cursor > r.until) break;
      if (r.count && count >= r.count) break;
      if (cursor > windowEnd) break;
      if (cursor >= windowStart || cursor.getTime() === ev.start.getTime()) {
        pushIf(cursor);
      }
      count++;
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + r.interval);
    }
  } else if (r.freq === 'WEEKLY') {
    // If BYDAY present, iterate week by week and emit on each listed day
    const days = r.byday ? r.byday.map(c => RRULE_DAY_MAP[c.replace(/^[+-]?\d+/, '')]).filter(d => d != null) : [ev.start.getDay()];
    // Cursor starts at the start of the week containing DTSTART
    let weekCursor = new Date(ev.start);
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay()); // back to Sunday
    weekCursor.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
    while (iter++ < maxIter) {
      if (r.until && weekCursor > r.until) break;
      if (weekCursor.getTime() - 7 * 24 * 60 * 60 * 1000 > windowEnd.getTime()) break;
      for (const day of days) {
        if (r.count && count >= r.count) break;
        const occ = new Date(weekCursor);
        occ.setDate(occ.getDate() + day);
        if (occ < ev.start) continue; // skip occurrences before DTSTART
        if (r.until && occ > r.until) break;
        if (occ > windowEnd) break;
        if (occ >= windowStart) pushIf(occ);
        count++;
      }
      if (r.count && count >= r.count) break;
      weekCursor = new Date(weekCursor); weekCursor.setDate(weekCursor.getDate() + 7 * r.interval);
    }
  } else if (r.freq === 'MONTHLY') {
    let cursor = new Date(ev.start);
    while (iter++ < maxIter) {
      if (r.until && cursor > r.until) break;
      if (r.count && count >= r.count) break;
      if (cursor > windowEnd) break;
      if (cursor >= windowStart || cursor.getTime() === ev.start.getTime()) pushIf(cursor);
      count++;
      cursor = new Date(cursor); cursor.setMonth(cursor.getMonth() + r.interval);
    }
  } else if (r.freq === 'YEARLY') {
    let cursor = new Date(ev.start);
    while (iter++ < maxIter) {
      if (r.until && cursor > r.until) break;
      if (r.count && count >= r.count) break;
      if (cursor > windowEnd) break;
      if (cursor >= windowStart || cursor.getTime() === ev.start.getTime()) pushIf(cursor);
      count++;
      cursor = new Date(cursor); cursor.setFullYear(cursor.getFullYear() + r.interval);
    }
  } else {
    // Unsupported FREQ — fall back to a single occurrence
    if (ev.start <= windowEnd && (ev.end || ev.start) >= windowStart && !isExcluded(ev.start)) {
      occurrences.push({ start: ev.start, end: ev.end || new Date(startMs + durationMs) });
    }
  }

  return occurrences;
}

// Parse a full ICS document and return structured events
function parseICS(text) {
  if (!text) return [];
  const unfolded = unfoldICS(text);
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) cur = [];
    else if (line.startsWith('END:VEVENT')) {
      if (cur) {
        const ev = parseVEvent(cur);
        // Skip CANCELLED events
        if (ev.status !== 'CANCELLED' && ev.start) events.push(ev);
        cur = null;
      }
    } else if (cur) {
      cur.push(line);
    }
  }
  return events;
}

// Build a flat list of occurrences from parsed events for a given week window.
// Each occurrence is { source, title, start, end, location, allDay }.
function expandEventsForWindow(events, windowStart, windowEnd, source) {
  const out = [];
  events.forEach(ev => {
    const occs = expandEvent(ev, windowStart, windowEnd);
    occs.forEach(occ => {
      out.push({
        source,
        title: ev.title || '(untitled)',
        start: occ.start,
        end: occ.end,
        location: ev.location,
        allDay: ev.allDay,
        uid: ev.uid,
      });
    });
  });
  return out;
}

// Fetch and parse an ICS feed via the proxy. Returns parsed events (not yet expanded).
async function fetchICS(proxyUrl, feedUrl) {
  if (!proxyUrl || !feedUrl) throw new Error('Missing proxy or feed URL');
  const url = `${proxyUrl}?url=${encodeURIComponent(feedUrl)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
  const text = await resp.text();
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Response does not look like an ICS feed');
  }
  return parseICS(text);
}

// ─────────────────────────────────────────────────────────────
// WEATHER — Open-Meteo, no API key, public CORS.
// Returns hourly forecast for the next 72 hours.
// ─────────────────────────────────────────────────────────────

// WMO weather codes → emoji icons. See https://open-meteo.com/en/docs (search "WMO Weather interpretation codes")
const WMO_ICONS = {
  0: '☀️',  // Clear sky
  1: '🌤️', // Mainly clear
  2: '⛅',  // Partly cloudy
  3: '☁️',  // Overcast
  45: '🌫️', 48: '🌫️', // Fog
  51: '🌦️', 53: '🌦️', 55: '🌦️', // Drizzle
  56: '🌧️', 57: '🌧️', // Freezing drizzle
  61: '🌧️', 63: '🌧️', 65: '🌧️', // Rain
  66: '🌧️', 67: '🌧️', // Freezing rain
  71: '🌨️', 73: '🌨️', 75: '🌨️', // Snowfall
  77: '🌨️', // Snow grains
  80: '🌦️', 81: '🌧️', 82: '⛈️', // Rain showers
  85: '🌨️', 86: '🌨️', // Snow showers
  95: '⛈️', 96: '⛈️', 99: '⛈️', // Thunderstorm
};
const wmoIcon = (code) => WMO_ICONS[code] || '·';

async function fetchWeather(lat, lon) {
  if (lat == null || lon == null) throw new Error('Missing coordinates');
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    forecast_days: '4', // get 4 days to cover "now + 72h"
    timezone: 'auto',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Weather fetch failed (${resp.status})`);
  const data = await resp.json();
  if (!data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error('Unexpected weather response');
  }
  // Build a list of { time: Date, temp: number, precip: number, code: number }
  const hours = data.hourly.time.map((t, i) => ({
    time: new Date(t),
    temp: data.hourly.temperature_2m[i],
    precip: data.hourly.precipitation_probability[i] ?? 0,
    code: data.hourly.weather_code[i] ?? 0,
  }));
  return { hours, fetchedAt: new Date(), tz: data.timezone };
}

// Reverse-geocode a lat/lon to a city label using Open-Meteo's free geocoding API.
async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      count: '1',
      language: 'en',
    });
    // Open-Meteo's reverse geocoding is implicit in their geocoding search endpoint;
    // for true reverse geocoding we use an unofficial path. Fall back gracefully.
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lat.toFixed(2) + ',' + lon.toFixed(2))}`;
    // The above won't work for reverse geocoding; just return coords as label.
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  } catch {
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }
}

// Resolve which routine items render on a given date, applying overrides.
// Per-occurrence completion key: same shape as override key.
function makeCompletionKey(itemId, date) {
  return `${itemId}:${startOfDay(date).toISOString()}`;
}

function resolvedRoutineForDate(routine, overrides, date, completions) {
  const dateKey = startOfDay(date).toISOString();
  const dateMs = startOfDay(date).getTime();
  const jsDay = date.getDay();
  const out = [];
  const compMap = completions || {};

  const isCompleted = (itemId) => !!compMap[`${itemId}:${dateKey}`];

  // 1. Items that normally occur on this day (with edit/skip overrides applied)
  routine.forEach(item => {
    if (!item.days.includes(jsDay)) return;
    if (item.recurrence) return; // skip micro-strength etc.
    const key = makeOverrideKey(item.id, date);
    const ov = overrides[key];
    if (!ov) {
      out.push({ ...item, _kind: 'routine', _completed: isCompleted(item.id) });
      return;
    }
    if (ov.type === 'skip') return;
    if (ov.type === 'move') return; // rendered on another date
    if (ov.type === 'edit') {
      // Detect whether the override actually changes anything visible
      const hasChange =
        (ov.title != null && ov.title !== item.title) ||
        (ov.note != null && ov.note !== item.note) ||
        (ov.start != null && ov.start !== item.start) ||
        (ov.duration != null && ov.duration !== item.duration);
      out.push({
        ...item,
        title: ov.title != null ? ov.title : item.title,
        note: ov.note != null ? ov.note : item.note,
        start: ov.start != null ? ov.start : item.start,
        duration: ov.duration != null ? ov.duration : item.duration,
        _kind: 'routine',
        _overridden: hasChange,
        _completed: isCompleted(item.id),
      });
    }
  });

  // 2. Items moved TO this date from another day
  Object.entries(overrides || {}).forEach(([key, ov]) => {
    if (!ov || ov.type !== 'move' || !ov.moveToDate) return;
    if (startOfDay(new Date(ov.moveToDate)).getTime() !== dateMs) return;
    const itemId = key.split(':')[0];
    const item = routine.find(r => r.id === itemId);
    if (!item) return;
    out.push({
      ...item,
      start: ov.start != null ? ov.start : item.start,
      duration: ov.duration != null ? ov.duration : item.duration,
      title: ov.title != null ? ov.title : item.title,
      note: ov.note != null ? ov.note : item.note,
      _kind: 'routine',
      _moved: true,
      _movedFromDate: key.split(':').slice(1).join(':'), // original date ISO
      _overrideKey: key,
      _completed: isCompleted(item.id),
    });
  });

  return out;
}

// Apply working-from-elsewhere filter to today's items only.
// Toggles affect ONLY today: morning hides homeOnly items starting before noon,
// afternoon hides homeOnly items starting at/after noon, allDay hides them all.
function applyElsewhereFilter(items, date, elsewhereToggles, today) {
  if (!elsewhereToggles || !today) return items;
  // Only filter when date IS today
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

// Total minutes for a given project this week (only counts scheduled + partial,
// not completed — once done it's "spent" not "scheduled").
function plannedMinutesForProject(blocks, weekStart, projectId) {
  return blocksForWeek(blocks, weekStart)
    .filter(b => b.projectId === projectId && b.status !== 'completed')
    .reduce((sum, b) => sum + (b.duration || 0), 0);
}

function spentMinutesForProject(blocks, weekStart, projectId) {
  return blocksForWeek(blocks, weekStart)
    .filter(b => b.projectId === projectId && (b.status === 'completed' || b.status === 'partial'))
    .reduce((sum, b) => sum + (b.actualMinutes || 0), 0);
}

// Combine routine items + project blocks + ICS imported events for a single day,
// applying overrides + lane allocation.
function combinedDayItems(visualCol, routine, blocks, weekStart, overrides, elsewhereToggles, today, icsOccurrences, completions) {
  const date = addDays(weekStart, visualCol);
  let routineItems = resolvedRoutineForDate(routine, overrides || {}, date, completions);
  routineItems = applyElsewhereFilter(routineItems, date, elsewhereToggles, today);
  const blockItems = blocksForDate(blocks, date).map(b => ({
    id: b.id,
    title: b.title,
    start: b.start,
    duration: b.duration,
    category: 'project-block',
    _kind: 'block',
    _block: b,
  }));
  // ICS occurrences for this date
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
  // Exclude 'elsewhere' and 'commute' routine items from lane layout — they render as decorative markers
  const allItems = [...routineItems, ...blockItems, ...icsItems];
  const elsewhereItems = allItems.filter(it => it._kind === 'routine' && it.category === 'elsewhere');
  const commuteItems = allItems.filter(it => it._kind === 'routine' && it.category === 'commute');
  const mainItems = allItems.filter(it => !(it._kind === 'routine' && (it.category === 'elsewhere' || it.category === 'commute')));
  const laid = layoutDay(mainItems);
  // Flag main items that time-overlap with an elsewhere bar so renderers can indent them
  const ewRanges = elsewhereItems.map(ew => ({ s: toMinutes(ew.start), e: toMinutes(ew.start) + ew.duration }));
  laid.forEach(it => {
    const s = toMinutes(it.start), e = s + it.duration;
    if (ewRanges.some(ew => ew.e > s && ew.s < e)) it._elsewhereOverlap = true;
  });
  elsewhereItems.forEach(it => { it._isElsewhereBar = true; });
  commuteItems.forEach(it => { it._isCommuteMarker = true; });
  return [...laid, ...elsewhereItems, ...commuteItems];
}

// Get the set of action IDs that are currently scheduled or completed
// (so the chip can show as scheduled and avoid duplicate scheduling).
function actionStateMap(blocks) {
  const map = {};
  blocks.forEach(b => {
    if (!b.actionId) return;
    if (b.status === 'skipped') return;
    // 'completed' wins over 'scheduled' wins over 'partial'
    const cur = map[b.actionId];
    const rank = { partial: 1, scheduled: 2, completed: 3 };
    if (!cur || rank[b.status] > rank[cur.status]) {
      map[b.actionId] = { status: b.status, blockId: b.id, duration: b.duration };
    }
  });
  return map;
}

// ═════════════════════════════════════════════════════════════
// GOOGLE DRIVE LAYER
// ═════════════════════════════════════════════════════════════
let _tokenClient = null;
let _accessToken = null;

function waitForGoogle() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) resolve();
      else setTimeout(check, 80);
    };
    check();
  });
}

async function initAuth() {
  await waitForGoogle();
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {},
  });
}

function requestToken({ silent }) {
  return new Promise((resolve, reject) => {
    if (!_tokenClient) return reject(new Error('Auth not initialized'));
    _tokenClient.callback = (resp) => {
      if (resp && resp.access_token) {
        _accessToken = resp.access_token;
        resolve(resp.access_token);
      } else {
        reject(new Error(resp && (resp.error_description || resp.error) || 'No token'));
      }
    };
    try {
      _tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
    } catch (e) { reject(e); }
  });
}

function revokeToken() {
  return new Promise((resolve) => {
    if (!_accessToken) return resolve();
    google.accounts.oauth2.revoke(_accessToken, () => {
      _accessToken = null;
      resolve();
    });
  });
}

async function driveFetch(url, options = {}) {
  const headers = { ...options.headers, Authorization: `Bearer ${_accessToken}` };
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401) {
    await requestToken({ silent: true });
    return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${_accessToken}` } });
  }
  return resp;
}

async function findDataFile() {
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=name%3D'${encodeURIComponent(FILE_NAME)}'`;
  const resp = await driveFetch(url);
  if (!resp.ok) throw new Error(`Drive list failed (${resp.status})`);
  const json = await resp.json();
  return (json.files || []).find((f) => f.name === FILE_NAME) || null;
}

async function downloadFile(fileId) {
  const resp = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!resp.ok) throw new Error(`Drive download failed (${resp.status})`);
  return resp.json();
}

async function createFile(data) {
  const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
  const boundary = '-------314159265358979323846';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(data) + `\r\n--${boundary}--`;
  const resp = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
  );
  if (!resp.ok) throw new Error(`Drive create failed (${resp.status})`);
  return resp.json();
}

async function updateFile(fileId, data) {
  const resp = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
  );
  if (!resp.ok) throw new Error(`Drive update failed (${resp.status})`);
  return resp.json();
}

// ─────────────────────────────────────────────────────────────
// VIEW SWITCHER — Apple Calendar-style Today / Week toggle
// ─────────────────────────────────────────────────────────────
function ViewSwitcher({ view, onSwitchView }) {
  return (
    <div className="view-switcher">
      <button
        className={'view-switcher-btn' + (view === 'today' ? ' active' : '')}
        onClick={() => view !== 'today' && onSwitchView('today')}
      >Day</button>
      <button
        className={'view-switcher-btn' + (view === 'plan' ? ' active' : '')}
        onClick={() => view !== 'plan' && onSwitchView('plan')}
      >Week</button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════

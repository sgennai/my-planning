// ICS PARSER

export function unfoldICS(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

export function parseICSDate(value: string): Date | null {
  if (!value) return null;
  const v = value.replace(/^.*:/, '').trim();
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
    return new Date(y, mo, d, 0, 0, 0);
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

export function parseRRule(value: string) {
  const out: Record<string, string> = {};
  value.split(';').forEach(part => {
    const [k, v] = part.split('=');
    if (!k || !v) return;
    out[k.toUpperCase()] = v;
  });
  return {
    freq: (out.FREQ || '').toUpperCase(),
    interval: out.INTERVAL ? parseInt(out.INTERVAL, 10) : 1,
    count: out.COUNT ? parseInt(out.COUNT, 10) : null,
    until: out.UNTIL ? parseICSDate(out.UNTIL) : null,
    byday: out.BYDAY ? out.BYDAY.split(',').map(s => s.trim().toUpperCase()) : null,
  };
}

export const RRULE_DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseVEvent(lines: string[]) {
  const ev: any = { rrule: null, exdates: [] };
  lines.forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const lhs = line.slice(0, colonIdx);
    const rhs = line.slice(colonIdx + 1);
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
      case 'UID': ev.uid = rhs; break;
      case 'STATUS': ev.status = rhs; break;
      case 'LOCATION': ev.location = rhs; break;
    }
  });
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

export function expandEvent(ev: any, windowStart: Date, windowEnd: Date) {
  if (!ev.start) return [];
  const occurrences: { start: Date, end: Date }[] = [];
  const startMs = ev.start.getTime();
  const endMs = ev.end ? ev.end.getTime() : startMs + 60 * 60 * 1000;
  const durationMs = endMs - startMs;

  const isExcluded = (d: Date) => ev.exdates.includes(d.getTime());

  if (!ev.rrule || !ev.rrule.freq) {
    if (ev.start <= windowEnd && (ev.end || ev.start) >= windowStart && !isExcluded(ev.start)) {
      occurrences.push({ start: ev.start, end: ev.end || new Date(startMs + durationMs) });
    }
    return occurrences;
  }

  const r = ev.rrule;
  const maxIter = 500;
  let iter = 0;
  let count = 0;

  const pushIf = (d: Date) => {
    if (isExcluded(d)) return;
    if (d > windowEnd) return false;
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
    const days = r.byday ? r.byday.map((c: string) => RRULE_DAY_MAP[c.replace(/^[+-]?\d+/, '')]).filter((d: number) => d != null) : [ev.start.getDay()];
    let weekCursor = new Date(ev.start);
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay());
    weekCursor.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
    while (iter++ < maxIter) {
      if (r.until && weekCursor > r.until) break;
      if (weekCursor.getTime() - 7 * 24 * 60 * 60 * 1000 > windowEnd.getTime()) break;
      for (const day of days) {
        if (r.count && count >= r.count) break;
        const occ = new Date(weekCursor);
        occ.setDate(occ.getDate() + day);
        if (occ < ev.start) continue;
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
    if (ev.start <= windowEnd && (ev.end || ev.start) >= windowStart && !isExcluded(ev.start)) {
      occurrences.push({ start: ev.start, end: ev.end || new Date(startMs + durationMs) });
    }
  }

  return occurrences;
}

export function parseICS(text: string) {
  if (!text) return [];
  const unfolded = unfoldICS(text);
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) cur = [];
    else if (line.startsWith('END:VEVENT')) {
      if (cur) {
        const ev = parseVEvent(cur);
        if (ev.status !== 'CANCELLED' && ev.start) events.push(ev);
        cur = null;
      }
    } else if (cur) {
      cur.push(line);
    }
  }
  return events;
}

export function expandEventsForWindow(events: any[], windowStart: Date, windowEnd: Date, source: string) {
  const out: any[] = [];
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

// Fetch an ICS feed through the Cloudflare proxy (`?url=<encoded feed>`) and
// return the parsed VEVENT list ready for expandEventsForWindow(). The proxy is
// required because calendar hosts (Google, etc.) don't send CORS headers.
export async function fetchICS(proxyUrl: string, icsUrl: string) {
  const base = (proxyUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('No proxy URL configured');
  if (!icsUrl) return [];
  const res = await fetch(`${base}/?url=${encodeURIComponent(icsUrl)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Proxy returned HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
  }
  const text = await res.text();
  return parseICS(text);
}

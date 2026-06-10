import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseICS, fetchICS } from './ics-parser';

const SAMPLE = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abc-123
SUMMARY:Pipeline review
DTSTART:20260610T093000Z
DTEND:20260610T101500Z
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
STATUS:CANCELLED
SUMMARY:Dropped
DTSTART:20260610T120000Z
END:VEVENT
END:VCALENDAR`;

afterEach(() => { vi.restoreAllMocks(); });

describe('parseICS', () => {
  it('parses VEVENTs and skips cancelled ones', () => {
    const events = parseICS(SAMPLE);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Pipeline review');
    expect(events[0].uid).toBe('abc-123');
  });
  it('returns [] for empty input', () => {
    expect(parseICS('')).toEqual([]);
  });
});

describe('fetchICS', () => {
  it('calls the proxy with the encoded feed url and returns parsed events', async () => {
    const calls: string[] = [];
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => SAMPLE } as Response;
    });
    const events = await fetchICS('https://w.example/', 'https://cal.example/feed.ics?x=1&y=2');
    expect(calls[0]).toBe('https://w.example/?url=https%3A%2F%2Fcal.example%2Ffeed.ics%3Fx%3D1%26y%3D2');
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Pipeline review');
  });
  it('throws a useful error on a non-ok proxy response', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 502, text: async () => 'bad gateway' } as Response));
    await expect(fetchICS('https://w.example', 'https://cal.example/f.ics')).rejects.toThrow(/HTTP 502/);
  });
});

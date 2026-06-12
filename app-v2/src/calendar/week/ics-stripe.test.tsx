// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { WeekGrid } from './WeekScreen';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }) });
});

const now = new Date('2026-06-10T10:00:00');
const weekStart = new Date('2026-06-08T00:00:00'); // Monday

function makeIcs(striped: boolean) {
  const start = new Date('2026-06-10T09:00:00');
  const end = new Date('2026-06-10T10:00:00');
  return [{ source: 'household', title: 'Piano', start, end, allDay: false, uid: 'x',
    color: '#3C8A5E', colorVal: { hex: '#3C8A5E', opacity: 1, striped } }];
}

function renderGrid(striped: boolean) {
  return render(
    <WeekGrid routine={[]} overrides={{}} scheduledBlocks={[]} projects={[]} weekStart={weekStart}
      now={now} singleCol={null} onDayClick={() => {}} onCreateBlock={() => {}} onBlockClick={() => {}}
      onRoutineClick={() => {}} onUpdateBlock={() => {}} elsewhereToggles={{}} icsOccurrences={makeIcs(striped)}
      completions={{}} onToggleComplete={() => {}} categoryStyles={null} calendarToggles={{ routine: true, work: true, household: true }}
      weekendCollapsed={false} onToggleWeekendCollapse={() => {}} />
  );
}

describe('ICS event never renders a striped background', () => {
  it('solid border-left = calendar colour; no repeating-linear-gradient even when colorVal.striped=true', () => {
    const { container } = renderGrid(true);
    const ev = container.querySelector('.cal-item') as HTMLElement;
    expect(ev).toBeTruthy();
    const bg = ev.style.background + ' ' + ev.style.backgroundImage;
    expect(bg).not.toContain('repeating-linear-gradient');
    // left edge carries the household colour
    expect(ev.style.borderLeftColor.replace(/\s/g, '')).toMatch(/#3C8A5E|rgb\(60,138,94\)/i);
  });

  it('does not apply a translucent inline fill from a low-opacity calendar colour', () => {
    // 20% opacity household colour must NOT make the event see-through (which would
    // let the hour-lines show through and read as horizontal stripes).
    const start = new Date('2026-06-10T09:00:00');
    const end = new Date('2026-06-10T10:00:00');
    const ics = [{ source: 'household', title: 'Piano', start, end, allDay: false, uid: 'x',
      color: '#A4C639', colorVal: { hex: '#A4C639', opacity: 0.2, striped: false } }];
    const { container } = render(
      <WeekGrid routine={[]} overrides={{}} scheduledBlocks={[]} projects={[]} weekStart={weekStart}
        now={now} singleCol={null} onDayClick={() => {}} onCreateBlock={() => {}} onBlockClick={() => {}}
        onRoutineClick={() => {}} onUpdateBlock={() => {}} elsewhereToggles={{}} icsOccurrences={ics}
        completions={{}} onToggleComplete={() => {}} categoryStyles={null} calendarToggles={{ routine: true, work: true, household: true }}
        weekendCollapsed={false} onToggleWeekendCollapse={() => {}} />
    );
    const ev = container.querySelector('.cal-item') as HTMLElement;
    // no inline background at all → opaque fill comes from the CSS palette class
    expect(ev.style.background).toBe('');
    expect(ev.style.backgroundImage).toBe('');
    expect(ev.className).toContain('ev-work');
  });
});

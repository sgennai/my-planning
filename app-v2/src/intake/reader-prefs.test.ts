// The reader's settings on this device: Light until a theme is chosen (2.1), whatever Phase 2 saved.
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, recallPrefs, rememberPrefs, withPrefs } from './reader-prefs';

const KEY = 'my-planning-intake-reader';
const saved = (v: unknown) => localStorage.setItem(KEY, JSON.stringify(v));

describe('the reading theme', () => {
  beforeEach(() => localStorage.clear());

  it('is Light on a device that never chose one', () => {
    expect(recallPrefs()).toEqual(DEFAULT_PREFS);
    expect(recallPrefs().theme).toBe('light');
  });

  it("is Light when Phase 2 saved a Dark it can't tell from the app's, the other settings kept", () => {
    saved({ theme: 'dark', font: 'sans', size: 21, line: 1.6, measure: 640, panel: false });
    expect(recallPrefs()).toEqual({ theme: 'light', themeChosen: false, font: 'sans', size: 21, line: 1.6, measure: 640, panel: false });
  });

  it('keeps a Sepia saved by Phase 2 (only ever chosen) and any theme chosen since', () => {
    saved({ theme: 'sepia' });
    expect(recallPrefs()).toMatchObject({ theme: 'sepia', themeChosen: true });
    saved({ theme: 'dark', themeChosen: true });
    expect(recallPrefs()).toMatchObject({ theme: 'dark', themeChosen: true });
  });

  it('marks a theme set as chosen, and nothing else does', () => {
    const p = recallPrefs();
    expect(withPrefs(p, { size: 22 }).themeChosen).toBe(false);
    const dark = withPrefs(p, { theme: 'dark' });
    expect(dark).toMatchObject({ theme: 'dark', themeChosen: true });
    rememberPrefs(withPrefs(dark, { panel: true }));
    expect(recallPrefs()).toMatchObject({ theme: 'dark', themeChosen: true, panel: true });
  });

  it('falls back to the defaults for what it can\'t read', () => {
    localStorage.setItem(KEY, '{not json');
    expect(recallPrefs()).toEqual(DEFAULT_PREFS);
    saved({ theme: 'purple', themeChosen: true, size: 99 });
    expect(recallPrefs()).toMatchObject({ theme: 'light', themeChosen: false, size: 25 });
  });
});

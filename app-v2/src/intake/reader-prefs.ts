// How the reader looks, on this device only (D11): an iPad and an iPhone want different sizes. The ranges are
// the approved prototype's (intake-reader.html): size 15–25px, line spacing 1.4–2.05, measure 520–870px.
//
// The theme is Paper Sanctuary's Light until you choose another in Aa, whatever the app's own theme (2.1).
// Phase 2 started the reader in the app's theme and saved it with any other setting, so a saved Dark can't
// say whether it was yours: only a theme chosen since then is marked as chosen (`themeChosen`) and kept.
// A saved Sepia was always chosen (the app has none), and stays.
export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans';
export interface ReaderPrefs {
  theme: ReaderTheme;
  /** The theme was chosen in Aa, so it is kept. */
  themeChosen: boolean;
  font: ReaderFont;
  size: number;
  line: number;
  measure: number;
  /** Active Reading open; null until chosen (open where there is room for it beside the text). */
  panel: boolean | null;
}

export const RANGES = {
  size: { min: 15, max: 25, step: 1 },
  line: { min: 1.4, max: 2.05, step: 0.05 },
  measure: { min: 520, max: 870, step: 10 },
} as const;

const KEY = 'my-planning-intake-reader';
export const DEFAULT_PREFS: ReaderPrefs = { theme: 'light', themeChosen: false, font: 'serif', size: 19, line: 1.75, measure: 690, panel: null };

const within = (v: unknown, r: { min: number; max: number }, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d;
const THEMES: readonly unknown[] = ['light', 'sepia', 'dark'];

/** The device's choice; Light until a theme is chosen. */
export function recallPrefs(): ReaderPrefs {
  let p: Partial<ReaderPrefs> = {};
  try { p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ReaderPrefs>; } catch { /* unreadable: the defaults */ }
  const chosen = THEMES.includes(p.theme) && (p.themeChosen === true || p.theme === 'sepia');
  return {
    theme: chosen ? p.theme! : DEFAULT_PREFS.theme,
    themeChosen: chosen,
    font: p.font === 'sans' ? 'sans' : 'serif',
    size: within(p.size, RANGES.size, DEFAULT_PREFS.size),
    line: Math.round(within(p.line, RANGES.line, DEFAULT_PREFS.line) * 100) / 100,
    measure: within(p.measure, RANGES.measure, DEFAULT_PREFS.measure),
    panel: typeof p.panel === 'boolean' ? p.panel : null,
  };
}

/** A change of settings; a theme set here is one you chose. */
export const withPrefs = (p: ReaderPrefs, patch: Partial<ReaderPrefs>): ReaderPrefs =>
  ({ ...p, ...patch, ...(patch.theme ? { themeChosen: true } : {}) });

export function rememberPrefs(p: ReaderPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private browsing: not remembered */ }
}

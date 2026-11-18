// How the reader looks, on this device only (D11): an iPad and an iPhone want different sizes. The ranges are
// the approved prototype's (intake-reader.html): size 15–25px, line spacing 1.4–2.05, measure 520–870px.
export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans';
export interface ReaderPrefs {
  theme: ReaderTheme;
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
export const DEFAULT_PREFS: ReaderPrefs = { theme: 'light', font: 'serif', size: 19, line: 1.75, measure: 690, panel: null };

const within = (v: unknown, r: { min: number; max: number }, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d;

/** The device's choice; on first use the reader takes the app's theme (dark stays dark). */
export function recallPrefs(appDark: boolean): ReaderPrefs {
  let p: Partial<ReaderPrefs> = {};
  try { p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ReaderPrefs>; } catch { /* unreadable: the defaults */ }
  return {
    theme: p.theme === 'light' || p.theme === 'sepia' || p.theme === 'dark' ? p.theme : appDark ? 'dark' : 'light',
    font: p.font === 'sans' ? 'sans' : 'serif',
    size: within(p.size, RANGES.size, DEFAULT_PREFS.size),
    line: Math.round(within(p.line, RANGES.line, DEFAULT_PREFS.line) * 100) / 100,
    measure: within(p.measure, RANGES.measure, DEFAULT_PREFS.measure),
    panel: typeof p.panel === 'boolean' ? p.panel : null,
  };
}

export function rememberPrefs(p: ReaderPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private browsing: not remembered */ }
}

let fontAsked = false;
/** Literata (D6), asked for the first time the reader opens; Georgia until it arrives, or offline. */
export function loadReaderFont() {
  if (fontAsked || typeof document === 'undefined') return;
  fontAsked = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&display=swap';
  document.head.append(link);
}

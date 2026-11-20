// What you were writing in a note (Phase 3), kept on this device until you save it or discard it, so a
// reload, a crash or the app closing in the middle loses nothing. Never synced: it is yours only once saved.
const DRAFTS = 'my-planning-intake-drafts';
/** A draft untouched this many days is let go. */
const DRAFT_DAYS = 30;

function drafts(): Record<string, { text: string; at: number }> {
  try { return JSON.parse(localStorage.getItem(DRAFTS) ?? '{}') ?? {}; } catch { return {}; }
}
export function readDraft(key: string): string | null {
  const d = drafts()[key];
  return d && typeof d.text === 'string' ? d.text : null;
}
export function writeDraft(key: string, text: string | null): void {
  try {
    const all = drafts();
    const old = Date.now() - DRAFT_DAYS * 864e5;
    for (const k of Object.keys(all)) if (!(all[k]?.at > old)) delete all[k];
    if (text === null) delete all[key];
    else all[key] = { text, at: Date.now() };
    localStorage.setItem(DRAFTS, JSON.stringify(all));
  } catch { /* private browsing: not kept */ }
}

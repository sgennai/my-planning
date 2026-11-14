// A field saved as you write it (INT-56: a takeaway's note, the meeting's
// name): what you type shows at once and is saved once you pause, when the
// field loses focus, when the app is hidden and when the field goes away, so
// nothing typed is lost and a word is not a write. A change arriving from
// another device replaces the field only while you have nothing unsaved in it.
import { useCallback, useEffect, useRef, useState } from 'react';

/** A pause this long saves what was typed. */
export const DRAFT_REST_MS = 700;

export function useDraft(saved: string, save: (value: string) => void) {
  const [draft, setDraftState] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);
  // What the field holds as saved: the last value written or adopted.
  const base = useRef(saved);
  const pending = useRef<string | null>(null);
  const timer = useRef(0);
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null || value === base.current) return;
    base.current = value;
    saveRef.current(value);
    setJustSaved(true);
  }, []);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    setJustSaved(false);
    pending.current = value.trim();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, DRAFT_REST_MS);
  }, [flush]);

  // Another device's value, adopted unless something typed here is still unsaved.
  useEffect(() => {
    if (saved === base.current || pending.current !== null) return;
    base.current = saved;
    setDraftState(saved);
  }, [saved]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); flush(); };
  }, [flush]);

  return { draft, setDraft, flush, justSaved };
}

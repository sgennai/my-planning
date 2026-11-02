// A sheet or drawer over the section: focus goes into it as it opens (to
// `first` if given, else its first control), Tab and Shift-Tab stay inside
// it, and focus goes back where it was when it closes, so a keyboard never
// wanders behind it.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, first?: string) {
  useEffect(() => {
    const box = ref.current;
    if (!open || !box) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const start = (first && box.querySelector<HTMLElement>(first)) || controls()[0] || box;
    start.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = controls();
      const at = document.activeElement;
      if (!all.length) { e.preventDefault(); return; }
      if (e.shiftKey && (at === all[0] || !box.contains(at))) { e.preventDefault(); all[all.length - 1].focus(); }
      else if (!e.shiftKey && (at === all[all.length - 1] || !box.contains(at))) { e.preventDefault(); all[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref, open, first]);
}

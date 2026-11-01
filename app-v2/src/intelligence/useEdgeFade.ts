// A row that scrolls sideways fades at an edge only while there is more of it
// that way, and keeps its current item in view. Used by the tabs and by the
// section index.
import { useEffect, useRef, useState } from 'react';

export function useEdgeFade<T extends HTMLElement>(current: string | null) {
  const ref = useRef<T | null>(null);
  const [fade, setFade] = useState({ before: false, after: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setFade(prev => {
      const before = el.scrollLeft > 2;
      const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      return prev.before === before && prev.after === after ? prev : { before, after };
    });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    const item = el?.querySelector<HTMLElement>(`[data-id="${current}"]`);
    if (!el || !item) return;
    if (item.offsetLeft < el.scrollLeft || item.offsetLeft + item.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, item.offsetLeft - 24) });
    }
  }, [current]);

  const className = `${fade.before ? ' fade-before' : ''}${fade.after ? ' fade-after' : ''}`;
  return [ref, className] as const;
}

// The reader's smaller parts: its icons (the prototype's), the lead picture, the appearance popover, the
// contents, and the Active Reading panel. The panel holds what is true now (this article's reading, Keep
// offline, the original) and says plainly that highlights and notes come later: nothing invented.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { RANGES, type ReaderPrefs } from './reader-prefs';
import type { Heading } from './sanitize';
import { imageFor } from './images';

const PATHS = {
  back: <path d="m14 5-7 7 7 7" />,
  contents: <><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="3" cy="6" r=".4" /><circle cx="3" cy="12" r=".4" /><circle cx="3" cy="18" r=".4" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2.6" /><path d="M15 4v16" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  done: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.4 2.5 4.7-5.4" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{PATHS[name]}</svg>;
}

/**
 * The article's lead picture, when it isn't already in its text; nothing when it can't be shown. It appears
 * (and goes, if it fails) inside `steady`, so the text below it doesn't move under your reading line.
 */
export function HeroImage({ src, sigOf, keptBy, steady }: { src: string; sigOf: (url: string) => Promise<string | null>; keptBy: RefObject<number | undefined>; steady: (change: () => void) => void }) {
  const [shown, setShown] = useState<{ url: string; direct: boolean } | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    void sigOf(src).then(sig => imageFor(src, { keptBy: keptBy.current, sig })).then(r => {
      if (!alive) return;
      if ('blob' in r) made = URL.createObjectURL(r.blob);
      else if (r.missing === 'offline' || navigator.onLine === false) return;
      const next = { url: made ?? src, direct: !made };
      steady(() => flushSync(() => setShown(next)));
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [src, sigOf, keptBy, steady]);
  if (!shown) return null;
  return (
    <div className="ikr-hero">
      <img src={shown.url} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => steady(() => flushSync(() => setShown(null)))} />
    </div>
  );
}

/** Focus goes in when it opens and back to what opened it when it closes. */
function useFocusIn(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button, input, a[href]')?.focus();
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, [box]);
}

export function Appearance({ prefs, onChange, onClose }: { prefs: ReaderPrefs; onChange: (p: Partial<ReaderPrefs>) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusIn(box);
  const seg = <K extends 'theme' | 'font'>(key: K, value: ReaderPrefs[K], label: string) => (
    <button type="button" className="ikr-seg" aria-pressed={prefs[key] === value} onClick={() => onChange({ [key]: value } as Partial<ReaderPrefs>)}>{label}</button>
  );
  const range = (key: 'size' | 'line' | 'measure', label: string, shown: string) => (
    <label className="ikr-range">
      <span className="ikr-range-label"><span>{label}</span><output>{shown}</output></span>
      <input type="range" min={RANGES[key].min} max={RANGES[key].max} step={RANGES[key].step} value={prefs[key]}
        onChange={e => onChange({ [key]: Number(e.target.value) } as Partial<ReaderPrefs>)} />
    </label>
  );
  return (
    <div className="ikr-pop ikr-appearance" id="ikr-appearance" role="dialog" aria-label="Reading appearance" ref={box}>
      <div className="ikr-pop-head">
        <h2>Reading appearance</h2>
        <button type="button" className="ikr-close" onClick={onClose} aria-label="Close reading appearance"><Icon name="close" /></button>
      </div>
      <p className="ikr-set-label" id="ikr-theme-label">Reader theme</p>
      <div className="ikr-segs" role="group" aria-labelledby="ikr-theme-label">{seg('theme', 'light', 'Light')}{seg('theme', 'sepia', 'Sepia')}{seg('theme', 'dark', 'Dark')}</div>
      <p className="ikr-set-label" id="ikr-font-label">Text type</p>
      <div className="ikr-segs" role="group" aria-labelledby="ikr-font-label">{seg('font', 'serif', 'Serif')}{seg('font', 'sans', 'Sans-serif')}</div>
      {range('size', 'Font size', `${prefs.size}px`)}
      {range('line', 'Line spacing', prefs.line.toFixed(2))}
      {range('measure', 'Text measure', `${prefs.measure}px`)}
      <p className="ikr-pop-note">Kept on this device only.</p>
    </div>
  );
}

export function Contents({ headings, onGo, onClose }: { headings: Heading[]; onGo: (id: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusIn(box);
  let n = 0;
  return (
    <div className="ikr-pop ikr-contents" id="ikr-contents" role="dialog" aria-label="Contents" ref={box}>
      <div className="ikr-pop-head">
        <h2>On this page</h2>
        <button type="button" className="ikr-close" onClick={onClose} aria-label="Close contents"><Icon name="close" /></button>
      </div>
      <ol className="ikr-toc">
        {headings.map(h => (
          <li key={h.id} className={h.level === 3 ? 'is-sub' : undefined}>
            <button type="button" onClick={() => onGo(h.id)}>
              {h.level === 2 && <span aria-hidden>{String(++n).padStart(2, '0')}</span>}{h.text}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface PanelProps {
  overlay: boolean;
  onClose: () => void;
  progress: number;
  minutes: number | null;
  status: 'unread' | 'progress' | 'finished';
  saved: number | null;
  keep: boolean;
  keepBusy: boolean;
  keepNote: string | null;
  onKeep: () => void;
  canKeep: boolean;
  url: string | null;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ActiveReading(p: PanelProps) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!p.overlay) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.ikr-close')?.focus();
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, [p.overlay]);
  const left = p.minutes ? Math.max(0, Math.round(p.minutes * (1 - p.progress))) : null;
  return (
    <aside className="ikr-panel" id="ikr-panel" aria-label="Active Reading" ref={box} {...(p.overlay ? { role: 'dialog', 'aria-modal': true } : {})}>
      <div className="ikr-panel-head">
        <p className="ikr-eyebrow">Active reading</p>
        <button type="button" className="ikr-close" onClick={p.onClose} aria-label="Hide Active Reading"><Icon name="close" /></button>
      </div>
      <section className="ikr-card" aria-labelledby="ikr-card-article">
        <h2 className="ikr-card-title" id="ikr-card-article">This article</h2>
        <dl className="ikr-facts">
          <div><dt>Status</dt><dd>{p.status === 'finished' ? 'Finished' : p.status === 'progress' ? 'In progress' : 'Unread'}</dd></div>
          <div><dt>Read</dt><dd>{Math.round(p.progress * 100)}%{left !== null && p.status !== 'finished' && p.progress > 0.02 ? ` · about ${left} min left` : ''}</dd></div>
          {p.minutes && <div><dt>Length</dt><dd>{p.minutes} min</dd></div>}
          {p.saved && <div><dt>Saved</dt><dd>{DAY.format(new Date(p.saved * 1000))}</dd></div>}
        </dl>
        <button type="button" className={`ikr-switch${p.keep ? ' is-on' : ''}`} role="switch" aria-checked={p.keep} onClick={p.onKeep} disabled={p.keepBusy || !p.canKeep}>
          <span className="ikr-switch-track" aria-hidden><span /></span>Keep offline
        </button>
        {p.keepNote && <p className="ikr-card-note" role="status">{p.keepNote}</p>}
        {p.url && <a className="ikr-card-link" href={p.url} target="_blank" rel="noopener noreferrer">Open original<span aria-hidden> ↗</span></a>}
      </section>
      <section className="ikr-card" aria-labelledby="ikr-card-notes">
        <h2 className="ikr-card-title" id="ikr-card-notes">Highlights and notes</h2>
        <p className="ikr-card-text">Highlighting, notes and Save to Takeaways come with the next part of Intake.</p>
      </section>
      <p className="ikr-footnote">Your place and Finished follow you to your other devices. How the reader looks stays on this one.</p>
    </aside>
  );
}

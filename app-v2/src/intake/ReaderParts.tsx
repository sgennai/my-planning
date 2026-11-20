// The reader's smaller parts: its icons (the prototype's), the lead picture, a picture full size, the
// appearance popover, the contents, and the Active Reading panel. The panel holds this article's reading,
// Keep offline and the original, then your highlights and notes (Phase 3, ReaderNotes.tsx): only what is
// there, nothing invented.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { RANGES, type ReaderPrefs } from './reader-prefs';
import type { Heading } from './sanitize';
import { imageFor } from './images';
import { EXPAND_PATH, isTall, nextFrame } from './reader-images';

const PATHS = {
  back: <path d="m14 5-7 7 7 7" />,
  contents: <><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="3" cy="6" r=".4" /><circle cx="3" cy="12" r=".4" /><circle cx="3" cy="18" r=".4" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2.6" /><path d="M15 4v16" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  done: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.4 2.5 4.7-5.4" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  expand: <path d={EXPAND_PATH} />,
  // The prototype's highlighter; a note; Takeaways' bookmark.
  highlight: <path d="m3 20 4-1 12-12-3-3L4 16z M14 6l3 3M9 21h12" />,
  note: <><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4" /></>,
  takeaway: <path d="M7 4h10v16l-5-3.6L7 20z" />,
};
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{PATHS[name]}</svg>;
}

/**
 * The article's lead picture, when it isn't already in its text; nothing when it can't be shown. Never cropped
 * (2.1): decoded off the page first so its size is known, then shown whole, in its own shape, inside `steady`,
 * so the text below it doesn't move under your reading line.
 */
export function HeroImage({ src, sigOf, keptBy, steady }: { src: string; sigOf: (url: string) => Promise<string | null>; keptBy: RefObject<number | undefined>; steady: (change: () => void) => void }) {
  const [shown, setShown] = useState<{ url: string; direct: boolean; w: number; h: number } | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    void sigOf(src).then(sig => imageFor(src, { keptBy: keptBy.current, sig })).then(async r => {
      if (!alive) return;
      if ('blob' in r) made = URL.createObjectURL(r.blob);
      else if (r.missing === 'offline' || navigator.onLine === false) return;
      const url = made ?? src;
      const probe = new Image();
      if (!made) probe.referrerPolicy = 'no-referrer';
      probe.src = url;
      await probe.decode().catch(() => undefined);
      await nextFrame();
      if (!alive) return;
      const next = { url, direct: !made, w: probe.naturalWidth, h: probe.naturalHeight };
      steady(() => flushSync(() => setShown(next)));
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [src, sigOf, keptBy, steady]);
  if (!shown) return null;
  const { w, h } = shown;
  return (
    <div className="ikr-hero">
      <img
        src={shown.url} alt="" decoding="async" referrerPolicy="no-referrer"
        width={w || undefined} height={h || undefined} style={w && h ? { '--ikr-r': +(w / h).toFixed(4) } as CSSProperties : undefined}
        onError={() => steady(() => flushSync(() => setShown(null)))}
      />
      {w > 0 && isTall(w, h) && <button type="button" className="ikr-whole"><Icon name="expand" />View full size</button>}
    </div>
  );
}

export interface Viewing {
  src: string;
  alt: string;
  caption: string | null;
  /** From the publisher directly (no copy on the device): sent without a referrer, as in the text. */
  direct: boolean;
  /** Where the focus goes back to. */
  from: HTMLElement | null;
}

/**
 * A picture full size, over everything (a modal <dialog>, in the top layer): as wide as the screen allows and
 * no wider than itself, scrolling down a tall one, its description and caption kept. Close, Escape or a tap
 * beside it closes it. It changes nothing in the article, so your place stays where it was.
 */
export function PictureViewer({ pic, onClose }: { pic: Viewing; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = box.current;
    if (!d) return;
    d.showModal();
    d.scrollTop = 0;
    d.focus({ preventScroll: true }); // the dialog itself (named by its picture), Close next
    const from = pic.from;
    return () => {
      if (d.open) d.close();
      if (from?.isConnected) from.focus({ preventScroll: true });
    };
  }, [pic]);
  return (
    <dialog
      ref={box} className="ikr-viewer" tabIndex={-1} aria-label={pic.alt ? `Picture: ${pic.alt}` : 'Picture, full size'}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget || (e.target as Element).classList.contains('ikr-viewer-pic')) onClose(); }}
    >
      <div className="ikr-viewer-bar">
        <span className="ikr-caption">{pic.alt || 'Full size'}</span>
        <button type="button" className="ikr-icon" onClick={onClose} aria-label="Close the picture" title="Close"><Icon name="close" /></button>
      </div>
      <figure className="ikr-viewer-pic">
        <img src={pic.src} alt={pic.alt} referrerPolicy={pic.direct ? 'no-referrer' : undefined} />
        {pic.caption && <figcaption>{pic.caption}</figcaption>}
      </figure>
    </dialog>
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
  /** "2 highlights · 1 note · 1 in Takeaways", or nothing yet. */
  summary: string | null;
  /** Your reading notes, and Keep what matters (ReaderNotes.tsx). */
  children: ReactNode;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ActiveReading(p: PanelProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.overlay) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.ikr-close')?.focus();
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, [p.overlay]);
  const left = p.minutes ? Math.max(0, Math.round(p.minutes * (1 - p.progress))) : null;
  // Beside the text, a complementary region; over it, a dialog (which an <aside> may not be).
  const Box = p.overlay ? 'div' : 'aside';
  return (
    <Box className="ikr-panel" id="ikr-panel" aria-label="Active Reading" ref={box} {...(p.overlay ? { role: 'dialog', 'aria-modal': true } : {})}>
      <div className="ikr-panel-head">
        <div>
          <p className="ikr-eyebrow">Active reading</p>
          {p.summary && <p className="ikr-summary">{p.summary}</p>}
        </div>
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
      {p.children}
      <p className="ikr-footnote">Your place, Finished, highlights and notes follow you to your other devices. How the reader looks stays on this one.</p>
    </Box>
  );
}

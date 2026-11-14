// The Intelligence section's top navigation (INT-54), after the approved
// prototype `intelligence-mist-gradient-selected-ink.html`, one for every view:
// a mist band with folder tabs, the three feeds on the left, Today and
// Takeaways apart on the right with the tools (search, refresh). The selected
// tab takes the colour of what lies under it (`--intel-nav-sheet`: the memo's
// band, else the page) and carries the ink edge; the labels are words only.
// One tablist across both groups: one Tab stop, arrows, Home and End move
// along it, Enter or Space opens. When the row is too wide for the screen (a
// phone, a large text size) it scrolls sideways, fading at an edge with more,
// and keeps the selected tab in view (`useEdgeFade`, the screen's).
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';

export interface NavTab<V extends string> {
  id: V;
  label: string;
  /** A quiet count after the label (Takeaways). */
  count?: number;
}

interface Props<V extends string> {
  /** The three feeds, the primary destinations. */
  feeds: NavTab<V>[];
  /** Today and Takeaways. */
  more: NavTab<V>[];
  /** The open view: none of the tabs while searching. */
  view: string;
  onOpen: (id: V) => void;
  /** The ids that tie a tab to the panel it names. */
  tabId: (id: V) => string;
  panel: string;
  tabsRef: RefObject<HTMLDivElement | null>;
  /** `useEdgeFade`'s classes for the row. */
  fade: string;
  /** Before the tabs (the Editions button of a feed read as a brief, portrait). */
  lead?: ReactNode;
  /** After them: search, refresh. */
  tools: ReactNode;
  inert?: boolean;
}

/** Arrow keys, Home and End move between the tabs; Enter or Space opens one. */
function moveAmongTabs(e: ReactKeyboardEvent<HTMLDivElement>) {
  const step = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 }[e.key];
  if (step === undefined) return;
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = tabs.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + step + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[next]?.focus();
}

export function IntelligenceNav<V extends string>({ feeds, more, view, onOpen, tabId, panel, tabsRef, fade, lead, tools, inert }: Props<V>) {
  // One tab is in the Tab order: the open one, else the first.
  const all = [...feeds, ...more];
  const stop = all.some(t => t.id === view) ? view : all[0]?.id;
  const tab = (t: NavTab<V>, secondary: boolean) => (
    <button
      key={t.id}
      id={tabId(t.id)}
      type="button"
      role="tab"
      data-id={t.id}
      className={`intel-nav-tab${secondary ? ' intel-nav-tab--more' : ''}`}
      aria-selected={t.id === view}
      aria-controls={t.id === view ? panel : undefined}
      tabIndex={t.id === stop ? 0 : -1}
      onClick={() => onOpen(t.id)}
    >
      {t.label}
      {!!t.count && <span className="intel-nav-count"><span className="intel-vh">, </span>{t.count}</span>}
    </button>
  );
  return (
    <div className="intel-nav" inert={inert || undefined}>
      {lead}
      <div className={`intel-nav-tabs${fade}`} role="tablist" aria-label="Intelligence" ref={tabsRef} onKeyDown={moveAmongTabs}>
        <div className="intel-nav-feeds">{feeds.map(t => tab(t, false))}</div>
        <div className="intel-nav-more">{more.map(t => tab(t, true))}</div>
      </div>
      <div className="intel-nav-tools">{tools}</div>
    </div>
  );
}

// The shared application shell — one navigation surface for all six sections.
//
// A floating near-black pill: vertical at the left in landscape, horizontal at
// the foot in portrait. It floats over the content rather than taking a
// column, so the Routine grid gets the full width of the iPad.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconSun, IconMoon, IconCog, IconExit, IconAlert } from './icons';
import { NAV, type AppPage } from './nav';
import type { UserProfile } from '../storage/types';

function formatLastSynced(at: Date | null): string {
  if (!at) return 'never synced';
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (at.toDateString() === new Date().toDateString()) return `today ${hhmm}`;
  return `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${hhmm}`;
}

/**
 * Measures the active nav button and drives the sliding indicator from its
 * real geometry — the pill is laid out differently per orientation, so a
 * hardcoded offset would be wrong in one of them.
 */
function useNavIndicator(appPage: AppPage) {
  const navRef = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const active = nav.querySelector<HTMLElement>('.shell-nav-item.on');
      if (!active) return;
      const a = active.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      setBox({ x: a.left - n.left, y: a.top - n.top, w: a.width, h: a.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    window.addEventListener('orientationchange', measure);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', measure); };
  }, [appPage]);

  return { navRef, box };
}

interface ShellData {
  userProfile?: UserProfile;
  createdAt?: string;
}

interface Props {
  appPage: AppPage;
  onNavigate: (page: AppPage) => void;
  data: ShellData | null;
  theme: string;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  syncError?: Error | null;
  lastSyncedAt: Date | null;
  onRetrySync: () => void;
  children: ReactNode;
}

export function AppShell({
  appPage, onNavigate, theme, onToggleTheme, onOpenSettings, onSignOut,
  syncError, lastSyncedAt, onRetrySync, children,
}: Props) {
  const isDark = theme === 'dark';
  const { navRef, box } = useNavIndicator(appPage);

  return (
    <div className="shell">
      <main className="shell-main">{children}</main>

      <div className="shell-utils">
        <button
          className="ds-icon-btn"
          onClick={onToggleTheme}
          role="switch"
          aria-checked={isDark}
          aria-label="Dark theme"
        >{isDark ? <IconMoon /> : <IconSun />}</button>
        <button className="ds-icon-btn" onClick={onOpenSettings} aria-label="Settings"><IconCog /></button>
        <button className="ds-icon-btn" onClick={onSignOut} aria-label="Sign out"><IconExit /></button>
        {/* Sync trouble lives in the utility cluster rather than floating over
            the dashboard — on a screen tuned to fit every tile exactly, a
            toast is a tile you can no longer read. */}
        {syncError && (
          <button
            className="ds-icon-btn shell-sync-btn"
            onClick={onRetrySync}
            title={`Sync unavailable — last synced ${formatLastSynced(lastSyncedAt)}. Tap to retry.`}
            aria-label={`Sync unavailable, last synced ${formatLastSynced(lastSyncedAt)}. Retry now.`}
          ><IconAlert /></button>
        )}
      </div>

      <nav className="shell-nav" aria-label="Sections" ref={navRef}>
        {box && (
          <span
            className="shell-nav-ind"
            aria-hidden
            style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, left: 0, top: 0 }}
          />
        )}
        {NAV.map(({ page, label, Icon }) => (
          <button
            key={page}
            className={`shell-nav-item${appPage === page ? ' on' : ''}`}
            onClick={() => onNavigate(page)}
            aria-current={appPage === page ? 'page' : undefined}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}

        {/* In landscape the utilities ride at the foot of the pill, which
            keeps them off the dashboard header. In portrait the pill is a
            horizontal bar with no room for them, so the floating cluster
            above takes over — only one of the two is ever visible. */}
        <div className="shell-nav-utils">
          <button
            className="shell-nav-util"
            onClick={onToggleTheme}
            role="switch"
            aria-checked={isDark}
            aria-label="Dark theme"
          >{isDark ? <IconMoon /> : <IconSun />}</button>
          <button className="shell-nav-util" onClick={onOpenSettings} aria-label="Settings"><IconCog /></button>
          <button className="shell-nav-util" onClick={onSignOut} aria-label="Sign out"><IconExit /></button>
          {syncError && (
            <button
              className="shell-nav-util is-alert"
              onClick={onRetrySync}
              aria-label={`Sync unavailable, last synced ${formatLastSynced(lastSyncedAt)}. Retry now.`}
            ><IconAlert /></button>
          )}
        </div>
      </nav>
    </div>
  );
}

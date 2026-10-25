// The shared application shell — one navigation surface for all six sections.
//
// Landscape on a large screen gets a side rail; everything else gets a bottom
// tab bar with all six destinations present, so no section is ever more than
// one tap away and none of them is a dead end. Routine is first and is the
// default landing page.
import type { ReactNode } from 'react';
import { useClock } from './useClock';
import { IconSun, IconMoon, IconCog, IconExit } from './icons';
import { NAV, type AppPage } from './nav';
import type { UserProfile } from '../storage/types';

// ── North Star: read-only derivation, never writes ──────────────────────
function parseDeadline(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const q = s.match(/Q([1-4])\s*[\s/-]?\s*(\d{4})/i);
  if (q) return new Date(Number(q[2]), Number(q[1]) * 3, 0); // last day of the quarter
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function NorthStar({ profile, createdAt }: { profile?: UserProfile | null; createdAt: string | null }) {
  // Months-remaining depends on "now", which is an external source — read it
  // through a subscription rather than calling Date.now() mid-render.
  const now = useClock(60 * 60 * 1000);

  const role = profile?.targetRoles?.[0] || '';
  const deadlineRaw = profile?.switchDeadline || '';
  const deadline = parseDeadline(deadlineRaw);

  if (!role && !deadlineRaw) {
    return (
      <div className="shell-star">
        <div className="ds-eyebrow">North Star</div>
        <div className="role" style={{ color: 'var(--ink-3)' }}>Set your goal in Setup</div>
      </div>
    );
  }

  let when = deadlineRaw;
  let pct: number | null = null;
  if (deadline) {
    const monthsLeft = Math.max(0, Math.round((deadline.getTime() - now) / (1000 * 60 * 60 * 24 * 30.44)));
    when = `${deadlineRaw} · ~${monthsLeft} mo`;
    const start = createdAt ? Date.parse(createdAt) : NaN;
    if (!Number.isNaN(start) && deadline.getTime() > start) {
      pct = Math.min(100, Math.max(0, Math.round(((now - start) / (deadline.getTime() - start)) * 100)));
    }
  }

  return (
    <div className="shell-star">
      <div className="ds-eyebrow">North Star</div>
      <div className="role">{role || 'Your North Star'}</div>
      <div className="meta">
        <span>{when}</span>
        {pct != null && <span className="pct">{pct}%</span>}
      </div>
      <div className="ds-meter"><i style={{ width: `${pct ?? 8}%` }} /></div>
    </div>
  );
}

function formatLastSynced(at: Date | null): string {
  if (!at) return 'never synced';
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (at.toDateString() === new Date().toDateString()) return `today ${hhmm}`;
  return `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${hhmm}`;
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
  appPage, onNavigate, data, theme, onToggleTheme, onOpenSettings, onSignOut,
  syncError, lastSyncedAt, onRetrySync, children,
}: Props) {
  const isDark = theme === 'dark';

  const syncStrip = syncError ? (
    <div className="shell-sync">
      <span>Sync unavailable</span>
      <button onClick={onRetrySync}>Retry</button>
      <span style={{ opacity: .75 }}>Last synced {formatLastSynced(lastSyncedAt)}</span>
    </div>
  ) : null;

  return (
    <div className="shell">
      <aside className="shell-rail">
        <div className="shell-brand">
          <div className="mark" aria-hidden>P</div>
          <div className="name">My Planning</div>
        </div>

        <nav className="shell-nav" aria-label="Sections">
          {NAV.map(({ page, label, Icon }) => (
            <button
              key={page}
              className={`shell-nav-item${appPage === page ? ' on' : ''}`}
              onClick={() => onNavigate(page)}
              aria-current={appPage === page ? 'page' : undefined}
            >
              <Icon />{label}
            </button>
          ))}
        </nav>

        <NorthStar profile={data?.userProfile} createdAt={data?.createdAt ?? null} />

        <div className="shell-foot">
          {syncStrip}
          <div className="shell-foot-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {isDark ? <IconMoon style={{ width: 16, height: 16 }} /> : <IconSun style={{ width: 16, height: 16 }} />}
              {isDark ? 'Dark' : 'Light'}
            </span>
            <button
              className={`shell-switch${isDark ? ' on' : ''}`}
              onClick={onToggleTheme}
              role="switch"
              aria-checked={isDark}
              aria-label="Dark theme"
            ><i /></button>
          </div>
          <button className="shell-link" onClick={onOpenSettings}><IconCog />Settings</button>
          <button className="shell-link danger" onClick={onSignOut}><IconExit />Sign out</button>
        </div>
      </aside>

      <main className="shell-main">{children}</main>

      {/* Utilities, for when there is no rail to hold them. */}
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
      </div>

      {syncError && (
        <div className="shell-sync shell-sync--float">
          <span>Sync unavailable</span>
          <button onClick={onRetrySync}>Retry</button>
          <span style={{ opacity: .75 }}>Last synced {formatLastSynced(lastSyncedAt)}</span>
        </div>
      )}

      <nav className="shell-tabs" aria-label="Sections">
        {NAV.map(({ page, label, Icon }) => (
          <button
            key={page}
            className={`shell-tab${appPage === page ? ' on' : ''}`}
            onClick={() => onNavigate(page)}
            aria-current={appPage === page ? 'page' : undefined}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

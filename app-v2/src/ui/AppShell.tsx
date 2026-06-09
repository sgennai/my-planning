// @ts-nocheck
// Shared application shell — the single navigation surface for every screen.
// Desktop: left sidebar (brand · North Star · nav · theme/settings/sign-out).
// Mobile (≤880px): bottom tab bar + a small fixed utility cluster.
// Visual spec: design/my-planning-design-reference.html
import React from 'react';

// ── nav icons (from the design reference) ──────────────────────────────
const IconPlan = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
);
const IconPractice = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l8 4v6c0 4-3 6-8 8-5-2-8-4-8-8V7z" /></svg>
);
const IconIntake = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16M4 12h16M4 19h10" /></svg>
);
const IconCreate = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
const IconSetup = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z" /></svg>
);
const IconSun = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
);
const IconMoon = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
const IconCog = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z" /></svg>
);
const IconExit = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
);

const NAV = [
  { page: 'calendar', label: 'Plan', Icon: IconPlan },
  { page: 'practice', label: 'Practice', Icon: IconPractice },
  { page: 'intake', label: 'Intake', Icon: IconIntake },
  { page: 'create', label: 'Create', Icon: IconCreate },
  { page: 'modules', label: 'Setup', Icon: IconSetup },
];

// ── North Star derivation — read-only, never writes data ────────────────
function parseDeadline(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const q = s.match(/Q([1-4])\s*[\s/-]?\s*(\d{4})/i);
  if (q) {
    const quarter = Number(q[1]);
    const year = Number(q[2]);
    return new Date(year, quarter * 3, 0); // last day of the quarter
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function NorthStar({ profile, createdAt }) {
  const role = (profile && profile.targetRoles && profile.targetRoles[0]) || '';
  const deadlineRaw = (profile && profile.switchDeadline) || '';
  const deadline = parseDeadline(deadlineRaw);

  let when = deadlineRaw;
  let pct = null;
  if (deadline) {
    const now = Date.now();
    const monthsLeft = Math.max(0, Math.round((deadline.getTime() - now) / (1000 * 60 * 60 * 24 * 30.44)));
    when = `${deadlineRaw} · ~${monthsLeft} mo`;
    const start = createdAt ? Date.parse(createdAt) : NaN;
    if (!Number.isNaN(start) && deadline.getTime() > start) {
      pct = Math.min(100, Math.max(0, Math.round(((now - start) / (deadline.getTime() - start)) * 100)));
    }
  }

  if (!role && !deadlineRaw) {
    return (
      <div className="northstar">
        <div className="ns-eb">North Star</div>
        <div className="ns-role" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>Set your goal in Setup</div>
      </div>
    );
  }

  return (
    <div className="northstar">
      <div className="ns-eb">North Star</div>
      <div className="ns-role">{role || 'Your North Star'}</div>
      <div className="ns-meta">
        {when ? <span className="ns-when">{when}</span> : <span />}
        {pct != null ? <span className="ns-pct">{pct}%</span> : <span />}
      </div>
      <div className="ns-bar"><i style={{ width: `${pct != null ? pct : 8}%` }} /></div>
    </div>
  );
}

export function AppShell({ appPage, onNavigate, data, theme, onToggleTheme, onOpenSettings, onSignOut, children }) {
  const isDark = theme === 'dark';
  const profile = (data && data.userProfile) || null;
  const createdAt = (data && data.createdAt) || null;

  return (
    <div className="app-shell">
      {/* ── desktop sidebar ── */}
      <aside className="shell-side">
        <div className="shell-brand">
          <div className="mk">P</div>
          <div className="nm">My Planning</div>
        </div>

        <NorthStar profile={profile} createdAt={createdAt} />

        <nav className="shell-nav">
          {NAV.map(({ page, label, Icon }) => (
            <button
              key={page}
              className={`shell-nl${appPage === page ? ' on' : ''}`}
              onClick={() => onNavigate(page)}
              aria-current={appPage === page ? 'page' : undefined}
            >
              <Icon />{label}
            </button>
          ))}
        </nav>

        <div className="shell-foot">
          <div className="shell-controls">
            <span className="ctl">{isDark ? <IconMoon /> : <IconSun />}{isDark ? 'Dark' : 'Light'}</span>
            <button
              className={`shell-toggle${isDark ? ' on' : ''}`}
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            ><i /></button>
          </div>
          <button className="shell-foot-link" onClick={onOpenSettings}>Settings</button>
          <button className="shell-foot-link danger" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      {/* ── page content ── */}
      <main className="shell-main">{children}</main>

      {/* ── mobile utility cluster (theme / settings / sign-out) ── */}
      <div className="shell-mobile-utils">
        <button onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">{isDark ? <IconMoon /> : <IconSun />}</button>
        <button onClick={onOpenSettings} aria-label="Settings" title="Settings"><IconCog /></button>
        <button onClick={onSignOut} aria-label="Sign out" title="Sign out"><IconExit /></button>
      </div>

      {/* ── mobile bottom tab bar ── */}
      <nav className="shell-tabs">
        {NAV.map(({ page, label, Icon }) => (
          <button
            key={page}
            className={`shell-tab${appPage === page ? ' on' : ''}`}
            onClick={() => onNavigate(page)}
            aria-current={appPage === page ? 'page' : undefined}
          >
            <Icon />{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

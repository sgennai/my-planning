// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { SCHEMA_VERSION, SEED_ROUTINE, SEED_PROJECTS, SEED_REFERENCE_LIBRARY, SEED_PRACTICE_CONTENT } from './storage/data';
import { migrate } from './storage/migrations';
import { PracticeScreen } from './practice/PracticeScreen';
import { CalendarScreen } from './calendar/CalendarScreen';
import { ModuleDashboard } from './modules/ModuleDashboard';
import { IntakeScreen } from './intake/IntakeScreen';
import { CreateScreen } from './create/CreateScreen';
import { loadData, saveData, syncData } from './storage/db';
import { DEFAULT_MODULES } from './modules/seed-modules';

// DEFAULT DATA + MIGRATION
// ═════════════════════════════════════════════════════════════
export function makeDefaultData() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    lastModified: now,
    routine: SEED_ROUTINE,
    overrides: {},
    calendars: { workIcs: '', householdIcs: '', proxyUrl: '', syncUrl: '', syncSecret: '', workColor: '#8C8C96', householdColor: '#7896AF' },
    weeklyResets: [],
    projects: SEED_PROJECTS,
    scheduledBlocks: [],
    referenceLibrary: SEED_REFERENCE_LIBRARY,
    inbox: [],
    elsewhereToggles: { morning: false, afternoon: false, allDay: false, date: null },
    todos: [],
    completedActions: [],
    practiceContent: SEED_PRACTICE_CONTENT,
    interviewPrep: { categories: [], questions: [], stories: [] },
    routineCompletions: {},
    weather: { lat: null, lon: null, label: '', source: 'unset' },
    prefs: {
      theme: 'light',
      categoryColors: {},
      categoryEmojis: {},
      categoryLabels: {},
      todayView: 'timeline',
      lunchSlot: { start: '12:30', duration: 60 },
      nowLineColor: '',
      miniMonthTodayColor: '',
      nowEventColor: '',
      userCategories: {},
    },
    userProfile: {
      id: 'singleton-user-profile',
      targetRoles: [],
      competencyFramework: [],
      positioningThesis: '',
      industries: [],
      geos: [],
      switchDeadline: '',
    },
    modules: DEFAULT_MODULES,
    learning: [],
    content: [],
    create: { ideas: [], posts: [] },
    progressLog: [],
    featureFlags: {},
  };
}



// ═════════════════════════════════════════════════════════════
// HOOKS
// ═════════════════════════════════════════════════════════════
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mm = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mm.addEventListener('change', handler);
    return () => mm.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function useTickingClock(intervalMs = 60000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ═════════════════════════════════════════════════════════════
// APP ROOT
// ═════════════════════════════════════════════════════════════
export function App() {
  const [phase, setPhase] = useState('booting');
  const [error, setError] = useState('');
  const [fileId, setFileId] = useState(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [appPage, setAppPage] = useState('calendar');
  const [pendingCalAction, setPendingCalAction] = useState(null);
  const [remoteConflicts, setRemoteConflicts] = useState([]);

  // Apply theme to <html data-theme="..."> whenever data.prefs.theme changes.
  // Default to 'light' before data loads so the boot/sign-in screens use the right palette.
  useEffect(() => {
    const theme = (data && data.prefs && data.prefs.theme) || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, [data]);

  const loadOrCreate = useCallback(async () => {
    setPhase('loading');
    try {
      const existing = await loadData();
      if (existing) {
        const { data: migrated, migrated: didMigrate } = migrate(existing);
        setData(migrated);
        setLastSyncedAt(new Date());
        if (didMigrate) {
          migrated.lastModified = new Date().toISOString();
          await saveData(migrated);
        }
      } else {
        const fresh = makeDefaultData();
        await saveData(fresh);
        setData(fresh);
        setLastSyncedAt(new Date());
      }
      setPhase('ready');
    } catch (e) {
      setError(`Load failed: ${e.message}`);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadOrCreate();
      } catch (e) {
        setError(`Init failed: ${e.message}`);
        setPhase('error');
      }
    })();
  }, [loadOrCreate]);

  const runBackgroundSync = useCallback(async () => {
    if (!data?.calendars?.syncUrl || !data?.calendars?.syncSecret) return;
    try {
      const changedEntities = await syncData(data.calendars.syncUrl, data.calendars.syncSecret);
      
      const freshData = await loadData() || data;
      const { mergePracticeContent } = await import('./practice/content-loader');
      const { mergeIntakeContent } = await import('./intake/intake-loader');
      let didContentChange = false;
      if (freshData) {
        if (mergePracticeContent(freshData)) didContentChange = true;
        if (mergeIntakeContent(freshData)) didContentChange = true;
      }
      
      if (changedEntities.length > 0 || didContentChange) {
        if (freshData) {
          if (didContentChange) {
            freshData.lastModified = new Date().toISOString();
            await saveData(freshData);
          }
          setData(freshData);
          
          // Only show notice if the user is actively editing a text field right now
          const activeTag = document.activeElement ? document.activeElement.tagName : '';
          const isActivelyEditing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
          
          if (isActivelyEditing) {
            setRemoteConflicts(prev => {
              const newConflicts = new Set(prev);
              for (const ce of changedEntities) newConflicts.add(ce.id);
              return Array.from(newConflicts);
            });
          }
        }
      }
    } catch (e) {
      console.error('Background sync failed silently:', e);
    }
  }, [data?.calendars?.syncUrl, data?.calendars?.syncSecret]);

  // Boot, Focus, Online triggers
  useEffect(() => {
    if (phase === 'ready' && data) {
      runBackgroundSync();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready' || !data) return;
    const onFocus = () => runBackgroundSync();
    const onOnline = () => runBackgroundSync();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [phase, data, runBackgroundSync]);

  const persist = useCallback(async (nextData) => {
    setData(nextData); // optimistic — render reflects change immediately
    setSaving(true);
    setError('');
    // Clear conflicts when we save, as we've presumably reconciled locally
    setRemoteConflicts([]);
    try {
      await saveData(nextData);
      setLastSyncedAt(new Date());
      
      // Debounce push
      if (window._syncTimeout) clearTimeout(window._syncTimeout);
      window._syncTimeout = setTimeout(() => {
        runBackgroundSync();
      }, 2000);

    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [runBackgroundSync]);

  const handleSignIn = async () => {
    setPhase('ready');
  };
  const handleSignOut = async () => {
    setPhase('signin');
  };
  const handleReload = async () => {
    setError('');
    await loadOrCreate();
  };

  if (phase === 'booting')
    return <Centered><span className="pulse" /><span>Initializing</span></Centered>;
  if (phase === 'loading')
    return <Centered><span className="pulse" /><span>Loading from IndexedDB</span></Centered>;
  if (phase === 'error')
    return <ErrorScreen message={error} onRetry={() => setPhase('signin')} />;
  if (phase === 'signin')
    return <SignInScreen onSignIn={handleSignIn} error={error} />;

  const hasConflict = remoteConflicts.length > 0;
  const conflictNotice = hasConflict && (
    <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Updated elsewhere</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Changes synced from another device.</div>
      </div>
      <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setRemoteConflicts([])}>Dismiss</button>
    </div>
  );

  if (appPage === 'modules') {
    return (
      <>
        <ModuleDashboard
          data={data}
          onPersist={persist}
          onClose={() => setAppPage('calendar')}
        />
        {conflictNotice}
      </>
    );
  }

  if (appPage === 'intake') {
    return (
      <div className="app-layout">
        <IntakeScreen
          data={data}
          onPersist={persist}
          onClose={() => setAppPage('calendar')}
          onScheduleBlock={(block) => {
            setPendingCalAction({ type: 'create_block', payload: block });
            setAppPage('calendar');
          }}
        />
      </div>
    );
  }

  if (appPage === 'practice') {
    return (
        <PracticeScreen
          data={data}
          onPersist={persist}
          onBack={(action) => { if (action) setPendingCalAction(action); setAppPage('calendar'); }}
          onSignOut={handleSignOut}
        />
    );
  }

  if (appPage === 'create') {
    return (
      <div className="app-layout">
        <CreateScreen
          data={data}
          onPersist={persist}
          onClose={() => setAppPage('calendar')}
        />
      </div>
    );
  }
  return (
    <>
      <CalendarScreen
        data={data}
        saving={saving}
        lastSyncedAt={lastSyncedAt}
        error={error}
        onReload={handleReload}
        onSignOut={handleSignOut}
        onPersist={persist}
        onOpenPractice={() => setAppPage('practice')}
        onOpenCreate={() => setAppPage('create')}
        onOpenModules={() => setAppPage('modules')}
        onOpenIntake={() => setAppPage('intake')}
        pendingCalAction={pendingCalAction}
        onClearPendingAction={() => setPendingCalAction(null)}
      />
      {conflictNotice}
    </>
  );
}

export function Centered({ children }) {
  return (
    <div className="wrap center">
      <div style={{ color: 'var(--muted-3)', fontSize: 14, fontStyle: 'italic', letterSpacing: '0.05em' }}>
        {children}
      </div>
    </div>
  );
}

export function SignInScreen({ onSignIn, error }) {
  return (
    <div className="wrap screen-pad-top fade-in">
      <div className="eyebrow">Executive Performance System</div>
      <h1 className="title">My Planning</h1>
      <div className="rule" />
      <p className="lede">
        One source of truth across every device.<br />
        Your routine, your calendars, your reflections —<br />
        stored privately in your own Google Drive.
      </p>
      <button className="btn-primary" onClick={onSignIn}>Sign in with Google →</button>
      {error && <div className="error-box">{error}</div>}
      <div className="info-box">
        <div className="info-label">How storage works</div>
        One JSON file, hidden in your Drive's app folder.<br />
        Only this app can see it. Sign in on any device — same data appears.<br />
        Sign out and revoke any time from your Google account permissions.
      </div>
    </div>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <div className="wrap screen-pad-top fade-in">
      <div className="eyebrow danger">Something went wrong</div>
      <h2 className="title">Hmm.</h2>
      <div className="rule" />
      <div className="error-box">{message}</div>
      <div style={{ marginTop: 24 }}>
        <button className="btn-primary" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}


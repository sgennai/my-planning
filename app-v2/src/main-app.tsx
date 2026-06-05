// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { SCHEMA_VERSION, SEED_ROUTINE, SEED_PROJECTS, SEED_REFERENCE_LIBRARY, SEED_PRACTICE_CONTENT, SEED_INTERVIEW_CATEGORIES, SEED_INTERVIEW_QUESTIONS } from './storage/data';
import { pad } from './ui/helpers';
import { InterviewPrepScreen } from './practice/InterviewPrep';
import { CalendarScreen } from './calendar/CalendarScreen';
import { loadData, saveData, syncData } from './storage/db';

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
    interviewPrep: { categories: [...SEED_INTERVIEW_CATEGORIES], questions: [...SEED_INTERVIEW_QUESTIONS], stories: [] },
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
    modules: [],
    learning: [],
    content: [],
    create: { ideas: [], posts: [] },
    progressLog: [],
    featureFlags: {},
  };
}

export function migrate(data) {
  let changed = false;
  const next = { ...data };
  const prevVersion = next.schemaVersion || 0;
  if (prevVersion < SCHEMA_VERSION) { next.schemaVersion = SCHEMA_VERSION; changed = true; }
  // v2: re-seed routine
  if (prevVersion < 2) { next.routine = SEED_ROUTINE; changed = true; }
  else if (next.routine == null || (Array.isArray(next.routine) && next.routine.length === 0)) {
    next.routine = SEED_ROUTINE; changed = true;
  }
  // v3: seed projects + scheduledBlocks
  if (prevVersion < 3) {
    next.projects = SEED_PROJECTS;
    next.scheduledBlocks = next.scheduledBlocks || [];
    changed = true;
  } else if (!Array.isArray(next.projects) || next.projects.length === 0) {
    next.projects = SEED_PROJECTS; changed = true;
  }
  // v4: seed referenceLibrary (only if missing — preserves user edits)
  if (!Array.isArray(next.referenceLibrary) || next.referenceLibrary.length === 0) {
    next.referenceLibrary = SEED_REFERENCE_LIBRARY;
    changed = true;
  }
  // v5: replace the meeting-reset placeholder entry with real content.
  // We only replace this one entry — other entries keep any edits.
  if (prevVersion < 5 && Array.isArray(next.referenceLibrary)) {
    const meetingReset = SEED_REFERENCE_LIBRARY.find(r => r.id === 'ref-meeting-reset');
    if (meetingReset) {
      const idx = next.referenceLibrary.findIndex(r => r.id === 'ref-meeting-reset');
      if (idx >= 0) {
        next.referenceLibrary[idx] = meetingReset;
      } else {
        next.referenceLibrary.push(meetingReset);
      }
      changed = true;
    }
  }
  if (!Array.isArray(next.scheduledBlocks)) { next.scheduledBlocks = []; changed = true; }
  if (!next.overrides) { next.overrides = {}; changed = true; }
  if (!next.calendars) { next.calendars = { workIcs: '', householdIcs: '', proxyUrl: '', syncUrl: '', syncSecret: '', workColor: '#8C8C96', householdColor: '#7896AF' }; changed = true; }
  else {
    if (next.calendars.proxyUrl === undefined) { next.calendars.proxyUrl = ''; changed = true; }
    if (next.calendars.syncUrl === undefined) { next.calendars.syncUrl = ''; changed = true; }
    if (next.calendars.syncSecret === undefined) { next.calendars.syncSecret = ''; changed = true; }
    if (next.calendars.workColor === undefined) { next.calendars.workColor = '#8C8C96'; changed = true; }
    if (next.calendars.householdColor === undefined) { next.calendars.householdColor = '#7896AF'; changed = true; }
  }
  if (!next.weeklyResets) { next.weeklyResets = []; changed = true; }
  if (!next.inbox) { next.inbox = []; changed = true; }
  if (!next.elsewhereToggles) { next.elsewhereToggles = { morning: false, afternoon: false, allDay: false, date: null }; changed = true; }
  if (!Array.isArray(next.todos)) { next.todos = []; changed = true; }
  if (!Array.isArray(next.completedActions)) { next.completedActions = []; changed = true; }
  if (!next.practiceContent || typeof next.practiceContent !== 'object' ||
      !next.practiceContent.interviewPrep || !next.practiceContent.personalNarrative || !next.practiceContent.clevelQs) {
    next.practiceContent = SEED_PRACTICE_CONTENT; changed = true;
  }
  if (!next.routineCompletions || typeof next.routineCompletions !== 'object') {
    next.routineCompletions = {};
    changed = true;
  }
  // v23: interview prep page data
  if (!next.interviewPrep || !Array.isArray(next.interviewPrep.categories)) {
    next.interviewPrep = { categories: [...SEED_INTERVIEW_CATEGORIES], questions: [...SEED_INTERVIEW_QUESTIONS], stories: [] };
    changed = true;
  }
  if (!next.weather || typeof next.weather !== 'object') {
    next.weather = { lat: null, lon: null, label: '', source: 'unset' };
    changed = true;
  }
  // v13: theme preference. Existing users get light by default (the new default surface).
  if (!next.prefs || typeof next.prefs !== 'object') {
    next.prefs = { theme: 'light', categoryColors: {}, todayView: 'timeline', lunchSlot: { start: '12:30', duration: 60 } };
    changed = true;
  } else {
    if (!next.prefs.theme) { next.prefs.theme = 'light'; changed = true; }
    if (!next.prefs.categoryColors || typeof next.prefs.categoryColors !== 'object') {
      next.prefs.categoryColors = {};
      changed = true;
    }
    // v16: per-category emoji overrides
    if (!next.prefs.categoryEmojis || typeof next.prefs.categoryEmojis !== 'object') {
      next.prefs.categoryEmojis = {};
      changed = true;
    }
    if (!next.prefs.categoryLabels || typeof next.prefs.categoryLabels !== 'object') {
      next.prefs.categoryLabels = {};
      changed = true;
    }
    // v15: today view + lunch slot
    if (!next.prefs.todayView) { next.prefs.todayView = 'timeline'; changed = true; }
    if (next.prefs.nowLineColor === undefined) { next.prefs.nowLineColor = ''; changed = true; }
    if (next.prefs.miniMonthTodayColor === undefined) { next.prefs.miniMonthTodayColor = ''; changed = true; }
    if (next.prefs.nowEventColor === undefined) { next.prefs.nowEventColor = ''; changed = true; }
    if (!next.prefs.userCategories || typeof next.prefs.userCategories !== 'object') {
      next.prefs.userCategories = {};
      changed = true;
    }
    if (!next.prefs.lunchSlot || typeof next.prefs.lunchSlot !== 'object') {
      next.prefs.lunchSlot = { start: '12:30', duration: 60 };
      changed = true;
    }
  }
  // v11: routine items with string recurrence get structured form
  if (Array.isArray(next.routine)) {
    next.routine = next.routine.map(item => {
      if (typeof item.recurrence === 'string') {
        // Try to parse 'top-of-hour-9-18' style
        const m = item.recurrence.match(/top-of-hour-(\d+)-(\d+)/);
        if (m) {
          changed = true;
          return { ...item, recurrence: { kind: 'top-of-hour', startHour: +m[1], endHour: +m[2] } };
        }
        // Unknown string — clear it
        changed = true;
        const { recurrence, ...rest } = item;
        return rest;
      }
      return item;
    });
  }
  if ('testCounter' in next) { delete next.testCounter; changed = true; }

  // v24: new engines
  if (!next.userProfile || typeof next.userProfile !== 'object') {
    next.userProfile = {
      id: 'singleton-user-profile',
      targetRoles: [],
      competencyFramework: [],
      positioningThesis: '',
      industries: [],
      geos: [],
      switchDeadline: '',
    };
    changed = true;
  }
  if (!Array.isArray(next.modules)) { next.modules = []; changed = true; }
  if (!Array.isArray(next.learning)) { next.learning = []; changed = true; }
  if (!Array.isArray(next.content)) { next.content = []; changed = true; }
  if (!next.create || typeof next.create !== 'object') {
    next.create = { ideas: [], posts: [] };
    changed = true;
  }
  if (!Array.isArray(next.progressLog)) { next.progressLog = []; changed = true; }
  if (!next.featureFlags || typeof next.featureFlags !== 'object') {
    next.featureFlags = {};
    changed = true;
  }

  return { data: next, migrated: changed };
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
      const didChange = await syncData(data.calendars.syncUrl, data.calendars.syncSecret);
      if (didChange) {
        // Re-hydrate memory from IDB silently
        const freshData = await loadData();
        if (freshData) {
          setData(freshData);
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
    // No longer needed
    setPhase('ready');
  };
  const handleSignOut = async () => {
    // No longer needed
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
  if (appPage === 'interview') {
    return (
      <InterviewPrepScreen
        data={data}
        onPersist={persist}
        onBack={(action) => { if (action) setPendingCalAction(action); setAppPage('calendar'); }}
        onSignOut={handleSignOut}
      />
    );
  }
  return (
    <CalendarScreen
      data={data}
      saving={saving}
      lastSyncedAt={lastSyncedAt}
      error={error}
      onReload={handleReload}
      onSignOut={handleSignOut}
      onPersist={persist}
      onOpenInterviewPrep={() => setAppPage('interview')}
      pendingCalAction={pendingCalAction}
      onClearPendingAction={() => setPendingCalAction(null)}
    />
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


// DEFAULT DATA + MIGRATION
// ═════════════════════════════════════════════════════════════
function makeDefaultData() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    lastModified: now,
    routine: SEED_ROUTINE,
    overrides: {},
    calendars: { workIcs: '', householdIcs: '', proxyUrl: '', workColor: '#8C8C96', householdColor: '#7896AF' },
    weeklyResets: [],
    projects: SEED_PROJECTS,
    scheduledBlocks: [],
    referenceLibrary: SEED_REFERENCE_LIBRARY,
    inbox: [],
    elsewhereToggles: { morning: false, afternoon: false, allDay: false, date: null },
    todos: [],
    completedActions: [],
    practiceContent: SEED_PRACTICE_CONTENT,
    routineCompletions: {},
    weather: { lat: null, lon: null, label: '', source: 'unset' }, // source: 'unset' | 'geolocation' | 'manual'
    prefs: {
      theme: 'light',
      categoryColors: {},
      categoryEmojis: {},
      todayView: 'timeline',
      lunchSlot: { start: '12:30', duration: 60 },
    },
  };
}

function migrate(data) {
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
  if (!next.calendars) { next.calendars = { workIcs: '', householdIcs: '', proxyUrl: '', workColor: '#8C8C96', householdColor: '#7896AF' }; changed = true; }
  else {
    if (next.calendars.proxyUrl === undefined) { next.calendars.proxyUrl = ''; changed = true; }
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
    // v15: today view + lunch slot
    if (!next.prefs.todayView) { next.prefs.todayView = 'timeline'; changed = true; }
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
  return { data: next, migrated: changed };
}

// ═════════════════════════════════════════════════════════════
// HOOKS
// ═════════════════════════════════════════════════════════════
function useMediaQuery(query) {
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

function useTickingClock(intervalMs = 60000) {
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
function App() {
  const [phase, setPhase] = useState('booting');
  const [error, setError] = useState('');
  const [fileId, setFileId] = useState(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Apply theme to <html data-theme="..."> whenever data.prefs.theme changes.
  // Default to 'light' before data loads so the boot/sign-in screens use the right palette.
  useEffect(() => {
    const theme = (data && data.prefs && data.prefs.theme) || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, [data]);

  const loadOrCreate = useCallback(async () => {
    setPhase('loading');
    try {
      const existing = await findDataFile();
      if (existing) {
        const content = await downloadFile(existing.id);
        const { data: migrated, migrated: didMigrate } = migrate(content);
        setFileId(existing.id);
        setData(migrated);
        setLastSyncedAt(new Date());
        if (didMigrate) {
          migrated.lastModified = new Date().toISOString();
          await updateFile(existing.id, migrated);
        }
      } else {
        const fresh = makeDefaultData();
        const created = await createFile(fresh);
        setFileId(created.id);
        setData(fresh);
        setLastSyncedAt(new Date());
      }
      setPhase('ready');
    } catch (e) {
      setError(`Load failed: ${e.message}`);
      setPhase('error');
    }
  }, []);

  // Persist new data to Drive. Optimistically updates local state, then syncs.
  const persist = useCallback(async (nextData) => {
    if (!fileId) return;
    setData(nextData); // optimistic — render reflects change immediately
    setSaving(true);
    setError('');
    try {
      await updateFile(fileId, nextData);
      setLastSyncedAt(new Date());
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [fileId]);

  useEffect(() => {
    (async () => {
      try {
        await initAuth();
        try {
          await requestToken({ silent: true });
          await loadOrCreate();
        } catch {
          setPhase('signin');
        }
      } catch (e) {
        setError(`Init failed: ${e.message}`);
        setPhase('error');
      }
    })();
  }, [loadOrCreate]);

  const handleSignIn = async () => {
    setError('');
    try {
      await requestToken({ silent: false });
      await loadOrCreate();
    } catch (e) {
      setError(`Sign-in failed: ${e.message}`);
      setPhase('signin');
    }
  };
  const handleSignOut = async () => {
    await revokeToken();
    setData(null);
    setFileId(null);
    setLastSyncedAt(null);
    setPhase('signin');
  };
  const handleReload = async () => {
    setError('');
    await loadOrCreate();
  };

  if (phase === 'booting')
    return <Centered><span className="pulse" /><span>Initializing</span></Centered>;
  if (phase === 'loading')
    return <Centered><span className="pulse" /><span>Syncing with Drive</span></Centered>;
  if (phase === 'error')
    return <ErrorScreen message={error} onRetry={() => setPhase('signin')} />;
  if (phase === 'signin')
    return <SignInScreen onSignIn={handleSignIn} error={error} />;
  return (
    <CalendarScreen
      data={data}
      saving={saving}
      lastSyncedAt={lastSyncedAt}
      error={error}
      onReload={handleReload}
      onSignOut={handleSignOut}
      onPersist={persist}
    />
  );
}

function Centered({ children }) {
  return (
    <div className="wrap center">
      <div style={{ color: 'var(--muted-3)', fontSize: 14, fontStyle: 'italic', letterSpacing: '0.05em' }}>
        {children}
      </div>
    </div>
  );
}

function SignInScreen({ onSignIn, error }) {
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

function ErrorScreen({ message, onRetry }) {
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


// ═══════════════════════════════════════════════════════════════════
// INTERVIEW PREP PAGE
// ═══════════════════════════════════════════════════════════════════

const IP_STATUS_LABELS = {
  draft: 'Draft', needs_work: 'Needs work', practice: 'Practice',
  strong: 'Strong', interview_ready: 'Interview-ready',
};
const IP_STATUS_COLORS = {
  draft: '#9ca3af', needs_work: '#f59e0b', practice: '#3b82f6',
  strong: '#22c55e', interview_ready: '#16a34a',
};
const IP_NEXT_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };
const IP_CAT_GROUPS = [
  'Core Sales Execution', 'Strategic Enterprise Selling',
  'Leadership & Scale', 'Salesforce Fit', 'Personal Stories', 'Other',
];
const IP_ANSWER_BLOCKS = [
  { field: 'coreMessage',         label: 'Core message',         primary: true,  placeholder: 'One or two sentences. The spine of your answer.' },
  { field: 'answer60Sec',         label: '60-second answer',     primary: true,  placeholder: 'The main version to master. Clear, structured, confident.' },
  { field: 'proofStory',          label: 'Proof story',          primary: true,  placeholder: 'Situation:\nAction:\nResult:\nLearning:' },
  { field: 'metrics',             label: 'Metrics / evidence',   primary: true,  placeholder: 'Specific numbers, deal sizes, business impact…' },
  { field: 'salesforceRelevance', label: 'Salesforce relevance', primary: false, placeholder: 'How this connects to Salesforce, enterprise SaaS, Senior AE expectations.' },
  { field: 'answer30Sec',         label: '30-second answer',     primary: false, placeholder: 'For fast screening questions. Short and sharp.' },
  { field: 'expandedAnswer',      label: '2–3 minute answer',    primary: false, placeholder: 'When the interviewer asks for depth or follow-up.' },
  { field: 'keywords',            label: 'Keywords to include',  primary: false, placeholder: 'MEDDPICC · Mutual action plan · Economic buyer · Close plan…' },
  { field: 'watchOuts',           label: 'Watch-outs / avoid',   primary: false, placeholder: 'Mistakes to avoid. Things not to say.' },
  { field: 'notes',               label: 'Notes',                primary: false, placeholder: 'Free-form notes.' },
];
const IP_STORY_FIELDS = [
  { key: 'title',      label: 'Title',         multi: false, placeholder: 'Give this story a short memorable name.' },
  { key: 'summary',    label: 'Short summary', multi: false, placeholder: 'One sentence — the headline.' },
  { key: 'situation',  label: 'Situation',     multi: true,  placeholder: 'Context, challenge, stakes.' },
  { key: 'action',     label: 'Action',        multi: true,  placeholder: 'What you specifically did.' },
  { key: 'result',     label: 'Result',        multi: true,  placeholder: 'Outcome, impact, what changed.' },
  { key: 'learning',   label: 'Learning',      multi: false, placeholder: 'What you took away from it.' },
  { key: 'metrics',    label: 'Metrics',       multi: false, placeholder: 'Numbers, deal size, ARR impact, timeline.' },
  { key: 'whereToUse', label: 'Where to use',  multi: false, placeholder: 'Which question types or topics this story fits best.' },
];
const IP_RUBRIC_ITEMS = [
  { key: 'clearOpening',        label: 'Clear executive opening' },
  { key: 'specificExample',     label: 'Specific personal example' },
  { key: 'businessImpact',      label: 'Business impact included' },
  { key: 'metricsIncluded',     label: 'Metrics included' },
  { key: 'seniorAELevel',       label: 'Senior AE level' },
  { key: 'salesforceRelevance', label: 'Salesforce relevance' },
  { key: 'concise60s',          label: 'Has clear 60-second version' },
];

// ─── Helpers ──────────────────────────────────────────────────────
function ipStatusFromConf(c) {
  if (c <= 2) return 'needs_work';
  if (c === 3) return 'practice';
  if (c === 4) return 'strong';
  return 'interview_ready';
}
function ipNextPractice(conf) {
  const d = new Date();
  d.setDate(d.getDate() + (IP_NEXT_DAYS[conf] || 7));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function ipIsDue(q) {
  if (!q.nextPracticeAt) return true;
  return new Date(q.nextPracticeAt) <= new Date();
}
function ipComputeStats(ip) {
  const questions = ip.questions || [];
  const categories = ip.categories || [];
  const dueToday = questions.filter(ipIsDue).length;
  const total = questions.length;
  const interviewReady = questions.filter(q => q.status === 'interview_ready').length;
  const avgConf = total > 0
    ? (questions.reduce((s, q) => s + (q.confidence || 1), 0) / total).toFixed(1)
    : null;
  const lastPracticed = questions
    .filter(q => q.lastPracticedAt).map(q => q.lastPracticedAt).sort().pop() || null;
  const practiceDates = new Set(
    questions.filter(q => q.lastPracticedAt).map(q => q.lastPracticedAt.substring(0, 10))
  );
  let streak = 0;
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const ystD = new Date(todayD); ystD.setDate(ystD.getDate() - 1);
  const todayStr = todayD.toISOString().substring(0, 10);
  const ystStr = ystD.toISOString().substring(0, 10);
  let check = practiceDates.has(todayStr) ? new Date(todayD) : (practiceDates.has(ystStr) ? new Date(ystD) : null);
  while (check) {
    const ds = check.toISOString().substring(0, 10);
    if (practiceDates.has(ds)) { streak++; check.setDate(check.getDate() - 1); }
    else break;
  }
  const catStats = {};
  categories.forEach(c => {
    const qs = questions.filter(q => q.categoryId === c.id);
    catStats[c.id] = {
      total: qs.length,
      ready: qs.filter(q => q.status === 'interview_ready').length,
      due: qs.filter(ipIsDue).length,
      weak: qs.filter(q => q.status === 'draft' || q.status === 'needs_work').length,
    };
  });
  const weakCats = categories
    .filter(c => (catStats[c.id] || {}).weak > 0)
    .sort((a, b) => (catStats[b.id].weak || 0) - (catStats[a.id].weak || 0))
    .slice(0, 3).map(c => c.name);
  return { dueToday, total, interviewReady, weakCats, catStats, avgConf, lastPracticed, streak };
}
function ipBuildQueue(questions, mode, limit = 12) {
  if (mode === 'random') {
    const arr = [...questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, limit);
  }
  let pool;
  if (mode === 'weak') pool = questions.filter(q => q.status === 'draft' || q.status === 'needs_work' || q.confidence <= 2);
  else if (mode === 'all') pool = [...questions];
  else if (mode === 'ready') pool = questions.filter(q => q.status === 'interview_ready');
  else {
    pool = questions.filter(ipIsDue);
    if (pool.length === 0) pool = questions.filter(q => q.confidence <= 2);
  }
  return pool.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence - b.confidence;
    return (a.lastPracticedAt ? new Date(a.lastPracticedAt).getTime() : 0)
         - (b.lastPracticedAt ? new Date(b.lastPracticedAt).getTime() : 0);
  }).slice(0, limit);
}

// ─── IPAnswerBlock ────────────────────────────────────────────────
function IPAnswerBlock({ field, label, placeholder, value, primary, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const taRef = useRef(null);
  const savedTimer = useRef(null);
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const autoResize = el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
  useEffect(() => { if (editing && taRef.current) { taRef.current.focus(); autoResize(taRef.current); } }, [editing]);
  const save = () => {
    onChange(field, draft); setEditing(false); setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  };
  const cancel = () => { setDraft(value || ''); setEditing(false); };
  return (
    <div className={`ip-block${primary ? ' ip-block--primary' : ''}`}>
      <div className="ip-block-header">
        <span className="ip-block-label">{label}</span>
        <div className="ip-block-header-right">
          {saved && !editing && <span className="ip-block-saved">✓ Saved</span>}
          {!editing && <button className="ip-block-edit-btn" onClick={() => setEditing(true)}>{value ? 'Edit' : '+ Add'}</button>}
        </div>
      </div>
      {editing ? (
        <div className="ip-block-edit">
          <textarea ref={taRef} className="ip-block-ta" value={draft} rows={4} placeholder={placeholder}
            onChange={e => { setDraft(e.target.value); autoResize(e.target); }} />
          <div className="ip-block-edit-actions">
            <button className="ip-block-save-btn" onClick={save}>Save</button>
            <button className="ip-block-cancel-btn" onClick={cancel}>Cancel</button>
          </div>
        </div>
      ) : value ? (
        <div className="ip-block-content" onClick={() => setEditing(true)}>{value}</div>
      ) : (
        <div className="ip-block-empty" onClick={() => setEditing(true)}>
          {placeholder.split('\n')[0].substring(0, 72) + (placeholder.length > 72 ? '…' : '')}
        </div>
      )}
    </div>
  );
}

// ─── IPRehearsalView ──────────────────────────────────────────────
function IPRehearsalView({ queue, ip, onRate, onExit }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('question');
  const [showHints, setShowHints] = useState(false);
  const [timerSecs, setTimerSecs] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);
  const q = queue[idx];
  const cat = q ? (ip.categories || []).find(c => c.id === q.categoryId) : null;
  useEffect(() => {
    if (timerRunning && timerSecs > 0) timerRef.current = setTimeout(() => setTimerSecs(s => s - 1), 1000);
    else if (timerRunning && timerSecs === 0) setTimerRunning(false);
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerSecs]);
  const startTimer = s => { clearTimeout(timerRef.current); setTimerSecs(s); setTimerRunning(true); };
  const resetState = () => { setPhase('question'); setShowHints(false); setTimerSecs(null); setTimerRunning(false); clearTimeout(timerRef.current); };
  const handleRate = conf => { onRate(q.id, conf); if (idx < queue.length - 1) { setIdx(i => i + 1); resetState(); } else onExit(); };
  if (!q) { onExit(); return null; }
  return (
    <div className="ip-rehearsal">
      <div className="ip-rehearsal-topbar">
        <button className="ip-rehearsal-exit-btn" onClick={onExit}>← Exit rehearsal</button>
        <div className="ip-rehearsal-progress-label">
          {cat && <span className="ip-rehearsal-cat-label" style={{ color: cat.color }}>● {cat.name}</span>}
          <span className="ip-rehearsal-q-count">Question {idx + 1} of {queue.length}</span>
        </div>
        <div className="ip-timer-group">
          {[30, 60, 90, 180].map(s => (
            <button key={s} className={`ip-timer-preset${timerSecs !== null && timerRunning ? ' active' : ''}`} onClick={() => startTimer(s)}>
              {s < 60 ? `${s}s` : `${s / 60}min`}
            </button>
          ))}
        </div>
      </div>
      <div className="ip-rehearsal-body">
        {timerSecs !== null && (
          <div className={`ip-timer-display${timerSecs === 0 ? ' done' : ''}`}>
            {timerSecs > 0 ? `${Math.floor(timerSecs / 60)}:${pad(timerSecs % 60)}` : 'Time — show your answer'}
          </div>
        )}
        <div className="ip-rehearsal-question">{q.question}</div>
        {phase === 'question' && (
          <div className="ip-rehearsal-controls">
            <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary" onClick={() => setShowHints(h => !h)}>
              {showHints ? 'Hide hints' : 'Show hints'}
            </button>
            <button className="ip-rehearsal-btn ip-rehearsal-btn--primary" onClick={() => setPhase('answer')}>Show answer</button>
          </div>
        )}
        {showHints && phase === 'question' && (
          <div className="ip-rehearsal-hints">
            {q.answer.coreMessage && <div className="ip-hint-row"><span className="ip-hint-icon">💡</span><span>{q.answer.coreMessage}</span></div>}
            {q.answer.keywords && <div className="ip-hint-row"><span className="ip-hint-icon">🔑</span><span>{q.answer.keywords}</span></div>}
            {!q.answer.coreMessage && !q.answer.keywords && <div className="ip-hint-row" style={{ color: 'var(--muted-3)' }}>No hints yet — add a core message or keywords first.</div>}
          </div>
        )}
        {phase === 'answer' && (
          <div className="ip-rehearsal-answer-area">
            {IP_ANSWER_BLOCKS.filter(b => b.primary && q.answer[b.field]).map(b => (
              <div key={b.field} className="ip-rehearsal-answer-block">
                <div className="ip-ra-label">{b.label}</div>
                <div className="ip-ra-text">{q.answer[b.field]}</div>
              </div>
            ))}
            {IP_ANSWER_BLOCKS.filter(b => b.primary).every(b => !q.answer[b.field]) && (
              <div className="ip-ra-empty">No answer written yet. Exit rehearsal to add one.</div>
            )}
            <div className="ip-rehearsal-rate-section">
              <div className="ip-rate-prompt">How confident are you?</div>
              <div className="ip-rate-btns">
                {[1,2,3,4,5].map(n => (
                  <button key={n} className={`ip-conf-btn ip-conf-btn--${n}`} onClick={() => handleRate(n)}>
                    {n === 1 ? '1 Weak' : n === 5 ? '5 Ready' : n}
                  </button>
                ))}
              </div>
              <div className="ip-rehearsal-nav">
                <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary" onClick={resetState}>Practice again</button>
                {idx < queue.length - 1 && (
                  <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary" onClick={() => { setIdx(i => i + 1); resetState(); }}>Skip →</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IPLinkedStories ──────────────────────────────────────────────
function IPLinkedStories({ linkedStoryIds, allStories, onLink, onUnlink }) {
  const [showPicker, setShowPicker] = useState(false);
  const ids = linkedStoryIds || [];
  const linked = allStories.filter(s => ids.includes(s.id));
  const unlinked = allStories.filter(s => !ids.includes(s.id));
  return (
    <div className="ip-linked-stories">
      <div className="ip-linked-stories-header">
        <span className="ip-block-label">Linked stories</span>
        <button className="ip-linked-link-btn" onClick={() => setShowPicker(p => !p)}>
          {showPicker ? 'Close' : '+ Link'}
        </button>
      </div>
      {linked.length === 0 && (
        <div className="ip-linked-empty">
          {allStories.length === 0
            ? 'No stories in Story Bank yet. Use the Story Bank button to create reusable stories.'
            : 'No stories linked. Click + Link to connect a reusable story to this answer.'}
        </div>
      )}
      {linked.map(s => (
        <div key={s.id} className="ip-linked-story-row">
          <div className="ip-linked-story-info">
            <div className="ip-linked-story-title">{s.title}</div>
            {s.summary && <div className="ip-linked-story-summary">{s.summary}</div>}
          </div>
          <button className="ip-linked-story-unlink" onClick={() => onUnlink(s.id)} title="Unlink">×</button>
        </div>
      ))}
      {showPicker && (
        <div className="ip-story-picker">
          {unlinked.length === 0 ? (
            <div className="ip-story-picker-empty">
              {allStories.length === 0 ? 'No stories yet. Go to Story Bank to create one.' : 'All stories already linked.'}
            </div>
          ) : unlinked.map(s => (
            <div key={s.id} className="ip-story-picker-item" onClick={() => { onLink(s.id); setShowPicker(false); }}>
              <div className="ip-story-picker-title">{s.title}</div>
              {s.summary && <div className="ip-story-picker-summary">{s.summary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── IPRubric ─────────────────────────────────────────────────────
function IPRubric({ rubric, onChange }) {
  const cur = rubric || {};
  const score = IP_RUBRIC_ITEMS.filter(r => cur[r.key]).length;
  return (
    <div className="ip-rubric">
      <div className="ip-rubric-header">
        <span className="ip-block-label">Answer quality</span>
        <span className="ip-rubric-score">{score} / {IP_RUBRIC_ITEMS.length}</span>
      </div>
      <div className="ip-rubric-list">
        {IP_RUBRIC_ITEMS.map(r => (
          <label key={r.key} className="ip-rubric-item">
            <input type="checkbox" className="ip-rubric-cb" checked={!!cur[r.key]}
              onChange={e => onChange({ ...cur, [r.key]: e.target.checked })} />
            <span className={`ip-rubric-label${cur[r.key] ? ' ip-rubric-label--done' : ''}`}>{r.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── IPWorkspace ──────────────────────────────────────────────────
function IPWorkspace({ question, ip, onUpdateAnswer, onUpdateQuestion, onRehearseOne, onMarkReady, onDelete, onDuplicate, onMove, onLinkStory, onUnlinkStory }) {
  const [showAll, setShowAll] = useState(false);
  const [editingQText, setEditingQText] = useState(false);
  const [qTextDraft, setQTextDraft] = useState('');
  const [tagInput, setTagInput] = useState('');
  const questionId = question ? question.id : null;
  useEffect(() => { setShowAll(false); setEditingQText(false); setTagInput(''); }, [questionId]);

  if (!question) {
    return (
      <div className="ip-right ip-workspace-empty">
        <div className="ip-empty-icon">📋</div>
        <div className="ip-empty-title">Select a question to start preparing</div>
        <div className="ip-empty-sub">Pick a category on the left, then a question in the middle.</div>
      </div>
    );
  }

  const cat = (ip.categories || []).find(c => c.id === question.categoryId);
  const status = question.status || 'draft';
  const conf = question.confidence || 1;
  const visibleBlocks = showAll ? IP_ANSWER_BLOCKS : IP_ANSWER_BLOCKS.filter(b => b.primary || question.answer[b.field]);
  const hiddenCount = IP_ANSWER_BLOCKS.filter(b => !b.primary && !question.answer[b.field]).length;

  const saveQText = () => {
    const t = qTextDraft.trim();
    if (t && t !== question.question) onUpdateQuestion(question.id, { question: t });
    setEditingQText(false);
  };
  const addTag = raw => {
    const t = raw.trim().replace(/,/g, '');
    if (!t || (question.tags || []).includes(t)) { setTagInput(''); return; }
    onUpdateQuestion(question.id, { tags: [...(question.tags || []), t] });
    setTagInput('');
  };
  const removeTag = tag => onUpdateQuestion(question.id, { tags: (question.tags || []).filter(t => t !== tag) });
  const nextDueLabel = question.nextPracticeAt
    ? new Date(question.nextPracticeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="ip-right ip-workspace">
      <div className="ip-workspace-header">
        {editingQText ? (
          <div className="ip-ws-q-edit">
            <textarea className="ip-ws-q-ta" value={qTextDraft} rows={3} autoFocus
              onChange={e => setQTextDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveQText(); } }} />
            <div className="ip-ws-q-actions">
              <button className="ip-block-save-btn" onClick={saveQText}>Save</button>
              <button className="ip-block-cancel-btn" onClick={() => setEditingQText(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="ip-ws-question" onClick={() => { setQTextDraft(question.question); setEditingQText(true); }} title="Click to edit">
            {question.question}
          </div>
        )}
        <div className="ip-ws-meta-row">
          {cat && <span className="ip-ws-cat-chip" style={{ background: cat.color + '22', color: cat.color }}>● {cat.name}</span>}
          <span className="ip-ws-status-chip" style={{ background: IP_STATUS_COLORS[status] + '22', color: IP_STATUS_COLORS[status] }}>{IP_STATUS_LABELS[status]}</span>
          <span className="ip-ws-conf-stars">{'★'.repeat(conf)}{'☆'.repeat(5 - conf)}</span>
          {question.lastPracticedAt
            ? <span className="ip-ws-last">Last: {new Date(question.lastPracticedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            : <span className="ip-ws-last ip-ws-last--never">Never practiced</span>}
          {nextDueLabel && <span className="ip-ws-last">Next: {nextDueLabel}</span>}
          {ipIsDue(question) && <span className="ip-ws-due-badge">● Due</span>}
        </div>
        <div className="ip-ws-tags-row">
          {(question.tags || []).map(t => (
            <span key={t} className="ip-ws-tag-chip">{t}<button className="ip-ws-tag-remove" onClick={() => removeTag(t)}>×</button></span>
          ))}
          <input className="ip-ws-tag-input" value={tagInput} placeholder="+ tag"
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
              if (e.key === 'Backspace' && !tagInput && (question.tags || []).length > 0) removeTag(question.tags[question.tags.length - 1]);
            }} />
        </div>
        <div className="ip-ws-action-row">
          <button className="ip-ws-btn ip-ws-btn--primary" onClick={() => onRehearseOne(question.id)}>▶ Rehearse</button>
          <select className="ip-ws-status-select" value={status}
            onChange={e => onUpdateQuestion(question.id, { status: e.target.value })}>
            {Object.entries(IP_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {status !== 'interview_ready' && <button className="ip-ws-btn" onClick={() => onMarkReady(question.id)}>✓ Mark ready</button>}
          <button className="ip-ws-btn" onClick={() => onDuplicate(question.id)}>⊕ Duplicate</button>
          <select className="ip-ws-move-select" value={question.categoryId || ''}
            onChange={e => { if (e.target.value && e.target.value !== question.categoryId) onMove(question.id, e.target.value); }}>
            <option value="" disabled>Move to…</option>
            {(ip.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="ip-ws-btn ip-ws-btn--danger" onClick={() => { if (window.confirm('Delete this question?')) onDelete(question.id); }}>Delete</button>
        </div>
      </div>
      <div className="ip-blocks-area">
        {visibleBlocks.map(b => (
          <IPAnswerBlock key={b.field} field={b.field} label={b.label} placeholder={b.placeholder}
            value={question.answer[b.field] || ''} primary={b.primary}
            onChange={(field, val) => onUpdateAnswer(question.id, field, val)} />
        ))}
        {!showAll && hiddenCount > 0 && (
          <button className="ip-show-all-btn" onClick={() => setShowAll(true)}>
            + Show {hiddenCount} more section{hiddenCount > 1 ? 's' : ''}
          </button>
        )}
        <IPLinkedStories
          linkedStoryIds={question.linkedStoryIds}
          allStories={ip.stories || []}
          onLink={sid => onLinkStory(question.id, sid)}
          onUnlink={sid => onUnlinkStory(question.id, sid)}
        />
        <IPRubric
          rubric={question.rubric}
          onChange={rubric => onUpdateQuestion(question.id, { rubric })}
        />
      </div>
    </div>
  );
}

// ─── IPStoryEditor ────────────────────────────────────────────────
function IPStoryEditor({ story, onUpdate, onDelete, linkedByQuestions }) {
  const [fields, setFields] = useState({ ...story });
  const saveTimer = useRef(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);
  useEffect(() => { setFields({ ...story }); }, [story.id]);
  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(savedTimer.current); }, []);

  const handleChange = (key, val) => {
    const next = { ...fields, [key]: val };
    setFields(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(next);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    }, 600);
  };

  return (
    <div className="ip-story-editor-panel">
      <div className="ip-story-editor-header">
        <span className="ip-story-editor-title">{fields.title || 'Untitled story'}</span>
        <div className="ip-story-editor-header-right">
          {saved && <span className="ip-block-saved">✓ Saved</span>}
          <button className="ip-ws-btn ip-ws-btn--danger"
            onClick={() => { if (window.confirm('Delete this story? It will be unlinked from all questions.')) onDelete(); }}>
            Delete
          </button>
        </div>
      </div>
      <div className="ip-story-editor-body">
        {IP_STORY_FIELDS.map(f => (
          <div key={f.key} className="ip-story-field">
            <label className="ip-story-field-label">{f.label}</label>
            {f.multi ? (
              <textarea className="ip-story-field-ta" rows={3} placeholder={f.placeholder}
                value={fields[f.key] || ''}
                onChange={e => handleChange(f.key, e.target.value)} />
            ) : (
              <input className="ip-story-field-input" type="text" placeholder={f.placeholder}
                value={fields[f.key] || ''}
                onChange={e => handleChange(f.key, e.target.value)} />
            )}
          </div>
        ))}
        {linkedByQuestions && linkedByQuestions.length > 0 && (
          <div className="ip-story-linked-qs">
            <div className="ip-story-field-label">Used in {linkedByQuestions.length} question{linkedByQuestions.length > 1 ? 's' : ''}</div>
            {linkedByQuestions.map(q => (
              <div key={q.id} className="ip-story-linked-q-row">{q.question}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IPStoryBankView ──────────────────────────────────────────────
function IPStoryBankView({ ip, onAddStory, onUpdateStory, onDeleteStory }) {
  const [selId, setSelId] = useState(null);
  const stories = ip.stories || [];
  const selected = stories.find(s => s.id === selId) || null;

  const linkedByQuestions = useMemo(() => {
    if (!selId) return [];
    return (ip.questions || []).filter(q => (q.linkedStoryIds || []).includes(selId));
  }, [selId, ip.questions]);

  const handleAdd = () => { const id = onAddStory(); setSelId(id); };

  return (
    <div className="ip-story-view">
      <div className="ip-story-list-col">
        <div className="ip-story-list-header">
          <span className="ip-left-title">Stories</span>
          <button className="ip-left-add-btn" onClick={handleAdd} title="New story">+</button>
        </div>
        {stories.length === 0 ? (
          <div className="ip-story-empty">
            <div style={{ fontSize: 12, color: 'var(--muted-3)', marginBottom: 12 }}>No stories yet.</div>
            <button className="ip-add-q-btn" onClick={handleAdd}>+ Add first story</button>
          </div>
        ) : stories.map(s => (
          <div key={s.id} className={`ip-story-card${selId === s.id ? ' active' : ''}`} onClick={() => setSelId(s.id)}>
            <div className="ip-story-card-title">{s.title || 'Untitled story'}</div>
            {s.summary && <div className="ip-story-card-summary">{s.summary}</div>}
          </div>
        ))}
      </div>
      {selected ? (
        <IPStoryEditor
          story={selected}
          onUpdate={updates => onUpdateStory(selected.id, updates)}
          onDelete={() => { onDeleteStory(selected.id); setSelId(null); }}
          linkedByQuestions={linkedByQuestions}
        />
      ) : (
        <div className="ip-story-editor-empty">
          {stories.length > 0 ? 'Select a story to edit it.' : 'Add your first reusable story to build your evidence bank.'}
        </div>
      )}
    </div>
  );
}

// ─── IPGlobalSearch ───────────────────────────────────────────────
function IPGlobalSearch({ questions, stories, categories, onNavigate, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { questions: [], stories: [] };
    return {
      questions: questions.filter(x =>
        x.question.toLowerCase().includes(term) ||
        (x.tags || []).join(' ').toLowerCase().includes(term) ||
        Object.values(x.answer || {}).some(v => typeof v === 'string' && v.toLowerCase().includes(term))
      ).slice(0, 15),
      stories: stories.filter(s =>
        s.title.toLowerCase().includes(term) ||
        (s.summary || '').toLowerCase().includes(term) ||
        (s.situation || '').toLowerCase().includes(term) ||
        (s.whereToUse || '').toLowerCase().includes(term)
      ).slice(0, 8),
    };
  }, [q, questions, stories]);

  const total = results.questions.length + results.stories.length;

  return (
    <div className="ip-search-overlay" onClick={onClose}>
      <div className="ip-search-overlay-inner" onClick={e => e.stopPropagation()}>
        <div className="ip-search-bar-wrap">
          <input ref={inputRef} className="ip-search-global" type="text"
            placeholder="Search all questions and stories…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); }} />
          <button className="ip-search-close" onClick={onClose}>×</button>
        </div>
        {q.trim() && (
          <div className="ip-search-results">
            {total === 0 ? (
              <div className="ip-search-empty">No results for "{q}"</div>
            ) : (
              <>
                {results.questions.length > 0 && (
                  <div className="ip-search-section">
                    <div className="ip-search-section-label">Questions ({results.questions.length})</div>
                    {results.questions.map(x => {
                      const cat = categories.find(c => c.id === x.categoryId);
                      return (
                        <div key={x.id} className="ip-search-result" onClick={() => onNavigate('question', x.id, x.categoryId)}>
                          <span className="ip-search-result-dot" style={{ background: IP_STATUS_COLORS[x.status || 'draft'] }} />
                          <div className="ip-search-result-body">
                            <div className="ip-search-result-text">{x.question}</div>
                            {cat && <div className="ip-search-result-meta">{cat.name} · {IP_STATUS_LABELS[x.status || 'draft']}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {results.stories.length > 0 && (
                  <div className="ip-search-section">
                    <div className="ip-search-section-label">Stories ({results.stories.length})</div>
                    {results.stories.map(s => (
                      <div key={s.id} className="ip-search-result" onClick={() => onNavigate('story', s.id)}>
                        <span className="ip-search-result-dot" style={{ background: '#8b5cf6' }} />
                        <div className="ip-search-result-body">
                          <div className="ip-search-result-text">{s.title}</div>
                          {s.summary && <div className="ip-search-result-meta">{s.summary}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!q.trim() && (
          <div className="ip-search-hint">Type to search across all {questions.length} questions and {stories.length} stories</div>
        )}
      </div>
    </div>
  );
}

// ─── IPQuestionCard ───────────────────────────────────────────────
function IPQuestionCard({ q, selected, onClick }) {
  const status = q.status || 'draft';
  const daysAgo = q.lastPracticedAt
    ? Math.floor((Date.now() - new Date(q.lastPracticedAt)) / 86400000)
    : null;
  return (
    <div className={`ip-q-card${selected ? ' active' : ''}`} onClick={onClick}>
      <div className="ip-q-card-top">
        <span className="ip-q-status-dot" style={{ background: IP_STATUS_COLORS[status] }} title={IP_STATUS_LABELS[status]} />
        <span className="ip-q-text">{q.question}</span>
      </div>
      <div className="ip-q-card-meta">
        <span className="ip-q-conf">{'★'.repeat(q.confidence || 0)}{'☆'.repeat(5 - (q.confidence || 0))}</span>
        <span className="ip-q-last-label">{daysAgo === null ? 'Never' : daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</span>
        {ipIsDue(q) && <span className="ip-q-due-dot">Due</span>}
      </div>
    </div>
  );
}

// ─── IPQuestionList ───────────────────────────────────────────────
function IPQuestionList({ questions, selectedId, onSelect, onAdd }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQText, setNewQText] = useState('');
  const [newQStatus, setNewQStatus] = useState('draft');
  const [newQTags, setNewQTags] = useState('');

  const filtered = useMemo(() => {
    let qs = questions;
    if (search) qs = qs.filter(q => q.question.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'due') qs = qs.filter(ipIsDue);
    else if (filter === 'weak') qs = qs.filter(q => q.status === 'draft' || q.status === 'needs_work' || q.confidence <= 2);
    else if (filter !== 'all') qs = qs.filter(q => q.status === filter);
    return qs;
  }, [questions, search, filter]);

  const submitNew = () => {
    const t = newQText.trim(); if (!t) return;
    const tags = newQTags.split(',').map(x => x.trim()).filter(Boolean);
    onAdd(t, { status: newQStatus, tags });
    setNewQText(''); setNewQTags(''); setNewQStatus('draft');
    setShowAddForm(false);
  };

  const FILTERS = [
    { key: 'all', label: 'All' }, { key: 'due', label: 'Due' }, { key: 'weak', label: 'Weak' },
    { key: 'draft', label: 'Draft' }, { key: 'practice', label: 'Practice' },
    { key: 'strong', label: 'Strong' }, { key: 'interview_ready', label: 'Ready' },
  ];

  return (
    <div className="ip-mid">
      <div className="ip-mid-toolbar">
        <div className="ip-search-wrap">
          <input className="ip-search" type="text" placeholder="Search questions…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="ip-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
        <button className="ip-add-q-btn" onClick={() => setShowAddForm(s => !s)}>+ Add</button>
      </div>
      <div className="ip-filter-row">
        {FILTERS.map(f => (
          <button key={f.key} className={`ip-filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {showAddForm && (
        <div className="ip-add-q-form">
          <textarea className="ip-add-q-ta" placeholder="Type the interview question…"
            value={newQText} rows={3} autoFocus
            onChange={e => setNewQText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNew(); } }} />
          <div className="ip-add-q-extra">
            <select className="ip-add-q-status-sel" value={newQStatus} onChange={e => setNewQStatus(e.target.value)}>
              {Object.entries(IP_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="ip-add-q-tags-in" type="text" placeholder="Tags (comma-separated)"
              value={newQTags} onChange={e => setNewQTags(e.target.value)} />
          </div>
          <div className="ip-add-q-form-actions">
            <button className="ip-add-q-submit" onClick={submitNew} disabled={!newQText.trim()}>Add question</button>
            <button className="ip-add-q-cancel" onClick={() => { setShowAddForm(false); setNewQText(''); setNewQTags(''); setNewQStatus('draft'); }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="ip-q-list">
        {questions.length === 0 ? (
          <div className="ip-q-list-empty">
            <div>No questions in this category yet.</div>
            <button className="ip-add-q-btn" style={{ marginTop: 12 }} onClick={() => setShowAddForm(true)}>+ Add the first question</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ip-q-list-empty">No questions match this filter.</div>
        ) : filtered.map(q => (
          <IPQuestionCard key={q.id} q={q} selected={q.id === selectedId} onClick={() => onSelect(q.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── IPCategoryList ───────────────────────────────────────────────
function IPCategoryList({ ip, selectedId, onSelect, onAdd, onRename, onDelete, onReorder, stats }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const categories = ip.categories || [];

  const grouped = useMemo(() => {
    const m = {};
    categories.forEach(c => { const g = c.group || 'Other'; if (!m[g]) m[g] = []; m[g].push(c); });
    return m;
  }, [categories]);

  const submitNew = () => { const t = newName.trim(); if (!t) return; onAdd(t); setNewName(''); setShowAdd(false); };
  const submitRename = () => { const t = renameVal.trim(); if (t && renamingId) onRename(renamingId, t); setRenamingId(null); setRenameVal(''); };

  return (
    <div className="ip-left">
      <div className="ip-left-header">
        <span className="ip-left-title">Categories</span>
        <button className="ip-left-add-btn" onClick={() => setShowAdd(s => !s)} title="New category">+</button>
      </div>
      {showAdd && (
        <div className="ip-add-cat-row">
          <input className="ip-add-cat-input" placeholder="Category name…" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); } }} />
          <button className="ip-add-cat-ok" onClick={submitNew}>Add</button>
          <button className="ip-add-cat-x" onClick={() => { setShowAdd(false); setNewName(''); }}>×</button>
        </div>
      )}
      <div className="ip-cat-scroll">
        {IP_CAT_GROUPS.map(g => {
          const cats = (grouped[g] || []).sort((a, b) => a.order - b.order);
          if (cats.length === 0) return null;
          return (
            <div key={g} className="ip-cat-group">
              <div className="ip-cat-group-label">{g}</div>
              {cats.map((c, i) => {
                const s = stats[c.id] || { total: 0, due: 0 };
                const isRenaming = renamingId === c.id;
                return (
                  <div key={c.id} className={`ip-cat-item${selectedId === c.id ? ' active' : ''}`}
                    onClick={() => { if (!isRenaming) onSelect(c.id); }}>
                    <span className="ip-cat-dot" style={{ background: c.color }} />
                    {isRenaming ? (
                      <input className="ip-cat-rename-input" value={renameVal} autoFocus
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={submitRename}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') { setRenamingId(null); setRenameVal(''); } }}
                        onClick={e => e.stopPropagation()} />
                    ) : (
                      <div className="ip-cat-text">
                        <span className="ip-cat-name">{c.name}</span>
                        {s.due > 0 && <span className="ip-cat-due-tag">{s.due} due</span>}
                      </div>
                    )}
                    {!isRenaming && <span className="ip-cat-count">{s.total}</span>}
                    <div className="ip-cat-item-actions" onClick={e => e.stopPropagation()}>
                      <button className="ip-cat-action-btn" onClick={() => onReorder(c.id, 'up')} title="Move up" disabled={i === 0}>↑</button>
                      <button className="ip-cat-action-btn" onClick={() => onReorder(c.id, 'down')} title="Move down" disabled={i === cats.length - 1}>↓</button>
                      <button className="ip-cat-action-btn" onClick={() => { setRenamingId(c.id); setRenameVal(c.name); }} title="Rename">✏</button>
                      <button className="ip-cat-action-btn ip-cat-action-btn--del"
                        onClick={() => { if (window.confirm(`Delete "${c.name}"?\nQuestions will become uncategorized.`)) onDelete(c.id); }}
                        title="Delete">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── IPDashboard ──────────────────────────────────────────────────
function IPDashboard({ stats, onStartRehearsal, onStartMock }) {
  const noDue = stats.dueToday === 0;
  const estMin = Math.round(stats.dueToday * 2.5);
  const lastLabel = stats.lastPracticed
    ? new Date(stats.lastPracticed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;
  return (
    <div className="ip-dashboard">
      <div className="ip-dash-card">
        <div className="ip-dash-val">{stats.dueToday}</div>
        <div className="ip-dash-label">{noDue ? 'Recommended practice' : `Recommended today · ~${estMin} min`}</div>
      </div>
      <div className="ip-dash-card">
        <div className="ip-dash-val">{stats.interviewReady}<span className="ip-dash-denom"> / {stats.total}</span></div>
        <div className="ip-dash-label">Interview-ready</div>
      </div>
      {stats.avgConf && (
        <div className="ip-dash-card">
          <div className="ip-dash-val">{stats.avgConf}<span className="ip-dash-denom"> / 5</span></div>
          <div className="ip-dash-label">Avg confidence</div>
        </div>
      )}
      {stats.streak > 0 && (
        <div className="ip-dash-card">
          <div className="ip-dash-val">{stats.streak}<span className="ip-dash-denom">d</span></div>
          <div className="ip-dash-label">Practice streak</div>
        </div>
      )}
      {lastLabel && (
        <div className="ip-dash-card">
          <div className="ip-dash-val ip-dash-val--sm">{lastLabel}</div>
          <div className="ip-dash-label">Last practiced</div>
        </div>
      )}
      {stats.weakCats.length > 0 && (
        <div className="ip-dash-card ip-dash-card--wide">
          <div className="ip-dash-val ip-dash-val--sm">{stats.weakCats.join(' · ')}</div>
          <div className="ip-dash-label">Needs attention</div>
        </div>
      )}
      <div className="ip-dash-cta">
        <div className="ip-dash-alt-actions">
          {noDue ? (
            <>
              <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt" onClick={() => onStartRehearsal('weak')}>Practice weak</button>
              <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt" onClick={() => onStartRehearsal('ready')}>Review ready</button>
            </>
          ) : (
            <button className="ip-start-rehearsal-btn" onClick={() => onStartRehearsal('due')}>▶ Start rehearsal ({stats.dueToday})</button>
          )}
          <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt" onClick={() => onStartRehearsal('random')}>🎲 Random</button>
          <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt" onClick={onStartMock}>🎯 Mock interview</button>
        </div>
      </div>
    </div>
  );
}

// ─── IPProgressView ───────────────────────────────────────────────
function IPProgressView({ ip }) {
  const questions = ip.questions || [];
  const categories = ip.categories || [];

  const confDist = [1, 2, 3, 4, 5].map(n => ({
    n,
    count: questions.filter(q => (q.confidence || 1) === n).length,
    label: ['Weak', 'Struggling', 'Acceptable', 'Strong', 'Ready'][n - 1],
    color: IP_STATUS_COLORS[ipStatusFromConf(n)],
  }));
  const maxConf = Math.max(...confDist.map(d => d.count), 1);

  const catRows = categories.map(c => {
    const qs = questions.filter(q => q.categoryId === c.id);
    const ready = qs.filter(q => q.status === 'interview_ready').length;
    const practiced = qs.filter(q => q.lastPracticedAt).length;
    const pct = qs.length > 0 ? Math.round((ready / qs.length) * 100) : 0;
    return { ...c, total: qs.length, ready, practiced, pct };
  }).filter(c => c.total > 0).sort((a, b) => b.pct - a.pct);

  const statusDist = Object.keys(IP_STATUS_LABELS).map(k => ({
    key: k,
    label: IP_STATUS_LABELS[k],
    count: questions.filter(q => (q.status || 'draft') === k).length,
    color: IP_STATUS_COLORS[k],
  })).filter(d => d.count > 0);
  const maxStatus = Math.max(...statusDist.map(d => d.count), 1);

  return (
    <div className="ip-progress-view">
      <div className="ip-progress-cols">
        <div className="ip-progress-section">
          <div className="ip-progress-section-title">Confidence distribution</div>
          <div className="ip-conf-dist">
            {confDist.map(d => (
              <div key={d.n} className="ip-conf-dist-row">
                <span className="ip-conf-dist-label">{d.label}</span>
                <div className="ip-conf-dist-bar-wrap">
                  <div className="ip-conf-dist-bar" style={{ width: `${(d.count / maxConf) * 100}%`, background: d.color }} />
                </div>
                <span className="ip-conf-dist-count">{d.count}</span>
              </div>
            ))}
          </div>

          <div className="ip-progress-section-title" style={{ marginTop: 28 }}>Status breakdown</div>
          <div className="ip-conf-dist">
            {statusDist.map(d => (
              <div key={d.key} className="ip-conf-dist-row">
                <span className="ip-conf-dist-label">{d.label}</span>
                <div className="ip-conf-dist-bar-wrap">
                  <div className="ip-conf-dist-bar" style={{ width: `${(d.count / maxStatus) * 100}%`, background: d.color }} />
                </div>
                <span className="ip-conf-dist-count">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ip-progress-section">
          <div className="ip-progress-section-title">Category readiness</div>
          <div className="ip-cat-readiness">
            {catRows.map(c => (
              <div key={c.id} className="ip-cat-ready-row">
                <div className="ip-cat-ready-top">
                  <span className="ip-cat-dot" style={{ background: c.color }} />
                  <span className="ip-cat-ready-name">{c.name}</span>
                  <span className="ip-cat-ready-frac">{c.ready}/{c.total} ready</span>
                  <span className="ip-cat-ready-pct">{c.pct}%</span>
                </div>
                <div className="ip-cat-ready-bar-wrap">
                  <div className="ip-cat-ready-bar" style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── IPMockInterview ──────────────────────────────────────────────
function IPMockInterview({ questions, ip, onComplete, onExit }) {
  const [phase, setPhase] = useState('setup');
  const [pool, setPool] = useState('all');
  const [count, setCount] = useState(10);
  const [timeSecs, setTimeSecs] = useState(90);
  const [queue, setQueue] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [ratings, setRatings] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRunning && timer > 0) timerRef.current = setTimeout(() => setTimer(t => t - 1), 1000);
    else if (timerRunning && timer === 0) setTimerRunning(false);
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timer]);

  const startMock = () => {
    const q = ipBuildQueue(questions, pool, count);
    if (q.length === 0) { window.alert('No questions available for this selection.'); return; }
    setQueue(q); setQIdx(0); setTimer(timeSecs); setTimerRunning(true); setRatings({});
    setPhase('interview');
  };

  const nextQ = () => {
    clearTimeout(timerRef.current); setTimerRunning(false);
    if (qIdx < queue.length - 1) {
      setQIdx(i => i + 1); setTimer(timeSecs); setTimerRunning(true);
    } else {
      setPhase('review');
    }
  };

  const submitReview = () => {
    onComplete(queue.map(q => ({ id: q.id, rating: ratings[q.id] || 3 })));
  };

  if (phase === 'setup') {
    return (
      <div className="ip-mock-setup">
        <div className="ip-mock-setup-title">Mock Interview</div>
        <div className="ip-mock-setup-desc">
          Simulate a real interview. Answer each question verbally — no hints, no answers shown.<br />
          Rate yourself honestly at the end.
        </div>
        <div className="ip-mock-field">
          <label className="ip-mock-label">Question pool</label>
          <div className="ip-mock-options">
            {[{k:'all',l:'All questions'},{k:'due',l:'Due today'},{k:'weak',l:'Weak areas'},{k:'random',l:'Random'}].map(o => (
              <button key={o.k} className={`ip-mock-opt${pool === o.k ? ' active' : ''}`} onClick={() => setPool(o.k)}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="ip-mock-field">
          <label className="ip-mock-label">Number of questions</label>
          <div className="ip-mock-options">
            {[5, 10, 15, 20].map(n => (
              <button key={n} className={`ip-mock-opt${count === n ? ' active' : ''}`} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="ip-mock-field">
          <label className="ip-mock-label">Time per question</label>
          <div className="ip-mock-options">
            {[{s:60,l:'60s'},{s:90,l:'90s'},{s:120,l:'2 min'},{s:180,l:'3 min'}].map(o => (
              <button key={o.s} className={`ip-mock-opt${timeSecs === o.s ? ' active' : ''}`} onClick={() => setTimeSecs(o.s)}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="ip-mock-actions">
          <button className="ip-start-rehearsal-btn" onClick={startMock}>▶ Start mock interview</button>
          <button className="ip-block-cancel-btn" style={{ marginLeft: 10 }} onClick={onExit}>Cancel</button>
        </div>
      </div>
    );
  }

  if (phase === 'interview') {
    const q = queue[qIdx];
    const cat = q ? (ip.categories || []).find(c => c.id === q.categoryId) : null;
    const urgent = timer <= 15 && timer > 0;
    const expired = timer === 0 && !timerRunning;
    return (
      <div className="ip-mock-interview">
        <div className="ip-mock-progress-bar">
          <button className="ip-rehearsal-exit-btn" onClick={() => { if (window.confirm('End mock interview? Progress will be lost.')) onExit(); }}>End mock</button>
          <div className="ip-mock-progress-center">
            {cat && <span className="ip-rehearsal-cat-label" style={{ color: cat.color }}>● {cat.name}</span>}
            <span className="ip-rehearsal-q-count">Question {qIdx + 1} of {queue.length}</span>
          </div>
          <div style={{ width: 80 }} />
        </div>
        <div className={`ip-mock-timer${urgent ? ' ip-mock-timer--urgent' : ''}${expired ? ' ip-mock-timer--done' : ''}`}>
          {Math.floor(timer / 60)}:{pad(timer % 60)}
        </div>
        <div className="ip-mock-question">{q.question}</div>
        {expired && <div className="ip-mock-time-up">Time — move to next question when ready</div>}
        <div className="ip-mock-controls">
          <button className="ip-rehearsal-btn ip-rehearsal-btn--primary" onClick={nextQ}>
            {qIdx < queue.length - 1 ? 'Next question →' : 'Finish → Rate answers'}
          </button>
        </div>
        <div className="ip-mock-hint">Answer verbally. Simulate the real interview — no notes.</div>
      </div>
    );
  }

  if (phase === 'review') {
    const rated = Object.keys(ratings).length;
    const avgRating = queue.length > 0
      ? (queue.reduce((s, q) => s + (ratings[q.id] || 0), 0) / queue.length).toFixed(1)
      : '–';
    return (
      <div className="ip-mock-review">
        <div className="ip-mock-review-header">
          <div className="ip-mock-review-title">Rate your answers</div>
          <div className="ip-mock-review-sub">{rated}/{queue.length} rated · avg {rated > 0 ? avgRating : '–'} / 5</div>
        </div>
        <div className="ip-mock-review-list">
          {queue.map((q, i) => {
            const cat = (ip.categories || []).find(c => c.id === q.categoryId);
            return (
              <div key={q.id} className="ip-mock-review-row">
                <div className="ip-mock-review-q">
                  <span className="ip-mock-review-num">{i + 1}</span>
                  <div className="ip-mock-review-q-body">
                    {cat && <span className="ip-mock-review-cat" style={{ color: cat.color }}>● {cat.name}</span>}
                    <div className="ip-mock-review-q-text">{q.question}</div>
                  </div>
                </div>
                <div className="ip-rate-btns">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n}
                      className={`ip-conf-btn ip-conf-btn--${n}${ratings[q.id] === n ? ' ip-conf-btn--sel' : ''}`}
                      style={{ opacity: ratings[q.id] && ratings[q.id] !== n ? 0.35 : 1 }}
                      onClick={() => setRatings(r => ({ ...r, [q.id]: n }))}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ip-mock-review-footer">
          <button className="ip-start-rehearsal-btn" onClick={submitReview}>
            Save ratings &amp; finish
          </button>
          <button className="ip-block-cancel-btn" style={{ marginLeft: 10 }} onClick={onExit}>Discard &amp; exit</button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── InterviewPrepScreen ──────────────────────────────────────────
function InterviewPrepScreen({ data, onPersist, onBack }) {
  const ip = data.interviewPrep || { categories: [], questions: [], stories: [] };

  const persistData = useCallback((mutator) => {
    const next = typeof mutator === 'function' ? mutator(data) : mutator;
    onPersist({ ...next, lastModified: new Date().toISOString() });
  }, [data, onPersist]);

  const persistIP = useCallback((fn) => {
    persistData(d => {
      const cur = d.interviewPrep || { categories: [], questions: [], stories: [] };
      return { ...d, interviewPrep: fn(cur) };
    });
  }, [persistData]);

  const [selCatId, setSelCatId] = useState(() => ((ip.categories || [])[0] || {}).id || null);
  const [selQId, setSelQId] = useState(null);
  const [mode, setMode] = useState('browse'); // 'browse'|'rehearse'|'stories'|'progress'|'mock'
  const [rehearseQueue, setRehearseQueue] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  const categories = ip.categories || [];
  const questions = ip.questions || [];
  const stories = ip.stories || [];

  const catQuestions = useMemo(
    () => selCatId ? questions.filter(q => q.categoryId === selCatId) : questions,
    [questions, selCatId]
  );
  const selectedQ = useMemo(() => questions.find(q => q.id === selQId) || null, [questions, selQId]);
  const stats = useMemo(() => ipComputeStats(ip), [ip]);

  // Category handlers
  const addCategory = useCallback((name) => {
    const COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EC4899','#EF4444','#0D9488','#0891B2'];
    const id = `ipc-${Date.now()}`;
    persistIP(cur => ({ ...cur, categories: [...cur.categories, { id, name: name.trim(), group: 'Other', color: COLORS[categories.length % COLORS.length], order: categories.length + 1 }] }));
    setSelCatId(id);
  }, [categories, persistIP]);

  const renameCategory = useCallback((catId, name) => {
    persistIP(cur => ({ ...cur, categories: cur.categories.map(c => c.id === catId ? { ...c, name } : c) }));
  }, [persistIP]);

  const deleteCategory = useCallback((catId) => {
    persistIP(cur => ({ ...cur, categories: cur.categories.filter(c => c.id !== catId), questions: cur.questions.map(q => q.categoryId === catId ? { ...q, categoryId: null } : q) }));
    if (selCatId === catId) setSelCatId(null);
  }, [persistIP, selCatId]);

  const reorderCategory = useCallback((catId, direction) => {
    persistIP(cur => {
      const target = cur.categories.find(c => c.id === catId);
      if (!target) return cur;
      const groupCats = cur.categories.filter(c => (c.group || 'Other') === (target.group || 'Other')).sort((a, b) => a.order - b.order);
      const idx = groupCats.findIndex(c => c.id === catId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= groupCats.length) return cur;
      const sw = groupCats[swapIdx];
      const ao = target.order, bo = sw.order;
      return { ...cur, categories: cur.categories.map(c => c.id === catId ? { ...c, order: bo } : c.id === sw.id ? { ...c, order: ao } : c) };
    });
  }, [persistIP]);

  // Question handlers
  const addQuestion = useCallback((text, opts = {}) => {
    const now = new Date().toISOString();
    const newQ = { id: `ipq-${Date.now()}`, categoryId: selCatId || (categories[0] || {}).id, question: text.trim(), status: opts.status || 'draft', confidence: 1, tags: opts.tags || [], linkedStoryIds: [], createdAt: now, updatedAt: now, lastPracticedAt: null, nextPracticeAt: null, rehearsalCount: 0, answer: {} };
    persistIP(cur => ({ ...cur, questions: [...cur.questions, newQ] }));
    setSelQId(newQ.id);
  }, [selCatId, categories, persistIP]);

  const updateAnswer = useCallback((qId, field, val) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.map(q => q.id === qId ? { ...q, answer: { ...q.answer, [field]: val }, updatedAt: new Date().toISOString() } : q) }));
  }, [persistIP]);

  const updateQuestion = useCallback((qId, updates) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.map(q => q.id === qId ? { ...q, ...updates, updatedAt: new Date().toISOString() } : q) }));
  }, [persistIP]);

  const deleteQuestion = useCallback((qId) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.filter(q => q.id !== qId) }));
    if (selQId === qId) setSelQId(null);
  }, [persistIP, selQId]);

  const duplicateQuestion = useCallback((qId) => {
    const q = questions.find(x => x.id === qId); if (!q) return;
    const now = new Date().toISOString();
    const copy = { ...q, id: `ipq-${Date.now()}`, question: q.question + ' (copy)', status: 'draft', confidence: 1, lastPracticedAt: null, nextPracticeAt: null, rehearsalCount: 0, createdAt: now, updatedAt: now, answer: { ...q.answer }, tags: [...(q.tags || [])], linkedStoryIds: [] };
    persistIP(cur => ({ ...cur, questions: [...cur.questions, copy] }));
    setSelQId(copy.id);
  }, [questions, persistIP]);

  const moveQuestion = useCallback((qId, catId) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.map(q => q.id === qId ? { ...q, categoryId: catId, updatedAt: new Date().toISOString() } : q) }));
    setSelQId(null);
  }, [persistIP]);

  const markReady = useCallback((qId) => {
    const q = questions.find(x => x.id === qId); if (!q) return;
    if ((q.confidence || 1) < 4 && !window.confirm('Confidence is below 4. Mark as interview-ready anyway?')) return;
    updateQuestion(qId, { status: 'interview_ready', confidence: 5, nextPracticeAt: ipNextPractice(5) });
  }, [questions, updateQuestion]);

  const linkStory = useCallback((qId, storyId) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.map(q => q.id === qId ? { ...q, linkedStoryIds: [...new Set([...(q.linkedStoryIds || []), storyId])] } : q) }));
  }, [persistIP]);

  const unlinkStory = useCallback((qId, storyId) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.map(q => q.id === qId ? { ...q, linkedStoryIds: (q.linkedStoryIds || []).filter(id => id !== storyId) } : q) }));
  }, [persistIP]);

  // Story handlers
  const addStory = useCallback(() => {
    const id = `ips-${Date.now()}`;
    const now = new Date().toISOString();
    persistIP(cur => ({ ...cur, stories: [...(cur.stories || []), { id, title: 'New story', summary: '', situation: '', action: '', result: '', learning: '', metrics: '', whereToUse: '', tags: [], createdAt: now, updatedAt: now }] }));
    return id;
  }, [persistIP]);

  const updateStory = useCallback((storyId, updates) => {
    persistIP(cur => ({ ...cur, stories: (cur.stories || []).map(s => s.id === storyId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s) }));
  }, [persistIP]);

  const deleteStory = useCallback((storyId) => {
    persistIP(cur => ({ ...cur, stories: (cur.stories || []).filter(s => s.id !== storyId), questions: cur.questions.map(q => ({ ...q, linkedStoryIds: (q.linkedStoryIds || []).filter(id => id !== storyId) })) }));
  }, [persistIP]);

  // Rehearsal handlers
  const startRehearsal = useCallback((queueMode = 'due') => {
    const pool = catQuestions.length > 0 ? catQuestions : questions;
    const queue = ipBuildQueue(pool, queueMode);
    if (queue.length === 0) { window.alert('No questions to practice in this selection.'); return; }
    setRehearseQueue(queue); setMode('rehearse');
  }, [catQuestions, questions]);

  const startGlobalRehearsal = useCallback((queueMode = 'due') => {
    const queue = ipBuildQueue(questions, queueMode);
    if (queue.length === 0) { window.alert('No questions to practice in this selection.'); return; }
    setRehearseQueue(queue); setMode('rehearse');
  }, [questions]);

  const rehearseOne = useCallback((qId) => {
    const q = questions.find(x => x.id === qId); if (!q) return;
    setRehearseQueue([q]); setMode('rehearse');
  }, [questions]);

  const handleRate = useCallback((qId, conf) => {
    const q = questions.find(x => x.id === qId);
    updateQuestion(qId, { confidence: conf, status: ipStatusFromConf(conf), lastPracticedAt: new Date().toISOString(), nextPracticeAt: ipNextPractice(conf), rehearsalCount: ((q && q.rehearsalCount) || 0) + 1 });
  }, [questions, updateQuestion]);

  // Mock interview handler — batch-updates all ratings in one persist call
  const handleMockComplete = useCallback((ratings) => {
    const now = new Date().toISOString();
    const ratingMap = {};
    ratings.forEach(({ id, rating }) => { ratingMap[id] = rating; });
    persistIP(cur => ({
      ...cur,
      questions: cur.questions.map(q => {
        const rating = ratingMap[q.id];
        if (!rating) return q;
        return { ...q, confidence: rating, status: ipStatusFromConf(rating), lastPracticedAt: now, nextPracticeAt: ipNextPractice(rating), rehearsalCount: (q.rehearsalCount || 0) + 1, updatedAt: now };
      }),
    }));
    setMode('browse');
  }, [persistIP]);

  // Global search navigation
  const navigateToResult = useCallback((type, id, catId) => {
    if (type === 'story') {
      setMode('stories');
    } else {
      if (catId) setSelCatId(catId);
      setSelQId(id);
      setMode('browse');
    }
    setShowSearch(false);
  }, []);

  // Export / Import
  const exportData = useCallback(() => {
    const json = JSON.stringify(ip, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-prep-${new Date().toISOString().substring(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [ip]);

  const importData = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.questions)) {
          window.alert('Invalid file: must contain categories and questions arrays.'); return;
        }
        if (!window.confirm(`Import ${parsed.questions.length} questions and ${(parsed.stories || []).length} stories?\nThis replaces your current Interview Prep data.`)) return;
        persistIP(() => ({ categories: parsed.categories, questions: parsed.questions, stories: parsed.stories || [] }));
      } catch { window.alert('Invalid JSON file.'); }
    };
    reader.readAsText(file);
  }, [persistIP]);

  // Shared search overlay (renders on top of any mode)
  const searchOverlay = showSearch && (
    <IPGlobalSearch
      questions={questions} stories={stories} categories={categories}
      onNavigate={navigateToResult} onClose={() => setShowSearch(false)}
    />
  );

  // ── Render modes ──────────────────────────────────────────────
  if (mode === 'rehearse') {
    return (
      <div className="ip-screen">
        {searchOverlay}
        <IPRehearsalView queue={rehearseQueue} ip={ip} onRate={handleRate} onExit={() => { setMode('browse'); setRehearseQueue([]); }} />
      </div>
    );
  }

  if (mode === 'stories') {
    return (
      <div className="ip-screen">
        {searchOverlay}
        <div className="ip-topbar">
          <button className="ip-back-btn" onClick={() => setMode('browse')}>← Questions</button>
          <div className="ip-topbar-center">
            <span className="ip-topbar-title">Story Bank</span>
            <span className="ip-topbar-sub">{stories.length} {stories.length === 1 ? 'story' : 'stories'}</span>
          </div>
          <div className="ip-topbar-right">
            <button className="ip-topbar-btn-sm" onClick={() => setShowSearch(true)} title="Search">🔍</button>
          </div>
        </div>
        <IPStoryBankView ip={ip} onAddStory={addStory} onUpdateStory={updateStory} onDeleteStory={deleteStory} />
      </div>
    );
  }

  if (mode === 'progress') {
    return (
      <div className="ip-screen">
        {searchOverlay}
        <div className="ip-topbar">
          <button className="ip-back-btn" onClick={() => setMode('browse')}>← Questions</button>
          <div className="ip-topbar-center">
            <span className="ip-topbar-title">Progress</span>
            <span className="ip-topbar-sub">{stats.total} questions · {stats.interviewReady} interview-ready</span>
          </div>
          <div className="ip-topbar-right">
            <button className="ip-topbar-btn-sm" onClick={() => setShowSearch(true)} title="Search">🔍</button>
          </div>
        </div>
        <IPProgressView ip={ip} />
      </div>
    );
  }

  if (mode === 'mock') {
    return (
      <div className="ip-screen">
        <div className="ip-topbar">
          <button className="ip-back-btn" onClick={() => setMode('browse')}>← Questions</button>
          <div className="ip-topbar-center">
            <span className="ip-topbar-title">Mock Interview</span>
            </div>
          <div className="ip-topbar-right" />
        </div>
        <IPMockInterview questions={questions} ip={ip} onComplete={handleMockComplete} onExit={() => setMode('browse')} />
      </div>
    );
  }

  // ── Browse mode (main) ────────────────────────────────────────
  return (
    <div className="ip-screen">
      {searchOverlay}
      <div className="ip-topbar">
        <button className="ip-back-btn" onClick={onBack}>← Calendar</button>
        <div className="ip-topbar-center">
          <span className="ip-topbar-title">Interview Prep</span>
        </div>
        <div className="ip-topbar-right">
          <button className="ip-topbar-btn-sm" onClick={() => setShowSearch(true)} title="Search all">🔍</button>
          <button className="ip-topbar-stories-btn" onClick={() => setMode('stories')}>
            Story Bank{stories.length > 0 ? ` (${stories.length})` : ''}
          </button>
          <button className="ip-topbar-stories-btn" onClick={() => setMode('progress')}>Progress</button>
          <button className="ip-topbar-stories-btn" onClick={exportData}>Export</button>
          <label className="ip-topbar-stories-btn ip-topbar-import-lbl">
            Import
            <input type="file" accept=".json" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } }} />
          </label>
          <button className="ip-topbar-rehearse-btn" onClick={() => startRehearsal('due')}>
            ▶ Rehearsal{stats.dueToday > 0 ? ` (${stats.dueToday})` : ''}
          </button>
        </div>
      </div>
      <IPDashboard stats={stats} onStartRehearsal={startGlobalRehearsal} onStartMock={() => setMode('mock')} />
      <div className="ip-cols">
        <IPCategoryList ip={ip} selectedId={selCatId}
          onSelect={id => { setSelCatId(id); setSelQId(null); }}
          onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory} onReorder={reorderCategory}
          stats={stats.catStats} />
        <IPQuestionList questions={catQuestions} selectedId={selQId} onSelect={setSelQId} onAdd={addQuestion} />
        <IPWorkspace question={selectedQ} ip={ip}
          onUpdateAnswer={updateAnswer} onUpdateQuestion={updateQuestion}
          onRehearseOne={rehearseOne} onMarkReady={markReady}
          onDelete={deleteQuestion} onDuplicate={duplicateQuestion} onMove={moveQuestion}
          onLinkStory={linkStory} onUnlinkStory={unlinkStory} />
      </div>
    </div>
  );
}

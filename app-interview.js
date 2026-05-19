// ═══════════════════════════════════════════════════════════════════
// INTERVIEW PREP PAGE
// Full-page interview rehearsal cockpit for Senior AE / Salesforce prep.
// ═══════════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────────
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
  { field: 'coreMessage',        label: 'Core message',          primary: true,  placeholder: 'One or two sentences. The spine of your answer.' },
  { field: 'answer60Sec',        label: '60-second answer',      primary: true,  placeholder: 'The main version to master. Clear, structured, confident.' },
  { field: 'proofStory',         label: 'Proof story',           primary: true,  placeholder: 'Situation:\nAction:\nResult:\nLearning:' },
  { field: 'metrics',            label: 'Metrics / evidence',    primary: true,  placeholder: 'Specific numbers, deal sizes, business impact…' },
  { field: 'salesforceRelevance',label: 'Salesforce relevance',  primary: false, placeholder: 'How this connects to Salesforce, enterprise SaaS, Senior AE expectations.' },
  { field: 'answer30Sec',        label: '30-second answer',      primary: false, placeholder: 'For fast screening questions. Short and sharp.' },
  { field: 'expandedAnswer',     label: '2–3 minute answer',     primary: false, placeholder: 'When the interviewer asks for depth or follow-up.' },
  { field: 'keywords',           label: 'Keywords to include',   primary: false, placeholder: 'MEDDPICC · Mutual action plan · Economic buyer · Close plan…' },
  { field: 'watchOuts',          label: 'Watch-outs / avoid',    primary: false, placeholder: 'Mistakes to avoid. Things not to say.' },
  { field: 'notes',              label: 'Notes',                 primary: false, placeholder: 'Free-form notes.' },
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
  return { dueToday, total, interviewReady, weakCats, catStats, avgConf };
}

function ipBuildQueue(questions, mode) {
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
  }).slice(0, 12);
}

// ─── IPAnswerBlock ────────────────────────────────────────────────
function IPAnswerBlock({ field, label, placeholder, value, primary, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const taRef = useRef(null);
  const savedTimerRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  const autoResize = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };

  useEffect(() => {
    if (editing && taRef.current) { taRef.current.focus(); autoResize(taRef.current); }
  }, [editing]);

  const save = () => {
    onChange(field, draft);
    setEditing(false);
    setSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
  };
  const cancel = () => { setDraft(value || ''); setEditing(false); };

  return (
    <div className={`ip-block${primary ? ' ip-block--primary' : ''}`}>
      <div className="ip-block-header">
        <span className="ip-block-label">{label}</span>
        <div className="ip-block-header-right">
          {saved && !editing && <span className="ip-block-saved">✓ Saved</span>}
          {!editing && (
            <button className="ip-block-edit-btn" onClick={() => setEditing(true)}>
              {value ? 'Edit' : '+ Add'}
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="ip-block-edit">
          <textarea
            ref={taRef}
            className="ip-block-ta"
            value={draft}
            rows={4}
            placeholder={placeholder}
            onChange={e => { setDraft(e.target.value); autoResize(e.target); }}
          />
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
    if (timerRunning && timerSecs > 0) {
      timerRef.current = setTimeout(() => setTimerSecs(s => s - 1), 1000);
    } else if (timerRunning && timerSecs === 0) {
      setTimerRunning(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerSecs]);

  const startTimer = (s) => { clearTimeout(timerRef.current); setTimerSecs(s); setTimerRunning(true); };
  const resetState = () => { setPhase('question'); setShowHints(false); setTimerSecs(null); setTimerRunning(false); clearTimeout(timerRef.current); };

  const handleRate = (conf) => {
    onRate(q.id, conf);
    if (idx < queue.length - 1) { setIdx(i => i + 1); resetState(); }
    else onExit();
  };

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
            <button key={s} className={`ip-timer-preset${timerSecs !== null && timerRunning ? ' active' : ''}`}
              onClick={() => startTimer(s)}>
              {s < 60 ? `${s}s` : `${s / 60}min`}
            </button>
          ))}
        </div>
      </div>

      <div className="ip-rehearsal-body">
        {timerSecs !== null && (
          <div className={`ip-timer-display${timerSecs === 0 ? ' done' : ''}`}>
            {timerSecs > 0
              ? `${Math.floor(timerSecs / 60)}:${pad(timerSecs % 60)}`
              : 'Time — show your answer'}
          </div>
        )}

        <div className="ip-rehearsal-question">{q.question}</div>

        {phase === 'question' && (
          <div className="ip-rehearsal-controls">
            <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary"
              onClick={() => setShowHints(h => !h)}>
              {showHints ? 'Hide hints' : 'Show hints'}
            </button>
            <button className="ip-rehearsal-btn ip-rehearsal-btn--primary"
              onClick={() => setPhase('answer')}>
              Show answer
            </button>
          </div>
        )}

        {showHints && phase === 'question' && (
          <div className="ip-rehearsal-hints">
            {q.answer.coreMessage && (
              <div className="ip-hint-row"><span className="ip-hint-icon">💡</span><span>{q.answer.coreMessage}</span></div>
            )}
            {q.answer.keywords && (
              <div className="ip-hint-row"><span className="ip-hint-icon">🔑</span><span>{q.answer.keywords}</span></div>
            )}
            {!q.answer.coreMessage && !q.answer.keywords && (
              <div className="ip-hint-row" style={{ color: 'var(--muted-3)' }}>No hints yet — add a core message or keywords first.</div>
            )}
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
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className={`ip-conf-btn ip-conf-btn--${n}`} onClick={() => handleRate(n)}>
                    {n === 1 ? '1 Weak' : n === 5 ? '5 Ready' : n}
                  </button>
                ))}
              </div>
              <div className="ip-rehearsal-nav">
                <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary" onClick={resetState}>Practice again</button>
                {idx < queue.length - 1 && (
                  <button className="ip-rehearsal-btn ip-rehearsal-btn--secondary"
                    onClick={() => { setIdx(i => i + 1); resetState(); }}>
                    Skip →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IPWorkspace ──────────────────────────────────────────────────
function IPWorkspace({ question, ip, onUpdateAnswer, onUpdateQuestion, onRehearseOne, onMarkReady, onDelete, onDuplicate, onMove }) {
  const [showAll, setShowAll] = useState(false);
  const [editingQText, setEditingQText] = useState(false);
  const [qTextDraft, setQTextDraft] = useState('');
  const [tagInput, setTagInput] = useState('');

  const questionId = question ? question.id : null;
  useEffect(() => {
    setShowAll(false);
    setEditingQText(false);
    setTagInput('');
  }, [questionId]);

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

  const addTag = (raw) => {
    const t = raw.trim().replace(/,/g, '');
    if (!t || (question.tags || []).includes(t)) { setTagInput(''); return; }
    onUpdateQuestion(question.id, { tags: [...(question.tags || []), t] });
    setTagInput('');
  };

  const removeTag = (tag) => {
    onUpdateQuestion(question.id, { tags: (question.tags || []).filter(t => t !== tag) });
  };

  const nextDueLabel = question.nextPracticeAt
    ? new Date(question.nextPracticeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="ip-right ip-workspace">
      <div className="ip-workspace-header">
        {editingQText ? (
          <div className="ip-ws-q-edit">
            <textarea
              className="ip-ws-q-ta"
              value={qTextDraft}
              rows={3}
              autoFocus
              onChange={e => setQTextDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveQText(); } }}
            />
            <div className="ip-ws-q-actions">
              <button className="ip-block-save-btn" onClick={saveQText}>Save</button>
              <button className="ip-block-cancel-btn" onClick={() => setEditingQText(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="ip-ws-question" onClick={() => { setQTextDraft(question.question); setEditingQText(true); }}
            title="Click to edit question text">
            {question.question}
          </div>
        )}

        <div className="ip-ws-meta-row">
          {cat && <span className="ip-ws-cat-chip" style={{ background: cat.color + '22', color: cat.color }}>● {cat.name}</span>}
          <span className="ip-ws-status-chip" style={{ background: IP_STATUS_COLORS[status] + '22', color: IP_STATUS_COLORS[status] }}>
            {IP_STATUS_LABELS[status]}
          </span>
          <span className="ip-ws-conf-stars">
            {'★'.repeat(conf)}{'☆'.repeat(5 - conf)}
          </span>
          {question.lastPracticedAt
            ? <span className="ip-ws-last">Last: {new Date(question.lastPracticedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            : <span className="ip-ws-last ip-ws-last--never">Never practiced</span>
          }
          {nextDueLabel && <span className="ip-ws-last">Next: {nextDueLabel}</span>}
          {ipIsDue(question) && <span className="ip-ws-due-badge">● Due</span>}
        </div>

        <div className="ip-ws-tags-row">
          {(question.tags || []).map(t => (
            <span key={t} className="ip-ws-tag-chip">
              {t}
              <button className="ip-ws-tag-remove" onClick={() => removeTag(t)}>×</button>
            </span>
          ))}
          <input
            className="ip-ws-tag-input"
            value={tagInput}
            placeholder="+ tag"
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
              if (e.key === 'Backspace' && !tagInput && (question.tags || []).length > 0) {
                removeTag(question.tags[question.tags.length - 1]);
              }
            }}
          />
        </div>

        <div className="ip-ws-action-row">
          <button className="ip-ws-btn ip-ws-btn--primary" onClick={() => onRehearseOne(question.id)}>▶ Rehearse</button>
          {status !== 'interview_ready' && (
            <button className="ip-ws-btn" onClick={() => onMarkReady(question.id)}>✓ Mark ready</button>
          )}
          <button className="ip-ws-btn" onClick={() => onDuplicate(question.id)}>⊕ Duplicate</button>
          <select className="ip-ws-move-select"
            value={question.categoryId || ''}
            onChange={e => { if (e.target.value && e.target.value !== question.categoryId) onMove(question.id, e.target.value); }}>
            <option value="" disabled>Move to…</option>
            {(ip.categories || []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="ip-ws-btn ip-ws-btn--danger" onClick={() => { if (window.confirm('Delete this question?')) onDelete(question.id); }}>Delete</button>
        </div>
      </div>

      <div className="ip-blocks-area">
        {visibleBlocks.map(b => (
          <IPAnswerBlock
            key={b.field}
            field={b.field}
            label={b.label}
            placeholder={b.placeholder}
            value={question.answer[b.field] || ''}
            primary={b.primary}
            onChange={(field, val) => onUpdateAnswer(question.id, field, val)}
          />
        ))}
        {!showAll && hiddenCount > 0 && (
          <button className="ip-show-all-btn" onClick={() => setShowAll(true)}>
            + Show {hiddenCount} more section{hiddenCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── IPQuestionCard ───────────────────────────────────────────────
function IPQuestionCard({ q, selected, onClick }) {
  const status = q.status || 'draft';
  const due = ipIsDue(q);
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
        <span className="ip-q-last-label">
          {daysAgo === null ? 'Never practiced' : daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
        </span>
        {due && <span className="ip-q-due-dot">Due</span>}
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

  const filtered = useMemo(() => {
    let qs = questions;
    if (search) qs = qs.filter(q => q.question.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'due') qs = qs.filter(ipIsDue);
    else if (filter === 'weak') qs = qs.filter(q => q.status === 'draft' || q.status === 'needs_work' || q.confidence <= 2);
    else if (filter !== 'all') qs = qs.filter(q => q.status === filter);
    return qs;
  }, [questions, search, filter]);

  const submitNew = () => {
    const t = newQText.trim();
    if (!t) return;
    onAdd(t);
    setNewQText('');
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
            value={newQText} rows={3}
            onChange={e => setNewQText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNew(); } }}
            autoFocus
          />
          <div className="ip-add-q-form-actions">
            <button className="ip-add-q-submit" onClick={submitNew} disabled={!newQText.trim()}>Add question</button>
            <button className="ip-add-q-cancel" onClick={() => { setShowAddForm(false); setNewQText(''); }}>Cancel</button>
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
          <IPQuestionCard key={q.id} q={q} selected={q.id === selectedId}
            onClick={() => onSelect(q.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── IPCategoryList ───────────────────────────────────────────────
function IPCategoryList({ ip, selectedId, onSelect, onAdd, onRename, onDelete, stats }) {
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

  const submitNew = () => {
    const t = newName.trim();
    if (!t) return;
    onAdd(t);
    setNewName('');
    setShowAdd(false);
  };

  const submitRename = () => {
    const t = renameVal.trim();
    if (t && renamingId) onRename(renamingId, t);
    setRenamingId(null);
    setRenameVal('');
  };

  return (
    <div className="ip-left">
      <div className="ip-left-header">
        <span className="ip-left-title">Categories</span>
        <button className="ip-left-add-btn" onClick={() => setShowAdd(s => !s)} title="New category">+</button>
      </div>

      {showAdd && (
        <div className="ip-add-cat-row">
          <input className="ip-add-cat-input" placeholder="Category name…" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); } }}
            autoFocus />
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
              {cats.map(c => {
                const s = stats[c.id] || { total: 0, ready: 0, due: 0 };
                const isRenaming = renamingId === c.id;
                return (
                  <div key={c.id} className={`ip-cat-item${selectedId === c.id ? ' active' : ''}`}
                    onClick={() => { if (!isRenaming) onSelect(c.id); }}>
                    <span className="ip-cat-dot" style={{ background: c.color }} />
                    {isRenaming ? (
                      <input
                        className="ip-cat-rename-input"
                        value={renameVal}
                        autoFocus
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={submitRename}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') submitRename();
                          if (e.key === 'Escape') { setRenamingId(null); setRenameVal(''); }
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <div className="ip-cat-text">
                        <span className="ip-cat-name">{c.name}</span>
                        {s.due > 0 && <span className="ip-cat-due-tag">{s.due} due</span>}
                      </div>
                    )}
                    {!isRenaming && <span className="ip-cat-count">{s.total}</span>}
                    <div className="ip-cat-item-actions" onClick={e => e.stopPropagation()}>
                      <button className="ip-cat-action-btn"
                        onClick={() => { setRenamingId(c.id); setRenameVal(c.name); }}
                        title="Rename">✏</button>
                      <button className="ip-cat-action-btn ip-cat-action-btn--del"
                        onClick={() => {
                          if (window.confirm(`Delete "${c.name}"?\nQuestions will become uncategorized.`)) onDelete(c.id);
                        }}
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
function IPDashboard({ stats, onStartRehearsal }) {
  const noDue = stats.dueToday === 0;
  const estMin = Math.round(stats.dueToday * 2.5);
  return (
    <div className="ip-dashboard">
      <div className="ip-dash-card">
        <div className="ip-dash-val">{stats.dueToday}</div>
        <div className="ip-dash-label">
          {noDue ? 'Recommended practice' : `Recommended today · ~${estMin} min`}
        </div>
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
      {stats.weakCats.length > 0 && (
        <div className="ip-dash-card ip-dash-card--wide">
          <div className="ip-dash-val ip-dash-val--sm">{stats.weakCats.join(' · ')}</div>
          <div className="ip-dash-label">Needs attention</div>
        </div>
      )}
      <div className="ip-dash-cta">
        {noDue ? (
          <div className="ip-dash-alt-actions">
            <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt"
              onClick={() => onStartRehearsal('weak')}>Practice weak</button>
            <button className="ip-start-rehearsal-btn ip-start-rehearsal-btn--alt"
              onClick={() => onStartRehearsal('ready')}>Review ready</button>
          </div>
        ) : (
          <button className="ip-start-rehearsal-btn" onClick={() => onStartRehearsal('due')}>
            ▶ Start rehearsal ({stats.dueToday})
          </button>
        )}
      </div>
    </div>
  );
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
  const [mode, setMode] = useState('browse');
  const [rehearseQueue, setRehearseQueue] = useState([]);

  const categories = ip.categories || [];
  const questions = ip.questions || [];

  const catQuestions = useMemo(
    () => selCatId ? questions.filter(q => q.categoryId === selCatId) : questions,
    [questions, selCatId]
  );

  const selectedQ = useMemo(() => questions.find(q => q.id === selQId) || null, [questions, selQId]);
  const stats = useMemo(() => ipComputeStats(ip), [ip]);

  // ─── Category handlers ────────────────────
  const addCategory = useCallback((name) => {
    const COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EC4899','#EF4444','#0D9488','#0891B2'];
    const id = `ipc-${Date.now()}`;
    const newCat = { id, name: name.trim(), group: 'Other', color: COLORS[categories.length % COLORS.length], order: categories.length + 1 };
    persistIP(cur => ({ ...cur, categories: [...cur.categories, newCat] }));
    setSelCatId(id);
  }, [categories, persistIP]);

  const renameCategory = useCallback((catId, name) => {
    persistIP(cur => ({
      ...cur,
      categories: cur.categories.map(c => c.id === catId ? { ...c, name } : c),
    }));
  }, [persistIP]);

  const deleteCategory = useCallback((catId) => {
    persistIP(cur => ({
      ...cur,
      categories: cur.categories.filter(c => c.id !== catId),
      questions: cur.questions.map(q => q.categoryId === catId ? { ...q, categoryId: null } : q),
    }));
    if (selCatId === catId) setSelCatId(null);
  }, [persistIP, selCatId]);

  // ─── Question handlers ────────────────────
  const addQuestion = useCallback((text) => {
    const now = new Date().toISOString();
    const newQ = {
      id: `ipq-${Date.now()}`,
      categoryId: selCatId || (categories[0] || {}).id,
      question: text.trim(), status: 'draft', confidence: 1,
      tags: [], linkedStoryIds: [], createdAt: now, updatedAt: now,
      lastPracticedAt: null, nextPracticeAt: null, rehearsalCount: 0, answer: {},
    };
    persistIP(cur => ({ ...cur, questions: [...cur.questions, newQ] }));
    setSelQId(newQ.id);
  }, [selCatId, categories, persistIP]);

  const updateAnswer = useCallback((qId, field, val) => {
    persistIP(cur => ({
      ...cur,
      questions: cur.questions.map(q =>
        q.id === qId ? { ...q, answer: { ...q.answer, [field]: val }, updatedAt: new Date().toISOString() } : q
      ),
    }));
  }, [persistIP]);

  const updateQuestion = useCallback((qId, updates) => {
    persistIP(cur => ({
      ...cur,
      questions: cur.questions.map(q =>
        q.id === qId ? { ...q, ...updates, updatedAt: new Date().toISOString() } : q
      ),
    }));
  }, [persistIP]);

  const deleteQuestion = useCallback((qId) => {
    persistIP(cur => ({ ...cur, questions: cur.questions.filter(q => q.id !== qId) }));
    if (selQId === qId) setSelQId(null);
  }, [persistIP, selQId]);

  const duplicateQuestion = useCallback((qId) => {
    const q = questions.find(x => x.id === qId);
    if (!q) return;
    const now = new Date().toISOString();
    const copy = {
      ...q,
      id: `ipq-${Date.now()}`,
      question: q.question + ' (copy)',
      status: 'draft', confidence: 1,
      lastPracticedAt: null, nextPracticeAt: null, rehearsalCount: 0,
      createdAt: now, updatedAt: now,
      answer: { ...q.answer },
      tags: [...(q.tags || [])],
      linkedStoryIds: [],
    };
    persistIP(cur => ({ ...cur, questions: [...cur.questions, copy] }));
    setSelQId(copy.id);
  }, [questions, persistIP]);

  const moveQuestion = useCallback((qId, catId) => {
    persistIP(cur => ({
      ...cur,
      questions: cur.questions.map(q =>
        q.id === qId ? { ...q, categoryId: catId, updatedAt: new Date().toISOString() } : q
      ),
    }));
    setSelQId(null);
  }, [persistIP]);

  const markReady = useCallback((qId) => {
    const q = questions.find(x => x.id === qId);
    if (!q) return;
    if ((q.confidence || 1) < 4 && !window.confirm('Confidence is below 4. Mark as interview-ready anyway?')) return;
    updateQuestion(qId, { status: 'interview_ready', confidence: 5, nextPracticeAt: ipNextPractice(5) });
  }, [questions, updateQuestion]);

  // ─── Rehearsal handlers ───────────────────
  const startRehearsal = useCallback((queueMode = 'due') => {
    const pool = catQuestions.length > 0 ? catQuestions : questions;
    const queue = ipBuildQueue(pool, queueMode);
    if (queue.length === 0) { window.alert('No questions to practice in this selection.'); return; }
    setRehearseQueue(queue);
    setMode('rehearse');
  }, [catQuestions, questions]);

  const startGlobalRehearsal = useCallback((queueMode = 'due') => {
    const queue = ipBuildQueue(questions, queueMode);
    if (queue.length === 0) { window.alert('No questions to practice in this selection.'); return; }
    setRehearseQueue(queue);
    setMode('rehearse');
  }, [questions]);

  const rehearseOne = useCallback((qId) => {
    const q = questions.find(x => x.id === qId);
    if (!q) return;
    setRehearseQueue([q]);
    setMode('rehearse');
  }, [questions]);

  const handleRate = useCallback((qId, conf) => {
    const q = questions.find(x => x.id === qId);
    updateQuestion(qId, {
      confidence: conf,
      status: ipStatusFromConf(conf),
      lastPracticedAt: new Date().toISOString(),
      nextPracticeAt: ipNextPractice(conf),
      rehearsalCount: ((q && q.rehearsalCount) || 0) + 1,
    });
  }, [questions, updateQuestion]);

  // ─── Render ───────────────────────────────
  if (mode === 'rehearse') {
    return (
      <div className="ip-screen">
        <IPRehearsalView
          queue={rehearseQueue}
          ip={ip}
          onRate={handleRate}
          onExit={() => { setMode('browse'); setRehearseQueue([]); }}
        />
      </div>
    );
  }

  return (
    <div className="ip-screen">
      <div className="ip-topbar">
        <button className="ip-back-btn" onClick={onBack}>← Calendar</button>
        <div className="ip-topbar-center">
          <span className="ip-topbar-title">Interview Prep</span>
          <span className="ip-topbar-sub">Senior AE · Salesforce</span>
        </div>
        <div className="ip-topbar-right">
          <button className="ip-topbar-rehearse-btn" onClick={() => startRehearsal('due')}>
            ▶ Start rehearsal{stats.dueToday > 0 ? ` (${stats.dueToday})` : ''}
          </button>
        </div>
      </div>

      <IPDashboard stats={stats} onStartRehearsal={startGlobalRehearsal} />

      <div className="ip-cols">
        <IPCategoryList
          ip={ip}
          selectedId={selCatId}
          onSelect={(id) => { setSelCatId(id); setSelQId(null); }}
          onAdd={addCategory}
          onRename={renameCategory}
          onDelete={deleteCategory}
          stats={stats.catStats}
        />
        <IPQuestionList
          questions={catQuestions}
          selectedId={selQId}
          onSelect={setSelQId}
          onAdd={addQuestion}
        />
        <IPWorkspace
          question={selectedQ}
          ip={ip}
          onUpdateAnswer={updateAnswer}
          onUpdateQuestion={updateQuestion}
          onRehearseOne={rehearseOne}
          onMarkReady={markReady}
          onDelete={deleteQuestion}
          onDuplicate={duplicateQuestion}
          onMove={moveQuestion}
        />
      </div>
    </div>
  );
}

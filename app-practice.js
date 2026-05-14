// ═════════════════════════════════════════════════════════════
// DAILY PRACTICE HUB
// ═════════════════════════════════════════════════════════════

const PRACTICE_TABS = [
  { id: 'interviewPrep',    label: 'Interview Prep' },
  { id: 'personalNarrative', label: 'Personal Narrative' },
  { id: 'clevelQs',         label: 'C-Level Questions' },
];

const PRACTICE_FILTERS = {
  interviewPrep:    ['all', 'behavioral', 'competency', 'situational', 'motivation'],
  personalNarrative: ['all', 'pitch', 'values', 'leadership', 'international'],
  clevelQs:         ['all', 'CEO', 'CFO', 'CRO', 'CMO', 'CPO', 'CISO'],
};

const FILTER_LABELS = {
  all: 'All', behavioral: 'Behavioral', competency: 'Competency',
  situational: 'Situational', motivation: 'Motivation',
  pitch: 'Pitch', values: 'Values', leadership: 'Leadership', international: 'International',
  CEO: 'CEO', CFO: 'CFO', CRO: 'CRO', CMO: 'CMO', CPO: 'CPO', CISO: 'CISO',
};

function getItemFilter(tab, item) {
  return tab === 'clevelQs' ? item.profile : item.category;
}

// ─────────────────────────────────────────────────────────────
// MASTERY DOTS
// ─────────────────────────────────────────────────────────────
function MasteryDots({ streak }) {
  return (
    <div className="practice-mastery-dots">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={'practice-mastery-dot' + (i < streak ? ' filled' : '')} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FULL ANSWER CARD
// ─────────────────────────────────────────────────────────────
function FullAnswerCard({ item, onUpdate, onMarkPracticed }) {
  const [localContent, setLocalContent] = useState(item.fullContent || '');
  const [localBullets, setLocalBullets] = useState(item.bullets || []);
  const [editingBullet, setEditingBullet] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalContent(item.fullContent || '');
    setLocalBullets(item.bullets || []);
    setDirty(false);
    setEditingBullet(null);
  }, [item.id]);

  const handleSave = () => {
    onUpdate({ ...item, fullContent: localContent, bullets: localBullets });
    setDirty(false);
  };

  const handleBulletChange = (idx, val) => {
    const next = localBullets.map((b, i) => i === idx ? val : b);
    setLocalBullets(next);
    setDirty(true);
  };

  const handleAddBullet = () => {
    setLocalBullets([...localBullets, '']);
    setEditingBullet(localBullets.length);
    setDirty(true);
  };

  const handleDeleteBullet = (idx) => {
    setLocalBullets(localBullets.filter((_, i) => i !== idx));
    setDirty(true);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-meta">
        <MasteryDots streak={item.streak} />
        {item.lastPracticed && (
          <span className="practice-last-practiced">Last: {item.lastPracticed}</span>
        )}
      </div>

      <div className="practice-question">{item.question}</div>

      <div className="practice-section-label">Your answer</div>
      <textarea
        className="practice-textarea"
        value={localContent}
        placeholder="Write your full answer here — use this as your rehearsal script."
        onChange={e => { setLocalContent(e.target.value); setDirty(true); }}
      />

      <div className="practice-section-label">
        Key points
        <button className="practice-add-bullet-btn" onClick={handleAddBullet}>+ Add</button>
      </div>
      <ul className="practice-bullets">
        {localBullets.map((b, i) => (
          <li key={i} className="practice-bullet-item">
            {editingBullet === i ? (
              <input
                className="practice-bullet-input"
                autoFocus
                value={b}
                onChange={e => handleBulletChange(i, e.target.value)}
                onBlur={() => setEditingBullet(null)}
                onKeyDown={e => e.key === 'Enter' && setEditingBullet(null)}
              />
            ) : (
              <span className="practice-bullet-text" onClick={() => setEditingBullet(i)}>{b || <em>Empty — click to edit</em>}</span>
            )}
            <button className="practice-bullet-delete" onClick={() => handleDeleteBullet(i)} title="Remove">×</button>
          </li>
        ))}
      </ul>

      <div className="practice-card-actions">
        {dirty && (
          <button className="practice-btn-save" onClick={handleSave}>Save</button>
        )}
        <button className="practice-btn-practiced" onClick={() => onMarkPracticed(item)}>
          Practiced today
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FLASHCARD VIEW
// ─────────────────────────────────────────────────────────────
function FlashcardView({ item, onKnewIt, onNeedsWork }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setRevealed(false); }, [item.id]);

  return (
    <div className="practice-card practice-card-flashcard">
      <div className="practice-card-meta">
        <MasteryDots streak={item.streak} />
        {item.lastPracticed && (
          <span className="practice-last-practiced">Last: {item.lastPracticed}</span>
        )}
      </div>

      <div className="practice-question">{item.question}</div>

      {!revealed ? (
        <button className="practice-btn-reveal" onClick={() => setRevealed(true)}>
          Reveal key points
        </button>
      ) : (
        <>
          <ul className="practice-bullets practice-bullets-revealed">
            {(item.bullets || []).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="practice-flashcard-actions">
            <button className="practice-btn-knew" onClick={() => { setRevealed(false); onKnewIt(item); }}>
              Knew it
            </button>
            <button className="practice-btn-needs-work" onClick={() => { setRevealed(false); onNeedsWork(item); }}>
              Needs work
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DAILY PRACTICE HUB — main overlay
// ─────────────────────────────────────────────────────────────
function DailyPracticeHub({ data, onClose, onUpdateItem }) {
  const [activeTab, setActiveTab] = useState('interviewPrep');
  const [activeFilter, setActiveFilter] = useState('all');
  const [mode, setMode] = useState('full'); // 'full' | 'flashcard'
  const [cardIndex, setCardIndex] = useState(0);

  const practiceContent = (data && data.practiceContent) || SEED_PRACTICE_CONTENT;

  // Reset filter and card index when tab changes
  useEffect(() => {
    setActiveFilter('all');
    setCardIndex(0);
  }, [activeTab]);

  // Reset card index when filter changes
  useEffect(() => {
    setCardIndex(0);
  }, [activeFilter]);

  const allItems = practiceContent[activeTab] || [];
  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(item => getItemFilter(activeTab, item) === activeFilter);

  const total = filtered.length;
  const item = filtered[cardIndex] || null;

  const handlePrev = () => setCardIndex(i => Math.max(0, i - 1));
  const handleNext = () => setCardIndex(i => Math.min(total - 1, i + 1));

  const updateItem = (updatedItem) => {
    onUpdateItem(activeTab, updatedItem);
  };

  const markPracticed = (it) => {
    const today = new Date().toISOString().slice(0, 10);
    updateItem({ ...it, lastPracticed: today, streak: Math.min(4, (it.streak || 0) + 1) });
  };

  const handleKnewIt = (it) => {
    const today = new Date().toISOString().slice(0, 10);
    updateItem({ ...it, lastPracticed: today, streak: Math.min(4, (it.streak || 0) + 1) });
    if (cardIndex < total - 1) setCardIndex(i => i + 1);
  };

  const handleNeedsWork = (it) => {
    updateItem({ ...it, streak: 0 });
    if (cardIndex < total - 1) setCardIndex(i => i + 1);
  };

  return (
    <div className="practice-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="practice-panel">
        <div className="practice-header">
          <div className="practice-header-left">
            <span className="practice-title">Daily Practice</span>
          </div>
          <div className="practice-header-right">
            <div className="practice-mode-toggle">
              <button
                className={'practice-mode-btn' + (mode === 'full' ? ' active' : '')}
                onClick={() => setMode('full')}
              >Full Answer</button>
              <button
                className={'practice-mode-btn' + (mode === 'flashcard' ? ' active' : '')}
                onClick={() => setMode('flashcard')}
              >Flashcard</button>
            </div>
            <button className="practice-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="practice-tabs">
          {PRACTICE_TABS.map(tab => (
            <button
              key={tab.id}
              className={'practice-tab' + (activeTab === tab.id ? ' active' : '')}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="practice-tab-count">
                {(practiceContent[tab.id] || []).length}
              </span>
            </button>
          ))}
        </div>

        <div className="practice-filters">
          {(PRACTICE_FILTERS[activeTab] || ['all']).map(f => (
            <button
              key={f}
              className={'practice-filter-btn' + (activeFilter === f ? ' active' : '')}
              onClick={() => setActiveFilter(f)}
            >
              {FILTER_LABELS[f] || f}
              {f !== 'all' && (
                <span className="practice-filter-count">
                  {allItems.filter(it => getItemFilter(activeTab, it) === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="practice-nav">
          <button className="practice-nav-btn" onClick={handlePrev} disabled={cardIndex === 0}>‹</button>
          <span className="practice-nav-counter">{total > 0 ? `${cardIndex + 1} / ${total}` : '0 / 0'}</span>
          <button className="practice-nav-btn" onClick={handleNext} disabled={cardIndex >= total - 1}>›</button>
        </div>

        <div className="practice-content">
          {item ? (
            mode === 'full' ? (
              <FullAnswerCard
                key={item.id}
                item={item}
                onUpdate={updateItem}
                onMarkPracticed={markPracticed}
              />
            ) : (
              <FlashcardView
                key={item.id}
                item={item}
                onKnewIt={handleKnewIt}
                onNeedsWork={handleNeedsWork}
              />
            )
          ) : (
            <div className="practice-empty">No items in this category.</div>
          )}
        </div>
      </div>
    </div>
  );
}

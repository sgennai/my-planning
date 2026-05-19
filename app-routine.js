// AGENDA VIEW (mobile)
// ═════════════════════════════════════════════════════════════
function AgendaView({ routine, overrides, scheduledBlocks, projects, weekStart, now, onBlockClick, onRoutineClick, elsewhereToggles, icsOccurrences, completions, onToggleComplete, categoryStyles }) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));
  const todayCol = isCurrentWeek
    ? (now.getDay() === 0 ? 6 : now.getDay() - 1)
    : 0;
  const [selectedCol, setSelectedCol] = useState(todayCol);

  useEffect(() => {
    setSelectedCol(isCurrentWeek ? todayCol : 0);
  }, [weekStart.getTime()]); // eslint-disable-line

  const date = addDays(weekStart, selectedCol);
  const isSelectedToday = isCurrentWeek && isSameDay(date, now);

  const routineItems = applyElsewhereFilter(
    resolvedRoutineForDate(routine, overrides || {}, date, completions),
    date,
    elsewhereToggles,
    now
  );
  const blockItems = blocksForDate(scheduledBlocks || [], date).map(b => {
    const project = (projects || []).find(p => p.id === b.projectId);
    return {
      id: b.id,
      title: b.title,
      start: b.start,
      duration: b.duration,
      category: 'project-block',
      _kind: 'block',
      _block: b,
      _project: project,
    };
  });
  const icsItems = (icsOccurrences || []).filter(occ => isSameDay(occ.start, date)).map((occ, i) => {
    const startStr = `${pad(occ.start.getHours())}:${pad(occ.start.getMinutes())}`;
    const durationMin = Math.max(15, Math.round((occ.end.getTime() - occ.start.getTime()) / 60000));
    return {
      id: `ics-${occ.source}-${occ.uid || i}-${occ.start.getTime()}`,
      title: occ.title,
      start: startStr,
      duration: durationMin,
      category: 'ics-event',
      _kind: 'ics',
      _ics: occ,
    };
  });
  const sorted = [...routineItems, ...blockItems, ...icsItems].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <>
      <div className="agenda-day-strip">
        {Array.from({ length: 7 }, (_, col) => {
          const d = addDays(weekStart, col);
          const isToday = isCurrentWeek && isSameDay(d, now);
          const isSelected = col === selectedCol;
          return (
            <button
              key={col}
              className={`agenda-day-chip ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedCol(col)}
            >
              <span className="agenda-day-chip-name">{DAY_NAMES_SHORT[col]}</span>
              <span className="agenda-day-chip-date">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="agenda-header">
        <div className="agenda-day-title">{DAY_NAMES_LONG[selectedCol]}</div>
        <div className="agenda-day-subtitle">{formatDateShort(date)}</div>
      </div>

      {sorted.length === 0 ? (
        <div className="agenda-empty">No items on this day yet. Plan from a desktop to schedule project work.</div>
      ) : (
        <div className="agenda-list">
          {sorted.map(item => {
            const isBlock = item._kind === 'block';
            const isIcs = item._kind === 'ics';
            const block = isBlock ? item._block : null;
            const project = isBlock ? item._project : null;
            const color = isBlock
              ? ((project && project.color) || 'var(--primary)')
              : isIcs
                ? ((item._ics && item._ics.color) || (item._ics.source === 'work' ? '#8C8C96' : '#7896AF'))
                : (CATS[item.category] || CATS.supplement).color;
            const startMin = toMinutes(item.start);
            const endMin = startMin + item.duration;
            const endStr = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
            let stateClass = '';
            if (isSelectedToday) {
              if (endMin < nowMin) stateClass = 'past';
              else if (startMin <= nowMin && endMin >= nowMin) stateClass = 'now';
            }
            if (isBlock && block.status === 'completed') stateClass += ' past';
            if (!isBlock && !isIcs && item._completed) stateClass += ' past';

            const isRoutineItem = !isBlock && !isIcs;
            const effectiveColor = isRoutineItem && item._completed ? '#7EB8A4' : color;

            const handleClick = isBlock && onBlockClick
              ? () => onBlockClick(block.id)
              : (!isBlock && !isIcs && onRoutineClick
                  ? () => onRoutineClick(item.id, date)
                  : undefined);

            const handleToggleCheck = (e) => {
              e.stopPropagation();
              if (onToggleComplete) onToggleComplete(item.id, date);
            };

            return (
              <div
                key={item.id}
                className={`agenda-item ${stateClass}`}
                onClick={handleClick}
                style={handleClick ? { cursor: 'pointer' } : (isIcs ? { opacity: 0.85 } : {})}
              >
                <div className="agenda-item-stripe" style={{ background: effectiveColor, ...(isIcs ? { opacity: 0.7 } : {}) }} />
                <div className="agenda-item-time">
                  <span>{item.start}</span>
                  {item.duration >= 15 && <span className="agenda-item-time-end">→ {endStr}</span>}
                </div>
                <div className="agenda-item-content">
                  <div className="agenda-item-title">
                    {isBlock && block.status === 'completed' && '✓ '}
                    {isBlock && block.status === 'partial' && '½ '}
                    {isRoutineItem && item._completed && '✓ '}
                    {isRoutineItem && CATS[item.category] && CATS[item.category].emoji ? `${CATS[item.category].emoji} ` : ''}
                    {item.title}
                    {item.homeOnly && !isBlock && (
                      <span style={{ color: effectiveColor, marginLeft: 8, fontSize: 9, letterSpacing: '0.15em', fontFamily: 'var(--mono)', opacity: 0.7 }}>HOME</span>
                    )}
                    {isIcs && (
                      <span style={{ color, marginLeft: 8, fontSize: 9, letterSpacing: '0.15em', fontFamily: 'var(--mono)', opacity: 0.7 }}>
                        {item._ics.source === 'work' ? 'WORK' : 'HOUSEHOLD'}
                      </span>
                    )}
                    {isBlock && project && (
                      <span style={{ color, marginLeft: 8, fontSize: 9, letterSpacing: '0.15em', fontFamily: 'var(--mono)', opacity: 0.7 }}>
                        {project.name.replace('APP - ', '')}
                      </span>
                    )}
                  </div>
                  {item.note && !isBlock && <div className="agenda-item-meta">{item.note}</div>}
                  {isBlock && block.actualMinutes != null && (
                    <div className="agenda-item-meta">{block.actualMinutes} min spent</div>
                  )}
                </div>
                {isRoutineItem && onToggleComplete && (
                  <button
                    className="agenda-item-check"
                    onClick={handleToggleCheck}
                    title={item._completed ? 'Mark not done' : 'Mark done'}
                    aria-label={item._completed ? 'Mark not done' : 'Mark done'}
                  >
                    {item._completed ? '✓' : ''}
                  </button>
                )}
                {stateClass.includes('now') && !isBlock && !item._completed && <span className="agenda-now-flag">NOW</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// ROUTINE ITEM POPOVER — click any routine block on the calendar
// ═════════════════════════════════════════════════════════════
function RoutineItemPopover({ context, routine, overrides, onClose, onUpdateItem, onDeleteItem, onSetOverride, categoryStyles }) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const item = routine.find(r => r.id === context.itemId);
  if (!item) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Routine item not found</div></div>
          <div className="modal-body"><button className="modal-btn" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }
  const date = new Date(context.date);
  const overrideKey = makeOverrideKey(item.id, date);
  const existingOverride = overrides[overrideKey];
  const isMovedFromAnother = existingOverride && existingOverride.type === 'move'; // shouldn't happen — we pass the original item id
  const dayName = DAY_NAMES_LONG[(date.getDay() === 0 ? 6 : date.getDay() - 1)];

  // Effective values for this date (apply override if any)
  const effective = {
    title: existingOverride && existingOverride.title != null ? existingOverride.title : item.title,
    start: existingOverride && existingOverride.start != null ? existingOverride.start : item.start,
    duration: existingOverride && existingOverride.duration != null ? existingOverride.duration : item.duration,
    note: existingOverride && existingOverride.note != null ? existingOverride.note : item.note,
  };

  const [scope, setScope] = useState('thisWeek'); // 'thisWeek' or 'fromNow'
  const [editTitle, setEditTitle] = useState(effective.title);
  const [editStart, setEditStart] = useState(effective.start);
  const [editDuration, setEditDuration] = useState(effective.duration);
  const [editNote, setEditNote] = useState(effective.note || '');
  const [editHomeOnly, setEditHomeOnly] = useState(!!item.homeOnly);

  const isPast = startOfDay(date).getTime() < startOfDay(new Date()).getTime();

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSkipThisWeek = () => {
    onSetOverride(item.id, date, { type: 'skip' });
    onClose();
  };

  const handleSaveEdit = () => {
    if (!editStart.match(/^\d{1,2}:\d{2}$/)) return;
    const dur = Number(editDuration);
    if (isNaN(dur) || dur < 5) return;
    const [h, m] = editStart.split(':').map(Number);
    const cleanStart = `${pad(h)}:${pad(m)}`;
    if (scope === 'thisWeek') {
      // Store override (homeOnly is a routine-shape change, not per-occurrence — ignored here)
      onSetOverride(item.id, date, {
        type: 'edit',
        title: editTitle !== item.title ? editTitle : undefined,
        start: cleanStart !== item.start ? cleanStart : undefined,
        duration: dur !== item.duration ? dur : undefined,
        note: (editNote || '') !== (item.note || '') ? editNote : undefined,
      });
    } else {
      // Mutate routine + clear any override for this date
      onUpdateItem(item.id, {
        title: editTitle,
        start: cleanStart,
        duration: dur,
        note: editNote,
        homeOnly: editHomeOnly,
      });
      if (existingOverride) onSetOverride(item.id, date, null);
    }
    onClose();
  };

  const handleDeletePermanently = () => {
    if (!confirm(`Delete "${item.title}" from your routine permanently? This affects all weeks, past and future.`)) return;
    onDeleteItem(item.id);
    onClose();
  };

  const handleClearOverride = () => {
    onSetOverride(item.id, date, null);
    onClose();
  };

  // For "move to another day this week" — choose the destination day
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const weekStart = startOfWeek(date);
  const handleMoveToDay = (destCol) => {
    const destDate = addDays(weekStart, destCol);
    onSetOverride(item.id, date, {
      type: 'move',
      moveToDate: destDate.toISOString(),
      // start + duration stay the same; user can edit them after
    });
    onClose();
  };

  const categoryLabel = (CATEGORY_STYLES[item.category] || {}).label || item.category;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" style={{ borderTopColor: (CATS[item.category] || {}).color || 'var(--primary)' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <div className="modal-eyebrow">Routine · {categoryLabel}</div>
          <div className="modal-title">{effective.title}</div>
          <div className="modal-meta">
            <span>{dayName} · {formatDateShort(date)}</span>
            <span>{effective.start} · {effective.duration} min</span>
            {existingOverride && existingOverride.type === 'edit' && <span style={{ color: 'var(--primary)' }}>Edited this week</span>}
          </div>
        </div>

        <div className="modal-body">
          {/* Quick actions for this week */}
          {!movePickerOpen && (
            <>
              <div className="modal-section">
                <div className="modal-section-label">Just this week</div>
                <div className="modal-actions">
                  {!isPast && (
                    <>
                      <button className="modal-btn" onClick={handleSkipThisWeek}>
                        <span>✕ Skip this {dayName}</span>
                        <span className="modal-btn-hint">won't appear this week</span>
                      </button>
                      <button className="modal-btn" onClick={() => setMovePickerOpen(true)}>
                        <span>↪ Move to another day this week</span>
                        <span className="modal-btn-hint">just this week</span>
                      </button>
                    </>
                  )}
                  {existingOverride && (
                    <button className="modal-btn" onClick={handleClearOverride}>
                      <span>↺ Restore this week to default</span>
                      <span className="modal-btn-hint">remove this week's override</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-label">Edit details</div>
                <div className="scope-toggle">
                  <button
                    className={`scope-toggle-btn ${scope === 'thisWeek' ? 'active' : ''}`}
                    onClick={() => setScope('thisWeek')}
                  >Just this week</button>
                  <button
                    className={`scope-toggle-btn ${scope === 'fromNow' ? 'active' : ''}`}
                    onClick={() => setScope('fromNow')}
                  >From now on</button>
                </div>
                <div className="scope-hint">
                  {scope === 'thisWeek'
                    ? 'Changes apply to this week only — next week reverts to your routine default.'
                    : 'Changes update your routine permanently — applies to every future occurrence.'}
                </div>
                <div className="routine-form-grid">
                  <div className="routine-form-row">
                    <div className="routine-form-label">Title</div>
                    <input
                      type="text"
                      className="routine-form-input"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="routine-form-row half">
                    <div className="routine-form-label">Start time</div>
                    <input
                      type="text"
                      className="routine-form-input mono"
                      value={editStart}
                      onChange={e => setEditStart(e.target.value)}
                      placeholder="HH:MM"
                    />
                  </div>
                  <div className="routine-form-row half">
                    <div className="routine-form-label">Duration (min)</div>
                    <input
                      type="number"
                      className="routine-form-input mono"
                      value={editDuration}
                      min="5" max="600" step="5"
                      onChange={e => setEditDuration(e.target.value)}
                    />
                  </div>
                  <div className="routine-form-row">
                    <div className="routine-form-label">Note (optional)</div>
                    <textarea
                      className="routine-form-textarea"
                      value={editNote}
                      onChange={e => setEditNote(e.target.value)}
                    />
                  </div>
                  <div className="routine-form-row">
                    <label
                      className="checkbox-row"
                      style={scope === 'thisWeek' ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                      title={scope === 'thisWeek' ? 'Home-only is a routine-shape setting — switch to "From now on" to change it' : ''}
                    >
                      <input
                        type="checkbox"
                        checked={editHomeOnly}
                        onChange={e => setEditHomeOnly(e.target.checked)}
                        disabled={scope === 'thisWeek'}
                      />
                      <span>Home only — hide when working from elsewhere</span>
                    </label>
                    {scope === 'thisWeek' && (
                      <div style={{ fontSize: 11, color: 'var(--muted-3)', fontStyle: 'italic', marginTop: 4 }}>
                        Home-only is a routine-shape setting and applies to all weeks. Switch to "From now on" above to change it.
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="modal-btn primary" style={{ flex: 1 }} onClick={handleSaveEdit}>
                    <span>Save {scope === 'thisWeek' ? 'for this week' : 'permanently'}</span>
                  </button>
                </div>
              </div>

              <div className="modal-section">
                <button className="modal-btn danger" onClick={handleDeletePermanently}>
                  <span>✕ Delete from routine permanently</span>
                  <span className="modal-btn-hint">all weeks</span>
                </button>
              </div>
            </>
          )}

          {/* Move-to-day picker */}
          {movePickerOpen && (
            <div className="modal-section">
              <div className="modal-section-label">Move to which day this week?</div>
              <div className="day-chips" style={{ marginBottom: 12 }}>
                {Array.from({ length: 7 }, (_, col) => {
                  const d = addDays(weekStart, col);
                  const isOriginal = isSameDay(d, date);
                  return (
                    <button
                      key={col}
                      className={`day-chip ${isOriginal ? 'active' : ''}`}
                      disabled={isOriginal}
                      style={isOriginal ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                      onClick={() => handleMoveToDay(col)}
                    >
                      <div>{DAY_NAMES_SHORT[col]}</div>
                      <div style={{ fontSize: 14, fontFamily: 'var(--mono)', marginTop: 4 }}>{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>
              <button className="modal-btn" onClick={() => setMovePickerOpen(false)}>
                <span>← Back</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// REFERENCE LIBRARY MODAL — quick reference content (editable)
// ═════════════════════════════════════════════════════════════
function ReferenceLibraryModal({ entries, expandedId, onChangeExpanded, onClose, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState('');

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditBuffer(entry.body);
  };
  const saveEdit = () => {
    if (editingId) onUpdate(editingId, editBuffer);
    setEditingId(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditBuffer('');
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="ref-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="ref-modal-header">
          <div className="ref-modal-eyebrow">Reference Library</div>
          <div className="ref-modal-title">Things worth keeping handy</div>
        </div>
        <div className="ref-modal-body">
          <div className="ref-list">
            {entries.map(entry => {
              const isExpanded = expandedId === entry.id;
              const isEditing = editingId === entry.id;
              return (
                <div key={entry.id} className={`ref-entry ${isExpanded ? 'expanded' : ''}`}>
                  <div className="ref-entry-header" onClick={() => onChangeExpanded(isExpanded ? null : entry.id)}>
                    <div className="ref-entry-title">{entry.title}</div>
                    <div className="ref-entry-chevron">›</div>
                  </div>
                  <div className="ref-entry-body">
                    <div className="ref-entry-inner">
                      {isEditing ? (
                        <div className="ref-entry-edit">
                          <textarea
                            className="ref-entry-textarea"
                            value={editBuffer}
                            onChange={e => setEditBuffer(e.target.value)}
                            autoFocus
                          />
                          <div className="ref-entry-edit-actions">
                            <button className="ref-entry-save-btn" onClick={saveEdit}>Save</button>
                            <button className="ref-entry-cancel-btn" onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="ref-entry-content">{entry.body}</div>
                          <button className="ref-entry-edit-btn" onClick={() => startEdit(entry)}>✎ Edit</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ROUTINE MANAGER MODAL — full edit/add/delete of underlying routine
// ═════════════════════════════════════════════════════════════
function EmojiPickerPopover({ currentEmoji, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div ref={ref} className="emoji-picker-popover" onClick={(e) => e.stopPropagation()}>
      {EMOJI_LIBRARY.map(group => (
        <div key={group.group} className="emoji-picker-group">
          <div className="emoji-picker-group-label">{group.group}</div>
          <div className="emoji-picker-grid">
            {group.emojis.map(em => (
              <button
                key={em}
                className={`emoji-picker-cell ${em === currentEmoji ? 'selected' : ''}`}
                onClick={() => onPick(em)}
                title={em}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutineManagerModal({ routine, onClose, onUpdateItem, onAddItem, onDeleteItem,
  categoryStyles, onSetCategoryColor, onResetCategoryColor, userCategoryColors,
  onSetCategoryEmoji, onResetCategoryEmoji, userCategoryEmojis,
  onSetCategoryLabel, onResetCategoryLabel, userCategoryLabels,
  userCategories, onAddUserCategory, onUpdateUserCategory, onDeleteUserCategory, usedCategories,
  embedded = false }) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const [emojiPickerCat, setEmojiPickerCat] = useState(null);
  const [labelEdits, setLabelEdits] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatColor, setNewCatColor] = useState('#7EB8A4');
  const [newCatEmoji, setNewCatEmoji] = useState('📌');
  const [newCatEmojiOpen, setNewCatEmojiOpen] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const catFilterFn = item => filterCat === 'all' || item.category === filterCat;
  const recurringItems = routine.filter(r => r.recurrence).filter(catFilterFn);
  const visible = routine.filter(r => !r.recurrence).filter(catFilterFn);
  const multiDay = [];
  const grouped = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  visible.forEach(item => {
    if (item.days.length > 1) {
      multiDay.push(item);
    } else {
      const d = item.days[0] != null ? item.days[0] : 1;
      grouped[d] = grouped[d] || [];
      grouped[d].push(item);
    }
  });
  recurringItems.sort((a, b) => a.title.localeCompare(b.title));
  multiDay.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)));
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const totalCount = visible.length + recurringItems.length;

  const handleAddCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    let base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('cat-' + Date.now().toString(36));
    let slug = base; let i = 2;
    while (CATS[slug]) { slug = `${base}-${i++}`; }
    onAddUserCategory && onAddUserCategory(slug, { label, color: newCatColor, emoji: newCatEmoji });
    setNewCatOpen(false);
    setNewCatLabel('');
    setNewCatColor('#7EB8A4');
    setNewCatEmoji('📌');
    setNewCatEmojiOpen(false);
  };

  const listContent = (
    <div className="rm-sections">

      {/* ── Section 1: Categories ── */}
      <div className="rm-section">
        <div className="rm-section-header">
          <div className="rm-section-title">Categories</div>
          <button className="rm-section-btn" onClick={() => { setNewCatOpen(v => !v); setNewCatEmojiOpen(false); }}>
            {newCatOpen ? '✕ Cancel' : '+ New'}
          </button>
        </div>

        {newCatOpen && (
          <div className="cat-new-form">
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button className="cat-row-emoji" onClick={() => setNewCatEmojiOpen(v => !v)} title="Pick emoji">{newCatEmoji}</button>
              {newCatEmojiOpen && (
                <EmojiPickerPopover
                  currentEmoji={newCatEmoji}
                  onPick={e => { setNewCatEmoji(e); setNewCatEmojiOpen(false); }}
                  onClose={() => setNewCatEmojiOpen(false)}
                />
              )}
            </div>
            <input
              className="cat-row-name"
              placeholder="Category name"
              value={newCatLabel}
              onChange={e => setNewCatLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setNewCatOpen(false); }}
              autoFocus
            />
            <input type="color" className="sm-color-swatch" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} />
            <button className="cat-new-add-btn" onClick={handleAddCategory} disabled={!newCatLabel.trim()}>Add</button>
          </div>
        )}

        <div className="cat-row-list">
          {Object.entries(CATS).map(([cat, style]) => {
            const isUserCreated = !!style._isUserCreated;
            const inUse = usedCategories && usedCategories.has(cat);
            const colorOverridden = !isUserCreated && !!(userCategoryColors && userCategoryColors[cat]);
            const emojiOverridden = !isUserCreated && !!(userCategoryEmojis && userCategoryEmojis[cat]);
            const labelOverridden = !isUserCreated && !!(userCategoryLabels && userCategoryLabels[cat]);
            const isCustomised = colorOverridden || emojiOverridden || labelOverridden;
            const rawColorVal = !isUserCreated ? (userCategoryColors && userCategoryColors[cat]) : null;
            const defaultColor = !isUserCreated ? (CATEGORY_STYLES[cat] && CATEGORY_STYLES[cat].color) : null;
            const defaultLabel = !isUserCreated ? (CATEGORY_STYLES[cat] && CATEGORY_STYLES[cat].label) : null;
            const inputVal = labelEdits[cat] !== undefined ? labelEdits[cat] : style.label;
            return (
              <div key={cat} className="cat-row">
                {/* col 1: dot */}
                <div className="cat-row-dot" style={{ background: style.color }} />
                {/* col 2: emoji + popover */}
                <div style={{ position: 'relative' }}>
                  <button className="cat-row-emoji" onClick={() => setEmojiPickerCat(emojiPickerCat === cat ? null : cat)} title="Change emoji">
                    {style.emoji}
                  </button>
                  {emojiPickerCat === cat && (
                    <EmojiPickerPopover
                      currentEmoji={style.emoji}
                      onPick={e => {
                        if (isUserCreated) { onUpdateUserCategory && onUpdateUserCategory(cat, { emoji: e }); }
                        else { onSetCategoryEmoji && onSetCategoryEmoji(cat, e); }
                        setEmojiPickerCat(null);
                      }}
                      onClose={() => setEmojiPickerCat(null)}
                    />
                  )}
                </div>
                {/* col 3: name */}
                <input
                  className="cat-row-name"
                  value={inputVal}
                  onChange={e => setLabelEdits(prev => ({ ...prev, [cat]: e.target.value }))}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (isUserCreated) {
                      if (val) onUpdateUserCategory && onUpdateUserCategory(cat, { label: val });
                    } else {
                      if (val && val !== defaultLabel) { onSetCategoryLabel && onSetCategoryLabel(cat, val); }
                      else { onResetCategoryLabel && onResetCategoryLabel(cat); }
                    }
                    setLabelEdits(prev => { const n = { ...prev }; delete n[cat]; return n; });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') { setLabelEdits(prev => { const n = { ...prev }; delete n[cat]; return n; }); e.target.blur(); }
                  }}
                  title="Click to rename"
                />
                {/* col 4: color picker */}
                <ColorPickerExtended
                  value={isUserCreated ? style.colorVal : (rawColorVal || defaultColor)}
                  defaultHex={isUserCreated ? style.color : defaultColor}
                  onChange={val => {
                    if (isUserCreated) { const p = parseColorVal(val); onUpdateUserCategory && onUpdateUserCategory(cat, { color: p.hex || val }); }
                    else { onSetCategoryColor && onSetCategoryColor(cat, val); }
                  }}
                />
                {/* col 5: reset — always present, hidden when not applicable */}
                <button
                  className="cat-row-action reset"
                  style={{ visibility: (!isUserCreated && isCustomised) ? 'visible' : 'hidden' }}
                  title="Reset to defaults"
                  onClick={() => {
                    if (colorOverridden) onResetCategoryColor && onResetCategoryColor(cat);
                    if (emojiOverridden) onResetCategoryEmoji && onResetCategoryEmoji(cat);
                    if (labelOverridden) onResetCategoryLabel && onResetCategoryLabel(cat);
                    setLabelEdits(prev => { const n = { ...prev }; delete n[cat]; return n; });
                  }}
                >↺</button>
                {/* col 6: delete — always present, hidden for builtins */}
                <button
                  className={`cat-row-action delete${inUse ? ' disabled' : ''}`}
                  style={{ visibility: isUserCreated ? 'visible' : 'hidden' }}
                  title={inUse ? 'Remove from all routine items first' : 'Delete category'}
                  onClick={!inUse ? () => onDeleteUserCategory && onDeleteUserCategory(cat) : undefined}
                >🗑</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rm-section-divider" />

      {/* ── Section 2: Routine Items ── */}
      <div className="rm-section">
        <div className="rm-section-header">
          <div className="rm-section-title">Routine Items</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="rm-filter-select"
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
            >
              <option value="all">All categories</option>
              {Object.entries(CATS).map(([cat, style]) => (
                <option key={cat} value={cat}>{style.emoji} {style.label}</option>
              ))}
            </select>
            <button className="rm-section-btn" onClick={() => setEditingId('new')}>+ Add item</button>
          </div>
        </div>
        {recurringItems.length === 0 && multiDay.length === 0 && dayOrder.every(d => (grouped[d] || []).length === 0) && (
          <div className="rm-empty">{filterCat === 'all' ? 'No routine items yet — add one above.' : 'No items in this category.'}</div>
        )}
        {recurringItems.length > 0 && (
          <div className="routine-day-group">
            <div className="routine-day-group-label">Recurring (top of every hour)</div>
            {recurringItems.map(item => {
              const cat = CATS[item.category] || {};
              const r = item.recurrence || {};
              const win = (r.kind === 'top-of-hour' && r.startHour != null && r.endHour != null)
                ? `${pad(r.startHour)}:00–${pad(r.endHour)}:00` : '—';
              return (
                <div key={item.id} className="routine-item-row" onClick={() => setEditingId(item.id)}>
                  <div className="routine-item-row-time">{win}</div>
                  <div className="routine-item-row-title">
                    {item.title}
                    <span style={{ fontSize: 10, color: 'var(--muted-3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>
                      {describeDays(item.days)} · top of hour
                    </span>
                  </div>
                  <div className="routine-item-row-cat" style={{ color: cat.color || 'var(--muted-3)' }}>{cat.label || item.category}</div>
                </div>
              );
            })}
          </div>
        )}
        {multiDay.length > 0 && (
          <div className="routine-day-group">
            <div className="routine-day-group-label">Daily / multi-day</div>
            {multiDay.map(item => {
              const cat = CATS[item.category] || {};
              return (
                <div key={item.id} className="routine-item-row" onClick={() => setEditingId(item.id)}>
                  <div className="routine-item-row-time">{item.start} · {item.duration}m</div>
                  <div className="routine-item-row-title">
                    {item.title}
                    <span style={{ fontSize: 10, color: 'var(--muted-3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>{describeDays(item.days)}</span>
                  </div>
                  <div className="routine-item-row-cat" style={{ color: cat.color || 'var(--muted-3)' }}>{cat.label || item.category}</div>
                </div>
              );
            })}
          </div>
        )}
        {dayOrder.map(jsDay => {
          const items = grouped[jsDay] || [];
          if (items.length === 0) return null;
          const visualCol = jsDay === 0 ? 6 : jsDay - 1;
          return (
            <div key={jsDay} className="routine-day-group">
              <div className="routine-day-group-label">{DAY_NAMES_LONG[visualCol]} only</div>
              {items.map(item => {
                const cat = CATS[item.category] || {};
                return (
                  <div key={item.id} className="routine-item-row" onClick={() => setEditingId(item.id)}>
                    <div className="routine-item-row-time">{item.start} · {item.duration}m</div>
                    <div className="routine-item-row-title">{item.title}</div>
                    <div className="routine-item-row-cat" style={{ color: cat.color || 'var(--muted-3)' }}>{cat.label || item.category}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (editingId === null) {
    if (embedded) {
      return <div>{listContent}</div>;
    }
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal routine-modal">
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          {listContent}
        </div>
      </div>
    );
  }

  // Edit/new form
  const isNew = editingId === 'new';
  const editingItem = isNew ? null : routine.find(r => r.id === editingId);

  return (
    <RoutineEditForm
      item={editingItem}
      isNew={isNew}
      embedded={embedded}
      onCancel={() => setEditingId(null)}
      onSave={(values) => {
        if (isNew) {
          onAddItem(values);
        } else {
          onUpdateItem(editingItem.id, values);
        }
        setEditingId(null);
      }}
      onDelete={editingItem ? () => {
        if (!confirm(`Delete "${editingItem.title}" from your routine permanently?`)) return;
        onDeleteItem(editingItem.id);
        setEditingId(null);
      } : null}
      onCloseModal={onClose}
    />
  );
}

function RoutineEditForm({ item, isNew, onCancel, onSave, onDelete, onCloseModal, embedded = false }) {
  const CATS = CATEGORY_STYLES;
  const isRecurring = !!(item && item.recurrence);
  const recur = (item && item.recurrence) || null;
  const [title, setTitle] = useState(item ? item.title : '');
  const [days, setDays] = useState(item ? [...item.days] : [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(item ? item.start : '08:00');
  const [duration, setDuration] = useState(item ? item.duration : 30);
  const [category, setCategory] = useState(item ? item.category : 'planning');
  const [note, setNote] = useState(item ? (item.note || '') : '');
  const [homeOnly, setHomeOnly] = useState(item ? !!item.homeOnly : false);
  const [recurStartHour, setRecurStartHour] = useState(recur ? (recur.startHour ?? 9) : 9);
  const [recurEndHour, setRecurEndHour] = useState(recur ? (recur.endHour ?? 18) : 18);

  const toggleDay = (d) => {
    setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort());
  };

  const handleSave = () => {
    if (!title.trim()) { alert('Title is required.'); return; }
    if (days.length === 0) { alert('Select at least one day.'); return; }
    if (isRecurring) {
      const sh = Number(recurStartHour);
      const eh = Number(recurEndHour);
      if (isNaN(sh) || isNaN(eh) || sh < 0 || sh > 23 || eh < 0 || eh > 23) {
        alert('Hours must be 0–23.'); return;
      }
      if (sh > eh) { alert('Start hour must be ≤ end hour.'); return; }
      onSave({
        title: title.trim(),
        days: [...days].sort(),
        start: `${pad(sh)}:00`, // keep start coherent for any code path that reads it
        duration: 1,
        category,
        note: note.trim(),
        homeOnly: !!homeOnly,
        recurrence: { kind: 'top-of-hour', startHour: sh, endHour: eh },
      });
      return;
    }
    if (!start.match(/^\d{1,2}:\d{2}$/)) { alert('Start must be HH:MM.'); return; }
    const dur = Number(duration);
    if (isNaN(dur) || dur < 5) { alert('Duration must be at least 5 minutes.'); return; }
    const [h, m] = start.split(':').map(Number);
    const cleanStart = `${pad(h)}:${pad(m)}`;
    onSave({
      title: title.trim(),
      days: [...days].sort(),
      start: cleanStart,
      duration: dur,
      category,
      note: note.trim(),
      homeOnly: !!homeOnly,
    });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCloseModal();
  };

  // Day chip ordering: Mon-first
  const dayPicker = [1, 2, 3, 4, 5, 6, 0];

  const formContent = (
    <>
      <div className="modal-header">
        <div className="modal-eyebrow">{isNew ? 'New routine item' : (isRecurring ? 'Edit recurring item · top of every hour' : 'Edit routine item')}</div>
        <div className="modal-title">{title || 'Untitled'}</div>
        <div className="modal-meta">
          <span style={{ fontStyle: 'italic' }}>Changes apply to all weeks, past and future</span>
        </div>
      </div>
      <div className="modal-body">
        <div className="routine-form-grid">
          <div className="routine-form-row">
            <div className="routine-form-label">Title</div>
            <input
              type="text"
              className="routine-form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="routine-form-row">
            <div className="routine-form-label">Days of week</div>
            <div className="day-chips">
              {dayPicker.map(jsDay => {
                const visualCol = jsDay === 0 ? 6 : jsDay - 1;
                return (
                  <button
                    key={jsDay}
                    className={`day-chip ${days.includes(jsDay) ? 'active' : ''}`}
                    onClick={() => toggleDay(jsDay)}
                  >{DAY_NAMES_SHORT[visualCol]}</button>
                );
              })}
            </div>
          </div>

          {isRecurring ? (
            <>
              <div className="routine-form-row half">
                <div className="routine-form-label">Window start (hour)</div>
                <input
                  type="number"
                  className="routine-form-input mono"
                  value={recurStartHour}
                  min="0" max="23" step="1"
                  onChange={e => setRecurStartHour(e.target.value)}
                />
              </div>
              <div className="routine-form-row half">
                <div className="routine-form-label">Window end (hour)</div>
                <input
                  type="number"
                  className="routine-form-input mono"
                  value={recurEndHour}
                  min="0" max="23" step="1"
                  onChange={e => setRecurEndHour(e.target.value)}
                />
              </div>
              <div className="routine-form-row">
                <div style={{ fontSize: 11, color: 'var(--muted-3)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Triggers in the Right Now banner during the first 2 minutes of every hour from {pad(Number(recurStartHour) || 0)}:00 to {pad(Number(recurEndHour) || 0)}:00, on the selected days. The protocol shown is read from the "Micro-Strength Protocol" entry in your Reference Library — edit it there to change what the banner displays.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="routine-form-row half">
                <div className="routine-form-label">Start time</div>
                <input
                  type="text"
                  className="routine-form-input mono"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                  placeholder="HH:MM"
                />
              </div>
              <div className="routine-form-row half">
                <div className="routine-form-label">Duration (min)</div>
                <input
                  type="number"
                  className="routine-form-input mono"
                  value={duration}
                  min="5" max="600" step="5"
                  onChange={e => setDuration(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="routine-form-row">
            <div className="routine-form-label">Category</div>
            <div className="cat-chips">
              {CATEGORY_OPTIONS.map(c => {
                const cat = CATS[c] || {};
                const active = category === c;
                return (
                  <button
                    key={c}
                    className={`cat-chip ${active ? 'active' : ''}`}
                    style={{
                      color: active ? cat.color : 'var(--muted-3)',
                      borderColor: active ? cat.color : 'var(--border)',
                    }}
                    onClick={() => setCategory(c)}
                  >{cat.label || c}</button>
                );
              })}
            </div>
          </div>

          <div className="routine-form-row">
            <div className="routine-form-label">Note (optional)</div>
            <textarea
              className="routine-form-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="routine-form-row">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={homeOnly}
                onChange={e => setHomeOnly(e.target.checked)}
              />
              <span>Home only — hide when working from elsewhere</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="modal-btn primary" style={{ flex: 1 }} onClick={handleSave}>
            <span>{isNew ? 'Add to routine' : 'Save changes'}</span>
          </button>
          <button className="modal-btn" onClick={onCancel}>
            <span>Cancel</span>
          </button>
        </div>

        {!isNew && onDelete && (
          <div style={{ marginTop: 12 }}>
            <button className="modal-btn danger" onClick={onDelete}>
              <span>✕ Delete this routine item permanently</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div>{formContent}</div>;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal routine-modal">
        <button className="modal-close" onClick={onCloseModal} aria-label="Close">×</button>
        {formContent}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════

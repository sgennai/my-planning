import { useState } from 'react';
import { CATEGORY_STYLES, DAY_NAMES_LONG, DAY_NAMES_SHORT } from '../storage/data';
import { pad } from '../ui/helpers';
import { isSameDay } from '../helpers/calendar-utils';
import { startOfDay, startOfWeek, addDays, toMinutes, formatDateShort, makeOverrideKey } from '../helpers/calendar-utils';

export function RoutineItemPopover({ context, routine, overrides, onClose, onUpdateItem, onDeleteItem, onSetOverride, categoryStyles }: any) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const item = routine.find((r: any) => r.id === context.itemId);
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
  const dayName = DAY_NAMES_LONG[(date.getDay() === 0 ? 6 : date.getDay() - 1)];
  const dateStr = formatDateShort(date);
  const categoryLabel = (CATS[item.category] || {}).label || item.category;

  const effective = {
    title: existingOverride && existingOverride.title != null ? existingOverride.title : item.title,
    start: existingOverride && existingOverride.start != null ? existingOverride.start : item.start,
    duration: existingOverride && existingOverride.duration != null ? existingOverride.duration : (item.duration || item.durationMin),
    note: existingOverride && existingOverride.note != null ? existingOverride.note : item.note,
  };

  const startMin = toMinutes(effective.start);
  const endMin = startMin + Number(effective.duration);
  const endStr = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
  const isPast = startOfDay(date).getTime() < startOfDay(new Date()).getTime();
  const weekStart = startOfWeek(date);

  // ── Mode state machine ───────────────────────────────────────────
  const [mode, setMode] = useState('details');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Occurrence edit state
  const [occTitle, setOccTitle] = useState(effective.title);
  const [occStart, setOccStart] = useState(effective.start);
  const [occDuration, setOccDuration] = useState(String(effective.duration));
  const [occNote, setOccNote] = useState(effective.note || '');

  // Future routine edit state
  const [ftrTitle, setFtrTitle] = useState(item.title);
  const [ftrStart, setFtrStart] = useState(item.start);
  const [ftrDuration, setFtrDuration] = useState(String(item.duration || item.durationMin));
  const [ftrNote, setFtrNote] = useState(item.note || '');
  const [ftrHomeOnly, setFtrHomeOnly] = useState(!!item.homeOnly);

  const handleBackdropClick = (e: any) => { if (e.target === e.currentTarget) onClose(); };

  const handleSkipOccurrence = () => {
    onSetOverride(item.id, date, { type: 'skip' });
    onClose();
  };

  const handleMoveToDay = (col: number) => {
    const destDate = addDays(weekStart, col);
    onSetOverride(item.id, date, { type: 'move', moveToDate: destDate.toISOString() });
    onClose();
  };

  const handleClearOverride = () => {
    onSetOverride(item.id, date, null);
    onClose();
  };

  const handleSaveOccurrence = () => {
    if (!occStart.match(/^\d{1,2}:\d{2}$/)) return;
    const dur = Number(occDuration);
    if (isNaN(dur) || dur < 5) return;
    const [h, m] = occStart.split(':').map(Number);
    const cleanStart = `${pad(h)}:${pad(m)}`;
    onSetOverride(item.id, date, {
      type: 'edit',
      title: occTitle !== item.title ? occTitle : undefined,
      start: cleanStart !== item.start ? cleanStart : undefined,
      duration: dur !== (item.duration || item.durationMin) ? dur : undefined,
      note: (occNote || '') !== (item.note || '') ? occNote : undefined,
    });
    onClose();
  };

  const handleSaveFutureRoutine = () => {
    if (!ftrStart.match(/^\d{1,2}:\d{2}$/)) return;
    const dur = Number(ftrDuration);
    if (isNaN(dur) || dur < 5) return;
    const [h, m] = ftrStart.split(':').map(Number);
    onUpdateItem(item.id, { title: ftrTitle, start: `${pad(h)}:${pad(m)}`, duration: dur, durationMin: dur, note: ftrNote, homeOnly: ftrHomeOnly });
    if (existingOverride) onSetOverride(item.id, date, null);
    onClose();
  };

  const handleDeleteOccurrence = () => {
    onSetOverride(item.id, date, { type: 'skip' });
    onClose();
  };

  const handleDeleteFutureRoutine = () => {
    if (!confirm(`Delete "${item.title}" from your routine permanently?\n\nThis removes all future occurrences and cannot be undone.`)) return;
    onDeleteItem(item.id);
    onClose();
  };

  // ── Shared modal shell ───────────────────────────────────────────
  const Shell = ({ eyebrow, title, meta, children }: any) => (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <div className="modal-eyebrow">{eyebrow}</div>
          <div className="modal-title">{title}</div>
          {meta && <div className="modal-meta">{meta}</div>}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  // ── DETAILS ──────────────────────────────────────────────────────
  if (mode === 'details') return (
    <Shell
      eyebrow={`Routine · ${categoryLabel}`}
      title={effective.title}
      meta={<>
        <span>{dayName}, {dateStr}</span>
        <span>{effective.start}–{endStr} · {effective.duration} min</span>
        {existingOverride && existingOverride.type === 'edit' && <span style={{ color: 'var(--primary)' }}>Modified</span>}
      </>}
    >
      {effective.note && (
        <div className="modal-section">
          <div className="modal-section-label">Note</div>
          <div className="rp-note">{effective.note}</div>
        </div>
      )}

      {!isPast && (
        <div className="modal-section">
          <div className="modal-section-label">Quick actions</div>
          <div className="modal-actions">
            <button className="modal-btn" onClick={() => setMode('confirm_skip')}>
              <span>Skip this occurrence</span>
              <span className="modal-btn-hint">{dayName}, {dateStr} only</span>
            </button>
            <button className="modal-btn" onClick={() => setMode('move_occurrence')}>
              <span>Move this occurrence</span>
              <span className="modal-btn-hint">{dayName}, {dateStr} only</span>
            </button>
            {existingOverride && (
              <button className="modal-btn" onClick={handleClearOverride}>
                <span>Restore to routine default</span>
                <span className="modal-btn-hint">remove override</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="modal-section">
        <div className="modal-section-label">Edit</div>
        <div className="modal-actions">
          <button className="modal-btn" onClick={() => setMode('edit_occurrence')}>
            <span>Edit this occurrence</span>
            <span className="modal-btn-hint">{dayName}, {dateStr} only</span>
          </button>
          <button className="modal-btn" onClick={() => setMode('edit_future_routine')}>
            <span>Edit future routine</span>
            <span className="modal-btn-hint">applies to future weeks</span>
          </button>
        </div>
      </div>

      <div className="modal-section" style={{ marginBottom: 0 }}>
        <button className="rp-advanced-toggle" onClick={() => setShowAdvanced((v: boolean) => !v)}>
          Advanced {showAdvanced ? '▲' : '▼'}
        </button>
        {showAdvanced && (
          <div className="modal-actions" style={{ marginTop: 10 }}>
            {!isPast && (
              <button className="modal-btn danger" onClick={handleDeleteOccurrence}>
                <span>Delete this occurrence</span>
                <span className="modal-btn-hint">{dayName}, {dateStr} only</span>
              </button>
            )}
            <button className="modal-btn danger" onClick={handleDeleteFutureRoutine}>
              <span>Delete future routine…</span>
              <span className="modal-btn-hint">all future weeks</span>
            </button>
          </div>
        )}
      </div>
    </Shell>
  );

  // ── CONFIRM SKIP ─────────────────────────────────────────────────
  if (mode === 'confirm_skip') return (
    <Shell eyebrow="Skip occurrence" title={`Skip "${effective.title}"?`} meta={<span>{dayName}, {dateStr}</span>}>
      <div className="rp-scope-note">Removes only this occurrence from your calendar. The future routine is unchanged.</div>
      <div className="rp-btn-row">
        <button className="modal-btn" style={{ flex: 1 }} onClick={() => setMode('details')}>Cancel</button>
        <button className="modal-btn danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSkipOccurrence}>Skip occurrence</button>
      </div>
    </Shell>
  );

  // ── MOVE OCCURRENCE ──────────────────────────────────────────────
  if (mode === 'move_occurrence') return (
    <Shell eyebrow="Move occurrence" title={effective.title} meta={<span>{dayName}, {dateStr}</span>}>
      <div className="rp-scope-note">Moves only this occurrence. The future routine is unchanged.</div>
      <div className="modal-section" style={{ marginTop: 16 }}>
        <div className="modal-section-label">Move to</div>
        <div className="day-chips">
          {Array.from({ length: 7 }, (_, col) => {
            const d = addDays(weekStart, col);
            const isOriginal = isSameDay(d, date);
            return (
              <button key={col} className={`day-chip${isOriginal ? ' active' : ''}`}
                disabled={isOriginal} style={isOriginal ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                onClick={() => handleMoveToDay(col)}>
                <div>{DAY_NAMES_SHORT[col]}</div>
                <div style={{ fontSize: 14, fontFamily: 'var(--mono)', marginTop: 4 }}>{d.getDate()}</div>
              </button>
            );
          })}
        </div>
      </div>
      <button className="modal-btn" style={{ marginTop: 8 }} onClick={() => setMode('details')}>← Back</button>
    </Shell>
  );

  // ── EDIT OCCURRENCE ──────────────────────────────────────────────
  if (mode === 'edit_occurrence') return (
    <Shell eyebrow="Edit this occurrence" title={effective.title}>
      <div className="rp-scope-note">Applies only to <strong>{dayName}, {dateStr}</strong>. Future weeks keep the routine default.</div>
      <div className="routine-form-grid" style={{ marginTop: 16 }}>
        <div className="routine-form-row">
          <div className="routine-form-label">Title</div>
          <input type="text" className="routine-form-input" value={occTitle} onChange={e => setOccTitle(e.target.value)} />
        </div>
        <div className="routine-form-row half">
          <div className="routine-form-label">Start time</div>
          <input type="text" className="routine-form-input mono" value={occStart} onChange={e => setOccStart(e.target.value)} placeholder="HH:MM" />
        </div>
        <div className="routine-form-row half">
          <div className="routine-form-label">Duration (min)</div>
          <input type="number" className="routine-form-input mono" value={occDuration} min="5" max="600" step="5" onChange={e => setOccDuration(e.target.value)} />
        </div>
        <div className="routine-form-row">
          <div className="routine-form-label">Note (optional)</div>
          <textarea className="routine-form-textarea" value={occNote} onChange={e => setOccNote(e.target.value)} />
        </div>
      </div>
      <div className="rp-btn-row" style={{ marginTop: 16 }}>
        <button className="modal-btn" style={{ flex: 1 }} onClick={() => setMode('details')}>Cancel</button>
        <button className="modal-btn primary" style={{ flex: 2 }} onClick={handleSaveOccurrence}>Save this occurrence</button>
      </div>
    </Shell>
  );

  // ── EDIT FUTURE ROUTINE ──────────────────────────────────────────
  if (mode === 'edit_future_routine') return (
    <Shell eyebrow="Edit future routine" title={item.title}>
      <div className="rp-scope-note">Updates the routine default for <strong>future weeks</strong>. Does not affect past or existing occurrences.</div>
      <div className="routine-form-grid" style={{ marginTop: 16 }}>
        <div className="routine-form-row">
          <div className="routine-form-label">Title</div>
          <input type="text" className="routine-form-input" value={ftrTitle} onChange={e => setFtrTitle(e.target.value)} />
        </div>
        <div className="routine-form-row half">
          <div className="routine-form-label">Default start time</div>
          <input type="text" className="routine-form-input mono" value={ftrStart} onChange={e => setFtrStart(e.target.value)} placeholder="HH:MM" />
        </div>
        <div className="routine-form-row half">
          <div className="routine-form-label">Default duration (min)</div>
          <input type="number" className="routine-form-input mono" value={ftrDuration} min="5" max="600" step="5" onChange={e => setFtrDuration(e.target.value)} />
        </div>
        <div className="routine-form-row">
          <div className="routine-form-label">Note (optional)</div>
          <textarea className="routine-form-textarea" value={ftrNote} onChange={e => setFtrNote(e.target.value)} />
        </div>
        <div className="routine-form-row">
          <label className="checkbox-row">
            <input type="checkbox" checked={ftrHomeOnly} onChange={e => setFtrHomeOnly(e.target.checked)} />
            <span>Home only — hide when working from elsewhere</span>
          </label>
        </div>
      </div>
      <div className="rp-btn-row" style={{ marginTop: 16 }}>
        <button className="modal-btn" style={{ flex: 1 }} onClick={() => setMode('details')}>Cancel</button>
        <button className="modal-btn primary" style={{ flex: 2 }} onClick={handleSaveFutureRoutine}>Save routine default</button>
      </div>
    </Shell>
  );

  return null;
}

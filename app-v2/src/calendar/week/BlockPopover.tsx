import { useState } from 'react';
import { DAY_NAMES_LONG } from '../../storage/data';
import { pad } from '../../ui/helpers';
import { startOfDay, toMinutes, formatDateShort } from '../../helpers/calendar-utils';

// ═════════════════════════════════════════════════════════════
// BLOCK POPOVER — click any scheduled block to manage it
// ═════════════════════════════════════════════════════════════
export function BlockPopover({ block, projects, onClose, onUpdate, onDelete }: any) {
  const project = projects.find((p: any) => p.id === block.projectId);
  const projectColor = (project && project.color) || 'var(--primary)';
  const dateObj = new Date(block.date);
  const dayName = DAY_NAMES_LONG[(dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1)];
  const startMin = toMinutes(block.start);
  const endMin = startMin + (block.duration || 0);
  const endStr = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;

  const isPast = new Date(block.date).getTime() < startOfDay(new Date()).getTime() - 1;
  const isCompleted = block.status === 'completed';
  const isPartial = block.status === 'partial';

  // Local form state for editing duration + start
  const [editStart, setEditStart] = useState(block.start);
  const [editDuration, setEditDuration] = useState(block.duration);
  const [actualMin, setActualMin] = useState(block.actualMinutes || block.duration || 30);

  const handleBackdropClick = (e: any) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleComplete = () => {
    onUpdate({
      status: 'completed',
      actualMinutes: Number(actualMin) || 0,
      completedAt: new Date().toISOString(),
    });
    onClose();
  };
  const handlePartial = () => {
    onUpdate({
      status: 'partial',
      actualMinutes: Number(actualMin) || 0,
      completedAt: new Date().toISOString(),
    });
    onClose();
  };
  const handleSkip = () => {
    // Treat skip as deletion (action returns to open). For past blocks this also removes
    // them from the calendar — which matches "didn't happen".
    onDelete();
  };
  const handleSaveEdit = () => {
    const dur = Number(editDuration);
    if (!editStart.match(/^\d{1,2}:\d{2}$/) || isNaN(dur) || dur < 5) return;
    const [h, m] = editStart.split(':').map(Number);
    const cleanStart = `${pad(h)}:${pad(m)}`;
    onUpdate({ start: cleanStart, duration: dur });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" style={{ borderTopColor: projectColor }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <div className="modal-eyebrow" style={{ color: projectColor }}>
            {project ? project.name : 'Block'}
            {isCompleted && ' · completed'}
            {isPartial && ' · partial'}
          </div>
          <div className="modal-title">{block.title}</div>
          <div className="modal-meta">
            <span>{dayName} · {formatDateShort(dateObj)}</span>
            <span>{block.start}–{endStr}</span>
            <span>{block.duration} min scheduled</span>
            {block.actualMinutes != null && (
              <span style={{ color: 'var(--teal)' }}>{block.actualMinutes} min spent</span>
            )}
          </div>
        </div>

        <div className="modal-body">
          {!isCompleted && (
            <div className="modal-section">
              <div className="modal-section-label">Time spent</div>
              <div className="modal-input-row">
                <input
                  type="number"
                  className="modal-input"
                  value={actualMin}
                  min="0" max="600" step="5"
                  onChange={e => setActualMin(e.target.value)}
                />
                <span className="modal-input-suffix">minutes</span>
              </div>
            </div>
          )}

          <div className="modal-section">
            <div className="modal-section-label">{isCompleted ? 'Adjust' : 'Mark this block as'}</div>
            <div className="modal-actions">
              {!isCompleted && (
                <>
                  <button className="modal-btn complete" onClick={handleComplete}>
                    <span>✓ Done · log time and remove from list</span>
                    <span className="modal-btn-hint">action complete</span>
                  </button>
                  <button className="modal-btn" onClick={handlePartial}>
                    <span>½ Partial · log time, action stays open</span>
                    <span className="modal-btn-hint">re-schedule it</span>
                  </button>
                </>
              )}
              <button className="modal-btn danger" onClick={handleSkip}>
                <span>{isPast ? "✕ Didn't happen · remove block" : "✕ Unschedule · return to portfolio"}</span>
                <span className="modal-btn-hint">action returns to open</span>
              </button>
            </div>
          </div>

          {!isCompleted && (
            <div className="modal-section">
              <div className="modal-section-label">Edit time + duration</div>
              <div className="modal-input-row">
                <input
                  type="text"
                  className="modal-input wide"
                  value={editStart}
                  onChange={e => setEditStart(e.target.value)}
                  placeholder="HH:MM"
                />
                <input
                  type="number"
                  className="modal-input"
                  value={editDuration}
                  min="5" max="600" step="5"
                  onChange={e => setEditDuration(e.target.value)}
                />
                <span className="modal-input-suffix">min</span>
                <button className="modal-btn primary" style={{ flex: 1 }} onClick={handleSaveEdit}>
                  <span>Save changes</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

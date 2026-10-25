// Routine settings — edit the routine without touching application code.
//
// Changing a recurrence rule or a time only rewrites the activity definition.
// Completion records are keyed by activity id and date and live in the
// progress log, so history survives every edit here; archiving an activity
// hides it from future days and leaves its past record intact.
import { useMemo, useState } from 'react';
import type {
  RoutineActivity, RoutineCategory, RoutineStatus, RoutineSurface, Weekday,
} from './model';
import { ROUTINE_GROUPS, CATEGORY_LABELS, GROUP_TITLES } from './model';
import {
  IconPlus, IconArrowUp, IconArrowDown, IconX, IconChevronLeft, IconTrash,
} from '../ui/icons';

const DAY_LABELS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const CATEGORIES = Object.keys(CATEGORY_LABELS) as RoutineCategory[];

const SURFACES: { value: RoutineSurface; label: string; hint: string }[] = [
  { value: 'routine',  label: 'Routine only',  hint: 'A habit to tick off here.' },
  { value: 'both',     label: 'Routine + Plan', hint: 'Also takes its slot on the Plan calendar.' },
  { value: 'calendar', label: 'Plan only',     hint: 'Day structure, not a habit — never listed here.' },
];

function scheduleSummary(a: RoutineActivity): string {
  const s = a.schedule;
  if (!s || s.type === 'daily') return 'Every day';
  const days = [...(s.days || [])].sort((x, y) => (x === 0 ? 7 : x) - (y === 0 ? 7 : y));
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d as Weekday))) return 'Mon–Fri';
  if (days.length === 2 && days.includes(6) && days.includes(0)) return 'Weekends';
  return days.map(d => DAY_LABELS.find(x => x.day === d)!.label).join(' · ');
}

function timingSummary(a: RoutineActivity): string {
  const t = a.timing;
  if (t.type === 'fixed') return `${t.start} · ${t.durationMin} min`;
  if (t.type === 'anchored') return t.anchor;
  return 'Any time';
}

function newActivity(order: number): RoutineActivity {
  return {
    id: `ra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    group: 'movement',
    category: 'body',
    schedule: { type: 'daily' },
    timing: { type: 'flexible' },
    surface: 'routine',
    required: true,
    status: 'active',
    order,
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT FORM
// ═══════════════════════════════════════════════════════════════════════════

function EditForm({
  draft, isNew, onChange, onCancel, onSave, onArchive,
}: {
  draft: RoutineActivity;
  isNew: boolean;
  onChange: (next: RoutineActivity) => void;
  onCancel: () => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  const patch = (p: Partial<RoutineActivity>) => onChange({ ...draft, ...p });

  const schedType = draft.schedule?.type || 'daily';
  const days: Weekday[] = draft.schedule.type === 'weekdays' ? (draft.schedule.days || []) : [];
  const timing = draft.timing;

  const toggleDay = (day: Weekday) => {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    patch({ schedule: { type: 'weekdays', days: next } });
  };

  return (
    <div className="rts-form">
      <div className="ds-field">
        <label className="ds-label" htmlFor="rt-title">Name</label>
        <input
          id="rt-title"
          className="ds-input"
          value={draft.title}
          onChange={e => patch({ title: e.target.value })}
          placeholder="Activity name"
          autoFocus={isNew}
        />
      </div>

      <div className="ds-field">
        <label className="ds-label" htmlFor="rt-desc">Description</label>
        <input
          id="rt-desc"
          className="ds-input"
          value={draft.description || ''}
          onChange={e => patch({ description: e.target.value })}
          placeholder="Optional one-line note"
        />
      </div>

      <div className="rts-pair">
        <div className="ds-field">
          <label className="ds-label" htmlFor="rt-group">Group</label>
          <select
            id="rt-group"
            className="ds-select"
            value={draft.group}
            onChange={e => patch({ group: e.target.value })}
          >
            {ROUTINE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            <option value="work">Work (calendar)</option>
          </select>
        </div>
        <div className="ds-field">
          <label className="ds-label" htmlFor="rt-cat">Category</label>
          <select
            id="rt-cat"
            className="ds-select"
            value={draft.category}
            onChange={e => patch({ category: e.target.value as RoutineCategory })}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="rts-set">
        <legend className="ds-label">Repeats</legend>
        <div className="ds-segment" role="tablist">
          <button
            role="tab"
            aria-selected={schedType === 'daily'}
            onClick={() => patch({ schedule: { type: 'daily' } })}
          >Every day</button>
          <button
            role="tab"
            aria-selected={schedType === 'weekdays'}
            onClick={() => patch({ schedule: { type: 'weekdays', days: days.length ? days : [1, 2, 3, 4, 5] } })}
          >Specific days</button>
        </div>
        {schedType === 'weekdays' && (
          <div className="rts-days">
            {DAY_LABELS.map(({ day, label }) => (
              <button
                key={day}
                className={`rts-day${days.includes(day) ? ' on' : ''}`}
                onClick={() => toggleDay(day)}
                aria-pressed={days.includes(day)}
              >{label}</button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="rts-set">
        <legend className="ds-label">When</legend>
        <div className="ds-segment" role="tablist">
          <button
            role="tab"
            aria-selected={timing.type === 'flexible'}
            onClick={() => patch({ timing: { type: 'flexible' } })}
          >Any time</button>
          <button
            role="tab"
            aria-selected={timing.type === 'anchored'}
            onClick={() => patch({ timing: { type: 'anchored', anchor: timing.type === 'anchored' ? timing.anchor : 'with breakfast' } })}
          >Tied to something</button>
          <button
            role="tab"
            aria-selected={timing.type === 'fixed'}
            onClick={() => patch({ timing: { type: 'fixed', start: timing.type === 'fixed' ? timing.start : '11:00', durationMin: timing.type === 'fixed' ? timing.durationMin : 15 } })}
          >At a time</button>
        </div>

        {timing.type === 'anchored' && (
          <input
            className="ds-input"
            value={timing.anchor}
            onChange={e => patch({ timing: { type: 'anchored', anchor: e.target.value } })}
            placeholder="e.g. while brushing teeth"
            aria-label="What it is tied to"
          />
        )}

        {timing.type === 'fixed' && (
          <div className="rts-pair">
            <div className="ds-field">
              <label className="ds-label" htmlFor="rt-start">Start</label>
              <input
                id="rt-start"
                className="ds-input"
                type="time"
                value={timing.start}
                onChange={e => patch({ timing: { ...timing, start: e.target.value || '11:00' } })}
              />
            </div>
            <div className="ds-field">
              <label className="ds-label" htmlFor="rt-dur">Minutes</label>
              <input
                id="rt-dur"
                className="ds-input"
                type="number"
                min={1}
                max={600}
                value={timing.durationMin}
                onChange={e => patch({ timing: { ...timing, durationMin: Math.max(1, Number(e.target.value) || 1) } })}
              />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="rts-set">
        <legend className="ds-label">Counts toward the day</legend>
        <div className="ds-segment" role="tablist">
          <button role="tab" aria-selected={draft.required !== false} onClick={() => patch({ required: true })}>Required</button>
          <button role="tab" aria-selected={draft.required === false} onClick={() => patch({ required: false })}>Optional</button>
        </div>
        <p className="rts-hint">
          {draft.required === false
            ? 'Shown, but never counted in the day’s score.'
            : 'Counted in the day’s completion percentage.'}
        </p>
      </fieldset>

      <fieldset className="rts-set">
        <legend className="ds-label">Where it appears</legend>
        <div className="rts-radios">
          {SURFACES.map(s => (
            <button
              key={s.value}
              className={`rts-radio${(draft.surface || 'routine') === s.value ? ' on' : ''}`}
              onClick={() => patch({
                surface: s.value,
                // The calendar can only place something that has a clock time.
                timing: s.value !== 'routine' && draft.timing.type !== 'fixed'
                  ? { type: 'fixed', start: '11:00', durationMin: 15 }
                  : draft.timing,
              })}
              aria-pressed={(draft.surface || 'routine') === s.value}
            >
              <span className="t">{s.label}</span>
              <span className="h">{s.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="rts-pair">
        <div className="ds-field">
          <label className="ds-label" htmlFor="rt-target-kind">Target</label>
          <select
            id="rt-target-kind"
            className="ds-select"
            value={draft.target?.kind || 'none'}
            onChange={e => patch({
              target: e.target.value === 'none'
                ? undefined
                : { kind: e.target.value as 'reps' | 'minutes', value: draft.target?.value || 10 },
            })}
          >
            <option value="none">None</option>
            <option value="reps">Repetitions</option>
            <option value="minutes">Minutes</option>
          </select>
        </div>
        {draft.target && (
          <div className="ds-field">
            <label className="ds-label" htmlFor="rt-target-val">Amount</label>
            <input
              id="rt-target-val"
              className="ds-input"
              type="number"
              min={1}
              value={draft.target.value}
              onChange={e => patch({ target: { kind: draft.target!.kind, value: Math.max(1, Number(e.target.value) || 1) } })}
            />
          </div>
        )}
      </div>

      <div className="ds-field">
        <label className="ds-label" htmlFor="rt-timer">Countdown timer (minutes, 0 for none)</label>
        <input
          id="rt-timer"
          className="ds-input"
          type="number"
          min={0}
          max={180}
          value={draft.timerSec ? Math.round(draft.timerSec / 60) : 0}
          onChange={e => {
            const mins = Math.max(0, Number(e.target.value) || 0);
            patch({ timerSec: mins > 0 ? mins * 60 : undefined });
          }}
        />
      </div>

      <div className="rts-pair">
        <div className="ds-field">
          <label className="ds-label" htmlFor="rt-link-label">Link label</label>
          <input
            id="rt-link-label"
            className="ds-input"
            value={draft.link?.label || ''}
            onChange={e => patch({
              link: e.target.value || draft.link?.url
                ? { label: e.target.value, url: draft.link?.url || '' }
                : undefined,
            })}
            placeholder="Open reader"
          />
        </div>
        <div className="ds-field">
          <label className="ds-label" htmlFor="rt-link-url">Link URL</label>
          <input
            id="rt-link-url"
            className="ds-input"
            type="url"
            inputMode="url"
            value={draft.link?.url || ''}
            onChange={e => patch({
              link: e.target.value || draft.link?.label
                ? { label: draft.link?.label || 'Open', url: e.target.value }
                : undefined,
            })}
            placeholder="https://"
          />
        </div>
      </div>

      <div className="ds-field">
        <label className="ds-label" htmlFor="rt-variants">Variants (comma separated)</label>
        <input
          id="rt-variants"
          className="ds-input"
          value={(draft.variants || []).join(', ')}
          onChange={e => {
            const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            patch({ variants: list.length ? list : undefined });
          }}
          placeholder="Cycling, Rowing"
        />
      </div>

      <fieldset className="rts-set">
        <legend className="ds-label">Status</legend>
        <div className="ds-segment" role="tablist">
          {(['active', 'paused', 'archived'] as RoutineStatus[]).map(s => (
            <button key={s} role="tab" aria-selected={draft.status === s} onClick={() => patch({ status: s })}>
              {s === 'active' ? 'Active' : s === 'paused' ? 'Paused' : 'Archived'}
            </button>
          ))}
        </div>
        <p className="rts-hint">
          Paused and archived activities stop appearing on new days. Past completions are kept.
        </p>
      </fieldset>

      <div className="rts-form-foot">
        {!isNew && (
          <button className="ds-btn ds-btn--danger" onClick={onArchive}>
            <IconTrash style={{ width: 18, height: 18 }} />Archive
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="ds-btn ds-btn--quiet" onClick={onCancel}>Cancel</button>
        <button className="ds-btn ds-btn--primary" onClick={onSave} disabled={!draft.title.trim()}>
          {isNew ? 'Add activity' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  activities: RoutineActivity[];
  onSave: (next: RoutineActivity[]) => void;
  onClose: () => void;
}

export function RoutineSettings({ activities, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<RoutineActivity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => [...activities]
      .filter(a => showArchived || a.status !== 'archived')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [activities, showArchived]);

  const commit = (next: RoutineActivity) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    const exists = activities.some(a => a.id === next.id);
    onSave(exists
      ? activities.map(a => (a.id === next.id ? stamped : a))
      : [...activities, stamped]);
    setDraft(null);
    setIsNew(false);
  };

  const archive = (a: RoutineActivity) => {
    onSave(activities.map(x => (x.id === a.id ? { ...x, status: 'archived', updatedAt: new Date().toISOString() } : x)));
    setDraft(null);
    setIsNew(false);
  };

  // Reorder by swapping order values with the neighbour in the same direction.
  const move = (a: RoutineActivity, dir: -1 | 1) => {
    const sorted = [...activities].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const i = sorted.findIndex(x => x.id === a.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const now = new Date().toISOString();
    onSave(reordered.map((x, idx) => ({ ...x, order: (idx + 1) * 10, updatedAt: now })));
  };

  const maxOrder = activities.reduce((m, a) => Math.max(m, a.order ?? 0), 0);

  return (
    <div className="ds-scrim" role="dialog" aria-modal="true" aria-label="Routine settings" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ds-modal rts-modal">
        <div className="ds-modal-head">
          {draft ? (
            <button className="ds-btn ds-btn--quiet" onClick={() => { setDraft(null); setIsNew(false); }}>
              <IconChevronLeft style={{ width: 18, height: 18 }} />All activities
            </button>
          ) : (
            <h2>Routine settings</h2>
          )}
          <button className="ds-icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        <div className="ds-modal-body">
          {draft ? (
            <EditForm
              draft={draft}
              isNew={isNew}
              onChange={setDraft}
              onCancel={() => { setDraft(null); setIsNew(false); }}
              onSave={() => commit(draft)}
              onArchive={() => archive(draft)}
            />
          ) : (
            <>
              <div className="rts-list">
                {visible.map((a, i) => (
                  <div key={a.id} className={`rts-item${a.status !== 'active' ? ' is-off' : ''}`} data-cat={a.category}>
                    <button className="rts-item-main" onClick={() => { setDraft(a); setIsNew(false); }}>
                      <span className="rts-item-title">
                        {a.title}
                        {a.status !== 'active' && <span className="rt-tag">{a.status}</span>}
                        {a.required === false && <span className="rt-tag">optional</span>}
                        {a.surface === 'calendar' && <span className="rt-tag">plan only</span>}
                      </span>
                      <span className="rts-item-meta">
                        {GROUP_TITLES[a.group] || a.group} · {scheduleSummary(a)} · {timingSummary(a)}
                      </span>
                    </button>
                    <div className="rts-item-aux">
                      <button className="rt-aux-btn" onClick={() => move(a, -1)} disabled={i === 0} aria-label={`Move ${a.title} up`}><IconArrowUp /></button>
                      <button className="rt-aux-btn" onClick={() => move(a, 1)} disabled={i === visible.length - 1} aria-label={`Move ${a.title} down`}><IconArrowDown /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rts-foot-actions">
                <button
                  className="ds-btn ds-btn--primary"
                  onClick={() => { setDraft(newActivity(maxOrder + 10)); setIsNew(true); }}
                >
                  <IconPlus style={{ width: 18, height: 18 }} />Add activity
                </button>
                <button className="ds-btn ds-btn--quiet" onClick={() => setShowArchived(v => !v)}>
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

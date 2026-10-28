// Routine settings — add, edit, reorder and retire activities.
//
// The editor is organised around what an activity *is*, so every
// characteristic visible on a dashboard tile has one obvious place to be
// set: what it is called, what it looks like, when it runs, whether it
// counts, and where it appears. A live preview shows the tile being built.
//
// Changing any of this only rewrites the activity definition. Completion
// records are keyed by activity id and date and live in the progress log, so
// history survives every edit here — including archiving.
import { useMemo, useState } from 'react';
import type {
  RoutineActivity, RoutineCategory, RoutineChild, RoutineLink, RoutineStatus, RoutineSurface, Weekday,
} from './model';
import { ROUTINE_GROUPS, CATEGORY_LABELS, GROUP_TITLES } from './model';
import { ActivityIcon, ACTIVITY_ICON_KEYS } from './activity-icons';
import { AVAILABLE_PHOTOS, PHOTO_GROUPS, photoFor, iconFor } from './photo-manifest';
import { metaFor, targetLabel } from './format';
import { setsOf, timerOf } from './engine';
import { SetRing } from './SetRing';
import {
  IconPlus, IconArrowUp, IconArrowDown, IconX, IconChevronLeft, IconTrash, IconCheck,
} from '../ui/icons';

const DAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const CATEGORIES = Object.keys(CATEGORY_LABELS) as RoutineCategory[];

const SURFACES: { value: RoutineSurface; label: string }[] = [
  { value: 'routine',  label: 'Routine' },
  { value: 'both',     label: 'Routine + Plan' },
  { value: 'calendar', label: 'Plan only' },
];

function daysSummary(a: RoutineActivity): string {
  const s = a.schedule;
  if (!s || s.type === 'daily') return 'Every day';
  const days = [...(s.days || [])].sort((x, y) => (x === 0 ? 7 : x) - (y === 0 ? 7 : y));
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d as Weekday))) return 'Mon–Fri';
  return days.map(d => DAYS.find(x => x.day === d)!.label).join(' · ');
}

function timeSummary(a: RoutineActivity): string {
  const t = a.timing;
  if (t.type === 'fixed') return `${t.start} · ${t.durationMin} min`;
  if (t.type === 'anchored') return t.anchor;
  return 'Any time';
}

function blankActivity(order: number): RoutineActivity {
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

/** The activity drawn exactly as the dashboard will draw it. */
function Preview({ a }: { a: RoutineActivity }) {
  const photo = photoFor(a);
  const meta = metaFor(a);
  return (
    <div className="cs-preview-frame">
      <div className="cin-tile" aria-hidden>
        <div className="cin-photo">
          {photo && AVAILABLE_PHOTOS.has(photo)
            ? <img src={`/routine/${photo}.webp`} alt="" />
            : <div className="cin-plate"><ActivityIcon name={a.icon} fallback={iconFor(a)} /></div>}
        </div>
        <span className="cin-tile-body">
          <span className="cin-tile-row">
            <span className="cin-tile-icon"><ActivityIcon name={a.icon} fallback={iconFor(a)} /></span>
            <span className={`cin-status${setsOf(a) ? ' has-sets' : ''}`}>
              {setsOf(a) > 0 && <SetRing sets={setsOf(a)} done={0} />}
            </span>
          </span>
          <span className="cin-tile-title">{a.title || 'Untitled activity'}</span>
          {meta && <span className="cin-tile-meta">{meta}</span>}
          {a.required === false && <span className="cin-chip">OPTIONAL</span>}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDITOR
// ═══════════════════════════════════════════════════════════════════════════

const SET_CHOICES = [1, 2, 3, 4, 5, 6];

// Four named buttons are as many as an iPhone row's launcher holds legibly.
const MAX_LINKS = 4;

// What a countdown switched on for the first time starts at.
const DEFAULT_TIMER_MIN = 10;
const MAX_TIMER_MIN = 180;

// Enough for a supplement stack; the tile line ends in an ellipsis past three or four.
const MAX_PARTS = 8;

function descriptionHint(a: RoutineActivity): string {
  if ((a.children?.length ?? 0) >= 3) return 'Not shown on the tile while it has three or more parts: their names take the line under the name.';
  return 'Shown only when the activity has no clock time, anchor, timer or target — those take the line first.';
}

function partsHint(a: RoutineActivity): string {
  if ((a.children?.length ?? 0) >= 3) return 'Their names, in this order, are the line under the tile’s name. One tap on the tile ticks them all.';
  const sets = (a.sets ?? 0) > 1 ? ' Parts take the place of sets.' : '';
  return `One tap on the tile ticks every part. With three or more, their names become the line under the tile’s name.${sets}`;
}

// A part left without a name is dropped on save: the tile would list it as a blank.
function withNamedParts(a: RoutineActivity): RoutineActivity {
  if (!a.children) return a;
  const children = a.children.map(c => ({ ...c, title: c.title.trim() })).filter(c => c.title);
  return { ...a, children: children.length ? children : undefined };
}

const minutesOf = (sec: number | undefined) => (sec ? String(Math.round(sec / 60)) : '');

function timerHint(a: RoutineActivity): string {
  const m = minutesOf(a.timerSec);
  if (timerOf(a)) return `The ••• button on the tile starts a ${m}-minute countdown.`;
  if (m) return `Off. The ${m} minutes are kept for when you switch it back on.`;
  return 'Switch it on to start a countdown from a button on the tile.';
}

function linksHint(a: RoutineActivity, count: number): string {
  if (count > 0 && timerOf(a)) return 'The countdown takes the button on the tile, so these links stay hidden while it is on.';
  if (count > 1) return 'The link button on the tile opens a launcher with one button per name.';
  return 'One link opens straight from the button on the tile. Add more and that button opens a launcher with one button per name.';
}

function setsHint(a: RoutineActivity): string {
  const sets = setsOf(a);
  if (!sets) return 'One tap on the tile checks it.';
  const split = a.target ? ` ${targetLabel(a.target.kind, a.target.value, sets)}.` : '';
  return `Each tap on the tile logs one set and lights an arc around its circle; the last set checks it.${split} A tap after that starts the day again.`;
}

function Editor({
  draft, isNew, onChange, onCancel, onSave, onArchive,
}: {
  draft: RoutineActivity;
  isNew: boolean;
  onChange: (next: RoutineActivity) => void;
  onCancel: () => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  const set = (p: Partial<RoutineActivity>) => onChange({ ...draft, ...p });
  // The list as typed, half-filled rows included; the tile reads it through linksOf.
  const links: RoutineLink[] = draft.links ?? (draft.link ? [draft.link] : []);
  const setLinks = (next: RoutineLink[]) => set({ links: next, link: undefined });
  const parts: RoutineChild[] = draft.children ?? [];
  const setParts = (next: RoutineChild[]) => set({ children: next.length ? next : undefined });
  // The minutes as typed, so the field can be cleared and retyped; the draft
  // only takes a whole number of at least one.
  const [timerText, setTimerText] = useState(minutesOf(draft.timerSec));
  const timerOn = timerOf(draft) > 0;
  const [showExtras, setShowExtras] = useState(
    !!(draft.timerSec || draft.target || links.length || draft.variants?.length));

  const schedType = draft.schedule?.type || 'daily';
  const days: Weekday[] = draft.schedule.type === 'weekdays' ? (draft.schedule.days || []) : [];
  const timing = draft.timing;

  const toggleDay = (day: Weekday) => {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    set({ schedule: { type: 'weekdays', days: next } });
  };

  return (
    <div className="cs-form">
      {/* ── 1. What it is ─────────────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Name, description and parts</legend>
        <div className="cs-field">
          <label htmlFor="cs-title">Name</label>
          <input
            id="cs-title"
            className="cs-input"
            value={draft.title}
            onChange={e => set({ title: e.target.value })}
            placeholder="What is this activity called?"
            autoFocus={isNew}
          />
        </div>
        <div className="cs-field">
          <label htmlFor="cs-desc">Description</label>
          <input
            id="cs-desc"
            className="cs-input"
            value={draft.description || ''}
            onChange={e => set({ description: e.target.value || undefined })}
            placeholder="A short line under the name"
          />
          <p className="cs-hint">{descriptionHint(draft)}</p>
        </div>
        <div className="cs-field" role="group" aria-labelledby="cs-parts-label">
          <span id="cs-parts-label" className="cs-label">Parts</span>
          {parts.length > 0 && (
            <div className="cs-parts">
              {parts.map((c, i) => (
                <div className="cs-part" key={c.id}>
                  <input className="cs-input" aria-label={`Part ${i + 1}`} value={c.title}
                    onChange={e => setParts(parts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    placeholder="Magnesium" />
                  <button type="button" className="cs-link-x" aria-label={`Remove ${c.title.trim() || `part ${i + 1}`}`}
                    onClick={() => setParts(parts.filter((_, j) => j !== i))}><IconX /></button>
                </div>
              ))}
            </div>
          )}
          {parts.length < MAX_PARTS && (
            <button type="button" className="cs-btn cs-btn--quiet" style={{ alignSelf: 'flex-start' }}
              onClick={() => setParts([...parts, {
                id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                title: '',
              }])}><IconPlus />Add a part</button>
          )}
          <p className="cs-hint">{partsHint(draft)}</p>
        </div>
      </fieldset>

      {/* ── 2. What it looks like ─────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Icon</legend>
        <div className="cs-grid cs-grid--icon">
          {ACTIVITY_ICON_KEYS.map(key => (
            <button
              key={key}
              type="button"
              className="cs-pick"
              aria-pressed={(draft.icon || iconFor(draft)) === key}
              aria-label={`Icon: ${key}`}
              onClick={() => set({ icon: key })}
            ><ActivityIcon name={key} /></button>
          ))}
        </div>
      </fieldset>

      <fieldset className="cs-sec">
        <legend>Background picture</legend>
        <div className="cs-grid cs-grid--photo">
          <button
            type="button"
            className="cs-pick"
            aria-pressed={!photoFor(draft)}
            aria-label="No background picture"
            onClick={() => set({ photo: '' })}
          ><span className="none">None</span></button>
        </div>
        {PHOTO_GROUPS.map(group => (
          <div className="cs-photo-group" key={group.name}>
            <span className="cs-group-name">{group.name}</span>
            <div className="cs-grid cs-grid--photo">
              {group.keys.map(key => (
                <button
                  key={key}
                  type="button"
                  className="cs-pick"
                  aria-pressed={photoFor(draft) === key}
                  aria-label={`Background: ${key}`}
                  onClick={() => set({ photo: key })}
                >
                  {/* The small variant: a 78px cell must not pull a 900px file. */}
                  <img src={`/routine/${key}-thumb.webp`} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="cs-hint">
          With no picture the tile draws a tinted plate carrying its icon.
          Add your own to <code>public/routine/</code> — see ASSETS.md.
        </p>
      </fieldset>

      <div className="cs-preview">
        <span className="cs-sec-title">Preview</span>
        <Preview a={draft} />
      </div>

      {/* ── 3. When it runs ───────────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Which days</legend>
        <div className="cs-seg">
          <button type="button" aria-pressed={schedType === 'daily'}
            onClick={() => set({ schedule: { type: 'daily' } })}>Every day</button>
          <button type="button" aria-pressed={schedType === 'weekdays'}
            onClick={() => set({ schedule: { type: 'weekdays', days: days.length ? days : [1, 2, 3, 4, 5] } })}>
            Specific days
          </button>
        </div>
        {schedType === 'weekdays' && (
          <div className="cs-days">
            {DAYS.map(({ day, label }) => (
              <button
                key={day}
                type="button"
                className="cs-day"
                aria-pressed={days.includes(day)}
                onClick={() => toggleDay(day)}
              >{label}</button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="cs-sec">
        <legend>What time</legend>
        <div className="cs-seg">
          <button type="button" aria-pressed={timing.type === 'flexible'}
            onClick={() => set({ timing: { type: 'flexible' } })}>Any time</button>
          <button type="button" aria-pressed={timing.type === 'anchored'}
            onClick={() => set({ timing: { type: 'anchored', anchor: timing.type === 'anchored' ? timing.anchor : 'At breakfast' } })}>
            Tied to something
          </button>
          <button type="button" aria-pressed={timing.type === 'fixed'}
            onClick={() => set({ timing: { type: 'fixed', start: timing.type === 'fixed' ? timing.start : '11:00', durationMin: timing.type === 'fixed' ? timing.durationMin : 15 } })}>
            At a set time
          </button>
        </div>

        {timing.type === 'anchored' && (
          <input
            className="cs-input"
            value={timing.anchor}
            onChange={e => set({ timing: { type: 'anchored', anchor: e.target.value } })}
            placeholder="e.g. While brushing teeth"
            aria-label="What it is tied to"
          />
        )}

        {timing.type === 'fixed' && (
          <div className="cs-pair">
            <div className="cs-field">
              <label htmlFor="cs-start">Starts at</label>
              <input id="cs-start" className="cs-input" type="time" value={timing.start}
                onChange={e => set({ timing: { ...timing, start: e.target.value || '11:00' } })} />
            </div>
            <div className="cs-field">
              <label htmlFor="cs-dur">Lasts (minutes)</label>
              <input id="cs-dur" className="cs-input" type="number" min={1} max={600} value={timing.durationMin}
                onChange={e => set({ timing: { ...timing, durationMin: Math.max(1, Number(e.target.value) || 1) } })} />
            </div>
          </div>
        )}
      </fieldset>

      {/* An activity with parts is already ticked part by part. */}
      {!draft.children?.length && (
        <fieldset className="cs-sec">
          <legend>How many times a day</legend>
          <div className="cs-seg">
            {SET_CHOICES.map(n => (
              <button
                key={n}
                type="button"
                aria-pressed={(setsOf(draft) || 1) === n}
                aria-label={n === 1 ? 'Once' : `${n} sets`}
                onClick={() => set({ sets: n > 1 ? n : undefined })}
              >{n === 1 ? 'Once' : n}</button>
            ))}
          </div>
          <p className="cs-hint">{setsHint(draft)}</p>
        </fieldset>
      )}

      {/* ── 4. Whether it counts ──────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Counts toward the day</legend>
        <div className="cs-seg">
          <button type="button" aria-pressed={draft.required !== false} onClick={() => set({ required: true })}>Required</button>
          <button type="button" aria-pressed={draft.required === false} onClick={() => set({ required: false })}>Optional</button>
        </div>
        <p className="cs-hint">
          {draft.required === false
            ? 'Shown with an OPTIONAL tag, and never counted in the day’s total.'
            : 'Counted in the day’s X / Y and in the ring.'}
        </p>
      </fieldset>

      {/* ── 5. Where it appears ───────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Where it appears</legend>
        <div className="cs-seg">
          {SURFACES.map(s => (
            <button
              key={s.value}
              type="button"
              aria-pressed={(draft.surface || 'routine') === s.value}
              onClick={() => set({
                surface: s.value,
                // The Plan calendar can only place something with a clock time.
                timing: s.value !== 'routine' && draft.timing.type !== 'fixed'
                  ? { type: 'fixed', start: '11:00', durationMin: 15 }
                  : draft.timing,
              })}
            >{s.label}</button>
          ))}
        </div>
        <p className="cs-hint">
          Position on the dashboard is set by the arrows in the activity list.
        </p>
      </fieldset>

      {/* ── 6. Extras ─────────────────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Extras</legend>
        {!showExtras ? (
          <button type="button" className="cs-btn cs-btn--quiet" style={{ alignSelf: 'flex-start' }}
            onClick={() => setShowExtras(true)}>Timer, target, links, variants…</button>
        ) : (
          <>
            <div className="cs-pair">
              <div className="cs-field">
                <span className="cs-label" id="cs-timer-label">Countdown</span>
                <div className="cs-timer">
                  <button type="button" className="cs-switch" role="switch" aria-checked={timerOn}
                    aria-labelledby="cs-timer-label"
                    onClick={() => {
                      if (timerOn) { set({ timerOff: true }); return; }
                      const sec = draft.timerSec || DEFAULT_TIMER_MIN * 60;
                      set({ timerOff: undefined, timerSec: sec });
                      setTimerText(minutesOf(sec));
                    }} />
                  <input className="cs-input" type="number" inputMode="numeric" min={1} max={MAX_TIMER_MIN}
                    aria-label="Countdown minutes" placeholder={String(DEFAULT_TIMER_MIN)}
                    disabled={!timerOn} value={timerText}
                    onChange={e => {
                      setTimerText(e.target.value);
                      const m = Math.round(Number(e.target.value));
                      if (m >= 1) set({ timerSec: Math.min(MAX_TIMER_MIN, m) * 60 });
                    }}
                    onBlur={() => setTimerText(minutesOf(draft.timerSec))} />
                  <span className="cs-unit" aria-hidden="true">min</span>
                </div>
                <p className="cs-hint">{timerHint(draft)}</p>
              </div>
              <div className="cs-field">
                <label htmlFor="cs-target">Target</label>
                <div className="cs-pair" style={{ gap: 8 }}>
                  <select id="cs-target" className="cs-select" value={draft.target?.kind || 'none'}
                    onChange={e => set({ target: e.target.value === 'none' ? undefined
                      : { kind: e.target.value as 'reps' | 'minutes', value: draft.target?.value || 10 } })}>
                    <option value="none">None</option>
                    <option value="reps">Reps</option>
                    <option value="minutes">Minutes</option>
                  </select>
                  {draft.target && (
                    <input className="cs-input" type="number" min={1} value={draft.target.value}
                      aria-label="Target amount"
                      onChange={e => set({ target: { kind: draft.target!.kind, value: Math.max(1, Number(e.target.value) || 1) } })} />
                  )}
                </div>
              </div>
            </div>

            <div className="cs-field" role="group" aria-labelledby="cs-links-label">
              <span id="cs-links-label" className="cs-label">Links</span>
              {links.length > 0 && (
                <div className="cs-links">
                  {links.map((l, i) => (
                    <div className="cs-link" key={i}>
                      <input className="cs-input" aria-label={`Link ${i + 1} name`} value={l.label}
                        onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="AI Challenges" />
                      <input className="cs-input" type="url" inputMode="url" aria-label={`Link ${i + 1} address`} value={l.url}
                        onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                        placeholder="https://" />
                      <button type="button" className="cs-link-x" aria-label={`Remove ${l.label.trim() || `link ${i + 1}`}`}
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}><IconX /></button>
                    </div>
                  ))}
                </div>
              )}
              {links.length < MAX_LINKS && (
                <button type="button" className="cs-btn cs-btn--quiet" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setLinks([...links, { label: '', url: '' }])}><IconPlus />Add a link</button>
              )}
              <p className="cs-hint">{linksHint(draft, links.length)}</p>
            </div>

            <div className="cs-pair">
              <div className="cs-field">
                <label htmlFor="cs-variants">Variants (comma separated)</label>
                <input id="cs-variants" className="cs-input" value={(draft.variants || []).join(', ')}
                  onChange={e => {
                    const list = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
                    set({ variants: list.length ? list : undefined });
                  }}
                  placeholder="Cycling, Rowing" />
              </div>
              <div className="cs-field">
                <label htmlFor="cs-group">Dashboard group</label>
                <select id="cs-group" className="cs-select" value={draft.group}
                  onChange={e => set({ group: e.target.value })}>
                  {ROUTINE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  <option value="work">Work (Plan only)</option>
                </select>
              </div>
            </div>

            <div className="cs-field">
              <label htmlFor="cs-cat">Category</label>
              <select id="cs-cat" className="cs-select" value={draft.category}
                onChange={e => set({ category: e.target.value as RoutineCategory })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
          </>
        )}
      </fieldset>

      {/* ── 7. Status ─────────────────────────────────────────────────── */}
      <fieldset className="cs-sec">
        <legend>Status</legend>
        <div className="cs-seg">
          {(['active', 'paused', 'archived'] as RoutineStatus[]).map(s => (
            <button key={s} type="button" aria-pressed={draft.status === s} onClick={() => set({ status: s })}>
              {s === 'active' ? 'Active' : s === 'paused' ? 'Paused' : 'Archived'}
            </button>
          ))}
        </div>
        <p className="cs-hint">
          Paused and archived activities stop appearing on new days. Everything you have
          already ticked is kept either way.
        </p>
      </fieldset>

      <div className="cs-form-foot">
        {!isNew && (
          <button type="button" className="cs-btn cs-btn--danger" onClick={onArchive}>
            <IconTrash />Remove
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="cs-btn cs-btn--quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="cs-btn cs-btn--primary" onClick={onSave} disabled={!draft.title.trim()}>
          <IconCheck />{isNew ? 'Add activity' : 'Save'}
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
  // The activity as it was when the editor opened, to tell whether leaving
  // would throw edits away.
  const [opened, setOpened] = useState<RoutineActivity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const openEditor = (a: RoutineActivity, fresh: boolean) => {
    setDraft(a);
    setOpened(a);
    setIsNew(fresh);
  };
  const closeEditor = () => {
    setDraft(null);
    setOpened(null);
    setIsNew(false);
  };
  // Back, close and a tap outside the sheet all leave the editor; with
  // unsaved edits they ask first. Cancel is the one deliberate discard.
  const leaveEditor = (then: () => void) => {
    if (draft && JSON.stringify(draft) !== JSON.stringify(opened)
      && !window.confirm(`Discard your changes to "${draft.title.trim() || 'this activity'}"?`)) return;
    then();
  };

  const visible = useMemo(
    () => [...activities]
      .filter(a => showArchived || a.status !== 'archived')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [activities, showArchived]);

  const commit = (next: RoutineActivity) => {
    const stamped = { ...withNamedParts(next), updatedAt: new Date().toISOString() };
    onSave(activities.some(a => a.id === next.id)
      ? activities.map(a => (a.id === next.id ? stamped : a))
      : [...activities, stamped]);
    closeEditor();
  };

  // Removing archives rather than deletes: completion history is keyed by
  // activity id, so dropping the definition would orphan every past record.
  const archive = (a: RoutineActivity) => {
    if (!window.confirm(`Remove "${a.title}" from your routine?\n\nIt stops appearing from today, and unsaved changes in this form are lost. What you have ticked is kept, and "Show removed" at the foot of the list brings it back.`)) return;
    onSave(activities.map(x => (x.id === a.id
      ? { ...x, status: 'archived' as const, updatedAt: new Date().toISOString() } : x)));
    closeEditor();
  };

  const move = (a: RoutineActivity, dir: -1 | 1) => {
    const sorted = [...activities].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const i = sorted.findIndex(x => x.id === a.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    [next[i], next[j]] = [next[j], next[i]];
    const now = new Date().toISOString();
    onSave(next.map((x, idx) => ({ ...x, order: (idx + 1) * 10, updatedAt: now })));
  };

  const maxOrder = activities.reduce((m, a) => Math.max(m, a.order ?? 0), 0);

  return (
    <div
      className="ds-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Routine settings"
      onClick={e => { if (e.target === e.currentTarget) leaveEditor(onClose); }}
    >
      <div className="cs">
        <div className="cs-head">
          {draft ? (
            <button className="cs-back" onClick={() => leaveEditor(closeEditor)}>
              <IconChevronLeft />All activities
            </button>
          ) : (
            <h2>Routine settings</h2>
          )}
          <button className="cs-close" onClick={() => leaveEditor(onClose)} aria-label="Close"><IconX /></button>
        </div>

        <div className="cs-body">
          {draft ? (
            <Editor
              draft={draft}
              isNew={isNew}
              onChange={setDraft}
              onCancel={closeEditor}
              onSave={() => commit(draft)}
              onArchive={() => archive(draft)}
            />
          ) : (
            <>
              <div className="cs-list">
                {visible.map((a, i) => {
                  const photo = photoFor(a);
                  return (
                    <div key={a.id} className={`cs-row${a.status !== 'active' ? ' off' : ''}`}>
                      <button className="cs-row-main" onClick={() => openEditor(a, false)}>
                        <span className="cs-thumb">
                          {photo && AVAILABLE_PHOTOS.has(photo) && <img src={`/routine/${photo}-thumb.webp`} alt="" loading="lazy" />}
                          <ActivityIcon name={a.icon} fallback={iconFor(a)} />
                        </span>
                        <span className="cs-row-text">
                          <span className="cs-row-title">
                            {a.title}
                            {a.required === false && <span className="cs-badge">Optional</span>}
                            {a.status !== 'active' && <span className="cs-badge">{a.status}</span>}
                            {a.surface === 'calendar' && <span className="cs-badge">Plan only</span>}
                          </span>
                          <span className="cs-row-meta">
                            {GROUP_TITLES[a.group] || a.group} · {daysSummary(a)} · {timeSummary(a)}
                          </span>
                        </span>
                      </button>
                      <div className="cs-move">
                        <button onClick={() => move(a, -1)} disabled={i === 0} aria-label={`Move ${a.title} earlier`}><IconArrowUp /></button>
                        <button onClick={() => move(a, 1)} disabled={i === visible.length - 1} aria-label={`Move ${a.title} later`}><IconArrowDown /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cs-foot">
                <button className="cs-btn cs-btn--primary"
                  onClick={() => openEditor(blankActivity(maxOrder + 10), true)}>
                  <IconPlus />Add activity
                </button>
                <button className="cs-btn cs-btn--quiet" onClick={() => setShowArchived(v => !v)}>
                  {showArchived ? 'Hide removed' : 'Show removed'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

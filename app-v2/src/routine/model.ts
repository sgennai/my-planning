// The routine domain model — the single source of truth for both the Routine
// dashboard and the timed events the Plan calendar renders.
//
// One activity, two possible surfaces. `surface` decides where it shows:
//   'routine'  — a habit you tick off (breakfast stack, plank, magnesium)
//   'calendar' — day scaffolding, not a habit (co-working, commute, focus block)
//   'both'     — a habit that also owns a slot in the day (11:00 supplements)
// This is what lets one model feed two very different surfaces without either
// one filling up with rows that don't belong to it.

import { GYM_BAG_CONTENTS, WORK_BAG_CONTENTS } from '../storage/data';

/** 0 = Sunday … 6 = Saturday, matching Date#getDay and the legacy routine shape. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RoutineSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] };

export type RoutineTiming =
  /** A precise clock time. The only timing that can reach the Plan calendar. */
  | { type: 'fixed'; start: string; durationMin: number }
  /** Tied to another event rather than a clock — "while brushing my teeth". */
  | { type: 'anchored'; anchor: string }
  /** Any time today. */
  | { type: 'flexible' };

/** Visual accent buckets. Deliberately few, and about meaning, not colour. */
export type RoutineCategory =
  | 'nourishment'   // supplements, protein, electrolytes
  | 'body'          // strength, cardio, plank, squats, wall sit
  | 'mind'          // reading, podcasts, ChatGPT outputs
  | 'recovery'      // evening wind-down, magnesium
  | 'work'          // focus blocks, co-working, commute, review
  | 'open';         // optional activities — intentionally colourless

export type RoutineSurface = 'routine' | 'calendar' | 'both';

export type RoutineStatus = 'active' | 'paused' | 'archived';

export interface RoutineTarget {
  kind: 'reps' | 'minutes';
  value: number;
}

export interface RoutineLink {
  label: string;
  url: string;
}

/** A child of a grouped activity. Individually tickable, counted as part of the parent. */
export interface RoutineChild {
  id: string;
  title: string;
  note?: string;
}

export interface RoutineActivity {
  id: string;
  title: string;
  description?: string;
  /** Layout group id — see ROUTINE_GROUPS. */
  group: string;
  category: RoutineCategory;
  schedule: RoutineSchedule;
  timing: RoutineTiming;
  surface: RoutineSurface;
  /** false = optional: shown, but never in the day's denominator. */
  required: boolean;
  status: RoutineStatus;
  order: number;
  /** Expandable sub-items. The parent counts once however many children exist. */
  children?: RoutineChild[];
  /** Seconds for an integrated countdown (plank 120, strength 1200). */
  timerSec?: number;
  /** A measurable target shown next to the title (40 reps, 20 minutes). */
  target?: RoutineTarget;
  /** One-tap launch link — ChatGPT, a reader, a podcast app. */
  link?: RoutineLink;
  /** Mutually exclusive ways to do it; the completed one is recorded. */
  variants?: string[];
  /** Opaque passthrough for the legacy top-of-hour micro-strength recurrence. */
  recurrence?: unknown;
  /**
   * Which legacy calendar category colours this activity on the Plan grids.
   * Lets the calendar keep its established palette (commute, elsewhere, review)
   * while the dashboard uses the six meaning-based buckets above.
   */
  calendarCategory?: string;
  /** Legacy flag honoured by the Plan calendar's "elsewhere" filter. */
  homeOnly?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Dashboard layout groups, in display order. */
export interface RoutineGroup {
  id: string;
  title: string;
  /** Shown under the group title when the grouping needs explaining. */
  hint?: string;
}

export const ROUTINE_GROUPS: RoutineGroup[] = [
  { id: 'morning',     title: 'Morning' },
  { id: 'midmorning',  title: 'Mid-morning' },
  { id: 'training',    title: 'Training' },
  { id: 'movement',    title: 'Movement', hint: 'Any time today' },
  { id: 'learning',    title: 'Learning', hint: 'Any time today' },
  { id: 'evening',     title: 'Evening' },
  { id: 'optional',    title: 'Optional', hint: 'Never counted against the day' },
];

export const GROUP_TITLES: Record<string, string> =
  Object.fromEntries(ROUTINE_GROUPS.map(g => [g.id, g.title]));

export const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  nourishment: 'Nourishment',
  body: 'Body',
  mind: 'Mind',
  recovery: 'Recovery',
  work: 'Work',
  open: 'Optional',
};

const DAILY: RoutineSchedule = { type: 'daily' };
const on = (...days: Weekday[]): RoutineSchedule => ({ type: 'weekdays', days });
const MON_FRI = on(1, 2, 3, 4, 5);

const flexible: RoutineTiming = { type: 'flexible' };
const anchored = (anchor: string): RoutineTiming => ({ type: 'anchored', anchor });
const at = (start: string, durationMin: number): RoutineTiming => ({ type: 'fixed', start, durationMin });

// ═════════════════════════════════════════════════════════════════════════
// SEED — the routine as specified. Seeded once; thereafter the user's own
// edits are authoritative and this list is never re-applied over them.
// ═════════════════════════════════════════════════════════════════════════

export const SEED_ROUTINE_ACTIVITIES: RoutineActivity[] = [
  // ── Morning ──────────────────────────────────────────────────────────
  {
    id: 'ra-breakfast-stack',
    title: 'Breakfast stack',
    description: 'Established habit — kept compact on purpose.',
    group: 'morning',
    category: 'nourishment',
    schedule: DAILY,
    timing: anchored('with breakfast'),
    surface: 'routine',
    required: true,
    status: 'active',
    order: 10,
    children: [
      { id: 'probiotics', title: 'Probiotics' },
      { id: 'omega3', title: 'Omega 3' },
      { id: 'multivitamins', title: 'Multivitamins' },
      { id: 'protein', title: 'Protein' },
    ],
  },
  {
    id: 'ra-wall-sit',
    title: 'Wall sit',
    description: 'Quadriceps.',
    group: 'morning',
    category: 'body',
    schedule: DAILY,
    timing: anchored('while brushing teeth'),
    surface: 'routine',
    required: true,
    status: 'active',
    order: 20,
  },

  // ── Mid-morning ──────────────────────────────────────────────────────
  {
    id: 'ra-1100-stack',
    title: '11:00 stack',
    group: 'midmorning',
    category: 'nourishment',
    schedule: DAILY,
    timing: at('11:00', 10),
    surface: 'both',
    required: true,
    status: 'active',
    order: 30,
    calendarCategory: 'supplement',
    children: [
      { id: 'creatine', title: 'Creatine' },
      { id: 'vitamin-d', title: 'Vitamin D' },
    ],
  },
  {
    id: 'ra-electrolytes',
    title: 'Electrolytes',
    group: 'midmorning',
    category: 'nourishment',
    schedule: on(3, 6), // Wednesday, Saturday
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 40,
  },

  // ── Training ─────────────────────────────────────────────────────────
  {
    id: 'ra-strength',
    title: 'Strength training',
    description: '20 minutes.',
    group: 'training',
    category: 'body',
    schedule: on(1, 2, 4, 5), // Mon, Tue, Thu, Fri
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 50,
    timerSec: 20 * 60,
    target: { kind: 'minutes', value: 20 },
  },
  {
    id: 'ra-cardio',
    title: 'Cardio',
    description: 'Cycling or rowing — record which.',
    group: 'training',
    category: 'body',
    schedule: on(3), // Wednesday
    timing: at('12:00', 60),
    surface: 'both',
    required: true,
    status: 'active',
    order: 60,
    calendarCategory: 'gym',
    variants: ['Cycling', 'Rowing'],
  },

  // ── Movement (flexible, every day) ───────────────────────────────────
  {
    id: 'ra-plank',
    title: 'Plank',
    group: 'movement',
    category: 'body',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 70,
    timerSec: 2 * 60,
    target: { kind: 'minutes', value: 2 },
  },
  {
    id: 'ra-air-squats',
    title: 'Air squats',
    group: 'movement',
    category: 'body',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 80,
    target: { kind: 'reps', value: 40 },
  },

  // ── Learning (flexible, every day) ───────────────────────────────────
  {
    id: 'ra-chatgpt-tasks',
    title: 'ChatGPT scheduled tasks',
    description: 'Read the overnight task output.',
    group: 'learning',
    category: 'mind',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 90,
    link: { label: 'Open ChatGPT', url: 'https://chatgpt.com/' },
  },
  {
    id: 'ra-industry-reading',
    title: 'Industry articles',
    description: 'Enterprise AI · customer engagement.',
    group: 'learning',
    category: 'mind',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 100,
    link: { label: 'Open reader', url: 'https://www.inoreader.com/' },
  },
  {
    id: 'ra-podcast',
    title: 'Podcast',
    group: 'learning',
    category: 'mind',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: true,
    status: 'active',
    order: 110,
    link: { label: 'Open podcasts', url: 'https://podcasts.apple.com/' },
  },

  // ── Evening ──────────────────────────────────────────────────────────
  {
    id: 'ra-magnesium',
    title: 'Magnesium',
    description: 'Shortly before bed.',
    group: 'evening',
    category: 'recovery',
    schedule: DAILY,
    timing: anchored('before bed'),
    surface: 'routine',
    required: true,
    status: 'active',
    order: 120,
  },

  // ── Optional — present, never counted ────────────────────────────────
  {
    id: 'ra-freediving',
    title: 'Freediving dry training',
    group: 'optional',
    category: 'open',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: false,
    status: 'active',
    order: 130,
  },
  {
    id: 'ra-read-book',
    title: 'Read a book',
    group: 'optional',
    category: 'open',
    schedule: DAILY,
    timing: flexible,
    surface: 'routine',
    required: false,
    status: 'active',
    order: 140,
  },

  // ── Calendar scaffolding ─────────────────────────────────────────────
  // Not habits, so they never reach the Routine checklist. They carry the
  // shape of the working day on the Plan calendar, which is why they are
  // seeded from the existing routine rather than dropped.
  {
    id: 'ra-focus-session',
    title: '2h Focus Session',
    description: 'Cycle through projects: NEXT / APP - AI FOR SALES / AI content from NEXT.',
    group: 'work',
    category: 'work',
    schedule: MON_FRI,
    timing: at('08:45', 120),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 200,
    calendarCategory: 'focus',
  },
  {
    id: 'ra-drive-cowork-am',
    title: 'Drive to co-working',
    description: 'Listen to podcast — AI / B2B sales content.',
    group: 'work',
    category: 'work',
    schedule: on(1),
    timing: at('08:00', 30),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 210,
    calendarCategory: 'commute',
  },
  {
    id: 'ra-cowork-am',
    title: 'Co-working space',
    group: 'work',
    category: 'work',
    schedule: on(1),
    timing: at('08:30', 195),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 220,
    calendarCategory: 'elsewhere',
  },
  {
    id: 'ra-cowork-pm',
    title: 'Co-working space',
    group: 'work',
    category: 'work',
    schedule: on(1),
    timing: at('14:00', 240),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 230,
    calendarCategory: 'elsewhere',
  },
  {
    id: 'ra-drive-home',
    title: 'Drive home',
    description: 'Listen to podcast — AI / B2B sales content.',
    group: 'work',
    category: 'work',
    schedule: on(1),
    timing: at('18:00', 30),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 240,
    calendarCategory: 'commute',
  },
  {
    id: 'ra-weekly-review',
    title: 'Weekly Review',
    description: 'CEO Weekly Reset — finish by 15:30. Laptop closed. Weekend protected.',
    group: 'work',
    category: 'work',
    schedule: on(5),
    timing: at('15:00', 30),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 250,
    calendarCategory: 'review',
  },
  {
    id: 'ra-plan-tomorrow',
    title: "Plan tomorrow's focus",
    group: 'work',
    category: 'work',
    schedule: on(1, 2, 3, 4),
    timing: at('21:00', 10),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 260,
    calendarCategory: 'planning',
  },
  {
    id: 'ra-prep-work-bag',
    title: 'Pack work bag',
    description: WORK_BAG_CONTENTS,
    group: 'work',
    category: 'work',
    schedule: on(0),
    timing: at('21:10', 10),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 270,
    calendarCategory: 'prep',
  },
  {
    id: 'ra-prep-gym-bag',
    title: 'Pack gym bag',
    description: GYM_BAG_CONTENTS,
    group: 'work',
    category: 'work',
    schedule: on(0),
    timing: at('21:00', 10),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 280,
    calendarCategory: 'prep',
  },
  {
    id: 'ra-define-winning',
    title: 'Define what winning looks like',
    description: 'Set the bar for the upcoming week. Specific, measurable, ambitious.',
    group: 'work',
    category: 'work',
    schedule: on(0),
    timing: at('21:25', 15),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 290,
    calendarCategory: 'planning',
  },
  {
    id: 'ra-micro-strength',
    title: 'Micro-Strength',
    group: 'work',
    category: 'body',
    schedule: MON_FRI,
    timing: at('09:00', 1),
    surface: 'calendar',
    required: false,
    status: 'active',
    order: 300,
    calendarCategory: 'micro-strength',
    homeOnly: true,
    recurrence: { kind: 'top-of-hour', startHour: 9, endHour: 18 },
  },
];

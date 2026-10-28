// v28: bring pre-rename routine labels up to the current wording.
//
// Devices that seeded the routine before the labels were aligned with the
// brief still read "11:00 stack", "Plank", "Air squats". These rewrite only
// where the stored value is *still exactly* the old seed string — if the
// value was edited, it no longer matches and is left alone. Nothing else on
// the activity is touched, and no completion record is affected: history is
// keyed by activity id, which never changes here.
//
// Links follow a different rule: a list is set once, on an activity that has
// no list of its own yet. After that the activity carries one, so the user's
// list, even an emptied one, is never replaced.

import type { RoutineActivity, RoutineLink } from './model';
import { BRIEFING_LINKS } from './model';

interface Relabel {
  title?: [from: string, to: string];
  description?: [from: string | undefined, to: string | undefined];
  anchor?: [from: string, to: string];
  links?: RoutineLink[];
}

const RELABELS: Record<string, Relabel> = {
  'ra-1100-stack':       { title: ['11:00 stack', 'Creatine + Vitamin D'] },
  'ra-cardio':           { title: ['Cardio', 'Cycling or rowing'],
                           description: ['Cycling or rowing — record which.', undefined] },
  'ra-plank':            { title: ['Plank', '2-minute plank'] },
  'ra-air-squats':       { title: ['Air squats', '40 air squats'] },
  'ra-chatgpt-tasks':    { title: ['ChatGPT scheduled tasks', 'ChatGPT briefings'],
                           description: ['Read the overnight task output.', "Today's outputs"],
                           links: BRIEFING_LINKS },
  'ra-industry-reading': { description: ['Enterprise AI · customer engagement.', 'AI & customer engagement'] },
  'ra-podcast':          { description: [undefined, 'Listen today'] },
  'ra-breakfast-stack':  { anchor: ['with breakfast', 'At breakfast'],
                           description: ['Established habit — kept compact on purpose.', undefined] },
  'ra-wall-sit':         { anchor: ['while brushing teeth', 'While brushing teeth'],
                           description: ['Quadriceps.', undefined] },
  'ra-magnesium':        { anchor: ['before bed', 'Before bed'],
                           description: ['Shortly before bed.', undefined] },
  'ra-strength':         { description: ['20 minutes.', undefined] },
};

/** Returns the relabelled list, and whether anything actually changed. */
export function relabelRoutine(
  activities: RoutineActivity[] | undefined,
): { activities: RoutineActivity[]; changed: boolean } {
  if (!Array.isArray(activities)) return { activities: activities || [], changed: false };

  let changed = false;
  const next = activities.map(a => {
    const rule = RELABELS[a.id];
    if (!rule) return a;

    let patched = a;
    const edit = <K extends keyof RoutineActivity>(key: K, value: RoutineActivity[K]) => {
      patched = { ...patched, [key]: value };
      changed = true;
    };

    if (rule.title && a.title === rule.title[0]) edit('title', rule.title[1]);
    if (rule.description && (a.description || undefined) === rule.description[0]) {
      edit('description', rule.description[1]);
    }
    if (rule.anchor && a.timing?.type === 'anchored' && a.timing.anchor === rule.anchor[0]) {
      edit('timing', { type: 'anchored', anchor: rule.anchor[1] });
    }
    if (rule.links && a.links === undefined) {
      edit('links', rule.links.map(l => ({ ...l })));
      edit('link', undefined);
    }
    return patched;
  });

  return { activities: changed ? next : activities, changed };
}

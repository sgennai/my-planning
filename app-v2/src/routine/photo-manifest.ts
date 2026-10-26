// Which routine photographs are present on disk.
//
// A key only renders as a photograph once it is listed here; otherwise the
// tile falls back to a composed plate, so a missing file never shows as a
// broken image. See public/routine/ASSETS.md and CREDITS.md.

/** Add a key here when you add `public/routine/<key>.webp`. */
export const AVAILABLE_PHOTOS = new Set<string>([
  'breakfast',
  'wallsit',
  'capsule',
  'electrolyte',
  'cycling',
  'plank',
  'squats',
  'briefings',
  'articles',
  'magnesium',
  'freediving',
  'book',
  'podcast',
  'summit',
]);

/**
 * Photo key by activity id.
 *
 * Which photograph illustrates an activity is presentation, not user data,
 * so it is resolved here rather than read back from storage. An activity
 * seeded before the photo key existed still gets its picture, and changing
 * the art direction never needs a migration.
 */
export const PHOTO_BY_ACTIVITY: Record<string, string> = {
  'ra-breakfast-stack':  'breakfast',
  'ra-wall-sit':         'wallsit',
  'ra-1100-stack':       'capsule',
  'ra-electrolytes':     'electrolyte',
  'ra-strength':         'squats',
  'ra-cardio':           'cycling',
  'ra-plank':            'plank',
  'ra-air-squats':       'squats',
  'ra-chatgpt-tasks':    'briefings',
  'ra-industry-reading': 'articles',
  'ra-podcast':          'podcast',
  'ra-magnesium':        'magnesium',
  'ra-freediving':       'freediving',
  'ra-read-book':        'book',
};

/**
 * The activity's own key wins; otherwise fall back to the table above.
 *
 * An empty string is an explicit "no picture" — the settings editor sets it
 * when you choose None, and it has to survive the fallback or the tile would
 * silently get its seeded photograph back.
 */
export function photoFor(activity: { id: string; photo?: string }): string | undefined {
  if (activity.photo === '') return undefined;
  return activity.photo || PHOTO_BY_ACTIVITY[activity.id];
}

/**
 * Exposure is corrected when the asset is fetched, not at render time.
 *
 * These fourteen frames measured between 20 and 162 mean luminance, so they
 * needed per-image correction to sit in one band. Doing it with a CSS
 * `filter` gave each tile its own compositing layer — fourteen of them, on
 * hardware the brief explicitly asks us to be careful with. The correction
 * is baked into the files instead (see CREDITS.md for the `bri` values), and
 * the app renders plain images.
 */

/**
 * Icon by activity id.
 *
 * Which mark illustrates an activity is presentation, not user data, so it
 * is resolved here rather than read back from storage — an activity seeded
 * before the icon field existed still gets its mark, and changing the art
 * direction never needs a migration. Same reasoning as
 * PHOTO_BY_ACTIVITY above.
 */
export const ICON_BY_ACTIVITY: Record<string, string> = {
  'ra-breakfast-stack':  'bowl',
  'ra-wall-sit':         'wallsit',
  'ra-1100-stack':       'capsule',
  'ra-electrolytes':     'droplet',
  'ra-strength':         'barbell',
  'ra-cardio':           'bike',
  'ra-plank':            'stopwatch',
  'ra-air-squats':       'dumbbell',
  'ra-chatgpt-tasks':    'sparkle',
  'ra-industry-reading': 'document',
  'ra-podcast':          'headphones',
  'ra-magnesium':        'moon',
  'ra-freediving':       'waves',
  'ra-read-book':        'book',
  'ra-focus-session':    'target',
  'ra-drive-cowork-am':  'car',
  'ra-cowork-am':        'building',
  'ra-cowork-pm':        'building',
  'ra-drive-home':       'car',
  'ra-weekly-review':    'chart',
  'ra-plan-tomorrow':    'calendar',
  'ra-prep-work-bag':    'bag',
  'ra-prep-gym-bag':     'bag',
  'ra-define-winning':   'target',
  'ra-micro-strength':   'bolt',
};

/**
 * The mark for an activity, derived from its id alone.
 *
 * Passed to `ActivityIcon` as the fallback behind whatever key storage
 * holds: a stored key can name a mark that has since been renamed or
 * dropped (`kettlebell` became `dumbbell`), and falling through to the
 * neutral dot puts a second circle on the tile beside its status mark.
 */
export function iconFor(activity: { id: string }): string | undefined {
  return ICON_BY_ACTIVITY[activity.id];
}

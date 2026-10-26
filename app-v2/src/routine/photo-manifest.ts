// Which routine photographs are present on disk.
//
// A key only renders as a photograph once it is listed here; otherwise the
// tile falls back to a composed plate, so a missing file never shows as a
// broken image. See public/routine/ASSETS.md and CREDITS.md.

/**
 * Add a key here when you add `public/routine/<key>.webp` — and its
 * matching `<key>-thumb.webp`, which is what the settings picker loads.
 */
export const AVAILABLE_PHOTOS = new Set<string>([
  // Training
  'strength',
  'squat',
  'asiansquat',
  'squats',
  'kettlebell',
  'pullups',
  'core',
  'boxing',
  'jumprope',
  'plank',
  // Cardio
  'spin',
  'cycling',
  'rowing',
  'running',
  'swimming',
  'walking',
  'hiking',
  // Mobility & recovery
  'stretch',
  'wallsit',
  'foamroller',
  'sauna',
  'coldplunge',
  'freediving',
  // Food & drink
  'breakfast',
  'mealprep',
  'fruit',
  'proteinshake',
  'tea',
  'coffee',
  'electrolyte',
  'collagen',
  'capsule',
  // Mind & focus
  'meditation',
  'breathwork',
  'reflect',
  'planning',
  'writing',
  'flashcards',
  'briefings',
  'articles',
  'deskwork',
  'finance',
  'detox',
  // Rest & care
  'sleep',
  'magnesium',
  'skincare',
  'dental',
  'sunrise',
  // Listening & reading
  'podcast',
  'book',
  'music',
  // Places
  'summit',
  'plants',
  'phonecall',
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

/**
 * Plate tones, keyed by photo name *or* icon name.
 *
 * An activity you create has no photograph until you pick one, so its plate
 * is what you actually see. Keying on the icon too means a new activity
 * takes a tone that suits the mark you chose rather than everything
 * defaulting to the same blue.
 */
export const PLATE_TONES: Record<string, [string, string, string]> = {
  breakfast:   ['#2A3A52', '#141F33', 'rgba(150,130,90,.34)'],
  wallsit:     ['#1E3350', '#101D33', 'rgba(70,120,200,.34)'],
  capsule:     ['#2B3350', '#141B30', 'rgba(190,160,90,.30)'],
  electrolyte: ['#1B3A55', '#0F2236', 'rgba(80,160,210,.36)'],
  cycling:     ['#243348', '#121D30', 'rgba(90,130,190,.30)'],
  plank:       ['#2A3148', '#15192C', 'rgba(120,140,200,.28)'],
  squats:      ['#222E44', '#11182A', 'rgba(100,125,175,.28)'],
  briefings:   ['#13304F', '#0B1B30', 'rgba(50,140,230,.42)'],
  articles:    ['#2C3447', '#161B2A', 'rgba(170,175,195,.26)'],
  magnesium:   ['#332A3F', '#1A1626', 'rgba(210,150,90,.30)'],
  freediving:  ['#12405E', '#09243C', 'rgba(60,170,220,.44)'],
  book:        ['#3A2F3C', '#1D1724', 'rgba(220,160,80,.32)'],
  podcast:     ['#1C3350', '#0C1B30', 'rgba(70,140,220,.38)'],
  summit:      ['#1A2E52', '#0C1A31', 'rgba(80,130,210,.40)'],

  // By icon, for activities that have no picture yet. Keys that already
  // name a photograph above (wallsit, capsule, book) serve both.
  bowl:        ['#2A3A52', '#141F33', 'rgba(150,130,90,.34)'],
  droplet:     ['#1B3A55', '#0F2236', 'rgba(80,160,210,.36)'],
  dumbbell:    ['#222E44', '#11182A', 'rgba(100,125,175,.28)'],
  barbell:     ['#243348', '#121D30', 'rgba(90,130,190,.30)'],
  bike:        ['#243348', '#121D30', 'rgba(90,130,190,.30)'],
  stopwatch:   ['#2A3148', '#15192C', 'rgba(120,140,200,.28)'],
  sparkle:     ['#13304F', '#0B1B30', 'rgba(50,140,230,.42)'],
  document:    ['#2C3447', '#161B2A', 'rgba(170,175,195,.26)'],
  headphones:  ['#1C3350', '#0C1B30', 'rgba(70,140,220,.38)'],
  moon:        ['#332A3F', '#1A1626', 'rgba(210,150,90,.30)'],
  waves:       ['#12405E', '#09243C', 'rgba(60,170,220,.44)'],
  target:      ['#1F2F4C', '#0F1A2E', 'rgba(90,140,215,.34)'],
  car:         ['#26303F', '#131A26', 'rgba(130,150,185,.26)'],
  building:    ['#232E42', '#121A28', 'rgba(110,140,190,.28)'],
  chart:       ['#1C3148', '#0E1C2C', 'rgba(70,150,210,.34)'],
  calendar:    ['#252F49', '#13192B', 'rgba(120,140,205,.30)'],
  bag:         ['#2E3040', '#171926', 'rgba(150,150,185,.26)'],
  bolt:        ['#2B3250', '#141A30', 'rgba(130,145,230,.34)'],
};

/**
 * Deterministic tone for a key with no entry above — a user-created
 * activity still gets its own colour rather than everyone sharing one.
 * Hue only; the saturation and lightness stay inside the dark palette.
 */
export function derivedTone(key: string): [string, string, string] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return [
    `hsl(${h} 32% 22%)`,
    `hsl(${h} 38% 11%)`,
    `hsla(${h} 55% 55% / .32)`,
  ];
}

/**
 * The picker's shape. Fifty-four options is a library, not a row — grouping
 * them by what they depict is the difference between choosing and scanning.
 */
export const PHOTO_GROUPS: { name: string; keys: string[] }[] = [
  { name: 'Training', keys: ['strength', 'squat', 'asiansquat', 'squats', 'kettlebell', 'pullups', 'core', 'boxing', 'jumprope', 'plank'] },
  { name: 'Cardio', keys: ['spin', 'cycling', 'rowing', 'running', 'swimming', 'walking', 'hiking'] },
  { name: 'Mobility & recovery', keys: ['stretch', 'wallsit', 'foamroller', 'sauna', 'coldplunge', 'freediving'] },
  { name: 'Food & drink', keys: ['breakfast', 'mealprep', 'fruit', 'proteinshake', 'tea', 'coffee', 'electrolyte', 'collagen', 'capsule'] },
  { name: 'Mind & focus', keys: ['meditation', 'breathwork', 'reflect', 'planning', 'writing', 'flashcards', 'briefings', 'articles', 'deskwork', 'finance', 'detox'] },
  { name: 'Rest & care', keys: ['sleep', 'magnesium', 'skincare', 'dental', 'sunrise'] },
  { name: 'Listening & reading', keys: ['podcast', 'book', 'music'] },
  { name: 'Places', keys: ['summit', 'plants', 'phonecall'] },
];

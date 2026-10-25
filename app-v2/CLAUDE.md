# My Planning 2.0 (app-v2)

A personal routine and portfolio dashboard, built iPad-first, around a job switch
(Senior AE → VP Sales → VP of AI). Real **Vite + React 19 + TypeScript** build,
**offline-first IndexedDB** store, per-entity sync through a Cloudflare Worker. Replaces the
v1 runtime-Babel single-global-scope app.

**Six sections, Routine first and default:** Routine · Plan · Practice · Intake · Create · Setup.

## Sources of truth

- **Design system (current):** `src/styles/system.css` — the single token set for all six
  sections. Warm stone neutrals, one slate-indigo accent for anything interactive, sage
  reserved for done, five desaturated category accents, Instrument Serif / Instrument Sans /
  IBM Plex Mono, radii 10/14/20, touch tokens (`--tap-min: 44px`). It loads **after**
  `index.css` and declares its tokens under
  `:root[data-theme="light"], :root[data-theme="dark"], :root:not([data-theme])` — matching
  the specificity of index.css's own theme blocks, which a bare `:root` would lose to no
  matter how late it loads. Legacy token names are aliased onto the new palette in the same
  block, which is what repaints the older screens.
  Companion sheets: `styles/shell.css` (navigation), `styles/routine.css` (the Routine
  section), `styles/screens.css` (the conformance pass over the five older screens).
- **Superseded visual specs:** `design/*.html` describe the previous ink/paper/**gold**
  language. They are historical. Where they conflict with `src/styles/system.css`, the
  stylesheet wins.
- **Old visual spec (historical):** `design/my-planning-design-reference.html` — the authoritative look. Every
  screen is restyled to match it exactly, on desktop and phone. Lift tokens/components from
  its `:root` and class definitions; do not invent new visual language. Built so far against
  this reference: the AppShell, **Setup** (its "Your North Star" frame — `ModuleDashboard`,
  `.setup-screen`: labels-above-fields formcard that autosaves, modules grouped by family as
  calm `modrow`s with status badges + Pause/Activate + Schedule controls), **Practice**
  (`.prac-screen`: DrillView for JSON tracks, Interview workspace for user-authored track,
  bilingual EN/FR toggle, `renderRefPanel` with chip-per-item keyPhrases), and **Intake**
  (`.intk-screen`: `.intake-add` 4-col Quick Add, `.icard`/`.iact`/`.ib` card list, `itemSrc`
  domain/feed/time derivation, `.segment` tab switcher), and **Create** (`.crt-screen`:
  `.kanban` 4-col grid, `.kcol`/`.kcard`/`.kc-tag`/`.kc-h` reference chrome, inline-editable
  `.kcard-edit` flush inputs, `.kcard-sub` angle subtitle, `.kcard-body` draft textarea,
  `.kcard-act` per-card text-link actions, `.kempty` empty states, `.addbtn` column footers,
  `.crdt-digest` weekly digest with three named sections). All five screens restyled.
  **Note:** Certifications tab styling (same `.icard` chrome + `.src` subtitle for
  signalValue/cost/effortHrs) is provisional — may get its own dedicated reference frame later.
- **Plan-screen override:** `design/my-planning-plan-screen-reference.html` supersedes the
  original reference **for the Plan screen only** (same tokens; revised layout — three bands:
  the day · tasks & routine · projects strip; Timeline·Day·Week view toggle; Today's-tasks
  card fed by a Todoist "Perso" picker). The original reference still governs the other four
  screens.
- **Day/Week grid override:** `design/my-planning-grids-reference.html` governs the **Day and
  Week calendar grids only** (the hour-grid surface used by both, and inline in Plan's Timeline
  column). Same tokens plus one new: `--now` (muted rose `#CB5A52`), used only for the now-line.
  Calm event palette by 4 buckets — physical=green, work/calendar=ink, routine=grey #cfd4db,
  practice=gold; light fill + 3px left edge; sticky all-day chip row under the headers.
- **Architecture spec:** `../BLUEPRINT.md` — the product/engine architecture (five engines:
  Plan, Practice, Intake, Create + Setup/Projects; "few engines, much content"; UserProfile
  is the north star; $0 runtime AI; offline-first).
- **Ignore on conflict:** the repo-root `../CLAUDE.md` describes the *old v1* app
  (runtime Babel, Google Drive whole-file sync, app-*.js global scope). It is historical.
  Where it conflicts with the two specs above, the specs win.

## Design language

- **Palette:** canvas `#F7F6F3` / surface `#FFFFFF` / hairline `#E4E1DA`; ink `#1B1A17`,
  `#57544D`, `#8B877E`, `#B3AEA4`. One **accent** slate-indigo `#3D4F7C` for everything
  interactive (progress, active nav, focus rings). **Done** is sage `#5E8A6B` and is the only
  green. **Alert** terracotta `#A8604E` for overdue and destructive. Warm dark mirror at
  `#141311` / `#1C1B19`, manual toggle, persisted in `prefs.theme`.
- **Category accents** (desaturated, meaning-led, never decoration): nourishment `#8A7544`,
  body `#A8604E`, mind `#4A6B8A`, recovery `#6B5A7A`, work `#5A6B74`, open `#8B877E`.
  A row wears its category as a 3px left edge — that is the only colour it carries.
- **Type:** Instrument Serif (the date anchor, section and group titles) · Instrument Sans
  (all UI) · IBM Plex Mono (times, counts, tallies — tabular figures so digits line up).
- **Shape:** radii 6/10/14/20/pill; 4px spacing grid; two soft warm-tinted shadow levels.
- **Touch:** `--tap-min: 44px`, `--tap-comfort: 52px`, `--tap-row: 64px`. Nothing interactive
  is allowed below `--tap-min`; nothing anywhere depends on hover; all text inputs are ≥16px
  so iPadOS does not zoom the viewport on focus.
- **Shell:** `ui/AppShell.tsx` + `ui/nav.ts`. A 236px side rail at `min-width: 1000px` **and**
  `orientation: landscape`; a six-item bottom tab bar everywhere else. The orientation clause
  matters: an iPad Pro in portrait is 1024px wide and a width-only rule would hand it a rail.
  Where there is no rail, `.shell-main` reserves 52px at the top for the floating utility
  cluster (theme / settings / sign out).
- The **North Star** card (target role + date + % progress) lives in the rail, wired to
  `UserProfile`, read-only.

## Current code structure

- `index.html` — shell; loads `src/main.tsx`. Fonts: Instrument Serif / Instrument Sans /
  IBM Plex Mono. PWA meta for Home Screen install.
- `src/main-app.tsx` — **`App` root** (`@ts-nocheck`). Holds `appPage` state
  (`'routine' | 'calendar' | 'practice' | 'intake' | 'create' | 'modules'`, default
  `'routine'`) and swaps full-page screens. `makeDefaultData()`, `persist(nextData)`,
  IndexedDB load + background sync live here.
- `src/routine/` — **the Routine section** (see below).
- `src/styles/` — `system.css` (tokens + primitives), `shell.css`, `routine.css`,
  `screens.css`. Imported in that order from `main.tsx`, after `index.css`.
- `src/index.css` — ~9k lines of legacy CSS from two earlier design passes. Still load-bearing
  for the five older screens' layouts; its tokens are overridden by `styles/system.css`.
  Dead weight, but untangling it is its own job — do not attempt it alongside a feature.
- Screens: `calendar/CalendarScreen.tsx` (the layout shell today — owns topbar with theme /
  weather / inbox / ☰ menu / settings, the full-height left rail, Today timeline + Week grid),
  `practice/PracticeScreen.tsx`, `intake/IntakeScreen.tsx`, `create/CreateScreen.tsx`,
  `modules/ModuleDashboard.tsx` (Setup). Each currently renders full-page with its **own back
  button** (`← Back to Calendar`, etc.) — these get removed once AppShell is the only nav.
- `src/storage/` — `types.ts` (`AppDataV26`, `UserProfile`, entities), `migrations.ts`,
  `db.ts` (IndexedDB + `syncData` + `pullAndReplaceFromWorker` + `NEEDS_INITIAL_PULL_KEY`), `data.tsx` (seeds).
- `src/ui/widgets.tsx` — `WeatherStrip`, `InboxModal`, `SettingsModal`, `WeeklyResetOverlay`.
- `src/ui/icons.tsx` — the one line-icon family (24px, 1.75 stroke, currentColor).
- `src/ui/useClock.ts` — `useClock(periodMs)` via `useSyncExternalStore`. Use this rather than
  `Date.now()` during render; the snapshot is bucketed to the period so it stays stable
  between ticks.
- `functions/_middleware.ts` — Cloudflare Pages Function; HTTP Basic Auth gate (runtime env
  vars `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`, timing-safe comparison, fail-closed).

## Controls that must keep their behaviour

Migrated from `CalendarScreen` into the shell: **theme toggle** (`prefs.theme` →
`data-theme` on `<html>`, persisted), **weather** (`WeatherStrip` / Open-Meteo, Plouhinec
default), **settings** (`SettingsModal`). Presentation may change; behaviour and data flow
must not.

## The Routine section (`src/routine/`)

The centrepiece, and the **single source of truth for routine** — both for the dashboard and
for the timed events the Plan calendar renders.

| file | what it owns |
|---|---|
| `dates.ts` | Europe/Paris day keys (`YYYY-MM-DD`) and the arithmetic over them |
| `model.ts` | `RoutineActivity`, `ROUTINE_GROUPS`, `SEED_ROUTINE_ACTIVITIES` |
| `engine.ts` | recurrence, completion records, day/week progress, log mutations |
| `derive.ts` | the bridge to the Plan calendar, both directions |
| `RoutineScreen.tsx` | the dashboard |
| `RoutineSettings.tsx` | the editor |
| `Routine.tsx`, `RoutineItemPopover.tsx` | **legacy** — the Plan calendar's agenda view and occurrence popover. Unrelated to the above despite the folder. |

### The model

```
RoutineActivity
  id · title · description · group · category · order · status
  schedule : { type:'daily' } | { type:'weekdays', days:[1,2,4,5] }   // 0=Sun..6=Sat
  timing   : { type:'fixed', start, durationMin }    // the only timing a calendar can place
           | { type:'anchored', anchor }             // "while brushing teeth"
           | { type:'flexible' }                     // any time today
  surface  : 'routine' | 'calendar' | 'both'
  required : boolean            // false = optional: shown, never in the denominator
  children · timerSec · target · link · variants · calendarCategory · homeOnly · recurrence
```

`surface` is what lets one model feed two very different screens without either filling up
with rows that do not belong to it. `calendarCategory` keeps the Plan grids' established
palette (commute / elsewhere / review) while the dashboard uses the six meaning-based
category buckets.

### Completions

One record per activity per Paris day, in **`data.progressLog`** — an existing synced
collection with per-record last-write-wins:

```
id: 'rc:<refId>:<dayKey>'          // deterministic, so two devices converge
refId: 'ra-plank' | 'ra-breakfast-stack/probiotics'
value: { date, state: 'done'|'skipped', variant?, note? }
```

This replaced the old `routineCompletions` **singleton**, which was one synced blob for the
whole map: two devices ticking different activities on the same day clobbered each other.
Un-ticking removes the record, which `saveData` turns into a tombstone. **Do not move this
back into a singleton.**

`routineCompletions` is still stored and still read, for the Plan hero banner's hourly
micro-strength slot keys (`micro-strength:h14:<iso>`), which have no activity behind them.

### Counting rules

- Only activities scheduled for that day count. An unscheduled activity is never "missed".
- Optional (`required: false`) is excluded from the denominator entirely.
- A **grouped** activity counts **once**, however many children it has, and only when every
  child is done — a partial group contributes zero.
- **Skipped** is distinct from not-done and leaves the denominator (a deliberate "not today"
  should not read as a failure). It is reported separately in the day's counts.
- Future days in the week view are excluded from the percentages.

### Timezone

Every routine date is a day key as seen in **Europe/Paris**, formatted through
`Intl.DateTimeFormat` so the offset table — including both DST transitions — is the
platform's problem and never ours. Never use a `Date` as a day: a `Date` is an instant, and
on a device west of Paris it is still "yesterday" there for several hours every night.
`dayKeyFromLocalDate()` is the one exception, for Dates the Plan grids built from local
calendar fields.

## Plan calendar integration

`CalendarScreen` no longer reads `data.routine`. It derives:

```ts
const routine = useMemo(() => routineItemsFromActivities(data.routineActivities), [...]);
const routineCompletions = useMemo(() => mergeLegacyCompletions(
  legacyCompletionMap(buildCompletionIndex(data.progressLog)), data.routineCompletions), [...]);
```

Only `timing: 'fixed'` activities with surface `calendar` or `both` are projected, into the
legacy `RoutineItem` shape with stable ids — so the day/week grids, occurrence overrides
(skip / move / edit) and popovers all keep working untouched.

Writes go the other way through `applyLegacyItemChanges` / `activityFromLegacyItem`, so the
Plan routine manager edits the activity behind the event. Deleting from there **archives**
the activity rather than removing it — completion history is keyed by activity id.

## Data (schema v27)

- `routineActivities` — the routine model. A synced singleton.
- `routineArchive` — the pre-v27 timed routine, copied once, verbatim, never read again.
- `routine` — left in place, no longer read.
- `progressLog` — routine completion records (above), plus anything else logged later.

Migration seeds `routineActivities` only when absent or empty, so a user's edits are never
overwritten and re-running it cannot duplicate. **Migrations are non-destructive forever.**

## Deployment

- **Host:** Cloudflare Pages. Base path `/` (`vite.config.ts`). PWA via `vite-plugin-pwa`.
- **Auth:** HTTP Basic Auth via `functions/_middleware.ts` (Pages Function). Runtime env vars
  `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` set in the Cloudflare dashboard — never in source.
- **Build-time env vars** baked into the JS bundle by Vite (fill empty fields on first boot):
  `VITE_SYNC_URL`, `VITE_SYNC_SECRET`, `VITE_PROXY_URL`. Set in Pages → Settings → Env vars.
  Local dev: copy to `app-v2/.env.local` (gitignored). See `DEPLOY.md` for full rotation steps.
- **Sync first-boot:** `loadOrCreate()` calls `pullAndReplaceFromWorker()` before `saveData()`
  on a fresh device (empty IndexedDB), so Worker data is never overwritten by local defaults
  via last-write-wins. If the pull fails (offline), `NEEDS_INITIAL_PULL_KEY` in `localStorage`
  gates push until the first successful online sync. See `DEPLOY.md` → "Sync architecture".

## Workflow

- Typecheck: `npx tsc -b`. Tests: `npx vitest run` (97 tests). Dev: `npm run dev`.
  Build: `npm run build`.
- Two suites must stay green: the **cost-guard** in `src/storage/sync.test.ts`, and
  `src/routine/routine.test.ts` — recurrence on the brief's reference days, both Europe/Paris
  DST boundaries, the group/optional/skip counting rules, and the Plan derivation.
- `npm run lint` is **red at baseline** (~319 errors in the older screens). New files are
  expected to lint clean on their own; lint them individually rather than reading the total.
- `persist(nextData)` for all state writes.

### Testing responsive layouts

Chrome cannot resize its window below the display, so media queries cannot be tested by
resizing. Drop a throwaway harness in `public/` that iframes `/` at an exact size
(`?w=810&h=1080`), screenshot that, and delete it before committing. Targets: iPad portrait
810×1080, iPad landscape 1080×810, desktop 1440×900, iPhone 390×844.

Worth re-running after any layout change — it catches what screenshots do not:

```js
// in the harness page, against the iframe document
[...d.querySelectorAll('button,a[href],input,select,textarea')]
  .filter(el => { const r = el.getBoundingClientRect();
                  return (r.width||r.height) && (r.width < 40 || r.height < 36); })
// plus: inputs whose computed font-size is < 16px (iPadOS zooms the viewport on focus)
// plus: documentElement.scrollWidth > innerWidth  (horizontal overflow)
```

# My Planning 2.0 (app-v2)

A personal routine and portfolio dashboard, built iPad-first, around a job switch
(Senior AE → VP Sales → VP of AI). Real **Vite + React 19 + TypeScript** build,
**offline-first IndexedDB** store, per-entity sync through a Cloudflare Worker. Replaces the
v1 runtime-Babel single-global-scope app.

**Six sections, Routine first and default:** Routine · Plan · Practice · Intake · Create · Setup.

## Sources of truth

- **Design system (current):** `src/styles/system.css` — the single token set for all six
  sections. Pearl canvas, white panels, near-black ink, one cobalt accent spent sparingly,
  Inter throughout, radii 12/18/22, touch tokens (`--tap-min: 44px`). It loads **after**
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

Modern, minimal, premium — a 2026 SaaS dashboard rather than a to-do list. **One** accent
colour; everything else is neutral.

- **Palette:** canvas `#F5F6F8` (pearl) / surface `#FFFFFF` / hairline `#E7EAEF`; ink
  `#111827`, `#4B5563`, `#8A93A3`, `#B6BDC8`. One **accent** cobalt `#2563EB` carries
  everything interactive *and* completion — there is no separate "done" green. Completed
  tiles take `--surface-done` `#F4F8FF` plus a 3px accent edge. Dark mirror at `#0E1014` /
  `#171A20`, manual toggle, persisted in `prefs.theme`.
- **No category colour-coding.** Optional activities are marked with a discreet neutral
  `OPTIONAL` chip, never a coloured card.
- **Type:** Inter only. No serif display face, no second type personality. Tabular figures
  on times and counters so digits don't shift as they animate.
- **Shape:** radii 8/12/18/22/pill; 4px spacing grid; two very soft shadow levels —
  hairlines carry most of the structure.
- **Touch:** `--tap-min: 44px`. Nothing interactive falls below it (small marks get a
  transparent `::after` to expand the hit area without inflating the visual); nothing
  depends on hover; all text inputs are ≥16px so iPadOS does not zoom on focus.
- **Motion** (`--dur-press` 90ms in, `--dur-release` 190ms out on `--spring`): tiles compress
  to `scale(.98)` on press and spring back; the completion check draws itself via
  `stroke-dashoffset`; the ring and week bars transition their geometry; the nav indicator
  glides; cards stagger in once on first open only. All of it is transform/opacity — no
  backdrop blurs, which an older iPad pays dearly for. `prefers-reduced-motion` kills it.
- **Shell:** `ui/AppShell.tsx` + `ui/nav.ts`. A floating near-black pill — vertical at the
  left in landscape, horizontal at the foot in portrait. It **floats over** the content
  rather than taking a column; `.shell-main` insets to clear it. Orientation, not width,
  picks the arrangement: an iPad Pro in portrait is 1024px wide and a width-only rule would
  give it the landscape layout. The pill also carries theme / settings / sign-out (and the
  sync alert): at its foot in landscape, at the end of the bar in portrait. On a phone
  (portrait ≤600px wide, landscape ≤520px tall) nine buttons do not fit, so those fold
  behind a "More" menu, which shows the sync alert as a dot.

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
| `format.ts` | the tile's single metadata line and date parts |
| `activity-icons.tsx` | one line icon per activity, keyed by `RoutineActivity.icon` |
| `RoutineScreen.tsx` | the dashboard |
| `RoutineSettings.tsx` | the editor |
| `RoutineTimer.tsx` | the focused countdown overlay |
| `Routine.tsx`, `RoutineItemPopover.tsx` | **legacy** — the Plan calendar's agenda view and occurrence popover. Unrelated to the above despite the folder. |

### Layout — the thing to not break

The dashboard is a **bento grid** sized so every tile for the day fits with no scrolling on
an iPad 7th gen: **4 columns at 1024x768**, **2 columns at 768x1024**. Wednesday is the
stress test — 11 scheduled + 2 optional = **13 tiles** — and `routine.test.ts` asserts it.

- `.rt` is a flex column filling the shell's content box; the header takes what it needs and
  `.rt-grid` takes the rest, dividing it into equal rows.
- `grid-auto-rows: minmax(118px, 1fr)` (84px in portrait): rows share the height but have a
  readable floor, so enlarged text makes the grid **scroll** rather than clip. Never swap
  this for a fixed row height, and never `overflow: hidden` it.
- Landscape tiles are vertical (icon top-left, status top-right, text at the foot); portrait
  tiles are horizontal (icon, text, status). Same markup, orientation media queries.
- The last tile spans both columns in portrait when the count is odd (`data-wide`).
- `This week` fills the landscape grid's leftover cells (`span 3`) and is hidden in portrait,
  where the header's seven-day dots already carry the week.
- The whole tile is the completion button. The timer/link control is a **sibling** of that
  button, not a child (buttons cannot nest) — which is why `.rt-cell` must stay
  `position: relative` and why tiles with one reserve right-hand padding via `data-aux`.
- **Phone portrait (≤560px wide) is the one exception to the no-scroll frame**, in the
  `PHONE` block of `cinematic.css`. A phone cannot show the day at once, so `.cin` stops
  being a fixed frame and the shell scrolls the whole page. Only the week strip and gear stay:
  `.cin-head` is sticky with a negative `top` that hides the date, which is why the date and
  motto have fixed line heights there. It takes a backing (`.stuck`, set by an
  IntersectionObserver on the date) once the date has gone. Tiles are 64px rows, and the
  settings preview follows. No iPad can match (narrowest portrait is 744px). Changes here
  should leave iPad and desktop layouts identical; compare element boxes before and after.

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
  children · timerSec · timerOff · target · sets · links · variants · icon  // `link`: the old single link
  calendarCategory · homeOnly · recurrence
```

The seed is the routine as specified, and nothing more: **no invented doses, rep counts,
durations or exercise prescriptions**. `routine.test.ts` guards this with a regex over every
title, description and metadata line — the concept artwork's "5 g creatine + 2,000 IU D3"
and "3 x 60 seconds" must never creep in.

`sets` (2-6) splits an activity into taps through the day: each tap logs the next set as its
own record (`<id>/set-<k>`, like a child, so two devices' sets merge in sync), arcs round
the status mark light up (`SetRing.tsx`), and the last set checks it. A part-done activity
counts zero toward the day, like a part-done group. A tap after the last starts the day
again; a note with Undo (`setSetCount`) follows every tap. The seed sets none: the user
chooses it in the editor.

`links` (up to 4, named) replaced the single `link`; always read them through `linksOf`, which
turns an old `link` into a list of one. One link opens straight from the tile's button. Two
or more open a launcher over the tile (`LinkLauncher`): the names stacked under the title on
a tall tile, side by side on a short one, closing on a pick, its close button, Escape or a
tap elsewhere. A timer that is on takes the button first. The briefings tile's three ChatGPT
conversations (`BRIEFING_LINKS`) are set once by `relabel.ts` on an activity with no `links`
yet; a list the user has, even an empty one, is never replaced. On a short matrix tile
(`@container`, under 115px) the button sits beside the tick circle instead of the corner.

`children` (parts, up to 8) are edited in the editor's Parts list: rename keeps a part's id and
so its ticks; a new part gets a fresh id, so a day already ticked asks again for it; a part left
blank is dropped on save, and removing the last makes a single tick again. Three or more parts
are the tile's line under the name, ahead of the description.

`timerOff` is the editor's countdown switch: off hides the timer from the tile but keeps
`timerSec`, so switching it back on restores the same minutes. Read the countdown through
`timerOf`, which is 0 while it is off.

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
  Accepting the password also sets a year-long HttpOnly `mp_session` cookie (an HMAC of the
  user keyed by the password, renewed on each `/sw.js` fetch). Without it, a Home Screen app
  never received updates: it opens from its service worker's copy, iOS forgets the password
  after a swipe-away, and the update check was refused. Changing either credential signs every
  device out. `src/auth-gate.test.ts` covers the gate. Never make the JS bundle public: it
  carries `VITE_SYNC_SECRET`.
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

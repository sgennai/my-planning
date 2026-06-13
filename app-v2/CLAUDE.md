# My Planning 2.0 (app-v2)

The partial rebuild of My Planning: a calendar-anchored personal operating system for a
job switch (Senior AE → VP Sales → VP of AI). Real **Vite + React 19 + TypeScript** build,
**offline-first IndexedDB** store, per-entity sync through a Cloudflare Worker. Replaces the
v1 runtime-Babel single-global-scope app.

## Sources of truth

- **Visual spec:** `design/my-planning-design-reference.html` — the authoritative look. Every
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

## Design language (from the reference — the single source of truth for tokens)

- **Palette:** ink `#1A1D23` / paper `#F4F6F8` / surface `#FFFFFF`; one warm **signal** gold
  `#B5852A` spent only on the goal + what needs attention today; green `#3C8A5E` = done; muted
  greys. Cool, airy, calm. Gold is never decoration.
- **Type:** Schibsted Grotesk (display: headings, North Star role, page titles, brand) ·
  Inter (body/UI workhorse) · JetBrains Mono (times, data, meta).
- **Shape:** radii 8/12/18px; spacing on a 4px grid (4/8/12/16/24/32/48); soft shadows
  (`--sh-sm`, `--sh-md`); borders carry structure.
- **Shell:** one app shell wraps every screen. Desktop = 228px left sidebar (brand · North Star
  card · nav: Plan/Practice/Intake/Create/Setup · theme toggle in foot). Mobile = bottom tab
  bar (5 tabs, always present — never a dead end). The **North Star** card (target role + date +
  % progress bar) is on every screen, wired to `UserProfile`.
- One **page-header** pattern everywhere: gold eyebrow · display title · one-line purpose.

## Current code structure

- `index.html` — shell; loads `src/main.tsx`. Fonts currently DM Sans/Cormorant (to be swapped
  to Schibsted Grotesk/Inter per the reference).
- `src/main-app.tsx` — **`App` root** (`@ts-nocheck`). Holds `appPage` state
  (`'calendar' | 'practice' | 'intake' | 'create' | 'modules'`) and swaps full-page screens.
  `makeDefaultData()`, `persist(nextData)`, IndexedDB load + background sync live here.
- `src/index.css` — global CSS (~8k lines, still in the **old** DM Sans / aurora-gradient /
  blue-primary language). Phase 1 replaces its `:root` tokens with the reference's.
- Screens: `calendar/CalendarScreen.tsx` (the layout shell today — owns topbar with theme /
  weather / inbox / ☰ menu / settings, the full-height left rail, Today timeline + Week grid),
  `practice/PracticeScreen.tsx`, `intake/IntakeScreen.tsx`, `create/CreateScreen.tsx`,
  `modules/ModuleDashboard.tsx` (Setup). Each currently renders full-page with its **own back
  button** (`← Back to Calendar`, etc.) — these get removed once AppShell is the only nav.
- `src/storage/` — `types.ts` (`AppDataV26`, `UserProfile`, entities), `migrations.ts`,
  `db.ts` (IndexedDB + `syncData`), `data.tsx` (seeds).
- `src/ui/widgets.tsx` — `WeatherStrip`, `InboxModal`, `SettingsModal`, `WeeklyResetOverlay`.

## Controls that must keep their behaviour

Migrated from `CalendarScreen` into the shell: **theme toggle** (`prefs.theme` →
`data-theme` on `<html>`, persisted), **weather** (`WeatherStrip` / Open-Meteo, Plouhinec
default), **settings** (`SettingsModal`). Presentation may change; behaviour and data flow
must not.

## Redesign plan (presentation only — no behaviour/data/sync changes)

- **Phase 1 (current):** lift reference tokens into `index.css` as the single source of truth;
  build one shared responsive **AppShell** (sidebar desktop / bottom tabs mobile, North Star
  anchor, migrated theme/weather/settings, no per-page back buttons); restyle **only the
  Plan/Calendar** screen to match the reference. Other screens’ content unchanged this pass.
- **Later phases:** restyle Practice, Intake, Create, Setup one screen at a time against the
  reference.

## Workflow

- Typecheck: `npx tsc -b`. Tests: `npx vitest run` (21 tests; **cost-guard** lives in
  `src/storage/sync.test.ts` — must stay green). Dev: `npm run dev`. Build: `npm run build`.
- `persist(nextData)` for all state writes; migrations are non-destructive forever.
- Base path is `/my-planning/v2/` (see `vite.config.ts`); PWA via `vite-plugin-pwa`.

# MY PLANNING

Personal scheduling and portfolio management web app — a personal operating system for managing six parallel side projects alongside a corporate job. Solves decision fatigue around prioritization. Supports a Sunday drag-drop planning + Friday review rhythm, with a daily operational surface for moment-to-moment guidance.

## Architecture

- **Multi-file**: codebase is split into `index.html` (CSS + script tags only) and several JS modules loaded as `<script type="text/babel" data-presets="env,react">` tags. No build step — Babel transpiles at runtime in the browser.
- **No backend**: state syncs to a single JSON file in Google Drive's appdata folder via OAuth. OAuth Client ID `25894919429-pbtl8l6nn23vnvc8c8cbhg5f3n8gepu6.apps.googleusercontent.com`.
- **Deployment**: GitHub Pages from `main` branch at https://sgennai.github.io/my-planning/. GitHub Actions workflow (`.github/workflows/deploy.yml`) injects `?v=<git-hash>` cache-busting query strings into all `app-*.js` `src=` attributes at deploy time — no hard-reload needed after push.
- **ICS imports**: Cloudflare Worker (`cloudflare-worker.js`, deployed separately) proxies work + household calendars, read-only.
- **Weather**: Open-Meteo, no key. Default location: Plouhinec, Brittany (47.99°N, -4.49°W).
- **Custom UI**: hand-rolled calendar (no FullCalendar), hand-rolled drag-and-drop, hand-rolled component system. No Tailwind, no shadcn.

## File structure

Scripts load in this exact order (global scope — later files can use symbols from earlier ones):

```
index.html          — CSS only + ordered <script> tags (no component logic)
app-data.js         — SCHEMA_VERSION, CATEGORY_STYLES, SEED_PROJECTS, makeDefaultData(), migrate()
app-helpers.js      — shared utils (pad, startOfDay, toMinutes, layoutDay, combinedDayItems…), ViewSwitcher, ProjectsRailPanel, ICS parser
app-core.js         — root App component, Google Drive OAuth, state persistence, auth
app-today.js        — TodayScreen (timeline pane only), TodayCalendarView, TodayMiniMonth
app-practice.js     — DailyPracticeHub overlay (Interview Prep, Personal Narrative, C-Level Qs tabs)
app-calendar.js     — CalendarScreen (single layout shell for both views), all shared state
app-week.js         — WeekGrid, AgendaView, CalendarHeader, BlockPopover, RoutineItemPopover, CalItem, NowLine
app-routine.js      — RoutineManagerModal, RoutineEditForm, routine resolution logic
app-widgets.js      — SettingsModal (with Routines tab), InboxModal, WeatherStrip, FridayReviewLauncher, Legend, TodosPane
```

All files share one global scope (no ES modules). Variables defined in one file are visible in others — global naming discipline matters. If a new shared component is needed by both app-today.js and app-week.js, define it in app-helpers.js (loads before both).

## Core data shape (schema v18)

```
{
  schemaVersion, createdAt, lastModified,
  routine, overrides, calendars,
  weeklyResets, projects, scheduledBlocks,
  referenceLibrary, inbox, elsewhereToggles,
  todos, routineCompletions, weather,
  practiceContent: { interviewPrep[], personalNarrative[], clevelQs[] },
  prefs: { theme, categoryColors, categoryEmojis, todayView, lunchSlot }
}
```

Schema migrations are non-destructive at every version bump. `migrate()` in `app-data.js` runs on every load.

## Layout architecture

`CalendarScreen` in `app-calendar.js` is the single layout shell for both views.

**Apple Calendar–style split**: the left rail is a full-height glass panel that spans the entire viewport height (y=0 to bottom), and the topbar starts at `left: 300px` so it never overlaps the rail.

```
.today-wrap  (flex row, height: 100vh, overflow: hidden)
  │
  ├─ .today-rail  (300px, full-height glass card, z-index 2)
  │    .today-rail-nav:  [Today btn] [‹] [date label] [›]
  │    TodayMiniMonth
  │    ProjectsRailPanel
  │    Todos section  (draggable to timeline)
  │    Calendars section
  │
  └─ .today-right-col  (flex: 1, flex column, padding-top: 66px to clear topbar)
       WeatherStrip  (hidden by default, toggled via ☁ button)
       .today-hero   (Right Now / Next Up banner — always shows today)
       Right pane (switches on mainView):
         'today' → TodayScreen (timeline pane only)
         'plan'  → WeekGrid / AgendaView
       .today-footer  (FridayReviewLauncher · Save status · Sign out)

Fixed .app-topbar  (56px, left: 300px → right: 0  — does NOT overlap rail)
  Center: [Today / Week switcher]
  Right:  [◐] [☁] [At home] [Practice] [Inbox] [Settings]
```

`TodayScreen` (`app-today.js`) renders only the `today-timeline` div — no wrapper, no topbar, no rail. All shared layout lives in `CalendarScreen`.

**Responsive breakpoints**: rail narrows to 260px at ≤1100px; topbar resets to `left: 0` at ≤759px.

## Two main views

Both views share identical topbar, weather, hero banner, and left rail. Only the right pane changes.

1. **Today view** (default landing): daily compass — hero "Right Now/Next Up" banner, timeline list OR hour-grid calendar toggle, day navigation (‹ ›), mini-month date picker.
2. **Week view**: full week grid for drag-drop scheduling. Day columns clickable to single-day view.

The `viewDayOffset` state (today view's day navigation) and `todayItems` computation both live in `CalendarScreen` so the hero banner and left rail have access to them.

## Key state in CalendarScreen

- `mainView` — 'today' | 'plan'
- `viewDayOffset` — day offset from now for today-view navigation
- `weekStart` — Monday of the displayed week (plan view)
- `dayView` — null (week) or 0–6 (single-day column) in plan view
- `todayItems` — computed timeline items for viewDate (routine + blocks + ICS)
- `tdCurrent`, `tdNext`, `tdThen` — hero banner data
- `sortedTodos`, `todoInput` — shared left-rail todos state

## Visual language

- **Themes**: light (default, `--bg: #F5F5F7`) and dark (`--bg: #1C1C1E`), toggled via `prefs.theme` → `data-theme` on `<html>`.
- **Aurora background**: three radial-gradient blobs (indigo + rose/pink + teal) sit on `:root`. `html, body` use `background: transparent` so the aurora shows through all glass surfaces. Blobs are baked into the rail and topbar backgrounds too.
- **Glassmorphism**: all major surfaces (rail, topbar, hero, timeline, week-grid) use `rgba(255,255,255,0.72)` / `rgba(28,28,30,0.72)` + `backdrop-filter: blur()`. Cards do not use solid `var(--bg-card)` fills.
- **Primary color**: blue, token `var(--primary)` (`#2563EB` light / `#4F8EF7` dark).
- **Typography**: DM Sans for body/UI; Cormorant Garamond (`var(--serif)`) for section eyebrows and the mini-month label; JetBrains Mono (`var(--mono)`) for times and data.
- **Shape**: rounded cards (16/12/8/5px radius), subtle `var(--shadow-card)` shadows, pill buttons.
- **Rail section titles** (Projects, Todos, Calendars, month name): `var(--muted-3)` — grey, acting as visual separators (no horizontal rule lines).
- **3D rail depth effect**: rail casts a right-side `box-shadow`; topbar continues the effect via `box-shadow: inset 14px 0 22px -10px rgba(0,0,0,0.10)` on its left edge.
- **Grid lines**: `var(--rule)` — `rgba(0,0,0,0.10)` light / `rgba(255,255,255,0.10)` dark. Used for hour lines and day-column separators.
- **Calendar blocks**: solid color fill, white text, title-first then time-below ("2 – 3pm" 12-hour format), 6px radius.
- **Past events**: `.is-past` class — `opacity: 0.55–0.6; filter: saturate(0.55–0.65)`. Applied to `.today-timeline-row`, `.today-cal-block`, and `.cal-item`.
- **Now-line**: 2px blue with soft halo.
- **Topbar buttons**: `.app-topbar-btn` — pill, same size for all actions.
- **Weather**: hidden by default (`useState(false)`), toggled via ☁ button in topbar.
- **Work calendar untitled events**: `occ.summary || (occ.source === 'work' ? 'Work' : '(untitled)')` — avoids blank event titles.

## Project portfolio

Tier 1 NEXT (master, 6h/week, 13 modules). Tier 2 APP - AI FOR SALES. Tier 3 Gym Exercise Translation. Tier 4 APP - FINANCE TRACKING + APP - INVESTMENT. Tier 5 APP - ROUTINE PLANNER. Master project (NEXT) has `isMaster: true`, `prioritySequence`, and `modules[]` each with `nextActions[]`.

Projects rail (`ProjectsRailPanel` in `app-helpers.js`) shows next actions per module with complete/add/delete controls. `completedActions[]` tracks history.

## Daily Practice Hub

Overlay accessible via "Practice" button in topbar. Three tabs: Interview Prep (15 items), Personal Narrative (7 items), C-Level Qs (15 items). Two modes per tab: Full Answer (editable) and Flashcard (question → reveal → knew it / needs work). Mastery tracked via `streak` counter. All content lives in `data.practiceContent` in Google Drive JSON.

## Settings modal

Opened via "Settings" button in topbar. Two tabs:
- **Calendars & Settings**: ICS calendar feeds, weather location, lunch slot config.
- **Routines**: full routine manager (category colors/emojis, add/edit/delete routine items). This replaced the standalone "Routines" button.

`RoutineManagerModal` accepts `embedded={true}` to render without its own modal-backdrop wrapper (used when hosted inside SettingsModal).

## Workflow

Stephane edits via Claude Code. Deploy: `git add`, `git commit`, `git push` — GitHub Actions deploys to GitHub Pages automatically with cache-busting. No hard reload needed.

## Conventions

- Schema migrations are non-destructive — every version bump preserves prior data shape.
- All transitions use `--ease-out` and `--duration-*` tokens; `prefers-reduced-motion` is respected.
- `persistData(mutator)` pattern for all state updates — never mutate `data` directly.
- Overlay/modal pattern: `{stateVar && <Component onClose={() => setStateVar(false)} />}`.
- Heavy formatting (bold, headers, bullets) is avoided in chat replies; concise prose only.
- Stephane prefers full creative control over constrained defaults (e.g., free color picker, not curated swatches).
- Mark backlog items COMPLETED, do not remove them.
- User location: Plouhinec, Brittany, FR (47.99°N, -4.49°W).
- **Stable defaults in CalendarScreen**: module-level `_EMPTY_ARRAY = []`, `_EMPTY_OBJ = {}`, `_DEFAULT_ELSEWHERE` prevent useMemo invalidation on every render. `scheduledTodoIds` and `sortedTodos` are memoized; `submitTodo` is wrapped in useCallback.
- **`color-scheme`** is set on `:root` per theme so native scrollbars/inputs match the active theme.
- **`touch-action: manipulation`** on all buttons to suppress double-tap zoom on mobile.

## Pending UX backlog

- ~~Cache-control meta tag (deploys require hard-reload — friction)~~ COMPLETED via GitHub Actions cache-busting
- ~~File splitting (single index.html was ~11,000 lines)~~ COMPLETED — split into app-*.js files
- ~~Daily Practice Hub~~ COMPLETED
- ~~Unified Today/Week layout shell~~ COMPLETED
- ~~Routines inside Settings modal~~ COMPLETED
- ~~Aurora/glassmorphism redesign~~ COMPLETED — full-height rail, apple-calendar layout, aurora gradient, glass surfaces
- Persistent Google sign-in
- Next actions edit mode for Projects Rail (complete/add/archive actions live)
- Past weekly resets browser
- Story Vault
- Habit streaks/analytics
- Voice memo capture
- Multi-device conflict handling
- Offline fallback
- RSS article feed for modules #5/#6 (extend Cloudflare Worker + in-app widget)
- Claude Skills: `/sales-coach`, `/comm-coach`, `/linkedin-post` command files

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

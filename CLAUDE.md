# MY PLANNING

Personal scheduling and portfolio management web app — a personal operating system for managing six parallel side projects alongside a corporate job. Solves decision fatigue around prioritization. Supports a Sunday drag-drop planning + Friday review rhythm, with a daily operational surface for moment-to-moment guidance.

## Architecture

- **Single file**: everything lives in `index.html` (~11,000 lines). React 18 UMD + Babel standalone, no build step.
- **No backend**: state syncs to a single JSON file in Google Drive's appdata folder via OAuth. OAuth Client ID `25894919429-pbtl8l6nn23vnvc8c8cbhg5f3n8gepu6.apps.googleusercontent.com`.
- **Deployment**: GitHub Pages from `main` branch at https://sgennai.github.io/my-planning/.
- **ICS imports**: Cloudflare Worker (`cloudflare-worker.js`, deployed separately) proxies work + household calendars, read-only.
- **Weather**: Open-Meteo, no key. Default location: Plouhinec, Brittany.
- **Custom UI**: hand-rolled calendar (no FullCalendar), hand-rolled drag-and-drop, hand-rolled component system. No Tailwind, no shadcn.

## Core data shape (schema v16)
{
schemaVersion, createdAt, lastModified,
routine, overrides, calendars,
weeklyResets, projects, scheduledBlocks,
referenceLibrary, inbox, elsewhereToggles,
todos, routineCompletions, weather,
prefs: { theme, categoryColors, categoryEmojis, todayView, lunchSlot }
}

Schema migrations are non-destructive at every version bump.

## Two main views

1. **Daily view** (default landing, "Today" button): daily compass — "what do I do now?" Hero "Right Now" banner, weather strip with 4 fixed checkpoints (7am/12pm/5pm/10pm), timeline OR calendar toggle, mini-month picker + collapsible projects + todos in right rail.
2. **Weekly view** ("Plan the week" button): full week grid for drag-drop scheduling, portfolio panel on left.

## Visual language

- **Default theme**: light off-white (`#F5F7FA`); dark theme is opt-in via `prefs.theme`.
- **Primary color**: blue (`#3B82F6`), token `var(--primary)`.
- **Typography**: Inter (sans) for everything; JetBrains Mono for time and labels.
- **Shape**: rounded cards (16/12/8/5px radius), soft shadows, pill buttons.
- **Calendar blocks**: solid color fill, white text, title-first then time-below ("2 – 3pm" 12-hour format), 6px radius.
- **Now-line**: 2px blue with soft halo.

## Project portfolio

Tier 1 NEXT (master, 6h/week, 13 modules). Tier 2 APP - AI FOR SALES. Tier 3 Gym Exercise Translation. Tier 4 APP - FINANCE TRACKING + APP - INVESTMENT. Tier 5 APP - ROUTINE PLANNER. Master project (NEXT) has `isMaster: true`, `prioritySequence`, and `modules[]` each with `nextActions[]`.

## Workflow

Stephane edits via Claude Code. Deploy: `git add`, `git commit`, `git push` — GitHub Pages picks up `main` automatically. Cache is aggressive — hard reload (Cmd+Shift+R) after every deploy.

## Conventions

- Schema migrations are non-destructive — every version bump preserves prior data shape.
- All transitions use `--ease-out` and `--duration-*` tokens; `prefers-reduced-motion` is respected.
- Heavy formatting (bold, headers, bullets) is avoided in chat replies; concise prose only.
- Stephane prefers full creative control over constrained defaults (e.g., free color picker, not curated swatches).
- Mark backlog items COMPLETED, do not remove them.
- User location: Plouhinec, Brittany, FR (47.99°N, -4.49°W).

## Pending UX backlog

- ~~Cache-control meta tag (deploys require hard-reload — friction)~~ COMPLETED
- Persistent Google sign-in
- Past weekly resets browser
- Story Vault
- Habit streaks/analytics
- Voice memo capture
- Multi-device conflict handling
- Offline fallback

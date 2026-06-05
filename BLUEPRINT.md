---
title: "My Planning 2.0 — Architecture Blueprint"
phase: "Phase 1 — Product Architecture (no code)"
author_role: "Senior Product Architect / CTO / UX Strategist / QA Lead"
source_of_truth: "MASTER.md"
supporting_inputs:
  - "MASTER.md (objectives + module list)"
  - "Current app repo: github.com/sgennai/my-planning (inspected: schema v23, ~16k LOC, runtime-Babel, Google Drive appdata sync, Cloudflare Worker ICS+Todoist proxy)"
  - "EXECUTIVE_PRESENCE.docx, EXECUTIVE_DRILL_LIBRARY.md, 60-SECOND_EXECUTIVE_RESET.docx, Main_problems.docx, Motivators.docx"
  - "podcasts.opml (44 feeds)"
  - "MyProfile (LinkedIn export, 6 pages)"
status: "Approved — Phase-0 decisions locked (Option B · IndexedDB-first · Cloudflare Worker + D1 · Drive retired · AI authoring-only)"
next_phase: "Phase 2 — Antigravity (Google AI) controlled refactoring"
ingestion_note: "This document is structured as flat Markdown with stable section IDs and tables so it can be ingested directly by Google Antigravity agents as the planning artifact for Phase 2."
---

# My Planning 2.0 Architecture Blueprint

> **How to read this document.** Sections 1–4 are the argument: what to build, why, and what is dangerous about the current plan. Sections 5–12 are the design: architecture, build-vs-rebuild, module governance, data, UX, storage. Sections 13–17 are execution: AI policy, QA, roadmap, and the Antigravity work packages. If you read nothing else, read §1 (Executive Summary), §6 (Build vs Rebuild), §8 (Module Map — the 20→5 consolidation), and §17 (Final Recommendation).
>
> **One vocabulary used throughout.** The app is built from a small set of **engines** (reusable systems) that consume **content** (data you author once, mostly outside the app). The whole thesis is: *few engines, much content.* The engines are: **Plan**, **Projects**, **Practice**, **Intake**, **Create**, plus a shared **Knowledge** content layer and a **Review** rhythm.
>
> **Engines vs. modules — read this once and the rest of the document follows.** *Engines* are the few **software systems** we build (Plan, Projects, Practice, Intake, Create). *Modules* are the **~20 things you practice or work on** from `MASTER.md` — B2B Sales, C-Level Questioning, Executive Presence, Banking/Insurance, Leadership, the Agentic-AI tracks, and so on. **Every module is preserved, and each is practiced separately:** you open "Executive Presence" and drill *that one*, with its own review queue, its own streak, its own progress; modules never blend together. The **"20→5" is a count of *engines to build*, not a count of *modules you keep*.** Most modules need almost no code because they share a single engine — think *one music player, many separate playlists* (your modules are the playlists; Practice is the player). The few items that were never really "drills" — podcasts, reading, certifications, posts — simply live in the engine that matches what they actually are (an intake queue, a list, a publishing pipeline) instead of being forced into flashcards.
>
> **Decisions locked (Phase 0 — approved).** Build approach = **Option B, partial rebuild**. Storage = **offline-first IndexedDB as the source of truth**, synced per-entity through your **existing Cloudflare Worker + Cloudflare D1**; **Google Drive whole-file sync is retired**. AI = **authoring tool only — $0 runtime in V1**. These are settled inputs for Phase 2 (Antigravity); the rest of this document explains and executes them.

---

## 1. Executive Summary

**The strategic recommendation in one line:** stop thinking of "My Planning" as ~20 modules to build, and start thinking of it as **one calendar-anchored personal operating system with five small engines that run on content you author in Claude** — because your scarcest resource is not features, it is the four months you have to switch jobs, and most of what `MASTER.md` calls "modules" is *curriculum*, not *software*. To be exact, since this point has caused confusion: **you keep all ~20 modules and practice each one separately.** The "five engines" is the number of *software systems to build*, not the number of modules you end up with — most modules are content the engines render, not code of their own (see the callout at the top of this document and §8).

**What My Planning 2.0 should become.** A single, fast, offline-capable web/iPhone app whose job is to (a) tell you what to do right now, (b) protect time for the few activities that move your career, (c) let you rehearse executive/sales fluency out loud with spaced repetition, and (d) keep a light pipeline from "thing I learned" → "LinkedIn post / interview story." It is a *thin operating layer over rich content*. The content (sales curriculum, executive drills, industry briefs, C-level questions, certification rankings, post ideas) is generated and refined in **Claude** — which you already pay for — and stored as structured data the app simply schedules, surfaces, and tracks.

**What it should NOT become.** It must not become: (1) a 20-module mega-app where each `MASTER.md` heading is its own screen — that is the failure mode the rest of this document is engineered to prevent; (2) an AI chat app or an in-app "AI coach" that calls a model on every interaction — that breaks your "a few dollars per year" budget and produces mediocre coaching; (3) a podcast player or RSS reader — Pocket Casts and Instapaper already do this better than you can build; (4) an AI writing tool that auto-drafts your LinkedIn posts — the value of your personal brand is that the posts are *yours*, and runtime generation is both costly and off-voice; (5) a second job. The app is in service of the job switch, not a substitute for doing the work of switching.

**Highest-level architecture direction.** **Partially rebuild (not refactor-in-place, not rewrite-from-scratch).** Keep everything that is mature and hard-won — your schema (v23, 23 non-destructive migrations), your seeded Interview Prep content (25 categories, 73+ questions, story bank, rubric, spaced repetition), your routine-resolution logic, your ICS Cloudflare Worker, and your visual language. Replace the three things that make the current app fragile and slow: **(1)** runtime Babel transpilation of ~16,000 lines in the browser → a real **Vite + React + TypeScript** build; **(2)** the single shared global scope across `app-*.js` → real **ES modules**; **(3)** whole-file Google Drive writes with no conflict handling and no offline → an **offline-first IndexedDB store that syncs per-entity through your existing Cloudflare Worker**, making the app installable as a true PWA. Then **generalize Interview Prep + the Daily Practice Hub into one Practice engine** so that six or seven "fluency" modules become *content tags*, not new code.

**The 20→5 collapse (proved in detail in §8).** The Interview Prep feature you already built is, structurally, a generic spaced-repetition Q&A/rehearsal engine. Almost every "fluency" module in `MASTER.md` — Complex B2B Sales, C-Level Questioning, Executive Presence drills, Banking/Insurance fluency, Leadership philosophy, Management philosophy — is the *same shape*: a deck of prompts you rehearse out loud and track confidence on. They differ only in content. Reading + Podcasts + Webinars are an *intake queue* that mostly points at external apps. LinkedIn + Thought Leadership + Resume are *output artifacts* produced in Claude and tracked through a light **idea→draft→published** pipeline. Certifications are a *sortable list*. "AI Apps for Sales" is a *project*, not a learning module. That is the entire reduction. **Nothing is deleted:** every module survives and is drilled on its own, with its own queue and progress; the reduction is in *code to build* — one Practice engine instead of a dozen near-identical ones — not in *what you can practice*. A few items simply change shape to match what they truly are (podcasts/reading become an intake queue, certifications a list, posts a pipeline) rather than being forced into a flashcard mould.

**Cost posture.** In-app AI token spend in V1 is **$0** by design. AI is an *authoring tool* in Claude/Antigravity, not a *runtime feature*. The only runtime AI considered at all (a weekly reading digest) is V2+, optional, batched weekly, and manual-first — its worst-case annual cost is bounded to single-digit dollars (§13).

---

## 2. Product Vision

**One sentence.**
My Planning is a calendar-anchored personal operating system that decides what you do next, protects the time that moves your career, and turns daily practice into visible executive credibility.

**One paragraph.**
My Planning 2.0 is the single place you open every morning and glance at all day. It fuses a fast Apple-Calendar-style daily/weekly view, your real work and household calendars (via ICS), and a configurable routine into one "what's now / what's next" surface — so you never spend energy deciding what to do. On top of scheduling, it runs a small number of reusable engines: a **Practice** engine where you rehearse sales, executive-presence, and interview answers out loud with spaced repetition; a **Projects** engine that tracks the next action across your portfolio (including the NEXT career-move program); an **Intake** queue that tells you exactly what to read or listen to next without searching; and a **Create** pipeline that moves an insight from "I learned this" to "I published this on LinkedIn." It is offline-first, installable on your iPhone, costs almost nothing to run, and treats AI as a tool you use *in Claude to author content*, not a feature that runs (and bills) inside the app.

**One detailed explanation.**
The product solves one root problem: **decision fatigue and fragmentation while running a job change in parallel with a corporate role.** Today your effort is spread across Pocket Casts, Instapaper, separate GPTs/docs for exec presence and sales coaching, ad-hoc interview prep, and a half-finished planner — a fragmented experience you explicitly want to end. My Planning 2.0 consolidates the *operating layer* (when do I do what, what's the next action, am I making progress) into one app, while deliberately *not* absorbing tools that already work (podcast playback, long-form reading). The design philosophy is "few engines, much content": rather than building a bespoke module for each of the ~20 ideas in `MASTER.md`, the app provides a handful of generic engines and treats each "module" as a labeled body of content those engines render. This is what keeps the app buildable in your timeframe, cheap to run, and maintainable by you alone via Claude Code and Antigravity. The career objective is the spine: a single `UserProfile` entity encodes your target roles (Senior AE / Sales Manager / VP Sales → VP of AI), your competency framework, and your positioning thesis (enterprise Agentic AI advisor to the C-suite), and every engine references it — so Practice decks, Intake topics, Create themes, and Projects all visibly ladder up to "switch job in four months, then climb to VP of AI." Success is not "the app is feature-complete." Success is: you open it daily without friction, you rehearse fluency consistently, you publish credibly on LinkedIn on a cadence, you walk into interviews at 100% confidence, and the app quietly proves your progress back to you every Friday.

---

## 3. Core Product Principles

These are the decision filters. When a future choice is unclear, the choice that best honors these principles wins.

1. **One surface, not a suite.** Everything lives behind one app shell with one navigation model. New capability must justify itself *inside* the existing surface before it earns a new screen. Fragmentation is the enemy; consolidation is the product.

2. **Content is not software.** A body of knowledge (sales topics, exec drills, industry briefs, post ideas) is *data*, authored once in Claude and rendered by a generic engine. Building bespoke code for each knowledge area is the primary anti-pattern. Default to "make it content," not "make it a feature."

3. **The calendar is the spine.** Time is the only truly scarce resource. Every engine either *reads from* the calendar (what's now) or *writes to* it (block 30 min to rehearse). If a feature can't connect to time, question whether it belongs.

4. **Reduce decisions, don't add them.** The app's first duty is to remove the question "what should I do now?" Every screen should lower cognitive load. A feature that adds a decision must remove a bigger one.

5. **Practice is spoken and spaced.** Per your own drill library, silent reading is not practice. The Practice engine is built around *out-loud* repetition and spaced-repetition scheduling, not passive content display.

6. **AI authors; the app schedules.** AI's job is to generate and sharpen content (in Claude/Antigravity, where you already pay a subscription). The app's job is to schedule, surface, and track. Runtime model calls are guilty until proven cheap, rare, and clearly superior to manual.

7. **Manual-first, automate later.** Every feature ships in a manual form first. Automation (including AI) is added only after the manual version proves the workflow is worth keeping. This caps cost and avoids building automation for workflows you abandon.

8. **Offline-first, mobile-equal.** The daily surface must work with no network and load instantly on an iPhone. Sync is a background convenience, never a precondition for using the app.

9. **Your data is durable and yours.** Non-destructive migrations forever (you already do this). Data is local-first, exportable, and never trapped behind a service you don't control. A bad deploy must never be able to lose your data.

10. **Cheap by architecture.** Free hosting (GitHub Pages), free/own infra (your Cloudflare Worker), no paid backend, near-zero runtime AI. "A few dollars per year" is a hard constraint, not an aspiration.

11. **Maintainable by one person + agents.** The codebase must be legible to you through Claude Code and editable by Antigravity agents. That means real modules, types, and tests — not a 16k-line runtime-transpiled global scope.

12. **The job switch is the north star.** Every engine references the `UserProfile` and must visibly serve the 4-month switch and the long-term VP-of-AI arc. Features that don't ladder to the career outcome are deprioritized regardless of how interesting they are.

---

## 4. Key Risks in the Current Thinking

Severity is rated **High / Medium / Low** by likelihood × impact on either the app's viability or your job-switch timeline. Each risk names its mitigation, expanded later in the document.

| # | Risk | Severity | Why it's real (evidence) | Mitigation (where addressed) |
|---|------|----------|--------------------------|------------------------------|
| R1 | **Module sprawl** | **High** | `MASTER.md` lists ~20 modules; the natural instinct is one screen each. That is unmaintainable solo and dilutes the daily surface. | Module Governance Model + 20→5 consolidation (§7, §8). |
| R2 | **Runtime-Babel performance, esp. on iPhone** | **High** | The app ships ~16,000 lines of JSX transpiled *in the browser* by Babel Standalone on every load. On mobile Safari this is a slow, battery-heavy cold start — directly conflicting with "instant daily use." | Vite/TS build, code-splitting, PWA shell (§5, §6, §12). |
| R3 | **Whole-file sync with no conflict handling or offline** | **High** | `persist()` writes the *entire* JSON blob to Drive on every change; there is no conflict resolution and no offline cache. Editing on your phone and laptop the same day can silently overwrite work. "Multi-device conflict handling" and "Offline fallback" are still open backlog items. | Offline-first IndexedDB + per-entity Worker sync (§12). |
| R4 | **Opportunity cost vs the 4-month deadline** | **High** | Time spent *building the app* is time not spent *rehearsing, posting, applying, interviewing*. The app can become productive procrastination. | Ruthless V1 scope; "the job switch is the north star" (§3, §9, §17). |
| R5 | **AI dependence / token-cost runaway** | **Medium** | `MASTER.md` repeatedly imagines AI assistance; an in-app "coach" calling a model per interaction would blow the budget and underperform Claude. | "AI authors; app schedules" doctrine + AI cost table + cost-control tests (§13, §14). |
| R6 | **Fragile global-scope architecture** | **Medium** | All `app-*.js` files share one global scope ("global naming discipline matters"). This is brittle, hard to test, and dangerous for agent-driven edits in Phase 2. | ES modules + TypeScript (§5, §6). |
| R7 | **Cognitive overload in the UI** | **Medium** | The current surface is already dense (rail + hero + timeline + topbar with many toggles). Adding engines naively will overwhelm the daily glance. | Progressive disclosure; daily surface stays minimal; engines live one tap away (§11). |
| R8 | **Weak adoption (you don't use it daily)** | **Medium** | A personal tool only delivers if used daily. Friction (slow load, sign-in, sync anxiety) kills the habit. | Offline-first, instant load, no sign-in gate to *view*, daily "Right Now" gravity (§11, §12). |
| R9 | **Maintenance burden** | **Medium** | A bespoke hand-rolled calendar + drag/drop + component system is a lot of surface to maintain alone. | Keep what works; add tests so refactors are safe; lean on Antigravity for parallel maintenance (§14, §15). |
| R10 | **Content/data-model drift** | **Medium** | Reading/podcast/cert/post data risks becoming many ad-hoc shapes. | One unified `LearningItem` with a `kind` discriminator + clear entities (§10). |
| R11 | **Over-fitting the app to today's plan** | **Low** | Designing tightly to the current 20-module list risks rework when goals evolve (VP-of-AI arc is long). | Engine generality + `UserProfile`-driven config absorbs change without code (§5, §10). |
| R12 | **"No backend" taken too literally** | **Low** | Insisting on *zero* server can force worse choices (Drive-blob) than a tiny endpoint on infra you already run. | Reuse the existing Cloudflare Worker as a sync endpoint — no new tool (§12). |

**The two risks to internalize now:** R1 (sprawl) and R4 (opportunity cost). They compound: every extra module you build is time not spent switching jobs. The governance model exists to make "don't build that as a module" the easy default.

---

## 5. Recommended App Architecture

The target is a **layered architecture** where a small set of engines sit on a shared core and read from a content layer. The key new idea versus today is **L5 (Module System)** and **L6 (Content/Knowledge layer)**: instead of coding each `MASTER.md` module, a module is a *configuration record* that points at content and declares how it shows up. That single decision is what makes the 20→5 collapse real in code, not just on paper.

### 5.1 The layers

```
┌───────────────────────────────────────────────────────────────────────────┐
│ L0  SHELL & NAVIGATION   app shell · routing · theme · PWA install · offline │
├───────────────────────────────────────────────────────────────────────────┤
│ L1  CORE PLANNING ENGINE  the orchestrator: "Right Now / Next Up",           │
│     composes Today & Week from Calendar + Routine + Projects + Practice-due  │
├──────────────┬───────────────┬───────────────┬──────────────┬──────────────┤
│ L2 CALENDAR  │ L3 ROUTINE    │ L4 PROJECT/   │ L7 PRACTICE  │ (L Intake/   │
│ ENGINE       │ ENGINE        │ ACTION ENGINE │ ENGINE       │  Create live │
│ events,ICS,  │ recurrence,   │ portfolio,    │ Q&A/drills,  │  as light    │
│ time math    │ overrides,    │ next actions  │ spaced rep,  │  features on │
│              │ occurrences   │               │ rehearse,mock│  L1+L6)      │
├──────────────┴───────────────┴───────────────┴──────────────┴──────────────┤
│ L5  MODULE SYSTEM (governance registry)                                      │
│     each module = {id, family, type(native|light|generator|external),        │
│                     contentRef, projectRef, cadence, status}                 │
│     → decides where/whether a module appears; routes to content & calendar   │
├───────────────────────────────────────────────────────────────────────────┤
│ L6  CONTENT / KNOWLEDGE LAYER  (authored in Claude, stored as JSON/MD)        │
│     Practice decks · Intake items · Create ideas · Knowledge briefs           │
├───────────────────────────────────────────────────────────────────────────┤
│ L8  AI-ASSISTANCE LAYER  authoring-time (Claude/Antigravity) ·                │
│     thin OPTIONAL runtime adapter (weekly digest only, V2+)                   │
├───────────────────────────────────────────────────────────────────────────┤
│ L9  STORAGE / SYNC LAYER  IndexedDB (source of truth) ·                       │
│     per-entity sync via Cloudflare Worker → D1 · migrate() · export/import    │
├──────────────────────────────────────┬────────────────────────────────────┤
│ L10 SETTINGS / CONFIG  prefs · ICS    │ L11 QA / TESTING LAYER               │
│     feeds · UserProfile (career north │     unit (Vitest) · component (RTL) ·│
│     star) · category styles           │     e2e (Playwright) · cost-control  │
└──────────────────────────────────────┴────────────────────────────────────┘
```

### 5.2 How the layers interact

- **L1 composes; everything else supplies.** The Core Planning Engine asks Calendar (L2) for events, Routine (L3) for today's resolved occurrences, Projects (L4) for next actions, and Practice (L7) for what's *due* today. It merges these into the timeline and the "Right Now / Next Up" hero. L1 is the only layer that knows about the daily surface; engines never render the shell themselves (this is already the pattern — `TodayScreen` renders only the timeline; `CalendarScreen` owns the shell — keep it).
- **L5 is the governance brain.** Each module record declares a `type`. A **native** module (only Practice/Interview) gets a full engine screen. A **lightweight** module is a filtered *view* on an existing engine (e.g., "B2B Sales" is the Practice engine filtered to `track: sales`). A **generator** module only emits calendar blocks/tasks on a cadence (e.g., "study certification Tue 19:00"). An **external** module is a pointer (a link/queue item) to a tool like Instapaper or a Claude-authored doc. Changing a module's behavior is editing a record, not writing code.
- **L6 feeds L7/Intake/Create.** Practice decks, Intake items, and Create ideas are content rows. The engines are generic renderers + schedulers over that content. New "knowledge" = new rows authored in Claude, dropped into IndexedDB via import (or a seed file), with **zero** code change.
- **Engines write back to time.** Practice can create a "Rehearse: CFO discovery" block on the calendar; the Create pipeline can create a "Write LinkedIn post" block; Certification can create study blocks. This is the calendar-as-spine principle: engines convert intent into protected time.
- **L9 is local-first.** All reads/writes hit IndexedDB synchronously-feeling; a background syncer reconciles per-entity with D1 through the Worker. The app is fully usable offline; sync is invisible plumbing. `migrate()` (your existing function) runs on local load exactly as today.
- **L8 stays out of the runtime.** In V1 there is no runtime model call. AI lives in Claude/Antigravity to *author* L6 content. The only sanctioned runtime hook is a single, well-bounded weekly-digest adapter (V2+), isolated behind a feature flag and a hard monthly cap (§13).

### 5.3 Mapping current code → target layers (so nothing is wasted)

| Target layer | Current artifact(s) | Action |
|---|---|---|
| L0 Shell | `index.html` (CSS + script order), boot screens in `app-core.js` | Port CSS into the build; replace script-order globals with module imports; add `manifest.json` + service worker. |
| L1 Core Planning | `CalendarScreen` (`app-calendar.js`), `app-today.js` | Keep design; refactor into typed components; this becomes the composition root. |
| L2 Calendar | `app-week.js`, `app-helpers.js` (layoutDay, combinedDayItems, ICS parser), `cloudflare-worker.js` | Keep logic; extract to a `calendar/` module; keep the Worker (extend in L9). |
| L3 Routine | `app-routine.js` (resolution, overrides, `RoutineItemPopover` 5-mode state machine) | Keep as-is conceptually; port to `routine/`. This is mature — do not redesign. |
| L4 Projects | `ProjectsRailPanel` (`app-helpers.js`), `SEED_PROJECTS` (`app-data.js`) | Keep; extract to `projects/`. NEXT master program stays the home of career modules. |
| L5 Module System | *(does not exist)* | **New.** Build the module registry + governance types. This is the single most important new abstraction. |
| L6 Content/Knowledge | `SEED_INTERVIEW_*`, `practiceContent`, `referenceLibrary` (`app-data.js`); `EXECUTIVE_*` docs | Externalize hardcoded seeds into JSON/MD content files (this is literally your Phase-2 "migrate hardcoded modules to JSON" task). |
| L7 Practice | `app-interview.js` (full engine), `app-practice.js` (Daily Practice Hub) | **Generalize and merge** into one Practice engine driven by `track`/`module` tags. Highest-leverage refactor. |
| L8 AI | *(none in app)* | Keep out of runtime in V1; optional thin adapter V2+. |
| L9 Storage/Sync | `app-core.js` Drive OAuth + `persist()` + `migrate()`; Worker | **Replace** Drive-blob path with IndexedDB + per-entity Worker/D1 sync. **Keep** `migrate()`. |
| L10 Settings/Config | `SettingsModal` (`app-widgets.js`), `prefs` | Keep; **add `UserProfile`** (career north star) as new config. |
| L11 QA | *(none)* | **New.** Vitest + React Testing Library + Playwright; cost-control tests. |

**Net:** you keep ~80% of the hard-won logic (calendar, routine, projects, interview content, visual language, ICS worker, migrations) and rebuild the *delivery substrate* (build, modules, storage, PWA) plus add two new abstractions (Module System, Content layer) and one generalization (Practice). That is a *partial* rebuild — see §6.

---

## 6. Build vs. Rebuild Recommendation

### 6.1 The three options assessed

**Option A — Keep the current app and refactor in place.**
*Pros:* lowest disruption; the app works today. *Cons:* the two worst liabilities are *structural* and cannot be refactored away without changing the substrate: (1) runtime Babel transpiling 16k lines in-browser (a build-step decision, not a code-cleanliness one) and (2) the single global scope across `app-*.js` (an ES-module decision). You also cannot get a true installable PWA or robust offline/sync by tidying the current files. Refactor-in-place leaves R2, R3, and R6 unsolved. **Reject.**

**Option C — Rebuild fully from scratch.**
*Pros:* clean slate. *Cons:* throws away genuinely valuable, mature assets for no architectural benefit that Option B doesn't also deliver: 23 non-destructive schema migrations, 25 seeded interview categories + 73+ questions + story bank + rubric + spaced-repetition tuning, the routine-resolution engine (recurrence + overrides + occurrence editing — this is the hardest part of the whole app and it works), the ICS Worker, and the entire visual language. A from-scratch rewrite also maximizes R4 (opportunity cost) — months of rebuilding *working* features instead of switching jobs. **Reject.**

**Option B — Partial rebuild ("strangler" migration).**
Stand up a new Vite + React + TypeScript shell, then migrate the existing engines into it one at a time behind a stable data contract, replacing only the substrate (build, modules, storage, PWA) and generalizing Practice. Preserve all content and logic. **Recommend.**

### 6.2 Recommendation (CONFIRMED): **Option B — partial rebuild**

> **Status: confirmed.** This approach has been approved and is now a settled input for Phase 2 — not an open option.

**Justification.** The value in the current app is the *content and the domain logic*; the liabilities are the *substrate*. Option B is the only path that keeps the former and fixes the latter. It also aligns one-to-one with your stated Phase-2 plan: "migrate hardcoded modules to JSON," "refactor into components," "before/after screenshots," "parallel implementation tasks." Those *are* the strangler steps. Phase 1 (this blueprint) defines the target contracts so Antigravity agents can execute the migration safely and in parallel in Phase 2.

**What is preserved (do not touch the logic):**
- The data schema and `migrate()` (carry forward as the migration target; bump to v24+ only additively).
- All seeded content: interview categories/questions/stories, `practiceContent`, the executive frameworks/word-bank/drills from `EXECUTIVE_PRESENCE.docx` + `EXECUTIVE_DRILL_LIBRARY.md` + the 60-second reset.
- Routine resolution + `RoutineItemPopover` 5-mode UX (mature; reuse).
- Calendar layout math (`layoutDay`, `combinedDayItems`), ICS parsing, the Cloudflare Worker.
- The visual language (aurora glassmorphism, tokens, typography, Apple-Calendar split).

**What is replaced (the substrate):**
- Runtime Babel → **Vite build** (instant boot, code-splitting, minification, tree-shaking).
- Global scripts → **ES modules + TypeScript** (kills R6; makes agent edits safe).
- Google Drive whole-file sync → **IndexedDB-first + per-entity Worker/D1 sync** (kills R3; enables offline).
- PWA-ish meta tags → **real PWA** (manifest + service worker; installable iPhone app).

**What is newly built:**
- **Module System (L5)** — the governance registry.
- **Content layer (L6)** — externalized JSON/MD content.
- **Practice generalization (L7)** — one engine for all fluency content.
- **QA layer (L11)** — tests that make the migration and future agent edits safe.

**What is rejected outright:** bespoke modules for each `MASTER.md` heading; any runtime AI in V1; rebuilding podcast/RSS playback; an in-app AI post-writer.

### 6.3 Migration shape (de-risked, reversible)

Run the new app on a branch / a second Pages path (e.g., `/v2/`) while the current app stays live at `/`. Migrate engine-by-engine: Plan → Projects → Practice (generalized) → Intake → Create. At each step, import your *real* data (export current Drive JSON → import into IndexedDB) and validate against the live app. Cut over only when Plan + Projects + Practice reach parity. This means **you never lose a working app** during the rebuild — directly addressing the "without breaking what already works" requirement.

---

## 7. Module Governance Model

### 7.1 The five buckets

| Bucket | Name | What it means | Cost to build | When to use |
|---|---|---|---|---|
| **A** | **Native module** | A full engine with its own screens and logic inside the app. | High | Only when the interaction is genuinely unique *and* used near-daily *and* cannot be expressed as content on an existing engine. |
| **B** | **Lightweight module** | A filtered view / configuration on an existing engine. No new engine; new *content* + a tag/filter. | Low | When the need is "more of the same shape" (another deck to rehearse, another list to track). |
| **C** | **Calendar/Task generator only** | Emits calendar blocks or tasks on a cadence; no dedicated UI. | Very low | When the need is really "protect time for X regularly." |
| **D** | **External knowledge/document** | Lives outside the app as Claude-authored content or in an external tool; the app links/queues it. | ~Zero (app side) | When the artifact is authored once/occasionally, or an external tool already does it better. |
| **E** | **Not worth building** | Drop, or fold entirely into something else. | Zero | When it's a project (not a module), a one-off task, or duplicative. |

### 7.2 The decision rubric (apply in order)

1. **Is it a project, not a module?** (Has a deliverable/end state, e.g. "build an AI sales app.") → it belongs in the **Projects engine**, not as a learning module. *(→ E as a module.)*
2. **Is it a one-time or occasional authoring task?** (e.g. rewrite the LinkedIn profile.) → **D** (do it in Claude; store the output as a reference link).
3. **Does an existing tool already do it well?** (podcast playback, long-form reading.) → **D/external**; the app only queues/links.
4. **Is it "a deck of things I rehearse out loud"?** → **B** on the **Practice** engine (content + `track` tag). *Never a new engine.*
5. **Is it "a list of things I consume or complete"?** → **B** on **Intake** (`LearningItem` with a `kind`), optionally **C** for study blocks.
6. **Is it "turning insight into published output"?** → **B** on **Create** (idea→post pipeline).
7. **Is the only real need "do this regularly"?** → **C** (calendar generator).
8. **Only if it survives all of the above and is unique + daily + not expressible as content** → **A** (native engine). *Expect this to be rare.*

### 7.3 The model applied to every module in `MASTER.md`

| Module (`MASTER.md`) | Bucket | Lives in | Rationale |
|---|---|---|---|
| Interview Preparation | **A** | **Practice engine (native, generalized)** | Already built and mature; it *is* the spaced-repetition rehearsal engine. Generalize it so other fluency tracks reuse it. |
| Strategic & Complex B2B Sales Fluency | **B** | Practice (`track: sales`) | 17 topics → decks of prompts/model answers/fluency drills. Same shape as interview prep. Content, not code. |
| C-Level Questioning & Prompting | **B** | Practice (`track: clevel`, by role/sector/situation) | Already partially exists (`practiceContent.clevelQs`). Role/sector/situation are *tags/filters*, not screens. |
| Executive Presence | **B** (+ tiny optional **A** flourish) | Practice (`track: execpresence`) + optional 60-sec reset widget | The frameworks (OOR/FBT/DARE…), word bank, and drills are Practice content. The "60-second reset before every meeting" is the only piece that could justify a small native widget (a guided timer). |
| Banking & Insurance Fluency | **B** + **D** | Practice (`track: industry`) + Knowledge brief (Intake) | Conversation hooks/KPIs → Practice decks. "Always up-to-date" regulatory knowledge → a Claude-authored brief refreshed periodically and read via Intake — *not* a live in-app data feed. |
| Leadership Expertise | **B** | Practice (`track: leadership`) + Story bank | Leadership philosophy/stories are narratives you rehearse; stories live in the shared Story bank. |
| Management Philosophy (Mirror Management) | **B** | Practice (`track: management`) + 1 Knowledge doc | One articulation doc + rehearsal prompts. No engine. |
| Thought Leadership in Agentic AI | **B** | **Create engine** (idea→post) + cadence (**C**) | Post ideas, themes, tone guide → the Create pipeline; "how often to publish" → a calendar cadence. Authoring in Claude. |
| LinkedIn (profile rewrite + resume) | **D** (+ **E** as a module) | Claude (authoring) → reference link | A periodic authoring task, not an app feature. Store the latest resume/profile as a `referenceLibrary` link. |
| AI Certification Track | **B** + **C** | Intake (`kind: certification`) + study blocks | A sortable/filterable list with attributes (duration, cost, effort, signal, onLinkedIn). Ranking content authored in Claude. "Pick the next cert fast" = sort the list. |
| Reading + Viewing | **B** + **D** (+ optional V2 **AI**) | Intake (`kind: reading/webinar`) → Instapaper/URLs | A queue of what-to-consume-next pointing at external tools. AI "information-agent" digests are V2+, manual-first, cost-capped. |
| Podcasts | **B** + **C** + external | Intake (`kind: podcast`) + listening block; **Pocket Casts stays the player** | The OPML is a seed source list. Do not build a player. The real problem ("I don't consume enough") is solved by *scheduling listening time* (C) + a short curated queue (B), not new software. |
| Agentic AI Expert | **B** + **D** | Practice (`track: agentic`) + Intake briefs + Create | A knowledge *domain* spanning three engines via tags; no engine of its own. |
| Agentic AI for Customer Engagement | **B** + **D** | Practice (`track: agentic-cx`) + Intake + Create | Same as above, marketing-specialized. |
| AI Apps for Sales | **E** (as module) → **Projects** | Projects engine (already in portfolio) | This is a *project* with a deliverable, not a learning module. Track next actions in the portfolio. |

**Result:** of fifteen named modules, **exactly one** is a native engine (Interview Prep → Practice). Eleven are lightweight content/views on three engines (Practice, Intake, Create). Two reduce to calendar generators. Two are external/authoring or are really projects. **This table is the proof of the reduce-complexity mandate.**

---

## 8. Module Map

### 8.1 Families → engines (the 20→5 consolidation)

| Family (per the prompt) | Collapses into | Mechanism |
|---|---|---|
| **Core Planning** | **Plan engine** + **Review** rhythm | Calendar + Routine + Time-blocks + Friday review (all largely exist). |
| **Career Move / NEXT** | **Projects engine** (master program) | NEXT stays the master project; its sub-modules carry next-actions. |
| **Interview & Executive Readiness** | **Practice engine** | Interview Prep (native) + Executive Presence (content) + 60-sec reset (optional widget). |
| **Sales Fluency** | **Practice engine** | B2B Sales + C-Level Questioning as `track`-tagged decks. |
| **Agentic AI Expertise** | **Practice** + **Intake** + **Create** | A domain spread across engines by tags, not a screen. |
| **Thought Leadership / LinkedIn** | **Create engine** (+ Claude authoring) | Idea→draft→published pipeline + cadence; profile/resume authored in Claude. |
| **Reading / Podcasts / Knowledge Intake** | **Intake engine** (+ external apps) | One queue of `LearningItem`s by `kind`; playback/reading stay external. |
| **Certifications** | **Intake engine** (list view) + **C** | Sortable list with attributes + study blocks. |
| **Leadership & Management** | **Practice engine** | Philosophy narratives + stories as `track`-tagged content. |
| **Industry Expertise** | **Practice** + **Intake** (briefs) | Conversation hooks rehearsed; regulatory briefs read. |

**Five engines + a content layer + a review rhythm** cover all ten families. No family requires a bespoke module.

> **What this table does *not* mean.** It does not remove or merge any of your modules. Every `MASTER.md` module is preserved and appears as its own separately-practiced item in the app — its own deck, queue, or list, with its own progress. "Collapses into" describes which **engine's code runs underneath**, not a merger of the modules themselves. One engine renders many modules the same way one media player plays many separate playlists: the playlists stay distinct; only the player is shared.

### 8.2 Overlaps, duplicates, and consolidation opportunities

- **Interview Prep ⊃ all fluency modules.** Interview Prep, B2B Sales, C-Level Questioning, Executive Presence, Leadership, Management, Banking/Insurance, and both Agentic-AI tracks are the *same data shape*: prompt → structured answer/notes → confidence → spaced repetition → optional rehearsal/mock. **Consolidate into one Practice engine** with a `track` dimension. This removes the largest source of would-be duplication.
- **Daily Practice Hub ≈ Practice engine flashcard mode.** `app-practice.js` (Personal Narrative + C-Level flashcards with streaks) is a *subset* of the Interview Prep engine. **Merge** — the Hub becomes "flashcard mode + today's due queue" within Practice, not a separate overlay.
- **Story bank is shared, not per-module.** Interview stories (STAR/SOAR) are reused across sales, leadership, and interview tracks. Keep **one** Story bank (`InterviewStory`) linked by tags to many decks.
- **Agentic AI Expert vs Agentic AI for Customer Engagement** overlap heavily. Treat as **one knowledge domain with two facets** (`agentic`, `agentic-cx`) sharing Intake sources and Create themes; don't duplicate infrastructure.
- **Reading vs Podcasts vs Webinars vs Certifications** are four `kind`s of one thing: "stuff to consume/complete." **One `LearningItem` collection** with a `kind` discriminator and per-kind fields — not four data shapes.
- **Thought Leadership vs LinkedIn (profile)** are different: one is an ongoing *pipeline* (posts), the other an occasional *authoring task* (profile/resume). Keep the pipeline in Create; push the profile/resume to Claude with only a reference link stored.
- **"AI Apps for Sales" appears as both a module and a portfolio project.** It is a project. Remove the module framing.

### 8.3 Engine dev streams (deep design per engine)

Each engine below is specified with the dev-stream fields from `MASTER.md` (Purpose / User journey / Data / Key screens / Inputs & outputs / Links / AI / Features / Testing). This is the correct unit of deep design *after* governance — designing five engines deeply beats designing twenty modules shallowly.

#### 8.3.1 PLAN ENGINE (core daily/weekly operating surface)
- **Purpose:** remove "what do I do now?" Compose the day/week from all time sources and surface Right-Now/Next-Up.
- **User journey:** open app → see Right Now / Next Up + today's timeline → optionally switch to Week to drag-plan → end of day, nothing to do.
- **Data:** `CalendarEvent` (read-model), `CalendarSource`, `Routine` (+overrides/completions), `TimeBlock`, `Settings`.
- **Key screens:** Today (hero + timeline/grid toggle, mini-month, day nav), Week (drag-drop grid, weekend collapse).
- **Inputs/outputs:** *in* — ICS feeds, routine config, manual blocks, todos; *out* — the composed timeline, the hero banner.
- **Links:** the spine — every other engine writes blocks here and reads "due today."
- **AI:** none.
- **Features (keep from current):** aurora/glass layout, concurrent-event "Right Now" list, now-line, micro-trackers, past-event desaturation.
- **Testing focus:** calendar conflict/overlap layout, recurring-routine resolution across DST, drag-drop, mobile layout, ICS parse.

#### 8.3.2 PROJECTS ENGINE (portfolio + next actions)
- **Purpose:** track the next action across the portfolio; keep NEXT (career program) front-and-center.
- **User journey:** glance at Projects rail → see next action per module → complete/add → progress accrues.
- **Data:** `Project` (NEXT is `isMaster`), `Module` (registry record), `Action` (+`completedActions`).
- **Key screens:** Projects rail panel, project detail (modules + next actions), NEXT master view.
- **Inputs/outputs:** *in* — manual next actions, module status; *out* — "today's next action" surfaced in Plan, optional task blocks.
- **Links:** Modules (L5) point here; actions can spawn calendar blocks.
- **AI:** none (optional V3: suggest next action from cadence — low priority).
- **Features:** complete/add/archive actions live (exists), priority sequence on NEXT.
- **Testing focus:** action CRUD persistence, completed-history integrity, master-project invariants.

#### 8.3.3 PRACTICE ENGINE (all spoken fluency — the consolidation hub)
- **Purpose:** build executive/sales/interview fluency through *out-loud*, *spaced* repetition across all tracks.
- **User journey:** open Practice → see "Due today" across tracks → pick a deck or run "Due queue" → rehearse out loud (timer, hints) → rate confidence → spaced-repetition reschedules → optional mock interview → Friday: see readiness.
- **Data:** `PracticeItem` (generalizes interview questions + `clevelQs` + narratives + exec drills; fields: `track`, `prompt`, structured `answer` blocks, `confidence`, `status`, `lastPracticedAt`, `nextPracticeAt`, `rehearsalCount`, `linkedStoryIds`, `rubric`, `tags`), `InterviewStory` (shared), `ProgressLog` (append-only practice events).
- **Key screens:** Practice dashboard (tracks + Due today + readiness), Deck/question list (filter by `track`/status/confidence), Rehearsal view (timer 30/60/90/180s, hints, confidence rating), Mock interview (setup → timed → batch rating), Flashcard mode (the old Daily Practice Hub), Story bank (CRUD + reverse index), Global search.
- **Inputs/outputs:** *in* — decks authored in Claude (imported as content); *out* — "Rehearse X" calendar blocks, readiness metrics for the Friday review.
- **Links:** writes rehearsal blocks to Plan; stories shared with Create (a polished STAR story → a post); readiness feeds Review.
- **AI:** **authoring-time only** — Claude generates/sharpens decks and model answers; the app does *not* call a model to grade rehearsals in V1. (V3 optional: self-scored rubric only; no model.)
- **Features (mostly exist — generalize):** 10-block answer workspace, 7-item rubric, spaced repetition (conf 1→1d … 5→14d), mock mode, progress charts, import/export, category/track management.
- **Testing focus:** spaced-repetition scheduling math, persistence of ratings (esp. batch mock save), track filtering, search correctness, **no network calls fire** (cost-control).

#### 8.3.4 INTAKE ENGINE (reading / podcasts / webinars / certifications queue)
- **Purpose:** "I always know what to consume or complete next, without searching."
- **User journey:** open Intake → see a short, prioritized queue (filter by `kind`/topic/time) → tap → opens in Instapaper/Pocket Casts/URL → mark done → progress + a "listening/reading" block on the calendar keeps the habit.
- **Data:** **one** `LearningItem` with `kind ∈ {reading, podcast, webinar, course, certification}`; shared base (`title`, `url`, `topic`/`track`, `source`, `estMinutes`, `status`, `priority`, `addedAt`, `completedAt`, `notes`); kind-specific (certification: `cost`, `effortHrs`, `signalValue`, `onLinkedIn`, `vendor`, `deadline`; podcast/webinar: `durationMin`; reading: `paywalled` flag).
- **Key screens:** Intake queue (sortable/filterable list), Certification view (the same collection filtered to `kind: certification`, sorted by signal/effort/cost), "Add to queue" quick-add (paste URL).
- **Inputs/outputs:** *in* — URLs (manual or pasted), the OPML source list as seeds, Claude-authored cert rankings/briefs; *out* — links out to external tools, study/listening calendar blocks.
- **Links:** generates consume-time blocks (C); finished items can seed Create ideas ("I read X → post idea").
- **AI:** none in V1. **V2 optional:** a *weekly* batched digest (one model call/week, capped) that proposes 5 links per topic with paywall pre-checks — manual-first, behind a flag (§13).
- **Features:** unified queue, kind filters, time-aware sort ("I have 20 min"), certification attributes sort, paywall flag, external deep-links.
- **Testing focus:** queue sort/filter correctness, external-link integrity, cert attribute sorting, (V2) digest cost cap enforcement.

#### 8.3.5 CREATE ENGINE (insight → LinkedIn pipeline)
- **Purpose:** convert what you learn/rehearse into a steady stream of credible, *in-your-voice* LinkedIn posts.
- **User journey:** capture an idea (often from Intake/Practice) → it enters the pipeline as `idea` → on a cadence, draft in Claude → paste draft back as `drafting` → schedule → mark `published` → cadence keeps you consistent.
- **Data:** `ContentIdea` (`hook`, `angle`, `theme`/`track`, `sourceRef`, `status`), `LinkedInPost` (`title`, `body`, `status ∈ {idea,drafting,scheduled,published}`, `scheduledFor`, `publishedAt`, `linkedStoryIds`, `metricsNote`).
- **Key screens:** Pipeline board (idea → drafting → scheduled → published), Idea capture quick-add, Cadence settings.
- **Inputs/outputs:** *in* — ideas (manual or from Intake/Practice), drafts authored in Claude; *out* — "Write post" / "Publish post" calendar blocks, a personal brand archive.
- **Links:** pulls from Practice stories and Intake items; writes posting cadence blocks to Plan.
- **AI:** **authoring-time only** — drafting happens in Claude (your voice, your judgment). The app stores ideas/drafts/status and protects the cadence. No runtime generation.
- **Features:** pipeline statuses, cadence reminders, source linking, published archive (proof of thought leadership for interviews).
- **Testing focus:** pipeline state transitions, scheduling block creation, archive integrity.

#### 8.3.6 KNOWLEDGE / CONTENT LAYER (shared)
- **Purpose:** be the single, version-controlled body of content all engines read — authored in Claude, owned by you.
- **Data:** content files (JSON/MD) for Practice decks, Intake seed lists, Create themes/tone guide, and Knowledge briefs (e.g., the Banking/Insurance regulatory brief, the Mirror Management articulation). Imported into IndexedDB; optionally kept as seed files in the repo.
- **Inputs/outputs:** *in* — Claude-authored content; *out* — typed content consumed by engines.
- **AI:** this is where AI value concentrates — at authoring time, in Claude, at no runtime cost.
- **Testing focus:** content schema validation on import; migration safety.

---

## 9. Recommended V1, V2, V3 Scope

Scope is governed by one rule: **V1 is what you would open every single day during a 4-month job switch.** Everything else waits.

### V1 — Must-have, daily-use, realistic first production version
The substrate rebuild + the engines you already use daily, on a stable foundation.
- **Substrate:** Vite + React + TypeScript; ES modules; PWA (manifest + service worker, installable on iPhone); offline-first IndexedDB; per-entity sync via the existing Cloudflare Worker → D1; `migrate()` carried forward; export/import.
- **Plan engine:** Today + Week, ICS feeds, routine, time-blocks, Right-Now/Next-Up, Friday review. (Port, don't redesign.)
- **Projects engine:** portfolio rail + NEXT master program + next actions.
- **Practice engine (generalized):** Interview Prep + Daily Practice Hub merged; `track` tags live; spaced repetition, rehearsal, mock, story bank, search. Seed tracks: `interview`, `sales`, `clevel`, `execpresence` (your richest existing content).
- **Module System (L5):** the registry exists and drives Practice tracks + calendar generators.
- **Content layer (L6):** existing seeds externalized to JSON/MD.
- **UserProfile:** authored once (target roles, competencies, positioning thesis) — the north star.
- **QA layer:** unit + component + a smoke e2e; cost-control test asserting **zero** runtime model calls.

### V2 — High-value expansions
Add the two light engines and the intake habit, once the daily core is stable.
- **Intake engine:** unified `LearningItem` queue (reading/podcast/webinar/certification), time-aware sort, external deep-links, certification attribute view, consume-time calendar blocks. Seed sources from `podcasts.opml`.
- **Create engine:** idea→draft→scheduled→published pipeline, cadence blocks, published archive; drafting in Claude.
- **Practice tracks expansion:** `leadership`, `management`, `industry` (Banking/Insurance), `agentic`, `agentic-cx` as content.
- **Optional weekly digest (the *only* runtime-AI candidate):** behind a feature flag, one batched call/week, hard monthly cap, paywall pre-check, manual-first.
- **Multi-device polish:** sync status UI, conflict surfacing (per-entity last-write-wins with a visible "updated elsewhere" note).

### V3 — Advanced / AI / automation
Only after V1/V2 are habit and the job context allows.
- **60-second Executive Reset widget** (guided timer using your reset doc) — small native flourish.
- **Insight→post assist (still authoring-time):** templated prompt hand-off to Claude with one click (no in-app generation).
- **Self-scored rehearsal analytics** (trends in confidence/readiness; no model).
- **Optional richer digests / topic agents** — only if the weekly digest proves valuable and cheap.
- **Habit streaks/analytics, past-review browser** (from your existing backlog).

**Explicitly deferred or rejected at every version:** in-app podcast/RSS playback; in-app AI chat coach; runtime per-interaction model calls; auto-posting to LinkedIn; an in-app résumé builder.

---

## 10. Data Model

Entities below cover the full list in the prompt. **Storage reality:** to honor "reduce complexity," `ReadingItem`, `PodcastEpisode`, and `Certification` are **specializations of one `LearningItem` collection** (a `kind` discriminator), not three separate tables; `PracticeItem` **generalizes** today's interview questions + `clevelQs` + narratives + exec drills. "Exists?" marks what is already in schema v23 (so the model is continuous, not green-field).

| Entity | Purpose | Key fields | Relationships | Version | Exists? |
|---|---|---|---|---|---|
| **UserProfile** | The career north star every engine references. Authored once in Claude. | `targetRoles[]` (Senior AE→VP Sales→VP AI), `competencyFramework[]`, `positioningThesis`, `industries[]` (BFSI), `geos[]`, `switchDeadline` | Referenced by Module, Practice tracks, Intake topics, Create themes | **V1** | New |
| **Project** | A portfolio initiative with an end state. | `id`, `name`, `tier`, `isMaster`, `prioritySequence`, `status` | has many **Module**, **Action** | V1 | ✅ (`projects`, NEXT master) |
| **Module** | Governance registry record — *the* L5 abstraction. | `id`, `family`, `type` (native/light/generator/external), `contentRef`, `projectRef`, `cadence`, `status` | belongs to Project; points to Content + Calendar | **V1** | New (formalizes today's `modules[]`) |
| **Action** | A next action within a project/module. | `id`, `text`, `done`, `createdAt`, `completedAt` | belongs to Module/Project | V1 | ✅ (`nextActions[]`, `completedActions[]`) |
| **Task** | A lightweight todo, optionally scheduled. | `id`, `text`, `done`, `scheduledBlockId?` | may link to TimeBlock | V1 | ✅ (`todos`) |
| **Routine** | Recurring activity template + overrides. | `items[]` (title, start, durationMin, days, category, homeOnly), `overrides`, `completions` | resolves into CalendarEvents | V1 | ✅ (`routine`,`overrides`,`routineCompletions`) |
| **CalendarEvent** | Unified read-model of everything on the timeline. | `id`, `source` (routine/block/ics-work/ics-home), `title`, `start`, `end`, `category`, `editableScope` | derived from Routine + TimeBlock + ICS | V1 | ✅ (composed in `combinedDayItems`) |
| **CalendarSource** | A feed/source of events. | `id`, `kind` (ics/routine/manual), `url?`, `color`, `enabled` | produces CalendarEvents | V1 | ✅ (`calendars`) |
| **TimeBlock** | A concrete scheduled block (incl. engine-generated). | `id`, `title`, `start`, `durationMin`, `category`, `origin` (manual/practice/create/intake), `refId?` | may reference a Practice/Create/Intake item | V1 | ✅ (`scheduledBlocks`) |
| **PracticeItem** | A prompt you rehearse, any track. | `id`, `track`, `prompt`, `answer{coreMessage,answer60,answer30,proofStory,metrics,keywords,watchOuts,notes,…}`, `status`, `confidence`, `rubric`, `lastPracticedAt`, `nextPracticeAt`, `rehearsalCount`, `linkedStoryIds[]`, `tags[]` | links to InterviewStory; logs to ProgressLog | **V1** | ✅ generalize (`interviewPrep.questions` + `practiceContent`) |
| **InterviewStory** | A reusable STAR/SOAR story. | `id`, `title`, `summary`, `situation`, `action`, `result`, `learning`, `metrics`, `whereToUse`, `tags[]` | linked by many PracticeItems & ContentIdeas | V1 | ✅ (`interviewPrep.stories`) |
| **LearningItem** | One thing to consume/complete (base). | `id`, `kind`, `title`, `url`, `topic`/`track`, `source`, `estMinutes`, `status`, `priority`, `addedAt`, `completedAt`, `notes` | may seed ContentIdea | **V2** | New |
| **ReadingItem** | *Specialization* of LearningItem. | + `paywalled`, `author`, `publishedAt` | (a `kind:reading` LearningItem) | V2 | New |
| **PodcastEpisode** | *Specialization* of LearningItem. | + `durationMin`, `podcast`, `episodeUrl` | (a `kind:podcast` LearningItem; **playback external**) | V2 | New |
| **Certification** | *Specialization* of LearningItem. | + `cost`, `effortHrs`, `signalValue`, `onLinkedIn`, `vendor`, `deadline` | (a `kind:certification` LearningItem) | V2 | New |
| **ContentIdea** | A seed for a LinkedIn post. | `id`, `hook`, `angle`, `theme`/`track`, `sourceRef`, `status` | becomes a LinkedInPost | **V2** | New |
| **LinkedInPost** | A post moving through the pipeline. | `id`, `title`, `body`, `status` (idea/drafting/scheduled/published), `scheduledFor`, `publishedAt`, `linkedStoryIds[]`, `metricsNote` | from ContentIdea; references Story | V2 | New |
| **ProgressLog** | Append-only event log (practice, completions, posts). | `id`, `type`, `refId`, `at`, `value` (confidence/score/done) | references any entity | **V1** (lightweight) → richer V3 | Partial (per-item fields today) |
| **Review** | A weekly planning/review record. | `id`, `weekStart`, `wins`, `misses`, `nextWeekFocus`, `readinessSnapshot` | aggregates ProgressLog | V1 | ✅ (`weeklyResets`) |
| **Settings** | App config + feeds + theme. | `theme`, `categoryColors/emojis/labels`, `calendars`, `lunchSlot`, `todayView`, feature flags | global | V1 | ✅ (`prefs`,`calendars`) |

**Key relationships (narrative):** `UserProfile` sits above everything as config. `Project → Module → Action` is the portfolio spine; a `Module` of `type: native/light` points (`contentRef`) into the Content layer that feeds the **Practice** engine, while a `Module` of `type: generator` carries a `cadence` that emits `TimeBlock`s. `PracticeItem`s link to shared `InterviewStory`s; rehearsing one appends to `ProgressLog`, which the weekly `Review` aggregates into a readiness snapshot. `LearningItem`s (Intake) can spawn `ContentIdea`s, which graduate to `LinkedInPost`s (Create); both Practice and Create can write `TimeBlock`s to the calendar. `CalendarEvent` is a *derived* read-model unifying `Routine` occurrences, `TimeBlock`s, and `CalendarSource` (ICS) — never stored directly, always composed (as today).

**Schema continuity:** bump to v24 *additively* — add `userProfile`, `modules` (formalized), `learning[]`, `content[]`, `create{ideas[],posts[]}`, `progressLog[]`, and feature flags. Keep every existing key. `migrate()` stays non-destructive.

---

## 11. UX / UI Architecture

The current UX is good and should be **preserved and extended, not redesigned**. The daily surface stays minimal; the new engines live one tap away so they never crowd the morning glance (mitigates R7).

### 11.1 Main screens & flows (mapped to the prompt's list)

- **Today view** *(spine, default landing)* — Right-Now/Next-Up hero + timeline (list⇄hour-grid toggle), mini-month, day nav. Adds one quiet line: **"Due today"** (count of Practice items due) that taps into the Practice Due queue. Nothing else changes.
- **Week view** — drag-drop grid, weekend collapse. Engine-generated blocks (rehearse/write/study) appear here like any block, color-coded by `origin`.
- **Projects rail** — next action per module with complete/add/archive (exists). Module chips show `type` subtly (a tiny glyph) so you can see what's content vs generator.
- **Module dashboard** — *new, light:* a single grid of all `Module` records grouped by family, each showing status + next action + "open" (→ Practice track / Intake filter / Create theme / external link). This is the one place that makes the whole system legible without being a screen *per* module.
- **Right Now / Next Up banner** — unchanged (concurrent-event list, ends-time, supplements excluded).
- **Review flow** — Friday review (exists): wins/misses/next-week focus **+ a readiness snapshot** (Practice confidence by track) pulled from `ProgressLog`. Sunday drag-plan stays the planning rhythm.
- **Interview Prep flow** *(now the Practice flow)* — dashboard (tracks + Due today + readiness) → deck/question list (filter by track/status/confidence) → answer workspace (10 blocks) / rehearsal (timer + hints + confidence) → spaced-repetition reschedule; mock interview (setup → timed → batch rating). Flashcard mode = the old Daily Practice Hub, folded in.
- **Learning intake flow** *(V2)* — open Intake → time-aware prioritized queue (filter by kind/topic) → tap → opens external (Instapaper/Pocket Casts/URL) → mark done → optional "add consume block." Certification view = same list filtered + sorted by signal/effort/cost; "next cert" is the top row.
- **LinkedIn content flow** *(V2, Create)* — capture idea (often from Intake/Practice) → pipeline board (idea→drafting→scheduled→published) → "draft in Claude" hand-off → paste back → schedule → publish → archive.
- **Mobile / iPhone flow** — installed PWA; Today is the home; bottom-reachable primary actions; the rail collapses to a sheet; rehearsal works one-handed with large tap targets and the timer; everything works offline. Week view is view-mostly on phone, drag-plan mostly on desktop.

### 11.2 Navigation model

One shell, two levels. **Level 1 (always visible):** Today / Week + the hero. **Level 2 (one tap, via the `⋮` menu or a slim tab bar on mobile):** Practice · Projects/Modules · Intake (V2) · Create (V2) · Settings. Engines never replace the shell chrome; they open as full pages (like today's Interview Prep page) or sheets on mobile.

### 11.3 What it should feel like in daily use

Open it and the answer to "what now?" is already on screen — no thinking. A glance shows the next event, whether anything is due to rehearse, and the single next action on NEXT. Twice a day you might spend 10 focused minutes in Practice rehearsing out loud; the app told you exactly which cards. On Tuesday a calendar block says "Write LinkedIn post," and a tap hands a ready prompt to Claude. On Friday, the review shows you got more confident on CFO discovery and shipped two posts. It feels like a **calm operating system**, not a busy dashboard: fast, quiet, mobile, and always pointed at the job switch.

---

## 12. Storage and Sync Strategy

### 12.1 Verdict (CONFIRMED): **offline-first IndexedDB, synced per-entity through your existing Cloudflare Worker → D1.** Retire Google Drive whole-file sync.

> **Status: confirmed.** This is the approved storage model. The Cloudflare Worker + D1 backend is the chosen path; Google Drive whole-file sync is retired.

**Why change at all.** The current `persist()` writes the *entire* JSON blob to Drive on every mutation, with **no conflict handling and no offline cache**. On two devices (iPhone + laptop) the same day, the last writer silently overwrites the other — a real data-loss path (R3). There is also no offline use and no real PWA. For a tool meant to be opened all day on a phone, offline-first is non-negotiable.

**Why this specific design (and why it's still "cheap, fewer tools").**
- **IndexedDB is the source of truth on each device.** Reads/writes feel instant; the app is fully usable with no network (principle 8). `migrate()` runs on local load exactly as today.
- **Sync is background and per-entity**, not whole-file. Each entity row carries `updatedAt`; the syncer reconciles changed rows with the server. Last-write-wins **per entity** means a phone edit to a Practice card and a laptop edit to a calendar block both survive — the failure mode of whole-file sync disappears.
- **The server is infra you already run.** You already operate a **Cloudflare Worker** (it proxies ICS *and* Todoist today). Extending it with a tiny sync route backed by **Cloudflare D1** (SQLite) or **KV** adds **zero new tools** and stays on the free tier (well within "a few dollars per year"). This respects "fewer tools" better than Drive did, because it *consolidates* onto the Worker you already maintain.
- **Auth is a single personal secret**, not an OAuth dance — removing the per-session sign-in friction that hurts the daily habit (R8). (It's a single-user personal app; a shared secret in the Worker is sufficient and far simpler than Google OAuth.)
- **Export/import stays** (you have it) as the ultimate safety net and the migration bridge.

**Migration bridge from today:** export the current Drive JSON → `migrate()` → import into IndexedDB → first sync seeds D1. The old app keeps working at `/` until V2-of-the-rebuild reaches parity (§6.3). No data is ever stranded.

### 12.2 ICS feeds
Keep the Worker's ICS proxy exactly as designed — it already does 20-minute freshness with 7-day stale-on-error fallback, which is excellent. Work + household calendars remain read-only overlays. No change needed beyond porting.

### 12.3 The honest trade-off (and the fallback)
A Worker + D1 *is* a (tiny) backend, which brushes against "no backend if possible." The blueprint accepts this **only because you already run the Worker** — it is not a new tool, and it is the robust path the prompt invites ("discard Drive for a more robust approach if needed"). If you want to stay literally serverless, the **fallback** is: keep IndexedDB offline-first and **re-use Drive appdata only as a backup/secondary** (manual or periodic full-file export to Drive), accepting that cross-device merge is coarse. **Recommended:** the Worker+D1 path; **acceptable fallback:** IndexedDB + Drive-as-backup. Either way, **IndexedDB-first is the core decision** and the real fix. **Decision: the Worker+D1 path is confirmed.** The Drive-as-backup fallback is retained in this document only as a documented contingency, not the plan.

### 12.4 Cost
GitHub Pages: free. Cloudflare Worker + D1/KV: free tier, ~$0 for single-user volume. Open-Meteo weather: free, no key. ICS: free. **Total infra: effectively $0/year.** AI: see §13 (V1 = $0).

---

## 13. AI Usage Strategy

### 13.1 Doctrine: **AI authors; the app schedules.**
The highest-value, lowest-cost place for AI is **authoring content in Claude/Antigravity**, which you already pay for via subscriptions — at **zero marginal runtime cost** to the app. Runtime model calls inside the app are guilty until proven cheap, rare, and clearly better than manual. In V1 there are **none**.

### 13.2 Where AI is used (authoring-time, $0 runtime)
- Generating/sharpening **Practice decks** and model answers (all tracks) — in Claude.
- Drafting **LinkedIn posts** in your voice — in Claude, on a cadence.
- Producing **certification rankings** and **industry/regulatory briefs** — in Claude, refreshed periodically.
- Building/refactoring the **app itself** — in Antigravity (Phase 2).
This is where ~95% of the AI value lives, and it costs the app nothing.

### 13.3 Where AI is *not* used (explicit no's)
- No per-interaction "AI coach" grading rehearsals (daily → expensive → mediocre vs Claude).
- No in-app post generation (off-voice, costly).
- No chatbot surface.
- No live "always-current" data agents running in-app.

### 13.4 Candidate runtime AI features — evaluated

| Feature | User value | Est. frequency | Token/cost risk | Manual-first? | Version |
|---|---|---|---|---|---|
| **Weekly reading digest** (5 vetted links/topic, paywall pre-check) | Medium-high (solves "what to read next") | **1 batched call/week** | **Low if capped** (single-digit $/yr with a hard monthly cap + max tokens) | **Yes** — manual Intake queue ships first | **V2, flagged** |
| In-app rehearsal grading | Low (Claude does it better) | Daily | **High** (per-interaction) | Yes | **Rejected** |
| In-app post drafting | Low (off-voice) | ~2/week | Medium-high | Yes (draft in Claude) | **Rejected** (use Claude hand-off in V3) |
| "Suggest next action" on projects | Low-medium | Occasional | Low-medium | Yes | V3, optional |
| Auto-tagging/curation of Intake | Low | Per add | Medium | Yes | V3, optional |

**Only one runtime feature survives to even be built (V2, behind a flag): the weekly digest.** It is batched (once/week), bounded (hard monthly token cap enforced in code and *tested* — §14), manual-first (the queue works without it), and individually disableable. Worst-case annual cost is single-digit dollars, satisfying the constraint with margin.

### 13.5 Guardrails (enforced in code + tests)
- A global **feature flag** gates *any* runtime model call; default **off** in V1.
- A **hard monthly cap** (calls + tokens) with a kill-switch; exceeding it disables the feature, never silently spends.
- **Cost-control tests** assert no model call fires on app load or routine use, and that the cap is honored (§14).

---

## 14. QA and Testing Strategy

A real test layer is what makes the partial rebuild safe and lets Antigravity agents edit in parallel without regressions (mitigates R6, R9). Tooling: **Vitest** (unit), **React Testing Library** (component), **Playwright** (e2e, incl. mobile viewports), plus a tiny **cost-guard** test suite. Tests are a V1 deliverable, not an afterthought.

| Test class | What it protects | Concrete cases (examples) | Tool |
|---|---|---|---|
| **Regression** | Ported engines behave as the live app does | Snapshot the composed `todayItems` for a fixed seed + date and assert parity with current output; status/confidence transitions in Practice | Vitest + golden fixtures |
| **Data persistence** | No silent data loss; migrations safe | Write→reload→assert identity across IndexedDB; run `migrate()` on a v23 fixture → assert all keys preserved + v24 additions; optimistic update survives a failed sync | Vitest |
| **Calendar conflict** | Overlap layout + "Right Now" correctness | Two overlapping events → side-by-side column layout; three concurrent now-events → flat equal-weight list; supplement/elsewhere excluded from "now" | RTL |
| **Recurring routine** | Recurrence + overrides + DST | Weekly item resolves on correct Mon-first days; skip-one-occurrence doesn't affect future; move-occurrence affects only that date; **DST boundary** keeps wall-clock start | Vitest |
| **Drag/drop** | Scheduling interactions | Drag todo→timeline creates a TimeBlock at the drop time; drag block across days; resize duration | Playwright |
| **Mobile layout** | iPhone usability | At 390×844: rail collapses to sheet; rehearsal timer + rating reachable one-handed; no horizontal scroll; tap targets ≥44px | Playwright (devices) |
| **Sync** | Per-entity reconciliation, offline | Edit entity offline → reconnect → row syncs; **two-device conflict**: edit different entities on each → both survive; edit same entity → last-write-wins + "updated elsewhere" surfaced | Playwright + mocked Worker |
| **Import/Export** | Portability + backup | Export → reimport into empty store → deep-equal; import a malformed file → rejected with a clear error, store unchanged | Vitest |
| **AI cost-control** | The budget constraint, enforced | **No model call on app load or routine use** (network spy asserts zero calls); weekly-digest **monthly cap** disables the feature when exceeded; feature flag off ⇒ adapter never invoked | Vitest + network spy |
| **User-flow (e2e)** | The journeys actually work | "Open→Today shows now/next"; "rehearse a due card→confidence updates→reschedules"; "run mock→batch ratings persist in one write"; (V2) "add Intake item→opens external→mark done"; (V2) "idea→draft→scheduled→published" | Playwright |

**CI:** run unit+component on every push; e2e + cost-guard on PRs to the migration branch. A green suite is the precondition for cutover (§6.3) and for merging any agent-authored change in Phase 2.

---

## 15. Implementation Roadmap

> **Naming note:** `MASTER.md` defines tooling phases — *MASTER Phase 1* (this blueprint, in Claude) and *MASTER Phase 2* (build, in Antigravity). The build itself is broken into **roadmap phases 0–6** below. Roadmap phases 2–6 execute *inside* MASTER Phase 2 (Antigravity). Phases 0–1 are essentially complete with this document.

### Phase 0 — Audit & Decision  *(status: complete — decisions approved: Option B · IndexedDB-first · Worker + D1 · Drive retired · AI authoring-only)*
- **Objective:** decide build-vs-rebuild and the target architecture.
- **Deliverables:** this blueprint; the **Option B (partial rebuild)** decision; the 20→5 governance map.
- **Risks:** analysis paralysis; over-scoping.
- **Exit criteria:** you accept (a) partial rebuild, (b) the 5-engine model, (c) IndexedDB-first sync, (d) AI-as-authoring-tool. *(This is the decision gate in §17.)*

### Phase 1 — Architecture & Data Model  *(status: ~90% complete here)*
- **Objective:** lock the data contracts and module-system types so agents can build against them.
- **Deliverables:** finalized v24 schema (additive), TypeScript types for every entity in §10, the `Module` registry schema, content-file schemas for Practice/Intake/Create.
- **Risks:** contract churn later; under-specifying the Module type.
- **Exit criteria:** types compile; a v23→v24 `migrate()` passes the persistence tests on your real exported data.

### Phase 2 — Core Planning Engine (substrate rebuild)
- **Objective:** stand up the new substrate and reach Plan-engine parity.
- **Deliverables:** Vite + React + TS shell; ES modules; PWA (manifest + service worker); IndexedDB store + Worker/D1 sync route; ported Plan engine (Today/Week/routine/ICS/Right-Now) + Projects rail; export/import; CI with the regression/persistence/calendar/routine/mobile suites.
- **Risks:** routine/calendar regressions; sync edge cases; PWA caching staleness.
- **Exit criteria:** the new app at `/v2/` matches the live app for Plan + Projects on your real data; installs on iPhone; works offline; green CI.

### Phase 3 — Module System
- **Objective:** make modules data, not code.
- **Deliverables:** the L5 registry; Module dashboard screen; generator-type modules emitting calendar blocks on a cadence; `UserProfile` authored and wired as the north star.
- **Risks:** over-engineering the registry; cadence/calendar coupling bugs.
- **Exit criteria:** adding/changing a module is a data edit (no code); a generator module reliably schedules its blocks; the Module dashboard renders all families.

### Phase 4 — First Career-Move Modules (Practice generalization)
- **Objective:** deliver the daily-use career engine.
- **Deliverables:** **Practice engine generalized** (Interview Prep + Daily Practice Hub merged; `track` tags); existing seeds externalized to content files; seed tracks live: `interview`, `sales`, `clevel`, `execpresence`; rehearsal/mock/story-bank/search/spaced-rep ported; readiness snapshot feeds the Friday review.
- **Risks:** spaced-repetition regressions; content-migration loss; track-filter complexity.
- **Exit criteria:** you rehearse daily on real content across ≥3 tracks; mock-interview batch save is atomic; readiness shows in Review; **cost-guard proves zero runtime model calls**.

### Phase 5 — QA Hardening & Cutover
- **Objective:** make it your daily driver; retire the old app.
- **Deliverables:** full e2e + sync + cost-control suites green; performance pass (cold-boot budget on iPhone); accessibility + reduced-motion checks; **cutover** `/v2/` → `/`.
- **Risks:** cutover data drift; performance gaps on older phones.
- **Exit criteria:** two weeks of daily use without falling back to the old app; data integrity verified; old app archived.

### Phase 6 — Antigravity Execution Streams (parallel V2)
- **Objective:** add the light engines in parallel agent streams.
- **Deliverables:** **Intake engine** (unified `LearningItem` queue + certification view + seeds from `podcasts.opml`); **Create engine** (idea→post pipeline + cadence); expanded Practice tracks (`leadership`,`management`,`industry`,`agentic`,`agentic-cx`); the **weekly-digest** adapter behind a flag + cap + tests.
- **Risks:** scope creep back toward "module per idea"; digest cost; doing this before the job switch is done.
- **Exit criteria:** Intake + Create used weekly; digest (if enabled) stays under cap in a 4-week soak; governance respected (no new native engines).

---

## 16. Antigravity Work Packages

Self-contained packages for Google Antigravity agents. Each can be run (and several parallelized) in Phase 2+. All assume the repo, this blueprint, and your exported data are available.

> **WP-0 — Repo bootstrap & substrate**
> - **Goal:** new Vite + React + TypeScript app with ES modules, replacing runtime Babel; CI scaffold.
> - **Input files:** `index.html` (CSS + script order), all `app-*.js`, `.github/workflows/deploy.yml`, this blueprint §5–§6.
> - **Scope:** init Vite/TS; port CSS; set up module structure (`plan/ calendar/ routine/ projects/ practice/ modules/ storage/ content/ ui/`); configure GitHub Pages deploy from build output at `/v2/`; add Vitest + RTL + Playwright + `vite-plugin-pwa`.
> - **Tests:** build succeeds; `vite preview` boots; placeholder unit test runs in CI.
> - **Artifacts/screenshots:** boot screen at `/v2/`; Lighthouse PWA "installable" check; CI run log.
> - **Definition of done:** app boots from a real build (no in-browser Babel); CI green; installable on iPhone.

> **WP-1 — Data model, migration, IndexedDB store**
> - **Goal:** typed entities (§10), v23→v24 additive `migrate()`, IndexedDB persistence with optimistic writes.
> - **Input files:** `app-data.js` (`SCHEMA_VERSION`, `makeDefaultData`, `migrate`, seeds), §10, your exported Drive JSON.
> - **Scope:** TS types for all entities; port `migrate()`; IndexedDB read/write layer; export/import; load your real exported data.
> - **Tests:** persistence + import/export suites; `migrate()` on a v23 fixture preserves all keys.
> - **Artifacts:** screenshot of the app rendering your real ported data; a migration diff (v23→v24 keys added).
> - **Definition of done:** real data loads, persists across reload, round-trips through export/import; green suite.

> **WP-2 — Sync route on the Cloudflare Worker (+ D1)**
> - **Goal:** per-entity sync endpoint reusing the existing Worker; offline-first reconciliation.
> - **Input files:** `cloudflare-worker.js`, §12.
> - **Scope:** add `/sync` routes (pull/push changed rows by `updatedAt`) backed by D1/KV; shared-secret auth; client-side background syncer with per-entity last-write-wins + "updated elsewhere" surfacing. **Do not** auto-deploy the Worker — output the diff for the user to deploy themselves (security: secrets/permissions are user-performed).
> - **Tests:** sync suite (offline edit reconciles; two-device different-entity edits both survive; same-entity LWW).
> - **Artifacts:** screenshots of two simulated devices converging; network log of a per-entity sync.
> - **Definition of done:** offline edits sync on reconnect; no whole-file overwrite; cost stays on free tier.

> **WP-3 — Plan engine port (Today/Week/routine/ICS)**
> - **Goal:** parity port of the daily/weekly surface.
> - **Input files:** `app-calendar.js`, `app-today.js`, `app-week.js`, `app-routine.js`, `app-helpers.js`, CLAUDE.md layout sections.
> - **Scope:** typed components for CalendarScreen/Today/Week/RoutineItemPopover; keep visual language; keep ICS proxy use.
> - **Tests:** calendar conflict, recurring routine (incl. DST), drag/drop, mobile layout, regression-vs-live snapshot.
> - **Artifacts:** before/after screenshots (current vs `/v2/`) for Today, Week, routine popover, mobile.
> - **Definition of done:** Plan parity on real data; green suites; before/after screenshots attached.

> **WP-4 — Module System (L5) + Module dashboard + UserProfile**
> - **Goal:** modules-as-data registry + governance behavior + north-star config.
> - **Input files:** §5.1–5.2, §7, §8.1; `SEED_PROJECTS`/`modules[]`.
> - **Scope:** `Module` schema + registry; generator-type cadence→calendar blocks; Module dashboard grouped by family; `UserProfile` editor; wire references.
> - **Tests:** module CRUD as data; generator schedules blocks; dashboard renders all families.
> - **Artifacts:** screenshot of Module dashboard; a generator module creating a study block on the calendar.
> - **Definition of done:** changing a module is a data edit; generators schedule reliably.

> **WP-5 — Practice engine generalization (+ content externalization)**
> - **Goal:** merge Interview Prep + Daily Practice Hub into one `track`-driven Practice engine; move seeds to content files.
> - **Input files:** `app-interview.js`, `app-practice.js`, `SEED_INTERVIEW_*`, `practiceContent`, `EXECUTIVE_PRESENCE.docx`, `EXECUTIVE_DRILL_LIBRARY.md`, `60-SECOND_EXECUTIVE_RESET.docx`, §8.3.3.
> - **Scope:** generalize question/answer/rehearsal/mock/story/search to `PracticeItem` + `track`; externalize seeds to JSON/MD; seed tracks `interview/sales/clevel/execpresence`; readiness→Review.
> - **Tests:** spaced-repetition math, batch-mock atomic save, track filtering, search, **cost-guard (zero model calls)**.
> - **Artifacts:** before/after screenshots of Interview Prep → Practice with track tabs; a rehearsal session on real content.
> - **Definition of done:** daily rehearsal across ≥3 tracks; no data loss from the merge; cost-guard green.

> **WP-6 — Intake engine (V2)**
> - **Goal:** unified consume/complete queue + certification view; external deep-links.
> - **Input files:** `podcasts.opml`, §8.3.4, §10 (`LearningItem`).
> - **Scope:** `LearningItem` collection + `kind` filters; time-aware sort; certification attribute sort; "add consume block"; seed sources from OPML; deep-link to Instapaper/Pocket Casts/URL. **No in-app playback.**
> - **Tests:** queue sort/filter, link integrity, cert sorting.
> - **Artifacts:** screenshot of the queue + certification view; an item opening externally.
> - **Definition of done:** you can pick "what next" in one glance; playback stays external.

> **WP-7 — Create pipeline + weekly-digest adapter (V2, flagged)**
> - **Goal:** idea→post pipeline; the single bounded runtime-AI feature, off by default.
> - **Input files:** §8.3.5, §13, §10 (`ContentIdea`,`LinkedInPost`).
> - **Scope:** pipeline board + cadence blocks + "draft in Claude" hand-off + archive; weekly-digest adapter behind a feature flag with a hard monthly token/call cap + kill-switch.
> - **Tests:** pipeline transitions; cadence block creation; **cost-control: cap enforced, flag-off ⇒ no calls**.
> - **Artifacts:** screenshot of the pipeline; a cost-guard test report showing the cap.
> - **Definition of done:** posts move through the pipeline; digest (if enabled) provably stays under cap.

---

## 17. Final Recommendation

### What you should do next (in order)
1. **Decision gate (Phase 0) — done.** You have committed to **partial rebuild (Option B)**, the **5-engine model** (which *preserves every module* — see the engines-vs-modules callout at the top of this document), **IndexedDB-first sync on your existing Cloudflare Worker + D1 (Drive retired)**, and **AI-as-authoring-tool**. Everything downstream builds on this.
2. **Finalize the data contracts (Phase 1):** approve the v24 additive schema and the `Module` registry type in §10 so Antigravity has stable targets.
3. **Run WP-0 → WP-3 first:** substrate + data + sync + Plan-engine parity at `/v2/`, with your real exported data and green CI. This proves the foundation without risking the live app.
4. **Then WP-4 → WP-5:** Module System + the generalized Practice engine — this is the daily-use payoff and the heart of the 20→5 consolidation.
5. **In parallel with using it, author content in Claude:** Practice decks for `sales`/`clevel`/`execpresence`, certification rankings, and your first LinkedIn post ideas. The app is a renderer; the content is the value — and authoring it *is* studying for the job switch.

### What you should not do yet
- **Do not build Intake, Create, or any digest until Plan + Projects + Practice are your daily driver** (Phase 5 cutover done). They are V2 (WP-6/WP-7).
- **Do not add any runtime AI in V1.** Keep the cost-guard green.
- **Do not build a module per `MASTER.md` heading.** When tempted, run the §7 rubric — the answer is almost always "content on an existing engine."
- **Do not rebuild podcast playback or reading.** Pocket Casts and Instapaper stay; the app only queues and links.
- **Do not let the build displace the job switch.** If a week offers a choice between shipping app polish and rehearsing/posting/applying, choose the career action (principle 12, R4).

### The gate decision — made

**Decided and locked:** **Option B (partial rebuild)** · **offline-first IndexedDB as the source of truth** · **per-entity sync on your existing Cloudflare Worker + Cloudflare D1** · **Google Drive whole-file sync retired** · **AI as an authoring tool only ($0 runtime in V1)**. This was the single decision that gated the substrate, the migration shape, and every work package — it is now settled, so Phase 2 (Antigravity) can begin cleanly. The IndexedDB-first + Drive-as-backup serverless fallback (§12.3) is kept on record only as a contingency, not the plan.

> **Bottom line.** You have already built something real and mature — the value is in the content and the domain logic, not the substrate. Keep the value, replace the fragile delivery layer, collapse twenty modules into five engines fed by content you author in Claude, and keep AI out of the runtime so it stays nearly free. Then point all of it, every day, at the only deadline that matters: switching jobs in four months, on the road to VP of AI.

---

### Appendix A — Opinionated decision log (the calls this blueprint makes for you)
*All ten calls below are approved and locked as of Phase 0.*
1. Partial rebuild, not refactor-in-place, not from-scratch. *(§6)*
2. Five engines + content layer + review rhythm; one native engine (Practice). *(§5, §8)*
3. ~20 modules → content/views/generators; never a screen per module. *(§7, §8)*
4. Vite + React + TypeScript + ES modules; kill runtime Babel. *(§5, §6)*
5. Offline-first IndexedDB; per-entity sync on the existing Cloudflare Worker + D1; retire Drive whole-file sync. *(§12)*
6. Real PWA (manifest + service worker); iPhone-equal. *(§5, §11)*
7. AI authors in Claude/Antigravity; $0 runtime in V1; one flagged, capped weekly digest in V2. *(§13)*
8. Tests are a V1 deliverable; cost-guard proves the budget. *(§14)*
9. `UserProfile` is the north star every engine references. *(§5, §10)*
10. Never break the live app: migrate at `/v2/`, cut over only at parity. *(§6.3, §15)*

### Appendix B — Glossary
- **Engine** — a reusable system with its own logic/screens (Plan, Projects, Practice, Intake, Create).
- **Module** — a *configuration record* (L5) declaring how a `MASTER.md` topic shows up (native/light/generator/external).
- **Content layer** — Claude-authored JSON/MD the engines render (Practice decks, Intake seeds, Create themes, Knowledge briefs).
- **Track** — a tag on `PracticeItem` (e.g., `sales`, `clevel`, `execpresence`) that turns "another fluency module" into a filter, not new code.
- **Generator module** — a module whose only behavior is emitting calendar blocks/tasks on a cadence.
- **Strangler migration** — building the new app alongside the old and replacing it engine-by-engine without downtime.

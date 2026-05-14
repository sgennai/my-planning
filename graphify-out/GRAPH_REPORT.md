# Graph Report - my-planning  (2026-05-14)

## Corpus Check
- 10 files · ~40,598 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 124 nodes · 186 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1a861aa1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `startOfDay()` - 11 edges
2. `MY PLANNING` - 10 edges
3. `CalendarScreen()` - 9 edges
4. `formatDateShort()` - 9 edges
5. `AgendaView()` - 8 edges
6. `startOfWeek()` - 7 edges
7. `addDays()` - 7 edges
8. `RightNowBanner()` - 6 edges
9. `isSameDay()` - 6 edges
10. `combinedDayItems()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `FridayReviewLauncher()` --calls--> `startOfWeek()`  [INFERRED]
  app-widgets.js → app-helpers.js
- `CalendarScreen()` --calls--> `useMediaQuery()`  [INFERRED]
  app-calendar.js → app-core.js
- `CalendarScreen()` --calls--> `useTickingClock()`  [INFERRED]
  app-calendar.js → app-core.js
- `AgendaView()` --calls--> `formatDateShort()`  [INFERRED]
  app-routine.js → app-helpers.js
- `RoutineItemPopover()` --calls--> `formatDateShort()`  [INFERRED]
  app-routine.js → app-helpers.js

## Communities (9 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (16): createFile(), downloadFile(), driveFetch(), fetchICS(), findDataFile(), initAuth(), parseICS(), parseICSDate() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.2
Nodes (18): addDays(), applyElsewhereFilter(), blocksForDate(), blocksForWeek(), combinedDayItems(), isSameDay(), layoutDay(), makeCompletionKey() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (12): CATEGORY_OPTIONS, CATEGORY_STYLES, DAY_NAMES_LONG, DAY_NAMES_SHORT, EMOJI_LIBRARY, MODULE_STATUS_STYLE, SEED_PROJECTS, SEED_REFERENCE_LIBRARY (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (7): CalendarScreen(), useMediaQuery(), useTickingClock(), formatDateShort(), formatRange(), CalendarHeader(), WeeklyResetOverlay()

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (7): hexToRgba(), pad(), toMinutes(), RoutineEditForm(), TodayCalendarView(), BlockPopover(), CalItem()

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (4): plannedMinutesForProject(), minutesToHrLabel(), PortfolioPanel(), ProjectCard()

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (10): Architecture, Conventions, Core data shape (schema v16), graphify, MY PLANNING, Pending UX backlog, Project portfolio, Two main views (+2 more)

## Knowledge Gaps
- **24 isolated node(s):** `VISUAL_TO_JS_DAY`, `DAY_NAMES_SHORT`, `DAY_NAMES_LONG`, `CATEGORY_STYLES`, `EMOJI_LIBRARY` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CalendarScreen()` connect `Community 3` to `Community 1`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `formatDateShort()` connect `Community 3` to `Community 0`, `Community 1`, `Community 4`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `startOfDay()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `startOfDay()` (e.g. with `RoutineItemPopover()` and `CalendarScreen()`) actually correct?**
  _`startOfDay()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `CalendarScreen()` (e.g. with `useMediaQuery()` and `useTickingClock()`) actually correct?**
  _`CalendarScreen()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `formatDateShort()` (e.g. with `AgendaView()` and `RoutineItemPopover()`) actually correct?**
  _`formatDateShort()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `AgendaView()` (e.g. with `isSameDay()` and `startOfWeek()`) actually correct?**
  _`AgendaView()` has 7 INFERRED edges - model-reasoned connections that need verification._
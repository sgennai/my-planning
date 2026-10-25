# MY PLANNING — iPad-first Routine dashboard redesign

You are working in my EXISTING My Planning web application codebase. The live app is currently at https://my-planning.pages.dev/. You already have access to the source code and understand its architecture. Your task is to IMPLEMENT a substantial, polished visual and interaction redesign of the app, especially its first tab, **Routine**.

**Important: This is an implementation request, not an invitation to produce another generic mockup or a design proposal.** Inspect the real code first, preserve existing state/data/backend, implement locally, run appropriate tests and give me screenshots of the actual result in iPad landscape and portrait. Ask me before deploying changes to the live production site.

## 1. Inspiration and source of truth

Primary external design inspiration: https://www.instagram.com/reel/De4N3s_zxmB/

This Reel by `code.xr`, titled "Dashboard V18 — Modern & Minimal UI", shows the aesthetic I want: a refined white-and-blue premium dashboard, pearly light-gray background, immaculate softly rounded white panels, nearly black vertical pill navigation, clean typography, thoughtful card geometry, elegant miniature progress visualizations, and fluid transitions. Capture the FEELING and quality of this design; do not copy its cloud-storage content.

I am providing three reference screenshots in the `references/` folder next to this prompt:

1. `01-landscape-minimal.png` — primary reference for landscape palette, complete routine content and restrained white/blue layout. HOWEVER its card icons are still too large and the cards look slightly too repetitive. Improve on it substantially.
2. `02-portrait-compact.png` — PRIMARY reference for portrait layout, compact card scale, typography, density and black floating bottom navigation. This is closest to my desired functional tablet UI. Its activity labels/descriptions are illustrative: see section 3 below for real values.
3. `03-landscape-editorial-inspiration.png` — secondary reference for a more art-directed asymmetric Bento geometry, refined dashboard header and visual richness. **Do NOT reproduce its many large photographs**, made-up doses, exercise durations or descriptions. Use it only as visual inspiration for premium composition.

Priority if references disagree: functional requirements in this prompt > real existing routine data > portrait reference for tile ergonomics > minimal landscape reference for palette > editorial screenshot for visual ambition. A coherent final design is more important than copying screenshots literally.

## 2. Product vision and non-negotiable UX

The iPad is going to become the PRIMARY device for this app, acting as an always-available dashboard in my home office. My old iPad is a 7th-generation iPad. The interface must work beautifully in both orientations and under touch, not merely stretch a desktop page.

The core user experience: I glance at the iPad, immediately see ALL my routine activities for the selected day, see what is done, and spontaneously choose something else to do even if it is optional or untimed. Marking an item completed should take just ONE satisfying tap anywhere on its card.

Mandatory:

- Routine remains the FIRST/main tab. Preserve the other sections and functionality: Plan, Practice, Intake, Create and Setup/Settings. Do not break their routes, data or navigation.
- ALL of the selected day's scheduled daily/weekly items must appear directly on the Routine screen.
- BOTH optional activities **Freediving dry training** and **Read a book** must ALSO always appear directly on the screen, not concealed in a drawer, extra tab, carousel, modal, filter or below an unnecessary marketing/analytics section.
- No `Next up` banner. No giant motivational quote or decoration that displaces activities.
- The full card is the tap target for completion/uncompletion. There must be an explicit, visually clear reversible state.
- No tiny desktop-style checkbox-only interactions. No information-overloaded old-fashioned panels.
- Optional items remain identifiable as `OPTIONAL` in discreet neutral metadata. They do not contribute to the mandatory daily progress denominator.
- Show a compact but attractive scheduled completion indicator: `X of Y` plus a small animated arc/ring. Calculate actual values; never hard-code mockup numbers.
- Do not invent new routines, schedules, doses, rep counts, durations or exercise targets from design-reference images.
- Keep existing persistence and history; no destructive migrations, re-seeding, duplicated routines or loss of previous completions.

## 3. Real routine specification — check against existing application data

The existing data model should be the primary source of truth. If it differs from this latest routine list, report the differences first and make the minimal changes required, without duplicating rows or overwriting history.

EVERY DAY:

- Breakfast stack: probiotics, omega-3, multivitamins, protein — may be one compact grouped tile; breakfast timing.
- Wall sit — while brushing teeth.
- Creatine + Vitamin D — 11:00.
- 2-minute plank — 2 minutes, at an unspecified time.
- 40 air squats — 40 reps, at an unspecified time.
- ChatGPT briefings — read scheduled-task outputs, at an unspecified time.
- Industry articles — read enterprise AI / customer engagement articles, at an unspecified time.
- Podcast — listen to a podcast, at an unspecified time.
- Magnesium — before bed.

ON SELECTED DAYS:

- Mon, Tue, Thu, Fri: 20-minute strength training.
- Wed, Sat: Electrolytes.
- Wed at 12:00: Cycling or rowing.

ALWAYS VISIBLE OPTIONAL ACTIVITIES:

- Freediving dry training.
- Read a book.

Wednesday is an especially important stress test: **11 scheduled tiles + 2 optional tiles = 13 visible activities**. (Breakfast stack is grouped as one tile.) A different scheduled count is valid if the real data model intentionally represents breakfast differently; document the decision and make progress coherent.

Avoid invented content from the concept artwork, such as fixed magnesium doses, wall-sit repetitions, and moving creatine to breakfast. Respect `Europe/Paris` local time, including day rollover and DST.

## 4. Visual design system

Design aesthetic: 2026 high-end SaaS / minimalist lifestyle dashboard; premium modern touch interface, not a conventional to-do list. The overall look should be unmistakably inspired by the linked Dashboard V18 Reel.

- Color: pearl/mist canvas around `#F5F6F8`; clean white card surfaces; near-black/charcoal text around `#111827`; cobalt accent around `#2563EB` used SPARINGLY. Optional cards should not be green or loudly color-coded.
- Typography: one coherent contemporary sans-serif system, restrained weight hierarchy, big enough for iPad glanceability. Do not use large serif headers, overly heavy bold blocks or excessive capitalization.
- Cards: sophisticated 16–22px corners, ultra-subtle hairline borders/shadows, generous but economical padding, small 18–24px refined icons next to content, legible task name and one compact metadata line, clear corner status.
- Bento geometry: intentionally composed, with some width variation where it makes sense, but preserve equal clarity and tappability for ALL activities. Do not create one oversized hero task that crowds out others. Prefer visual rhythm to a monotonous grid.
- Header: compact day/date, subtle `My Planning`, small seven-day navigator and completion visual; it must NOT dominate the viewport. No redundant widgets: a `This week` micro-chart is optional ONLY if it does not push activity tiles off-screen.
- Navigation: landscape = slim floating near-black vertical pill at the left, containing understandable icons for Routine, Plan, Practice, Intake, Create, Setup/Settings; portrait = floating horizontal dark bottom pill. Active tab indicated with a restrained blue accent and/or short label. Respect iPad safe areas. Preserve existing tab semantics.
- Photographs: none in the first implementation. The editorial image is an inspiration for composition, not a request for dozens of image assets. If you propose imagery, show it as a separate optional design variant and keep the default clean.
- No unnecessary gradients, glowing neon, skeuomorphism, large line illustrations, meaningless analytics, giant blank margins, or overly bright tile backgrounds.

Create a small reusable design-token system (colors, spacing, radii, fonts, transition durations) in the existing styling architecture rather than scattering arbitrary values.

## 5. Tablet layouts: real dimensions matter

Target and TEST on iPad 7th generation CSS viewport profiles:

- Landscape: **1024 × 768** CSS pixels.
- Portrait: **768 × 1024** CSS pixels.

Also verify usable content height in Safari and in Add-to-Home-Screen/standalone mode if the app supports it. Respect browser chrome and safe-area insets.

At normal text size and normal zoom, the goal is that **all selected-day cards, including optional cards, are visible without vertical or horizontal scrolling** on both reference orientations. Wednesday (13 cards) is the main test. Achieve this by responsive card geometry, compact header, careful use of width, and appropriately sized icons rather than tiny unreadable text. Portrait should use approximately 2 columns of compact horizontal touch cards; landscape around 4 columns with efficient, subtle Bento variation. Ensure minimum comfortable interactive target size (at least 44×44pt, with cards much larger in practice).

Do not globally disable scrolling or clip content if the user enlarges text, changes accessibility settings or uses a smaller screen. In those cases, allow graceful scrolling rather than hiding activities. At typical iPad size the whole dashboard should be glanceable.

Avoid hover-dependent functionality. Design for finger taps, not a mouse cursor.

## 6. Microinteractions and animation — crucial to this redesign

The Reel's sense of polish and smoothness is as important as its static styling. Implement real, subtle animations, not just CSS color changes:

1. Pressing a tile: tactile compression around `scale(0.98)` for roughly 70–100ms, then spring-like recovery (roughly 160–220ms). Very small movement, no disorienting bounce.
2. Completion: corner status transforms into a blue check with a brief elegant stroke/check animation; card acquires a nearly-white subtle blue tint or edge. Undo reverses it.
3. Progress ring and `X of Y`: smoothly animate to correct values whenever a completion changes; no full-page refresh or jarring counter flicker.
4. Daily navigation: light crossfade or directional transition (roughly 150–220ms) when moving between days. Don't animate dozens of cards long enough to block interaction.
5. Navigation: active indicator glides smoothly between tabs.
6. Optional subtle intro/reveal: a short stagger of card entrances ONLY on initial opening; never delay content visibility or repeat distracting animations throughout the day.
7. Respect `prefers-reduced-motion`, disable/reduce transforms accordingly, keep animations smooth on older iPad hardware (prefer transform/opacity, avoid expensive large backdrop blurs).

Optional detail interactions (like a 2-minute timer or a link to source content) must NOT make the basic completion tap ambiguous. If adding another action, expose a clearly separate secondary control with appropriate semantics.

## 7. Data, logic, and resilience

- Reuse existing persistence, data structures, authenticated state and scheduling logic where possible. Understand them before modifying.
- Completion state is per activity PER CALENDAR DAY; it survives reload, switching tabs, day changes and app restarts. Tapping again must reliably undo.
- Scheduled-day membership must be calculated from real recurrence rules; no mock static arrays in production.
- Optional activity completion can be tracked, but never inflates the scheduled completion percent.
- No double triggering on touch and click; no loading jitter or race conditions if tapped quickly.
- Date, labels and scheduled hours display correctly in the user locale; preserve the existing app's language choice if configured.
- Keep accessibility: correct buttons/ARIA label and pressed state, keyboard focus for Mac users, readable contrast, responsive text, reduced motion.
- Do not add heavyweight UI libraries solely for trivial animation. Prefer existing stack and lightweight well-supported solutions.

## 8. What to implement now

1. Inspect existing codebase, identify Routine page, existing style/navigation components, routine recurrence and completion persistence, and any current tests. Explain any important data-model discrepancy before changing the underlying records.
2. Implement design tokens, reusable tactile routine card, progress widget, responsive top header and dark floating adaptive navigation. Integrate using the real data.
3. Implement polished completion animations, calendar navigation and progress behavior.
4. Apply a cohesive navigation/shell restyling to the other sections only as necessary to avoid an inconsistent overall app, WITHOUT redesigning or breaking their actual content/workflows.
5. Run typechecks/lint/build and relevant existing tests. Add meaningful small tests for recurrence logic, optional exclusion, completing/uncompleting, state persistence and weekday/day boundaries if appropriate.
6. Run the actual application and review screenshots of **Wednesday in landscape 1024×768** and **Wednesday in portrait 768×1024**. Verify every one of 13 activities appears. Also check Monday (strength training present, electrolytes absent) and Sunday (both absent).
7. Fix all clipping, overlapping navigation, inaccessible tap areas, font issues or needless scroll before stopping. Compare your results with the supplied design references and iterate visually rather than accepting the first CSS pass.
8. Summarize changed files, tests, user-visible behavior, design decisions and any tradeoffs. Provide both actual screenshots for my approval. **Do not deploy to the public Cloudflare Pages site until I review and approve.**

## 9. Acceptance criteria / definition of done

I will consider this complete only if:

- It genuinely looks and feels like a premium, modern, minimal dashboard inspired by Dashboard V18 rather than the previous conventional tracker.
- Both iPad orientations have purposeful layouts, not a desktop screenshot squeezed vertically.
- All daily tasks AND all optional tasks are visible directly on the Routine dashboard at normal iPad sizing; especially all 13 on Wednesday.
- Every whole tile is visibly responsive to touch and acts as a reliable reversible completion control.
- The dashboard's actual live completion counts are correct and optional items do not distort the percentage.
- Animations are convincing, restrained, smooth and reduced-motion accessible.
- Navigation, previous records, data persistence, and other app sections continue to work.
- No invented doses, exercise descriptions, scheduled times or fake progress values are introduced by the mockup.
- The final result is demonstrated using screenshots from the running code, not new AI-generated concept art.

Please proceed with implementation. If the existing architecture makes a requirement impossible without a significant rewrite or data risk, stop before that change, explain the specific blocker and propose the smallest safe solution.

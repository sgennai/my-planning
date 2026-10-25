# MY PLANNING — APPROVED CINEMATIC ROUTINE DESIGN

## Status: FINAL VISUAL DIRECTION / IMPLEMENTATION REQUEST

I have now chosen ONE exact visual reference: `reference/APPROVED-cinematic-landscape.png` (1448 × 1086, 4:3 landscape). This is the authoritative approved design. **Reproduce its visual appearance as faithfully as feasible in the actual application.** I specifically like the rich cinematic photographs, the dark navy control-center feel, the luminous blue progress ring, the weekly chart, the separate podcast artwork/player, the compact Bento tile geometry, and the layered depth. Do not reinterpret the design into a minimalist white dashboard or a bland icon grid.

**This brief supersedes ALL previous design prompts and screenshots** (especially the white/blue minimalist / empty white-card variants, and the alternate dark no-photo concept). They are obsolete. Preserve the EXISTING APPLICATION DATA and functionality, but use this one image for the entire visual direction.

Live application: https://my-planning.pages.dev/
Existing sections that must be preserved: Routine (first), Plan, Practice, Intake, Create, Setup.
You already know this codebase. Inspect its actual architecture, data/state management, recurrence rules, styles, components, storage and deployment approach before editing. Do not re-create the app from scratch or destroy data.

This is an implementation request, not just another CSS plan or AI-generated image. Build actual reusable frontend components, capture screenshots of the running app, and visually iterate until the result is very close to the reference.

## 1. Pixel-level art direction: reference is the specification

Keep these specific details from the supplied screenshot:

1. **Dark blue-black immersive backdrop**: almost-black navy background, subtle vignette/depth. Do not use a white/pale-gray page, flat black, gaudy gradients or frosted glass everywhere.
2. **Narrow black left navigation rail**: full-height dark sidebar, refined monochrome icons and subdued labels, electric-blue indication for the selected Routine tab. Keep the ACTUAL tabs Routine, Plan, Practice, Intake, Create, Setup even though the illustrative reference contains other labels.
3. **Compact elegant header**: a large but not excessive selected-day/date title on the left, very small supporting line, a seven-day micro-selector on the right with the active day as a glowing blue circle. The header does not waste vertical space.
4. **Asymmetric Bento overall geometry**: one meaningful, slightly wider column on the left (roughly 26–28% of main content width), then THREE tightly aligned columns of equal-sized activity tiles on the right. Grid fills available space with controlled 10–14px gaps; no large blank cards.
5. **Left upper hero panel**: large richly layered dark-blue daily progress card with dramatic mountains / sky image in its lower part, electric-blue segmented circular progress ring, large `X / Y` count and a small `TODAY COMPLETED` label. An understated motivational line in the concept can be retained only if it does not crowd content, but it must not be a 'Next up' banner.
6. **Weekly graph integrated into the hero**: seven slim, luminous blue gradient bars with weekday labels, tiny Y axis and restrained highlights. The data must come from real stored completion history; no static mock values.
7. **Left lower podcast tile**: a visually rich landscape/artwork card with clear podcast label, a prominent cobalt play/open action and a subtle audio waveform visualization. If no podcast/episode is configured, display a beautifully designed honest placeholder, NOT a fabricated real episode or a fake playback state. This tile itself represents the daily Podcast activity.
8. **Right matrix**: 3 columns × 4 rows on a busy Wednesday, showing TWELVE additional individual task tiles in a full-height structured matrix. Each card has a photographic landscape/subject strip in its upper part with a dark gradient fade to the content at the bottom, a small technical line icon, bold medium-size title, tiny quiet metadata, a status circle at right and discreet ellipsis for genuinely available secondary actions. The design must retain the cinematic photography; do not replace photos with bland generic icons or gradients.
9. **Cards and materials**: consistent roughly 15–18px rounded corners, subtle cool-border outlines and 2-level shadow, near-black navy panels, occasional blue border/tint for completed tasks. No thick lines. Photo treatments should maintain legibility and contrast.
10. **Typography**: contemporary refined sans-serif (for example the app's existing high-quality sans, Inter or Plus Jakarta Sans), nuanced scale, precise alignment and kerning, bright text on dark surfaces. Avoid extremely tiny body text or flamboyant headline fonts.

Approximate tokens (adjust by eye against screenshot, not as rigid pixel values):

- Background: `#081220` / `#0A1424`
- Main tile base: `#101A2C`–`#15233A`
- Dark outlines: `rgba(75,126,208,0.27)`
- Muted text: `#9DB0CA`
- Primary text: `#F5F8FF`
- Electric blue: `#256BFF` / `#2C8CFF`
- Rare mint for weekly data: `#33D5B1`

Use the chosen screenshot as a living visual contract. Do not stop at approximately matching the palette: reproduce density, image placement, card proportions, typographic hierarchy, rhythm, lighting and composition.

## 2. Real content: the screenshot is NOT the database

The image is an AI-generated concept. Several numbers, placeholder podcast titles, descriptions, timings and icons are illustrative or inconsistent. Always use existing actual app data and the following rules as the source of truth. Do not add fake entries or dates to persistence.

Daily base scheduled activity cards:

- Breakfast stack — group Probiotics, Omega 3, Multivitamins, Protein; breakfast.
- Wall sit — while brushing teeth.
- Creatine + Vitamin D — 11:00.
- 2-minute plank — can have a 2-minute timer; otherwise untimed scheduling.
- 40 air squats — 40 reps.
- ChatGPT briefings — read outputs from scheduled tasks.
- Industry articles — Enterprise AI and Customer Engagement.
- Podcast — daily audio consumption.
- Magnesium — before bed.

Additional scheduled cards:

- Monday, Tuesday, Thursday, Friday: 20-minute strength training.
- Wednesday, Saturday: Electrolytes.
- Wednesday at 12:00: Cycling or rowing.

Optional EVERY DAY, including Sundays, and ALWAYS VISIBLE:

- Freediving dry training.
- Read a book.

In the proposed reference layout, on a Wednesday there are 13 visible activities: 11 scheduled + 2 optional. The Podcast activity is represented by the left media card, leaving the other 12 activities in the right 3 × 4 grid. The two optional activities must be visibly labeled OPTIONAL, and excluded from scheduled progress denominator. When schedules yield fewer activities, rearrange/expand tiles artfully while retaining the asymmetrical composition; do not fill with huge empty placeholders.

The mock screenshot's `4 / 11` and weekly bars must be dynamically calculated, not hardcoded. The visual must also remain appealing when the real state is `0 / 9` on Sunday and the user has little or no history.

Do not copy imagery captions or invented specifics such as magnesium doses, strength reps, episode names, playback time or exercise schedules.

## 3. Image asset fidelity — photography is part of the approved design

Preserve the core idea of contextual photographic strips:

- Breakfast: dark, beautifully lit healthy breakfast bowl.
- Wall sit: close-up of legs/body exercising against a wall.
- Creatine+D: low-key macro of softgel/supplements.
- Electrolytes: water glass with subtle reflections.
- Cycling/rowing: exercise bike/rowing machine texture.
- Plank: athlete in plank with cinematic side lighting.
- Squats: workout sneakers / exercise setting.
- ChatGPT briefings: dark workstation/laptop with blue glow (do not present the OpenAI logo as a product endorsement).
- Industry articles: magazines/newspapers/books as editorial visual.
- Magnesium: warm bedside/nighttime visual.
- Freediving dry training: underwater/free-diver imagery used as a thematic illustration, not as an inaccurate exercise demonstration.
- Read a book: warm lamp, open book and coffee.
- Podcast: cinematic night-sky/mountain artwork with compact action/waveform.
- Daily progress: dramatic dark mountain / evening sky texture behind lower ring.

These should be **separate locally stored responsive image assets**, with visual tone and crops closely matching the reference. If your environment has an approved image-asset generation workflow, use it. Otherwise use appropriately licensed imagery with local copies and optimized WebP/AVIF. Do not hotlink random stock URLs at runtime. Do not implement the screenshot as one giant noninteractive background image. Do not silently remove the photographic art direction because source assets take work. If sourcing genuine assets blocks a faithful result, tell me and propose an explicit approval checkpoint.

Use image overlays, `object-fit: cover`, local gradients and crop positioning to match the screenshot while keeping text readable. Compress/preload thoughtfully for iPad 7th generation performance.

## 4. Tactile completion animation — explicitly approved

This interaction should feel premium, responsive and satisfying every time I touch an activity. Entire activity card is tappable, excluding clearly separate real secondary controls.

On successful tap to complete:

1. **Press-in**: card contracts very subtly to approximately `scale(0.975)` for 70–100ms; shadow tightens and the blue edge brightens.
2. **Release**: spring-like recovery to `scale(1)` over roughly 180–220ms. No exaggerated bounce.
3. **Check appears**: the empty outline circle transitions into a vivid cobalt filled disk. A crisp white check is drawn/revealed with a 150–220ms stroke animation. Add a short, delicate blue glow pulse (not confetti).
4. **Card acknowledged**: a translucent cobalt highlight sweeps very gently across its edge or behind the title; photo stays visible and may become a touch softer. No full-tile opaque blue fill.
5. **Progress responds**: daily arc visibly sweeps forward over about 320–450ms while `X / Y` updates without flicker. Weekly current-day bar follows smoothly if its data changes.
6. **Persistence**: store completion to the actual existing state and backend; optimistic update may be used but errors must revert gracefully.

On tapping again to undo: reverse state and progress gracefully; keep it equally quick and unambiguous. Never double-toggle because touch and click both fired. Avoid feedback loops or race conditions during fast repeated touches.

Other motion:

- Changing day: light 150–220ms content transition, respecting actual selection.
- Active sidebar indicator glides subtly rather than abruptly popping.
- Card entry: optional short initial stagger (about 20ms between cards) with no delay to usability; do NOT repeat on every update.
- Respect `prefers-reduced-motion` and keyboard accessibility.
- Optimize for iPad 7th gen; animate mostly transform, opacity and SVG stroke, avoid giant continuous filters/backdrop-blurs.

**Do not implement only an animated checkbox.** The card, the completion symbol and the progress arc must work together as one coherent microinteraction.

## 5. Responsive behavior and real device constraints

Primary target: iPad 7th generation LANDSCAPE, viewport **1024 × 768 CSS pixels**. The reference 1448×1086 has the same 4:3 ratio; use scaled positioning as a starting point, but favor responsive CSS layout over absolute pixels.

Landscape acceptance:

- Narrow left sidebar.
- Left analytical column with large progress+weekly card and podcast card.
- Right three-column/four-row dense image-card matrix on Wednesday.
- All 13 Wednesday items visible without scrolling at normal zoom, including both optional items.
- Touch areas comfortable (entire cards; min 44pt actionable targets), text readable at actual screen size.

Secondary target: iPad PORTRAIT **768 × 1024 CSS pixels**. Create a faithful responsive reinterpretation of the SAME dark cinematic visual system: reduced-height integrated progress+weekly horizontal module, compact 2-column routine tile layout, floating bottom navigation with the original six sections, selective smaller photos. Preserve all activities visible at normal zoom if physically possible without shrinking text below accessible/readable sizes; if there is a true conflict, show the closest legible design and report the exact tradeoff before hiding anything. In accessibility large-text mode allow graceful scrolling, never clip content.

Keep existing functional Mac desktop support. No hover-only actions; support both taps and keyboard.

## 6. Engineering and visual QA process: DO NOT SKIP

### Checkpoint A: Visual reconstruction first

1. Inspect codebase, existing components, data model and navigation.
2. Build the new design in actual DOM/CSS/components using FIXTURE data initially (without touching real persisted records). Integrate local photographs/graphic elements.
3. Render the app at EXACT 1024 × 768 viewport. Save screenshot `cinematic-landscape-actual.png` and visually compare side-by-side to the APPROVED reference. Iterate on spacing, photo crop, colors, depth, type, geometry, progress ring and podcast card until faithful.
4. Render at 768 × 1024 portrait and save `cinematic-portrait-actual.png`. Iterate for sensible density.
5. **Stop and show me both actual running-app screenshots for approval before doing a broad functional refactor or production deployment.** Do not declare design complete with only code diffs or another generated artwork.

### Checkpoint B: Real interactions and data (after I approve visual design)

1. Hook tiles and progress to existing activity data/recurrence, preserving history.
2. Wire touch completion and the microanimations in section 4.
3. Verify `0/9` Sunday, 13-activity Wednesday (11 mandatory, 2 optional), Monday strength training, Wednesday/Saturday electrolytes and Wednesday midday cycling, with correct Europe/Paris dates.
4. Verify reload persistence, undo, offline/reconnect behavior where supported, keyboard/ARIA and reduced motion.
5. Run build/typecheck/lint/tests, review actual iPad screenshots and record a short tap-interaction demo if your tooling supports it.
6. Summarize changed files and unresolved tradeoffs. Request my explicit approval before deployment to Cloudflare Pages.

If incremental implementation is simpler in this codebase, you may wire existing state sooner, but preserve the explicit visual approval checkpoint and never damage persisted data.

## 7. Acceptance criteria

- The running app is unmistakably recognizable as a faithful implementation of `APPROVED-cinematic-landscape.png`, not a generic to-do list with dark colors.
- The cinematic imagery is present, correctly cropped and performance-conscious.
- The blue daily instrument, weekly graph and podcast hero tile are properly implemented as responsive interactive components.
- The correct original navigation sections work.
- All routines are visible as requested, optional cards tracked separately from scheduled progress.
- A single whole-card touch has the approved tactile compression + glowing check + progressive ring animation; undo works.
- Real data only, no fake historical performance, invented supplement instructions, or misleading audio playback.
- Landscape screenshot at 1024×768 is visually compared directly to the reference, then portrait is deliberately adapted.
- No deployment without my approval.

**Your priority is excellent visual craft, not the minimum change necessary to pass compilation.** Do the visual work, show evidence, iterate, and only then call this done.

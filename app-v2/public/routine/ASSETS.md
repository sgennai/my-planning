# Routine photography

Each tile reads `/routine/<key>.webp`. A key only renders as a photograph
once it is listed in `AVAILABLE_PHOTOS` in `src/routine/photo-manifest.ts` —
otherwise the tile falls back to a composed plate, so a missing file never
shows as a broken image.

| key | activity | subject (from the approved reference) |
|---|---|---|
| `breakfast`   | Breakfast stack        | dark, beautifully lit healthy breakfast bowl |
| `wallsit`     | Wall sit               | close-up of legs against a wall |
| `capsule`     | Creatine + Vitamin D   | low-key macro of softgels |
| `electrolyte` | Electrolytes           | water glass with subtle reflections |
| `cycling`     | Cycling or rowing      | exercise bike / rowing machine texture |
| `plank`       | 2-minute plank         | athlete in plank, cinematic side lighting |
| `squats`      | 40 air squats          | workout sneakers / training floor |
| `briefings`   | ChatGPT briefings      | dark workstation with blue glow (no vendor logo) |
| `articles`    | Industry articles      | magazines / newspapers as editorial still |
| `magnesium`   | Magnesium              | warm bedside, night |
| `freediving`  | Freediving dry training| underwater free-diver, thematic |
| `book`        | Read a book            | warm lamp, open book, coffee |
| `podcast`     | Podcast panel          | cinematic night sky over mountains |
| `summit`      | Daily progress hero    | dramatic dark mountain / evening sky |

All fourteen are present — see CREDITS.md for provenance and sizes.

## There is no image generation

The app ships these files and shows nothing else. It never generates an
image, never calls an image API, and never fetches one at runtime — the
picker in Routine settings offers exactly what is in this directory.

An activity with no picture draws a tinted plate carrying its icon, toned
from the icon you chose (see `PLATE_TONES` in `src/routine/photo-manifest.ts`,
with a deterministic hue for anything unlisted). That is a deliberate
fallback, not a placeholder for a missing download.

## Adding or replacing assets

Adding one is a code change, not something that can be done from the iPad:

1. Drop `<key>.webp` in this directory. Target ~1200px on the long edge,
   quality ~72; the largest tile renders at roughly 300×150 CSS px, and the
   hero plate at about 250×270.
2. Add the key to `AVAILABLE_PHOTOS`.
3. Point an activity at it: either set `photo` on the activity (Routine
   settings → Background picture), or add it to `PHOTO_BY_ACTIVITY` to make
   it that activity's default.
4. Keep the total under ~1.5 MB so first paint on an iPad 7th gen stays
   quick (currently ~1.4 MB across fourteen files).

Crops matter more than resolution: each image is `object-fit: cover` behind a
gradient scrim, so the subject needs to sit in the upper-middle of the frame.

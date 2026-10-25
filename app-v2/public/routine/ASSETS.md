# Routine photography

Each tile reads `/routine/<key>.webp`. A key only renders as a photograph
once it is listed in `AVAILABLE_PHOTOS` in `src/routine/ActivityPhoto.tsx` —
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

## Adding assets

1. Drop `<key>.webp` in this directory. Target ~1200px on the long edge,
   quality ~72; the largest tile renders at roughly 300×150 CSS px, and the
   hero plate at about 250×270.
2. Add the key to `AVAILABLE_PHOTOS`.
3. Keep the total under ~1.2 MB so first paint on an iPad 7th gen stays quick.

Crops matter more than resolution: each image is `object-fit: cover` behind a
gradient scrim, so the subject needs to sit in the upper-middle of the frame.

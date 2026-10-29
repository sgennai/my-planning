# Routine photography

Seventy photographs, grouped in the settings picker by what they depict:
Training, Cardio, Mobility & recovery, Food & drink, Mind & focus, Rest &
care, Listening & reading, Places, Work & travel.

Each tile reads `/routine/<key>.webp`; the picker and the settings list read
`/routine/<key>-thumb.webp`. A key renders only once it is listed in
`AVAILABLE_PHOTOS` in `src/routine/photo-manifest.ts` — otherwise the tile
falls back to a composed plate, so a missing file never shows as a broken
image.

See CREDITS.md for every photo id, its size, its exposure correction and its
subject.

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
4. Mind what one day loads: only the photos on that day's tiles are fetched
   at first paint (about 0.9 MB for the seeded routine), then cached. The
   library itself (3.7 MB full size, 0.5 MB of thumbnails) is fetched only as
   thumbnails, when the picker opens. Keep a single file under ~200 KB (the
   largest, `hiking`, is 188 KB).

Crops matter more than resolution: each image is `object-fit: cover` behind a
gradient scrim, so the subject needs to sit in the upper-middle of the frame.

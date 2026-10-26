# Photography provenance

All images are from **Unsplash** and used under the
[Unsplash License](https://unsplash.com/license): free to use for commercial
and non-commercial purposes, no permission needed, attribution not required
(recorded here anyway so the licence position stays auditable).

Fetched from Unsplash's own image CDN as WebP at the sizes below, and stored
locally — nothing is hotlinked at runtime.

Exposure is corrected **at fetch time** by the CDN (`bri`), not by a CSS
filter at render time — fourteen filtered elements would each become their
own compositing layer, which an iPad 7th gen pays for. The fourteen frames
measured between 20 and 162 mean luminance as delivered; the `bri` values
below bring them into a 60–96 band so the photograph reads as texture and
the tile's title stays the loudest thing on it.

| key | photo id | rendered size | bri | subject |
|---|---|---|---|---|
| `breakfast`   | `photo-1516705051158-795390ef6664` | 900×460 | 8 | dark breakfast bowl |
| `wallsit`     | `photo-1614126588542-28cc7131238d` | 900×460 | -16 | seated against a wall |
| `capsule`     | `photo-1565071783280-719b01b29912` | 900×460 | -42 | softgel macro, low key |
| `electrolyte` | `photo-1503536882745-fa1ce53c4928` | 900×460 | -4 | glass of water, reflections |
| `cycling`     | `photo-1591741535018-d042766c62eb` | 900×460 | 3 | exercise bike |
| `plank`       | `photo-1598971457999-ca4ef48a9a71` | 900×460 | -3 | training floor, side light |
| `squats`      | `photo-1591311630200-ffa9120a540f` | 900×460 | -2 | training shoes and weights |
| `briefings`   | `photo-1587318684001-b29074817e81` | 900×460 | 30 | backlit keyboard in the dark |
| `articles`    | `photo-1498644035638-2c3357894b10` | 900×460 | -38 | newspaper, editorial still |
| `magnesium`   | `photo-1552858725-2758b5fb1286`     | 900×460 | 27 | bedroom at night |
| `freediving`  | `photo-1503177847378-d2048487fa46` | 900×460 | -28 | free-diver beneath the surface |
| `book`        | `photo-1730643805910-0bfb8f08072f` | 900×460 | 14 | warm lamp and books |
| `podcast`     | `photo-1485356824219-4bc17c2a2ea7` | 760×430 | 12 | mountain under a night sky |
| `summit`      | `photo-1490838892548-5c0f4b648361` | 700×800 | -4 | mountains at last light |

To view an original: `https://unsplash.com/photos/<photo id without the "photo-" prefix>`.

## Re-fetching

```sh
curl -o public/routine/<key>.webp \
  "https://images.unsplash.com/<photo id>?w=<w>&h=<h>&fit=crop&fm=webp&q=70&bri=<bri>&sat=-8"
```

If you swap an asset, re-measure its mean luminance and pick a `bri` that
lands it near 72 — otherwise one frame will either vanish into the panel or
shout over its own title.

Keep the total under ~1.2 MB so first paint on an iPad 7th gen stays quick
(currently ~1.0 MB across fourteen files).

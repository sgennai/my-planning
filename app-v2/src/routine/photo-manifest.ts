// Which routine photographs are present on disk.
//
// A key only renders as a photograph once it is listed here; otherwise the
// tile falls back to a composed plate, so a missing file never shows as a
// broken image. See public/routine/ASSETS.md.

/** Add a key here when you add `public/routine/<key>.webp`. */
export const AVAILABLE_PHOTOS = new Set<string>([
  // e.g. 'breakfast', 'wall-sit', ...
]);

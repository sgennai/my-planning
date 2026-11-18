// The database holding this device's copy of the Instapaper library. Kept apart from cache.ts so that
// signing out can delete it without loading Intake.
export const INTAKE_CACHE_DB = 'my-planning-intake';
/** The reader's pictures (images.ts): a database of their own, so the library's stays as Phase 1 made it. */
export const INTAKE_IMAGES_DB = 'my-planning-intake-images';

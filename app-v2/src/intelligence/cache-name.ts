// The database holding this device's copy of the briefings. Kept apart from
// library.ts so that signing out can delete it without loading the reader.
export const INTEL_CACHE_DB = 'my-planning-intel';

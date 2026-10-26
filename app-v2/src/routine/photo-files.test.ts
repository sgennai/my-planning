import { describe, it, expect } from 'vitest';
import { AVAILABLE_PHOTOS } from './photo-manifest';

// The manifest is a promise about what is on disk: a declared key with no
// file renders a broken picker cell, and a file no key names is dead weight
// in the bundle. Checked both ways against the real directory.
//
// Globbed through Vite rather than node:fs so the test needs no node types
// in an app tsconfig that deliberately excludes them.
const files = new Set(
  Object.keys(import.meta.glob('../../public/routine/*.webp'))
    .map(p => p.split('/').pop()!),
);

describe('photo files on disk', () => {
  it('finds the photo directory at all', () => {
    expect(files.size).toBeGreaterThan(0);
  });

  it('has a full-size image for every declared key', () => {
    expect([...AVAILABLE_PHOTOS].filter(k => !files.has(`${k}.webp`))).toEqual([]);
  });

  it('has a thumbnail for every declared key', () => {
    expect([...AVAILABLE_PHOTOS].filter(k => !files.has(`${k}-thumb.webp`))).toEqual([]);
  });

  it('ships no image the manifest does not declare', () => {
    const orphans = [...files]
      .map(f => f.replace(/(-thumb)?\.webp$/, ''))
      .filter(k => !AVAILABLE_PHOTOS.has(k));
    expect([...new Set(orphans)]).toEqual([]);
  });
});

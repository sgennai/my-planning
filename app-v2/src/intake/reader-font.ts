// Literata (D6), the reader's typeface, from the app itself rather than Google Fonts: four files (Latin and
// Latin Extended, roman and italic, each with the weight and optical-size axes, as the prototype asked
// Google for) that ship with the app (OFL, fonts/OFL.txt). The first time the reader opens online they are
// fetched from the app's own address and kept in the reader's database (images.ts, `files`), so the reader
// is in Literata offline too, from then on; the service worker isn't involved (it keeps the app's code only).
// Until then, Georgia. Signing out deletes them with the pictures; the next online open fetches them again.
import latinNormal from './fonts/literata-latin-opsz-normal.woff2?url';
import latinItalic from './fonts/literata-latin-opsz-italic.woff2?url';
import extNormal from './fonts/literata-latin-ext-opsz-normal.woff2?url';
import extItalic from './fonts/literata-latin-ext-opsz-italic.woff2?url';
import { keepReaderFile, readerFile } from './images';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const FACES = [
  { name: 'latin-normal', url: latinNormal, style: 'normal', range: LATIN },
  { name: 'latin-italic', url: latinItalic, style: 'italic', range: LATIN },
  { name: 'ext-normal', url: extNormal, style: 'normal', range: LATIN_EXT },
  { name: 'ext-italic', url: extItalic, style: 'italic', range: LATIN_EXT },
];

async function bytesOf(face: (typeof FACES)[number]): Promise<ArrayBuffer | null> {
  // Keyed by its address, which carries the file's hash: a new version of the font replaces the old.
  const key = `font:${face.name}:${face.url}`;
  const kept = await readerFile(key).catch(() => null);
  if (kept) return kept;
  try {
    const res = await fetch(face.url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    await keepReaderFile(key, bytes, `font:${face.name}:`).catch(() => undefined);
    return bytes;
  } catch {
    return null; // offline, never kept: Georgia
  }
}

let ready: Promise<boolean> | null = null;
/** Literata for the reader: true once it is in use. Asked again on the next opening if it couldn't be had. */
export function loadReaderFont(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false);
  ready ??= Promise.all(FACES.map(async face => {
    const bytes = await bytesOf(face);
    if (!bytes) return false;
    try {
      const font = new FontFace('Literata', bytes, { style: face.style, weight: '200 900', unicodeRange: face.range, display: 'swap' });
      await font.load();
      document.fonts.add(font);
      return true;
    } catch {
      return false;
    }
  })).then(faces => {
    if (!faces.some(Boolean)) ready = null;
    return faces.some(Boolean);
  });
  return ready;
}

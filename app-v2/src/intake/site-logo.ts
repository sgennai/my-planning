// A website's logo, found once and kept with it (Intake › Websites). The server reads what the site says about
// itself (/api/websites/meta: its official logo from structured data, its Apple Touch and web app icons, its
// favicons, then the usual addresses, in that order) and fetches only those (/api/websites/icon). Here each
// candidate is decoded off the page, checked, and drawn into a small PNG kept in the website's record:
// - a picture that doesn't decode, is too small, or is blank (nothing on it, or one flat colour) is passed over
//   for the next;
// - the official logo is the one used where it fits: a wordmark (wide) on wide cards, and on square frames when it
//   is about square; elsewhere the first good icon;
// - transparent margins are trimmed, so a mark sits centred; an icon opaque to its edges (an app icon) fills its
//   frame; a light logo gets a dark plate;
// - the card's two colours are taken from the logo when it has a clear one.
// An SVG is only ever decoded as a picture from its bytes and drawn into the PNG: its markup never enters the page.
// Nothing is fetched from the site by the device itself.
import type { LogoImage, LogoKind, WebsiteLogo } from './websites';

export interface IconCandidate { url: string; kind: LogoKind; size: number | null; svg: boolean; guess: boolean; e: number; s: string }
export interface SiteMeta { url: string; name: string | null; description: string | null; icons: IconCandidate[]; read: boolean }
export type LookUp = { ok: true; meta: SiteMeta } | { ok: false; code: string; message: string };

export async function lookUpSite(url: string, signal?: AbortSignal): Promise<LookUp> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, code: 'offline', message: 'You are offline: its logo will be found once you are back online.' };
  try {
    const r = await fetch(`/api/websites/meta?url=${encodeURIComponent(url)}`, { cache: 'no-store', signal });
    const body = await r.json().catch(() => null) as SiteMeta & { error?: { code?: string; message?: string } } | null;
    if (r.ok && body && Array.isArray(body.icons)) return { ok: true, meta: body };
    return { ok: false, code: body?.error?.code ?? `http-${r.status}`, message: body?.error?.message ?? "Couldn't look up that website." };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return { ok: false, code: 'unreachable', message: "Couldn't look up that website." };
  }
}

// ── Reading a picture's pixels (pure, for tests) ───────────────────────────

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface Reading {
  /** Nothing to recognise: empty, or one flat colour. */
  blank: boolean;
  /** The part that shows: transparent margins trimmed, and a white field's when it is drawn on one. */
  box: { x: number; y: number; w: number; h: number };
  /** Opaque to its edges on a coloured field: an app icon (shown whole), or, wide, a banner (never a wordmark). */
  bleed: boolean;
  /** Drawn on an opaque white field (trimmed away in `box`). */
  whiteField: boolean;
  plate: 'light' | 'dark';
  palette: [string, string] | null;
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return `#${hex(f(0) * 255)}${hex(f(8) * 255)}${hex(f(4) * 255)}`;
}
function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function readPixels(p: Pixels): Reading {
  const { width: w, height: h, data } = p;
  let minX = w, minY = h, maxX = -1, maxY = -1, shown = 0, alphaSum = 0, lumSum = 0;
  // The same, for what isn't white: a logo drawn on a white field is trimmed to itself.
  let inkMinX = w, inkMinY = h, inkMaxX = -1, inkMaxY = -1;
  // How it shows on white and on black: a picture shows on one at least; a flat field (or nothing) on neither.
  let mean = 0, m2 = 0, n = 0, meanB = 0, m2B = 0;
  const hues = new Float64Array(24);
  let hueTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      // As it shows on white: the spread of these tells a picture from a flat field.
      const onBlack = lum(data[i], data[i + 1], data[i + 2]) * a, onWhite = onBlack + (1 - a);
      n++;
      const dlt = onWhite - mean; mean += dlt / n; m2 += dlt * (onWhite - mean);
      const dltB = onBlack - meanB; meanB += dltB / n; m2B += dltB * (onBlack - meanB);
      if (a < 0.1) continue;
      shown++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (!(min > 236 && max - min < 14)) { if (x < inkMinX) inkMinX = x; if (x > inkMaxX) inkMaxX = x; if (y < inkMinY) inkMinY = y; if (y > inkMaxY) inkMaxY = y; }
      alphaSum += a;
      lumSum += lum(data[i], data[i + 1], data[i + 2]) * a;
      const [hue, s, l] = hsl(data[i], data[i + 1], data[i + 2]);
      if (s > 0.3 && l > 0.15 && l < 0.85) { const wgt = a * s; hues[Math.floor(hue / 15) % 24] += wgt; hueTotal += wgt; }
    }
  }
  const spread = n > 1 ? Math.max(Math.sqrt(m2 / (n - 1)), Math.sqrt(m2B / (n - 1))) : 0;
  const coverage = shown / Math.max(1, w * h);
  const blank = coverage < 0.01 || spread < 0.02;
  const corner = (x0: number, y0: number, white: boolean) => {
    for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 2; x++) {
      const i = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
      if (data[i + 3] < 230) return false;
      if (white && !(Math.min(data[i], data[i + 1], data[i + 2]) > 236 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 14)) return false;
    }
    return true;
  };
  const corners = (white: boolean) => corner(0, 0, white) && corner(w - 2, 0, white) && corner(0, h - 2, white) && corner(w - 2, h - 2, white);
  const whiteField = !blank && corners(true) && inkMaxX >= 0;
  const bleed = !blank && !whiteField && corners(false);
  const meanLum = alphaSum ? lumSum / alphaSum : 0;
  let palette: [string, string] | null = null;
  if (hueTotal > 0) {
    let best = 0;
    for (let i = 1; i < 24; i++) if (hues[i] > hues[best]) best = i;
    // A clear colour: at least a tenth of what shows, weighed by how saturated it is.
    if (hues[best] / Math.max(1e-9, alphaSum) >= 0.1) {
      const hue = best * 15 + 7.5;
      palette = [hslHex(hue, 0.5, 0.24), hslHex((hue + 28) % 360, 0.55, 0.6)];
    }
  }
  return {
    blank,
    whiteField,
    box: whiteField ? { x: inkMinX, y: inkMinY, w: inkMaxX - inkMinX + 1, h: inkMaxY - inkMinY + 1 }
      : maxX < 0 ? { x: 0, y: 0, w, h } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    bleed,
    // A light logo on nothing needs a dark plate; one drawn on white was made for white.
    plate: !bleed && !whiteField && meanLum > 0.8 ? 'dark' : 'light',
    palette,
  };
}

// ── Decoding and drawing (the browser) ─────────────────────────────────────

const SQUARE_MAX = 128;
const WIDE_MAX_H = 96, WIDE_MAX_W = 384;
const DATA_MAX = 48 * 1024;
const WORK = 256;

/** The size to draw an SVG at: its viewBox or width/height proportions, the longer side 256. */
export function svgSize(text: string): { w: number; h: number } {
  const vb = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(text);
  const wa = /<svg\b[^>]*\swidth\s*=\s*["']?([\d.]+)(?:px)?["'\s>]/i.exec(text);
  const ha = /<svg\b[^>]*\sheight\s*=\s*["']?([\d.]+)(?:px)?["'\s>]/i.exec(text);
  const w = Number(vb?.[1] ?? wa?.[1]) || 1, h = Number(vb?.[2] ?? ha?.[1]) || 1;
  const r = Math.max(0.1, Math.min(10, w / h));
  return r >= 1 ? { w: WORK, h: Math.max(1, Math.round(WORK / r)) } : { w: Math.max(1, Math.round(WORK * r)), h: WORK };
}

async function decode(blob: Blob, svgText: string | null): Promise<{ img: HTMLImageElement; w: number; h: number; done: () => void } | null> {
  const typed = svgText !== null ? new Blob([svgText], { type: 'image/svg+xml' }) : blob;
  const url = URL.createObjectURL(typed);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  const size = svgText !== null ? svgSize(svgText) : { w: img.naturalWidth, h: img.naturalHeight };
  return { img, w: size.w, h: size.h, done: () => URL.revokeObjectURL(url) };
}

function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: true });
}

interface Drawn { reading: Reading; natural: { w: number; h: number }; source: CanvasRenderingContext2D }
/** The picture drawn at working size (never enlarged past 256 on its longer side), and read. Null if it can't be read. */
async function draw(blob: Blob, svg: boolean): Promise<Drawn | null> {
  const svgText = svg ? await blob.text() : null;
  const d = await decode(blob, svgText);
  if (!d) return null;
  try {
    if (d.w < 16 && d.h < 16) return null;
    const k = Math.min(1, WORK / Math.max(d.w, d.h));
    const w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    const ctx = canvas(w, h);
    if (!ctx) return null;
    ctx.drawImage(d.img, 0, 0, w, h);
    let pixels: ImageData;
    try { pixels = ctx.getImageData(0, 0, w, h); } catch { return null; } // a canvas the browser won't read
    return { reading: readPixels(pixels), natural: { w: d.w, h: d.h }, source: ctx };
  } finally {
    d.done();
  }
}

/**
 * The shown part, with a little room round it, as a PNG within the given bounds; smaller if it would be too heavy.
 * `whole`: the picture as it is, its white field kept (an icon whose mark alone is too wide for a square frame).
 */
function output(d: Drawn, maxW: number, maxH: number, kind: LogoKind, src: string, whole = false): LogoImage | null {
  const { box, plate } = d.reading;
  const bleed = d.reading.bleed || whole;
  const pad = bleed ? 0 : Math.round(Math.max(box.w, box.h) * 0.04);
  const sx = bleed ? 0 : Math.max(0, box.x - pad), sy = bleed ? 0 : Math.max(0, box.y - pad);
  const sw = bleed ? d.source.canvas.width : Math.min(d.source.canvas.width - sx, box.w + 2 * pad);
  const sh = bleed ? d.source.canvas.height : Math.min(d.source.canvas.height - sy, box.h + 2 * pad);
  for (let k = Math.min(1, maxW / sw, maxH / sh); k > 0.2; k *= 0.75) {
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const ctx = canvas(w, h);
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(d.source.canvas, sx, sy, sw, sh, 0, 0, w, h);
    const data = ctx.canvas.toDataURL('image/png');
    if (data.length <= DATA_MAX) return { data, w, h, kind, src, bleed, plate };
  }
  return null;
}

async function fetchIcon(c: IconCandidate, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const r = await fetch(`/api/websites/icon?url=${encodeURIComponent(c.url)}&e=${c.e}&s=${encodeURIComponent(c.s)}`, { cache: 'no-store', signal });
    if (!r.ok) return null;
    return await r.blob();
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return null;
  }
}

const aspectOf = (r: Reading) => r.box.w / Math.max(1, r.box.h);

/**
 * The logo from a look-up's candidates, tried in order: the first good square picture, and the official logo as
 * a wordmark when it is wide. At most eight fetches. A site with none gets a logo record with neither, so it isn't
 * looked up again until asked.
 */
export async function resolveLogo(meta: SiteMeta, signal?: AbortSignal, now = new Date()): Promise<WebsiteLogo> {
  let square: LogoImage | null = null;
  let wide: LogoImage | null = null;
  let palette: [string, string] | null = null;
  let smallSquare: { d: Drawn; c: IconCandidate; whole: boolean } | null = null;
  // The official logos come first: each is tried, as a wordmark or as a square; after them, icons until a square is found.
  for (const c of meta.icons.slice(0, 8)) {
    if (square && c.kind !== 'logo') break;
    const blob = await fetchIcon(c, signal);
    if (!blob) continue;
    const d = await draw(blob, c.svg || blob.type === 'image/svg+xml').catch(() => null);
    if (!d || d.reading.blank) continue;
    const r = aspectOf(d.reading);
    // A wordmark is drawn on nothing, or on white: a wide picture on a coloured field is a banner, not a logo.
    if (c.kind === 'logo' && !wide && r >= 1.6 && r <= 10 && !d.reading.bleed) {
      wide = output(d, WIDE_MAX_W, WIDE_MAX_H, c.kind, c.url);
      palette ??= d.reading.palette;
      continue;
    }
    // About square once trimmed; or, drawn on white, about square as a whole (a wordmark on a white app icon).
    const fits = r >= 0.5 && r <= 2;
    const whole = !fits && d.reading.whiteField && d.natural.w / d.natural.h >= 0.5 && d.natural.w / d.natural.h <= 2;
    if (!square && (fits || whole)) {
      // A picture smaller than 32 pixels is kept in case nothing better comes.
      if (Math.max(d.natural.w, d.natural.h) < 32) { smallSquare ??= { d, c, whole }; continue; }
      square = output(d, SQUARE_MAX, SQUARE_MAX, c.kind, c.url, whole);
      palette ??= d.reading.palette;
    }
  }
  if (!square && smallSquare) {
    square = output(smallSquare.d, SQUARE_MAX, SQUARE_MAX, smallSquare.c.kind, smallSquare.c.url, smallSquare.whole);
    palette ??= smallSquare.d.reading.palette;
  }
  return { square, wide, palette, checkedAt: now.toISOString() };
}

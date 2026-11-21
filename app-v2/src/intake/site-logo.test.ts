// A website's logo as the device reads it: what is blank, what is trimmed, which plate, which colours.
import { describe, it, expect } from 'vitest';
import { readPixels, svgSize, hslHex, type Pixels } from './site-logo';

/** A w×h picture painted by `at(x, y)` → [r, g, b, a]. */
const picture = (w: number, h: number, at: (x: number, y: number) => [number, number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(at(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};
const clear: [number, number, number, number] = [0, 0, 0, 0];

describe('reading a logo', () => {
  it('nothing on it, or one flat colour, is blank', () => {
    expect(readPixels(picture(32, 32, () => clear)).blank).toBe(true);
    expect(readPixels(picture(32, 32, () => [255, 255, 255, 255])).blank).toBe(true);
    expect(readPixels(picture(32, 32, () => [37, 99, 235, 255])).blank).toBe(true);
  });

  it('a dark mark on transparency: trimmed to the mark, on a light plate, not an app icon', () => {
    const r = readPixels(picture(64, 64, (x, y) => (x >= 20 && x < 44 && y >= 16 && y < 48 ? [20, 20, 30, 255] : clear)));
    expect(r).toMatchObject({ blank: false, bleed: false, plate: 'light', box: { x: 20, y: 16, w: 24, h: 32 } });
  });

  it('a white logo on transparency is no blank: it gets a dark plate, so it shows', () => {
    const r = readPixels(picture(64, 64, (x, y) => (x > 8 && x < 56 && y > 24 && y < 40 ? [250, 250, 250, 255] : clear)));
    expect(r.blank).toBe(false);
    expect(r.plate).toBe('dark');
  });

  it('opaque to its corners: an app icon, shown whole', () => {
    const r = readPixels(picture(60, 60, (x, y) => (x > 20 && x < 40 && y > 20 && y < 40 ? [255, 255, 255, 255] : [204, 20, 40, 255])));
    expect(r.bleed).toBe(true);
    expect(r.box).toEqual({ x: 0, y: 0, w: 60, h: 60 });
  });

  it('a logo on an opaque white field is trimmed to itself, and shown on a plate, not as an app icon', () => {
    const r = readPixels(picture(120, 60, (x, y) => (x >= 30 && x < 90 && y >= 20 && y < 40 ? [0, 160, 220, 255] : [255, 255, 255, 255])));
    expect(r).toMatchObject({ bleed: false, whiteField: true, plate: 'light', box: { x: 30, y: 20, w: 60, h: 20 } });
  });

  it('the card colours from a clear brand colour; none from black and white', () => {
    const red = readPixels(picture(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [220, 30, 40, 255] : clear)));
    expect(red.palette).not.toBeNull();
    const mono = readPixels(picture(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [0, 0, 0, 255] : [255, 255, 255, 255])));
    expect(mono.palette).toBeNull();
  });

  it('a wordmark keeps its proportions when trimmed', () => {
    const r = readPixels(picture(200, 100, (x, y) => (x >= 10 && x < 190 && y >= 40 && y < 60 ? [10, 10, 10, 255] : clear)));
    expect(r.box.w / r.box.h).toBe(9);
  });

  it('an SVG is drawn at its own proportions, the longer side 256', () => {
    expect(svgSize('<svg viewBox="0 0 120 30">')).toEqual({ w: 256, h: 64 });
    expect(svgSize('<svg width="32" height="64">')).toEqual({ w: 128, h: 256 });
    expect(svgSize('<svg>')).toEqual({ w: 256, h: 256 });
  });

  it('colours as hex', () => {
    expect(hslHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslHex(240, 1, 0.5)).toBe('#0000ff');
  });
});

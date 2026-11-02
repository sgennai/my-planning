// @vitest-environment jsdom
// The iPad's Text Size setting: Safari gives it as the system's body text
// style, 17px at the usual size. Only a touch device follows it (a Mac's body
// style is something else), and only between 0.8 and twice the usual size.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { textScale } from './useTextScale';

const device = (touch: number, bodyPx: string) => {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });
  vi.stubGlobal('CSS', { supports: (p: string, v: string) => p === 'font' && v === '-apple-system-body' });
  const real = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(el =>
    ((el as HTMLElement).style.font === '-apple-system-body' || (el as HTMLElement).style.position === 'absolute'
      ? { fontSize: bodyPx } as CSSStyleDeclaration : real(el)));
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('text size', () => {
  it('follows the setting on an iPad', () => {
    device(5, '17px');
    expect(textScale()).toBe(1);
    device(5, '23px');
    expect(textScale()).toBe(1.35);
  });

  it('no further than twice the usual size, nor below 0.8', () => {
    device(5, '53px');
    expect(textScale()).toBe(2);
    device(5, '12px');
    expect(textScale()).toBe(0.8);
  });

  it('is the usual size on a Mac, whatever its body style', () => {
    device(0, '13px');
    expect(textScale()).toBe(1);
  });
});

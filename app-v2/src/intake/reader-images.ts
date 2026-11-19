// The article's pictures, loaded by the reader as they come near the screen (never all at once): the
// device's copy, else through the app's server with the signature it gave (images.ts), else, online, from
// the publisher directly as the library's thumbnails are. One that can't be shown says so, its description
// kept.
//
// A picture must never move the words you are reading. One whose size is known (noted the last time it was
// shown) holds its space from the start. Any other is decoded off the page first, so its size is known; then
// its size and source are set in one step, inside `steady`, which puts your place back in the same frame:
// the block at the reading line where it was on the screen (scrolling by exactly what the picture added above
// it), or as far through it as you were when the picture is in that very block. The same for a picture that
// turns out to be missing. A picture above the screen waits, while you are scrolling, for a pause (or until
// it is about to come into view): moving the scroll position in the middle of a flick would cut it short.
// Nothing here writes your place: only your own scrolling does.
//
// A picture is never cropped (2.1): it keeps its own shape, no wider than the text and no taller than about a
// screen (its width from its proportions, `--ikr-r`, in the stylesheet). A tall one gets "View full size"
// under it, outside the article's blocks so their words (and your place's fingerprint) are unchanged; any
// picture shown smaller than itself opens full size on a tap (`PictureViewer`).
import { useEffect, type RefObject } from 'react';
import { imageFor, imageSizes, isInline, noteImageSize, type Missing } from './images';

/**
 * The start of the next frame, before it is drawn. A decoded picture is put in the page then: WebKit can finish
 * a decode while it is delivering size notices (the reader's ResizeObserver), and a picture placed at that
 * moment is a change it reports as a "ResizeObserver loop" error.
 */
export const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** A picture at least this much taller than wide, and this tall, is shown smaller than itself on most screens. */
export const isTall = (w: number, h: number) => h >= 1.2 * w && h >= 600;
/** The expand icon, in the reader's icon family (ReaderParts.tsx). */
export const EXPAND_PATH = 'M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5';
const wholeOf = new WeakMap<HTMLImageElement, HTMLButtonElement>();
const pictures = new WeakMap<Element, HTMLImageElement>();
/** The picture a "View full size" button shows. */
export const pictureOf = (button: Element): HTMLImageElement | null =>
  pictures.get(button) ?? (button.previousElementSibling instanceof HTMLImageElement ? button.previousElementSibling : null);

/** Sizes a picture's box by its own proportions, so the stylesheet can keep it within a screen without cropping. */
function size(img: HTMLImageElement, w: number, h: number) {
  img.width = w;
  img.height = h;
  img.style.setProperty('--ikr-r', String(+(w / h).toFixed(4)));
}

/** "View full size" under a tall picture: after the outermost block holding it, never inside one, nor in a link. */
function addWhole(img: HTMLImageElement) {
  if (wholeOf.has(img) || img.closest('a')) return;
  let after: Element = img.closest('[data-b]') ?? img;
  for (let up = after.parentElement?.closest('[data-b]'); up; up = up.parentElement?.closest('[data-b]')) after = up;
  const doc = img.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ikr-whole';
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', EXPAND_PATH);
  svg.append(path);
  button.append(svg, 'View full size');
  after.after(button);
  wholeOf.set(img, button);
  pictures.set(button, img);
}

const NEAR = '1500px 0px';
/** Scrolling has paused after this long without a scroll. */
const PAUSE_MS = 150;
/** A picture this close above the screen is placed even mid-scroll. */
const ABOUT_TO_SHOW = 200;

export interface PictureHooks {
  /** The server's signature for an address, if it gave one (an older body may be getting them). */
  sigOf: (url: string) => Promise<string | null>;
  /** Makes a change to the page without moving the words at the reading line. */
  steady: (change: () => void) => void;
}

function missing(img: HTMLImageElement, why: Missing) {
  if (img.nextElementSibling?.classList.contains('ikr-img-missing')) return;
  const note = img.ownerDocument.createElement('span');
  note.className = 'ikr-img-missing';
  const alt = img.getAttribute('alt')?.trim();
  note.textContent = `${why === 'offline' ? 'Picture not on this device' : 'Picture unavailable'}${alt ? `: ${alt}` : ''}`;
  img.hidden = true;
  img.after(note);
  wholeOf.get(img)?.remove();
}

/**
 * `keptBy`: the article's id while it is kept offline, so its pictures are held for it (read when each
 * loads: Keep offline doesn't redraw them). `key` changes when the article's HTML is drawn again.
 */
export function useArticleImages(body: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>, key: string, keptBy: RefObject<number | undefined>, hooks: RefObject<PictureHooks>) {
  useEffect(() => {
    const root = body.current, sc = scroller.current;
    if (!root) return;
    const imgs = [...root.querySelectorAll<HTMLImageElement>('img[data-src]')];
    if (!imgs.length) return;
    let alive = true;
    const made: string[] = [];
    const steady = (change: () => void) => hooks.current.steady(change);
    let scrolledAt = 0;
    const onScroll = () => { scrolledAt = Date.now(); };
    sc?.addEventListener('scroll', onScroll, { passive: true });
    /** Resolves at once, unless the picture is above the screen while you scroll: then at a pause, or as it nears. */
    const settled = (img: HTMLElement) => new Promise<void>(resolve => {
      const check = () => {
        const top = sc?.getBoundingClientRect().top ?? 0;
        if (!alive || Date.now() - scrolledAt >= PAUSE_MS || img.getBoundingClientRect().bottom > top - ABOUT_TO_SHOW) resolve();
        else setTimeout(check, 50);
      };
      check();
    });

    void imageSizes(imgs.map(i => i.dataset.src!)).catch(() => new Map<string, [number, number]>()).then(sizes => {
      if (!alive || !sizes.size) return;
      steady(() => {
        for (const img of imgs) {
          const s = sizes.get(img.dataset.src!);
          if (s && !img.getAttribute('src') && !img.hasAttribute('width')) size(img, s[0], s[1]);
        }
      });
    });

    /**
     * Decoded first (off the page), then sized and shown in one step. A decode that fails doesn't decide:
     * the picture is placed without its size and only an error of its own says it is missing (a browser
     * can refuse the copy off the page and still show it, as WebKit's offline switch does with blob: copies).
     */
    const place = async (img: HTMLImageElement, src: string, url: string, direct: boolean) => {
      const probe = new Image();
      if (direct) probe.referrerPolicy = 'no-referrer';
      probe.src = url;
      await probe.decode().catch(() => undefined);
      if (!alive) return;
      await settled(img);
      if (!alive) return;
      await nextFrame();
      if (!alive) return;
      const w = probe.naturalWidth, h = probe.naturalHeight;
      img.addEventListener('error', () => steady(() => missing(img, 'blocked')), { once: true });
      steady(() => {
        if (w && h) size(img, w, h);
        if (direct) img.referrerPolicy = 'no-referrer';
        img.src = url;
        if (w && h && isTall(w, h)) addWhole(img);
      });
      if (w && h && !isInline(src)) void noteImageSize(src, w, h).catch(() => undefined);
    };

    const show = async (img: HTMLImageElement) => {
      const src = img.dataset.src!;
      img.decoding = 'async';
      if (isInline(src)) return place(img, src, src, false);
      const r = await imageFor(src, { keptBy: keptBy.current, sig: await hooks.current.sigOf(src) });
      if (!alive) return;
      if ('blob' in r) {
        const url = URL.createObjectURL(r.blob);
        made.push(url);
        await place(img, src, url, false);
      } else if (r.missing !== 'offline' && navigator.onLine !== false) {
        // Not through the server (no signature, refused, or no room to keep it): the browser may still show it.
        await place(img, src, src, true);
      } else {
        await settled(img);
        if (alive) steady(() => missing(img, r.missing));
      }
    };

    const near = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        near.unobserve(e.target);
        void show(e.target as HTMLImageElement);
      }
    }, { root: sc, rootMargin: NEAR });
    imgs.forEach(i => near.observe(i));
    return () => {
      alive = false;
      sc?.removeEventListener('scroll', onScroll);
      near.disconnect();
      made.forEach(u => URL.revokeObjectURL(u));
    };
  }, [body, scroller, key, keptBy, hooks]); // keptBy and hooks are refs
}

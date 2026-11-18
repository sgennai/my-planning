// The article's pictures, loaded by the reader as they come near the screen (never all at once): the
// device's copy, else through the app's server (images.ts), else, online, from the publisher directly as
// the library's thumbnails are. A picture with a known size holds its space before it loads, so the text
// doesn't jump. One that can't be shown says so, its description kept.
import { useEffect, type RefObject } from 'react';
import { imageFor, imageSizes, isInline, noteImageSize } from './images';

const NEAR = '1500px 0px';

function missing(img: HTMLImageElement, why: 'offline' | 'blocked' | 'full') {
  if (img.nextElementSibling?.classList.contains('ikr-img-missing')) return;
  const note = img.ownerDocument.createElement('span');
  note.className = 'ikr-img-missing';
  const alt = img.getAttribute('alt')?.trim();
  note.textContent = `${why === 'offline' ? 'Picture not on this device' : 'Picture unavailable'}${alt ? `: ${alt}` : ''}`;
  img.hidden = true;
  img.after(note);
}

/**
 * `keptBy`: the article's id while it is kept offline, so its pictures are held for it (read when each
 * loads: Keep offline doesn't redraw them). `key` changes when the article's HTML is drawn again.
 */
export function useArticleImages(body: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>, key: string, keptBy: RefObject<number | undefined>) {
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const imgs = [...root.querySelectorAll<HTMLImageElement>('img[data-src]')];
    if (!imgs.length) return;
    let alive = true;
    const made: string[] = [];

    void imageSizes(imgs.map(i => i.dataset.src!)).catch(() => new Map<string, [number, number]>()).then(sizes => {
      if (!alive) return;
      for (const img of imgs) {
        const s = sizes.get(img.dataset.src!);
        if (s && !img.hasAttribute('width')) { img.width = s[0]; img.height = s[1]; }
      }
    });

    const show = async (img: HTMLImageElement) => {
      const src = img.dataset.src!;
      img.decoding = 'async';
      if (isInline(src)) { img.src = src; return; }
      const r = await imageFor(src, keptBy.current);
      if (!alive) return;
      if ('blob' in r) {
        const url = URL.createObjectURL(r.blob);
        made.push(url);
        img.addEventListener('load', () => { if (img.naturalWidth) void noteImageSize(src, img.naturalWidth, img.naturalHeight); }, { once: true });
        img.addEventListener('error', () => missing(img, 'blocked'), { once: true });
        img.src = url;
      } else if (r.missing !== 'offline' && navigator.onLine !== false) {
        // The server couldn't fetch it (or there is no room to keep it): the browser may still show it.
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => missing(img, r.missing), { once: true });
        img.src = src;
      } else missing(img, r.missing);
    };

    const near = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        near.unobserve(e.target);
        void show(e.target as HTMLImageElement);
      }
    }, { root: scroller.current, rootMargin: NEAR });
    imgs.forEach(i => near.observe(i));
    return () => {
      alive = false;
      near.disconnect();
      made.forEach(u => URL.revokeObjectURL(u));
    };
  }, [body, scroller, key, keptBy]); // keptBy is a ref
}

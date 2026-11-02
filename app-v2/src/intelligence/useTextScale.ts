// The iPad's (or iPhone's) Text Size setting, as a multiple of the usual
// size, for the section's text to follow (`--intel-scale` in
// intelligence.css). Safari hands a page that setting only through the
// system's text styles, whose body style is 17px at the usual size. A Mac's
// body style is not that setting (13px whatever the size), so only a touch
// device follows it; on a Mac the browser's zoom does the job. Read again on
// coming back to the app, as after changing it in Settings.
import { useEffect, useState } from 'react';

const USUAL = 17;
const SMALLEST = 0.8;
/** Twice the usual size at most: the layout holds up to there. */
const LARGEST = 2;

export function textScale(): number {
  if (typeof document === 'undefined' || !navigator.maxTouchPoints || !CSS?.supports?.('font', '-apple-system-body')) return 1;
  const probe = document.createElement('span');
  probe.style.font = '-apple-system-body';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!px) return 1;
  return Math.min(LARGEST, Math.max(SMALLEST, Math.round((px / USUAL) * 100) / 100));
}

export function useTextScale(): number {
  const [scale, setScale] = useState(textScale);
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') setScale(textScale()); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, []);
  return scale;
}

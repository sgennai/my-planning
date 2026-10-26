// The photographic layer of a routine tile.
//
// Each activity names an image key; the asset itself lives at
// `public/routine/<key>.webp` and is referenced by URL so the browser
// decodes it off the main thread and caches it. Nothing is hotlinked.
//
// Until an asset is present the tile renders a composed plate — a lit
// gradient in the activity's own tone carrying its line mark — rather than a
// broken image or an empty box. See ASSETS.md for the sourcing checkpoint.
import { useState } from 'react';
import { ActivityIcon } from './activity-icons';
import { AVAILABLE_PHOTOS } from './photo-manifest';


/** Per-activity plate tones, so the fallback field is varied rather than flat. */
const PLATE_TONES: Record<string, [string, string, string]> = {
  breakfast:   ['#2A3A52', '#141F33', 'rgba(150,130,90,.34)'],
  wallsit:     ['#1E3350', '#101D33', 'rgba(70,120,200,.34)'],
  capsule:     ['#2B3350', '#141B30', 'rgba(190,160,90,.30)'],
  electrolyte: ['#1B3A55', '#0F2236', 'rgba(80,160,210,.36)'],
  cycling:     ['#243348', '#121D30', 'rgba(90,130,190,.30)'],
  plank:       ['#2A3148', '#15192C', 'rgba(120,140,200,.28)'],
  squats:      ['#222E44', '#11182A', 'rgba(100,125,175,.28)'],
  briefings:   ['#13304F', '#0B1B30', 'rgba(50,140,230,.42)'],
  articles:    ['#2C3447', '#161B2A', 'rgba(170,175,195,.26)'],
  magnesium:   ['#332A3F', '#1A1626', 'rgba(210,150,90,.30)'],
  freediving:  ['#12405E', '#09243C', 'rgba(60,170,220,.44)'],
  book:        ['#3A2F3C', '#1D1724', 'rgba(220,160,80,.32)'],
  podcast:     ['#1C3350', '#0C1B30', 'rgba(70,140,220,.38)'],
  summit:      ['#1A2E52', '#0C1A31', 'rgba(80,130,210,.40)'],
};

interface Props {
  /** Image key; also selects the plate tone. */
  name?: string;
  /** Icon to show on the plate when no photograph is present. */
  icon?: string;
  /** Alt text. Decorative plates are hidden from assistive tech instead. */
  alt?: string;
  className?: string;
}

export function ActivityPhoto({ name, icon, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  const has = !!name && AVAILABLE_PHOTOS.has(name) && !failed;

  if (has) {
    return (
      <div className={className}>
        <img
          src={`/routine/${name}.webp`}
          alt={alt || ''}
          /* Every tile for the day is above the fold, so deferring these
             only buys pop-in. ~1 MB across fourteen files, decoded off the
             main thread. */
          loading="eager"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const [a, b, lit] = PLATE_TONES[name || ''] || PLATE_TONES.summit;
  return (
    <div className={className}>
      <div
        className="cin-plate"
        aria-hidden
        style={{ '--plate-a': a, '--plate-b': b, '--plate-lit': lit } as React.CSSProperties}
      >
        <ActivityIcon name={icon} />
      </div>
    </div>
  );
}

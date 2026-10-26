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
import { AVAILABLE_PHOTOS, PLATE_TONES, derivedTone } from './photo-manifest';


interface Props {
  /** Image key; also selects the plate tone. */
  name?: string;
  /** Icon to show on the plate when no photograph is present. */
  icon?: string;
  /** Used when `icon` names a mark that no longer exists. */
  iconFallback?: string;
  /** Alt text. Decorative plates are hidden from assistive tech instead. */
  alt?: string;
  /** Load the small variant — for grids of many images at thumbnail size. */
  thumb?: boolean;
  className?: string;
}

export function ActivityPhoto({ name, icon, iconFallback, alt, thumb, className }: Props) {
  const [failed, setFailed] = useState(false);
  const has = !!name && AVAILABLE_PHOTOS.has(name) && !failed;

  if (has) {
    return (
      <div className={className}>
        <img
          src={`/routine/${name}${thumb ? '-thumb' : ''}.webp`}
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

  // Photo tone first, then the chosen icon's, then one derived from
  // whichever key we have — never a shared default.
  const toneKey = name || icon || iconFallback || '';
  const [a, b, lit] = PLATE_TONES[toneKey] || derivedTone(toneKey || 'activity');
  return (
    <div className={className}>
      <div
        className="cin-plate"
        aria-hidden
        style={{ '--plate-a': a, '--plate-b': b, '--plate-lit': lit } as React.CSSProperties}
      >
        <ActivityIcon name={icon} fallback={iconFallback} />
      </div>
    </div>
  );
}

// Intake (Intake 2.0): what to read, watch and listen to, in four places, of which Articles is built.
// Articles is your Instapaper library (useArticles), browsed as a list or a bento grid. The section takes
// the Jour & verre look of Intelligence (styles/intake.css), light in both themes; the reader comes in
// Phase 2, so an article opens its original for now.
//
// What the old Intake kept (`data.learning`: the podcast feeds seeded from podcasts.opml) is left as it
// is, for Podcasts.
import '../styles/intake.css';
import { useMemo, type CSSProperties } from 'react';
import type { AppDataV26 } from '../storage/types';
import { IconRefresh } from '../ui/icons';
import { useTextScale } from '../intelligence/useTextScale';
import { readingIndex } from './articles';
import { useArticles } from './useArticles';
import { ArticlesLibrary } from './ArticlesLibrary';

interface Props {
  data: AppDataV26;
}

// Websites is planned (said on the pill); Podcasts and Webinars are not built yet.
const PLACES = [
  { id: 'websites', label: 'Websites', live: false, planned: true },
  { id: 'articles', label: 'Articles', live: true, planned: false },
  { id: 'podcasts', label: 'Podcasts', live: false, planned: false },
  { id: 'webinars', label: 'Webinars', live: false, planned: false },
];

export function IntakeScreen({ data }: Props) {
  const scale = useTextScale();
  const { articles, status, refresh } = useArticles();
  const reading = useMemo(() => readingIndex((data as { progressLog?: unknown[] }).progressLog), [data]);
  const busy = status.phase === 'syncing';

  return (
    <div className="ik" style={{ '--ik-scale': scale } as CSSProperties}>
      <div className="ik-nav">
        <nav className="ik-places" aria-label="Intake">
          {PLACES.map(p => (
            <button
              key={p.id}
              type="button"
              className="ik-place"
              aria-current={p.live ? 'page' : undefined}
              disabled={!p.live}
              title={p.live ? undefined : p.planned ? 'Planned' : 'Coming later'}
            >
              {p.label}
              {p.planned && <small className="ik-place-tag"><span className="ik-vh">, </span>Planned</small>}
              {!p.live && !p.planned && <span className="ik-vh"> (coming later)</span>}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={`ik-icon${busy ? ' is-busy' : ''}`}
          onClick={() => void refresh()}
          aria-label={busy ? 'Syncing with Instapaper' : 'Sync with Instapaper'}
          aria-busy={busy}
        ><IconRefresh /></button>
      </div>
      <ArticlesLibrary articles={articles} status={status} reading={reading} onRetry={() => void refresh()} />
    </div>
  );
}

export default IntakeScreen;

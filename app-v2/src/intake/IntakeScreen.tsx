// Intake (Intake 2.0): what to read, watch and listen to, in four places, of which Websites and Articles are built.
// Websites is the sites you keep (WebsitesLibrary, your own records in `content`, synced). Articles is your
// Instapaper library (useArticles), browsed as a list or a bento grid. The place chosen is remembered on this
// device (Articles until one is). The section takes
// the Jour & verre look of Intelligence (styles/intake.css), light in both themes. An article opens in the
// Paper Sanctuary reader (ArticleReader, Phase 2), which stays open while the app runs: leaving Intake
// and coming back finds it.
//
// What the old Intake kept (`data.learning`: the podcast feeds seeded from podcasts.opml) is left as it
// is, for Podcasts.
//
// A takeaway saved from an article (Phase 3) opens here: Intelligence asks the app for the article
// (`open`), which opens in the reader and goes to the passage, or says why it can't.
import '../styles/intake.css';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AppDataV26 } from '../storage/types';
import { IconRefresh } from '../ui/icons';
import { useTextScale } from '../intelligence/useTextScale';
import { readingIndex } from './articles';
import { useArticles } from './useArticles';
import { ArticlesLibrary } from './ArticlesLibrary';
import { ArticleReader, type Persist } from './ArticleReader';
import type { JumpTarget } from './ReaderNotes';
import { WebsitesLibrary, type ContentChange } from './WebsitesLibrary';

interface Props {
  data: AppDataV26;
  onPersist: Persist;
  /** An article to open at a passage, asked for from Takeaways. */
  open?: JumpTarget | null;
  onOpened?: () => void;
}

// Podcasts and Webinars are not built yet.
const PLACES = [
  { id: 'websites', label: 'Websites', live: true, planned: false },
  { id: 'articles', label: 'Articles', live: true, planned: false },
  { id: 'podcasts', label: 'Podcasts', live: false, planned: false },
  { id: 'webinars', label: 'Webinars', live: false, planned: false },
] as const;
type Place = 'websites' | 'articles';

const PLACE_KEY = 'my-planning-intake-place';
const recallPlace = (): Place => { try { return localStorage.getItem(PLACE_KEY) === 'websites' ? 'websites' : 'articles'; } catch { return 'articles'; } };
const rememberPlace = (p: Place) => { try { localStorage.setItem(PLACE_KEY, p); } catch { /* private browsing: not remembered */ } };

const session = { openId: null as number | null };

export function IntakeScreen({ data, onPersist, open: asked = null, onOpened }: Props) {
  const scale = useTextScale();
  const { articles, status, refresh, fetchNow, update, signBody } = useArticles();
  const [openId, setOpenId] = useState(session.openId);
  const [jump, setJump] = useState<JumpTarget | null>(null);
  const [missing, setMissing] = useState(false);
  const [place, setPlace] = useState<Place>(recallPlace);
  const go = (p: Place) => { setPlace(p); rememberPlace(p); };
  const show = (id: number | null) => { session.openId = id; setOpenId(id); setMissing(false); };
  const open = openId === null ? null : articles?.get(openId) ?? null;
  const reading = useMemo(() => readingIndex((data as { progressLog?: unknown[] }).progressLog), [data]);
  const content = (data as { content?: unknown[] }).content;
  const changeContent = useCallback<ContentChange>(
    f => onPersist(d => ({ ...d, content: f((d as { content?: unknown[] }).content), lastModified: new Date().toISOString() })), [onPersist]);
  const busy = status.phase === 'syncing';

  // From a takeaway: its article, once the library is here, at its passage (each request once).
  const [handled, setHandled] = useState<number | null>(null);
  if (asked && articles && handled !== asked.key) {
    setHandled(asked.key);
    setPlace('articles');
    const there = articles.has(asked.bookmarkId);
    setOpenId(there ? asked.bookmarkId : null);
    setMissing(!there);
    setJump(there ? asked : null);
  }
  useEffect(() => { if (asked && handled === asked.key) onOpened?.(); }, [asked, handled, onOpened]);
  // The article open is the one found on coming back to Intake.
  useEffect(() => { session.openId = openId; }, [openId]);

  return (
    <div className="ik" style={{ '--ik-scale': scale } as CSSProperties}>
      <div className="ik-nav">
        <nav className="ik-places" aria-label="Intake">
          {PLACES.map(p => (
            <button
              key={p.id}
              type="button"
              className="ik-place"
              aria-current={p.id === place ? 'page' : undefined}
              onClick={p.live ? () => go(p.id as Place) : undefined}
              disabled={!p.live}
              title={p.live ? undefined : p.planned ? 'Planned' : 'Coming later'}
            >
              {p.label}
              {p.planned && <small className="ik-place-tag"><span className="ik-vh">, </span>Planned</small>}
              {!p.live && !p.planned && <span className="ik-vh"> (coming later)</span>}
            </button>
          ))}
        </nav>
        {place === 'articles' && (
          <button
            type="button"
            className={`ik-icon${busy ? ' is-busy' : ''}`}
            onClick={() => void refresh()}
            aria-label={busy ? 'Syncing with Instapaper' : 'Sync with Instapaper'}
            aria-busy={busy}
          ><IconRefresh /></button>
        )}
      </div>
      {place === 'websites' && <WebsitesLibrary content={content} onChange={changeContent} />}
      {place === 'articles' && missing && !open && (
        <p className="ik-jump-note" role="status">That article isn’t in your Intake library on this device. Sync with Instapaper, then open it from Takeaways again.</p>
      )}
      {place === 'articles' && (open
        ? <ArticleReader key={open.id} article={open} reading={reading.get(open.id)} content={content} onBack={() => show(null)} onPersist={onPersist} fetchNow={fetchNow} update={update} signBody={signBody} jump={jump?.bookmarkId === open.id ? jump : null} onJumped={() => setJump(null)} />
        : <ArticlesLibrary articles={articles} status={status} reading={reading} onRetry={() => void refresh()} onOpen={show} />)}
    </div>
  );
}

export default IntakeScreen;

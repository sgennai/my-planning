// Intake 2.0 Phase 2: the Paper Sanctuary reader, after the approved prototype (intake-reader.html: Concept 01
// with the Active Reading panel of Concept 10). The article on paper (Literata, three reading themes, the
// size, spacing and measure yours, on this device), a sticky bar (back, contents, appearance, Active
// Reading, Finished) with the reading line along its foot, the panel beside the text where there is room,
// over it where there isn't.
//
// Your place: a block of text and how far through it (place.ts), noted as you scroll and put back
// whenever the text reflows without you scrolling (a new size, width or font, the panel, a rotation), and
// when the article reopens. A picture arriving or going never moves the words at the reading line
// (`steady`). Only your own move is written (reading.ts): scrolling by the wheel, a drag, a scroll key or
// the scrollbar (and the momentum after it), or a jump from Contents; never a tap on another button (the
// panel, Finished). It is written when scrolling rests, on leaving, and when the app is hidden; opening an
// article and putting your place back write nothing. Finished is your tap only. The article's HTML is
// drawn once and never by React again. Its pictures are never cropped; one shown smaller than itself opens
// full size (`PictureViewer`), which leaves the article, and your place, as they were.
import '../styles/intake-reader.css';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { authorOf, deckOf, descriptionOf, imageOf, minutesOf, statusOf, titleOf, type Article, type Reading } from './articles';
import { loadBody, type Body } from './cache';
import { cleanArticle } from './sanitize';
import { blockOf, goTo, placeAt, progressOf, type Place } from './place';
import { withFinished, withPosition } from './reading';
import { imageAddress, isInline, keepImages, releaseImages } from './images';
import { pictureOf, useArticleImages, type PictureHooks } from './reader-images';
import { recallPrefs, rememberPrefs, withPrefs, type ReaderPrefs } from './reader-prefs';
import { loadReaderFont } from './reader-font';
import { Appearance, Contents, ActiveReading, Icon, HeroImage, PictureViewer, type Viewing } from './ReaderParts';
import type { FetchOutcome } from './sync';

type Log = { progressLog?: unknown[] } & Record<string, unknown>;
export type Persist = (mutator: (current: Log) => Log) => void;

interface Props {
  article: Article;
  reading: Reading | undefined;
  onBack: () => void;
  onPersist: Persist;
  fetchNow: (a: Article) => Promise<FetchOutcome>;
  update: (a: Article) => Promise<void>;
  /** The picture signatures for a body fetched before Phase 2 (null if they couldn't be had). */
  signBody: (a: Article) => Promise<Record<string, string> | null>;
}

type View =
  | { state: 'loading' }
  | { state: 'ready'; body: Body }
  | { state: 'failed'; why: 'unavailable' | 'offline' | 'error'; message?: string };

/** A scroll this soon after a drag, the wheel, a scroll key or the scrollbar is yours (momentum included). */
const YOURS_MS = 3000;
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
/** The first draw waits this long at most for Literata, so the text isn't laid out twice. */
const FONT_WAIT_MS = 1200;
const REST_MS = 1200;
/** Beside the text from this width of the reader; over it below. The reader is the whole workspace since 2.1
 *  (no card): an iPad in portrait (up to 834px) keeps the sheet, as before. */
const PANEL_BESIDE = 850;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** A long title is set smaller, so the opening stays a few lines high (in characters: 2.1). */
const titleLength = (t: string) => (t.length > 150 ? 'longest' : t.length > 110 ? 'longer' : t.length > 70 ? 'long' : undefined);

export function ArticleReader({ article, reading, onBack, onPersist, fetchNow, update, signBody }: Props) {
  const [view, setView] = useState<View>(article.content === 'unavailable' ? { state: 'failed', why: 'unavailable' } : { state: 'loading' });
  const [prefs, setPrefsState] = useState<ReaderPrefs>(recallPrefs);
  const [popover, setPopover] = useState<'appearance' | 'contents' | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [keepNote, setKeepNote] = useState<string | null>(null);
  const [keepBusy, setKeepBusy] = useState(false);
  const [shownProgress, setShownProgress] = useState(reading?.progress ?? 0);

  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const keptBy = useRef<number | undefined>(article.keep ? article.id : undefined);

  // ── The article ──────────────────────────────────────────────────────────
  const id = article.id;
  /** `quiet`: Try again, which keeps its message and button (saying it is trying) rather than a loading line. */
  const open = useCallback(async (a: Article, quiet = false) => {
    if (!quiet) setView({ state: 'loading' });
    const out = await fetchNow(a);
    if ('stop' in out) {
      setView({ state: 'failed', why: out.stop.code === 'offline' ? 'offline' : 'error', message: out.stop.message });
      return;
    }
    if (out.article.content !== 'cached') { setView({ state: 'failed', why: 'unavailable' }); return; }
    const body = await loadBody(a.id);
    setView(body ? { state: 'ready', body } : { state: 'failed', why: 'error' });
  }, [fetchNow]);
  useEffect(() => {
    const font = loadReaderFont();
    let alive = true;
    void (async () => {
      if (article.content === 'unavailable') return;
      const body = article.content === 'cached' ? await loadBody(id) : undefined;
      await Promise.race([font, sleep(FONT_WAIT_MS)]);
      if (!alive) return;
      if (body) setView({ state: 'ready', body });
      else void open(article);
    })();
    return () => { alive = false; };
    // Once per article: the library's later changes to it (a sync) don't redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const retry = async () => {
    setRetrying(true);
    await open({ ...article, content: 'none' }, true);
    setRetrying(false);
  };

  const clean = useMemo(() => (view.state === 'ready' ? cleanArticle(view.body.html, article.url) : null), [view, article.url]);
  const hero = imageAddress(imageOf(article));
  const heroInBody = !!hero && !!clean?.images.includes(hero);
  const deck = clean ? deckOf(descriptionOf(article), clean.start) : null;
  const minutes = minutesOf(article.words ?? (view.state === 'ready' ? view.body.words : null));
  const finished = statusOf(id, new Map(reading ? [[id, reading]] : [])) === 'finished';

  // ── Your place ───────────────────────────────────────────────────────────
  const place = useRef<Place | null>(reading?.place ?? null);
  /** The place being put back, held as it was saved until the view moves by anything but the reader itself
   *  (your scroll, a jump, VoiceOver, find in page): what the screen shows may not have room for it yet (a
   *  picture at it, its size unknown, is nothing high until it arrives). */
  const restoring = useRef<Place | null>(reading?.place ?? null);
  /** Where the reader itself last put the scroll position: any other move releases `restoring`. */
  const ownTop = useRef<number | null>(null);
  const hint = useRef(reading?.place?.block ?? 0);
  const furthest = useRef(reading?.progress ?? 0);
  const touched = useRef(false);
  const inputAt = useRef(0);
  const yourScrollAt = useRef(0);
  const pressing = useRef(false);
  const rest = useRef(0);

  /** Where reading happens: just under the bar. */
  const line = () => (scrollRef.current?.getBoundingClientRect().top ?? 0) + (chromeRef.current?.offsetHeight ?? 0) + 12;
  const measure = useCallback(() => {
    const sc = scrollRef.current, body = bodyRef.current;
    if (!sc || !body) return;
    const p = sc.scrollTop < 4 ? null : placeAt(body, line(), hint.current);
    place.current = p;
    if (p) hint.current = p.block;
    const progress = progressOf(body, sc.getBoundingClientRect().bottom);
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
    if (touched.current) furthest.current = Math.max(furthest.current, progress);
  }, []);
  const hold = useCallback(() => {
    const sc = scrollRef.current, body = bodyRef.current;
    if (!sc || !body) return;
    goTo(sc, body, restoring.current ?? place.current, line());
    ownTop.current = sc.scrollTop;
  }, []);
  /**
   * A change to the page (a picture arriving or going) that leaves your place where it is, in the same frame:
   * the block at the reading line is put back exactly where it was on the screen when the change was
   * elsewhere (a picture above it), or as far through it as you were when it was in that very block.
   * While a place is being put back, that place.
   */
  const steady = useCallback((change: () => void) => {
    const sc = scrollRef.current, body = bodyRef.current;
    if (restoring.current) {
      change();
      if (sc && body) { goTo(sc, body, restoring.current, line()); ownTop.current = sc.scrollTop; }
      return;
    }
    const at = sc && body && sc.scrollTop >= 4 ? placeAt(body, line(), hint.current) : null;
    const block = at && body ? blockOf(body, at) : null;
    const before = block?.getBoundingClientRect();
    change();
    if (!at || !block || !before || !sc || !body) return;
    const now = block.getBoundingClientRect();
    if (Math.abs(now.height - before.height) >= 0.5) goTo(sc, body, at, line());
    else if (Math.abs(now.top - before.top) >= 0.5) sc.scrollTop += now.top - before.top;
  }, []);

  // ── The pictures' signatures ────────────────────────────────────────────
  // The server's signature for each picture it may fetch: with the body, and with the library for the lead
  // picture. A body fetched before Phase 2 has none: the article is asked for again (online, paced like
  // any request) for its signatures only, its text kept as it is; its pictures wait for that.
  const sigs = useRef<Record<string, string>>({});
  const signing = useRef<Promise<unknown> | null>(null);
  const bodySeen = useRef<Body | null>(null);
  useLayoutEffect(() => {
    if (view.state !== 'ready' || bodySeen.current === view.body) return;
    bodySeen.current = view.body;
    sigs.current = view.body.sigs ?? {};
    const needs = view.body.sigs === undefined && navigator.onLine !== false
      && (!!clean?.images.some(u => !isInline(u)) || (!!hero && hero !== imageAddress(article.image)));
    signing.current = needs ? signBody(article).then(got => { if (got) sigs.current = got; }) : null;
    // Once per body drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const sigFor = useCallback((url: string): string | null =>
    sigs.current[url] ?? (url === imageAddress(article.image) ? article.imageSig ?? null : null), [article.image, article.imageSig]);
  const sigOf = useCallback(async (url: string) => { await signing.current; return sigFor(url); }, [sigFor]);
  const hooks = useRef<PictureHooks>({ sigOf, steady });
  useLayoutEffect(() => { hooks.current = { sigOf, steady }; }, [sigOf, steady]);
  const save = useCallback(() => {
    window.clearTimeout(rest.current);
    if (!touched.current) return;
    const progress = furthest.current, p = place.current;
    setShownProgress(progress);
    onPersist(d => {
      const log = d.progressLog ?? [];
      const next = withPosition(log, id, progress, p);
      return next === log ? d : { ...d, progressLog: next, lastModified: new Date().toISOString() };
    });
  }, [id, onPersist]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let frame = 0;
    let dragged = false;
    const onInput = () => { inputAt.current = Date.now(); };
    // A touch is yours once it moves (a tap on a button scrolls nothing), and its momentum after it.
    const onDown = () => { pressing.current = true; dragged = false; };
    const onMove = () => { dragged = true; onInput(); };
    const onUp = () => { pressing.current = false; if (dragged) onInput(); dragged = false; };
    // The scrollbar, with a mouse: a press on the scroller itself, not on what it holds.
    const onPress = (e: PointerEvent) => { if (e.target === sc) onInput(); };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key) && !(e.target as Element | null)?.closest?.('button, a, input, select, textarea, [contenteditable]')) onInput();
    };
    const onScroll = () => {
      if (restoring.current && (ownTop.current === null || Math.abs(sc.scrollTop - ownTop.current) > 2)) restoring.current = null;
      if (pressing.current || Date.now() - inputAt.current < YOURS_MS) {
        touched.current = true;
        yourScrollAt.current = Date.now();
        window.clearTimeout(rest.current);
        rest.current = window.setTimeout(save, REST_MS);
      }
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    // Whatever reflows the text while you aren't scrolling puts your place back.
    const sizes = new ResizeObserver(() => {
      if (pressing.current || Date.now() - yourScrollAt.current < 150) return;
      hold();
      measure();
    });
    sizes.observe(sc);
    for (const el of sc.children) sizes.observe(el);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    sc.addEventListener('scroll', onScroll, { passive: true });
    sc.addEventListener('wheel', onInput, { passive: true });
    sc.addEventListener('touchstart', onDown, { passive: true });
    sc.addEventListener('touchmove', onMove, { passive: true });
    sc.addEventListener('touchend', onUp, { passive: true });
    sc.addEventListener('touchcancel', onUp, { passive: true });
    sc.addEventListener('pointerdown', onPress, { passive: true });
    sc.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      sc.removeEventListener('scroll', onScroll);
      sc.removeEventListener('wheel', onInput);
      sc.removeEventListener('touchstart', onDown);
      sc.removeEventListener('touchmove', onMove);
      sc.removeEventListener('touchend', onUp);
      sc.removeEventListener('touchcancel', onUp);
      sc.removeEventListener('pointerdown', onPress);
      sc.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save(); // leaving the article
    };
  }, [measure, hold, save, view.state]);

  // Back to your place once the article is drawn; and again after anything that reflows it by your hand.
  useLayoutEffect(() => {
    if (!clean) return;
    hold();
    measure();
    if (scrollRef.current) scrollRef.current.querySelector<HTMLElement>('.ikr-essay')?.focus({ preventScroll: true });
  }, [clean, hold, measure]);
  useLayoutEffect(() => { hold(); measure(); }, [prefs.size, prefs.line, prefs.measure, prefs.font, hold, measure]);

  useArticleImages(bodyRef, scrollRef, `${id}:${clean ? 'drawn' : ''}`, keptBy, hooks);

  // ── The panel, the bar's popovers ───────────────────────────────────────
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const sizes = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < PANEL_BESIDE));
    sizes.observe(frame);
    return () => sizes.disconnect();
  }, []);
  const panelOpen = prefs.panel ?? !narrow;
  const setPrefs = (patch: Partial<ReaderPrefs>) => setPrefsState(p => { const next = withPrefs(p, patch); rememberPrefs(next); return next; });
  // Over the text, the panel opens only when asked, and is closed by a tap outside it.
  const overlay = narrow && panelOpen;
  const togglePanel = () => setPrefs({ panel: !panelOpen });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || viewing) return; // the picture full size closes itself
      if (popover) { setPopover(null); return; }
      if (overlay) setPrefs({ panel: false });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ── Finished, Keep offline ──────────────────────────────────────────────
  const toggleFinished = () => onPersist(d => ({ ...d, progressLog: withFinished(d.progressLog, id, !finished), lastModified: new Date().toISOString() }));
  const toggleKeep = async () => {
    if (keepBusy) return;
    if (article.keep) {
      keptBy.current = undefined;
      await releaseImages(id);
      await update({ ...article, keep: false });
      setKeepNote('No longer kept offline. Its text stays on this device while it is unread.');
      return;
    }
    setKeepBusy(true);
    keptBy.current = id;
    await update({ ...article, keep: true });
    const urls = [...new Set([...(hero && !heroInBody ? [hero] : []), ...(clean?.images ?? [])])].filter(u => !isInline(u));
    if (!urls.length) setKeepNote('Kept offline.');
    else {
      setKeepNote(`Keeping its pictures offline: 0 of ${urls.length}`);
      await signing.current;
      const out = await keepImages(id, urls.map(url => ({ url, sig: sigFor(url) })), done => setKeepNote(`Keeping its pictures offline: ${done} of ${urls.length}`));
      const missed = out.failed + out.full;
      setKeepNote(!missed ? `Kept offline, with its ${out.kept === 1 ? 'picture' : `${out.kept} pictures`}.`
        : out.full ? `Kept offline, with ${out.kept} of its ${urls.length} pictures: the space for offline pictures is full.`
        : `Kept offline, with ${out.kept} of its ${urls.length} pictures: ${missed === 1 ? "one couldn't" : `${missed} couldn't`} be fetched.`);
    }
    setKeepBusy(false);
  };

  /** A picture full size: from its "View full size", or a tap on one shown smaller than itself (not a link's). */
  const viewPicture = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element;
    const whole = target.closest<HTMLElement>('.ikr-whole');
    const img = whole ? pictureOf(whole) : target.closest('.ikr-body img, .ikr-hero img');
    if (!(img instanceof HTMLImageElement) || !img.getAttribute('src') || img.hidden || !img.naturalWidth) return;
    if (!whole && (img.closest('a') || img.naturalWidth <= img.clientWidth + 1)) return;
    setViewing({
      src: img.currentSrc || img.src,
      alt: img.alt.trim(),
      caption: img.closest('figure')?.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      direct: img.referrerPolicy === 'no-referrer' && !img.src.startsWith('blob:'),
      from: whole ?? e.currentTarget,
    });
  };

  const goToHeading = (headingId: string) => {
    const sc = scrollRef.current;
    const h = sc?.querySelector<HTMLElement>(`#${headingId}`);
    setPopover(null);
    if (!sc || !h) return;
    touched.current = true;
    restoring.current = null;
    sc.scrollTop += h.getBoundingClientRect().top - line();
    measure();
    window.clearTimeout(rest.current);
    rest.current = window.setTimeout(save, REST_MS);
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  };

  const style = {
    '--ikr-size-n': prefs.size,
    '--ikr-line': prefs.line,
    '--ikr-measure': `${prefs.measure}px`,
  } as CSSProperties;
  const author = authorOf(article);
  const published = article.lead?.publishedAt ?? article.publishedAt;
  const title = titleOf(article);
  const status = finished ? 'finished' : shownProgress > 0.02 ? 'progress' : 'unread';

  return (
    <div className="ikr" data-theme={prefs.theme} data-font={prefs.font} style={style}>
      <div className={`ikr-frame${panelOpen ? ' is-panel' : ''}${overlay ? ' is-overlay' : ''}`} ref={frameRef}>
        <div className="ikr-stage">
          <div className="ikr-scroll" ref={scrollRef} inert={overlay || undefined}>
            <div className="ikr-chrome" ref={chromeRef}>
              <div className="ikr-chrome-side">
                <button type="button" className="ikr-icon" onClick={onBack} aria-label="Back to Articles" title="Back to Articles"><Icon name="back" /></button>
                <span className="ikr-caption" aria-hidden>{title}</span>
              </div>
              <div className="ikr-chrome-side">
                {!!clean?.headings.length && (
                  <button type="button" className={`ikr-icon${popover === 'contents' ? ' is-active' : ''}`} onClick={() => setPopover(p => (p === 'contents' ? null : 'contents'))} aria-label="Contents" aria-expanded={popover === 'contents'} aria-controls="ikr-contents" title="Contents"><Icon name="contents" /></button>
                )}
                <button type="button" className={`ikr-icon ikr-icon--text${popover === 'appearance' ? ' is-active' : ''}`} onClick={() => setPopover(p => (p === 'appearance' ? null : 'appearance'))} aria-label="Reading appearance" aria-expanded={popover === 'appearance'} aria-controls="ikr-appearance" title="Reading appearance">Aa</button>
                <span className="ikr-divider" aria-hidden />
                <button type="button" className={`ikr-icon ikr-panel-toggle${panelOpen ? ' is-open' : ''}`} onClick={togglePanel} aria-label={panelOpen ? 'Hide Active Reading' : 'Show Active Reading'} aria-expanded={panelOpen} aria-controls="ikr-panel" title={panelOpen ? 'Hide Active Reading' : 'Show Active Reading'}><Icon name="panel" /></button>
                <button type="button" className={`ikr-icon${finished ? ' is-on' : ''}`} onClick={toggleFinished} aria-label="Finished" aria-pressed={finished} title={finished ? 'Finished: tap to take it back' : 'Mark as finished'}><Icon name={finished ? 'done' : 'circle'} /></button>
              </div>
              <div className="ikr-progress" aria-hidden><div className="ikr-progress-fill" ref={fillRef} style={{ transform: `scaleX(${reading?.progress ?? 0})` }} /></div>
            </div>

            <article className="ikr-essay" tabIndex={-1} aria-labelledby="ikr-title" onClick={viewPicture}>
              <header className="ikr-head">
                <p className="ikr-meta">
                  {article.domain && <span>{article.domain}</span>}
                  {author && <span>{author}</span>}
                  {published && <span>{DATE.format(new Date(published * 1000))}</span>}
                </p>
                <h1 className="ikr-title" id="ikr-title" data-length={titleLength(title)}>{title}</h1>
                {deck && <p className="ikr-deck">{deck}</p>}
                <p className="ikr-info">
                  {minutes && <b>{String(minutes).padStart(2, '0')} min read</b>}
                  {article.url && <a href={article.url} target="_blank" rel="noopener noreferrer">Original<span aria-hidden> ↗</span></a>}
                </p>
                {hero && !heroInBody && view.state === 'ready' && <HeroImage src={hero} sigOf={sigOf} keptBy={keptBy} steady={steady} />}
                {view.state === 'ready' && view.body.paywalled && (
                  <p className="ikr-notice">Instapaper found this article behind a paywall: it may be incomplete here. The original has all of it.</p>
                )}
              </header>

              {view.state === 'loading' && <p className="ikr-state" role="status">Getting the article from Instapaper…</p>}
              {view.state === 'failed' && (
                <div className="ikr-state" role="status">
                  <p>{
                    view.why === 'unavailable' ? "Instapaper couldn't extract this article, so it can only be read on its own site."
                      : view.why === 'offline' ? "This article isn't on this device yet, and you're offline. It comes with the network."
                      : `${view.message ?? "Instapaper didn't return this article."}`
                  }</p>
                  <div className="ikr-actions">
                    {view.why !== 'offline' && <button type="button" className="ikr-button" onClick={() => void retry()} disabled={retrying}>{retrying ? 'Trying…' : 'Try again'}</button>}
                    {article.url && <a className="ikr-button" href={article.url} target="_blank" rel="noopener noreferrer">Open original<span aria-hidden> ↗</span></a>}
                  </div>
                </div>
              )}
              {clean && <ArticleBody html={clean.html} bodyRef={bodyRef} />}

              {clean && (
                <footer className="ikr-foot">
                  <span>End of article</span>
                  <div className="ikr-actions">
                    <button type="button" className={`ikr-button${finished ? ' is-on' : ''}`} onClick={toggleFinished} aria-pressed={finished}>{finished ? '✓ Finished' : 'Mark as finished'}</button>
                    <button type="button" className={`ikr-button${article.keep ? ' is-on' : ''}`} onClick={() => void toggleKeep()} aria-pressed={!!article.keep} disabled={keepBusy}>{article.keep ? '✓ Kept offline' : 'Keep offline'}</button>
                    {article.url && <a className="ikr-button" href={article.url} target="_blank" rel="noopener noreferrer">Open original<span aria-hidden> ↗</span></a>}
                  </div>
                </footer>
              )}
            </article>
          </div>

          {overlay && <button type="button" className="ikr-backdrop" aria-label="Close Active Reading" onClick={() => setPrefs({ panel: false })} />}
          {viewing && <PictureViewer pic={viewing} onClose={() => setViewing(null)} />}
          {panelOpen && (
            <ActiveReading
              overlay={overlay}
              onClose={() => setPrefs({ panel: false })}
              progress={shownProgress}
              minutes={minutes}
              status={status}
              saved={article.savedAt}
              keep={!!article.keep}
              keepBusy={keepBusy}
              keepNote={keepNote}
              onKeep={() => void toggleKeep()}
              canKeep={view.state === 'ready'}
              url={article.url}
            />
          )}
        </div>

        {popover === 'appearance' && <Appearance prefs={prefs} onChange={setPrefs} onClose={() => setPopover(null)} />}
        {popover === 'contents' && clean && <Contents headings={clean.headings} onGo={goToHeading} onClose={() => setPopover(null)} />}
      </div>
    </div>
  );
}

/** The article's HTML, drawn once: React never touches it again, so neither scrolling nor a setting redraws it. */
const ArticleBody = memo(function ArticleBody({ html, bodyRef }: { html: string; bodyRef: RefObject<HTMLDivElement | null> }) {
  return <div className="ikr-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />;
});

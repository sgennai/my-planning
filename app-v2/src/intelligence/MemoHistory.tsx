// The AI Challenge's edition history (INT-50): a drawer over the memo, shut
// until the bar's menu opens it. Every edition on the device, newest first,
// by month, each with its own date, time and title; a search over them; the
// one being read marked; a new edition, and one whose document has a problem,
// say so quietly (`tagsOf`). Choosing one opens it whole and shuts the drawer, as
// do its close button, a tap outside and Escape (`IntelligenceScreen`).
import { Fragment, useMemo, useState, type RefObject } from 'react';
import type { Edition } from './parse';
import { historyGroups, historyNote, shortDate } from './memo';

interface Props {
  open: boolean;
  editions: Edition[];
  current: Edition | null;
  /** Quiet words after an edition's date: "New", a problem with its document. */
  tagsOf: (e: Edition) => { text: string; alert: boolean }[];
  onChoose: (e: Edition) => void;
  onClose: () => void;
  onStatus: () => void;
  drawerRef: RefObject<HTMLDivElement | null>;
}

export function MemoHistory({ open, editions, current, tagsOf, onChoose, onClose, onStatus, drawerRef }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => historyGroups(editions, query), [editions, query]);
  return (
    <>
      <div className={`memo-veil${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden />
      <div
        id="memo-history"
        className={`memo-drawer${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-history-title"
        aria-hidden={!open || undefined}
        inert={!open || undefined}
        ref={drawerRef}
      >
        <div className="memo-drawer-top">
          <div className="memo-drawer-heading">
            <div>
              <span className="memo-drawer-label">AI Challenge</span>
              <h2 id="memo-history-title">Edition history</h2>
            </div>
            <button type="button" className="memo-drawer-close" aria-label="Close history" title="Close history" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5 5 19" /></svg>
            </button>
          </div>
          <p className="memo-drawer-note">{historyNote(editions)}</p>
          <label className="memo-drawer-search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input type="search" placeholder="Search titles or dates" autoComplete="off" aria-label="Search challenge editions" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
        </div>
        <nav className="memo-drawer-list" aria-label={`All ${editions.length} challenge editions`}>
          {groups.map(g => (
            <Fragment key={g.month}>
              <div className="memo-month">{g.month}</div>
              {g.editions.map(e => {
                const here = e === current;
                return (
                  <button
                    key={e.driveFileId}
                    type="button"
                    className={`memo-edition${here ? ' is-current' : ''}`}
                    aria-current={here ? 'page' : undefined}
                    onClick={() => onChoose(e)}
                  >
                    <span className="memo-edition-date">
                      {shortDate(e.editionDate)}{e.time && ` · ${e.time}`}
                      {here && <span className="memo-current-marker" aria-hidden />}
                      {tagsOf(e).map(t => <span key={t.text} className={`memo-edition-tag${t.alert ? ' is-alert' : ''}`}><span className="intel-vh">, </span>{t.text}</span>)}
                    </span>
                    <strong>{e.title}</strong>
                  </button>
                );
              })}
            </Fragment>
          ))}
          {!groups.length && <div className="memo-empty">No editions match that search.</div>}
        </nav>
        <div className="memo-drawer-bottom">
          <button type="button" onClick={onStatus}>Feed status</button>
        </div>
      </div>
    </>
  );
}

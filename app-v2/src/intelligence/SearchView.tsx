// Search: every edition on this device (the whole archive once refreshed),
// by words and by feed, recent days and topic. Each result quotes the words
// where they are and opens the edition at that section. It says how much of
// the archive it searched, so a device still downloading is not mistaken for
// one with nothing to find. A large archive is read for searching a slice at
// a time, never freezing the screen, and only once a session.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FEEDS, feedById, type FeedId } from './feeds';
import type { Edition } from './parse';
import type { FeedState } from './library';
import { indexEntry, indexOf, isIndexed, search, topicsOf, type Hit, type Indexed, type Marked, type SearchFilters, type Since } from './search';
import { shortTitle } from './present';
import type { DayKey } from '../routine/dates';
import { dayNameShort, formatDayCompact } from '../routine/dates';
import { IconSearch } from '../ui/icons';

const PAGE = 40;
const TOPICS_SHOWN = 10;
const SINCE: [Since, string][] = [['any', 'Any time'], ['week', 'Past week'], ['month', 'Past month'], ['quarter', 'Past 3 months']];
/** Up to this many editions not yet read for searching are read at once. */
const AT_ONCE = 150;
/** Otherwise, a slice of this long at a time. */
const SLICE_MS = 12;

interface Props {
  states: Partial<Record<FeedId, FeedState>>;
  query: string;
  filters: SearchFilters;
  onQuery: (q: string) => void;
  onFilters: (f: SearchFilters) => void;
  onOpen: (edition: Edition, sectionId: string | null) => void;
  today: DayKey;
  loading: boolean;
}

function MarkedText({ text, marks }: Marked) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  marks.forEach(([a, b], i) => {
    if (a < last) return;
    if (a > last) parts.push(text.slice(last, a));
    parts.push(<mark key={i}>{text.slice(a, b)}</mark>);
    last = b;
  });
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Result({ hit, onOpen }: { hit: Hit; onOpen: Props['onOpen'] }) {
  const e = hit.edition;
  return (
    <li>
      <button type="button" className="intel-result" onClick={() => onOpen(e, hit.sectionId)}>
        <span className="intel-ed-date">
          {feedById(e.feedId)?.label} · {dayNameShort(e.editionDate)} {formatDayCompact(e.editionDate)}{e.time && ` · ${e.time}`}
          {hit.sectionTitle && ` · ${shortTitle(hit.sectionTitle)}`}
        </span>
        <span className="intel-result-title"><MarkedText {...hit.title} /></span>
        {hit.snippet && <span className="intel-result-snippet"><MarkedText {...hit.snippet} /></span>}
      </button>
    </li>
  );
}

function Chips<T extends string | null>({ label, options, value, onChange }: {
  label: string; options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="intel-tagbar" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

/**
 * The search index of these editions, or null while it is being built (with
 * how many are done). The last index stays in use while a newer one builds.
 */
function useIndex(editions: Edition[]): { index: Indexed[] | null; done: number } {
  const [built, setBuilt] = useState<{ of: Edition[]; index: Indexed[] } | null>(() =>
    editions.filter(e => !isIndexed(e)).length <= AT_ONCE ? { of: editions, index: indexOf(editions) } : null);
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (built?.of === editions) return;
    let i = 0;
    let timer = 0;
    const step = () => {
      const until = performance.now() + SLICE_MS;
      while (i < editions.length && performance.now() < until) indexEntry(editions[i++]);
      if (i < editions.length) {
        setDone(i);
        timer = window.setTimeout(step, 0);
      } else {
        setBuilt({ of: editions, index: indexOf(editions) });
      }
    };
    timer = window.setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [editions, built]);
  return { index: built?.index ?? null, done };
}

export function SearchView({ states, query, filters, onQuery, onFilters, onOpen, today, loading }: Props) {
  const [shown, setShown] = useState(PAGE);
  const [allTopics, setAllTopics] = useState(false);
  const editions = useMemo(() => FEEDS.flatMap(f => states[f.id]?.editions ?? []), [states]);
  const { index, done } = useIndex(editions);
  // Typing stays fluid on an older iPad: the search follows a step behind.
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => (index ? search(index, deferred, filters, today) : []), [index, deferred, filters, today]);
  const topics = useMemo(() => topicsOf(editions), [editions]);
  const inDrive = FEEDS.reduce((n, f) => n + (states[f.id]?.editions.length ?? 0) + (states[f.id]?.missing.length ?? 0) + (states[f.id]?.pending ?? 0), 0);
  const searched = index?.length ?? 0;
  const filtered = query.trim() || filters.feed || filters.since !== 'any' || filters.topic;
  const set = (patch: Partial<SearchFilters>) => { onFilters({ ...filters, ...patch }); setShown(PAGE); };
  const topicOptions: [string | null, string][] = [[null, 'All topics'], ...topics.slice(0, allTopics ? undefined : TOPICS_SHOWN).map(t => [t.topic, t.topic] as [string, string])];
  if (filters.topic && !topicOptions.some(([t]) => t === filters.topic)) topicOptions.push([filters.topic, filters.topic]);

  return (
    <div className="intel-col intel-search-view">
      <h1 className="intel-vh">Search</h1>
      <label className="intel-search">
        <IconSearch />
        <input
          className="ds-input"
          type="search"
          value={query}
          onChange={e => { onQuery(e.target.value); setShown(PAGE); }}
          placeholder="Search every edition"
          aria-label="Search every edition"
          autoFocus
        />
      </label>
      <div className="intel-filters">
        <Chips<FeedId | null> label="Feed" value={filters.feed} onChange={feed => set({ feed })}
          options={[[null, 'All feeds'], ...FEEDS.map(f => [f.id, f.label] as [FeedId, string])]} />
        <Chips<Since> label="Date" value={filters.since} onChange={since => set({ since })} options={SINCE} />
        {topics.length > 0 && (
          <div className="intel-filter-topics">
            <Chips<string | null> label="Topic" value={filters.topic} onChange={topic => set({ topic })} options={topicOptions} />
            {topics.length > TOPICS_SHOWN && (
              <button type="button" className="intel-linkbtn" aria-expanded={allTopics} onClick={() => setAllTopics(a => !a)}>
                {allTopics ? 'Fewer topics' : `All ${topics.length} topics`}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="intel-search-count" role="status">
        {loading && !editions.length ? 'Downloading editions…' : !index ? `Preparing the search: ${done} of ${editions.length} editions read…` : (
          <>
            {filtered ? `${hits.length} ${hits.length === 1 ? 'edition' : 'editions'}` : `All ${hits.length} ${hits.length === 1 ? 'edition' : 'editions'}`}
            {inDrive > searched
              ? ` · searched ${searched} of ${inDrive}; ${inDrive - searched} not downloaded yet`
              : ` · every edition on this device searched`}
          </>
        )}
      </p>

      {hits.length > 0 && (
        <ol className="intel-results">
          {hits.slice(0, shown).map(h => <Result key={h.edition.driveFileId} hit={h} onOpen={onOpen} />)}
        </ol>
      )}
      {hits.length > shown && (
        <button type="button" className="intel-linkbtn" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, hits.length - shown)} more</button>
      )}
      {!hits.length && index && index.length > 0 && (
        <div className="intel-empty" role="status"><p>No edition matches{query.trim() && ` “${query.trim()}”`}{filtered && !query.trim() ? ' these filters' : ''}.</p></div>
      )}
    </div>
  );
}

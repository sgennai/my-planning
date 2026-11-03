// Takeaways: everything kept from the briefings, newest first, searchable
// and filtered by tag, each with a note and tags of your own and a way back
// to where it came from. Removing one asks first. What the list shows can be
// exported as a Markdown file (export.ts).
import { useState } from 'react';
import { Markdown } from './Markdown';
import { feedById, type FeedId } from './feeds';
import { copyText } from './present';
import { searchSaved, tagsOf, parseTags, nameOf, type SavedInsight } from './saved';
import { canReview, dayText, statusOf, RATINGS, type ReviewIndex } from './review';
import { dayNameShort, formatDayCompact, type DayKey } from '../routine/dates';
import { takeawaysMarkdown, exportFileName, handOver } from './export';
import { IconCopy, IconPencil, IconTrash, IconExternal, IconSearch, IconChevronRight, IconReview, IconExport } from '../ui/icons';

interface Props {
  saved: SavedInsight[];
  onOpen: (item: SavedInsight) => void;
  onUpdate: (item: SavedInsight, patch: { note: string; tags: string[] }) => void;
  onRemove: (item: SavedInsight) => void;
  onNote: (text: string) => void;
  reviews: ReviewIndex;
  today: DayKey;
  /** Due for review today, and how many tomorrow. */
  due: SavedInsight[];
  dueTomorrow: number;
  onReview: () => void;
  onReviewing: (item: SavedInsight, on: boolean) => void;
}

/** Where a takeaway stands in review, at the foot of its card. */
function ReviewStatusLine({ item, reviews, today, onReviewing }: { item: SavedInsight } & Pick<Props, 'reviews' | 'today' | 'onReviewing'>) {
  if (!canReview(item)) return null;
  const s = statusOf(item, reviews);
  if (!s.on) {
    return (
      <div className="intel-saved-review">
        <i aria-hidden /><span>Not in review</span>
        <button type="button" className="intel-linkbtn" onClick={() => onReviewing(item, true)}>Add to review</button>
      </div>
    );
  }
  const last = s.confidence ? ` · last time: ${RATINGS[s.confidence - 1].label.toLowerCase()}` : '';
  return s.due && s.due <= today
    ? <div className="intel-saved-review is-due"><i aria-hidden /><span>Due for review today{last}</span></div>
    : <div className="intel-saved-review is-on"><i aria-hidden /><span>In review · next {dayText(s.due!, today)}{last}</span></div>;
}

const label = (id: FeedId) => feedById(id)?.label ?? id;

function kindOf(item: SavedInsight): string {
  switch (item.kind) {
    case 'edition': return 'Edition';
    case 'section': return 'Section';
    case 'term': return 'Vocabulary';
    case 'passage': return 'Passage';
    default: return item.label ?? 'Saved';
  }
}

/** Long sections fold to a few lines until opened. */
const LONG = 420;

function SavedCard({ item, onOpen, onUpdate, onRemove, onNote, reviews, today, onReviewing }: { item: SavedInsight } & Omit<Props, 'saved' | 'due' | 'dueTomorrow' | 'onReview'>) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);
  const [tags, setTags] = useState(item.tags.join(', '));
  const [unfolded, setUnfolded] = useState(false);
  const foldable = item.kind === 'section' && item.text.length > LONG;

  const copy = () => {
    const text = item.kind === 'term' ? `${item.label} — ${copyText(item.text)}` : item.kind === 'edition' ? item.editionTitle : copyText(item.text);
    if (!navigator.clipboard) { onNote("Couldn't copy"); return; }
    navigator.clipboard.writeText(text).then(() => onNote('Copied'), () => onNote("Couldn't copy"));
  };
  const startEdit = () => { setNote(item.note); setTags(item.tags.join(', ')); setEditing(true); };
  const save = () => { onUpdate(item, { note: note.trim(), tags: parseTags(tags) }); setEditing(false); };
  const name = nameOf(item);

  return (
    <article className="intel-saved">
      <div className="intel-saved-top">
        {/* Each kept item has one heading: an edition's title, else what it is. */}
        {item.kind === 'edition' ? <span className="intel-eyebrow">{kindOf(item)}</span> : (
          <h2 className="intel-eyebrow">
            {kindOf(item)}{item.kind === 'section' && item.sectionTitle && ` · ${item.sectionTitle}`}
          </h2>
        )}
        <span className="intel-grow" />
        <button type="button" className="intel-iconbtn" onClick={copy} aria-label={`Copy ${name}`}><IconCopy /></button>
        <button type="button" className="intel-iconbtn" onClick={startEdit} aria-label={`Note and tags for ${name}`} aria-expanded={editing}><IconPencil /></button>
        <button type="button" className="intel-iconbtn" onClick={() => onRemove(item)} aria-label={`Remove ${name} from Takeaways`}><IconTrash /></button>
      </div>

      {item.kind === 'edition' && <h2 className="intel-saved-title">{item.editionTitle}</h2>}
      {item.kind === 'term' && (
        <p className="intel-saved-term"><b><Markdown inline>{item.label ?? ''}</Markdown></b> — <Markdown inline>{item.text}</Markdown></p>
      )}
      {item.kind === 'passage' && <blockquote className="intel-saved-passage">{item.text}</blockquote>}
      {(item.kind === 'section' || item.kind === 'labelled') && (
        <div className={`intel-md intel-saved-text${foldable && !unfolded ? ' is-folded' : ''}`}>
          <Markdown>{item.text}</Markdown>
        </div>
      )}
      {foldable && (
        <button type="button" className="intel-linkbtn" onClick={() => setUnfolded(u => !u)} aria-expanded={unfolded}>
          {unfolded ? 'Show less' : 'Show all'}
        </button>
      )}

      {editing ? (
        <form className="intel-saved-edit" onSubmit={e => { e.preventDefault(); save(); }}>
          <label className="ds-field">
            <span className="ds-label">Note</span>
            <textarea className="ds-textarea" value={note} onChange={e => setNote(e.target.value)} rows={3} />
          </label>
          <label className="ds-field">
            <span className="ds-label">Tags, separated by commas</span>
            <input className="ds-input" value={tags} onChange={e => setTags(e.target.value)} autoCapitalize="none" />
          </label>
          <div className="intel-saved-edit-actions">
            <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="ds-btn ds-btn--primary">Save</button>
          </div>
        </form>
      ) : (
        <>
          {item.note && <p className="intel-saved-note">{item.note}</p>}
          {item.tags.length > 0 && <ul className="intel-saved-tags">{item.tags.map(t => <li key={t}>{t}</li>)}</ul>}
        </>
      )}

      <ReviewStatusLine item={item} reviews={reviews} today={today} onReviewing={onReviewing} />

      <div className="intel-saved-foot">
        <button type="button" className="intel-saved-source" onClick={() => onOpen(item)}>
          <span>{label(item.feedId)} · {dayNameShort(item.editionDate)} {formatDayCompact(item.editionDate)}{item.kind !== 'edition' && ` · ${item.editionTitle}`}</span>
          <IconChevronRight />
        </button>
        <a className="intel-iconbtn" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open original in Google Docs"><IconExternal /></a>
      </div>
    </article>
  );
}

export function SavedView({ saved, due, dueTomorrow, onReview, ...actions }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = tagsOf(saved);
  const shown = searchSaved(saved, query, tag, label);
  const inReview = saved.filter(s => statusOf(s, actions.reviews).on).length;
  const next = due.length ? null : saved.map(s => statusOf(s, actions.reviews).due).filter((d): d is DayKey => !!d).sort()[0];
  // The share sheet on an iPad or iPhone, a download on a Mac.
  const exportShown = async () => {
    const now = new Date();
    const narrowedBy = [query.trim() && `matching “${query.trim()}”`, tag && `tagged ${tag}`].filter(Boolean).join(' and ') || null;
    if (await handOver(exportFileName(now), takeawaysMarkdown(shown, { now, narrowedBy }))) {
      actions.onNote(`Exported ${shown.length} ${shown.length === 1 ? 'takeaway' : 'takeaways'}`);
    }
  };

  return (
    <div className="intel-col intel-saved-view">
      <h1 className="intel-vh">Takeaways</h1>
      {inReview > 0 && (
        <section className="intel-review-bar-saved" aria-label="Review">
          <IconReview aria-hidden />
          <div>
            <b>{due.length ? `${due.length} to review today` : 'Nothing to review today'}</b>
            <span>
              {due.length ? (dueTomorrow ? `${dueTomorrow} more tomorrow · ` : '')
                : next ? `Next ${dayText(next, actions.today) === 'tomorrow' ? 'tomorrow' : `on ${dayText(next, actions.today)}`} · ` : ''}
              {inReview} of {saved.length} takeaways in review
            </span>
          </div>
          {due.length > 0 && <button type="button" className="ds-btn ds-btn--primary" onClick={onReview}>Start review</button>}
        </section>
      )}
      {saved.length > 0 && (
        <>
          <div className="intel-saved-tools">
            <label className="intel-search">
              <IconSearch />
              <input
                className="ds-input"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search Takeaways"
                aria-label="Search Takeaways"
              />
            </label>
            <button type="button" className="ds-btn intel-export" onClick={exportShown} disabled={!shown.length} title="Export what is listed as a Markdown file">
              <IconExport aria-hidden />Export
            </button>
          </div>
          {tags.length > 0 && (
            <div className="intel-tagbar" role="group" aria-label="Tags">
              <button type="button" aria-pressed={!tag} onClick={() => setTag(null)}>All</button>
              {tags.map(t => (
                <button key={t.tag} type="button" aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}>
                  {t.tag}<span>{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {shown.map(item => <SavedCard key={item.id} item={item} {...actions} />)}
      {!saved.length && (
        <div className="intel-empty">
          <h2>Nothing kept yet</h2>
          <p>While reading, save a section, a question, a term, a whole edition, or text you select. It is kept here, with a note and tags if you want, on all your devices.</p>
        </div>
      )}
      {saved.length > 0 && !shown.length && (
        <div className="intel-empty" role="status"><p>Nothing in Takeaways matches{query && ` “${query}”`}{tag && ` with the tag ${tag}`}.</p></div>
      )}
    </div>
  );
}

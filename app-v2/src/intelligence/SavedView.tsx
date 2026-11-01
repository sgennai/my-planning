// À retenir: everything kept from the briefings, newest first, searchable
// and filtered by tag, each with a note and tags of your own and a way back
// to where it came from. Removing one asks first.
import { useState } from 'react';
import { Markdown } from './Markdown';
import { feedById, type FeedId } from './feeds';
import { copyText } from './present';
import { searchSaved, tagsOf, parseTags, nameOf, type SavedInsight } from './saved';
import { dayNameShort, formatDayCompact } from '../routine/dates';
import { IconCopy, IconPencil, IconTrash, IconExternal, IconSearch, IconChevronRight } from '../ui/icons';

interface Props {
  saved: SavedInsight[];
  onOpen: (item: SavedInsight) => void;
  onUpdate: (item: SavedInsight, patch: { note: string; tags: string[] }) => void;
  onRemove: (item: SavedInsight) => void;
  onNote: (text: string) => void;
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

function SavedCard({ item, onOpen, onUpdate, onRemove, onNote }: { item: SavedInsight } & Omit<Props, 'saved'>) {
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
        <span className="intel-eyebrow">
          {kindOf(item)}{item.kind === 'section' && item.sectionTitle && ` · ${item.sectionTitle}`}
        </span>
        <span className="intel-grow" />
        <button type="button" className="intel-iconbtn" onClick={copy} aria-label={`Copy ${name}`}><IconCopy /></button>
        <button type="button" className="intel-iconbtn" onClick={startEdit} aria-label={`Note and tags for ${name}`} aria-expanded={editing}><IconPencil /></button>
        <button type="button" className="intel-iconbtn" onClick={() => onRemove(item)} aria-label={`Remove ${name} from À retenir`}><IconTrash /></button>
      </div>

      {item.kind === 'edition' && <h3 className="intel-saved-title">{item.editionTitle}</h3>}
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

export function SavedView({ saved, ...actions }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = tagsOf(saved);
  const shown = searchSaved(saved, query, tag, label);

  return (
    <div className="intel-col intel-saved-view">
      {saved.length > 0 && (
        <>
          <label className="intel-search">
            <IconSearch />
            <input
              className="ds-input"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search À retenir"
              aria-label="Search À retenir"
            />
          </label>
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
        <div className="intel-empty" role="status"><p>Nothing in À retenir matches{query && ` “${query}”`}{tag && ` with the tag ${tag}`}.</p></div>
      )}
    </div>
  );
}

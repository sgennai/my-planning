// Takeaways as the executive notebook (INT-56), after the user's approved
// prototype `takeaways-notebook-conversation-kit-demo.html` (outside the
// repo): "Your executive notebook.", then one workspace. On the left, Saved
// knowledge: everything kept, newest first, searched and filtered (All,
// Questions, Insights, To review, and a tag of yours). On the right, the one
// chosen, in three views: My notebook (its words as kept, tags, where it came
// from, your note, its review), Use in conversation (its role in a meeting,
// the exact words, your note and the saved items that support it, and the
// meeting kit), and the Meeting kit itself (MeetingKit.tsx).
//
// Every word of a takeaway shows as it was kept; nothing here writes to one
// but your note and your tags. What the list shows can still be exported as
// a Markdown file (export.ts), and removing a takeaway still asks first.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Markdown } from './Markdown';
import { feedById, type FeedId } from './feeds';
import { plainText } from './present';
import { parseTags, tagsOf, type SavedInsight } from './saved';
import { canReview, dayText, statusOf, RATINGS, type ReviewIndex } from './review';
import {
  noteKindOf, NOTE_KIND_LABEL, keptAsOf, placeOf, wordsOf, standingOf, STANDING_LABEL, notebookList, supportingOf, isQuotable, FILTERS,
  dateOf, listTextOf, type NotebookState, type NotebookView,
} from './notebook';
import { roleInfo, roleOf, ROLES, kitSections, kitSize, wordingOf, type Kit, type Role } from './kit';
import { MeetingKit } from './MeetingKit';
import { useDraft } from './useDraft';
import { dayNameShort, type DayKey } from '../routine/dates';
import { takeawaysMarkdown, exportFileName, handOver } from './export';
import { IconChevronDown, IconExport } from '../ui/icons';

export interface NotebookActions {
  onOpen: (item: SavedInsight) => void;
  /** A note or tags, as written; nothing else of a takeaway is ever changed. */
  onPatch: (item: SavedInsight, patch: { note?: string; tags?: string[] }) => void;
  onRemove: (item: SavedInsight) => void;
  onNote: (text: string) => void;
  onReview: () => void;
  onReviewOne: (item: SavedInsight) => void;
  onReviewing: (item: SavedInsight, on: boolean) => void;
  onRole: (item: SavedInsight, role: Role) => void;
  onKit: (item: SavedInsight, inKit: boolean) => void;
  onKitLabel: (label: string) => void;
}

interface Props extends NotebookActions {
  saved: SavedInsight[];
  reviews: ReviewIndex;
  today: DayKey;
  /** Due for review today. */
  due: SavedInsight[];
  kit: Kit;
  /** The topics its edition lists, when the edition is on this device. */
  topicsOf: (item: SavedInsight) => string[];
  state: NotebookState;
  onState: (patch: Partial<NotebookState>) => void;
}

const feedLabel = (id: FeedId) => feedById(id)?.label ?? id;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** How many of its edition's topics a takeaway lists before "+n". */
const TOPICS_SHOWN = 6;
/** Where the stacked layout starts (the prototype's 620px). */
const STACKED = '(max-width: 620px)';

const VIEWS: { id: NotebookView; label: string }[] = [
  { id: 'notebook', label: 'My notebook' },
  { id: 'conversation', label: 'Use in conversation' },
];

function Entry({ item, on, panel, reviews, today, onSelect }: {
  item: SavedInsight; on: boolean; panel: string; reviews: ReviewIndex; today: DayKey; onSelect: () => void;
}) {
  const standing = standingOf(item, reviews, today);
  const text = listTextOf(item);
  return (
    <li>
      <button type="button" className={`tk-entry${on ? ' is-on' : ''}`} aria-current={on || undefined} aria-controls={panel} onClick={onSelect}>
        <span className="tk-entry-top">
          <span className="tk-chip">{NOTE_KIND_LABEL[noteKindOf(item)]}</span>
          {standing && <span className={`tk-status is-${standing}`}>{STANDING_LABEL[standing]}</span>}
        </span>
        <strong className={text.length > 280 ? 'is-long' : undefined}>{text}</strong>
        <small>{feedLabel(item.feedId)} · {dateOf(item.editionDate)}</small>
      </button>
    </li>
  );
}

/** The words kept: large when they are one short paragraph, else at reading size, every word either way. */
function Kept({ item, quoteId }: { item: SavedInsight; quoteId: string }) {
  if (item.kind === 'edition') return <h2 className="tk-quote" id={quoteId}>{item.editionTitle}</h2>;
  if (item.kind === 'term') {
    return (
      <>
        <h2 className="tk-quote" id={quoteId}><Markdown inline>{item.label ?? ''}</Markdown></h2>
        <div className="tk-longtext"><Markdown>{item.text}</Markdown></div>
      </>
    );
  }
  if (isQuotable(item.text)) return <h2 className="tk-quote" id={quoteId}><Markdown inline>{item.text}</Markdown></h2>;
  return (
    <>
      <h2 className="intel-vh" id={quoteId}>{wordsOf(item)}</h2>
      <div className="tk-longtext"><Markdown>{item.text}</Markdown></div>
    </>
  );
}

function NoteField({ item, onPatch, fieldRef }: { item: SavedInsight; onPatch: NotebookActions['onPatch']; fieldRef: RefObject<HTMLTextAreaElement | null> }) {
  const id = useId();
  const { draft, setDraft, flush, justSaved } = useDraft(item.note, note => onPatch(item, { note }));
  return (
    <div className="tk-notefield">
      <div className="tk-label-row">
        <label className="tk-label" htmlFor={id}>My personal note</label>
        <span className="tk-saved" role="status">{justSaved ? 'Saved' : ''}</span>
      </div>
      <textarea
        id={id}
        ref={fieldRef}
        className="tk-note"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={flush}
        placeholder="Why does this matter? When could I use it?"
      />
    </div>
  );
}

function Tags({ item, onPatch, onNote, onTag }: { item: SavedInsight; onPatch: NotebookActions['onPatch']; onNote: (t: string) => void; onTag: (tag: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const id = useId();
  const start = () => { setValue(item.tags.join(', ')); setEditing(true); };
  if (editing) {
    return (
      <form className="tk-tagedit" onSubmit={e => { e.preventDefault(); onPatch(item, { tags: parseTags(value) }); onNote('Tags saved'); setEditing(false); }}>
        <label className="tk-label" htmlFor={id}>Tags, separated by commas</label>
        <input id={id} className="tk-input" value={value} onChange={e => setValue(e.target.value)} autoCapitalize="none" autoFocus />
        <div className="tk-actions">
          <button type="submit" className="tk-btn is-primary">Save tags</button>
          <button type="button" className="tk-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="tk-tags">
      {item.tags.map(t => (
        <button key={t} type="button" className="tk-tag" onClick={() => onTag(t)} aria-label={`${t}: show the takeaways tagged ${t}`}>{t}</button>
      ))}
      <button type="button" className="tk-thin" onClick={start}>{item.tags.length ? 'Edit tags' : 'Add tags'}</button>
    </div>
  );
}

function ReviewLine({ item, reviews, today, onReviewing }: { item: SavedInsight; reviews: ReviewIndex; today: DayKey; onReviewing: NotebookActions['onReviewing'] }) {
  if (!canReview(item)) return null;
  const s = statusOf(item, reviews);
  const last = s.confidence ? ` · last time: ${RATINGS[s.confidence - 1].label.toLowerCase()}` : '';
  const due = s.on && s.due && s.due <= today;
  const text = !s.on ? 'Not in review' : due ? `Due for review today${last}` : `In review · next ${dayText(s.due!, today)}${last}`;
  return (
    <p className={`tk-review${due ? ' is-due' : s.on ? ' is-on' : ''}`}>
      <i aria-hidden />
      <span>{text}</span>
      <button type="button" className="tk-thin" onClick={() => onReviewing(item, !s.on)}>{s.on ? 'Take out of review' : 'Add to review'}</button>
    </p>
  );
}

function Notebook({ item, reviews, today, topics, noteRef, actions, onView, onTag }: {
  item: SavedInsight; reviews: ReviewIndex; today: DayKey; topics: string[]; noteRef: RefObject<HTMLTextAreaElement | null>;
  actions: NotebookActions; onView: (v: NotebookView) => void; onTag: (tag: string) => void;
}) {
  const quoteId = useId();
  const place = placeOf(item);
  const s = statusOf(item, reviews);
  const due = canReview(item) && s.on && !!s.due && s.due <= today;
  return (
    <article className="tk-detail" aria-labelledby={quoteId}>
      <p className="tk-label">{NOTE_KIND_LABEL[noteKindOf(item)]} · {place ?? keptAsOf(item)} · Saved from {feedLabel(item.feedId)}</p>
      <Kept item={item} quoteId={quoteId} />
      <Tags item={item} onPatch={actions.onPatch} onNote={actions.onNote} onTag={onTag} />
      {topics.length > 0 && <p className="tk-meta">Topics of the edition · {topics.slice(0, TOPICS_SHOWN).join(', ')}{topics.length > TOPICS_SHOWN && ` +${topics.length - TOPICS_SHOWN}`}</p>}
      <p className="tk-meta">
        Original source · {feedLabel(item.feedId)}, {dayNameShort(item.editionDate)} {dateOf(item.editionDate)}{item.editionTime && `, ${item.editionTime}`}
        {item.kind !== 'edition' && <> · <cite>{item.editionTitle}</cite></>}{place && ` · ${place}`}. The saved wording is preserved exactly.
      </p>
      <p className="tk-sources">
        <button type="button" className="tk-source" onClick={() => actions.onOpen(item)}>Open the edition</button>
        <a className="tk-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Original in Google Docs<span aria-hidden> ↗</span></a>
      </p>
      <div className="tk-divider" />
      <NoteField key={item.id} item={item} onPatch={actions.onPatch} fieldRef={noteRef} />
      <ReviewLine item={item} reviews={reviews} today={today} onReviewing={actions.onReviewing} />
      <div className="tk-actions">
        {due && <button type="button" className="tk-btn is-primary" onClick={() => actions.onReviewOne(item)}>Review now</button>}
        <button type="button" className="tk-btn" onClick={() => onView('conversation')}>Use in a conversation<span aria-hidden> →</span></button>
      </div>
      <p className="tk-removerow">
        <button type="button" className="tk-quiet" onClick={() => actions.onRemove(item)} aria-label={`Remove from Takeaways: ${wordsOf(item)}`}>Remove from Takeaways</button>
      </p>
    </article>
  );
}

function Conversation({ item, kit, saved, topicsOf, actions, onSelect, onWriteNote }: {
  item: SavedInsight; kit: Kit; saved: SavedInsight[]; topicsOf: (item: SavedInsight) => string[];
  actions: NotebookActions; onSelect: (id: string) => void; onWriteNote: () => void;
}) {
  const roleLabel = useId();
  const headId = useId();
  const { role, chosen } = roleOf(kit, item);
  const inKit = kit.members.has(item.id);
  const kind = noteKindOf(item);
  const place = placeOf(item);
  const supporting = supportingOf(item, saved, topicsOf);
  const copy = () => {
    if (!navigator.clipboard) { actions.onNote("Couldn't copy"); return; }
    navigator.clipboard.writeText(wordingOf(item)).then(() => actions.onNote('Copied the exact wording'), () => actions.onNote("Couldn't copy"));
  };
  return (
    <article className="tk-detail" aria-labelledby={headId}>
      <p className="tk-label">From the notebook · {feedLabel(item.feedId)} · {dateOf(item.editionDate)}</p>
      <h2 className="tk-h" id={headId}>Make this usable in the room.</h2>
      <p className="tk-purpose">Keep the original text intact. Decide where it belongs in the conversation, pair it with a supporting insight, then add it to the meeting kit.</p>
      <div className="tk-divider" />
      <p className="tk-label" id={roleLabel}>Conversation role <span className="tk-label-note">· {chosen ? 'editable' : 'suggested, yours to change'}</span></p>
      <div className="tk-roles" role="group" aria-labelledby={roleLabel}>
        {ROLES.map(r => (
          <button key={r.id} type="button" className="tk-role" aria-pressed={r.id === role} onClick={() => actions.onRole(item, r.id)}>{r.label}</button>
        ))}
      </div>
      <p className="tk-role-purpose">{roleInfo(role).purpose}</p>
      <figure className="tk-card">
        <p className="tk-label">Exact original {item.kind === 'term' ? 'term' : kind}</p>
        {item.kind !== 'term' && item.kind !== 'edition' && !isQuotable(item.text)
          ? <div className="tk-card-long"><Markdown>{item.text}</Markdown></div>
          : <blockquote className="tk-card-quote">“{plainText(wordingOf(item))}”</blockquote>}
        <figcaption className="tk-meta">
          {feedLabel(item.feedId)} · {dateOf(item.editionDate)}{place && ` · ${place}`} · {roleInfo(role).label}
        </figcaption>
      </figure>
      <div className="tk-context">
        <section className="tk-mini" aria-label="Why I saved this">
          <p className="tk-label">Why I saved this</p>
          <h3>My note</h3>
          {item.note
            ? <p className="tk-mini-note">{item.note}</p>
            : <p>Add a personal note in My notebook to connect this idea to a client situation. <button type="button" className="tk-thin" onClick={onWriteNote}>Write a note</button></p>}
        </section>
        <section className="tk-mini" aria-label="Possible supporting material">
          <p className="tk-label">Possible supporting material</p>
          <h3>Related saved knowledge</h3>
          {supporting.length ? (
            <ul className="tk-supporting">
              {supporting.map(({ item: other, why }) => (
                <li key={other.id}>
                  <button type="button" className="tk-support" onClick={() => onSelect(other.id)}>{listTextOf(other)}</button>
                  <small>{why} · {feedLabel(other.feedId)} · {dateOf(other.editionDate)}</small>
                </li>
              ))}
            </ul>
          ) : <p>No other takeaway shares a tag, an edition or a topic with this one yet.</p>}
        </section>
      </div>
      <p className="tk-hint">The role is yours, for this meeting: it is not part of the publication, and the original {kind} never changes.</p>
      <div className="tk-actions">
        <button type="button" className={`tk-btn ${inKit ? 'is-soft' : 'is-primary'}`} onClick={() => actions.onKit(item, !inKit)}>
          {inKit ? <>✓ Added to meeting kit<span className="intel-vh">: take it out</span></> : '+ Add to meeting kit'}
        </button>
        <button type="button" className="tk-btn" onClick={copy}>Copy exact wording</button>
      </div>
    </article>
  );
}

function Empty({ state, saved, due, reviews, today }: { state: NotebookState; saved: SavedInsight[]; due: number; reviews: ReviewIndex; today: DayKey }) {
  if (!saved.length) {
    return (
      <div className="tk-empty">
        <b>Nothing kept yet.</b> While reading, save a question, a line, a term, a passage or a whole edition: it comes here with its exact words, on all your devices.
      </div>
    );
  }
  const q = state.query.trim();
  if (q || state.tag) {
    return <div className="tk-empty" role="status">No saved item matches{q && ` “${q}”`}{state.tag && ` with the tag ${state.tag}`}.</div>;
  }
  if (state.filter === 'questions') return <div className="tk-empty">No question saved yet. Save one from an edition's questions and it shows here.</div>;
  if (state.filter === 'insights') return <div className="tk-empty">Only questions are saved so far. Lines, terms, passages and sections you save show here.</div>;
  if (state.filter === 'due' && !due) {
    const next = saved.map(s => statusOf(s, reviews)).filter(s => s.on && s.due).map(s => s.due!).sort()[0];
    return <div className="tk-empty">Nothing is due for review today.{next && ` The next comes back ${dayText(next, today) === 'tomorrow' ? 'tomorrow' : `on ${dayText(next, today)}`}.`}</div>;
  }
  return null;
}

export function SavedView({ saved, reviews, today, due, kit, topicsOf, state, onState, ...actions }: Props) {
  const panelId = useId();
  const tabBase = useId();
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  // "Write a note" goes to My notebook, then to its field.
  const wantNote = useRef(false);
  // The tags to filter by, shown from the filters' Tags.
  const [tagsOpen, setTagsOpen] = useState(false);
  const shown = notebookList(saved, state, reviews, today, feedLabel, topicsOf);
  const item = saved.find(s => s.id === state.selected) ?? shown[0] ?? saved[0] ?? null;
  const tags = tagsOf(saved);
  const sections = kitSections(kit, saved);
  const inKit = kitSize(sections);
  const view = state.view;

  useEffect(() => {
    if (wantNote.current && view === 'notebook') { wantNote.current = false; noteRef.current?.focus(); }
  }, [view]);

  const select = (id: string) => {
    onState({ selected: id, view: 'notebook' });
    // Stacked, the chosen item is below the list: it comes into view.
    if (!window.matchMedia?.(STACKED).matches) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rightRef.current?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  };
  const setView = (v: NotebookView) => onState({ view: v, ...(item && v !== 'kit' ? { selected: item.id } : {}) });
  const showTag = (tag: string) => { onState({ tag, filter: 'all' }); setTagsOpen(true); };
  const tabs: { id: NotebookView; label: string }[] = [...VIEWS, { id: 'kit', label: 'Meeting kit' }];
  const onTabKey = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const at = tabs.findIndex(t => t.id === view);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setView(tabs[next].id);
    tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  const tab = (t: { id: NotebookView; label: string }, className: string, content: ReactNode = t.label) => (
    <button
      key={t.id}
      type="button"
      role="tab"
      id={`${tabBase}-${t.id}`}
      className={className}
      aria-selected={view === t.id}
      aria-controls={panelId}
      tabIndex={view === t.id ? 0 : -1}
      onClick={() => setView(t.id)}
    >{content}</button>
  );

  // The share sheet on an iPad or iPhone, a download on a Mac.
  const exportShown = async () => {
    const now = new Date();
    const narrowedBy = [
      state.filter !== 'all' && `in ${FILTERS.find(f => f.id === state.filter)!.label}`,
      state.query.trim() && `matching “${state.query.trim()}”`,
      state.tag && `tagged ${state.tag}`,
    ].filter(Boolean).join(' and ') || null;
    if (await handOver(exportFileName(now), takeawaysMarkdown(shown, { now, narrowedBy }))) {
      actions.onNote(`Exported ${plural(shown.length, 'takeaway')}`);
    }
  };

  return (
    <div className="tk">
      <header className="tk-hero">
        <div>
          <p className="tk-eyebrow">Saved intelligence · Ready for action</p>
          <h1 className="tk-title">Your executive notebook.</h1>
          <p className="tk-lede">Capture the exact idea. Add your perspective. Turn it into a question or an argument you can use in the room.</p>
        </div>
        <div className="tk-metrics">
          <p className="tk-metric"><strong>{saved.length}</strong><span>{saved.length === 1 ? 'Takeaway' : 'Takeaways'}</span></p>
          <p className="tk-metric"><strong>{inKit}</strong><span>In meeting kit</span></p>
        </div>
      </header>

      <div className="tk-workspace">
        <section className="tk-left" aria-labelledby={`${tabBase}-library`}>
          <div className="tk-panel-head">
            <div className="tk-panel-title">
              <h2 id={`${tabBase}-library`}>Saved knowledge</h2>
              <span className="tk-tiny">{plural(shown.length, 'item')}</span>
            </div>
            {saved.length > 0 && (
              <>
                <input
                  className="tk-search"
                  type="search"
                  value={state.query}
                  onChange={e => onState({ query: e.target.value })}
                  placeholder="Search questions, topics, sources…"
                  aria-label="Search saved knowledge"
                />
                <div className="tk-filters" role="group" aria-label="Show">
                  {FILTERS.map(f => (
                    <button key={f.id} type="button" className="tk-filter" aria-pressed={state.filter === f.id} onClick={() => onState({ filter: f.id })}>{f.label}</button>
                  ))}
                </div>
                <div className="tk-tools">
                  {tags.length > 0 ? (
                    <button
                      type="button"
                      className="tk-filter tk-tagpick"
                      aria-pressed={!!state.tag}
                      aria-expanded={tagsOpen}
                      aria-controls={`${tabBase}-tags`}
                      onClick={() => setTagsOpen(o => !o)}
                    >{state.tag ? `Tag: ${state.tag}` : 'Tags'}<IconChevronDown aria-hidden /></button>
                  ) : <span />}
                  <button type="button" className="tk-thin tk-export" onClick={exportShown} disabled={!shown.length} title="Export what is listed as a Markdown file">
                    <IconExport aria-hidden />Export
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="tk-tagrow" id={`${tabBase}-tags`} role="group" aria-label="Tags" hidden={!tagsOpen}>
                    <button type="button" className="tk-tag" aria-pressed={!state.tag} onClick={() => onState({ tag: null })}>Any tag</button>
                    {tags.map(t => (
                      <button key={t.tag} type="button" className="tk-tag" aria-pressed={state.tag === t.tag} onClick={() => onState({ tag: state.tag === t.tag ? null : t.tag })}>
                        {t.tag} <span>{t.count}</span>
                      </button>
                    ))}
                  </div>
                )}
                {due.length > 0 && (
                  <p className="tk-dueline">{due.length} to review today <button type="button" className="tk-thin" onClick={actions.onReview}>Start review</button></p>
                )}
              </>
            )}
          </div>
          {shown.length > 0
            ? (
              <ul className="tk-list" aria-labelledby={`${tabBase}-library`}>
                {shown.map(s => <Entry key={s.id} item={s} on={s.id === item?.id} panel={panelId} reviews={reviews} today={today} onSelect={() => select(s.id)} />)}
              </ul>
            )
            : <div className="tk-list-empty"><Empty state={state} saved={saved} due={due.length} reviews={reviews} today={today} /></div>}
        </section>

        <section className="tk-right" aria-label="Selected knowledge and meeting kit" ref={rightRef}>
          <div className="tk-right-top" role="tablist" aria-label="Takeaways view" ref={tabsRef} onKeyDown={onTabKey}>
            <div className="tk-viewtabs" role="presentation">{VIEWS.map(t => tab(t, 'tk-viewtab'))}</div>
            {tab({ id: 'kit', label: 'Meeting kit' }, 'tk-kitbtn', <>Meeting kit · {inKit}<span className="intel-vh"> {inKit === 1 ? 'item' : 'items'}</span></>)}
          </div>
          <div className="tk-right-body" role="tabpanel" id={panelId} aria-labelledby={`${tabBase}-${view}`}>
            {view === 'kit'
              ? (
                <MeetingKit
                  sections={sections}
                  label={kit.label}
                  today={today}
                  onLabel={actions.onKitLabel}
                  onOut={i => actions.onKit(i, false)}
                  onRole={i => onState({ selected: i.id, view: 'conversation' })}
                  onBack={() => setView('notebook')}
                  onNote={actions.onNote}
                />
              )
              : !item
                ? <div className="tk-empty">Save something while reading and it opens here: its exact words, your note, and how to use it in a conversation.</div>
                : view === 'conversation'
                  ? <Conversation item={item} kit={kit} saved={saved} topicsOf={topicsOf} actions={actions} onSelect={id => onState({ selected: id })} onWriteNote={() => { wantNote.current = true; setView('notebook'); }} />
                  : <Notebook item={item} reviews={reviews} today={today} topics={topicsOf(item)} noteRef={noteRef} actions={actions} onView={setView} onTag={showTag} />}
          </div>
        </section>
      </div>
    </div>
  );
}

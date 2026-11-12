// The AI Challenge as an executive memo (INT-50), after the approved
// prototype: a quiet bar (history, the run's date and time, a 2px reading
// line), the title, the edition's relevant topics, its one-sentence
// challenge, then each section numbered in the margin, and at the end the
// topic map and the related editions, both folded. Every word of the document
// is here, in its order; only the topic map moves to the end (`memo.ts`).
// Saving goes to Takeaways as before (`EditionActionsContext`).
import { useState, type RefObject } from 'react';
import { Markdown } from './Markdown';
import type { Edition, Section } from './parse';
import type { Presentation, Labelled, Term } from './present';
import type { Related } from './related';
import type { SaveInput } from './saved';
import { feedById } from './feeds';
import { useEditionActions } from './context';
import { asideNote } from './artifacts';
import { memoOrder, memoTopics, challengeLead, memoDate, barDate, shortDate, two, TOPICS_SHOWN } from './memo';
import { shortTitle } from './present';

/** Related editions shown before "Show more", and how many more each time. */
const RELATED_FIRST = 5;
const RELATED_MORE = 10;

const Bookmark = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" aria-hidden>
    <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4z" />
  </svg>
);
const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** Save to Takeaways, and Saved: one per question or line; a term's, the mark alone. */
function MemoSave({ input, name, quiet = false }: { input: SaveInput; name: string; quiet?: boolean }) {
  const { savedItem, toggleSave } = useEditionActions();
  const saved = !!savedItem(input);
  if (quiet) {
    return (
      <button
        type="button"
        className="memo-sec-save"
        aria-pressed={saved}
        aria-label={saved ? `Remove saved ${name}` : `Save ${name}`}
        title={saved ? 'Saved to Takeaways' : 'Save to Takeaways'}
        onClick={() => toggleSave(input)}
      ><Bookmark /></button>
    );
  }
  return (
    <button
      type="button"
      className="memo-save"
      aria-pressed={saved}
      aria-label={saved ? `Remove saved ${name}` : `Save ${name}`}
      title={saved ? 'Saved to Takeaways' : 'Save to Takeaways'}
      onClick={() => toggleSave(input)}
    ><Bookmark /><span>{saved ? 'Saved' : 'Save'}</span></button>
  );
}

/** The whole section to Takeaways: quiet, in the margin. */
function SectionSave({ section }: { section: Section }) {
  const { savedItem, toggleSave } = useEditionActions();
  const input: SaveInput = { kind: 'section', sectionId: section.id, sectionTitle: section.title, text: section.markdown };
  const saved = !!savedItem(input);
  const name = shortTitle(section.title);
  return (
    <button
      type="button"
      className="memo-sec-save"
      aria-pressed={saved}
      aria-label={saved ? `${name}: saved to Takeaways. Remove` : `Save the section ${name} to Takeaways`}
      title={saved ? 'Section saved to Takeaways' : 'Save this section'}
      onClick={() => toggleSave(input)}
    ><Bookmark /></button>
  );
}

function Topics({ label, topics }: { label: string; topics: string[] }) {
  const [all, setAll] = useState(false);
  const shown = topics.slice(0, TOPICS_SHOWN), more = topics.slice(TOPICS_SHOWN);
  return (
    <div className="memo-topics" id="memo-topics">
      <span className="memo-topics-head">{label}</span>
      <span className="memo-topics-list">
        {shown.map((t, i) => <span key={`${i}-${t}`}>{i > 0 && <span className="memo-dot" aria-hidden />}<b>{t}</b></span>)}
        {all && more.map((t, i) => <span key={`m${i}-${t}`}><span className="memo-dot" aria-hidden />{t}</span>)}
      </span>
      {more.length > 0 && (
        <button type="button" className="memo-more-topics" aria-expanded={all} aria-controls="memo-topics" onClick={() => setAll(a => !a)}>
          {all ? 'Show less' : `+${more.length} topic${more.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function Question({ item, section }: { item: Labelled; section: Section }) {
  return (
    <div className="memo-question">
      <div className="memo-question-top">
        <h3 className="memo-question-label"><Markdown inline>{item.label}</Markdown></h3>
        <MemoSave name={item.label.toLowerCase()} input={{ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label: item.label, text: item.text }} />
      </div>
      <blockquote><Markdown>{item.text}</Markdown></blockquote>
    </div>
  );
}

function Vocabulary({ terms, notes, section }: { terms: Term[]; notes: Labelled[]; section: Section }) {
  return (
    <>
      <div className="memo-vocab">
        {terms.map((t, i) => (
          <div key={i} className="memo-term">
            <span className="memo-term-n" aria-hidden>{two(t.n ?? i + 1)}</span>
            <div>
              <strong><Markdown inline>{t.term}</Markdown></strong>
              <span className="memo-term-def"><Markdown inline>{t.definition}</Markdown></span>
            </div>
            <MemoSave quiet name={`the term ${t.term}`} input={{ kind: 'term', sectionId: section.id, sectionTitle: section.title, label: t.term, text: t.definition }} />
          </div>
        ))}
      </div>
      {notes.map((n, i) => (
        <div key={i} className="memo-conversation">
          <div className="memo-conversation-top">
            <h3 className="memo-conversation-label"><Markdown inline>{`${n.label}:`}</Markdown></h3>
            <MemoSave name={`the line ${n.label.toLowerCase()}`} input={{ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label: n.label, text: n.text }} />
          </div>
          <blockquote><Markdown>{n.text}</Markdown></blockquote>
        </div>
      ))}
    </>
  );
}

/** A section's words in the memo's forms; anything else as the Markdown it is. */
function Body({ section, p, markdown }: { section: Section; p: Presentation | undefined; markdown: string }) {
  switch (p?.kind) {
    case 'numbered':
      return (
        <div className="memo-approaches">
          {p.items.map((item, i) => (
            <div key={i} className="memo-approach">
              <span className="memo-approach-no" aria-hidden>{two(item.n)}</span>
              <div>
                <h3><Markdown inline>{item.title}</Markdown></h3>
                {item.body && <Markdown>{item.body}</Markdown>}
              </div>
            </div>
          ))}
        </div>
      );
    case 'quotes':
      return <div className="memo-listen"><Markdown>{p.markdown}</Markdown></div>;
    case 'questions':
      return <div className="memo-questions">{p.items.map((q, i) => <Question key={i} item={q} section={section} />)}</div>;
    case 'vocabulary':
      return <Vocabulary terms={p.terms} notes={p.notes} section={section} />;
    default:
      return <Markdown>{markdown}</Markdown>;
  }
}

export interface MemoProps {
  edition: Edition;
  sections: Section[];
  presented: Map<string, Presentation>;
  minutes: number;
  /** The sticky bar, and the reading line along its foot. */
  barRef: RefObject<HTMLElement | null>;
  fillRef: RefObject<HTMLDivElement | null>;
  /** Where the briefing ends, before the reference at its foot. */
  endRef: RefObject<HTMLDivElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  onHistory?: () => void;
  historyOpen?: boolean;
  related: Related[];
  onOpenRelated?: (e: Edition) => void;
  read: boolean;
  editionSaved: boolean;
  onToggleRead?: () => void;
  onToggleEditionSave?: () => void;
  notices: string[];
  imported: boolean;
}

export function MemoArticle({
  edition, sections, presented, minutes, barRef, fillRef, endRef, articleRef, onHistory, historyOpen = false,
  related, onOpenRelated, read, editionSaved, onToggleRead, onToggleEditionSave, notices, imported,
}: MemoProps) {
  const { body, map } = memoOrder(sections);
  const mapForm = map ? presented.get(map.id) : undefined;
  const topics = memoTopics(edition, mapForm);
  const challenge = body.find(s => challengeLead(s, presented.get(s.id)));
  const lead = challenge ? challengeLead(challenge, presented.get(challenge.id)) : null;
  const [relatedShown, setRelatedShown] = useState(RELATED_FIRST);
  const titleId = `intel-title-${edition.driveFileId}`;
  let n = 0;

  return (
    <div className="memo">
      <header className="memo-bar" ref={barRef} data-sticky>
        <div className="memo-brand">
          {onHistory && (
            <button
              type="button"
              className="memo-hamburger"
              aria-label="Open challenge history"
              aria-controls="memo-history"
              aria-expanded={historyOpen}
              title="Browse all challenges"
              onClick={onHistory}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          )}
          <span className="memo-brand-text">AI Challenge</span>
        </div>
        <span className="memo-bar-date">{barDate(edition.editionDate, edition.time)}</span>
        <div className="memo-track" aria-hidden><div className="memo-fill" ref={fillRef} /></div>
      </header>

      <div className="memo-content">
        <article aria-labelledby={titleId} ref={articleRef}>
          <div className="memo-subline">
            <span className="memo-eyebrow">The executive memo <span aria-hidden>/</span> {memoDate(edition.editionDate)}{imported && <> <span aria-hidden>/</span> Imported</>}</span>
            <span className="memo-eyebrow">{two(minutes)} min read</span>
          </div>
          <h1 className="memo-title" id={titleId}>{edition.title}</h1>
          {topics && <Topics label={topics.label} topics={topics.topics} />}
          {notices.map(t => <p key={t} className="memo-aside is-alert" role="note">{t}</p>)}
          {edition.setAside.filter(a => a.where === 'start').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}

          {lead && (
            <div className="memo-summary">
              <div className="memo-summary-label">In one sentence</div>
              <p><Markdown inline>{lead.lead}</Markdown></p>
            </div>
          )}

          {body.map(s => {
            const plain = !s.title || s.role === 'title';
            const index = plain ? null : two(++n);
            const markdown = s === challenge && lead ? lead.rest : s.markdown;
            return (
              <section key={s.id} id={`intel-${s.id}`} data-section={s.id} className="memo-section">
                <div className="memo-index">
                  {index && <span className="memo-idx" aria-hidden>{index}</span>}
                  {s.title && <h2 className="memo-idx-label"><Markdown inline heading>{s.title}</Markdown></h2>}
                  {!plain && onToggleEditionSave && <SectionSave section={s} />}
                </div>
                <div className="memo-body"><Body section={s} p={s === challenge ? undefined : presented.get(s.id)} markdown={markdown} /></div>
              </section>
            );
          })}
          <div ref={endRef} aria-hidden="true" />
          {edition.setAside.filter(a => a.where === 'end').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}

          {map && (
            <details className="memo-ref" id={`intel-${map.id}`} data-section={map.id}>
              <summary>
                <Chevron />
                <span><Markdown inline heading>{map.title}</Markdown>{mapForm?.kind === 'topics' && <span className="memo-ref-note"> · All {mapForm.topics.length} topics</span>}</span>
              </summary>
              <div className="memo-map">
                {mapForm?.kind === 'topics' ? <p>{mapForm.topics.join(' • ')}</p> : <Markdown>{map.markdown}</Markdown>}
              </div>
            </details>
          )}
          {related.length > 0 && (
            <details className="memo-ref memo-ref--related">
              <summary><Chevron /><span>Related by topic</span></summary>
              <ol className="memo-related">
                {related.slice(0, relatedShown).map(({ edition: e, shares }) => (
                  <li key={e.driveFileId}>
                    <button type="button" className="memo-related-item" onClick={() => onOpenRelated?.(e)}>
                      <span className="memo-related-title">{e.title}</span>
                      <span className="memo-related-meta">
                        {shortDate(e.editionDate)} {e.editionDate.slice(0, 4)}{e.time && ` · ${e.time}`}
                        {e.feedId !== edition.feedId && ` · ${feedById(e.feedId)?.name ?? e.feedId}`}
                      </span>
                      <span className="memo-related-shares">Shared: {shares.join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {related.length > relatedShown && (
                <button type="button" className="memo-related-more" onClick={() => setRelatedShown(c => c + RELATED_MORE)}>
                  Show more ({related.length - relatedShown})
                </button>
              )}
            </details>
          )}

          <footer className="memo-footer">
            <span>AI Challenge · End of edition</span>
            <span>{memoDate(edition.editionDate)}</span>
          </footer>
          <div className="memo-tools">
            {onToggleRead && <button type="button" aria-pressed={read} onClick={onToggleRead}>{read ? 'Read · Mark as unread' : 'Mark as read'}</button>}
            {onToggleEditionSave && <button type="button" aria-pressed={editionSaved} onClick={onToggleEditionSave}>{editionSaved ? 'Edition saved to Takeaways' : 'Save this edition'}</button>}
            <a href={edition.sourceUrl} target="_blank" rel="noopener noreferrer">Open original in Google Docs</a>
          </div>
        </article>
      </div>
    </div>
  );
}

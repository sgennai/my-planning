// The AI Challenge as an executive memo (INT-50), after the approved
// prototype: the title, the edition's relevant topics, its one-sentence
// challenge, then each section numbered in the margin, and at the end the
// topic map and the related editions, both folded. Every word of the document
// is here, in its order; only the topic map moves to the end (`memo.ts`).
// Saving goes to Takeaways as before (`EditionActionsContext`). The topics,
// Save, folds and end are the briefs' memos' too (`MemoParts`); the bar and
// the edition index above and beside it, the workspace's (`MemoWorkspace`).
import type { RefObject } from 'react';
import { Markdown } from './Markdown';
import type { Edition, Section } from './parse';
import type { Presentation, Labelled, Term } from './present';
import type { Related } from './related';
import { asideNote } from './artifacts';
import { memoOrder, memoTopics, challengeLead, memoBrand, two } from './memo';
import { MemoEnd, MemoHead, MemoSave, RefFold, RelatedFold, Topics } from './MemoParts';

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

/** What both memos are given (`EditionReader`). */
export interface MemoProps {
  edition: Edition;
  sections: Section[];
  presented: Map<string, Presentation>;
  minutes: number;
  /** Where the briefing ends, before the reference at its foot. */
  endRef: RefObject<HTMLDivElement | null>;
  articleRef: RefObject<HTMLElement | null>;
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
  edition, sections, presented, minutes, endRef, articleRef,
  related, onOpenRelated, read, editionSaved, onToggleRead, onToggleEditionSave, notices, imported,
}: MemoProps) {
  const brand = memoBrand(edition.feedId)!;
  const { body, map } = memoOrder(sections);
  const mapForm = map ? presented.get(map.id) : undefined;
  const topics = memoTopics(edition, mapForm);
  const challenge = body.find(s => challengeLead(s, presented.get(s.id)));
  const lead = challenge ? challengeLead(challenge, presented.get(challenge.id)) : null;
  const titleId = `intel-title-${edition.driveFileId}`;
  let n = 0;

  return (
    <div className="memo">

      <MemoHead brand={brand} edition={edition} imported={imported} details={[`${two(minutes)} min read`]} read={read} onToggleRead={onToggleRead} />

      <div className="memo-content">
        <article aria-labelledby={titleId} ref={articleRef}>
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
                </div>
                <div className="memo-body"><Body section={s} p={s === challenge ? undefined : presented.get(s.id)} markdown={markdown} /></div>
              </section>
            );
          })}
          <div ref={endRef} aria-hidden="true" />
          {edition.setAside.filter(a => a.where === 'end').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}

          {map && (
            <RefFold
              id={`intel-${map.id}`}
              section={map.id}
              summary={<><Markdown inline heading>{map.title}</Markdown>{mapForm?.kind === 'topics' && <span className="memo-ref-note"> · All {mapForm.topics.length} topics</span>}</>}
            >
              <div className="memo-map">
                {mapForm?.kind === 'topics' ? <p>{mapForm.topics.join(' • ')}</p> : <Markdown>{map.markdown}</Markdown>}
              </div>
            </RefFold>
          )}
          <RelatedFold edition={edition} related={related} onOpen={onOpenRelated} />

          <MemoEnd brand={brand} edition={edition} read={read} editionSaved={editionSaved} onToggleRead={onToggleRead} onToggleEditionSave={onToggleEditionSave} />
        </article>
      </div>
    </div>
  );
}

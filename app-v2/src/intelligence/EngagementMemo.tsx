// The Customer Engagement Brief as an executive memo (INT-52), after the
// approved prototype, in the family of the AI Challenge and Sales Brief memos
// (`MemoParts`): the quiet bar, the title, the coverage line and the relevant
// topics; the Executive take; a folded table of contents; each development as
// a chapter ("Development 01 / 03", its heading, its labelled parts in a
// margin column, its question to ask the executive, "Next development"); the
// closing (the talking points as "The essentials", then the customer
// questions, the competitive watchlist, the contrarian insight and the
// development to monitor, numbered on); and at the end the topic map, which
// keeps the document's own title line, and the related editions, both folded.
// Every word of the document is here, in its order but for what the fold
// keeps (`engagement-memo.ts`). Every question saves to Takeaways, as before.
import { useMemo, useState, type MouseEvent } from 'react';
import { Markdown } from './Markdown';
import type { Section } from './parse';
import { asideNote } from './artifacts';
import { keyOf } from './blocks';
import { listItems } from './briefs';
import { countLabel, memoBrand, memoDate, questionInput, two, type Chapter, type Field } from './memo';
import { closingQuestionInput, questionSaves, questionsOf, type EngagementMemo as EngagementMemoModel } from './engagement-memo';
import { CANONICAL_TOPICS } from './topics';
import type { SaveInput } from './saved';
import { CONTENTS, MemoBar, MemoChapter, MemoContents, MemoEnd, MemoQuestion, RefFold, RelatedFold, Topics, type ChapterAsk } from './MemoParts';
import type { MemoProps } from './MemoArticle';

type Saves = (own: SaveInput) => { input: SaveInput; also: SaveInput[] };

const TONES: Partial<Record<Field['tone'], string>> = {
  fact: 'memo-field--sources', interpretation: 'memo-field--response', question: 'memo-field--question',
};

/** A development's question to ask the executive, with Save. */
const askOf = (chapter: Chapter, n: number, saves: Saves) => (f: Field): ChapterAsk | null => {
  if (f.tone !== 'question' || !f.label || !f.markdown) return null;
  return { label: 'Ask the executive', ...saves(questionInput(chapter, f)), name: `the ${f.label.toLowerCase()} of development ${n}` };
};

/** The Executive take: the edition in brief, before its developments, every word as written. */
function Take({ section }: { section: Section }) {
  return (
    <section className="memo-take" id={`intel-${section.id}`} data-section={section.id} aria-labelledby="memo-take-title" tabIndex={-1}>
      <div className="memo-take-heading">
        <h2 className="memo-eyebrow" id="memo-take-title">The <Markdown inline heading>{section.title}</Markdown></h2>
        <span className="memo-take-rule" aria-hidden />
      </div>
      {section.markdown && <div className="memo-prose memo-take-text"><Markdown>{section.markdown}</Markdown></div>}
    </section>
  );
}

/** A closing section, numbered on: its customer questions, each with Save, or its words as written. */
function Row({ section, n, saves, level }: { section: Section; n: number; saves: Saves; level: 2 | 3 }) {
  const Label = level === 2 ? 'h2' : 'h3';
  const questions = questionsOf(section);
  const watchlist = /watchlist/.test(keyOf(section.title));
  return (
    <section className="memo-row" id={`intel-${section.id}`} data-section={section.id}>
      <div className="memo-index">
        <span className="memo-idx" aria-hidden>{two(n)}</span>
        <Label className="memo-idx-label"><Markdown inline heading>{section.title}</Markdown></Label>
      </div>
      {questions ? (
        <div className="memo-body memo-questions">
          {questions.map((q, i) => (
            <div key={i} className="memo-customer-question">
              <MemoQuestion label={`Question ${two(i + 1)}`} markdown={q} {...saves(closingQuestionInput(section, q))} name={`customer question ${i + 1}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="memo-body">
          <div className={`memo-prose${watchlist ? ' memo-watchlist' : ''}`}><Markdown>{section.markdown}</Markdown></div>
        </div>
      )}
    </section>
  );
}

export function EngagementMemo({
  memo, onGoTo, edition, minutes, barRef, fillRef, endRef, articleRef, onHistory, historyOpen = false,
  adjacent, onOpenAdjacent, related, onOpenRelated, read, editionSaved, onToggleRead, onToggleEditionSave, notices, imported,
}: Omit<MemoProps, 'sections' | 'presented'> & { memo: EngagementMemoModel; onGoTo: (id: string) => void }) {
  const brand = memoBrand(edition.feedId)!;
  const [contents, setContents] = useState(false);
  const saves = useMemo(() => questionSaves(memo), [memo]);
  const total = memo.chapters.length;
  const closing = memo.essentials?.id ?? memo.rows[0]?.id ?? null;
  const titleId = `intel-title-${edition.driveFileId}`;
  const points = memo.essentials ? listItems(memo.essentials.markdown) : null;

  // In-page links scroll the reader, under the bar, and take the focus there.
  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    onGoTo(id);
    document.getElementById(`intel-${id}`)?.focus({ preventScroll: true });
  };
  const toContents = (e: MouseEvent) => { setContents(true); go(CONTENTS)(e); };
  const nextOf = (i: number) => i + 1 < total
    ? { id: memo.chapters[i + 1].id, label: 'Next development' }
    : closing ? { id: closing, label: 'The essentials' } : null;

  return (
    <div className="memo memo--engagement">
      <MemoBar brand={brand} edition={edition} barRef={barRef} fillRef={fillRef} onHistory={onHistory} historyOpen={historyOpen} adjacent={adjacent} onOpenAdjacent={onOpenAdjacent} />

      <div className="memo-content">
        <article aria-labelledby={titleId} ref={articleRef}>
          <div className="memo-subline">
            <span className="memo-eyebrow">The executive memo <span aria-hidden>/</span> {memoDate(edition.editionDate)}{imported && <> <span aria-hidden>/</span> Imported</>}</span>
            <span className="memo-eyebrow">{total > 0 && <>{two(total)} {total === 1 ? 'development' : 'developments'} <span className="memo-dot" aria-hidden /></>}{two(minutes)} min read</span>
          </div>
          <h1 className="memo-title" id={titleId}>{edition.title}</h1>
          {memo.coverage && <p className="memo-coverage"><Markdown inline>{memo.coverage}</Markdown></p>}
          {edition.topics.length > 0 && <Topics label="Relevant topics" topics={edition.topics} />}
          {notices.map(t => <p key={t} className="memo-aside is-alert" role="note">{t}</p>)}
          {edition.setAside.filter(a => a.where === 'start').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}
          {memo.lead && <div className="memo-prose memo-lead"><Markdown>{memo.lead}</Markdown></div>}
          {memo.take && <Take section={memo.take} />}

          {total > 0 && (
            <MemoContents
              chapters={memo.chapters}
              open={contents}
              onToggle={setContents}
              go={go}
              after={closing ? { id: closing, label: memo.essentials ? 'Executive talking points & conclusions' : 'Conclusions' } : null}
            />
          )}

          {memo.flow.map(item => {
            if (item.kind === 'part') {
              return (
                <div key={item.id} className="memo-part" id={`intel-${item.id}`} data-section={item.id}>
                  {item.title && <p className="memo-part-title"><Markdown inline heading>{item.title}</Markdown></p>}
                  {item.markdown && <div className="memo-prose memo-note"><Markdown>{item.markdown}</Markdown></div>}
                </div>
              );
            }
            const i = memo.chapters.indexOf(item.chapter);
            return <MemoChapter key={item.chapter.id} chapter={item.chapter} n={i + 1} total={total} next={nextOf(i)} tones={TONES} ask={askOf(item.chapter, i + 1, saves)} go={go} toContents={toContents} />;
          })}

          {(memo.essentials || memo.rows.length > 0) && (
            <div className="memo-closing">
              {memo.essentials ? (
                <section id={`intel-${memo.essentials.id}`} data-section={memo.essentials.id} tabIndex={-1} aria-labelledby="memo-essentials">
                  <div className="memo-closing-heading">
                    <span className="memo-eyebrow">The essentials</span>
                    <h2 id="memo-essentials"><Markdown inline heading>{memo.essentials.title}</Markdown></h2>
                  </div>
                  {memo.essentials.markdown && (
                    <div className="memo-summary memo-summary--end">
                      <div className="memo-summary-label">{points ? countLabel(points.length, 'talking point') : 'Talking points'}</div>
                      {points
                        ? <ul>{points.map((t, i) => <li key={i}><Markdown inline>{t}</Markdown></li>)}</ul>
                        : <div className="memo-prose"><Markdown>{memo.essentials.markdown}</Markdown></div>}
                    </div>
                  )}
                </section>
              ) : (
                <div className="memo-closing-heading"><span className="memo-eyebrow">The essentials</span></div>
              )}
              {memo.rows.map((s, i) => <Row key={s.id} section={s} n={total + i + 1} saves={saves} level={memo.essentials ? 3 : 2} />)}
            </div>
          )}
          <div ref={endRef} aria-hidden="true" />
          {edition.setAside.filter(a => a.where === 'end').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}

          <div className="memo-refs">
            <RefFold
              id={memo.map ? `intel-${memo.map.id}` : undefined}
              section={memo.map?.id}
              summary={memo.map
                ? <Markdown inline heading>{memo.map.title}</Markdown>
                : <>Enterprise AI topic map<span className="memo-ref-note"> · All {CANONICAL_TOPICS.length} topics</span></>}
            >
              <div className="memo-map">
                {memo.map ? <Markdown>{memo.map.markdown}</Markdown> : <p>{CANONICAL_TOPICS.join(' • ')}</p>}
                {memo.heading && <p><strong>Original briefing heading:</strong> <Markdown inline heading>{memo.heading}</Markdown></p>}
              </div>
            </RefFold>
            <RelatedFold edition={edition} related={related} onOpen={onOpenRelated} counted />
          </div>

          <MemoEnd brand={brand} edition={edition} read={read} editionSaved={editionSaved} onToggleRead={onToggleRead} onToggleEditionSave={onToggleEditionSave} />
        </article>
      </div>
    </div>
  );
}

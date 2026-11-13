// The Enterprise AI Sales Brief as an executive memo (INT-51), after the
// approved prototype, in the AI Challenge memo's family (`MemoParts`): the
// quiet bar, the title and relevant topics, a folded table of contents, then
// each development as a chapter ("Development 01 / 03", its heading, its
// labelled parts in a margin column, "Next development"), the closing ("What
// I should remember today", the best question, the contrarian insight, the
// development to watch), and at the end the topic map, which keeps the
// document's own heading and executive themes, and the related editions,
// both folded. Every word of the document is here, in its order but for what
// the fold keeps (`sales-memo.ts`). Saving goes to Takeaways as before.
import { useState, type MouseEvent } from 'react';
import { Markdown } from './Markdown';
import type { Section } from './parse';
import { asideNote } from './artifacts';
import { memoBrand, memoDate, two } from './memo';
import { bestQuestion, chapterTitle, questionInput, takeawaysOf, type Chapter, type Field, type SalesMemo as SalesMemoModel } from './sales-memo';
import { CANONICAL_TOPICS } from './topics';
import type { SaveInput } from './saved';
import { Chevron, MemoBar, MemoEnd, MemoSave, RefFold, RelatedFold, Topics } from './MemoParts';
import type { MemoProps } from './MemoArticle';

/** The table of contents' place (`intel-memo-contents`). */
export const CONTENTS = 'memo-contents';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TONES: Partial<Record<Field['tone'], string>> = {
  fact: ' memo-field--sources', question: ' memo-field--question', response: ' memo-field--response', quote: ' memo-field--linkedin',
};

function Question({ label, markdown, input, also, name }: { label: string; markdown: string; input: SaveInput; also: SaveInput[]; name: string }) {
  return (
    <div className="memo-question">
      <div className="memo-question-top">
        <span className="memo-question-label">{label}</span>
        <MemoSave input={input} also={also} name={name} />
      </div>
      <blockquote><Markdown>{markdown}</Markdown></blockquote>
    </div>
  );
}

interface ChapterProps {
  chapter: Chapter;
  n: number;
  total: number;
  /** Where "Next development →" (or "Executive takeaways →") goes. */
  next: { id: string; label: string } | null;
  /** The best question's records, when it repeats one of this chapter's questions. */
  best: SaveInput[] | null;
  go: (id: string) => (e: MouseEvent) => void;
  toContents: (e: MouseEvent) => void;
}

function Development({ chapter, n, total, next, best, go, toContents }: ChapterProps) {
  const titleId = `memo-dev-${chapter.id}`;
  return (
    <section className="memo-dev" id={`intel-${chapter.id}`} data-section={chapter.id} aria-labelledby={titleId} tabIndex={-1}>
      <div className="memo-dev-kicker">
        <span>Development {two(n)} / {two(total)}</span>
        <a href={`#intel-${CONTENTS}`} className="memo-minor" onClick={toContents}>Back to contents <span aria-hidden>↑</span></a>
      </div>
      <h2 className="memo-dev-title" id={titleId}><Markdown inline heading>{chapterTitle(chapter.title, n)}</Markdown></h2>
      {chapter.fields ? (
        <div className="memo-fields">
          {chapter.fields.map((f, i) => {
            const asks = f.tone === 'question' && f.label && f.markdown;
            const input = asks ? questionInput(chapter, f) : null;
            const shared = input && best && best.length > 1 && best[0].sectionId === input.sectionId && best[0].text === input.text;
            return (
              <div key={i} className={`memo-field${TONES[f.tone] ?? ''}`}>
                {f.label ? <h3 className="memo-field-label"><Markdown inline>{f.label}</Markdown></h3> : <span className="memo-field-label" />}
                <div className="memo-field-content">
                  {input
                    ? <Question label={`Development ${two(n)} · ${f.label}`} markdown={f.markdown} input={input} also={shared ? best.slice(1) : []} name={`the ${f.label!.toLowerCase()} of development ${n}`} />
                    : <div className="memo-prose"><Markdown>{f.markdown}</Markdown></div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="memo-prose memo-dev-text"><Markdown>{chapter.markdown}</Markdown></div>
      )}
      {next && (
        <div className="memo-chapter-nav">
          <a href={`#intel-${next.id}`} className="memo-next" onClick={go(next.id)}>{next.label} <span aria-hidden>→</span></a>
        </div>
      )}
    </section>
  );
}

function Row({ section, n, best, level }: { section: Section; n: number; best: SaveInput[] | null; level: 2 | 3 }) {
  const Label = level === 2 ? 'h2' : 'h3';
  return (
    <section className="memo-row" id={`intel-${section.id}`} data-section={section.id}>
      <div className="memo-index">
        <span className="memo-idx" aria-hidden>{two(n)}</span>
        <Label className="memo-idx-label"><Markdown inline heading>{section.title}</Markdown></Label>
      </div>
      <div className="memo-body">
        {best
          ? <Question label="The question to remember" markdown={section.markdown} input={best[0]} also={best.slice(1)} name="the best executive question" />
          : <div className="memo-prose"><Markdown>{section.markdown}</Markdown></div>}
      </div>
    </section>
  );
}

export function SalesMemo({
  memo, onGoTo, edition, minutes, barRef, fillRef, endRef, articleRef, onHistory, historyOpen = false,
  adjacent, onOpenAdjacent, related, onOpenRelated, read, editionSaved, onToggleRead, onToggleEditionSave, notices, imported,
}: Omit<MemoProps, 'sections' | 'presented'> & { memo: SalesMemoModel; onGoTo: (id: string) => void }) {
  const brand = memoBrand(edition.feedId)!;
  const [contents, setContents] = useState(false);
  const best = bestQuestion(memo);
  const total = memo.chapters.length;
  const closing = memo.remember?.id ?? memo.rows[0]?.id ?? null;
  const titleId = `intel-title-${edition.driveFileId}`;
  const takeaways = memo.remember ? takeawaysOf(memo.remember) : null;

  // In-page links scroll the reader, under the bar, and take the focus there.
  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    onGoTo(id);
    document.getElementById(`intel-${id}`)?.focus({ preventScroll: true });
  };
  const toContents = (e: MouseEvent) => { setContents(true); go(CONTENTS)(e); };
  const nextOf = (i: number) => i + 1 < total
    ? { id: memo.chapters[i + 1].id, label: 'Next development' }
    : closing ? { id: closing, label: 'Executive takeaways' } : null;

  return (
    <div className="memo memo--sales">
      <MemoBar brand={brand} edition={edition} barRef={barRef} fillRef={fillRef} onHistory={onHistory} historyOpen={historyOpen} adjacent={adjacent} onOpenAdjacent={onOpenAdjacent} />

      <div className="memo-content">
        <article aria-labelledby={titleId} ref={articleRef}>
          <div className="memo-subline">
            <span className="memo-eyebrow">The executive memo <span aria-hidden>/</span> {memoDate(edition.editionDate)}{imported && <> <span aria-hidden>/</span> Imported</>}</span>
            <span className="memo-eyebrow">{total > 0 && <>{two(total)} {total === 1 ? 'development' : 'developments'} <span className="memo-dot" aria-hidden /></>}{two(minutes)} min read</span>
          </div>
          <h1 className="memo-title" id={titleId}>{edition.title}</h1>
          {edition.topics.length > 0 && <Topics label="Relevant topics" topics={edition.topics} />}
          {notices.map(t => <p key={t} className="memo-aside is-alert" role="note">{t}</p>)}
          {edition.setAside.filter(a => a.where === 'start').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}
          {memo.lead && <div className="memo-prose memo-lead"><Markdown>{memo.lead}</Markdown></div>}

          {total > 0 && (
            <details className="memo-toc" id={`intel-${CONTENTS}`} open={contents} onToggle={e => setContents(e.currentTarget.open)} tabIndex={-1}>
              <summary><Chevron /> In this edition <span className="memo-toc-count">· {plural(total, 'development')}</span></summary>
              <ol className="memo-toc-list">
                {memo.chapters.map((c, i) => (
                  <li key={c.id}>
                    <span className="memo-toc-n" aria-hidden>{two(i + 1)}</span>
                    <a href={`#intel-${c.id}`} onClick={go(c.id)}><Markdown inline heading>{chapterTitle(c.title, i + 1)}</Markdown></a>
                  </li>
                ))}
              </ol>
            </details>
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
            return <Development key={item.chapter.id} chapter={item.chapter} n={i + 1} total={total} next={nextOf(i)} best={best?.inputs ?? null} go={go} toContents={toContents} />;
          })}

          {(memo.remember || memo.rows.length > 0) && (
            <div className="memo-closing">
              {memo.remember ? (
                <section id={`intel-${memo.remember.id}`} data-section={memo.remember.id} tabIndex={-1} aria-labelledby="memo-remember">
                  <div className="memo-closing-heading">
                    <span className="memo-eyebrow">The essentials</span>
                    <h2 id="memo-remember"><Markdown inline heading>{memo.remember.title}</Markdown></h2>
                  </div>
                  {memo.remember.markdown && (
                    <div className="memo-summary memo-summary--end">
                      <div className="memo-summary-label">{takeaways?.label ?? 'Takeaways'}</div>
                      {takeaways
                        ? <ul>{takeaways.items.map((t, i) => <li key={i}><Markdown inline>{t}</Markdown></li>)}</ul>
                        : <div className="memo-prose"><Markdown>{memo.remember.markdown}</Markdown></div>}
                    </div>
                  )}
                </section>
              ) : (
                <div className="memo-closing-heading"><span className="memo-eyebrow">The essentials</span></div>
              )}
              {memo.rows.map((s, i) => (
                <Row key={s.id} section={s} n={total + i + 1} best={best?.section === s ? best.inputs : null} level={memo.remember ? 3 : 2} />
              ))}
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
                {memo.themes && (memo.themes.list || memo.themes.markdown) && (memo.themes.list || !memo.themes.markdown.includes('\n') ? (
                  <p><strong><Markdown inline heading>{memo.themes.label}</Markdown>:</strong> {memo.themes.list ? memo.themes.list.join(' • ') : <Markdown inline>{memo.themes.markdown}</Markdown>}</p>
                ) : (
                  <><p><strong><Markdown inline heading>{memo.themes.label}</Markdown>:</strong></p><Markdown>{memo.themes.markdown}</Markdown></>
                ))}
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

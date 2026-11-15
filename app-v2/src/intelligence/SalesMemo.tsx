// The Enterprise AI Sales Brief as an executive memo (INT-51), after the
// approved prototype, in the AI Challenge memo's family (`MemoParts`; its bar
// and edition index are the workspace's): the title and relevant topics, a
// folded table of contents, then
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
import { memoBrand, questionInput, two, type Chapter, type Field } from './memo';
import { bestQuestion, takeawaysOf, type SalesMemo as SalesMemoModel } from './sales-memo';
import { CANONICAL_TOPICS } from './topics';
import type { SaveInput } from './saved';
import { CONTENTS, MemoChapter, MemoContents, MemoEnd, MemoHead, MemoQuestion, RefFold, RelatedFold, Topics, type ChapterAsk } from './MemoParts';
import type { MemoProps } from './MemoArticle';

const TONES: Partial<Record<Field['tone'], string>> = {
  fact: 'memo-field--sources', question: 'memo-field--question', response: 'memo-field--response', quote: 'memo-field--linkedin',
};

/**
 * A development's question, with Save: "Development 01 · Executive question",
 * kept as the briefs kept it; when the best question repeats it, its Save
 * also reads the best question's record (`best`).
 */
const askOf = (chapter: Chapter, n: number, best: SaveInput[] | null) => (f: Field): ChapterAsk | null => {
  if (f.tone !== 'question' || !f.label || !f.markdown) return null;
  const input = questionInput(chapter, f);
  const shared = best && best.length > 1 && best[0].sectionId === input.sectionId && best[0].text === input.text;
  return { label: `Development ${two(n)} · ${f.label}`, input, also: shared ? best.slice(1) : [], name: `the ${f.label.toLowerCase()} of development ${n}` };
};

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
          ? <MemoQuestion label="The question to remember" markdown={section.markdown} input={best[0]} also={best.slice(1)} name="the best executive question" />
          : <div className="memo-prose"><Markdown>{section.markdown}</Markdown></div>}
      </div>
    </section>
  );
}

export function SalesMemo({
  memo, onGoTo, edition, minutes, endRef, articleRef,
  related, onOpenRelated, read, editionSaved, onToggleRead, onToggleEditionSave, notices, imported,
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
      <MemoHead brand={brand} edition={edition} imported={imported} details={[...(total > 0 ? [`${two(total)} ${total === 1 ? 'development' : 'developments'}`] : []), `${two(minutes)} min read`]} read={read} onToggleRead={onToggleRead} />
      <div className="memo-content">
        <article aria-labelledby={titleId} ref={articleRef}>
          <h1 className="memo-title" id={titleId}>{edition.title}</h1>
          {edition.topics.length > 0 && <Topics label="Relevant topics" topics={edition.topics} />}
          {notices.map(t => <p key={t} className="memo-aside is-alert" role="note">{t}</p>)}
          {edition.setAside.filter(a => a.where === 'start').map(a => <p key={a.kind} className="memo-aside" role="note">{asideNote(a)}</p>)}
          {memo.lead && <div className="memo-prose memo-lead"><Markdown>{memo.lead}</Markdown></div>}

          {total > 0 && <MemoContents chapters={memo.chapters} open={contents} onToggle={setContents} go={go} />}

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
            return <MemoChapter key={item.chapter.id} chapter={item.chapter} n={i + 1} total={total} next={nextOf(i)} tones={TONES} ask={askOf(item.chapter, i + 1, best?.inputs ?? null)} go={go} toContents={toContents} />;
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

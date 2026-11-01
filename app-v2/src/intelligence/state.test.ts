// Reading state and À retenir: the records they keep in the synced data, and
// the rules over them.
import { describe, it, expect } from 'vitest';
import { parseEdition } from './parse';
import { readingIndex, readingState, withPosition, withRead, readingId, READING_TYPE } from './reading';
import {
  savedOf, saveInsight, removeInsight, updateInsight, findSaved, parseTags, searchSaved, tagsOf, nameOf, SAVED_TYPE,
} from './saved';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';
import { feedById } from './feeds';

// Changed in Drive well before anything here reads it.
const edition = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, modifiedTime: '2026-01-01T00:00:00.000Z' }, CHALLENGE_DOC);
const other = parseEdition('enterprise-ai-challenge', { ...CHALLENGE_FILE, id: '1OtherEdition000000000000', modifiedTime: '2026-01-02T00:00:00.000Z' }, CHALLENGE_DOC);
const routineTick = { id: 'rc:ra-plank:2026-11-02', type: 'routine-completion', refId: 'ra-plank', at: 'x', value: { date: '2026-11-02', state: 'done' } };

describe('reading state', () => {
  it('starts new, and leaves the rest of the log alone', () => {
    const log = withPosition([routineTick], edition, 0.3, 'challenge');
    expect(log).toHaveLength(2);
    expect(log[0]).toBe(routineTick);
    expect(log[1]).toMatchObject({ id: readingId(edition.driveFileId), type: READING_TYPE, refId: edition.driveFileId });
    expect(readingState(edition, readingIndex([routineTick]))).toBe('new');
    expect(readingState(edition, readingIndex(log))).toBe('started');
  });

  it('keeps the furthest point reached, and the section you were last in', () => {
    let log = withPosition([], edition, 0.6, 'approaches');
    log = withPosition(log, edition, 0.2, 'challenge');
    expect(readingIndex(log).get(edition.driveFileId)).toMatchObject({ progress: 0.6, section: 'challenge', readAt: null });
  });

  it('writes nothing for small moves within a section', () => {
    const log = withPosition([], edition, 0.3, 'challenge');
    expect(withPosition(log, edition, 0.35, 'challenge')).toBe(log);
    expect(withPosition(log, edition, 0.45, 'challenge')).not.toBe(log);
  });

  it('reaching the end marks it read; Mark as unread starts over', () => {
    let log = withPosition([], edition, 0.99, 'vocabulary');
    expect(readingIndex(log).get(edition.driveFileId)).toMatchObject({ progress: 1 });
    expect(readingState(edition, readingIndex(log))).toBe('read');
    log = withRead(log, edition, false);
    expect(readingIndex(log).get(edition.driveFileId)).toEqual({ feedId: 'enterprise-ai-challenge', progress: 0, section: null, readAt: null });
    log = withRead(log, edition, true);
    expect(readingState(edition, readingIndex(log))).toBe('read');
  });

  it('an edition changed in Drive after you read it is "updated"', () => {
    const log = withRead([], other, true);
    const later = { ...other, modifiedTime: '2999-01-01T00:00:00.000Z' };
    expect(readingState(later, readingIndex(log))).toBe('updated');
  });

  it('one record per edition, whatever happens to it', () => {
    let log: unknown[] = [];
    log = withPosition(log, edition, 0.3, 'a');
    log = withPosition(log, edition, 0.5, 'b');
    log = withRead(log, edition, true);
    log = withPosition(log, other, 0.2, 'a');
    expect(log.map(r => (r as { id: string }).id)).toEqual([readingId(edition.driveFileId), readingId(other.driveFileId)]);
  });
});

describe('À retenir', () => {
  const question = { kind: 'labelled' as const, sectionId: 'executive-discovery-questions', sectionTitle: 'Executive discovery questions', label: 'Opening question', text: '"How many AI agents are running?"' };
  const label = (id: string) => feedById(id)!.label;

  it('saves the words as written, with where they came from', () => {
    const content = saveInsight([{ id: 'c-1', hook: 'a Create idea' }], edition, question);
    const [item] = savedOf(content);
    expect(content[0]).toEqual({ id: 'c-1', hook: 'a Create idea' });
    expect(item).toMatchObject({
      type: SAVED_TYPE, kind: 'labelled', feedId: 'enterprise-ai-challenge', driveFileId: edition.driveFileId,
      editionTitle: 'Agent Sprawl: Who Owns the Bots?', editionDate: '2026-11-02', editionTime: '08:20',
      sourceUrl: CHALLENGE_FILE.webViewLink, label: 'Opening question', text: '"How many AI agents are running?"', note: '', tags: [],
    });
    expect(item.id).toMatch(/^is:/);
  });

  it('knows what is saved already, and forgets it when removed', () => {
    const content = saveInsight([], edition, question);
    const saved = savedOf(content);
    expect(findSaved(saved, edition, question)).toBe(saved[0]);
    expect(findSaved(saved, other, question)).toBeUndefined();
    expect(findSaved(saved, edition, { ...question, label: 'Follow-up question' })).toBeUndefined();
    expect(savedOf(removeInsight(content, saved[0].id))).toEqual([]);
  });

  it('notes and tags change on the item only', () => {
    const content = saveInsight(saveInsight([], edition, question), edition, { kind: 'edition', text: edition.title });
    const [, first] = savedOf(content);
    const next = updateInsight(content, first.id, { note: 'Ask at the bank', tags: ['banking'] });
    expect(savedOf(next).find(s => s.id === first.id)).toMatchObject({ note: 'Ask at the bank', tags: ['banking'] });
    expect(savedOf(next).filter(s => s.note)).toHaveLength(1);
  });

  it('tags are trimmed and not repeated', () => {
    expect(parseTags(' risk, Banking ,#risk,, banking ')).toEqual(['risk', 'Banking']);
  });

  it('search looks through every field, ignoring case and accents; a tag narrows it', () => {
    let content = saveInsight([], edition, question);
    content = saveInsight(content, edition, { kind: 'term', label: 'Agent sprawl', text: 'Uncontrolled growth in the number of AI agents.' });
    const saved = savedOf(content);
    content = updateInsight(content, saved.find(s => s.kind === 'term')!.id, { tags: ['Vocabulaire', 'Risk'], note: 'À retenir pour lundi' });
    const all = savedOf(content);
    expect(searchSaved(all, 'uncontrolled growth', null, label).map(s => s.kind)).toEqual(['term']);
    expect(searchSaved(all, 'a retenir', null, label).map(s => s.kind)).toEqual(['term']);
    expect(searchSaved(all, 'challenge running', null, label).map(s => s.kind)).toEqual(['labelled']);
    expect(searchSaved(all, '', 'risk', label).map(s => s.kind)).toEqual(['term']);
    expect(tagsOf(all)).toEqual([{ tag: 'Risk', count: 1 }, { tag: 'Vocabulaire', count: 1 }]);
  });

  it('names an item by its label, section or first words', () => {
    const base = { editionTitle: 'Agent Sprawl', label: null, sectionTitle: null };
    expect(nameOf({ ...base, kind: 'edition', text: 'x' })).toBe('Agent Sprawl');
    expect(nameOf({ ...base, kind: 'labelled', label: 'Opening question', text: 'x' })).toBe('Opening question');
    expect(nameOf({ ...base, kind: 'section', sectionTitle: 'Business impact', text: 'x' })).toBe('Business impact');
    expect(nameOf({ ...base, kind: 'passage', text: `**Employees** ${'are adopting AI faster '.repeat(4)}` })).toMatch(/^Employees are adopting AI faster .{20,}…$/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  kitOf, withRole, withMembership, withKitLabel, withoutKit, kitSections, kitSize, roleOf, suggestedRole, kitText, wordingOf,
  memberId, roleId, MAIN_KIT,
} from './kit';
import { savedOf, updateInsight, type SavedInsight } from './saved';

const kept = (id: string, patch: Partial<SavedInsight> = {}): SavedInsight => ({
  id, type: 'intel-saved', kind: 'labelled', feedId: 'enterprise-ai-challenge', driveFileId: '1Doc',
  editionTitle: 'Lanterns at the Harbour', editionDate: '2026-11-11', editionTime: '08:20',
  sourceUrl: 'https://docs.google.com/document/d/1Doc/edit', sectionId: 'questions', sectionTitle: 'Executive questions',
  label: 'Executive question', text: 'Which lantern would you light first?', note: '', tags: [], savedAt: '2026-11-11T09:00:00Z',
  ...patch,
});
const question = kept('is:q');
const insight = kept('is:i', { kind: 'passage', label: null, text: 'Harbours are quiet before the tide.', feedId: 'enterprise-ai-sales-brief', editionDate: '2026-11-12' });
const term = kept('is:t', { kind: 'term', label: 'Tide window', text: 'The hour **between** two tides.' });

describe('the meeting kit (INT-56)', () => {
  it('suggests a role from the kind kept: a question opens, anything else is a point of view', () => {
    expect(suggestedRole(question)).toBe('opening');
    expect(suggestedRole(insight)).toBe('argument');
    expect(suggestedRole(term)).toBe('argument');
    expect(roleOf(kitOf([question]), question)).toEqual({ role: 'opening', chosen: false });
  });

  it('keeps a role chosen, in the kit, apart from the takeaway, which does not change', () => {
    const content = withRole([question], question, 'challenge');
    expect(roleOf(kitOf(content), question)).toEqual({ role: 'challenge', chosen: true });
    expect(content[0]).toBe(question);
    expect(content[1]).toMatchObject({ id: roleId(MAIN_KIT, 'is:q'), type: 'intel-kit-role', kitId: 'main', takeawayId: 'is:q', role: 'challenge' });
    // The same role again changes nothing.
    expect(withRole(content, question, 'challenge')).toBe(content);
    // Another kit could give it another role.
    const other = withRole(content, question, 'argument', 'board');
    expect(roleOf(kitOf(other), question).role).toBe('challenge');
    expect(roleOf(kitOf(other, 'board'), question).role).toBe('argument');
  });

  it('adds a takeaway once, in the role it shows, and takes it out without touching it', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    let content = withMembership([question, insight], question, true, now);
    expect(kitOf(content).members.get('is:q')).toBe('2026-11-14T10:00:00.000Z');
    // The suggestion it showed became its role.
    expect(roleOf(kitOf(content), question)).toEqual({ role: 'opening', chosen: true });
    // A second add, or a tap repeated, is the same record: never a duplicate.
    expect(withMembership(content, question, true, new Date('2026-11-14T10:00:05Z'))).toBe(content);
    expect(content.filter(r => (r as { id: string }).id === memberId(MAIN_KIT, 'is:q'))).toHaveLength(1);
    content = withMembership(content, question, false, now);
    expect(kitOf(content).members.has('is:q')).toBe(false);
    // Out of the kit, it keeps its role there, and stays in Takeaways as it was.
    expect(roleOf(kitOf(content), question)).toEqual({ role: 'opening', chosen: true });
    expect(savedOf(content)).toEqual(savedOf([question, insight]));
  });

  it('notes and tags written on a takeaway leave its place in the kit as it was', () => {
    let content = withMembership(withRole([question], question, 'follow-up'), question, true);
    content = updateInsight(content, 'is:q', { note: 'For the port authority', tags: ['harbours'] });
    expect(roleOf(kitOf(content), question).role).toBe('follow-up');
    expect(kitOf(content).members.has('is:q')).toBe(true);
  });

  it('holds the meeting\'s name as typed', () => {
    expect(kitOf(withKitLabel([], 'Harbour board')).label).toBe('Harbour board');
    expect(kitOf([]).label).toBe('');
  });

  it('groups the kit by role, in the conversation\'s order, each in the order added; a record without its takeaway is left out', () => {
    let content: unknown[] = [question, insight, term];
    content = withMembership(content, term, true, new Date('2026-11-14T10:00:00Z'));
    content = withMembership(content, insight, true, new Date('2026-11-14T10:01:00Z'));
    content = withMembership(content, question, true, new Date('2026-11-14T10:02:00Z'));
    content = withRole(content, question, 'follow-up');
    // Kit records for a takeaway removed on another device, before its removal arrives here.
    content = withMembership(content, kept('is:gone'), true);
    const sections = kitSections(kitOf(content), savedOf(content));
    expect(sections.map(s => [s.role.group, s.items.map(i => i.id)])).toEqual([
      ['Open the discussion', []],
      ['Test an assumption', []],
      ['Go deeper', ['is:q']],
      ['Share a perspective', ['is:t', 'is:i']],
    ]);
    expect(kitSize(sections)).toBe(3);
  });

  it('a takeaway removed from Takeaways takes its kit records with it, and nothing else', () => {
    let content = withMembership(withRole([question, insight], question, 'challenge'), question, true);
    content = withMembership(content, insight, true);
    content = withKitLabel(content, 'Harbour board');
    const after = withoutKit(content.filter(r => r !== question), 'is:q');
    expect(after.map(r => (r as { id: string }).id).sort()).toEqual(['is:i', 'km:main:is:i', 'kr:main:is:i', 'mk:main']);
    expect(withoutKit(after, 'is:q')).toBe(after);
  });

  it('copies as text: the meeting, each role\'s section with the exact words, and where each came from', () => {
    const multi = kept('is:s', { kind: 'section', label: null, text: 'Two things matter:\n\n- the **tide**\n- the lantern', feedId: 'customer-engagement-brief', editionDate: '2026-11-13' });
    let content: unknown[] = [question, insight, term, multi];
    for (const [i, item] of [question, term, multi].entries()) content = withMembership(content, item, true, new Date(Date.UTC(2026, 10, 14, 10, i)));
    content = withRole(content, multi, 'follow-up');
    const text = kitText(kitSections(kitOf(content), savedOf(content)), '  Harbour board ');
    expect(text).toBe([
      '# Executive meeting kit · Harbour board',
      '',
      '## Open the discussion',
      '',
      '- Which lantern would you light first?',
      '  (AI Challenge, Wed 11 Nov 2026)',
      '',
      '## Go deeper',
      '',
      '- Two things matter:',
      '',
      '  - the tide',
      '  - the lantern',
      '  (Customer Engagement, Fri 13 Nov 2026)',
      '',
      '## Share a perspective',
      '',
      '- Tide window — The hour between two tides.',
      '  (AI Challenge, Wed 11 Nov 2026)',
      '',
    ].join('\n'));
    expect(kitText([], '')).toBe('# Executive meeting kit\n');
  });

  it('says a takeaway in its kept words: a term with its meaning, an edition by its title', () => {
    expect(wordingOf(question)).toBe('Which lantern would you light first?');
    expect(wordingOf(term)).toBe('Tide window — The hour between two tides.');
    expect(wordingOf(kept('is:e', { kind: 'edition', text: 'Lanterns at the Harbour' }))).toBe('Lanterns at the Harbour');
    expect(wordingOf(kept('is:x', { text: '"Who keeps the harbour lit?"' }))).toBe('Who keeps the harbour lit?');
  });
});

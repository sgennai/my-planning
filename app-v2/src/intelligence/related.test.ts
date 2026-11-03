// Related editions: matched only on the topics the documents list, labels
// compared without case, accents, hyphens or "&"; other feeds first, then
// the most topics in common, then the newest; at most five; never itself.
import { describe, it, expect } from 'vitest';
import type { Edition } from './parse';
import type { FeedId } from './feeds';
import { topicKey, topicIndex, relatedTo } from './related';

const ed = (id: string, feedId: FeedId, day: string, topics: string[]): Edition =>
  ({ driveFileId: id, feedId, topics, title: id, editionDate: day, sortKey: `${day} 08:00:00` } as Edition);

describe('related editions', () => {
  it('compares labels as the same topic whatever their case, accents, hyphens or "&"', () => {
    expect(topicKey('Customer-data governance')).toBe(topicKey('Customer data governance'));
    expect(topicKey('Investment & budgets')).toBe('investment and budgets');
    expect(topicKey('Régulation')).toBe(topicKey('regulation'));
    expect(topicKey('ROI')).not.toBe(topicKey('Business case, ROI & TCO'));
  });

  const today = ed('today', 'enterprise-ai-challenge', '2026-11-03', ['Governance', 'Agentic AI', 'Transformation programs']);
  const all = [
    today,
    ed('challenge-2', 'enterprise-ai-challenge', '2026-11-02', ['Governance', 'Agentic AI', 'Transformation programs']),
    ed('sales-1', 'enterprise-ai-sales-brief', '2026-11-01', ['Transformation programs']),
    ed('sales-2', 'enterprise-ai-sales-brief', '2026-11-02', ['governance', 'Agentic-AI']),
    ed('engagement', 'customer-engagement-brief', '2026-10-30', ['Agentic AI', 'Marketing automation']),
    ed('unrelated', 'customer-engagement-brief', '2026-11-02', ['Headless CDP']),
  ];

  it('other feeds first, then the most topics in common, then the newest; never itself or an unrelated one', () => {
    const r = relatedTo(today, topicIndex(all));
    expect(r.map(x => x.edition.driveFileId)).toEqual(['sales-2', 'sales-1', 'engagement', 'challenge-2']);
  });

  it('says what each shares, as this edition writes it', () => {
    const r = relatedTo(today, topicIndex(all));
    expect(r[0].shares).toEqual(['Governance', 'Agentic AI']);
    expect(r[3].shares).toEqual(['Governance', 'Agentic AI', 'Transformation programs']);
  });

  it('at most five; none when nothing is shared', () => {
    const many = Array.from({ length: 8 }, (_, i) => ed(`s${i}`, 'enterprise-ai-sales-brief', `2026-10-${10 + i}`, ['Governance']));
    expect(relatedTo(today, topicIndex([today, ...many]))).toHaveLength(5);
    expect(relatedTo(all[5], topicIndex(all))).toEqual([]);
    expect(relatedTo(ed('none', 'enterprise-ai-challenge', '2026-11-03', []), topicIndex(all))).toEqual([]);
  });
});

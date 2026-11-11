// One topic vocabulary for related editions (INT-46): historical labels match
// the canonical topics they name, and no others; canonical labels and
// unlisted ones match as before; the editions keep their labels as written.
import { describe, it, expect } from 'vitest';
import type { Edition } from './parse';
import type { FeedId } from './feeds';
import { CANONICAL_TOPICS, TOPIC_ALIASES, topicKey, topicKeys } from './topics';
import { topicIndex, relatedTo } from './related';

const ed = (id: string, feedId: FeedId, day: string, topics: string[]): Edition =>
  ({ driveFileId: id, feedId, topics, title: id, editionDate: day, sortKey: `${day} 08:00:00` } as Edition);

describe('the canonical topics', () => {
  it('are the 27 of the Enterprise AI topic map, each matched as itself', () => {
    expect(CANONICAL_TOPICS).toHaveLength(27);
    for (const t of CANONICAL_TOPICS) expect(topicKeys(t)).toEqual([topicKey(t)]);
  });

  it('every alias names canonical topics only, and is not itself canonical', () => {
    const canonical = new Set(CANONICAL_TOPICS.map(topicKey));
    for (const [label, to] of Object.entries(TOPIC_ALIASES)) {
      expect(canonical.has(topicKey(label)), label).toBe(false);
      expect(to.length, label).toBeGreaterThan(0);
      for (const t of to) expect(canonical.has(topicKey(t)), `${label} → ${t}`).toBe(true);
    }
  });

  it('a composite label matches each topic it names; spelling aside, as before', () => {
    expect(topicKeys('Business case, ROI & TCO')).toEqual(['roi', 'cost']);
    expect(topicKeys('Change management & organizational adoption')).toEqual(['change management', 'organizational adoption']);
    expect(topicKeys('customer data governance')).toEqual(['data', 'governance']);
    expect(topicKeys('Investment and budgets')).toEqual(['investment']);
  });

  it('never guesses: a label naming no canonical topic is matched as itself', () => {
    for (const label of ['Revenue & growth', 'Human oversight', 'Customer experience', 'Sovereignty & data residency', 'Headless CDP', 'Resilience']) {
      expect(topicKeys(label)).toEqual([topicKey(label)]);
    }
    expect(topicKeys('')).toEqual([]);
  });
});

describe('related editions across the three feeds', () => {
  // Labels as each feed writes them: the AI Challenge canonical, the Sales
  // Brief's history its long map, the Engagement Brief its own words or none.
  const challenge = ed('challenge', 'enterprise-ai-challenge', '2026-10-01', ['Investment', 'ROI', 'Governance', 'Data readiness']);
  const salesOld = ed('sales-old', 'enterprise-ai-sales-brief', '2026-09-28', ['Investment & budgets', 'Business case, ROI & TCO', 'Revenue & growth']);
  const salesNew = ed('sales-new', 'enterprise-ai-sales-brief', '2026-11-05', ['Investment', 'Cost']);
  const engagement = ed('engagement', 'customer-engagement-brief', '2026-10-30', ['Customer data governance', 'Measurement & ROI']);
  const engagementOld = ed('engagement-old', 'customer-engagement-brief', '2026-10-02', []);
  const sameWords = ed('sales-other', 'enterprise-ai-sales-brief', '2026-09-20', ['Revenue & growth']);
  const all = [challenge, salesOld, salesNew, engagement, engagementOld, sameWords];
  const index = topicIndex(all);
  const ids = (e: Edition) => relatedTo(e, index).map(r => r.edition.driveFileId);

  it('the Sales Brief’s history now meets the AI Challenge and the newer briefs', () => {
    expect(ids(salesOld)).toEqual(['challenge', 'engagement', 'sales-new', 'sales-other']);
    const r = relatedTo(salesOld, index);
    expect(r[0].shares).toEqual(['Investment & budgets', 'Business case, ROI & TCO']);
    expect(r[2].shares).toEqual(['Investment & budgets', 'Business case, ROI & TCO']);
  });

  it('the Engagement Brief’s own words meet the canonical topics they name', () => {
    expect(ids(engagement)).toEqual(['challenge', 'sales-old']);
    expect(relatedTo(engagement, index)[0].shares).toEqual(['Customer data governance', 'Measurement & ROI']);
  });

  it('from the canonical side, in the AI Challenge’s own words', () => {
    // Two topics each with the Engagement Brief and the old Sales Brief: the newer first.
    expect(ids(challenge)).toEqual(['engagement', 'sales-old', 'sales-new']);
    expect(relatedTo(challenge, index).map(r => r.shares)).toEqual([['ROI', 'Governance'], ['Investment', 'ROI'], ['Investment']]);
  });

  it('a label with no canonical topic still meets the same label, and an edition with none meets nothing', () => {
    expect(ids(sameWords)).toEqual(['sales-old']);
    expect(ids(engagementOld)).toEqual([]);
    expect(ids(salesOld)).not.toContain('engagement-old');
  });
});

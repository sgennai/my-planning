import type { PracticeItem } from '../storage/types';

export function getStatusFromConfidence(confidence: number): PracticeItem['status'] {
  if (confidence >= 5) return 'interview_ready';
  if (confidence >= 4) return 'strong';
  if (confidence >= 3) return 'practice';
  if (confidence >= 2) return 'needs_work';
  return 'draft';
}

export function getNextPracticeDate(confidence: number, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  // Basic spaced repetition mapping for confidence 1-5
  const intervals: Record<number, number> = {
    1: 1,  // tomorrow
    2: 3,  // in 3 days
    3: 7,  // in a week
    4: 14, // in two weeks
    5: 30  // in a month
  };
  const interval = intervals[Math.max(1, Math.min(5, Math.floor(confidence)))] || 1;
  d.setDate(d.getDate() + interval);
  return d.toISOString();
}

export function isDueForPractice(item: PracticeItem, now: Date = new Date()): boolean {
  if (!item.nextPracticeAt) return true;
  return new Date(item.nextPracticeAt) <= now;
}

/**
 * Filter and sort a pool of practice items based on mode and urgency
 */
export function selectPracticeBatch(
  items: PracticeItem[],
  mode: 'due' | 'weak' | 'all',
  batchSize: number = 5,
  now: Date = new Date()
): PracticeItem[] {
  let pool = items;
  
  if (mode === 'due') {
    pool = pool.filter(i => isDueForPractice(i, now));
    // If none due, fall back to weakest
    if (pool.length === 0) {
      pool = items.filter(i => (i.confidence || 1) <= 2);
    }
  } else if (mode === 'weak') {
    pool = pool.filter(i => i.status === 'draft' || i.status === 'needs_work' || (i.confidence || 1) <= 2);
  }
  
  // Sort primarily by confidence (lowest first), then by nextPracticeAt (earliest first)
  pool.sort((a, b) => {
    const confA = a.confidence || 1;
    const confB = b.confidence || 1;
    if (confA !== confB) return confA - confB;
    
    const timeA = a.nextPracticeAt ? new Date(a.nextPracticeAt).getTime() : 0;
    const timeB = b.nextPracticeAt ? new Date(b.nextPracticeAt).getTime() : 0;
    return timeA - timeB;
  });
  
  return pool.slice(0, batchSize);
}

export function searchPracticeItems(items: PracticeItem[], query: string, trackFilter: string = 'all'): PracticeItem[] {
  let filtered = items;
  if (trackFilter !== 'all') {
    filtered = filtered.filter(i => i.track === trackFilter);
  }
  
  if (!query.trim()) return filtered;
  
  const q = query.toLowerCase();
  return filtered.filter(i => {
    const promptMatch = i.prompt?.toLowerCase().includes(q);
    const answerMatch = typeof i.answer?.raw === 'string' && i.answer.raw.toLowerCase().includes(q);
    const tagMatch = i.tags?.some(t => t.toLowerCase().includes(q));
    return promptMatch || answerMatch || tagMatch;
  });
}

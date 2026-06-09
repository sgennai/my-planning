import type { AppDataV24, PracticeItem } from '../storage/types';
import interviewJson from '../content/interview.json';
import clevelJson from '../content/clevel.json';
import execpresenceJson from '../content/execpresence.json';
import salesJson from '../content/sales.json';
import bfsiJson from '../content/bfsi.json';

// Define the shape of our external content files
interface ContentTrack {
  track: string;
  categories?: { id: string; name: string; color: string }[];
  items: {
    id: string;
    prompt: string | Record<string, string>;
    tags?: string[];
    rubric?: string;
    reference?: Record<string, any>;
  }[];
}

const TRACKS: ContentTrack[] = [
  interviewJson as ContentTrack,
  clevelJson as ContentTrack,
  execpresenceJson as ContentTrack,
  salesJson as ContentTrack,
  bfsiJson as ContentTrack
];

/**
 * Merges external JSON content into the local practice items array.
 * Touches ONLY content fields (prompt, track, tags, rubric).
 * NEVER touches progress fields (confidence, nextPracticeAt, etc.) or user answers.
 */
export function mergePracticeContent(data: AppDataV24): boolean {
  let changed = false;
  if (!data.practiceItems) {
    data.practiceItems = [];
    changed = true;
  }
  
  const existingMap = new Map<string, PracticeItem>();
  for (const item of data.practiceItems) {
    existingMap.set(item.id, item);
  }
  
  for (const trackData of TRACKS) {
    const trackId = trackData.track;
    for (const item of trackData.items) {
      const existing = existingMap.get(item.id);
      
      if (existing) {
        // We only modify the object if something ACTUALLY changed.
        // This ensures db.ts's deepEqual write-guard will see no changes
        // if the content is already up-to-date, preventing unnecessary sync traffic.
        const promptChanged = existing.prompt !== item.prompt;
        const rubricChanged = existing.rubric !== item.rubric;
        const trackChanged = existing.track !== trackId;
        
        const existingTags = existing.tags || [];
        const newTags = item.tags || [];
        const tagsChanged = existingTags.length !== newTags.length || !existingTags.every((t, i) => t === newTags[i]);
        
        if (promptChanged || rubricChanged || tagsChanged || trackChanged || item.reference !== undefined) {
          // Mutate the existing object in-place for content fields
          if (item.prompt !== undefined) existing.prompt = item.prompt;
          if (item.rubric !== undefined) existing.rubric = item.rubric;
          if (item.reference !== undefined) existing.reference = item.reference;
          existing.tags = item.tags || [];
          existing.track = trackId;
          changed = true;
        }
      } else {
        // Insert new item
        const newItem: PracticeItem = {
          id: item.id,
          track: trackId,
          prompt: item.prompt,
          answer: {},
          status: 'draft',
          confidence: 1,
          rehearsalCount: 0,
          linkedStoryIds: [],
          tags: item.tags || [],
          rubric: item.rubric,
          reference: item.reference,
          updatedAt: new Date().toISOString()
        };
        data.practiceItems.push(newItem);
        changed = true;
      }
    }
  }
  
  return changed;
}

import type { AppDataV24, PodcastEpisode } from '../storage/types';
import opmlRaw from '../content/podcasts.opml?raw';

function stableHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function mergeIntakeContent(data: AppDataV24): boolean {
  let changed = false;
  if (!Array.isArray(data.learning)) {
    data.learning = [];
    changed = true;
  }

  const existingIds = new Set(data.learning.map(item => item.id));
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlRaw, 'text/xml');

  // Recursive function to find all podcasts
  const parseOutline = (node: Element, parentTopic?: string) => {
    const isLeaf = node.hasAttribute('xmlUrl');
    const text = node.getAttribute('text') || node.getAttribute('title') || '';
    
    if (isLeaf) {
      const xmlUrl = node.getAttribute('xmlUrl')!;
      const htmlUrl = node.getAttribute('htmlUrl') || xmlUrl; // fallback to xmlUrl if no htmlUrl
      const id = `podcast-${stableHash(xmlUrl)}`;
      
      if (!existingIds.has(id)) {
        const newItem: PodcastEpisode = {
          id,
          kind: 'podcast',
          title: text,
          url: htmlUrl,
          source: xmlUrl, // We'll store xmlUrl in source
          topic: parentTopic,
          status: 'queue',
          priority: 0,
          addedAt: new Date().toISOString()
        };
        data.learning!.push(newItem);
        changed = true;
      }
    } else {
      // It's a folder/category
      const topic = text || parentTopic;
      const children = Array.from(node.children).filter(c => c.tagName === 'outline');
      for (const child of children) {
        parseOutline(child, topic);
      }
    }
  };

  const outlines = Array.from(doc.querySelectorAll('body > outline'));
  for (const outline of outlines) {
    parseOutline(outline);
  }

  return changed;
}

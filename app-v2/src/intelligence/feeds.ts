// The three briefings ChatGPT's scheduled tasks publish, one Google Drive
// folder each, in the dedicated account's "ChatGPT Intelligence" folder.
// Shared with the server (functions/api/intel), which serves documents from
// these folders only. A feed whose task does not publish yet simply has no
// editions: the day a document lands in its folder, it shows, with no change
// here.

export type FeedId = 'enterprise-ai-challenge' | 'enterprise-ai-sales-brief' | 'customer-engagement-brief';

export interface Feed {
  id: FeedId;
  /** The task's own name, as on an edition. */
  name: string;
  /** The tab. */
  label: string;
  folderId: string;
}

export const INTELLIGENCE_ROOT_FOLDER = '1cjX0msf7ro2Mz81LOeNT5XOYmKcgiWft';

/** In the order Today reads them. */
export const FEEDS: Feed[] = [
  {
    id: 'enterprise-ai-challenge',
    name: 'Enterprise AI Challenge',
    label: 'AI Challenge',
    folderId: '14RjcLlB6iVh47-MByN8N57PHzOQIhm78',
  },
  {
    id: 'enterprise-ai-sales-brief',
    name: 'Enterprise AI Executive Sales Brief',
    label: 'Enterprise AI',
    folderId: '1_AHGwjuORznvmjVaWAMnwXQdfZev86OE',
  },
  {
    id: 'customer-engagement-brief',
    name: 'Customer Engagement Brief',
    label: 'Customer Engagement',
    folderId: '14Hv6w-leVCpycb5_C2ceVtywu23zl_1n',
  },
];

export const feedById = (id: string): Feed | undefined => FEEDS.find(f => f.id === id);

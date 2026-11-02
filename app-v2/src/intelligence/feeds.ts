// The three briefings ChatGPT's scheduled tasks publish, one Google Drive
// folder each, in the dedicated account's "ChatGPT Intelligence" folder.
// Shared with the server (functions/api/intel), which serves documents from
// these folders only. A feed whose task does not publish yet simply has no
// editions: the day a document lands in its folder, it shows, with no change
// here.

export type FeedId = 'enterprise-ai-challenge' | 'enterprise-ai-sales-brief' | 'customer-engagement-brief';

/** When a task publishes, in Europe/Paris time (feed health, `schedule.ts`). */
export interface FeedSchedule {
  /** The days it runs, 0 = Sunday, or every day. */
  days: 'daily' | number[];
  /** Paris wall-clock time, `HH:mm`. */
  at: string;
  /** Runs "around" that time and can start well after it. */
  flexible: boolean;
  /** The first Paris day it published to Drive by itself; anything earlier was imported. */
  since: string;
}

export interface Feed {
  id: FeedId;
  /** The task's own name, as on an edition. */
  name: string;
  /** The tab. */
  label: string;
  folderId: string;
  schedule: FeedSchedule;
}

export const INTELLIGENCE_ROOT_FOLDER = '1cjX0msf7ro2Mz81LOeNT5XOYmKcgiWft';

/** In the order Today reads them. */
export const FEEDS: Feed[] = [
  {
    id: 'enterprise-ai-challenge',
    name: 'Enterprise AI Challenge',
    label: 'AI Challenge',
    folderId: '14RjcLlB6iVh47-MByN8N57PHzOQIhm78',
    schedule: { days: 'daily', at: '08:12', flexible: true, since: '2026-11-02' },
  },
  {
    id: 'enterprise-ai-sales-brief',
    name: 'Enterprise AI Executive Sales Brief',
    label: 'Enterprise AI',
    folderId: '1_AHGwjuORznvmjVaWAMnwXQdfZev86OE',
    schedule: { days: 'daily', at: '09:00', flexible: true, since: '2026-11-02' },
  },
  {
    id: 'customer-engagement-brief',
    name: 'Customer Engagement Brief',
    label: 'Customer Engagement',
    folderId: '14Hv6w-leVCpycb5_C2ceVtywu23zl_1n',
    schedule: { days: [1, 3, 5], at: '08:00', flexible: false, since: '2026-11-02' },
  },
];

export const feedById = (id: string): Feed | undefined => FEEDS.find(f => f.id === id);

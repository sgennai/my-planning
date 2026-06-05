export interface BaseRecord {
  id: string;
  updatedAt?: string;
}

export interface UserProfile extends BaseRecord {
  targetRoles: string[];
  competencyFramework: string[];
  positioningThesis: string;
  industries: string[];
  geos: string[];
  switchDeadline: string;
}

export interface Project extends BaseRecord {
  name: string;
  tier: string;
  isMaster: boolean;
  prioritySequence: number;
  status: string;
  // Existing data uses nextActions array inside Project, but for the generalized Action model it might be separate. 
  // We'll keep compatibility with V23 nextActions inside Project for now.
  nextActions?: Action[];
  completedActions?: Action[];
}

export interface Module extends BaseRecord {
  name: string;
  family: string;
  type: 'native' | 'light' | 'generator' | 'external';
  contentRef?: string;
  projectRef?: string;
  cadence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    preferredDay?: string; // e.g. 'Tuesday'
    durationMin: number;
  };
  status: 'active' | 'paused' | 'archived' | 'pending';
}

export interface Action extends BaseRecord {
  text: string;
  done: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface Task extends BaseRecord {
  text: string;
  done: boolean;
  scheduledBlockId?: string;
}

export interface RoutineItem {
  title: string;
  start: string;
  durationMin: number;
  days: string[];
  category: string;
  homeOnly?: boolean;
  recurrence?: any;
}

export interface RoutineTemplate extends BaseRecord {
  id: 'singleton-routine';
  items: RoutineItem[];
  overrides: Record<string, any>;
  completions: Record<string, any>;
}

export interface CalendarEvent {
  id: string;
  source: 'routine' | 'block' | 'ics-work' | 'ics-home';
  title: string;
  start: string;
  end: string;
  category?: string;
  editableScope?: string;
}

export interface CalendarSource extends BaseRecord {
  kind: 'ics' | 'routine' | 'manual';
  url?: string;
  color?: string;
  enabled?: boolean;
}

export interface TimeBlock extends BaseRecord {
  title: string;
  start: string;
  durationMin: number;
  category: string;
  origin: 'manual' | 'practice' | 'create' | 'intake' | 'generator';
  refId?: string;
}

export interface PracticeItem extends BaseRecord {
  track: string;
  prompt: string;
  answer: Record<string, any>;
  status?: string;
  confidence?: number;
  rubric?: string;
  lastPracticedAt?: string;
  nextPracticeAt?: string;
  rehearsalCount?: number;
  linkedStoryIds?: string[];
  tags?: string[];
}

export interface InterviewStory extends BaseRecord {
  title: string;
  summary: string;
  situation: string;
  action: string;
  result: string;
  learning: string;
  metrics: string;
  whereToUse: string;
  tags?: string[];
}

export interface BaseLearningItem extends BaseRecord {
  kind: 'reading' | 'podcast' | 'certification' | 'other';
  title: string;
  url: string;
  topic?: string;
  track?: string;
  source?: string;
  estMinutes?: number;
  status: string;
  priority: number;
  addedAt: string;
  completedAt?: string;
  notes?: string;
}

export interface ReadingItem extends BaseLearningItem {
  kind: 'reading';
  paywalled?: boolean;
  author?: string;
  publishedAt?: string;
}

export interface PodcastEpisode extends BaseLearningItem {
  kind: 'podcast';
  durationMin?: number;
  podcast?: string;
  episodeUrl?: string;
}

export interface Certification extends BaseLearningItem {
  kind: 'certification';
  cost?: number;
  effortHrs?: number;
  signalValue?: string;
  onLinkedIn?: boolean;
  vendor?: string;
  deadline?: string;
}

export type LearningItem = ReadingItem | PodcastEpisode | Certification | BaseLearningItem;

export interface ContentIdea extends BaseRecord {
  hook: string;
  angle: string;
  theme?: string;
  track?: string;
  sourceRef?: string;
  status: string;
}

export interface LinkedInPost extends BaseRecord {
  title: string;
  body: string;
  status: 'idea' | 'drafting' | 'scheduled' | 'published';
  scheduledFor?: string;
  publishedAt?: string;
  linkedStoryIds?: string[];
  metricsNote?: string;
}

export interface ProgressLog extends BaseRecord {
  type: string;
  refId: string;
  at: string;
  value: any;
}

export interface Review extends BaseRecord {
  weekStart: string;
  wins?: string;
  misses?: string;
  nextWeekFocus?: string;
  readinessSnapshot?: any;
}

export interface Settings extends BaseRecord {
  id: 'singleton-settings';
  theme: string;
  categoryColors: Record<string, string>;
  categoryEmojis: Record<string, string>;
  categoryLabels: Record<string, string>;
  calendars: Record<string, string>;
  lunchSlot: { start: string; duration: number };
  todayView: string;
  nowLineColor?: string;
  miniMonthTodayColor?: string;
  nowEventColor?: string;
  userCategories?: Record<string, any>;
  featureFlags?: Record<string, boolean>;
}

export interface AppDataV24 {
  schemaVersion: number;
  createdAt: string;
  lastModified: string;
  
  userProfile?: UserProfile;
  prefs: Omit<Settings, 'id' | 'updatedAt'>;
  featureFlags?: Record<string, boolean>;
  
  routine: RoutineItem[];
  overrides: Record<string, any>;
  routineCompletions: Record<string, any>;
  
  calendars: Record<string, string>;
  
  weeklyResets: Omit<Review, 'id'>[];
  projects: Project[];
  modules?: Module[];
  scheduledBlocks: TimeBlock[];
  referenceLibrary: any[];
  
  inbox: any[];
  elsewhereToggles: any;
  todos: Task[];
  completedActions: Action[];
  
  practiceContent: any;
  interviewPrep: any;
  practiceItems?: PracticeItem[];
  stories?: InterviewStory[];
  
  learning?: LearningItem[];
  content?: any[];
  create?: { ideas: ContentIdea[]; posts: LinkedInPost[] };
  
  progressLog?: ProgressLog[];
  weather: any;
}

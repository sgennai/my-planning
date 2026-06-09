import { SCHEMA_VERSION, SEED_ROUTINE, SEED_PROJECTS, SEED_REFERENCE_LIBRARY, SEED_PRACTICE_CONTENT } from './data';
import type { PracticeItem } from './types';

export function migrate(data: any): { data: any, migrated: boolean } {
  let changed = false;
  const next = { ...data };
  const prevVersion = next.schemaVersion || 0;
  if (prevVersion < SCHEMA_VERSION) { next.schemaVersion = SCHEMA_VERSION; changed = true; }
  // v2: re-seed routine
  if (prevVersion < 2) { next.routine = SEED_ROUTINE; changed = true; }
  else if (next.routine == null || (Array.isArray(next.routine) && next.routine.length === 0)) {
    next.routine = SEED_ROUTINE; changed = true;
  }
  // v3: seed projects + scheduledBlocks
  if (prevVersion < 3) {
    next.projects = SEED_PROJECTS;
    next.scheduledBlocks = next.scheduledBlocks || [];
    changed = true;
  } else if (!Array.isArray(next.projects) || next.projects.length === 0) {
    next.projects = SEED_PROJECTS; changed = true;
  }
  // v4: seed referenceLibrary (only if missing — preserves user edits)
  if (!Array.isArray(next.referenceLibrary) || next.referenceLibrary.length === 0) {
    next.referenceLibrary = SEED_REFERENCE_LIBRARY;
    changed = true;
  }
  // v5: replace the meeting-reset placeholder entry with real content.
  // We only replace this one entry — other entries keep any edits.
  if (prevVersion < 5 && Array.isArray(next.referenceLibrary)) {
    const meetingReset = SEED_REFERENCE_LIBRARY.find((r: any) => r.id === 'ref-meeting-reset');
    if (meetingReset) {
      const idx = next.referenceLibrary.findIndex((r: any) => r.id === 'ref-meeting-reset');
      if (idx >= 0) {
        next.referenceLibrary[idx] = meetingReset;
      } else {
        next.referenceLibrary.push(meetingReset);
      }
      changed = true;
    }
  }
  if (!Array.isArray(next.scheduledBlocks)) { next.scheduledBlocks = []; changed = true; }
  if (!next.overrides) { next.overrides = {}; changed = true; }
  if (!next.calendars) { next.calendars = { workIcs: '', householdIcs: '', proxyUrl: '', syncUrl: '', syncSecret: '', workColor: '#8C8C96', householdColor: '#7896AF' }; changed = true; }
  else {
    if (next.calendars.proxyUrl === undefined) { next.calendars.proxyUrl = ''; changed = true; }
    if (next.calendars.syncUrl === undefined) { next.calendars.syncUrl = ''; changed = true; }
    if (next.calendars.syncSecret === undefined) { next.calendars.syncSecret = ''; changed = true; }
    if (next.calendars.workColor === undefined) { next.calendars.workColor = '#8C8C96'; changed = true; }
    if (next.calendars.householdColor === undefined) { next.calendars.householdColor = '#7896AF'; changed = true; }
  }
  if (!next.weeklyResets) { next.weeklyResets = []; changed = true; }
  if (!next.inbox) { next.inbox = []; changed = true; }
  if (!next.elsewhereToggles) { next.elsewhereToggles = { morning: false, afternoon: false, allDay: false, date: null }; changed = true; }
  if (!Array.isArray(next.todos)) { next.todos = []; changed = true; }
  if (!Array.isArray(next.completedActions)) { next.completedActions = []; changed = true; }
  if (!next.practiceContent || typeof next.practiceContent !== 'object' ||
      !next.practiceContent.interviewPrep || !next.practiceContent.personalNarrative || !next.practiceContent.clevelQs) {
    next.practiceContent = SEED_PRACTICE_CONTENT; changed = true;
  }
  if (!next.routineCompletions || typeof next.routineCompletions !== 'object') {
    next.routineCompletions = {};
    changed = true;
  }
  // v23: interview prep page data
  if (!next.interviewPrep || !Array.isArray(next.interviewPrep.categories)) {
    next.interviewPrep = { categories: [], questions: [], stories: [] };
    changed = true;
  }
  if (!next.weather || typeof next.weather !== 'object') {
    next.weather = { lat: null, lon: null, label: '', source: 'unset' };
    changed = true;
  }
  // v13: theme preference. Existing users get light by default (the new default surface).
  if (!next.prefs || typeof next.prefs !== 'object') {
    next.prefs = { theme: 'light', categoryColors: {}, todayView: 'timeline', lunchSlot: { start: '12:30', duration: 60 } };
    changed = true;
  } else {
    if (!next.prefs.theme) { next.prefs.theme = 'light'; changed = true; }
    if (!next.prefs.categoryColors || typeof next.prefs.categoryColors !== 'object') {
      next.prefs.categoryColors = {};
      changed = true;
    }
    // v16: per-category emoji overrides
    if (!next.prefs.categoryEmojis || typeof next.prefs.categoryEmojis !== 'object') {
      next.prefs.categoryEmojis = {};
      changed = true;
    }
    if (!next.prefs.categoryLabels || typeof next.prefs.categoryLabels !== 'object') {
      next.prefs.categoryLabels = {};
      changed = true;
    }
    // v15: today view + lunch slot
    if (!next.prefs.todayView) { next.prefs.todayView = 'timeline'; changed = true; }
    if (next.prefs.nowLineColor === undefined) { next.prefs.nowLineColor = ''; changed = true; }
    if (next.prefs.miniMonthTodayColor === undefined) { next.prefs.miniMonthTodayColor = ''; changed = true; }
    if (next.prefs.nowEventColor === undefined) { next.prefs.nowEventColor = ''; changed = true; }
    if (!next.prefs.userCategories || typeof next.prefs.userCategories !== 'object') {
      next.prefs.userCategories = {};
      changed = true;
    }
    if (!next.prefs.lunchSlot || typeof next.prefs.lunchSlot !== 'object') {
      next.prefs.lunchSlot = { start: '12:30', duration: 60 };
      changed = true;
    }
  }
  // v11: routine items with string recurrence get structured form
  if (Array.isArray(next.routine)) {
    next.routine = next.routine.map((item: any) => {
      if (typeof item.recurrence === 'string') {
        // Try to parse 'top-of-hour-9-18' style
        const m = item.recurrence.match(/top-of-hour-(\d+)-(\d+)/);
        if (m) {
          changed = true;
          return { ...item, recurrence: { kind: 'top-of-hour', startHour: +m[1], endHour: +m[2] } };
        }
        // Unknown string — clear it
        changed = true;
        const { recurrence, ...rest } = item;
        return rest;
      }
      return item;
    });
  }
  if ('testCounter' in next) { delete next.testCounter; changed = true; }

  // v24: new engines
  if (!next.userProfile || typeof next.userProfile !== 'object') {
    next.userProfile = {
      id: 'singleton-user-profile',
      targetRoles: [],
      competencyFramework: [],
      positioningThesis: '',
      industries: [],
      geos: [],
      switchDeadline: '',
    };
    changed = true;
  }
  if (!Array.isArray(next.modules)) { next.modules = []; changed = true; }
  if (!Array.isArray(next.learning)) { next.learning = []; changed = true; }
  if (!Array.isArray(next.content)) { next.content = []; changed = true; }
  if (!next.create || typeof next.create !== 'object') {
    next.create = { ideas: [], posts: [] };
    changed = true;
  }
  if (!Array.isArray(next.progressLog)) { next.progressLog = []; changed = true; }
  if (!next.featureFlags || typeof next.featureFlags !== 'object') {
    next.featureFlags = {};
    changed = true;
  }
  
  // v25: PracticeItem migration from InterviewPrep + Daily Practice Hub
  if (prevVersion < 25) {
    if (!Array.isArray(next.practiceItems)) {
      next.practiceItems = [];
    }
    if (!Array.isArray(next.stories)) {
      next.stories = [];
    }
    
    if (next.interviewPrep) {
      if (Array.isArray(next.interviewPrep.questions)) {
        for (const q of next.interviewPrep.questions) {
          const pi: PracticeItem = {
            id: q.id,
            track: 'interview',
            prompt: q.question || '',
            answer: q.answer || {},
            status: q.status || 'draft',
            confidence: q.confidence || 1,
            lastPracticedAt: q.lastPracticedAt,
            nextPracticeAt: q.nextPracticeAt,
            rehearsalCount: q.rehearsalCount || 0,
            linkedStoryIds: q.linkedStoryIds || [],
            tags: q.tags || [],
            createdAt: q.createdAt || new Date().toISOString(),
            updatedAt: q.updatedAt || new Date().toISOString(),
            _deleted: q._deleted
          };
          next.practiceItems.push(pi);
        }
      }
      
      if (Array.isArray(next.interviewPrep.stories)) {
        for (const s of next.interviewPrep.stories) {
          next.stories.push(s);
        }
      }
      
      delete next.interviewPrep;
    }
    
    // Convert Practice Hub items
    if (next.practiceContent) {
      if (Array.isArray(next.practiceContent.clevelQs)) {
        for (const q of next.practiceContent.clevelQs) {
          next.practiceItems.push({
            id: q.id,
            track: 'clevel',
            prompt: q.question || '',
            answer: {
              fullContent: q.fullContent || '',
              bullets: q.bullets || [],
              profile: q.profile || ''
            },
            status: q.streak > 0 ? 'practice' : 'draft',
            confidence: q.streak > 0 ? 3 : 1,
            lastPracticedAt: q.lastPracticed,
            rehearsalCount: q.streak || 0,
            tags: q.profile ? [q.profile] : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      if (Array.isArray(next.practiceContent.personalNarrative)) {
        for (const q of next.practiceContent.personalNarrative) {
          next.practiceItems.push({
            id: q.id,
            track: 'narrative',
            prompt: q.question || '',
            answer: {
              fullContent: q.fullContent || '',
              bullets: q.bullets || [],
              category: q.category || ''
            },
            status: q.streak > 0 ? 'practice' : 'draft',
            confidence: q.streak > 0 ? 3 : 1,
            lastPracticedAt: q.lastPracticed,
            rehearsalCount: q.streak || 0,
            tags: q.category ? [q.category] : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
      
      delete next.practiceContent;
    }
    
    changed = true;
  }

  return { data: next, migrated: changed };
}

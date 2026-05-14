const { useState, useEffect, useRef, useCallback, useMemo } = React;

// Apply theme attribute synchronously, before any render, to avoid a brief
// dark-flash on the boot screen for light-theme users.
document.documentElement.setAttribute('data-theme', 'light');

// ═════════════════════════════════════════════════════════════
// CONFIG
// ═════════════════════════════════════════════════════════════
const CLIENT_ID = '25894919429-pbtl8l6nn23vnvc8c8cbhg5f3n8gepu6.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'my-planning-data.json';
const SCHEMA_VERSION = 18;

// Days: JS Date.getDay() — 0=Sun, 1=Mon ... 6=Sat. Visual columns are Mon-first.
const VISUAL_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_LONG  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CATEGORY_STYLES = {
  supplement: { color: '#9C8845', label: 'Supplement', bgAlpha: 0.10, emoji: '💊' },
  focus:      { color: '#A78BCA', label: 'Focus',      bgAlpha: 0.13, emoji: '🎯' },
  gym:        { color: '#7EB8A4', label: 'Physical',   bgAlpha: 0.13, emoji: '🏋️' },
  review:     { color: '#C9A84C', label: 'Review',     bgAlpha: 0.16, emoji: '📊' },
  planning:   { color: '#7A7268', label: 'Planning',   bgAlpha: 0.10, emoji: '🗓️' },
  prep:       { color: '#7A7268', label: 'Prep',       bgAlpha: 0.10, emoji: '🎒' },
  elsewhere:  { color: '#E07B6A', label: 'Elsewhere',  bgAlpha: 0.10, emoji: '🚗' },
  commute:    { color: '#B5896E', label: 'Commute',    bgAlpha: 0.10, emoji: '🚙' },
  'micro-strength': { color: '#7EB8A4', label: 'Micro-strength', bgAlpha: 0.06, emoji: '⚡' },
};

function getCategoryColor(category, userColors) {
  if (userColors && typeof userColors === 'object' && userColors[category]) {
    return userColors[category];
  }
  return (CATEGORY_STYLES[category] || CATEGORY_STYLES.supplement).color;
}

function getCategoryEmoji(category, userEmojis) {
  if (userEmojis && typeof userEmojis === 'object' && userEmojis[category]) {
    return userEmojis[category];
  }
  return (CATEGORY_STYLES[category] || CATEGORY_STYLES.supplement).emoji;
}

function categoryStylesWith(userColors, userEmojis) {
  const out = {};
  Object.entries(CATEGORY_STYLES).forEach(([k, v]) => {
    out[k] = { ...v, color: getCategoryColor(k, userColors), emoji: getCategoryEmoji(k, userEmojis) };
  });
  return out;
}

// Curated emoji library — ~100 thoughtfully chosen, grouped, scannable.
const EMOJI_LIBRARY = [
  { group: 'Health', emojis: ['💊', '🧴', '💉', '🩺', '🌿', '🥬', '🥦', '🥕', '🍎', '🍊', '🥑', '🥚', '🍳', '🥗', '🍵', '☕', '💧', '🥤'] },
  { group: 'Body', emojis: ['🏋️', '🏃', '🚴', '🧘', '🤸', '⛹️', '🏊', '🚶', '💪', '🦵', '🧠', '❤️', '⚡', '🔥', '✨'] },
  { group: 'Work', emojis: ['🎯', '📊', '📈', '📉', '💼', '🗂️', '📁', '📋', '📝', '✏️', '🖊️', '📌', '📎', '🔧', '⚙️', '🛠️', '💡', '🔍'] },
  { group: 'Time', emojis: ['🗓️', '📅', '🕐', '⏰', '⏳', '⌛', '🌅', '☀️', '🌤️', '🌙', '⭐', '🌟'] },
  { group: 'Travel', emojis: ['🚗', '🚙', '🚕', '🚌', '🚆', '✈️', '🛫', '🚲', '🛴', '🎒', '🧳', '🗺️', '🏠', '🏢', '🏪'] },
  { group: 'Tools', emojis: ['💻', '🖥️', '📱', '⌨️', '🖱️', '🎧', '📞', '✉️', '📧', '🔔', '🔕', '🔒', '🔓', '🔑'] },
  { group: 'Things', emojis: ['🎵', '🎨', '📚', '📖', '✍️', '🎬', '🎮', '🧩', '♟️', '🎲', '🍽️', '🛁', '🛏️', '🧺', '🧹'] },
  { group: 'Nature', emojis: ['🌳', '🌲', '🌴', '🌵', '🌷', '🌸', '🌼', '🌻', '🌊', '🏖️', '⛰️', '🌍'] },
  { group: 'Symbols', emojis: ['✅', '❌', '⭕', '➕', '➖', '✔️', '🚫', '⚠️', '❗', '❓', '💯', '🆗', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣'] },
];


// Standard contents for the gym bag — used as note text on every "pack gym bag" event.
const GYM_BAG_CONTENTS = 'Shoes · socks · shorts/jogging · t-shirt · sweater · water bottle with electrolytes';
const WORK_BAG_CONTENTS = '2 laptops · mouse · cables · AirPods · watch';

// ─────────────────────────────────────────────────────────────
// SEED ROUTINE — derived from MY PLANNING - routine.md and routine-details.md.
// Times are local 24h "HH:MM". Duration is in minutes. days uses JS Date.getDay().
// ─────────────────────────────────────────────────────────────
const SEED_ROUTINE = [
  // Daily supplements (creatine pt 2 is daily except Monday — Monday gets its own at 18:30)
  { id: 'sup-probiotic', title: 'Probiotic',         days: [0,1,2,3,4,5,6], start: '07:15', duration: 10, category: 'supplement' },
  { id: 'sup-omega',     title: 'Omega',             days: [0,1,2,3,4,5,6], start: '07:15', duration: 10, category: 'supplement' },
  { id: 'sup-mag1',      title: 'Magnesium • Pt 1',  days: [0,1,2,3,4,5,6], start: '07:15', duration: 10, category: 'supplement' },
  { id: 'sup-multi',     title: 'Multi-vitamins',    days: [0,1,2,3,4,5,6], start: '07:45', duration: 10, category: 'supplement' },
  { id: 'sup-creat1',    title: 'Creatine • Pt 1',   days: [0,1,2,3,4,5,6], start: '10:30', duration: 10, category: 'supplement' },
  { id: 'sup-collagen',  title: 'Collagen',          days: [0,1,2,3,4,5,6], start: '13:00', duration: 10, category: 'supplement' },
  { id: 'sup-hair',      title: 'Hair & nails',      days: [0,1,2,3,4,5,6], start: '13:00', duration: 10, category: 'supplement' },
  { id: 'sup-creat2',    title: 'Creatine • Pt 2',   days: [0,2,3,4,5,6],   start: '16:45', duration: 10, category: 'supplement' },
  { id: 'sup-creat2-mon',title: 'Creatine • Pt 2',   days: [1],             start: '18:30', duration: 10, category: 'supplement' },
  { id: 'sup-mag2',      title: 'Magnesium • Pt 2',  days: [0,1,2,3,4,5,6], start: '22:30', duration: 10, category: 'supplement' },

  // Protein Mon-Fri
  { id: 'protein-mf', title: 'Protein', days: [1,2,3,4,5], start: '07:35', duration: 10, category: 'supplement' },

  // Focus session Mon-Fri (any location)
  { id: 'focus-mf', title: '2h Focus Session', days: [1,2,3,4,5], start: '08:45', duration: 120, category: 'focus',
    note: 'Cycle through projects: NEXT / APP - AI FOR SALES / AI content from NEXT.' },

  // Gym at home — Tue, Wed, Fri (08:00-08:20)
  { id: 'gym-home-tue', title: 'Gym at home', days: [2], start: '08:00', duration: 20, category: 'gym', homeOnly: true },
  { id: 'gym-home-wed', title: 'Gym at home', days: [3], start: '08:00', duration: 20, category: 'gym', homeOnly: true },
  { id: 'gym-home-fri', title: 'Gym at home', days: [5], start: '08:00', duration: 20, category: 'gym', homeOnly: true },

  // Monday: drive to co-working (with podcast)
  { id: 'drive-mon-am', title: 'Drive to co-working', days: [1], start: '08:00', duration: 30, category: 'commute',
    note: 'Listen to podcast — AI / B2B sales content.' },

  // Co-working space Monday — split around the gym break
  { id: 'cowork-mon-am', title: 'Co-working space', days: [1], start: '08:30', duration: 195, category: 'elsewhere' },
  { id: 'cowork-mon-pm', title: 'Co-working space', days: [1], start: '14:00', duration: 240, category: 'elsewhere' },

  // Monday: gym (drive there + back, with podcast both ways)
  { id: 'gym-ext-mon', title: 'Gym (external)', days: [1], start: '12:00', duration: 90, category: 'gym',
    note: 'Drive + workout. Leave 12:00, back 13:30. Electrolytes. Podcast in the car.' },

  // Monday evening: drive home from co-working (with podcast)
  { id: 'drive-mon-pm', title: 'Drive home', days: [1], start: '18:00', duration: 30, category: 'commute',
    note: 'Listen to podcast — AI / B2B sales content.' },

  // Thursday: gym (drive there + back, with podcast)
  { id: 'gym-ext-thu', title: 'Gym (external)', days: [4], start: '11:45', duration: 90, category: 'gym',
    note: 'Drive + workout. Leave 11:45, back 13:15. Electrolytes. Podcast in the car.' },

  // Friday weekly review
  { id: 'weekly-review', title: 'Weekly Review', days: [5], start: '15:00', duration: 30, category: 'review',
    note: 'CEO Weekly Reset — finish by 15:30. Laptop closed. Weekend protected.' },

  // Mon-Thu evening: plan tomorrow's focus
  { id: 'plan-tomorrow', title: "Plan tomorrow's focus", days: [1,2,3,4], start: '21:00', duration: 10, category: 'planning' },

  // Wednesday evening: prep Thu — split into two sequential events
  { id: 'prep-thu-bag', title: 'Pack Thu gym bag', days: [3], start: '18:30', duration: 10, category: 'prep',
    note: GYM_BAG_CONTENTS },
  { id: 'prep-thu-podcast', title: 'Pick Thu podcast', days: [3], start: '18:40', duration: 5, category: 'prep',
    note: 'Choose podcast for Thu drive (AI / B2B sales).' },

  // Sunday evening: prep week ahead — split into four sequential events starting 21:00
  { id: 'prep-sun-gym-bag', title: 'Pack Mon gym bag', days: [0], start: '21:00', duration: 10, category: 'prep',
    note: GYM_BAG_CONTENTS },
  { id: 'prep-sun-work-bag', title: 'Pack work bag', days: [0], start: '21:10', duration: 10, category: 'prep',
    note: WORK_BAG_CONTENTS },
  { id: 'prep-sun-podcast', title: 'Pick Mon podcast', days: [0], start: '21:20', duration: 5, category: 'prep',
    note: 'Choose podcast for Mon drive (AI / B2B sales).' },
  { id: 'prep-sun-winning', title: 'Define what winning looks like', days: [0], start: '21:25', duration: 15, category: 'planning',
    note: 'Set the bar for the upcoming week. Specific, measurable, ambitious.' },

  // Hourly Micro-Strength — special routine item with a top-of-hour recurrence.
  // Stored, not rendered as calendar blocks. Surfaces in the Right Now banner
  // during the configured window. Editable via Routine Manager.
  { id: 'micro-strength', title: 'Micro-Strength', days: [1,2,3,4,5], start: '09:00', duration: 1,
    category: 'micro-strength', homeOnly: true,
    recurrence: { kind: 'top-of-hour', startHour: 9, endHour: 18 },
    note: '' },
];

// ─────────────────────────────────────────────────────────────
// SEED PROJECTS — derived from the five status files in this Claude project.
// Tier 1=master, 2=career evidence, 3=health infra, 4=household hygiene, 5=meta-tooling.
// weeklyBudgetHours: number, or 0 = "when there's slack".
// status: short one-liner (verb-led), kept under ~120 chars.
// For NEXT (the master), the next actions live on individual modules, not on the project.
// For all others, nextActions live on the project.
// ─────────────────────────────────────────────────────────────
const SEED_PROJECTS = [
  {
    id: 'next',
    name: 'NEXT',
    subtitle: 'Change job · level up executive game',
    tier: 1,
    weeklyBudgetHours: 6,
    status: 'Foundation built; deep content development pending across 13 modules.',
    totalEffortRemainingHours: 67,
    color: '#C9A84C', // gold — master
    isMaster: true,
    prioritySequence: [11, 10, 9, 1, 5, 6, 7, 12, 13, 3, 4, 2, 8],
    modules: [
      { id: 'm1', number: 1, name: 'Interview Preparation',
        description: 'Master every type of senior AE interview question through repetition — MEDDPIC, forecasting, objection handling, closing, negotiation, C-level discussions, account planning, territory.',
        status: 'in progress', effortRemainingHours: 4,
        nextActions: [
          { id: 'm1-a1', text: 'Write 5 Q&As: budgeting conversations, territory planning, closing steps', estimatedMin: 60, status: 'open' },
          { id: 'm1-a2', text: 'Write 3 objection-handling scenarios for internal promotion context', estimatedMin: 45, status: 'open' },
          { id: 'm1-a3', text: 'Review 10 existing cards, decide additional categories', estimatedMin: 30, status: 'open' },
          { id: 'm1-a4', text: 'Run first full timed practice session (verbal, recorded)', estimatedMin: 60, status: 'open' },
        ] },
      { id: 'm2', number: 2, name: 'Complex B2B Sales Fluency Coach',
        description: 'Daily practice on sales methodology, deal strategy, qualification, pipeline management, competitive positioning — anchored in MEDDPICC.',
        status: 'in progress', effortRemainingHours: 5,
        nextActions: [
          { id: 'm2-a1', text: 'Extract content from ChatGPT Sales Fluency GPT into NEXT', estimatedMin: 60, status: 'open' },
          { id: 'm2-a2', text: 'Write 3 missing cards: pipeline mgmt, territory planning, competitive displacement', estimatedMin: 90, status: 'open' },
          { id: 'm2-a3', text: 'Define daily drill format (cards/session, rotation)', estimatedMin: 30, status: 'open' },
        ] },
      { id: 'm3', number: 3, name: 'Executive Communication Coach',
        description: 'Daily practice on structured, concise, high-impact communication — series of 3 questions, 5-question practice, email discipline, verbal delivery.',
        status: 'in progress', effortRemainingHours: 4,
        nextActions: [
          { id: 'm3-a1', text: 'Extract content from ChatGPT Exec Comm GPT into NEXT', estimatedMin: 60, status: 'open' },
          { id: 'm3-a2', text: 'Design daily 15-min session format for verbal practice', estimatedMin: 45, status: 'open' },
        ] },
      { id: 'm4', number: 4, name: 'C-Level Questioning & Prompting',
        description: 'Build fluency in asking the right questions to C-level execs — meetings, events, dinners — to build credibility and appear sharp.',
        status: 'in progress', effortRemainingHours: 4,
        nextActions: [
          { id: 'm4-a1', text: 'Write role-specific question sets: CFO / CMO / CDO / CTO', estimatedMin: 90, status: 'open' },
          { id: 'm4-a2', text: 'Write sector question sets: Banking / Insurance / Telco', estimatedMin: 75, status: 'open' },
          { id: 'm4-a3', text: 'Design rapid-fire question generation drill', estimatedMin: 45, status: 'open' },
        ] },
      { id: 'm5', number: 5, name: 'Enterprise Agentic AI Expertise',
        description: 'Expert-level knowledge on enterprise Agentic AI — adoption, impact, culture change, business outcomes, key use cases — with ROI models and vendor landscape.',
        status: 'in progress', effortRemainingHours: 6,
        nextActions: [
          { id: 'm5-a1', text: 'Extract content from ChatGPT Agentic AI project into NEXT', estimatedMin: 75, status: 'open' },
          { id: 'm5-a2', text: 'Write 2 cards: enterprise AI adoption framework + ROI model', estimatedMin: 90, status: 'open' },
          { id: 'm5-a3', text: 'Determine daily reading practice', estimatedMin: 30, status: 'open' },
        ] },
      { id: 'm6', number: 6, name: 'Agentic AI in Marketing',
        description: 'Deep expertise in Marketing AI — adoption patterns, use cases, business outcomes, CMO-level conversation frameworks, MarTech integration.',
        status: 'in progress', effortRemainingHours: 5,
        nextActions: [
          { id: 'm6-a1', text: 'Build dedicated Marketing AI module (currently 1 card — needs full expansion)', estimatedMin: 90, status: 'open' },
          { id: 'm6-a2', text: 'Write 3 cards: CMO conversation framework, attribution & measurement AI, MarTech stack', estimatedMin: 90, status: 'open' },
          { id: 'm6-a3', text: 'Write AgentForce-specific Marketing Cloud use cases (Salesforce angle)', estimatedMin: 45, status: 'open' },
        ] },
      { id: 'm7', number: 7, name: 'AI Certifications Track',
        description: 'Identify and complete free Agentic AI / Enterprise AI certifications to strengthen LinkedIn and CV.',
        status: 'not started', effortRemainingHours: 10,
        nextActions: [
          { id: 'm7-a1', text: 'Compile shortlist of 5–8 free certifications (Salesforce Agentforce, Google, IBM, Coursera)', estimatedMin: 60, status: 'open' },
          { id: 'm7-a2', text: 'Rank by LinkedIn signal value and time-to-complete', estimatedMin: 30, status: 'open' },
          { id: 'm7-a3', text: 'Block dedicated study slots for first 2 certifications', estimatedMin: 15, status: 'open' },
        ] },
      { id: 'm8', number: 8, name: 'Banking & Insurance Industry Knowledge',
        description: 'Up-to-date expertise on Banking and Insurance priorities, regulations (DORA, EU AI Act, Basel IV), and AI applications for credible C-level conversations.',
        status: 'in progress', effortRemainingHours: 5,
        nextActions: [
          { id: 'm8-a1', text: 'Write Banking domain brief: top 10 strategic priorities + KPIs C-levels manage', estimatedMin: 90, status: 'open' },
          { id: 'm8-a2', text: 'Write Insurance domain brief: claims, underwriting, distribution, AI use cases', estimatedMin: 90, status: 'open' },
          { id: 'm8-a3', text: 'Write 1 regulatory card: DORA + EU AI Act — implications for AI adoption timelines', estimatedMin: 45, status: 'open' },
        ] },
      { id: 'm9', number: 9, name: 'Leadership Module',
        description: 'Build and articulate a clear, compelling leadership philosophy — cross-cultural leadership, performance culture, coaching, change, building international teams.',
        status: 'in progress', effortRemainingHours: 5,
        nextActions: [
          { id: 'm9-a1', text: 'Write 3 cards: coaching & developing people, managing underperformance, cross-cultural (APAC/EMEA)', estimatedMin: 90, status: 'open' },
          { id: 'm9-a2', text: 'Write 1 card: building a performance culture from scratch in a new team', estimatedMin: 45, status: 'open' },
          { id: 'm9-a3', text: 'Run practice session on existing 2 cards (vision + executive presence) — verbal, timed', estimatedMin: 30, status: 'open' },
        ] },
      { id: 'm10', number: 10, name: 'Management Philosophy & Style',
        description: 'Fully develop and rehearse Mirror Management — the reciprocity-based management model — with worked examples, implementation plan, and real situation handling.',
        status: 'in progress', effortRemainingHours: 4,
        nextActions: [
          { id: 'm10-a1', text: 'Build dedicated standalone module (consolidate from other modules)', estimatedMin: 90, status: 'open' },
          { id: 'm10-a2', text: 'Write 2 worked examples: underperformance + trust-building with new team', estimatedMin: 75, status: 'open' },
          { id: 'm10-a3', text: 'Write "First 90 days as a new manager" — Mirror Management from day one', estimatedMin: 60, status: 'open' },
        ] },
      { id: 'm11', number: 11, name: 'Personal Pitches & Narrative',
        description: 'Polished, rehearsable pitches: international experience, cross-country strategy, management ambition, personal values (with proof), performance culture, leadership style.',
        status: 'in progress', effortRemainingHours: 5,
        nextActions: [
          { id: 'm11-a1', text: 'Define 4–5 core values with 2-sentence proof points each (real career moments)', estimatedMin: 75, status: 'open' },
          { id: 'm11-a2', text: 'Write cross-country strategy pitch: why group-level deals create €10M+ partnerships', estimatedMin: 75, status: 'open' },
          { id: 'm11-a3', text: 'Write performance culture pitch + excellence-through-iteration pitch', estimatedMin: 60, status: 'open' },
        ] },
      { id: 'm12', number: 12, name: 'LinkedIn Profile Refresh',
        description: 'Full rewrite of LinkedIn — headline, about section, experience bullets — maximising numbers, international scope, C-level engagement credibility, AI expertise positioning.',
        status: 'not started', effortRemainingHours: 4,
        nextActions: [
          { id: 'm12-a1', text: 'Rewrite LinkedIn headline (3 variants to test)', estimatedMin: 30, status: 'open' },
          { id: 'm12-a2', text: 'Rewrite About: hook → international narrative → AI expertise → ambition → CTA', estimatedMin: 90, status: 'open' },
          { id: 'm12-a3', text: 'Rewrite top 3 experience bullets for HCLSoftware role with metrics', estimatedMin: 60, status: 'open' },
        ] },
      { id: 'm13', number: 13, name: 'LinkedIn Thought Leadership — Agentic AI',
        description: 'High-impact, opinionated LinkedIn posts on Enterprise Agentic AI and Agentic AI in Marketing — written in your voice, not generic AI content.',
        status: 'not started', effortRemainingHours: 6,
        nextActions: [
          { id: 'm13-a1', text: 'Define personal tone guide: 5 rules for how your LinkedIn posts sound', estimatedMin: 45, status: 'open' },
          { id: 'm13-a2', text: 'Draft first post: contrarian or insight-led take on enterprise Agentic AI adoption', estimatedMin: 75, status: 'open' },
          { id: 'm13-a3', text: 'Build 4-week content calendar outline (1 post/week, varied formats)', estimatedMin: 45, status: 'open' },
        ] },
    ],
  },
  {
    id: 'ai-for-sales',
    name: 'APP - AI FOR SALES',
    subtitle: 'Account Intelligence Report skill',
    tier: 2,
    weeklyBudgetHours: 3,
    status: 'v1 of skill is built and packaged; needs real-world pressure-testing on a live target account.',
    totalEffortRemainingHours: 7,
    color: '#A78BCA', // violet
    nextActions: [
      { id: 'ais-a1', text: 'Run skill end-to-end on one real Financial Services target — listed FR/Benelux/DACH bank or insurer', estimatedMin: 45, status: 'open' },
      { id: 'ais-a2', text: 'Read output critically vs checklist; write list of v1 weaknesses', estimatedMin: 30, status: 'open' },
      { id: 'ais-a3', text: 'Patch 1–2 weaknesses, repackage skill, retest on same target', estimatedMin: 60, status: 'open' },
    ],
  },
  {
    id: 'gym-translation',
    name: 'Gym Exercise Translation',
    subtitle: 'List of exercises with 2-step diagrams',
    tier: 3,
    weeklyBudgetHours: 2,
    status: 'List of exercises ready; needs to be compiled into a one or two-pager with simple 2-step diagrams.',
    totalEffortRemainingHours: 4,
    color: '#7EB8A4', // teal
    nextActions: [
      { id: 'gym-a1', text: 'Pick the format (single PDF, printable card stack, web page)', estimatedMin: 20, status: 'open' },
      { id: 'gym-a2', text: 'Compile exercise list into structured doc (name + 2-step description)', estimatedMin: 60, status: 'open' },
      { id: 'gym-a3', text: 'Generate 2-step diagram per exercise (start point + end point)', estimatedMin: 120, status: 'open' },
      { id: 'gym-a4', text: 'Final layout pass + print/save final version', estimatedMin: 30, status: 'open' },
    ],
  },
  {
    id: 'finance-tracking',
    name: 'APP - FINANCE TRACKING',
    subtitle: 'Household expense tracker',
    tier: 4,
    weeklyBudgetHours: 1,
    status: 'Tracker functionally complete; final categorization + dashboard validation pending.',
    totalEffortRemainingHours: 1.5,
    color: '#B5896E', // warm tan — household
    nextActions: [
      { id: 'fin-a1', text: 'Load real bank export, apply rules until all entries are green, export categorised xlsx', estimatedMin: 45, status: 'open' },
      { id: 'fin-a2', text: 'Review dashboard with real data: validate groupings, fix amounts, tweak Fixed expenses', estimatedMin: 20, status: 'open' },
      { id: 'fin-a3', text: 'Add missing rules, save categories + rules to app, archive working HTML', estimatedMin: 15, status: 'open' },
    ],
  },
  {
    id: 'investment',
    name: 'APP - INVESTMENT',
    subtitle: 'Financial Advisor Agent',
    tier: 4,
    weeklyBudgetHours: 1,
    status: 'Research agent paused; redesigning around real investment goals before more code.',
    totalEffortRemainingHours: 5,
    color: '#9C8845', // muted gold
    nextActions: [
      { id: 'inv-a1', text: 'Answer 2 scoping questions (PEA opened? Final ETF shortlist?) and confirm strategy', estimatedMin: 15, status: 'open' },
      { id: 'inv-a2', text: 'Replace news-focused watchlist with positions.json reflecting real holdings; update config.py', estimatedMin: 20, status: 'open' },
      { id: 'inv-a3', text: 'Redesign agent: weekly portfolio snapshot + ETF health check + plain-English verdict', estimatedMin: 30, status: 'open' },
    ],
  },
  {
    id: 'routine-planner',
    name: 'APP - ROUTINE PLANNER',
    subtitle: 'Long-term: native mobile routine app',
    tier: 5,
    weeklyBudgetHours: 0, // slack only
    status: 'Architecture decided; blank Expo app running on iPhone; ready for first real screen.',
    totalEffortRemainingHours: 135,
    color: '#7A7268', // muted gray
    nextActions: [
      { id: 'rp-a1', text: 'Create src/ folder structure (screens/, components/, data/) and commit', estimatedMin: 20, status: 'open' },
      { id: 'rp-a2', text: 'Build routine display screen (read-only weekly schedule, hardcoded data)', estimatedMin: 90, status: 'open' },
      { id: 'rp-a3', text: 'Replace hardcoded routine with Supabase table (create free Supabase project first)', estimatedMin: 60, status: 'open' },
    ],
  },
];

// Module status visual mapping (used in NEXT module list)
const MODULE_STATUS_STYLE = {
  'not started': { color: '#5A5248', label: 'Not started' },
  'in progress': { color: '#C9A84C', label: 'In progress' },
  'paused':      { color: '#E07B6A', label: 'Paused' },
  'complete':    { color: '#7EB8A4', label: 'Complete' },
};

// Categories users can pick when adding/editing routine items
const CATEGORY_OPTIONS = ['supplement', 'focus', 'gym', 'review', 'planning', 'prep', 'elsewhere', 'commute'];

// ─────────────────────────────────────────────────────────────
// WEEKLY RESET PHASES — ported from ceo-weekly-reset.jsx
// 5 phases, ~20 minutes total. Friday 15:00–15:30 ritual.
// ─────────────────────────────────────────────────────────────
const WEEKLY_RESET_PHASES = [
  {
    id: 'pulse',
    label: 'I. PULSE CHECK',
    duration: 120,
    color: '#C9A84C',
    prompts: [
      { q: "Energy level entering this week's reset (1–10)", type: 'scale', key: 'energy' },
      { q: 'One word that captures how this week felt', type: 'short', key: 'word' },
      { q: 'If this week was an investment, what return did it generate?', type: 'short', key: 'roi' },
    ],
  },
  {
    id: 'audit',
    label: 'II. WEEK AUDIT',
    duration: 360,
    color: '#7EB8A4',
    prompts: [
      { q: 'What went well this week? (Be specific — name the moment, decision, or output.)', type: 'long', key: 'wentWell' },
      { q: 'What should be changed, improved, removed, or expanded?', type: 'long', key: 'improve' },
      { q: 'Score this week across four dimensions (1–5)', type: 'scorecard', key: 'scorecard' },
      { q: 'Where did I spend time this week that a senior executive would not have? What did that cost me?', type: 'long', key: 'timeCost' },
      { q: 'Which activities, if doubled, would meaningfully improve my life or career?', type: 'long', key: 'double' },
      { q: 'Which activities, if halved or removed, would improve my life?', type: 'long', key: 'halve' },
    ],
  },
  {
    id: 'leadership',
    label: 'III. LEADERSHIP LENS',
    duration: 300,
    color: '#A78BCA',
    prompts: [
      { q: 'At which moments did I give in to my ego? What triggered it?', type: 'long', key: 'ego' },
      { q: 'At which moments did I give in to emotion instead of judgment? What was at stake?', type: 'long', key: 'emotion2' },
      { q: 'Where did I demonstrate leadership or composure under pressure? (Name the moment.)', type: 'long', key: 'values' },
      { q: 'Story capture — which moment this week is worth keeping?', type: 'story', key: 'story' },
    ],
  },
  {
    id: 'strategic',
    label: 'IV. STRATEGIC ALIGNMENT',
    duration: 240,
    color: '#E07B6A',
    prompts: [
      { q: 'Am I working on the right problems and priorities? What evidence supports or challenges this?', type: 'long', key: 'priorities' },
      { q: 'What is the single highest-leverage move I could make next week?', type: 'long', key: 'leverage' },
    ],
  },
  {
    id: 'commit',
    label: 'V. FORWARD COMMITMENT',
    duration: 180,
    color: '#C9A84C',
    prompts: [
      { q: 'Key Insight #1 — What is the most important thing I learned this week?', type: 'long', key: 'insight1' },
      { q: 'Key Insight #2 — What pattern am I noticing across recent weeks?', type: 'long', key: 'insight2' },
      { q: 'Key Insight #3 — What belief or behavior needs to shift?', type: 'long', key: 'insight3' },
      { q: 'Improvement Experiment for Next Week — What will I test? How will I know it worked?', type: 'long', key: 'experiment' },
    ],
  },
];
const WEEKLY_RESET_TOTAL_SECONDS = WEEKLY_RESET_PHASES.reduce((a, p) => a + p.duration, 0);

// ─────────────────────────────────────────────────────────────
// SEED REFERENCE LIBRARY — quick-access reference content.
// Each entry is a static text reference, editable by the user.
// ─────────────────────────────────────────────────────────────
const SEED_REFERENCE_LIBRARY = [
  {
    id: 'ref-micro-strength',
    title: 'Micro-Strength Protocol',
    body: `Top of every hour, 9–18, Mon–Fri. ~60–80 seconds total.

1. Air squats — 10 reps
   Feet shoulder-width, sit back, knees track over toes, full depth.

2. Kettlebell Romanian Deadlift (RDL) — 10 reps
   Hinge at hips, slight knee bend, KB stays close to legs, neutral spine.

3. Push-ups — 10 reps
   Tight core, full range, elbows at ~45°.

4. Kettlebell One-Arm Row — 6 reps per side
   Or both arms standing/leaning forward with 2 kettlebells.
   Drive elbow up and back, squeeze shoulder blade.`,
  },
  {
    id: 'ref-gym-bag',
    title: 'Gym Bag Contents',
    body: `Pack the night before. Standard contents:

• Shoes
• Socks
• Shorts / jogging
• T-shirt
• Sweater
• Water bottle (with electrolytes)`,
  },
  {
    id: 'ref-work-bag',
    title: 'Work Bag Contents',
    body: `Pack the night before. Standard contents:

• 2 laptops
• Mouse
• Cables
• AirPods
• Watch`,
  },
  {
    id: 'ref-weekly-review',
    title: 'Friday Weekly Review — Quick Template',
    body: `30 minutes. Finish by 15:30. Laptop closed. Weekend protected.

Reflection:
• What went well this week?
• What can be changed, improved, removed, or expanded?
• Am I working on the right thing?
• Did I achieve what I said winning would look like (Sunday's definition)?

Patterns to watch:
• Activities that, doubled, would meaningfully improve life?
  (Sport · Reading · Outside activities)
• Activities that, halved, would meaningfully improve life?
  (e.g. ruminating about job change)

Capture a story:
• Which moment from this week is worth keeping for future interviews?
  (Use STAR format if it helps: Situation, Task, Action, Result)

Close the week:
• Block next week's calendar based on top priorities
• Cancel/move meetings that don't support them
• Build in thinking time and reset space FIRST`,
  },
  {
    id: 'ref-meeting-reset',
    title: 'Meeting Reset · 60-Second Executive Reset',
    body: `START WITH LOW VOLUME
PAUSE. THINK. SPEAK. SPEAK SLOWLY. USE LOW TONE.
Slow is smooth. Smooth is powerful.

EMOTIONAL CONTROL AT ALL TIMES. ONE SINGLE BREAK IS REMEMBERED.
WHEN IN DIFFICULTY: PAUSE, BREATHE, SLOW DOWN, THINK, ASK A QUESTION, TRY TO UNDERSTAND

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

0–15 SECONDS · PHYSIOLOGY RESET
• Sit upright
• Feet grounded
• Inhale 4 seconds
• Exhale 6 seconds
• Lower shoulders
• Relax jaw
• Slow blinking

> Calm body. Clear mind.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

15–30 SECONDS · IDENTITY ANCHOR
Silently repeat:
• I operate at executive altitude. I am operating at the level I am stepping into — not the level I am leaving.
• I am here to bring perspective.
• I don't need approval.

> Shift from performer → strategic advisor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

30–45 SECONDS · INTENT LOCK
Ask yourself:
1. What is the real business objective?
2. What outcome must exist at the end?
3. What decision or next step do I want?

> Compress into one sentence:
> "By the end of this meeting, we will have clarity on ______."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

45–60 SECONDS · EXECUTIVE CALIBRATION

• Slow down
• Low tone, cut intensity
• Cut 20% (Executives respect compression — be mindful of that mid-sentence)
• At all times during the meeting, make sure you are still addressing the question: What decision are we driving toward?
• Pause before answering (two seconds of silence = authority). When answering: synthesize, respond with structure
• Structure everything, never ramble:
   – three points
   – SCQA
   – problem → impact → options → recommendation
   – current state → risk → path forward
  Executives think in frameworks.
• Speak in outcomes (Revenue, Risk, Growth, Time-to-Value, Competitive Advantage — if it doesn't connect to business impact, cut it.)
• No defensive energy, no justifying. State. Pause. Stop. Do not stack arguments or fill silence or over-explain. Play with strategically placed silences.
• Teach, do not perform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DISAGREEING WITH A SENIOR LEADER
• "May I offer an alternative angle?"
• "One potential risk I see is ___."
• "Another way to approach this could be ___."

NO DEFENSIVE ENERGY · IF CHALLENGED
• "That's a fair point."
• "Let's unpack that."
• "Help me understand your concern."
• "Here's how I'm thinking about it."

> Calm curiosity = power.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DISCUSSING CHALLENGES OR ROADBLOCKS · STRUCTURE
1. What is the strategic objective?
2. What decisions were made and by whom (factually)?
3. What was tried?
4. Why did it not work (factually)?
5. What observable results occurred?
6. What structural gap does this reveal?
7. What changed as a result, what is the impact?
8. What is the recommendation now?
9. What is the constructive path forward?

When in frustration, talk about SYSTEMS, not people.
"They didn't…" → "The current process creates…"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHEN TENSION IN THE ROOM
Causes: Ownership ambiguity · Perceived criticism · Budget/resource pressure · Ego protection · Past decisions being questioned.
Goal: Raise altitude, protect relationships, re-anchor to business impact, move the room forward.

· SLOW THE ROOM (de-escalate)
"I think we're touching something important, let's pause for a second and align on what we're trying to solve / to clarify the objective."

· MOVE AWAY FROM PEOPLE → TOWARD PURPOSE
• "The original objective was ___."
• "The business outcome we're aiming for is ___."
• "If we zoom out, the real question is ___."
• "Rather than focusing on who, can we focus on what in the process allowed this?"

· NEUTRALIZE PERSONAL FRICTION
"I don't see this as a people issue — I see this as a structural one. I think everyone acted based on the information available at the time."

· TURN TENSION INTO FORWARD MOTION (pivot)
• "Given that, what would strengthen this moving forward?"
• "What adjustment would materially improve our odds next time?"
• "If we were to redesign this from scratch, what would we change?"

· CLOSE WITH DIRECTION
• "Here's what I'm hearing…" (3 bullets)
• "Does this reflect where we are?"
• "So next step would be ___ — agreed?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTROL THE FRAME
"Let's align on the objective of this discussion. From your perspective, what would make this a successful conversation?"

CLOSE WITH DIRECTION
End with:
• Clear summary
• Clear next step
• Clear owner

Authority is clarity of movement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> Calm = Authority

MY MINDSET = Calm. Clear. Structured. Outcome-driven.
MY APPROACH TO CHALLENGES: Stay neutral. Altitude. System, not ego. No rush.`,
  },
];

// ─────────────────────────────────────────────────────────────
// SEED PRACTICE CONTENT — Daily Practice Hub initial content.
// Three tabs: interviewPrep, personalNarrative, clevelQs.
// fullContent: '' means the user writes their answer. bullets are starter prompts.
// ─────────────────────────────────────────────────────────────
const SEED_PRACTICE_CONTENT = {
  interviewPrep: [
    { id: 'ip-01', category: 'behavioral', question: 'Tell me about a time you managed a complex, multi-stakeholder enterprise deal from discovery to close.', fullContent: '', bullets: ['Who were the stakeholders and what were their competing priorities?', 'What was your qualification approach (MEDDPICC)?', 'What was the key turning point in the deal?', 'What was the outcome — ARR, cycle time, expansion potential?'], lastPracticed: null, streak: 0 },
    { id: 'ip-02', category: 'behavioral', question: 'Describe a deal you lost. What happened, and what did you learn from it?', fullContent: '', bullets: ['What was the deal and why did you lose it?', 'Were the signals there earlier? What did you miss?', 'What would you do differently?', 'How did this change your process going forward?'], lastPracticed: null, streak: 0 },
    { id: 'ip-03', category: 'behavioral', question: 'Tell me about a time you had to rebuild trust with a customer or internal stakeholder after something went wrong.', fullContent: '', bullets: ['What broke the trust — your action or something else?', 'What immediate steps did you take?', 'How did you rebuild the relationship over time?', 'What was the long-term outcome?'], lastPracticed: null, streak: 0 },
    { id: 'ip-04', category: 'behavioral', question: 'Give me an example of when you influenced a decision at C-level without having direct authority.', fullContent: '', bullets: ['What was the decision and why did it matter?', 'Who were you influencing and what was their resistance?', 'What was your approach — data, framing, relationships?', 'What happened as a result?'], lastPracticed: null, streak: 0 },
    { id: 'ip-05', category: 'behavioral', question: 'Tell me about a time you had to prioritise ruthlessly when you had too many competing demands.', fullContent: '', bullets: ['What were the competing demands?', 'How did you decide what to cut or delay?', 'Who did you disappoint and how did you manage that?', 'What would you do differently now?'], lastPracticed: null, streak: 0 },
    { id: 'ip-06', category: 'competency', question: 'How do you qualify an enterprise deal? Walk me through your process.', fullContent: '', bullets: ['Which framework do you use (MEDDPICC) and why?', 'What are your three non-negotiable qualification criteria?', 'At what stage do you disqualify — and what does that conversation look like?', 'How do you keep qualification honest in a pipeline review?'], lastPracticed: null, streak: 0 },
    { id: 'ip-07', category: 'competency', question: 'How do you manage a pipeline of 8–12 enterprise accounts simultaneously?', fullContent: '', bullets: ['How do you structure your week across accounts?', 'How do you decide where to focus your energy on any given day?', 'How do you prevent deals from going silent?', 'What does your CRM discipline look like?'], lastPracticed: null, streak: 0 },
    { id: 'ip-08', category: 'competency', question: 'How do you approach territory planning at the start of a year?', fullContent: '', bullets: ['How do you segment and prioritise your accounts?', 'What data do you use to build your target list?', 'How do you set quarterly milestones?', 'How does the territory plan connect to your daily activity?'], lastPracticed: null, streak: 0 },
    { id: 'ip-09', category: 'competency', question: 'How do you handle a CFO who challenges the business case of your solution?', fullContent: '', bullets: ['What is your preparation before any CFO conversation?', 'How do you respond in the moment to a sharp "what is the ROI?"', 'How do you reframe risk vs. cost of inaction?', 'What does a successful close look like with a CFO?'], lastPracticed: null, streak: 0 },
    { id: 'ip-10', category: 'situational', question: 'You are at 60% of quota in Q3 with two months left. What do you do?', fullContent: '', bullets: ['What is your immediate diagnosis — pipeline coverage, velocity, deal health?', 'Which deals do you accelerate and which do you cut?', 'What is your conversation with your manager?', 'What does week 1 look like in practice?'], lastPracticed: null, streak: 0 },
    { id: 'ip-11', category: 'situational', question: 'A key champion at your largest deal leaves the company mid-cycle. How do you respond?', fullContent: '', bullets: ['What are the first 48 hours?', 'How do you map the new power structure?', 'How do you re-establish executive access?', 'What is your contingency if the deal stalls?'], lastPracticed: null, streak: 0 },
    { id: 'ip-12', category: 'situational', question: 'You are asked to negotiate a renewal with a customer threatening to leave for a competitor. How do you approach it?', fullContent: '', bullets: ['What do you need to understand before the negotiation?', 'How do you reframe value before touching price?', 'What concessions are you willing to make and what are you protecting?', 'How do you create urgency without desperation?'], lastPracticed: null, streak: 0 },
    { id: 'ip-13', category: 'motivation', question: 'Why are you looking to leave your current role?', fullContent: '', bullets: ['What is the honest but professional answer?', 'How do you frame ambition without criticising your employer?', 'What specific opportunity are you seeking at the next level?', 'How does this role connect to your 3-year goal?'], lastPracticed: null, streak: 0 },
    { id: 'ip-14', category: 'motivation', question: 'Where do you see yourself in 3 years?', fullContent: '', bullets: ['What is your concrete ambition (title, scope, impact)?', 'Why does this role specifically accelerate that trajectory?', 'What skills are you actively developing to get there?', 'How does this role fit into the sequence?'], lastPracticed: null, streak: 0 },
    { id: 'ip-15', category: 'motivation', question: 'What makes you different from the other candidates we are seeing?', fullContent: '', bullets: ['International scope and cross-country deal strategy', 'Combination of enterprise sales + technical AI fluency', 'Track record of C-level access and executive communication', 'Ability to operate in ambiguity and build from scratch'], lastPracticed: null, streak: 0 },
  ],
  personalNarrative: [
    { id: 'pn-01', category: 'pitch', question: 'Your 90-second executive pitch — who you are, what you bring, what you are building toward.', fullContent: '', bullets: ['Opening hook — international scope or defining achievement', 'Core identity: enterprise AI sales + C-level access + cross-border strategy', 'What you are building toward and why now', 'Close: what you bring to this role specifically'], lastPracticed: null, streak: 0 },
    { id: 'pn-02', category: 'pitch', question: 'Tell me about your international experience and what it taught you about selling across cultures.', fullContent: '', bullets: ['Scope: countries, languages, teams, deal types', 'What a cross-country deal strategy looks like in practice', 'What cultural fluency changes in your approach', 'The result: revenue, relationships, learnings'], lastPracticed: null, streak: 0 },
    { id: 'pn-03', category: 'values', question: 'What are your core professional values — and can you prove each one with a real example?', fullContent: '', bullets: ['Value 1: [name it] — proof point from your career', 'Value 2: [name it] — proof point from your career', 'Value 3: [name it] — proof point from your career', 'Why these values matter in the role you are targeting'], lastPracticed: null, streak: 0 },
    { id: 'pn-04', category: 'leadership', question: 'Describe your management philosophy — how do you build and develop a team?', fullContent: '', bullets: ['Mirror Management — reciprocity as the core principle', 'How you set expectations and hold people to them', 'How you develop underperformers vs. top performers differently', 'Your belief about what makes a high-performance culture'], lastPracticed: null, streak: 0 },
    { id: 'pn-05', category: 'leadership', question: 'Tell me about a time you built a high-performance culture from scratch in a new team.', fullContent: '', bullets: ['What state was the team in when you arrived?', 'What were your first 90-day priorities?', 'What did you change structurally vs. culturally?', 'What were the measurable outcomes 6–12 months later?'], lastPracticed: null, streak: 0 },
    { id: 'pn-06', category: 'international', question: 'What does a group-level, cross-country enterprise deal strategy look like, and why does it create outsized value?', fullContent: '', bullets: ['Why group-level deals are structurally different from country deals', 'How to identify and engage the group-level executive sponsor', 'What a multi-million partnership looks like at the start vs. 2 years in', 'The specific skills this requires (vs. single-country selling)'], lastPracticed: null, streak: 0 },
    { id: 'pn-07', category: 'international', question: 'How do you maintain executive presence and credibility in a language that is not your first?', fullContent: '', bullets: ['What adjustments do you make in French vs. English communication?', 'How do you handle pressure moments or difficult questions?', 'What is your discipline around preparation and structure?', 'What have you learned about cultural communication norms in EMEA?'], lastPracticed: null, streak: 0 },
  ],
  clevelQs: [
    { id: 'cl-01', profile: 'CEO', question: 'You have been 18 months into a major digital transformation. What would you say to your board about what you have learned that you could not have predicted at the start?', fullContent: '', bullets: ['Intent: understand their honest lessons, not the polished narrative', 'Follow-up: "What would you do differently in the first 90 days?"', 'Listen for: change fatigue, adoption gaps, budget surprises'], lastPracticed: null, streak: 0 },
    { id: 'cl-02', profile: 'CEO', question: 'If you could remove one structural constraint in your organisation tomorrow, what would it create?', fullContent: '', bullets: ['Intent: reveals what is genuinely slowing them down', 'Follow-up: "What has prevented that change so far?"', 'Listen for: legacy systems, talent gaps, governance bottlenecks'], lastPracticed: null, streak: 0 },
    { id: 'cl-03', profile: 'CEO', question: 'Where do you see your competitors outpacing you right now — and what is your honest take on why?', fullContent: '', bullets: ['Intent: executive honesty test, opens strategic gap conversation', 'Follow-up: "Is AI part of how you close that gap?"', 'Listen for: speed, talent, data, operating model'], lastPracticed: null, streak: 0 },
    { id: 'cl-04', profile: 'CFO', question: 'How are you currently evaluating AI investment proposals — what does a compelling business case look like to you?', fullContent: '', bullets: ['Intent: understand their ROI language and decision criteria', 'Follow-up: "What makes a pilot vs. a strategic investment to you?"', 'Listen for: IRR thresholds, payback window, risk appetite'], lastPracticed: null, streak: 0 },
    { id: 'cl-05', profile: 'CFO', question: 'Beyond cost reduction, what business outcomes would justify a significant AI spend to your board?', fullContent: '', bullets: ['Intent: expand the conversation from cost-out to value-in', 'Follow-up: "Which of those would be most credible to your CFO peers?"', 'Listen for: revenue acceleration, risk mitigation, competitive positioning'], lastPracticed: null, streak: 0 },
    { id: 'cl-06', profile: 'CFO', question: 'What is the hardest part of making technology investments in the current macro environment?', fullContent: '', bullets: ['Intent: surface budget pressure and governance constraints', 'Follow-up: "How do you manage that tension with the CEO?"', 'Listen for: prioritisation, CapEx vs OpEx, board expectations'], lastPracticed: null, streak: 0 },
    { id: 'cl-07', profile: 'CRO', question: 'What does your ideal version of AI-augmented sales look like in 3 years — not the hype, the actual workflow change?', fullContent: '', bullets: ['Intent: ground the conversation in operational reality', 'Follow-up: "What is the biggest adoption barrier you anticipate?"', 'Listen for: rep behaviour, data quality, manager resistance'], lastPracticed: null, streak: 0 },
    { id: 'cl-08', profile: 'CRO', question: 'If you gave your top 20% of reps one more productive hour per day, what would you want them to spend it on?', fullContent: '', bullets: ['Intent: reveals where they believe revenue is actually created', 'Follow-up: "Is that where they are spending their time today?"', 'Listen for: prospecting, deal strategy, customer conversation quality'], lastPracticed: null, streak: 0 },
    { id: 'cl-09', profile: 'CRO', question: 'What is the toughest conversation you are having internally right now about the future of your sales organisation?', fullContent: '', bullets: ['Intent: builds trust, opens real agenda', 'Follow-up: "How are you framing it to your team?"', 'Listen for: headcount, AI displacement fears, skills gap'], lastPracticed: null, streak: 0 },
    { id: 'cl-10', profile: 'CMO', question: 'Where in your customer journey do you feel you have the least intelligence about what is actually happening?', fullContent: '', bullets: ['Intent: surface data gaps and attribution frustration', 'Follow-up: "What decisions would that intelligence change?"', 'Listen for: mid-funnel blindspots, channel attribution, intent data'], lastPracticed: null, streak: 0 },
    { id: 'cl-11', profile: 'CMO', question: 'How are you thinking about AI in your content and campaign operations — efficiency play or something more strategic?', fullContent: '', bullets: ['Intent: understand maturity and ambition level', 'Follow-up: "What is holding you back from going further?"', 'Listen for: brand risk, quality concerns, organisational readiness'], lastPracticed: null, streak: 0 },
    { id: 'cl-12', profile: 'CPO', question: 'When you look at your product roadmap for the next 18 months, where does AI play a structural role — not a feature, a capability shift?', fullContent: '', bullets: ['Intent: distinguish AI features from AI-native products', 'Follow-up: "What would need to be true for that to land on time?"', 'Listen for: data infrastructure, model dependency, team skills'], lastPracticed: null, streak: 0 },
    { id: 'cl-13', profile: 'CPO', question: 'What is the riskiest assumption baked into your current product strategy — the one you are watching most carefully?', fullContent: '', bullets: ['Intent: executive vulnerability test, builds trust quickly', 'Follow-up: "How are you stress-testing that assumption?"', 'Listen for: user adoption, tech dependency, competitive move'], lastPracticed: null, streak: 0 },
    { id: 'cl-14', profile: 'CISO', question: 'How are you approaching the governance of AI in your organisation — who owns it and where are the lines?', fullContent: '', bullets: ['Intent: surface AI governance maturity and internal politics', 'Follow-up: "What is the tension between enabling innovation and managing risk?"', 'Listen for: shadow AI, data classification, liability questions'], lastPracticed: null, streak: 0 },
    { id: 'cl-15', profile: 'CISO', question: 'What would have to be true about an AI vendor for you to feel comfortable embedding their technology in a critical business process?', fullContent: '', bullets: ['Intent: understand their trust criteria before pitching anything', 'Follow-up: "Have you seen any vendors come close to that standard?"', 'Listen for: data residency, explainability, audit trail, contractual guarantees'], lastPracticed: null, streak: 0 },
  ],
};

// ═════════════════════════════════════════════════════════════

// Activity icons — one per routine activity, keyed by `RoutineActivity.icon`.
// 24x24, 1.6px stroke, currentColor. Line icons only: the design calls for
// small refined marks beside the content, not illustrations.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const s = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const Bowl = (p: P) => (
  <svg {...s} {...p}><path d="M3.5 11.5h17a8.5 8.5 0 0 1-8.5 8.5 8.5 8.5 0 0 1-8.5-8.5Z" /><path d="M9 7.5c0-1.2 1-1.6 1-2.8M12.5 7.5c0-1.6 1.2-2 1.2-3.5M16 7.5c0-1.2 1-1.6 1-2.8" /></svg>
);
const WallSit = (p: P) => (
  <svg {...s} {...p}><path d="M19.5 3v18" /><circle cx="10" cy="5.2" r="2" /><path d="M10 8.2v4.6h5.2M10 12.8h-4v2.4M15.2 12.8V21" /></svg>
);
const Capsule = (p: P) => (
  <svg {...s} {...p}><rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" transform="rotate(-45 12 12)" /><path d="M9.2 9.2l5.6 5.6" /></svg>
);
const Droplet = (p: P) => (
  <svg {...s} {...p}><path d="M12 3.2c3.6 4.2 5.6 7 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-2.6 2-5.4 5.6-9.6Z" /></svg>
);
const Dumbbell = (p: P) => (
  <svg {...s} {...p}><path d="M3 9.5v5M6 7.5v9M18 7.5v9M21 9.5v5M6 12h12" /></svg>
);
const Barbell = (p: P) => (
  <svg {...s} {...p}><path d="M2.6 10.4v3.2M5.4 8.2v7.6M18.6 8.2v7.6M21.4 10.4v3.2M5.4 12h13.2" /></svg>
);
const Bike = (p: P) => (
  <svg {...s} {...p}><circle cx="5.5" cy="16.5" r="3.6" /><circle cx="18.5" cy="16.5" r="3.6" /><path d="M5.5 16.5l4-8h4.2M14.6 5.8h2.6M18.5 16.5l-3.4-8.2M9.5 16.5h5" /></svg>
);
const Stopwatch = (p: P) => (
  <svg {...s} {...p}><circle cx="12" cy="13.6" r="7.4" /><path d="M12 9.8v3.8l2.4 1.6M9.6 2.8h4.8M12 2.8v3.4" /></svg>
);
const Sparkle = (p: P) => (
  <svg {...s} {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></svg>
);
const Document = (p: P) => (
  <svg {...s} {...p}><path d="M14 3H6.8A1.8 1.8 0 0 0 5 4.8v14.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8Z" /><path d="M14 3v5h5M8.6 12.6h6.8M8.6 16.2h4.6" /></svg>
);
const Headphones = (p: P) => (
  <svg {...s} {...p}><path d="M4 15v-2.6a8 8 0 0 1 16 0V15" /><rect x="3" y="14.4" width="3.8" height="6.2" rx="1.9" /><rect x="17.2" y="14.4" width="3.8" height="6.2" rx="1.9" /></svg>
);
const Moon = (p: P) => (
  <svg {...s} {...p}><path d="M20.4 13.6A8.6 8.6 0 1 1 10.4 3.6a6.7 6.7 0 0 0 10 10Z" /></svg>
);
const Waves = (p: P) => (
  <svg {...s} {...p}><path d="M2.8 8.4c1.6 0 1.6 1.6 3.2 1.6s1.6-1.6 3.2-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.2-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.2-1.6" /><path d="M2.8 13.6c1.6 0 1.6 1.6 3.2 1.6s1.6-1.6 3.2-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.2-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.2-1.6" /></svg>
);
const Book = (p: P) => (
  <svg {...s} {...p}><path d="M12 7.4C10.4 5.9 8.2 5.2 4.6 5.2A1 1 0 0 0 3.6 6.2v11a1 1 0 0 0 1 1c3.6 0 5.8.7 7.4 2.2 1.6-1.5 3.8-2.2 7.4-2.2a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1c-3.6 0-5.8.7-7.4 2.2Z" /><path d="M12 7.4v13" /></svg>
);
const Target = (p: P) => (
  <svg {...s} {...p}><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
);
const Car = (p: P) => (
  <svg {...s} {...p}><path d="M4.6 15.6V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5l2-5.4A2 2 0 0 1 5.9 6.3h8.6a2 2 0 0 1 1.9 1.3L18.4 13" /><path d="M2 13h16.4M6.6 16.2h.01M14 16.2h.01" /><circle cx="19.4" cy="16.6" r="2.4" /></svg>
);
const Building = (p: P) => (
  <svg {...s} {...p}><path d="M3.6 20.4h16.8M5.4 20.4V5a1.4 1.4 0 0 1 1.4-1.4h6.4A1.4 1.4 0 0 1 14.6 5v15.4M14.6 10h3a1.4 1.4 0 0 1 1.4 1.4v9" /><path d="M8.4 7.4h3M8.4 11h3M8.4 14.6h3" /></svg>
);
const Chart = (p: P) => (
  <svg {...s} {...p}><path d="M4 20.4V13M9.4 20.4V6.6M14.8 20.4v-9M20.2 20.4V3.6" /></svg>
);
const Calendar = (p: P) => (
  <svg {...s} {...p}><rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2" /><path d="M3.4 10h17.2M8.4 2.8v4.4M15.6 2.8v4.4" /></svg>
);
const Bag = (p: P) => (
  <svg {...s} {...p}><rect x="3.4" y="7.6" width="17.2" height="13" rx="2.2" /><path d="M8.6 7.6V5.4a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v2.2M3.4 12.4h17.2" /></svg>
);
const Bolt = (p: P) => (
  <svg {...s} {...p}><path d="M13.2 2.8 4.6 13.6h6.2l-1 7.6 8.6-10.8h-6.2Z" /></svg>
);
const Dot = (p: P) => (
  <svg {...s} {...p}><circle cx="12" cy="12" r="7.6" /></svg>
);

const ACTIVITY_ICONS: Record<string, (p: P) => React.ReactElement> = {
  bowl: Bowl,
  wallsit: WallSit,
  capsule: Capsule,
  droplet: Droplet,
  dumbbell: Dumbbell,
  barbell: Barbell,
  bike: Bike,
  stopwatch: Stopwatch,
  sparkle: Sparkle,
  document: Document,
  headphones: Headphones,
  moon: Moon,
  waves: Waves,
  book: Book,
  target: Target,
  car: Car,
  building: Building,
  chart: Chart,
  calendar: Calendar,
  bag: Bag,
  bolt: Bolt,
};

/** Falls back to a neutral mark so a user-created activity still renders. */
export function ActivityIcon({ name, ...rest }: { name?: string } & P) {
  const Icon = (name && ACTIVITY_ICONS[name]) || Dot;
  return <Icon {...rest} />;
}

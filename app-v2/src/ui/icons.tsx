// Line icons — 24x24, 1.75px stroke, currentColor. One family, no dependency.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const IconRoutine = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>
);
export const IconPlan = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconPractice = (p: P) => (
  <svg {...base} {...p}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>
);
export const IconIntake = (p: P) => (
  <svg {...base} {...p}><path d="M3 13.5 5.4 5.2A2 2 0 0 1 7.3 3.7h9.4a2 2 0 0 1 1.9 1.5L21 13.5" /><path d="M3 13.5h4l1.3 2.6h7.4l1.3-2.6h4v4.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const IconCreate = (p: P) => (
  <svg {...base} {...p}><path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L8.4 17.7l-4.2 1.2 1.2-4.2z" /><path d="M14 6.1l3.9 3.9" /></svg>
);
export const IconSetup = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2.3" /><circle cx="8" cy="17" r="2.3" /></svg>
);

export const IconSun = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></svg>
);
export const IconMoon = (p: P) => (
  <svg {...base} {...p}><path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.6 6.6 0 0 0 9.8 9.8z" /></svg>
);
export const IconCog = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a1.6 1.6 0 1 1-2.3 2.3l-.1-.1a1.7 1.7 0 0 0-2.8 1.2v.3a1.6 1.6 0 1 1-3.2 0V20a1.7 1.7 0 0 0-2.8-1.2l-.1.1a1.6 1.6 0 1 1-2.3-2.3l.1-.1a1.7 1.7 0 0 0-1.2-2.8H4a1.6 1.6 0 1 1 0-3.2H4a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a1.6 1.6 0 1 1 2.3-2.3l.1.1A1.7 1.7 0 0 0 10.3 4V4a1.6 1.6 0 1 1 3.2 0v.3a1.7 1.7 0 0 0 2.8 1.2l.1-.1a1.6 1.6 0 1 1 2.3 2.3l-.1.1a1.7 1.7 0 0 0 1.2 2.8H20a1.6 1.6 0 1 1 0 3.2h-.3a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconExit = (p: P) => (
  <svg {...base} {...p}><path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5" /></svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p} strokeWidth={2.6}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base} {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base} {...p}><path d="M5.5 9.5 12 16l6.5-6.5" /></svg>
);
export const IconTimer = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="13.5" r="7.5" /><path d="M12 10v3.5l2.3 1.6M9.5 2.5h5" /></svg>
);
export const IconLink = (p: P) => (
  <svg {...base} {...p}><path d="M14 11.5a4.2 4.2 0 0 0 0-5.9l-.6-.6a4.2 4.2 0 0 0-5.9 5.9l.6.6" /><path d="M10 12.5a4.2 4.2 0 0 0 0 5.9l.6.6a4.2 4.2 0 0 0 5.9-5.9l-.6-.6" /></svg>
);
export const IconSkip = (p: P) => (
  <svg {...base} {...p}><path d="M5.5 5.5v13M18.5 5.5v13M8 12h8" /></svg>
);
export const IconPlus = (p: P) => (
  <svg {...base} {...p}><path d="M12 5.5v13M5.5 12h13" /></svg>
);
export const IconPencil = (p: P) => (
  <svg {...base} {...p}><path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L8.4 17.7l-4.2 1.2 1.2-4.2z" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /></svg>
);
export const IconX = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconArrowUp = (p: P) => (
  <svg {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconArrowDown = (p: P) => (
  <svg {...base} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const IconPause = (p: P) => (
  <svg {...base} {...p}><path d="M9.5 5.5v13M14.5 5.5v13" /></svg>
);
export const IconPlay = (p: P) => (
  <svg {...base} {...p}><path d="M7.5 5 18 12 7.5 19z" /></svg>
);
export const IconReset = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.5" /></svg>
);
export const IconBell = (p: P) => (
  <svg {...base} {...p}><path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.8 6-1.8 6h15.6S18 13.5 18 9M10.3 19.5a2 2 0 0 0 3.4 0" /></svg>
);
export const IconAlert = (p: P) => (
  <svg {...base} {...p}><path d="M12 3.6 2.6 20h18.8z" /><path d="M12 10v4.2M12 17.3h.01" /></svg>
);

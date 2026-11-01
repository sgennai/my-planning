// The seven sections, in order. Kept apart from AppShell so the component file
// exports only components (which is what keeps fast refresh working).
import type { ReactNode } from 'react';
import {
  IconRoutine, IconPlan, IconIntel, IconPractice, IconIntake, IconCreate, IconSetup,
} from './icons';

export type AppPage = 'routine' | 'calendar' | 'intelligence' | 'practice' | 'intake' | 'create' | 'modules';

export interface NavEntry {
  page: AppPage;
  label: string;
  Icon: (p: { style?: React.CSSProperties }) => ReactNode;
  /** The label where a phone's bar has no room for the full one. */
  short?: string;
  /** On a phone, in the More menu: its bar has room for six sections and More. */
  phoneMore?: boolean;
}

export const NAV: NavEntry[] = [
  { page: 'routine',  label: 'Routine',  Icon: IconRoutine },
  { page: 'calendar', label: 'Plan',     Icon: IconPlan },
  { page: 'intelligence', label: 'Intelligence', short: 'Intel', Icon: IconIntel },
  { page: 'practice', label: 'Practice', Icon: IconPractice },
  { page: 'intake',   label: 'Intake',   Icon: IconIntake },
  { page: 'create',   label: 'Create',   Icon: IconCreate },
  { page: 'modules',  label: 'Setup',    Icon: IconSetup, phoneMore: true },
];

// The six sections, in order. Kept apart from AppShell so the component file
// exports only components (which is what keeps fast refresh working).
import type { ReactNode } from 'react';
import {
  IconRoutine, IconPlan, IconPractice, IconIntake, IconCreate, IconSetup,
} from './icons';

export type AppPage = 'routine' | 'calendar' | 'practice' | 'intake' | 'create' | 'modules';

export interface NavEntry {
  page: AppPage;
  label: string;
  Icon: (p: { style?: React.CSSProperties }) => ReactNode;
}

export const NAV: NavEntry[] = [
  { page: 'routine',  label: 'Routine',  Icon: IconRoutine },
  { page: 'calendar', label: 'Plan',     Icon: IconPlan },
  { page: 'practice', label: 'Practice', Icon: IconPractice },
  { page: 'intake',   label: 'Intake',   Icon: IconIntake },
  { page: 'create',   label: 'Create',   Icon: IconCreate },
  { page: 'modules',  label: 'Setup',    Icon: IconSetup },
];

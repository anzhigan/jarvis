export type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'analysis' | 'profile';

export const VALID_TABS: Tab[] = ['notes', 'tasks', 'routines', 'sprints', 'analysis', 'profile'];

/**
 * Tab keys come from a legacy domain ("tasks") while the redesign uses
 * "goals" as the user-facing label and accent slot. The shell maps tab → section
 * for [data-section] attribute and accent CSS cascade.
 */
export function sectionForTab(tab: Tab): string {
  if (tab === 'tasks') return 'goals';
  return tab;
}

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

/** Inverse of `sectionForTab`. Used by AI toast/job nav: AI jobs carry a
 *  `source.section` payload ("goals", "notes", "analysis", "sprints"); we
 *  must translate that back to a Tab value when programmatically switching
 *  tabs. Passing 'goals' to setTab directly produces an unrenderable tab
 *  state (no switch arm matches) — the user sees a white screen. */
export function tabForSection(section: string): Tab | null {
  if (section === 'goals') return 'tasks';
  if (VALID_TABS.includes(section as Tab)) return section as Tab;
  return null;
}

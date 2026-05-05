// Shared 7-color palette used across goals/steps/gos/routines/sprints/tags.
// Kept in its own tiny module so cross-tab imports don't pull in heavy
// Tasks.tsx / Routines.tsx dependencies.
export const ENTITY_COLORS = [
  '#5B5BD6', // indigo (brand)
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EF4444', // red
  '#71717A', // slate
];

export const STANDARD_COLORS = ENTITY_COLORS;

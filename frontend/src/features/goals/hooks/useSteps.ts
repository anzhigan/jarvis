import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { stepsApi } from '../../../api/client';
import type { Step, Task } from '../../../api/types';
import type { GoalsLibrary } from './useGoals';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type StepBucket = 'overdue' | 'active' | 'upcoming' | 'done';

export interface StepWithGoal extends Step {
  goal: Task;            // hydrated parent
}

export interface GroupedSteps {
  overdue: StepWithGoal[];
  active: StepWithGoal[];
  upcoming: StepWithGoal[];
  done: StepWithGoal[];
}

/**
 * Steps live inside Tasks (`task.sprints`) — this hook flattens them and
 * groups by deadline relative to today. Mutations refresh the parent goals
 * library so changes propagate to the kanban view too.
 */
/** Bucket a single Step into one of four deadline categories (pure). */
export function bucketOfStep(step: StepWithGoal, today: string): StepBucket {
  if (step.is_completed) return 'done';
  if (step.end_date < today) return 'overdue';
  if (step.start_date > today) return 'upcoming';
  return 'active';
}

/** Group steps by bucket relative to `today` (pure). */
export function groupSteps(steps: StepWithGoal[], today: string): GroupedSteps {
  const out: GroupedSteps = { overdue: [], active: [], upcoming: [], done: [] };
  for (const s of steps) out[bucketOfStep(s, today)].push(s);
  return out;
}

export function useSteps(goals: GoalsLibrary) {
  const allSteps = useMemo<StepWithGoal[]>(() => {
    const out: StepWithGoal[] = [];
    for (const goal of goals.tasks) {
      for (const step of goal.sprints) out.push({ ...step, goal });
    }
    return out;
  }, [goals.tasks]);

  const grouped = useMemo<GroupedSteps>(
    () => groupSteps(allSteps, ymd(new Date())),
    [allSteps],
  );

  const refresh = goals.refresh;

  const createStep = useCallback(
    async (data: Parameters<typeof stepsApi.create>[0]): Promise<Step | null> => {
      try { const s = await stepsApi.create(data); await refresh(); return s; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create step'); return null; }
    },
    [refresh],
  );

  const updateStep = useCallback(
    async (id: string, data: Parameters<typeof stepsApi.update>[1]) => {
      try { await stepsApi.update(id, data); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to update step'); }
    },
    [refresh],
  );

  const deleteStep = useCallback(async (id: string) => {
    try { await stepsApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete step'); }
  }, [refresh]);

  const toggleStepDone = useCallback(async (id: string, current: boolean) => {
    try { await stepsApi.update(id, { is_completed: !current }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to toggle step'); }
  }, [refresh]);

  return { allSteps, grouped, createStep, updateStep, deleteStep, toggleStepDone };
}

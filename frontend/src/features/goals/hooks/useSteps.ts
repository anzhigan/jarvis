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
export function useSteps(goals: GoalsLibrary) {
  const allSteps = useMemo<StepWithGoal[]>(() => {
    const out: StepWithGoal[] = [];
    for (const goal of goals.tasks) {
      for (const step of goal.sprints) out.push({ ...step, goal });
    }
    return out;
  }, [goals.tasks]);

  const grouped = useMemo<GroupedSteps>(() => {
    const today = ymd(new Date());
    const out: GroupedSteps = { overdue: [], active: [], upcoming: [], done: [] };
    for (const s of allSteps) {
      if (s.is_completed) { out.done.push(s); continue; }
      if (s.end_date < today) out.overdue.push(s);
      else if (s.start_date > today) out.upcoming.push(s);
      else out.active.push(s);
    }
    return out;
  }, [allSteps]);

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

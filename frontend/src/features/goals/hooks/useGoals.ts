import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { tagsApi, tasksApi } from '../../../api/client';
import type { Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';

/**
 * Loads all goals (Tasks) and tags. Exposes refresh + mutations.
 *
 * Tasks include nested `gos` from the backend payload — the Go list view
 * derives its data from `tasks.flatMap(t => t.gos)` instead of a separate fetch.
 */
export function useGoals() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [t, tg] = await Promise.all([tasksApi.list(), tagsApi.list()]);
      setTasks(t);
      setTags(tg);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const out: Record<TaskStatus, number> = { backlog: 0, active: 0, paused: 0, done: 0 };
    for (const t of tasks) out[t.status] += 1;
    return out;
  }, [tasks]);

  const tagCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of tasks) {
      for (const tag of t.tags) out.set(tag.id, (out.get(tag.id) ?? 0) + 1);
    }
    return out;
  }, [tasks]);

  const priorityCounts = useMemo(() => {
    const out: Record<TaskPriority, number> = { high: 0, medium: 0, low: 0 };
    for (const t of tasks) out[t.priority] += 1;
    return out;
  }, [tasks]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const createGoal = useCallback(
    async (data: Parameters<typeof tasksApi.create>[0]): Promise<Task | null> => {
      try { const g = await tasksApi.create(data); await refresh(); return g; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create goal'); return null; }
    },
    [refresh],
  );

  // Optimistic status move — returns to server snapshot if rejected.
  const moveStatus = useCallback(async (id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await tasksApi.update(id, { status });
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to move goal');
      await refresh();
    }
  }, [refresh]);

  const updateGoal = useCallback(
    async (id: string, data: Parameters<typeof tasksApi.update>[1]) => {
      try { await tasksApi.update(id, data); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to update goal'); }
    },
    [refresh],
  );

  const deleteGoal = useCallback(async (id: string) => {
    try { await tasksApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete goal'); }
  }, [refresh]);

  const attachTag = useCallback(async (taskId: string, tagId: string) => {
    try { await tasksApi.attachTag(taskId, tagId); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to attach tag'); }
  }, [refresh]);

  const detachTag = useCallback(async (taskId: string, tagId: string) => {
    try { await tasksApi.detachTag(taskId, tagId); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to detach tag'); }
  }, [refresh]);

  return {
    tasks, tags, loading, refresh,
    counts, tagCounts, priorityCounts,
    createGoal, updateGoal, deleteGoal, moveStatus,
    attachTag, detachTag,
  };
}

export type GoalsLibrary = ReturnType<typeof useGoals>;

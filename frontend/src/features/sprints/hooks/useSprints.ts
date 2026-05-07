import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { sprintsApi } from '../../../api/client';
import type { Sprint, SprintItemType } from '../../../api/types';
import { ymd } from '../../routines/lib/heatmap';

export type SprintBucket = 'active' | 'upcoming' | 'past';

export interface SprintWithProgress {
  sprint: Sprint;
  bucket: SprintBucket;
  /** 0..1 — fraction of period elapsed. Capped at 1 for past sprints. */
  progress: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
}

function bucketOf(sprint: Sprint, today: string): SprintBucket {
  if (sprint.end_date < today)   return 'past';
  if (sprint.start_date > today) return 'upcoming';
  return 'active';
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000));
}

export function useSprints() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setSprints(await sprintsApi.list()); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to load sprints'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const decorated = useMemo<SprintWithProgress[]>(() => {
    const today = ymd(new Date());
    return sprints.map((s) => {
      const total = daysBetween(s.start_date, s.end_date) + 1;
      const elapsedRaw = daysBetween(s.start_date, today);
      const elapsed = Math.max(0, Math.min(total, elapsedRaw + (s.start_date <= today ? 1 : 0)));
      const remaining = Math.max(0, total - elapsed);
      const progress = total === 0 ? 0 : elapsed / total;
      return {
        sprint: s,
        bucket: bucketOf(s, today),
        progress,
        daysTotal: total,
        daysElapsed: elapsed,
        daysRemaining: remaining,
      };
    });
  }, [sprints]);

  const counts = useMemo(() => {
    const out: Record<SprintBucket, number> = { active: 0, upcoming: 0, past: 0 };
    for (const d of decorated) out[d.bucket]++;
    return out;
  }, [decorated]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const create = useCallback(
    async (data: Parameters<typeof sprintsApi.create>[0]): Promise<Sprint | null> => {
      try { const s = await sprintsApi.create(data); await refresh(); return s; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create sprint'); return null; }
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, data: Partial<Sprint>) => {
      try { await sprintsApi.update(id, data); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to update sprint'); }
    },
    [refresh],
  );

  const remove = useCallback(async (id: string) => {
    try { await sprintsApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete sprint'); }
  }, [refresh]);

  const addItem = useCallback(
    async (id: string, item: { item_type: SprintItemType; goal_id?: string; step_id?: string; go_id?: string; routine_id?: string }) => {
      try { await sprintsApi.addItem(id, item); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to add item'); }
    },
    [refresh],
  );

  return { sprints, decorated, loading, refresh, counts, create, update, remove, addItem };
}

export type SprintsLibrary = ReturnType<typeof useSprints>;

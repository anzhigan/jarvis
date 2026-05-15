import { useEffect, useRef, useState } from 'react';
import { aiApi } from '../../api/client';
import type { AIJob } from '../../api/types';

/**
 * Poll an AI job until it reaches a terminal state. Cleans up cleanly on
 * unmount / when jobId changes.
 *
 * Polling cadence is **3 seconds**, intentionally slow — AI jobs take 30-120s
 * so faster polling just burns request volume for no UX gain.
 */
export function useAIJob(jobId: string | null) {
  const [job, setJob] = useState<AIJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Use ref so a re-render of the consumer doesn't restart polling.
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled.current) return;
      try {
        const j = await aiApi.getJob(jobId);
        if (cancelled.current) return;
        setJob(j);
        if (j.status === 'queued' || j.status === 'running') {
          timer = setTimeout(tick, 3000);
        }
      } catch (e: unknown) {
        if (cancelled.current) return;
        setError(e instanceof Error ? e.message : 'polling failed');
      }
    };
    tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { job, error };
}

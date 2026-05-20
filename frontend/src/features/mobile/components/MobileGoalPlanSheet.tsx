import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, gosApi, stepsApi } from '../../../api/client';
import type { AIJob, GoalPlanOutput, Task } from '../../../api/types';
import { useAIJob } from '../../ai/useAIJob';
import {
  dispatchAIJobDrawerClosed,
  dispatchAIJobDrawerOpened,
  useAIJobsStore,
} from '../../../store/aiJobs';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';

interface Props {
  /** Job id to poll. `null` ⇒ sheet closed. */
  jobId: string | null;
  onJobIdChange: (jobId: string | null) => void;
  /** Goal this plan targets. Needed for both `full` (creates under the
   *  goal) and dates modes (matches proposed steps/gos to existing ones
   *  by position). */
  goal: Task | null;
  /** Called after a successful Apply so the parent can refresh data. */
  onApplied?: () => Promise<void> | void;
  /** Force the Regenerate button to use this mode regardless of what the
   *  proposal's `mode` says. Used to keep dates flow on the dates path. */
  regenerateMode?: 'full' | 'fill_dates' | 'rebalance_dates' | 'dates_only';
}

type View =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed';  error: string }
  | { kind: 'plan';    plan: GoalPlanOutput };

const MODE_LABEL: Record<string, string> = {
  full:            'Full plan',
  fill_dates:      'Fill missing dates',
  rebalance_dates: 'Rebalance dates',
  dates_only:      'Fill missing dates',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Mobile bottom-sheet that surfaces the result of a `goal_plan` AI job.
 *
 * Polls the job via `useAIJob`. When `status === 'done'` lifts
 * `output_json` into an editable draft. The user can drop individual
 * steps (or orphan gos) before committing via Apply.
 *
 *   - **full**:    creates new steps + their first gos under the goal.
 *   - **dates_only / fill_dates / rebalance_dates**: PATCHes existing
 *     steps' start_date / end_date and each gos' due_date by positional
 *     match (backend echoes in the same order it received them).
 *
 * Mirrors desktop `GoalPlanDrawer.apply` — keep the two in sync.
 */
export function MobileGoalPlanSheet({
  jobId, onJobIdChange, goal, onApplied, regenerateMode,
}: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);
  const addBgJob = useAIJobsStore((s) => s.add);

  const [draft, setDraft] = useState<GoalPlanOutput | null>(null);
  const [droppedSteps, setDroppedSteps] = useState<Set<number>>(new Set());
  const [droppedOrphans, setDroppedOrphans] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Reset every time the job id changes (fresh generation or close).
  useEffect(() => {
    setDraft(null);
    setDroppedSteps(new Set());
    setDroppedOrphans(new Set());
  }, [jobId]);

  // Suppress the bottom toast while we're on screen.
  useEffect(() => {
    if (!jobId) return;
    dispatchAIJobDrawerOpened(jobId);
    return () => { dispatchAIJobDrawerClosed(jobId); };
  }, [jobId]);

  // Lift output once the job lands done.
  useEffect(() => {
    if (job?.status !== 'done') return;
    const out = job.output_json as unknown as GoalPlanOutput | null;
    if (!out || !out.steps) return;
    setDraft(out);
  }, [job]);

  const view = useMemo<View>(() => {
    if (!job && !pollError) return { kind: 'loading', job: null };
    if (pollError) return { kind: 'failed', error: pollError };
    if (job?.status === 'failed') return { kind: 'failed', error: job.error || 'Generation failed' };
    if (draft) return { kind: 'plan', plan: draft };
    return { kind: 'loading', job: job ?? null };
  }, [job, pollError, draft]);

  // Pre-computed positional maps for the dates-mode diff.
  const existingStepsSorted = useMemo(() => {
    if (!goal) return [] as Task['steps'];
    return [...(goal.steps ?? [])].sort((a, b) => a.position - b.position);
  }, [goal]);
  const gosByStepId = useMemo(() => {
    const m = new Map<string, Task['gos']>();
    if (!goal) return m;
    for (const g of goal.gos ?? []) {
      if (!g.step_id) continue;
      const arr = m.get(g.step_id) ?? [];
      arr.push(g);
      m.set(g.step_id, arr);
    }
    return m;
  }, [goal]);
  const orphanGosOriginal = useMemo(() => {
    if (!goal) return [] as Task['gos'];
    return (goal.gos ?? []).filter((g) => !g.step_id);
  }, [goal]);

  const toggleDropStep = (i: number) => {
    setDroppedSteps((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const toggleDropOrphan = (i: number) => {
    setDroppedOrphans((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const isDatesMode = (m: string) =>
    m === 'dates_only' || m === 'fill_dates' || m === 'rebalance_dates';

  const regenerate = async () => {
    if (!goal) return;
    setRegenerating(true);
    const mode = regenerateMode ?? draft?.mode ?? 'full';
    try {
      const fresh = await aiApi.createGoalPlan({ goal_id: goal.id, mode });
      const modeLabel = MODE_LABEL[mode] ?? mode;
      addBgJob({
        jobId: fresh.id,
        kind: 'goal_plan',
        source: { section: 'goals', noteTitle: `${modeLabel} for "${goal.title}"` },
      });
      onJobIdChange(fresh.id);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  const apply = async () => {
    if (!draft || !goal) return;
    setSubmitting(true);
    const acceptedSteps = draft.steps.filter((_, i) => !droppedSteps.has(i));
    const acceptedOrphans = (draft.orphan_gos ?? []).filter((_, i) => !droppedOrphans.has(i));

    if (isDatesMode(draft.mode)) {
      let stepsUpdated = 0, gosUpdated = 0;
      try {
        for (let i = 0; i < acceptedSteps.length; i++) {
          const proposed = acceptedSteps[i];
          const origIdx = draft.steps.indexOf(proposed);
          const existing = existingStepsSorted[origIdx];
          if (!existing) continue;
          try {
            await stepsApi.update(existing.id, {
              start_date: proposed.start_date || null,
              end_date:   proposed.end_date   || null,
            });
            stepsUpdated++;
          } catch (e: any) {
            toast.error(`Step «${proposed.title}» date update failed: ${e?.detail ?? 'error'}`);
            continue;
          }
          const existingGos = gosByStepId.get(existing.id) ?? [];
          for (let gi = 0; gi < (proposed.gos ?? []).length; gi++) {
            const pg = proposed.gos[gi];
            const eg = existingGos[gi];
            if (!eg || !pg.due_date) continue;
            try {
              await gosApi.update(eg.id, { due_date: pg.due_date });
              gosUpdated++;
            } catch { /* individual failure already noisy in console */ }
          }
        }
        // Orphan gos — positional match against goal.gos filtered by no-step.
        for (let oi = 0; oi < acceptedOrphans.length; oi++) {
          const proposedGo = acceptedOrphans[oi];
          const origIdx = (draft.orphan_gos ?? []).indexOf(proposedGo);
          const eg = orphanGosOriginal[origIdx];
          if (!eg || !proposedGo.due_date) continue;
          try {
            await gosApi.update(eg.id, { due_date: proposedGo.due_date });
            gosUpdated++;
          } catch { /* swallow */ }
        }
        toast.success(
          `Updated · ${stepsUpdated} step${stepsUpdated === 1 ? '' : 's'}, ${gosUpdated} go${gosUpdated === 1 ? '' : 's'}`,
        );
        await onApplied?.();
        onJobIdChange(null);
      } finally { setSubmitting(false); }
      return;
    }

    // Full mode — create new steps + their gos.
    let stepsCreated = 0, gosCreated = 0;
    try {
      for (const step of acceptedSteps) {
        try {
          const created = await stepsApi.create(goal.id, {
            title: step.title || 'Untitled step',
            description: step.description,
            start_date: step.start_date || null,
            end_date:   step.end_date   || null,
          });
          stepsCreated++;
          for (const g of step.gos ?? []) {
            try {
              await gosApi.create({
                task_id: goal.id,
                step_id: created.id,
                title: g.title || 'Untitled go',
                description: g.description,
                kind: g.kind,
                target_value: g.target_value,
                unit: g.unit || undefined,
                recurrence: 'none',
                start_date: null,
                due_date: g.due_date || null,
              });
              gosCreated++;
            } catch { /* per-go failure already in console */ }
          }
        } catch (e: any) {
          toast.error(`Step «${step.title}» creation failed: ${e?.detail ?? 'error'}`);
        }
      }
      toast.success(
        `Applied · ${stepsCreated} step${stepsCreated === 1 ? '' : 's'}, ${gosCreated} go${gosCreated === 1 ? '' : 's'}`,
      );
      await onApplied?.();
      onJobIdChange(null);
    } finally { setSubmitting(false); }
  };

  const headline = useMemo(() => {
    const mode = draft?.mode ?? regenerateMode ?? 'full';
    return MODE_LABEL[mode] ?? 'AI plan';
  }, [draft, regenerateMode]);

  // ── Render ─────────────────────────────────────────────────────────
  if (!open) return null;

  const datesMode = draft ? isDatesMode(draft.mode) : false;
  const acceptedCount =
    (draft?.steps.length ?? 0) - droppedSteps.size
    + ((draft?.orphan_gos ?? []).length - droppedOrphans.size);

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={(o) => { if (!o) onJobIdChange(null); }}
      title={headline}
      description={goal ? `for "${goal.title}"` : undefined}
      footer={
        view.kind === 'plan' ? (
          <>
            <MobileButton
              variant="tinted"
              block
              icon={regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              onClick={regenerate}
              disabled={regenerating || submitting || !goal}
            >Regenerate</MobileButton>
            <MobileButton
              variant="filled"
              block
              onClick={apply}
              disabled={submitting || regenerating || acceptedCount === 0}
            >{submitting ? 'Applying…' : `Apply · ${acceptedCount}`}</MobileButton>
          </>
        ) : view.kind === 'failed' ? (
          <MobileButton variant="tinted" block onClick={regenerate} disabled={regenerating || !goal}
            icon={<RefreshCw size={14} />}>Try again</MobileButton>
        ) : undefined
      }
    >
      {/* ── Loading state ─────────────────────────────────────────── */}
      {view.kind === 'loading' && (
        <div className="m-gp-loading">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--indigo)' }} />
          <div>
            <div className="m-gp-loading__title">Drafting your plan…</div>
            <div className="m-gp-loading__sub">
              {view.job?.status === 'queued'
                ? 'Waiting for the worker'
                : view.job?.status === 'running'
                  ? 'Thinking through the steps'
                  : 'Starting up'}
            </div>
          </div>
        </div>
      )}

      {/* ── Failed state ──────────────────────────────────────────── */}
      {view.kind === 'failed' && (
        <div className="m-gp-failed">
          <div className="m-gp-failed__title">Generation failed</div>
          <div className="m-gp-failed__msg">{view.error}</div>
        </div>
      )}

      {/* ── Plan ──────────────────────────────────────────────────── */}
      {view.kind === 'plan' && (
        <>
          {/* Steps */}
          {draft && draft.steps.length > 0 && (
            <section className="m-day-sec">
              <h3 className="m-day-sec__title">Steps · {draft.steps.length}</h3>
              {draft.steps.map((step, i) => {
                const dropped = droppedSteps.has(i);
                const existing = datesMode ? existingStepsSorted[i] : undefined;
                return (
                  <article
                    key={i}
                    className="m-gp-step"
                    data-dropped={dropped || undefined}
                  >
                    <header className="m-gp-step__head">
                      <div className="m-gp-step__title" data-dropped={dropped || undefined}>
                        {step.title || 'Untitled step'}
                      </div>
                      <button
                        type="button"
                        className="m-gp-step__drop"
                        data-on={dropped || undefined}
                        onClick={() => toggleDropStep(i)}
                        aria-label={dropped ? 'Include step' : 'Drop step'}
                        title={dropped ? 'Include step' : 'Drop step'}
                      >{dropped ? <Undo2 size={13} /> : <X size={13} />}</button>
                    </header>
                    {step.description && !dropped && (
                      <p className="m-gp-step__desc">{step.description}</p>
                    )}
                    {/* Dates row — in dates_only mode, diff against existing.
                        In full mode, just show the proposed window. */}
                    {(step.start_date || step.end_date || existing) && (
                      <div className="m-gp-step__dates">
                        {datesMode && existing ? (
                          <>
                            <span>
                              <span className="m-gp-step__date-was">
                                {existing.start_date ? fmtDate(existing.start_date) : '—'}
                                {' → '}
                                {existing.end_date ? fmtDate(existing.end_date) : '—'}
                              </span>
                            </span>
                            <span className="m-gp-step__dates-arrow">›</span>
                            <span className="m-gp-step__date-new">
                              {fmtDate(step.start_date)} → {fmtDate(step.end_date)}
                            </span>
                          </>
                        ) : (
                          <>
                            <b>{fmtDate(step.start_date)}</b>
                            <span className="m-gp-step__dates-arrow">→</span>
                            <b>{fmtDate(step.end_date)}</b>
                          </>
                        )}
                      </div>
                    )}
                    {/* Gos under the step */}
                    {step.gos && step.gos.length > 0 && (
                      <div className="m-gp-step__gos">
                        {step.gos.map((g, gi) => {
                          const existingGo = datesMode && existing
                            ? (gosByStepId.get(existing.id) ?? [])[gi]
                            : undefined;
                          return (
                            <div key={gi} className="m-gp-go">
                              <span className="m-gp-go__dot" />
                              <span className="m-gp-go__title">{g.title || 'Untitled go'}</span>
                              <span className="m-gp-go__date">
                                {datesMode && existingGo ? (
                                  <>
                                    <span className="m-gp-step__date-was">
                                      {fmtDate(existingGo.due_date)}
                                    </span>
                                    {' › '}
                                    <span className="m-gp-step__date-new">
                                      {fmtDate(g.due_date)}
                                    </span>
                                  </>
                                ) : (
                                  <b>{fmtDate(g.due_date)}</b>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )}

          {/* Orphan gos */}
          {draft && (draft.orphan_gos?.length ?? 0) > 0 && (
            <section className="m-day-sec">
              <h3 className="m-day-sec__title">
                Gos · no step · {draft.orphan_gos.length}
              </h3>
              {draft.orphan_gos.map((g, i) => {
                const dropped = droppedOrphans.has(i);
                const existing = datesMode ? orphanGosOriginal[i] : undefined;
                return (
                  <article
                    key={i}
                    className="m-gp-step"
                    data-dropped={dropped || undefined}
                  >
                    <header className="m-gp-step__head">
                      <div className="m-gp-step__title" data-dropped={dropped || undefined}>
                        {g.title || 'Untitled go'}
                      </div>
                      <button
                        type="button"
                        className="m-gp-step__drop"
                        data-on={dropped || undefined}
                        onClick={() => toggleDropOrphan(i)}
                        aria-label={dropped ? 'Include go' : 'Drop go'}
                      >{dropped ? <Undo2 size={13} /> : <X size={13} />}</button>
                    </header>
                    <div className="m-gp-step__dates">
                      {datesMode && existing ? (
                        <>
                          <span className="m-gp-step__date-was">
                            {fmtDate(existing.due_date)}
                          </span>
                          <span className="m-gp-step__dates-arrow">›</span>
                          <span className="m-gp-step__date-new">
                            {fmtDate(g.due_date)}
                          </span>
                        </>
                      ) : (
                        <b>due {fmtDate(g.due_date)}</b>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </MobileBottomSheet>
  );
}

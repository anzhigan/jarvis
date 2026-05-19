/**
 * GoalPlanDrawer — shows an AI plan proposal for a freshly-created goal.
 * Mirrors SprintPlanDrawer in structure: polls the job, surfaces editable
 * preview, materialises on "Apply plan" via the existing stepsApi/gosApi.
 *
 * Two modes from the backend:
 *   - `full`    → steps + first gos for each step
 *   - `dates_only` → existing steps with proposed dates only
 *
 * No DB writes until the user clicks Apply — the AI job only produces a
 * proposal in job.output_json. Per-step drop toggle lets the user reject
 * individual steps without rejecting the whole plan.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Sparkles, Target, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, Input } from '../../../components/ui';
import { aiApi, gosApi, stepsApi } from '../../../api/client';
import type { AIJob, GoalPlanOutput } from '../../../api/types';
import { useAIJob } from '../../ai/useAIJob';
import {
  dispatchAIJobDrawerClosed,
  dispatchAIJobDrawerOpened,
  useAIJobsStore,
} from '../../../store/aiJobs';

interface Props {
  /** Job id while we're polling. Null = drawer closed. */
  jobId: string | null;
  onJobIdChange: (jobId: string | null) => void;
  onClose: () => void;
  /** Called after Apply lands new steps/gos so the parent can refresh. */
  onApplied?: () => Promise<void> | void;
  /** Goal that this plan targets. Used to drive Regenerate if user wants. */
  goalId: string | null;
}

type View =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed';  error: string }
  | { kind: 'plan';    plan: GoalPlanOutput };

export function GoalPlanDrawer({
  jobId, onJobIdChange, onClose, onApplied, goalId,
}: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);
  const addBgJob = useAIJobsStore((s) => s.add);

  // Editable copy of the AI proposal so the user can drop individual steps
  // or tweak titles/dates before commit.
  const [draft, setDraft] = useState<GoalPlanOutput | null>(null);
  const [droppedStepIdx, setDroppedStepIdx] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Reset draft when jobId changes (new generation or close).
  useEffect(() => {
    setDraft(null);
    setDroppedStepIdx(new Set());
  }, [jobId]);

  // Tell the toast stack we're on screen — hides bottom toasts while
  // user is reading the plan.
  useEffect(() => {
    if (!jobId) return;
    dispatchAIJobDrawerOpened(jobId);
    return () => { dispatchAIJobDrawerClosed(jobId); };
  }, [jobId]);

  // Lift output_json into the editable draft when the job finishes.
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

  const acceptedSteps = useMemo(() => {
    if (!draft) return [];
    return draft.steps.filter((_, i) => !droppedStepIdx.has(i));
  }, [draft, droppedStepIdx]);

  const toggleDropStep = (i: number) => {
    setDroppedStepIdx((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const updateStepTitle = (i: number, value: string) => {
    if (!draft) return;
    const next = { ...draft, steps: draft.steps.map((s, idx) => idx === i ? { ...s, title: value } : s) };
    setDraft(next);
  };

  const regenerate = async () => {
    if (!goalId) return;
    setRegenerating(true);
    try {
      const fresh = await aiApi.createGoalPlan({ goal_id: goalId });
      addBgJob({
        jobId: fresh.id,
        kind: 'goal_plan',
        source: { section: 'goals', noteTitle: 'goal plan' },
      });
      onJobIdChange(fresh.id);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  /** Materialise the accepted steps + their gos via the regular APIs.
   *  Sequential to preserve order (steps get positions inferred from
   *  the backend's autoincrement). Per-step failure is toasted but
   *  doesn't block the rest. */
  const apply = async () => {
    if (!draft || !goalId) return;
    setSubmitting(true);
    let stepsCreated = 0;
    let gosCreated = 0;
    try {
      for (const step of acceptedSteps) {
        try {
          const created = await stepsApi.create(goalId, {
            title: step.title || 'Untitled step',
            description: step.description,
            start_date: step.start_date || null,
            end_date:   step.end_date   || null,
          });
          stepsCreated++;
          // Materialise this step's gos (full mode only — dates_only has empty arrays).
          for (const g of step.gos ?? []) {
            try {
              await gosApi.create({
                task_id: goalId,
                step_id: created.id,
                title: g.title || 'Untitled go',
                description: g.description,
                kind: g.kind,
                target_value: g.target_value,
                // gosApi.create's `unit` is string|undefined (not nullable).
                // Pass undefined when empty so we don't send "" to the API.
                unit: g.unit || undefined,
                recurrence: 'none',
                start_date: null,
                due_date: g.due_date || null,
              });
              gosCreated++;
            } catch { /* swallow — individual go failure shouldn't kill plan */ }
          }
        } catch (e: any) {
          toast.error(`Failed to create step «${step.title}»: ${e?.detail ?? e?.message ?? 'unknown'}`);
        }
      }
      toast.success(`Applied · ${stepsCreated} step${stepsCreated === 1 ? '' : 's'}, ${gosCreated} go${gosCreated === 1 ? '' : 's'}`);
      await onApplied?.();
      onJobIdChange(null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="goals"
      title="Plan with AI"
      description={
        view.kind === 'plan' && view.plan.goal_title
          ? `«${view.plan.goal_title}» — review the proposed breakdown.`
          : 'Generating step breakdown…'
      }
    >
      <div className="gp-plan">
        {view.kind === 'loading' && (
          <div className="gp-plan__loading">
            <Loader2 size={20} className="animate-spin" />
            <p>Building your plan…</p>
            <p className="gp-plan__loading-sub">
              Reading the goal context + other active deadlines. ~60-90s on a warm runtime.
            </p>
          </div>
        )}

        {view.kind === 'failed' && (
          <div className="gp-plan__failed">
            <p className="gp-plan__failed-title">Generation failed</p>
            <p className="gp-plan__failed-msg">{view.error}</p>
            <Button onClick={regenerate} disabled={regenerating} variant="primary">
              {regenerating ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        )}

        {view.kind === 'plan' && draft && (
          <>
            {draft.rationale && (
              <div className="gp-plan__rationale">
                <Sparkles size={11} /> <span>{draft.rationale}</span>
              </div>
            )}

            <div className="gp-plan__section">
              <div className="gp-plan__section-head">
                <span className="gp-plan__section-label">
                  Steps · <Target size={11} style={{ verticalAlign: -1 }} />
                </span>
                <span className="gp-plan__section-rule" />
                <span className="gp-plan__section-count">
                  {acceptedSteps.length} of {draft.steps.length} kept
                </span>
              </div>

              {draft.steps.length === 0 ? (
                <p className="gp-plan__empty">
                  The model didn&apos;t produce any steps. Try regenerating with a
                  longer goal description.
                </p>
              ) : (
                <ul className="gp-plan__steps">
                  {draft.steps.map((s, i) => {
                    const dropped = droppedStepIdx.has(i);
                    return (
                      <li
                        key={i}
                        className="gp-plan__step"
                        data-dropped={dropped || undefined}
                      >
                        <div className="gp-plan__step-head">
                          <span className="gp-plan__step-num">{String(i + 1).padStart(2, '0')}</span>
                          <Input
                            value={s.title}
                            onChange={(e) => updateStepTitle(i, e.target.value)}
                            aria-label={`Step ${i + 1} title`}
                          />
                          <button
                            type="button"
                            className="gp-plan__step-drop"
                            onClick={() => toggleDropStep(i)}
                            title={dropped ? 'Bring back' : 'Drop this step'}
                            aria-label={dropped ? 'Restore step' : 'Drop step'}
                          >
                            {dropped ? '↺' : <X size={12} />}
                          </button>
                        </div>
                        {s.description && (
                          <p className="gp-plan__step-desc">{s.description}</p>
                        )}
                        <div className="gp-plan__step-dates">
                          <time>{s.start_date}</time>
                          <span className="gp-plan__step-dates-sep">→</span>
                          <time>{s.end_date}</time>
                        </div>
                        {s.gos.length > 0 && (
                          <ul className="gp-plan__gos">
                            {s.gos.map((g, gi) => (
                              <li key={gi} className="gp-plan__go">
                                <Zap size={9} className="gp-plan__go-icon" />
                                <span className="gp-plan__go-title">{g.title}</span>
                                {g.due_date && (
                                  <time className="gp-plan__go-due">{g.due_date}</time>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="gp-plan__footer">
              <Button
                onClick={regenerate}
                disabled={regenerating || submitting}
                variant="ghost"
              >
                <RefreshCw size={12} /> {regenerating ? 'Regenerating…' : 'Regenerate'}
              </Button>
              <span style={{ flex: 1 }} />
              <Button onClick={onClose} variant="ghost" disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={apply}
                variant="primary"
                disabled={submitting || acceptedSteps.length === 0}
              >
                {submitting
                  ? 'Applying…'
                  : `Apply plan · ${acceptedSteps.length} step${acceptedSteps.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

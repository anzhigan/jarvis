/**
 * Drawer that shows an AI sprint-plan proposal. Polls the job until done,
 * renders the proposal as an editable preview (title + dates + items with
 * reasons), and on "Create sprint" materialises it via the regular
 * sprints API (create + addItem per item).
 *
 * No DB writes happen on the backend until the user clicks Create — the
 * AI job only produces a proposal in job.output_json.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Repeat, Sparkles, Target, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, Input } from '../../../components/ui';
import { aiApi } from '../../../api/client';
import type { AIJob, SprintPlanItem, SprintPlanOutput } from '../../../api/types';
import { useAIJob } from '../../ai/useAIJob';
import { dispatchAIJobDrawerClosed, dispatchAIJobDrawerOpened } from '../../../store/aiJobs';
import type { SprintsLibrary } from '../hooks/useSprints';

interface Props {
  /** Job id while we're polling. Null = drawer closed. */
  jobId: string | null;
  /** Caller can swap to a fresh job (e.g. re-generate with different days). */
  onJobIdChange: (jobId: string | null) => void;
  /** Closes the drawer; caller decides whether to clear jobId too. */
  onClose: () => void;
  library: SprintsLibrary;
  /** Days the user picked — kept here so "Regenerate" reuses the same length. */
  days: number;
}

type View =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'plan'; plan: SprintPlanOutput };

const ITEM_ICON: Record<SprintPlanItem['kind'], React.ElementType> = {
  goal:    Target,
  go:      Zap,
  routine: Repeat,
};
const ITEM_KIND_LABEL: Record<SprintPlanItem['kind'], string> = {
  goal: 'Goal', go: 'Go', routine: 'Routine',
};

export function SprintPlanDrawer({ jobId, onJobIdChange, onClose, library, days }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  // Editable copy of the AI proposal so the user can tweak title/dates and
  // drop items they don't like before commit. Initialised from the AI
  // output the first time the job lands `done`.
  const [draft, setDraft] = useState<SprintPlanOutput | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Reset state whenever a fresh job loads.
  useEffect(() => {
    setDraft(null);
    setExcluded(new Set());
  }, [jobId]);

  // Tell the toast stack we're on screen — same protocol as QuizDrawer.
  useEffect(() => {
    if (!jobId) return;
    dispatchAIJobDrawerOpened(jobId);
    return () => { dispatchAIJobDrawerClosed(jobId); };
  }, [jobId]);

  // When the job lands done, lift output_json into the editable draft.
  useEffect(() => {
    if (job?.status !== 'done') return;
    const out = job.output_json as SprintPlanOutput | null;
    if (!out || !out.title) return;
    setDraft(out);
  }, [job]);

  const view = useMemo<View>(() => {
    if (!job && !pollError) return { kind: 'loading', job: null };
    if (pollError) return { kind: 'failed', error: pollError };
    if (job?.status === 'failed') return { kind: 'failed', error: job.error || 'Generation failed' };
    if (draft) return { kind: 'plan', plan: draft };
    return { kind: 'loading', job: job ?? null };
  }, [job, pollError, draft]);

  const toggleItem = (uniq: string) => {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(uniq)) next.delete(uniq); else next.add(uniq);
      return next;
    });
  };

  const acceptedItems = useMemo(() => {
    if (!draft) return [];
    return draft.items.filter((it, idx) => !excluded.has(`${it.kind}:${it.id}:${idx}`));
  }, [draft, excluded]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const fresh = await aiApi.createSprintPlan({ days });
      onJobIdChange(fresh.id);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  const create = async () => {
    if (!draft) return;
    setSubmitting(true);
    try {
      const sprint = await library.create({
        title: draft.title || 'Untitled sprint',
        description: draft.description || '',
        start_date: draft.start_date,
        end_date: draft.end_date,
      });
      if (!sprint) { setSubmitting(false); return; }
      // Attach items sequentially — preserves the AI's ordering, and any
      // individual failure (e.g. deleted goal) doesn't poison the rest.
      for (const it of acceptedItems) {
        try {
          if (it.kind === 'goal')    await library.addItem(sprint.id, { item_type: 'goal',   goal_id: it.id });
          else if (it.kind === 'go') await library.addItem(sprint.id, { item_type: 'go',     go_id: it.id });
          else                       await library.addItem(sprint.id, { item_type: 'routine', routine_id: it.id });
        } catch { /* per-item failure already toasted by the lib */ }
      }
      toast.success(`Created «${sprint.title}» with ${acceptedItems.length} item${acceptedItems.length === 1 ? '' : 's'}`);
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
      title="AI sprint plan"
      description={`Proposal for the next ${days} days — review, edit, accept.`}
    >
      <div className="sp-plan">
        {view.kind === 'loading' && (
          <div className="sp-plan__loading">
            <Loader2 size={20} className="animate-spin" />
            <p>Building your sprint…</p>
            <p className="sp-plan__loading-sub">
              Reading your active goals, pending Gos and routines. ~60-90s on a warm runtime.
            </p>
          </div>
        )}

        {view.kind === 'failed' && (
          <div className="sp-plan__failed">
            <p className="sp-plan__failed-title">Generation failed</p>
            <p className="sp-plan__failed-msg">{view.error}</p>
            <Button onClick={regenerate} disabled={regenerating} variant="primary">
              {regenerating ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        )}

        {view.kind === 'plan' && draft && (
          <>
            <div className="sp-plan__header">
              <label className="sp-plan__field">
                <span className="sp-plan__field-label">Title</span>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <div className="sp-plan__dates">
                <label className="sp-plan__field">
                  <span className="sp-plan__field-label">Start</span>
                  <Input
                    type="date"
                    value={draft.start_date}
                    onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  />
                </label>
                <label className="sp-plan__field">
                  <span className="sp-plan__field-label">End</span>
                  <Input
                    type="date"
                    value={draft.end_date}
                    onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                  />
                </label>
              </div>
              {draft.description && (
                <label className="sp-plan__field">
                  <span className="sp-plan__field-label">Pitch</span>
                  <textarea
                    className="sp-plan__textarea"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    rows={2}
                  />
                </label>
              )}
              {draft.rationale && (
                <div className="sp-plan__rationale">
                  <Sparkles size={11} /> <span>{draft.rationale}</span>
                </div>
              )}
            </div>

            <div className="sp-plan__section">
              <div className="sp-plan__section-head">
                <span className="sp-plan__section-label">Items</span>
                <span className="sp-plan__section-rule" />
                <span className="sp-plan__section-count">
                  {acceptedItems.length} of {draft.items.length} kept
                </span>
              </div>
              {draft.items.length === 0 ? (
                <p className="sp-plan__empty">
                  The model didn't suggest any items. Try regenerating or pick items manually after
                  creating the sprint.
                </p>
              ) : (
                <ul className="sp-plan__items">
                  {draft.items.map((it, idx) => {
                    const uniq = `${it.kind}:${it.id}:${idx}`;
                    const dropped = excluded.has(uniq);
                    const Icon = ITEM_ICON[it.kind];
                    return (
                      <li
                        key={uniq}
                        className="sp-plan__item"
                        data-kind={it.kind}
                        data-dropped={dropped || undefined}
                      >
                        <div className="sp-plan__item-row">
                          <span className="sp-plan__item-kind">
                            <Icon size={11} /> {ITEM_KIND_LABEL[it.kind]}
                          </span>
                          <span className="sp-plan__item-title">{it.title || it.id}</span>
                          <button
                            type="button"
                            className="sp-plan__item-drop"
                            onClick={() => toggleItem(uniq)}
                            title={dropped ? 'Bring back' : 'Drop from sprint'}
                            aria-label={dropped ? 'Restore' : 'Drop'}
                          >
                            {dropped ? '↺' : <X size={12} />}
                          </button>
                        </div>
                        {it.reason && (
                          <p className="sp-plan__item-reason">{it.reason}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="sp-plan__footer">
              <Button
                onClick={regenerate}
                disabled={regenerating || submitting}
                variant="ghost"
              >
                <RefreshCw size={12} /> {regenerating ? 'Regenerating…' : 'Regenerate'}
              </Button>
              <div style={{ flex: 1 }} />
              <Button onClick={onClose} variant="ghost" disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={create}
                variant="primary"
                disabled={submitting || acceptedItems.length === 0 || !draft.title.trim()}
              >
                {submitting ? 'Creating…' : `Create sprint with ${acceptedItems.length} item${acceptedItems.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

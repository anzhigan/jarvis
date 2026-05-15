import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { aiApi, stepsApi, tasksApi } from '../../api/client';
import { Drawer } from '../../components/ui';
import type {
  AIJob,
  Step,
  Task,
  TaskExtractItem,
  TasksExtractOutput,
} from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string | null;
  noteTitle: string;
  onClose: () => void;
  /** Called after a successful commit so the parent can refresh anything. */
  onCommitted?: (created: number) => void;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'items'; items: TaskExtractItem[]; sourceTitle: string }
  | { kind: 'committing'; items: TaskExtractItem[] }
  | { kind: 'success'; createdCount: number };

const LOADING_STEPS = [
  'Loading note',
  'Scanning for action items',
  'Picking the best candidates',
  'Polishing output',
];

/**
 * Drawer for the AI "Generate tasks" feature.
 *
 * Flow:
 *   1. Poll the tasks_extract job until done.
 *   2. Render proposed {title, quote} items as checkboxes.
 *   3. Optional Goal/Step picker (default = Backlog).
 *   4. POST /ai/tasks/commit → success screen.
 */
export function TasksDrawer({ jobId, noteTitle, onClose, onCommitted }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  // Per-item checkbox state. Indices into job.output_json.items[].
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Target Goal + Step (optional). null = goes to backlog.
  const [targetGoalId, setTargetGoalId] = useState<string | null>(null);
  const [targetStepId, setTargetStepId] = useState<string | null>(null);
  // Available goals (lazy-loaded on first picker open).
  const [goals, setGoals] = useState<Task[] | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  // Reset everything when drawer opens with a new job.
  useEffect(() => {
    if (!jobId) return;
    setPicked(new Set());
    setTargetGoalId(null);
    setTargetStepId(null);
    setCommitError(null);
    setCreatedCount(null);
  }, [jobId]);

  // When job completes, pre-check all items (more annoying to opt-in than opt-out).
  useEffect(() => {
    if (job?.status !== 'done') return;
    const output = job.output_json as TasksExtractOutput | null;
    if (output?.items) {
      setPicked(new Set(output.items.map((_, i) => i)));
    }
  }, [job?.status]);

  // Load goals once (lazily on first open). Cheap call.
  useEffect(() => {
    if (!open || goals !== null) return;
    tasksApi.list().then(setGoals).catch(() => setGoals([]));
  }, [open, goals]);

  // When user picks a goal, load its steps. Reset step on goal change.
  useEffect(() => {
    setTargetStepId(null);
    if (!targetGoalId) {
      setSteps([]);
      return;
    }
    stepsApi.list(targetGoalId).then(setSteps).catch(() => setSteps([]));
  }, [targetGoalId]);

  const view: ViewState = useMemo(() => {
    if (createdCount !== null) return { kind: 'success', createdCount };
    if (committing) {
      const output = job?.output_json as TasksExtractOutput | null;
      return { kind: 'committing', items: output?.items ?? [] };
    }
    if (pollError) return { kind: 'failed', error: pollError };
    if (commitError) return { kind: 'failed', error: commitError };
    if (job?.status === 'failed') {
      return { kind: 'failed', error: job.error || 'extraction failed' };
    }
    if (job?.status === 'done') {
      const output = job.output_json as TasksExtractOutput | null;
      const items = output?.items ?? [];
      return { kind: 'items', items, sourceTitle: output?.source_note_title || noteTitle };
    }
    return { kind: 'loading', job };
  }, [createdCount, committing, pollError, commitError, job, noteTitle]);

  const togglePick = (idx: number) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCommit = async () => {
    if (!job?.id || picked.size === 0) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const result = await aiApi.commitTasks({
        job_id: job.id,
        picked: Array.from(picked).sort((a, b) => a - b),
        task_id: targetGoalId,
        step_id: targetStepId,
      });
      setCreatedCount(result.created_count);
      onCommitted?.(result.created_count);
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : 'commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const targetLabel = useMemo(() => {
    if (!targetGoalId) return 'Backlog (no goal)';
    const goal = goals?.find((g) => g.id === targetGoalId);
    if (!goal) return 'Goal';
    if (targetStepId) {
      const step = steps.find((s) => s.id === targetStepId);
      return `${goal.title} · ${step?.title ?? '?'}`;
    }
    return goal.title;
  }, [targetGoalId, targetStepId, goals, steps]);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="goals"
      title={
        view.kind === 'success'
          ? 'Tasks added'
          : view.kind === 'loading'
            ? 'Scanning note'
            : 'Generate tasks'
      }
      description={`«${noteTitle}»`}
      footer={
        view.kind === 'items' ? (
          <>
            <TargetPicker
              label={targetLabel}
              goals={goals}
              steps={steps}
              targetGoalId={targetGoalId}
              targetStepId={targetStepId}
              onGoalChange={setTargetGoalId}
              onStepChange={setTargetStepId}
            />
            <span style={{ flex: 1 }} />
            <span className="ai-tasks__count">
              <b>{picked.size}</b> of {view.items.length}
            </span>
            <button
              type="button"
              className="ai-btn ai-btn--primary ai-btn--sm"
              disabled={picked.size === 0}
              onClick={handleCommit}
            >
              Add {picked.size} {picked.size === 1 ? 'task' : 'tasks'}
            </button>
          </>
        ) : view.kind === 'success' ? (
          <>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="ai-btn ai-btn--primary ai-btn--sm"
              onClick={onClose}
            >
              Done
            </button>
          </>
        ) : null
      }
    >
      {view.kind === 'loading' && <LoadingView job={view.job} />}
      {view.kind === 'failed'  && <FailedView error={view.error} />}
      {view.kind === 'items'   && (
        <ItemsList items={view.items} picked={picked} onToggle={togglePick} />
      )}
      {view.kind === 'committing' && (
        <div className="ai-empty">
          <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
          <p className="ai-loading__title">Adding tasks…</p>
        </div>
      )}
      {view.kind === 'success' && (
        <div className="ai-empty">
          <div className="ai-empty__icon" data-tone="moss">
            <ListChecks size={20} />
          </div>
          <h3 className="ai-empty__title">
            Added <em>{view.createdCount}</em> task{view.createdCount === 1 ? '' : 's'}
          </h3>
          <p className="ai-empty__body">
            They're in your Goals view under «{targetLabel}». Open Goals to assign,
            set due dates, or break them into steps.
          </p>
        </div>
      )}
    </Drawer>
  );
}


// ── Loading state ────────────────────────────────────────────────────────────

function LoadingView({ job }: { job: AIJob | null }) {
  let stepIdx = 0;
  if (job?.status === 'running') stepIdx = 2;
  if (job?.status === 'done') stepIdx = LOADING_STEPS.length;
  const eta = job?.eta_seconds ?? 30;

  return (
    <div className="ai-loading">
      <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
      <h3 className="ai-loading__title">Scanning for action items…</h3>
      <p className="ai-loading__sub">
        Pulling concrete TODOs out of the note. Skipping facts, opinions, and quotes.
      </p>
      <ol className="ai-loading__steps">
        {LOADING_STEPS.map((label, i) => {
          const done = i < stepIdx;
          const current = i === stepIdx;
          return (
            <li
              key={label}
              className="ai-loading__step"
              data-done={done || undefined}
              data-current={current || undefined}
            >
              <span className="ai-loading__step-dot" />
              {label}
            </li>
          );
        })}
      </ol>
      <div className="ai-loading__eta">~{eta}s estimated</div>
    </div>
  );
}


// ── Failed state ─────────────────────────────────────────────────────────────

function FailedView({ error }: { error: string }) {
  return (
    <div className="ai-empty">
      <div className="ai-empty__icon" data-tone="rust">!</div>
      <h3 className="ai-empty__title">Couldn't extract tasks</h3>
      <p className="ai-empty__body">{error}</p>
    </div>
  );
}


// ── Items list ───────────────────────────────────────────────────────────────

function ItemsList({
  items, picked, onToggle,
}: {
  items: TaskExtractItem[];
  picked: Set<number>;
  onToggle: (idx: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon" data-tone="slate"><ListChecks size={20} /></div>
        <h3 className="ai-empty__title">No action items found</h3>
        <p className="ai-empty__body">
          This note looks like reference content rather than tasks. AI couldn't
          identify anything actionable.
        </p>
      </div>
    );
  }

  return (
    <div className="ai-tasks__hint" style={{ marginBottom: 12 }}>
      <p style={{
        fontFamily: 'var(--font-body)', fontStyle: 'italic',
        fontSize: 12.5, color: 'var(--ink-4)', margin: 0,
      }}>
        Uncheck items you don't want. Quote is the exact phrase that prompted the suggestion.
      </p>
      <div className="ai-tasks__list" style={{ marginTop: 12 }}>
        {items.map((item, idx) => {
          const isPicked = picked.has(idx);
          return (
            <button
              key={idx}
              type="button"
              className="ai-task-row"
              data-selected={isPicked || undefined}
              onClick={() => onToggle(idx)}
            >
              <span className="ai-task-row__check" />
              <span className="ai-task-row__body">
                <span className="ai-task-row__title">{item.title}</span>
                {item.quote && (
                  <span className="ai-task-row__quote">«{item.quote}»</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ── Target picker (Goal + Step) ──────────────────────────────────────────────

interface TargetProps {
  label: string;
  goals: Task[] | null;
  steps: Step[];
  targetGoalId: string | null;
  targetStepId: string | null;
  onGoalChange: (id: string | null) => void;
  onStepChange: (id: string | null) => void;
}

function TargetPicker({
  label, goals, steps, targetGoalId, targetStepId, onGoalChange, onStepChange,
}: TargetProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="ai-target-trigger" aria-label="Pick target">
          <span className="ai-target-trigger__lab">→</span>
          <span className="ai-target-trigger__val">{label}</span>
          <ChevronDown size={11} className="ai-target-trigger__chev" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="ai-target-menu"
          align="start"
          side="top"
          sideOffset={6}
        >
          <button
            type="button"
            className="ai-target-row"
            data-selected={targetGoalId === null || undefined}
            onClick={() => onGoalChange(null)}
          >
            Backlog (no goal)
          </button>
          {goals === null && (
            <div className="ai-target-empty">Loading goals…</div>
          )}
          {goals && goals.length === 0 && (
            <div className="ai-target-empty">No goals yet</div>
          )}
          {goals?.map((g) => (
            <button
              key={g.id}
              type="button"
              className="ai-target-row"
              data-selected={targetGoalId === g.id || undefined}
              onClick={() => onGoalChange(g.id)}
            >
              {g.title}
            </button>
          ))}
          {targetGoalId && steps.length > 0 && (
            <>
              <div className="ai-target-divider" />
              <div className="ai-target-label">Step (optional)</div>
              <button
                type="button"
                className="ai-target-row ai-target-row--sub"
                data-selected={targetStepId === null || undefined}
                onClick={() => onStepChange(null)}
              >
                — (no step)
              </button>
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="ai-target-row ai-target-row--sub"
                  data-selected={targetStepId === s.id || undefined}
                  onClick={() => onStepChange(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

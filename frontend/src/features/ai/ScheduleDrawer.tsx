import { useEffect, useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Drawer } from '../../components/ui';
import type {
  AIJob, Go, ScheduleOutput, ScheduleSlot, ScheduleSummary, Task,
} from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string | null;
  /** Human-readable date for header. */
  dateLabel: string;
  onClose: () => void;
  onRegenerate?: () => void;
  /** Fires when a slot's underlying source (currently only Gos) is clicked. */
  onSlotClick?: (sourceKind: 'go', sourceId: string) => void;
  /** Fires when the Goal pill inside a slot is clicked. */
  onGoalClick?: (goalId: string) => void;
  /** Catalogue used to enrich Go-source slots — render them as Go subcards
   *  (same visual language as the Kanban Go pills). */
  gos?: Go[];
  /** Goals catalogue — supplies priority + step titles for the Go subcard. */
  goals?: Task[];
  /** When true, the drawer slides left to make room for a stacked drawer. */
  shifted?: boolean;
  /** When true, the drawer is non-modal — no overlay, click-through to peers. */
  nonModal?: boolean;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'result'; data: ScheduleOutput };

const LOADING_STEPS = [
  'Loading today\'s goals + routines',
  'Building context',
  'Planning time blocks',
  'Polishing output',
];

export function ScheduleDrawer({
  jobId, dateLabel, onClose, onRegenerate, onSlotClick, onGoalClick,
  shifted, nonModal, gos, goals,
}: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);
  const gosById = useMemo(() => {
    const m = new Map<string, Go>();
    for (const g of gos ?? []) m.set(g.id, g);
    return m;
  }, [gos]);
  // Pre-build (goalId → goal) and (stepId → step) lookups so each rendered
  // slot can fetch parent goal priority + step title in O(1).
  const { goalsById, stepById } = useMemo(() => {
    const goalsById = new Map<string, Task>();
    const stepById = new Map<string, { title: string }>();
    for (const t of goals ?? []) {
      goalsById.set(t.id, t);
      for (const s of t.steps ?? []) stepById.set(s.id, { title: s.title });
    }
    return { goalsById, stepById };
  }, [goals]);

  const view: ViewState = useMemo(() => {
    if (pollError) return { kind: 'failed', error: pollError };
    if (job?.status === 'failed') {
      return { kind: 'failed', error: job.error || 'planning failed' };
    }
    if (job?.status === 'done') {
      const out = job.output_json as ScheduleOutput | null;
      if (out && Array.isArray(out.slots)) return { kind: 'result', data: out };
    }
    return { kind: 'loading', job };
  }, [pollError, job]);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="goals"
      shifted={shifted}
      nonModal={nonModal}
      wide
      title={view.kind === 'result' ? `Your day · ${dateLabel}` : 'Planning your day'}
      description={view.kind === 'result' && view.data.total_active_minutes
        ? `${Math.floor(view.data.total_active_minutes / 60)}h ${view.data.total_active_minutes % 60}m active`
        : `«${dateLabel}»`}
      footer={view.kind === 'result' ? (
        <>
          <button type="button" className="ai-btn ai-btn--ghost ai-btn--sm" onClick={onRegenerate}>
            Regenerate
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ai-btn ai-btn--primary ai-btn--sm" onClick={onClose}>
            Done
          </button>
        </>
      ) : view.kind === 'failed' ? (
        <>
          <span style={{ flex: 1 }} />
          <button type="button" className="ai-btn ai-btn--primary ai-btn--sm" onClick={onRegenerate}>
            Try again
          </button>
        </>
      ) : null}
    >
      {view.kind === 'loading' && <LoadingView job={view.job} />}
      {view.kind === 'failed'  && <FailedView error={view.error} />}
      {view.kind === 'result'  && (
        <>
          <SummaryCard summary={view.data.summary} />
          <ResultView
            slots={view.data.slots}
            onSlotClick={onSlotClick}
            onGoalClick={onGoalClick}
            gosById={gosById}
            goalsById={goalsById}
            stepById={stepById}
          />
        </>
      )}
    </Drawer>
  );
}


// ── Narrative summary card (above the timeline) ──────────────────────────────

function SummaryCard({ summary }: { summary: ScheduleSummary | undefined }) {
  if (!summary) return null;
  const rows: { tone: 'focus' | 'success' | 'warning'; label: string; text: string }[] = [];
  if (summary.focus?.trim())            rows.push({ tone: 'focus',   label: 'Focus',     text: summary.focus });
  if (summary.doing_well?.trim())       rows.push({ tone: 'success', label: 'On track',  text: summary.doing_well });
  if (summary.needs_attention?.trim())  rows.push({ tone: 'warning', label: 'Needs attention', text: summary.needs_attention });
  if (rows.length === 0) return null;

  return (
    <div className="ai-sched-summary">
      {rows.map((r) => (
        <div className="ai-sched-summary__row" data-tone={r.tone} key={r.label}>
          <div className="ai-sched-summary__label">{r.label}</div>
          <p className="ai-sched-summary__text">{r.text}</p>
        </div>
      ))}
    </div>
  );
}


function LoadingView({ job }: { job: AIJob | null }) {
  let stepIdx = 0;
  if (job?.status === 'running') stepIdx = 2;
  if (job?.status === 'done') stepIdx = LOADING_STEPS.length;
  const eta = job?.eta_seconds ?? 60;

  return (
    <div className="ai-loading">
      <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
      <h3 className="ai-loading__title">Building your schedule…</h3>
      <p className="ai-loading__sub">
        Reading goals and routines for the day, then time-blocking them realistically.
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


function FailedView({ error }: { error: string }) {
  const friendly = error.toLowerCase().includes('no open go-tasks')
    ? 'No open Go-tasks found. Create at least one Go in Kanban or Go view, then try again.'
    : error;
  return (
    <div className="ai-empty">
      <div className="ai-empty__icon" data-tone="rust">!</div>
      <h3 className="ai-empty__title">Nothing to plan</h3>
      <p className="ai-empty__body">{friendly}</p>
    </div>
  );
}


// ── Result: vertical timeline ────────────────────────────────────────────────

/** Each slot needs a stable id for the sortable context. Generated once when
 *  the slots first arrive — index alone is unstable across reorders. */
interface PlanSlot extends ScheduleSlot { _id: string }

function ResultView({
  slots, onSlotClick, onGoalClick, gosById, goalsById, stepById,
}: {
  slots: ScheduleSlot[];
  onSlotClick?: (sourceKind: 'go', sourceId: string) => void;
  onGoalClick?: (goalId: string) => void;
  gosById: Map<string, Go>;
  goalsById: Map<string, Task>;
  stepById: Map<string, { title: string }>;
}) {
  // Local reordered copy of slots. Reset whenever the backend hands us a new
  // schedule (different length or different ids); pure UX rearrangement, not
  // persisted back to the cache.
  const [ordered, setOrdered] = useState<PlanSlot[]>(() =>
    slots.map((s, i) => ({ ...s, _id: `${i}-${s.source_id ?? s.kind}` })));
  useEffect(() => {
    setOrdered(slots.map((s, i) => ({ ...s, _id: `${i}-${s.source_id ?? s.kind}` })));
  }, [slots]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrdered((items) => {
      const from = items.findIndex((s) => s._id === active.id);
      const to   = items.findIndex((s) => s._id === over.id);
      if (from < 0 || to < 0) return items;
      return arrayMove(items, from, to);
    });
  };

  if (ordered.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon" data-tone="slate">∅</div>
        <h3 className="ai-empty__title">Empty schedule</h3>
        <p className="ai-empty__body">
          Model returned no slots. Try Regenerate or check your work hours.
        </p>
      </div>
    );
  }
  const freeOrder = !ordered[0].start_time;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordered.map((s) => s._id)} strategy={verticalListSortingStrategy}>
        <div className="ai-tl" data-mode={freeOrder ? 'free' : 'time'}>
          {ordered.map((s, i) => (
            <SortableSlot
              key={s._id}
              slot={s}
              index={i}
              freeOrder={freeOrder}
              gosById={gosById}
              goalsById={goalsById}
              stepById={stepById}
              onSlotClick={onSlotClick}
              onGoalClick={onGoalClick}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableSlot({
  slot: s, index: i, freeOrder, gosById, goalsById, stepById, onSlotClick, onGoalClick,
}: {
  slot: PlanSlot;
  index: number;
  freeOrder: boolean;
  gosById: Map<string, Go>;
  goalsById: Map<string, Task>;
  stepById: Map<string, { title: string }>;
  onSlotClick?: (sourceKind: 'go', sourceId: string) => void;
  onGoalClick?: (goalId: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: s._id });

  const linkedGo = s.source_kind === 'go' && s.source_id
    ? gosById.get(s.source_id) ?? null
    : null;
  const goalFromGo = linkedGo?.task_id ? goalsById.get(linkedGo.task_id) ?? null : null;
  const linkedGoal = !linkedGo && s.source_kind === 'goal' && s.source_id
    ? goalsById.get(s.source_id) ?? null
    : null;
  const stepTitle = linkedGo?.step_id ? stepById.get(linkedGo.step_id)?.title ?? null : null;

  let bodyContent: React.ReactNode;
  let clickHandler: (() => void) | null = null;
  if (linkedGo) {
    clickHandler = onSlotClick ? () => onSlotClick('go', linkedGo.id) : null;
    bodyContent = (
      <GoSubcardInline
        go={linkedGo}
        note={s.note}
        goalId={goalFromGo?.id ?? linkedGo.task_id}
        goalTitle={goalFromGo?.title ?? linkedGo.task_title}
        stepTitle={stepTitle}
        priority={goalFromGo?.priority ?? null}
        onGoalClick={onGoalClick}
      />
    );
  } else if (linkedGoal) {
    clickHandler = onGoalClick ? () => onGoalClick(linkedGoal.id) : null;
    bodyContent = (
      <GoalSubcardInline
        goal={linkedGoal}
        fallbackTitle={s.title}
        note={s.note}
      />
    );
  } else {
    bodyContent = (
      <>
        <div className="ai-tl__title-row">
          <h4 className="ai-tl__title">{s.title}</h4>
        </div>
        {s.note && <p className="ai-tl__note">{s.note}</p>}
      </>
    );
  }

  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className="ai-tl__slot-wrap"
      data-dragging={isDragging || undefined}
      style={wrapperStyle}
    >
      <button
        type="button"
        className="ai-tl__handle"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        // Prevent the surrounding clickable slot from firing on grip click.
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={12} />
      </button>
      {clickHandler ? (
        <button
          type="button"
          className="ai-tl__slot ai-tl__slot--clickable"
          data-kind={s.kind}
          onClick={clickHandler}
          title={linkedGoal ? 'Open goal' : 'Open Go'}
        >
          <SlotBody
            slot={s}
            index={i}
            freeOrder={freeOrder}
            bodyContent={bodyContent}
          />
        </button>
      ) : (
        <div className="ai-tl__slot" data-kind={s.kind}>
          <SlotBody
            slot={s}
            index={i}
            freeOrder={freeOrder}
            bodyContent={bodyContent}
          />
        </div>
      )}
    </div>
  );
}

function SlotBody({
  slot: s, index: i, freeOrder, bodyContent,
}: {
  slot: PlanSlot;
  index: number;
  freeOrder: boolean;
  bodyContent: React.ReactNode;
}) {
  return (
    <>
      <div className="ai-tl__time">
        {freeOrder ? (
          <span className="ai-tl__rank">{i + 1}</span>
        ) : (
          <>{s.start_time}<br />{s.end_time}</>
        )}
      </div>
      <span className="ai-tl__dot" />
      <div className="ai-tl__body">{bodyContent}</div>
    </>
  );
}

/** Renders a Go inside a plan-day slot. Visual language matches the Kanban
 *  Go subcard (`.kc-child[data-kind="go"]`). Two-row layout: a context row of
 *  Goal/Step capsules above the title, so the eye doesn't have to compete
 *  with the title for space. The Goal capsule carries the priority colour
 *  and is itself a button that opens the Goal detail panel. */
function GoSubcardInline({
  go, note, goalId, goalTitle, stepTitle, priority, onGoalClick,
}: {
  go: Go;
  note: string;
  goalId: string | null;
  goalTitle: string | null;
  stepTitle: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  onGoalClick?: (goalId: string) => void;
}) {
  const due = go.due_date ? new Date(go.due_date) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = !!(due && !go.is_done_today && due < today);
  const valueLabel = go.kind === 'numeric' && go.target_value
    ? `${go.target_value}${go.unit ? ' ' + go.unit : ''}`
    : null;
  const dueLabel = due
    ? due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const goalClickable = !!(onGoalClick && goalId);
  return (
    <div className="kc-child kc-child--roomy" data-kind="go" data-done={go.is_done_today || undefined}>
      {(goalTitle || stepTitle) && (
        <div className="kc-child-tags">
          {goalTitle && (
            <span
              className="kc-tag"
              data-tag="goal"
              data-prio={priority ?? undefined}
              role={goalClickable ? 'button' : undefined}
              tabIndex={goalClickable ? 0 : undefined}
              title={priority ? `Goal · ${goalTitle} · priority ${priority}` : `Goal · ${goalTitle}`}
              onClick={goalClickable
                ? (e) => { e.stopPropagation(); onGoalClick!(goalId!); }
                : undefined}
              onKeyDown={goalClickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onGoalClick!(goalId!);
                    }
                  }
                : undefined}
            >
              {goalTitle}
            </span>
          )}
          {stepTitle && (
            <span className="kc-tag" data-tag="step" title={`Step · ${stepTitle}`}>{stepTitle}</span>
          )}
        </div>
      )}
      <div className="kc-child-row">
        <span className="kc-child-name">{go.title}</span>
      </div>
      {(valueLabel || dueLabel || note) && (
        <div className="kc-child-meta">
          {valueLabel && <span>target {valueLabel}</span>}
          {valueLabel && dueLabel && <span className="sep">·</span>}
          {dueLabel && (
            <span className={overdue ? 'overdue' : undefined}>
              due {dueLabel}{overdue ? ' · overdue' : ''}
            </span>
          )}
          {note && (valueLabel || dueLabel) && <span className="sep">·</span>}
          {note && <span style={{ color: 'var(--ink-4)' }}>{note}</span>}
        </div>
      )}
    </div>
  );
}

/** Plan slot that points at a Goal (not a specific Go yet). Visually paired
 *  with GoSubcardInline so the eye reads them as part of the same list. */
function GoalSubcardInline({
  goal, fallbackTitle, note,
}: {
  goal: Task;
  fallbackTitle: string;
  note: string;
}) {
  const dueLabel = goal.due_date
    ? new Date(goal.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <div className="kc-child kc-child--roomy" data-kind="goal">
      <div className="kc-child-tags">
        <span
          className="kc-tag"
          data-tag="goal"
          data-prio={goal.priority ?? undefined}
          title={`Goal · ${goal.title}`}
        >
          {goal.title}
        </span>
      </div>
      <div className="kc-child-row">
        <span className="kc-child-name">{fallbackTitle || goal.title}</span>
      </div>
      {(dueLabel || note) && (
        <div className="kc-child-meta">
          {dueLabel && <span>due {dueLabel}</span>}
          {note && dueLabel && <span className="sep">·</span>}
          {note && <span style={{ color: 'var(--ink-4)' }}>{note}</span>}
        </div>
      )}
    </div>
  );
}

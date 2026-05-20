import { useEffect, useMemo, useState } from 'react';
import { Flag, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';
import { useAIJobsStore } from '../../../store/aiJobs';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';
import { MobileSegmented } from './MobileSegmented';
import { MobileActionSheet, type ActionSheetItem } from './MobileActionSheet';
import { MobileListGroup, MobileListCell } from './MobileList';

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Persist a status change. The detail sheet is optimistic — it updates
   *  the segmented control immediately and calls this to write back. */
  onStatusChange: (next: TaskStatus) => void;
  /** Fired right after `aiApi.createGoalPlan` resolves with a fresh
   *  job id. Parent uses this to open MobileGoalPlanSheet so the user
   *  sees progress + result without going through the toast/panel
   *  round-trip. */
  onAIJobStarted?: (jobId: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'active'  as TaskStatus, label: 'Active'  },
  { value: 'backlog' as TaskStatus, label: 'Backlog' },
  { value: 'paused'  as TaskStatus, label: 'Paused'  },
  { value: 'done'    as TaskStatus, label: 'Done'    },
];

function priorityColor(p: TaskPriority): { bg: string; fg: string } {
  if (p === 'high')   return { bg: 'var(--rust-soft)',  fg: 'var(--rust)'  };
  if (p === 'medium') return { bg: 'var(--ochre-soft)', fg: 'var(--ochre)' };
  return                     { bg: 'var(--cream)',      fg: 'var(--ink-5)' };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Mobile detail view for a single Goal. Opens on tap of a Goal card.
 *
 * Sections:
 *   1. Status segmented (Active / Backlog / Paused / Done) — single tap
 *      flips status, no separate save.
 *   2. Progress bar + percent.
 *   3. Stat cells — gos / due date / priority pill.
 *   4. Tags row.
 *   5. ✨ "Generate with AI" tinted CTA — opens MobileActionSheet with
 *      three modes (Full plan / Fill dates / Rebalance). On pick, fires
 *      `aiApi.createGoalPlan` + `addBgJob`; the universal toast / panel
 *      shows progress and ready-state. (Result-viewer sheet will follow
 *      in a later phase.)
 *
 * Footer: tinted "Edit" + filled "Done". A destructive "Delete goal" row
 * lives near the bottom of the sheet body, inside a settings-style cell.
 */
export function MobileGoalDetailSheet({
  task, open, onOpenChange, onEdit, onDelete, onStatusChange, onAIJobStarted,
}: Props) {
  const addBgJob = useAIJobsStore((s) => s.add);
  const [aiOpen, setAiOpen] = useState(false);

  // Optimistic status — segmented control reflects the user's pick
  // immediately, even before `onStatusChange` round-trips through the
  // server. Falls back to `task.status` once a fresh prop lands (the
  // useEffect resets local state whenever the task object changes).
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus | null>(null);
  useEffect(() => { setOptimisticStatus(null); }, [task?.id, task?.status]);

  // Memo schedules → don't recompute on every parent re-render while the
  // sheet is open. Safe to call when task is null — produces empty/zero
  // values that the early-return below discards anyway.
  const pct = useMemo(() => Math.round(task?.progress ?? 0), [task]);
  const todayItems = useMemo(() => {
    if (!task) return { total: 0, done: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const arr = task.gos.filter((g) => !g.due_date || g.due_date === today || g.is_done_today);
    return { total: arr.length, done: arr.filter((g) => g.is_done_today).length };
  }, [task]);

  if (!task) return null;

  // ── AI plan firing ────────────────────────────────────────────────
  const fireAi = async (mode: 'full' | 'fill_dates' | 'rebalance_dates') => {
    try {
      const job = await aiApi.createGoalPlan({ goal_id: task.id, mode });
      // Same `<Action> for "<title>"` headline the backend produces on
      // rehydrate (routers/ai.py::_title_for). Composing locally makes
      // the toast informative immediately, before the next listJobs poll.
      const modeLabel = mode === 'full' ? 'Full plan'
        : mode === 'fill_dates' ? 'Fill missing dates'
        : 'Rebalance dates';
      addBgJob({
        jobId: job.id,
        kind: 'goal_plan',
        source: {
          section: 'goals',
          noteTitle: `${modeLabel} for "${task.title}"`,
        },
      });
      // Close the goal sheet, then hand the job id to the parent so the
      // plan sheet opens directly — saves the user a toast→panel→pick
      // round-trip when they're right here.
      onOpenChange(false);
      onAIJobStarted?.(job.id);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to start AI plan');
    }
  };

  // Gate fill/rebalance — same rule as desktop GoalAiMenu: need at least
  // one step OR an orphan go for the dates modes to make sense.
  const hasSchedulables =
    (task.steps?.length ?? 0) > 0
    || (task.gos?.some((g) => !g.step_id) ?? false);

  const aiActions: ActionSheetItem[] = [
    {
      label: 'Full plan',
      onSelect: () => fireAi('full'),
    },
    {
      label: 'Fill missing dates',
      disabled: !hasSchedulables,
      onSelect: () => fireAi('fill_dates'),
    },
    {
      label: 'Rebalance dates',
      disabled: !hasSchedulables,
      onSelect: () => fireAi('rebalance_dates'),
    },
  ];

  const pri = priorityColor(task.priority);

  return (
    <>
      <MobileBottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={task.title}
        description={task.description || undefined}
        footer={
          <>
            <MobileButton variant="tinted" block onClick={onEdit}>Edit</MobileButton>
            <MobileButton variant="filled" block onClick={() => onOpenChange(false)}>Done</MobileButton>
          </>
        }
      >
        {/* ── Status ──────────────────────────────────────────────── */}
        <div style={{ margin: '4px 0 18px' }}>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            color: 'var(--ink-4)', marginBottom: 8,
          }}>Status</div>
          <MobileSegmented
            options={STATUS_OPTIONS}
            value={optimisticStatus ?? task.status}
            onChange={(next) => {
              // Optimistic — flip the segmented immediately, then fire the
              // network call. The local state resets when a refreshed task
              // prop lands (useEffect on task.id/task.status).
              setOptimisticStatus(next);
              onStatusChange(next);
            }}
            ariaLabel="Goal status"
          />
        </div>

        {/* ── Progress ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-4)',
            }}>Progress</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500,
              color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
            }}>{pct}%</span>
          </div>
          <div style={{
            height: 8, background: 'var(--cream)', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--indigo)',
              transition: 'width 280ms var(--ease-emph, ease-out)',
            }} />
          </div>
        </div>

        {/* ── Stat cells ──────────────────────────────────────────── */}
        <div className="m-rsd__stats" style={{ marginBottom: 18 }}>
          <div className="m-rsd__stat">
            <div className="m-rsd__stat-num">
              {todayItems.done}<em>/{todayItems.total || '—'}</em>
            </div>
            <div className="m-rsd__stat-lab">Today</div>
          </div>
          <div className="m-rsd__stat">
            <div className="m-rsd__stat-num" style={{ fontSize: 15 }}>
              {fmtDate(task.due_date)}
            </div>
            <div className="m-rsd__stat-lab">Due</div>
          </div>
          <div className="m-rsd__stat">
            <div className="m-rsd__stat-num">
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 999,
                  background: pri.bg, color: pri.fg,
                  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              ><Flag size={12} /></span>
            </div>
            <div className="m-rsd__stat-lab" style={{ textTransform: 'capitalize' }}>
              {task.priority}
            </div>
          </div>
        </div>

        {/* ── Tags ────────────────────────────────────────────────── */}
        {task.tags.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              color: 'var(--ink-4)', marginBottom: 8,
            }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {task.tags.map((tg) => (
                <span
                  key={tg.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 999,
                    background: `${tg.color}14`,
                    color: tg.color,
                    boxShadow: `inset 0 0 0 1px ${tg.color}40`,
                    fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 50, background: tg.color }} />
                  {tg.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── AI plan CTA ─────────────────────────────────────────── */}
        <MobileButton
          variant="tinted"
          block
          icon={<Sparkles size={16} />}
          onClick={() => setAiOpen(true)}
        >Generate with AI</MobileButton>

        {/* ── Items count (gos / steps) ───────────────────────────── */}
        <div style={{
          marginTop: 18,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)',
          textAlign: 'center',
        }}>
          {task.steps?.length ?? 0} step{(task.steps?.length ?? 0) === 1 ? '' : 's'}
          {' · '}
          {task.gos.length} go{task.gos.length === 1 ? '' : 's'}
        </div>

        {/* ── Delete ──────────────────────────────────────────────── */}
        <div style={{ marginTop: 18 }}>
          <MobileListGroup>
            <MobileListCell
              icon={<Trash2 size={15} />}
              iconColor="rust"
              title="Delete goal"
              destructive
              chevron
              onClick={() => { onOpenChange(false); onDelete(); }}
            />
          </MobileListGroup>
        </div>
      </MobileBottomSheet>

      {/* AI plan action sheet — three modes, with fill/rebalance gated on
          steps-or-orphan-gos availability (mirrors desktop GoalAiMenu). */}
      <MobileActionSheet
        open={aiOpen}
        onOpenChange={setAiOpen}
        title="Generate with AI"
        message={hasSchedulables
          ? 'Pick how the AI should plan this goal.'
          : 'Add a step or a go first to use the dates modes.'}
        actions={aiActions}
      />
    </>
  );
}

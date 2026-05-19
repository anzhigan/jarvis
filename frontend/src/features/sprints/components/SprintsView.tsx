/**
 * Desktop-style Sprints view: a Gantt-like roadmap of all sprints up top
 * (auto-fit date axis with a today line), and a detail panel below the
 * selected sprint with its items grid. Clicking a Goal item expands a
 * nested compact Step Gantt + chip strips for the step's Gos and any
 * goal-level Gos not attached to a step.
 *
 * Single page; no separate "featured" treatment. The existing edit drawer
 * (`SprintDetailPanel`) and create dialog (`SprintCreateDialog`) are still
 * mounted at the shell level and triggered from the detail panel header.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, Repeat, Sparkles, Target, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import type { Go, Routine, Sprint, SprintItem, Step, Task } from '../../../api/types';
import { useSprints, type SprintWithProgress } from '../hooks/useSprints';
import { useSprintsFilters, type ViewFilter } from '../hooks/useSprintsFilters';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { todayState } from '../../routines/hooks/useRoutinesToday';
import { SprintDetailPanel } from './SprintDetailPanel';
import { SprintCreateDialog } from './SprintCreateDialog';
import { AddSprintItemDialog } from './AddSprintItemDialog';
import { SprintPlanDrawer } from './SprintPlanDrawer';
import { AI_JOB_OPEN_EVENT, useAIJobsStore, type AIJobOpenDetail } from '../../../store/aiJobs';
import './sprints.css';

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtFull(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Range { start: Date; end: Date; ms: number; }
function rangeFor(rows: SprintWithProgress[]): Range {
  if (rows.length === 0) {
    const today = new Date();
    const s = new Date(today); s.setDate(s.getDate() - 30);
    const e = new Date(today); e.setDate(e.getDate() + 30);
    return { start: s, end: e, ms: e.getTime() - s.getTime() };
  }
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const a = Date.parse(r.sprint.start_date);
    const b = Date.parse(r.sprint.end_date);
    if (!isNaN(a)) min = Math.min(min, a);
    if (!isNaN(b)) max = Math.max(max, b);
  }
  const span = max - min;
  const pad = Math.max(span * 0.04, 5 * 86_400_000);
  const start = new Date(min - pad);
  const end = new Date(max + pad);
  return { start, end, ms: end.getTime() - start.getTime() };
}

function ticksFor(range: Range, count = 6): { pct: number; date: Date }[] {
  const out: { pct: number; date: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const pct = (i / (count - 1)) * 100;
    out.push({ pct, date: new Date(range.start.getTime() + range.ms * (pct / 100)) });
  }
  return out;
}

/** Time elapsed fraction (0..100) — the original `progress` field. */
function timePct(row: SprintWithProgress): number {
  return Math.round(row.progress * 100);
}

/** Real item-completion stats for a sprint. "Done" semantics per kind:
 *  - goal:    status === 'done', OR all gos done if no explicit done status.
 *  - go:      has any entry value > 0 today (matches Kanban's `is_done_today`).
 *  - routine: today is satisfied (boolean done or numeric target hit).
 *  An item linked to an entity that no longer exists is skipped — counts
 *  shrink rather than show a stale 100% from "ghost" denominators. */
interface ItemStats { done: number; total: number; pct: number; }
function itemStatsFor(
  sprint: Sprint,
  goalById: Map<string, Task>,
  goById: Map<string, Go>,
  routineById: Map<string, Routine>,
): ItemStats {
  let done = 0, total = 0;
  for (const it of sprint.items) {
    if (it.item_type === 'goal' && it.goal_id) {
      const g = goalById.get(it.goal_id);
      if (!g) continue;
      total++;
      if (g.status === 'done' || (g.progress ?? 0) >= 100) done++;
    } else if (it.item_type === 'go' && it.go_id) {
      const g = goById.get(it.go_id);
      if (!g) continue;
      total++;
      if (g.is_done_today) done++;
    } else if (it.item_type === 'routine' && it.routine_id) {
      const r = routineById.get(it.routine_id);
      if (!r) continue;
      total++;
      if (todayState(r) === 'done') done++;
    }
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

const VIEW_LABELS: Record<ViewFilter, string> = {
  all: 'All', active: 'Active', upcoming: 'Upcoming', past: 'Past',
};

const ITEM_ICON: Record<SprintItem['item_type'], React.ElementType> = {
  goal:    Target,
  go:      Zap,
  routine: Repeat,
};
const ITEM_KIND_LABEL: Record<SprintItem['item_type'], string> = {
  goal: 'Goal', go: 'Go', routine: 'Routine',
};

// ── Sprint roadmap (top-level Gantt) ─────────────────────────────────────

interface RoadmapProps {
  rows: SprintWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  itemStatsBy: Map<string, ItemStats>;
}
function SprintsRoadmap({ rows, selectedId, onSelect, itemStatsBy }: RoadmapProps) {
  const range = useMemo(() => rangeFor(rows), [rows]);
  const ticks = useMemo(() => ticksFor(range), [range]);
  const todayPct = ((Date.now() - range.start.getTime()) / range.ms) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="sp-gantt">
      <div className="sp-gantt__corner" />
      <div className="sp-gantt__axis">
        {ticks.map((t, i) => (
          <span key={i} className="sp-gantt__tick" style={{ left: `${t.pct}%` }}>
            {fmtShort(t.date.toISOString())}
          </span>
        ))}
        {showToday && (
          <>
            <span className="sp-gantt__today-pill" style={{ left: `${todayPct}%` }}>Today</span>
            <span className="sp-gantt__today-line" style={{ left: `${todayPct}%` }} />
          </>
        )}
      </div>
      <div className="sp-gantt__rows-side">
        {rows.map((row, i) => {
          const stats = itemStatsBy.get(row.sprint.id);
          const sideText = stats && stats.total > 0
            ? `${stats.done}/${stats.total}`
            : `${timePct(row)}%`;
          return (
            <button
              key={row.sprint.id}
              type="button"
              className="sp-row-side"
              data-selected={row.sprint.id === selectedId || undefined}
              onClick={() => onSelect(row.sprint.id)}
            >
              <span className="sp-row-side__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="sp-row-side__title">{row.sprint.title}</span>
              <span className="sp-row-side__count">{sideText}</span>
            </button>
          );
        })}
      </div>
      <div className="sp-gantt__rows-bars">
        {rows.map((row) => {
          const st = Date.parse(row.sprint.start_date);
          const en = Date.parse(row.sprint.end_date);
          const left = ((st - range.start.getTime()) / range.ms) * 100;
          const width = Math.max(((en - st) / range.ms) * 100, 1.5);
          const state = row.bucket;
          // Bar fill = item completion when there are items; falls back to
          // time-elapsed for empty sprints so the bar isn't dead-flat.
          const stats = itemStatsBy.get(row.sprint.id);
          const fillPct = stats && stats.total > 0 ? stats.pct : timePct(row);
          return (
            <button
              key={row.sprint.id}
              type="button"
              className="sp-row-bar"
              data-selected={row.sprint.id === selectedId || undefined}
              onClick={() => onSelect(row.sprint.id)}
            >
              <span
                className="sp-bar"
                data-state={state === 'past' ? 'done' : state === 'active' ? 'active' : 'upcoming'}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {state !== 'upcoming' && (
                  <span className="sp-bar__fill" style={{ width: `${fillPct}%` }} />
                )}
                <span className="sp-bar__label">{row.sprint.title}</span>
                <span className="sp-bar__pct">{fillPct}%</span>
              </span>
              {showToday && (
                <span className="sp-gantt__today-line" style={{ left: `${todayPct}%` }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step drill-down (compact Gantt inside an expanded Goal item) ─────────

interface StepGanttProps {
  goal: Task;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
}
function StepGantt({ goal, selectedStepId, onSelectStep }: StepGanttProps) {
  const sorted = useMemo(
    () => [...(goal.steps ?? [])].sort((a, b) => a.position - b.position),
    [goal.steps],
  );
  const N = sorted.length;

  // Range from goal + step dates with safe fallback.
  const range = useMemo(() => {
    const ms: number[] = [];
    const push = (s: string | null) => { if (s) { const t = Date.parse(s); if (!isNaN(t)) ms.push(t); } };
    push(goal.start_date);
    push(goal.due_date);
    for (const st of sorted) { push(st.start_date); push(st.end_date); }
    if (ms.length < 2) {
      const today = new Date();
      const start = new Date(today); start.setDate(start.getDate() - 14);
      const end = new Date(today); end.setDate(end.getDate() + 56);
      return { start, end, ms: end.getTime() - start.getTime() };
    }
    let lo = Math.min(...ms), hi = Math.max(...ms);
    const pad = Math.max((hi - lo) * 0.04, 86_400_000);
    return { start: new Date(lo - pad), end: new Date(hi + pad), ms: (hi - lo) + 2 * pad };
  }, [goal, sorted]);

  const ticks = useMemo(() => ticksFor(range, 4), [range]);
  const todayPct = ((Date.now() - range.start.getTime()) / range.ms) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  if (N === 0) {
    return (
      <div className="sp-step-empty">
        No steps yet. Add steps to this goal to see them in a timeline here.
      </div>
    );
  }

  const barCoords = (s: Step, i: number): { left: number; width: number } => {
    if (s.start_date && s.end_date) {
      const st = Date.parse(s.start_date);
      const en = Date.parse(s.end_date);
      if (!isNaN(st) && !isNaN(en) && en >= st) {
        const left = ((st - range.start.getTime()) / range.ms) * 100;
        const width = Math.max(((en - st) / range.ms) * 100, 1.5);
        return { left, width };
      }
    }
    return { left: (i / N) * 100, width: (1 / N) * 100 };
  };

  return (
    <div className="sp-gantt sp-gantt--compact">
      <div className="sp-gantt__corner" />
      <div className="sp-gantt__axis">
        {ticks.map((t, i) => (
          <span key={i} className="sp-gantt__tick" style={{ left: `${t.pct}%` }}>
            {fmtShort(t.date.toISOString())}
          </span>
        ))}
        {showToday && (
          <>
            <span className="sp-gantt__today-pill" style={{ left: `${todayPct}%` }}>Today</span>
            <span className="sp-gantt__today-line" style={{ left: `${todayPct}%` }} />
          </>
        )}
      </div>
      <div className="sp-gantt__rows-side">
        {sorted.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="sp-row-side"
            data-selected={s.id === selectedStepId || undefined}
            onClick={() => onSelectStep(s.id === selectedStepId ? null : s.id)}
          >
            <span className="sp-row-side__num">{String(i + 1).padStart(2, '0')}</span>
            <span className="sp-row-side__title">{s.title}</span>
            <span className="sp-row-side__count">{s.gos_done}/{s.gos_count}</span>
          </button>
        ))}
      </div>
      <div className="sp-gantt__rows-bars">
        {sorted.map((s, i) => {
          const state = s.status === 'done' ? 'done'
            : s.status === 'in_progress' ? 'active' : 'upcoming';
          const { left, width } = barCoords(s, i);
          const pct = s.gos_count > 0
            ? Math.round((s.gos_done / s.gos_count) * 100)
            : (state === 'done' ? 100 : 0);
          return (
            <button
              key={s.id}
              type="button"
              className="sp-row-bar"
              data-selected={s.id === selectedStepId || undefined}
              onClick={() => onSelectStep(s.id === selectedStepId ? null : s.id)}
            >
              <span
                className="sp-bar"
                data-state={state}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {state !== 'upcoming' && <span className="sp-bar__fill" style={{ width: `${pct}%` }} />}
                <span className="sp-bar__label">{s.title}</span>
                <span className="sp-bar__pct">{pct}%</span>
              </span>
              {showToday && (
                <span className="sp-gantt__today-line" style={{ left: `${todayPct}%` }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Go chip strip ─────────────────────────────────────────────────────────

interface GoStripProps {
  label: string;
  gos: Go[];
  emptyText?: string;
  loose?: boolean;
}
function GoStrip({ label, gos, emptyText, loose }: GoStripProps) {
  if (gos.length === 0 && !emptyText) return null;
  const stateOf = (g: Go) => {
    if (g.is_done_today) return 'done';
    // Defensive — old DB rows can ship null entries; the expression with raw
    // optional chaining would still touch `g.entries.length` inside the
    // bracket and throw before the short-circuit can save us.
    const entries = g.entries ?? [];
    const val = entries.length > 0 ? entries[entries.length - 1].value : 0;
    return val > 0 ? 'active' : 'upcoming';
  };
  return (
    <div className={`sp-gos-strip${loose ? ' sp-gos-strip--loose' : ''}`}>
      <span className="sp-gos-strip__label">
        {label}
        <span className="sp-gos-strip__pill">{gos.length} item{gos.length === 1 ? '' : 's'}</span>
      </span>
      {gos.length === 0 ? (
        <span className="sp-gos-strip__empty">{emptyText}</span>
      ) : (
        gos.map((g) => (
          <span key={g.id} className="sp-go-chip" data-state={stateOf(g)}>
            <span className="sp-go-chip__dot" /> {g.title}
          </span>
        ))
      )}
    </div>
  );
}

// ── Sprint detail (body of selected sprint) ──────────────────────────────

interface DetailProps {
  row: SprintWithProgress;
  goals: Task[];
  expandedGoalId: string | null;
  onToggleGoal: (id: string | null) => void;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
  onEdit: () => void;
  onAddItem: () => void;
  stats: ItemStats;
}
function SprintDetail({
  row, goals, expandedGoalId, onToggleGoal, selectedStepId, onSelectStep, onEdit, onAddItem, stats,
}: DetailProps) {
  const { sprint, daysRemaining, daysTotal, bucket } = row;
  const timeP = timePct(row);
  const items = sprint.items;
  const counts = useMemo(() => {
    const out = { goal: 0, go: 0, routine: 0 };
    for (const it of items) out[it.item_type]++;
    return out;
  }, [items]);

  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);

  const statusLabel = bucket === 'active'
    ? `In progress · day ${daysTotal - daysRemaining} / ${daysTotal}`
    : bucket === 'upcoming' ? 'Upcoming'
    : 'Completed';

  return (
    <section className="sp-detail" data-state={bucket}>
      <header className="sp-detail__head">
        <div className="sp-detail__crumb">Sprint detail</div>
        <div className="sp-detail__title-row">
          <h2 className="sp-detail__title">{sprint.title}</h2>
          <span className={`sp-detail__status sp-detail__status--${bucket}`}>{statusLabel}</span>
          <button type="button" className="sp-detail__edit" onClick={onEdit} title="Edit sprint">
            <Edit3 size={12} /> Edit
          </button>
        </div>
        {sprint.description?.trim() && (
          <p className="sp-detail__sub">{sprint.description}</p>
        )}
        <div className="sp-detail__meta">
          <span><span>Window </span><b className="mono">{fmtFull(sprint.start_date)} → {fmtFull(sprint.end_date)}</b></span>
          {counts.goal > 0 && <span><span>Goals </span><b>{counts.goal}</b></span>}
          {counts.go > 0 && <span><span>Gos </span><b>{counts.go}</b></span>}
          {counts.routine > 0 && <span><span>Routines </span><b>{counts.routine}</b></span>}
        </div>
        {/* Two-line progress block:
              1) Items done — the real "what shipped" signal.
              2) Time elapsed — context for pace ("we're 60% into the window,
                 are we 60% done?"). Hidden for past sprints (always 100% on
                 time) — only the items line stays. */}
        {stats.total > 0 && (
          <div className="sp-detail__progress">
            <span className="sp-detail__progress-text">{stats.done} / {stats.total} items</span>
            <div className="sp-detail__progress-bar" data-kind="items">
              <div className="sp-detail__progress-fill" style={{ width: `${stats.pct}%` }} />
            </div>
            <span className="sp-detail__progress-text">{stats.pct}%</span>
          </div>
        )}
        {bucket !== 'past' && (
          <div className="sp-detail__progress">
            <span className="sp-detail__progress-text">day {daysTotal - daysRemaining} / {daysTotal}</span>
            <div className="sp-detail__progress-bar" data-kind="time">
              <div className="sp-detail__progress-fill sp-detail__progress-fill--time" style={{ width: `${timeP}%` }} />
            </div>
            <span className="sp-detail__progress-text">{timeP}%</span>
          </div>
        )}
      </header>
      <div className="sp-detail__body">
        <div className="sp-detail__body-head">
          <span className="sp-detail__body-label">Sprint items</span>
          <span className="sp-detail__body-rule" />
          <span className="sp-detail__body-count">
            {items.length} total · {counts.goal} goal{counts.goal === 1 ? '' : 's'}
            {expandedGoalId ? ' · 1 expanded' : ''}
          </span>
          <button type="button" className="sp-detail__add" onClick={onAddItem}>
            <Plus size={11} /> Add item
          </button>
        </div>
        {items.length === 0 ? (
          <div className="sp-detail__empty">
            <p style={{ margin: 0 }}>No items in this sprint yet.</p>
            <button type="button" className="sp-detail__add" onClick={onAddItem} style={{ marginTop: 14 }}>
              <Plus size={11} /> Add the first item
            </button>
          </div>
        ) : (
          <ul className="sp-items-grid">
            {items.map((it) => {
              if (it.item_type === 'goal' && it.goal_id) {
                const goal = goalById.get(it.goal_id);
                const isExpanded = expandedGoalId === it.goal_id;
                return (
                  <ItemGoalCard
                    key={it.id}
                    item={it}
                    goal={goal ?? null}
                    expanded={isExpanded}
                    selectedStepId={isExpanded ? selectedStepId : null}
                    onToggle={() => onToggleGoal(isExpanded ? null : it.goal_id!)}
                    onSelectStep={onSelectStep}
                  />
                );
              }
              return <ItemCard key={it.id} item={it} />;
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Item cards ────────────────────────────────────────────────────────────

function ItemCard({ item }: { item: SprintItem }) {
  const Icon = ITEM_ICON[item.item_type];
  return (
    <li className="sp-item" data-kind={item.item_type}>
      <div className="sp-item__head">
        <h4 className="sp-item__title">{item.title || 'Untitled'}</h4>
        <span className="sp-item__kind">
          <Icon size={10} /> {ITEM_KIND_LABEL[item.item_type]}
        </span>
      </div>
    </li>
  );
}

interface GoalCardProps {
  item: SprintItem;
  goal: Task | null;
  expanded: boolean;
  selectedStepId: string | null;
  onToggle: () => void;
  onSelectStep: (id: string | null) => void;
}
function ItemGoalCard({ item, goal, expanded, selectedStepId, onToggle, onSelectStep }: GoalCardProps) {
  const Icon = ITEM_ICON.goal;
  const stepsCount = goal?.steps?.length ?? 0;
  const gos = goal?.gos ?? [];
  const total = gos.length;
  const done = gos.filter((g) => g.is_done_today).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Selected step's Gos (filtered by step_id).
  const stepGos = useMemo(() => {
    if (!selectedStepId) return [];
    return gos.filter((g) => g.step_id === selectedStepId);
  }, [gos, selectedStepId]);
  const looseGos = useMemo(() => gos.filter((g) => !g.step_id), [gos]);
  const selectedStep = useMemo(
    () => goal?.steps?.find((s) => s.id === selectedStepId) ?? null,
    [goal, selectedStepId],
  );

  return (
    <li
      className="sp-item"
      data-kind="goal"
      data-expanded={expanded || undefined}
      style={{ gridColumn: expanded ? '1 / -1' : undefined }}
    >
      <button
        type="button"
        className="sp-item__row"
        onClick={onToggle}
        title={expanded ? 'Collapse' : 'Expand to see Steps + Gos'}
      >
        <div className="sp-item__head">
          <h4 className="sp-item__title">{item.title || goal?.title || 'Untitled goal'}</h4>
          <span className="sp-item__kind">
            <Icon size={10} /> Goal
          </span>
        </div>
        <span className="sp-item__meta">
          {goal
            ? <>{done} / {total} gos · {pct}% · {stepsCount} step{stepsCount === 1 ? '' : 's'}</>
            : 'Goal not found (deleted?)'}
        </span>
        {goal && total > 0 && (
          <div className="sp-item__bar"><div className="sp-item__bar-fill" style={{ width: `${pct}%` }} /></div>
        )}
        {!expanded && goal && stepsCount > 0 && (
          <span className="sp-item__hint">↳ click to expand Step timeline</span>
        )}
      </button>

      {expanded && goal && (
        <div className="sp-step-drill">
          <div className="sp-step-drill__head">
            <span className="sp-step-drill__label">Steps inside this goal</span>
            <span className="sp-step-drill__rule" />
            <span className="sp-step-drill__count">{stepsCount} step{stepsCount === 1 ? '' : 's'}</span>
          </div>
          <StepGantt goal={goal} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
          {selectedStep && (
            <GoStrip
              label={`Gos inside «${selectedStep.title}»`}
              gos={stepGos}
              emptyText="No Gos in this step yet."
            />
          )}
          <GoStrip
            label="Gos without step · direct children of this goal"
            gos={looseGos}
            emptyText="None — every Go is attached to a step."
            loose
          />
        </div>
      )}
    </li>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export default function SprintsView() {
  const library = useSprints();
  const goals = useGoals();
  const gosLib = useGos();
  const routinesLib = useRoutines();
  const f = useSprintsFilters();

  // Lookup maps for item-progress computation.
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goals.tasks) m.set(t.id, t);
    return m;
  }, [goals.tasks]);
  const goById = useMemo(() => {
    const m = new Map<string, Go>();
    for (const g of gosLib.gos) m.set(g.id, g);
    return m;
  }, [gosLib.gos]);
  const routineById = useMemo(() => {
    const m = new Map<string, Routine>();
    for (const r of routinesLib.routines) m.set(r.id, r);
    return m;
  }, [routinesLib.routines]);

  // Precompute item-stats per sprint so both the roadmap and detail share
  // one source of truth (and one pass over the data).
  const itemStatsBy = useMemo(() => {
    const m = new Map<string, ItemStats>();
    for (const d of library.decorated) {
      m.set(d.sprint.id, itemStatsFor(d.sprint, goalById, goById, routineById));
    }
    return m;
  }, [library.decorated, goalById, goById, routineById]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // For the existing edit drawer.
  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const editSprint = useMemo(
    () => library.decorated.find((d) => d.sprint.id === editSprintId) ?? null,
    [library.decorated, editSprintId],
  );

  // Add-item picker dialog (goal / go / routine tabs).
  const [addItemSprintId, setAddItemSprintId] = useState<string | null>(null);
  const addItemSprint = useMemo(
    () => library.decorated.find((d) => d.sprint.id === addItemSprintId)?.sprint ?? null,
    [library.decorated, addItemSprintId],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [templateDays, setTemplateDays] = useState<number | null>(null);

  // ── AI sprint plan ────────────────────────────────────────────────────
  // Two-stage UI: click "AI sprint" opens a tiny popover with day presets,
  // pick a length → POST creates an ai_jobs row → its id seeds the drawer
  // which polls until done. Regenerate inside the drawer creates a new
  // job and swaps the id without unmounting the drawer.
  const [aiPickerOpen, setAiPickerOpen] = useState(false);
  const [aiDays, setAiDays] = useState(14);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  // Register every AI job in the global store so the bottom toast stack +
  // AI tasks sidebar pick it up the same way they pick up quizzes / plan-day.
  const addBgJob = useAIJobsStore((s) => s.add);

  // Re-open the drawer when the user clicks a sprint_plan toast / panel row
  // — same event AIToastStack dispatches for any kind of AI job.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AIJobOpenDetail>).detail;
      if (detail.kind !== 'sprint_plan') return;
      setAiJobId(detail.jobId);
    };
    window.addEventListener(AI_JOB_OPEN_EVENT, handler);
    return () => window.removeEventListener(AI_JOB_OPEN_EVENT, handler);
  }, []);
  const startAiSprint = async () => {
    setAiBusy(true);
    try {
      const job = await aiApi.createSprintPlan({ days: aiDays });
      addBgJob({
        jobId: job.id,
        kind: 'sprint_plan',
        source: { section: 'sprints', noteTitle: `${aiDays}-day plan` },
      });
      setAiJobId(job.id);
      setAiPickerOpen(false);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to start AI sprint plan');
    } finally {
      setAiBusy(false);
    }
  };
  useEffect(() => {
    const handler = (e: Event) => {
      const days = (e as CustomEvent<number>).detail;
      setTemplateDays(typeof days === 'number' && days > 0 ? days : null);
      setCreateOpen(true);
    };
    window.addEventListener('jarvnote:newSprintFromTemplate', handler);
    return () => window.removeEventListener('jarvnote:newSprintFromTemplate', handler);
  }, []);

  const onNewSprint = useCallback(() => setCreateOpen(true), []);

  // Filter sprints by view (all/active/upcoming/past).
  const filtered = useMemo(() => f.apply(library.decorated), [f, library.decorated]);

  // Sort by start_date so the roadmap reads left-to-right chronologically.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.sprint.start_date.localeCompare(b.sprint.start_date)),
    [filtered],
  );

  // Auto-select: prefer the active sprint with the closest end date,
  // otherwise the first row in the filtered list.
  useEffect(() => {
    if (sorted.length === 0) { setSelectedId(null); return; }
    if (selectedId && sorted.find((d) => d.sprint.id === selectedId)) return;
    const activeNext = [...sorted]
      .filter((d) => d.bucket === 'active')
      .sort((a, b) => a.sprint.end_date.localeCompare(b.sprint.end_date))[0];
    setSelectedId((activeNext ?? sorted[0]).sprint.id);
  }, [sorted, selectedId]);

  // Drill-down state resets when the user picks a different sprint.
  useEffect(() => { setExpandedGoalId(null); setSelectedStepId(null); }, [selectedId]);

  const selected = sorted.find((d) => d.sprint.id === selectedId) ?? null;

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Sprints</b>
            <span className="breadcrumb-sep">›</span>
            <span>{VIEW_LABELS[f.filters.view]}</span>
          </div>
          <div className="pill-seg" role="tablist">
            {(['all', 'active', 'upcoming', 'past'] as ViewFilter[]).map((v) => (
              <button
                key={v}
                className={f.filters.view === v ? 'on' : ''}
                role="tab"
                aria-selected={f.filters.view === v}
                onClick={() => f.set('view', v)}
              >{VIEW_LABELS[v]}</button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="sp-ai-btn"
              onClick={() => setAiPickerOpen((o) => !o)}
              title="Generate a sprint from your current goals + tasks"
            >
              <Sparkles size={12} /> AI sprint
            </button>
            {aiPickerOpen && (
              <div className="sp-ai-days" role="dialog" aria-label="Pick sprint length">
                <div className="sp-ai-days__label">Sprint length</div>
                <div className="sp-ai-days__pills">
                  {[7, 14, 21, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`sp-ai-days__pill${aiDays === d ? ' is-on' : ''}`}
                      onClick={() => setAiDays(d)}
                    >{d}d</button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sp-ai-days__go"
                  onClick={startAiSprint}
                  disabled={aiBusy}
                >
                  <Sparkles size={12} /> {aiBusy ? 'Starting…' : `Generate for ${aiDays} days`}
                </button>
              </div>
            )}
          </div>
          <button className="new-btn" onClick={onNewSprint}>
            <Plus /> New sprint
          </button>
        </div>

        <div className="content-scroll">
          <div className="sp-page">
            {sorted.length === 0 ? (
              <div className="content-empty" style={{ minHeight: 240 }}>
                <div className="content-empty-eyebrow">Sprints</div>
                <div className="content-empty-title">
                  Nothing <em>{f.filters.view === 'all' ? 'planned' : VIEW_LABELS[f.filters.view].toLowerCase()}</em>.
                </div>
                <div className="content-empty-desc">
                  Click "New sprint" to plan a focus window.
                </div>
              </div>
            ) : (
              <>
                <div className="sp-h-row">
                  <span className="sp-h-row__label">Roadmap</span>
                  <span className="sp-h-row__rule" />
                  <span className="sp-h-row__meta">
                    <b>{sorted.length}</b> sprint{sorted.length === 1 ? '' : 's'} ·{' '}
                    <b>{library.counts.active}</b> active ·{' '}
                    <b>{library.counts.past}</b> done
                  </span>
                </div>
                <SprintsRoadmap
                  rows={sorted}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  itemStatsBy={itemStatsBy}
                />
                {selected && (
                  <SprintDetail
                    row={selected}
                    goals={goals.tasks}
                    expandedGoalId={expandedGoalId}
                    onToggleGoal={setExpandedGoalId}
                    selectedStepId={selectedStepId}
                    onSelectStep={setSelectedStepId}
                    onEdit={() => setEditSprintId(selected.sprint.id)}
                    onAddItem={() => setAddItemSprintId(selected.sprint.id)}
                    stats={itemStatsBy.get(selected.sprint.id) ?? { done: 0, total: 0, pct: 0 }}
                  />
                )}
              </>
            )}
          </div>
          <div style={{ height: 60 }} />
        </div>
      </main>

      <SprintDetailPanel
        decorated={editSprint}
        library={library}
        open={editSprintId !== null}
        onOpenChange={(o) => { if (!o) setEditSprintId(null); }}
      />

      <SprintCreateDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setTemplateDays(null); }}
        library={library}
        templateDays={templateDays}
      />

      <AddSprintItemDialog
        open={addItemSprintId !== null}
        onOpenChange={(o) => { if (!o) setAddItemSprintId(null); }}
        sprint={addItemSprint}
        library={library}
      />

      <SprintPlanDrawer
        jobId={aiJobId}
        onJobIdChange={setAiJobId}
        onClose={() => setAiJobId(null)}
        library={library}
        days={aiDays}
      />
    </>
  );
}


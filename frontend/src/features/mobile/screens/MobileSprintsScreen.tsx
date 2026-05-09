import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Plus, X } from 'lucide-react';
import type { Go, Routine, Sprint, Step, Task } from '../../../api/types';
import { useSprints, type SprintWithProgress, type SprintsLibrary } from '../../sprints/hooks/useSprints';
import { SprintForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import { MobileBottomSheet } from '../components/MobileBottomSheet';
import { MobilePickerSheet } from '../components/MobilePickerSheet';
import {
  MiniGoalContent, MiniStepContent, MiniGoContent, MiniRoutineContent,
} from '../components/MiniCards';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useSteps } from '../../goals/hooks/useSteps';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtPeriod(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MobileSprintsScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useSprints();
  const goalsLib = useGoals();
  const gosLib = useGos(goalsLib);
  const stepsLib = useSteps(goalsLib);
  const routinesLib = useRoutines();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Sprint | null>(null);
  const [addItemsTo, setAddItemsTo] = useState<Sprint | null>(null);

  const sections = useMemo(() => {
    const active = lib.decorated.filter((d) => d.bucket === 'active')
      .sort((a, b) => a.sprint.end_date.localeCompare(b.sprint.end_date));
    const upcoming = lib.decorated.filter((d) => d.bucket === 'upcoming')
      .sort((a, b) => a.sprint.start_date.localeCompare(b.sprint.start_date));
    const past = lib.decorated.filter((d) => d.bucket === 'past')
      .sort((a, b) => b.sprint.end_date.localeCompare(a.sprint.end_date));
    return { active, upcoming, past: past.slice(0, 5) };
  }, [lib.decorated]);
  const totalCount = sections.active.length + sections.upcoming.length + sections.past.length;

  const subtitle = `${lib.counts.active} active · ${lib.counts.upcoming} in queue`;
  const topBar = (
    <MobileTopBar
      title="Sprints"
      subtitle={subtitle}
      onAvatarClick={onAvatarClick}
    />
  );

  if (lib.loading) {
    return (
      <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell
      topBar={topBar}
      tab={tab}
      onTabChange={onTabChange}
    >
      <button type="button" className="m-add-btn" onClick={() => setCreateOpen(true)}>
        <Plus /> Sprint
      </button>

      {(['active', 'upcoming', 'past'] as const).map((bucket) => {
        const rows = sections[bucket];
        if (rows.length === 0) return null;
        const label = bucket === 'active' ? 'Active'
          : bucket === 'upcoming' ? 'Upcoming' : 'Past';
        return (
          <div key={bucket}>
            <div className="section-bar">
              <span className="sec-title">{label}</span>
              <span className="sec-rule" />
              <span className="sec-meta">{rows.length}</span>
            </div>
            <div className="sd-list">
              {rows.map((row) => (
                <SwipeableRow
                  key={row.sprint.id}
                  onEdit={() => setEditing(row.sprint)}
                  onDelete={() => setConfirmDelete(row.sprint)}
                >
                  <FeaturedSprint
                    row={row}
                    goals={goalsLib.tasks}
                    steps={stepsLib.allSteps}
                    gos={gosLib.gos}
                    routines={routinesLib.routines}
                    onAddItems={() => setAddItemsTo(row.sprint)}
                  />
                </SwipeableRow>
              ))}
            </div>
          </div>
        );
      })}

      {totalCount === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
        }}>
          No sprints yet. Tap + to start one.
        </div>
      )}

      <SprintForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={lib}
        goalsLib={goalsLib}
        gosLib={gosLib}
        stepsLib={stepsLib}
        routinesLib={routinesLib}
      />
      <SprintForm
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        library={lib}
        goalsLib={goalsLib}
        gosLib={gosLib}
        stepsLib={stepsLib}
        routinesLib={routinesLib}
        editing={editing}
      />
      {addItemsTo && (
        <AddItemsToSprintSheet
          sprint={addItemsTo}
          open={!!addItemsTo}
          onOpenChange={(o) => { if (!o) setAddItemsTo(null); }}
          library={lib}
          goalsLib={goalsLib}
          stepsLib={stepsLib}
          gosLib={gosLib}
          routinesLib={routinesLib}
        />
      )}
      <MobileConfirmSheet
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.title ?? ''}"?`}
        description="The sprint will be removed. Linked goals/steps/gos/routines will not be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await lib.remove(confirmDelete.id);
        }}
      />
    </MobileShell>
  );
}

// ── FeaturedSprint — Disc design with hierarchical items list ─────────────
//
// Two SVG rings at the top: outer (indigo) = % time elapsed, inner (gold)
// = % items completed. Center: days-remaining number. Right side: title,
// period, legend.
//
// The sprint's flat `items[]` is reshaped into a tree before rendering so
// children (steps under their parent goal, gos under their parent step/goal,
// routines under their parent goal/step) stay visually subordinate. Items
// whose parent is NOT in this sprint surface at the top level on equal
// footing with goals.

interface SprintTreeNode {
  key: string;
  itemType: 'goal' | 'step' | 'go' | 'routine';
  title: string;
  done: boolean;
  goal?: Task;
  step?: Step;
  go?: Go;
  routine?: Routine;
  children: SprintTreeNode[];
}

function buildSprintTree(
  sprint: Sprint,
  goalsById: Map<string, Task>,
  stepsById: Map<string, Step>,
  gosById:   Map<string, Go>,
  routinesById: Map<string, Routine>,
  today: string,
): { tree: SprintTreeNode[]; total: number; done: number } {
  const goalIds    = new Set<string>();
  const stepIds    = new Set<string>();
  const goIds      = new Set<string>();
  const routineIds = new Set<string>();
  for (const item of sprint.items) {
    if (item.item_type === 'goal'    && item.goal_id)    goalIds.add(item.goal_id);
    if (item.item_type === 'step'    && item.step_id)    stepIds.add(item.step_id);
    if (item.item_type === 'go'      && item.go_id)      goIds.add(item.go_id);
    if (item.item_type === 'routine' && item.routine_id) routineIds.add(item.routine_id);
  }

  // Helpers — produce a fresh SprintTreeNode for each entity type.
  const makeGoalNode = (g: Task): SprintTreeNode => ({
    key: `goal-${g.id}`, itemType: 'goal', title: g.title,
    done: g.is_completed || g.status === 'done', goal: g, children: [],
  });
  const makeStepNode = (s: Step): SprintTreeNode => ({
    key: `step-${s.id}`, itemType: 'step', title: s.title,
    done: s.is_completed, step: s, children: [],
  });
  const makeGoNode = (g: Go): SprintTreeNode => ({
    key: `go-${g.id}`, itemType: 'go', title: g.title,
    done: g.is_done_today, go: g, children: [],
  });
  const makeRoutineNode = (r: Routine): SprintTreeNode => ({
    key: `routine-${r.id}`, itemType: 'routine', title: r.title,
    done: ((r.entries.find((e) => e.date === today)?.value) ?? 0) > 0,
    routine: r, children: [],
  });

  // Build a node and recursively populate children with the entity's full
  // sub-hierarchy. This makes "Show items" always meaningful — even when a
  // goal was added to the sprint without its child steps/gos.
  const buildGoalChildren = (goal: Task): SprintTreeNode[] => {
    const out: SprintTreeNode[] = [];
    for (const step of goal.sprints) {
      const sNode = makeStepNode(step);
      for (const g of step.gos) sNode.children.push(makeGoNode(g));
      out.push(sNode);
    }
    for (const g of goal.gos.filter((x) => !x.sprint_id)) {
      out.push(makeGoNode(g));
    }
    for (const r of routinesById.values()) {
      if (r.goal_id === goal.id && !r.step_id) out.push(makeRoutineNode(r));
    }
    return out;
  };
  const buildStepChildren = (step: Step): SprintTreeNode[] => {
    const out: SprintTreeNode[] = [];
    for (const g of step.gos) out.push(makeGoNode(g));
    for (const r of routinesById.values()) {
      if (r.step_id === step.id) out.push(makeRoutineNode(r));
    }
    return out;
  };

  // Top-level: walk sprint.items in order. For each item:
  //  - goal → top-level, full sub-hierarchy as children
  //  - step → top-level only if its parent goal is NOT in sprint, otherwise
  //    skip (it appears as a child of the goal already)
  //  - go   → top-level only if neither parent step nor parent goal is in sprint
  //  - routine → top-level only if neither parent step nor goal is in sprint
  const tree: SprintTreeNode[] = [];
  const seen = new Set<string>();
  for (const item of sprint.items) {
    if (item.item_type === 'goal' && item.goal_id) {
      const goal = goalsById.get(item.goal_id);
      if (!goal) continue;
      const key = `goal-${goal.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = makeGoalNode(goal);
      node.children = buildGoalChildren(goal);
      tree.push(node);
    } else if (item.item_type === 'step' && item.step_id) {
      const step = stepsById.get(item.step_id);
      if (!step) continue;
      if (step.task_id && goalIds.has(step.task_id)) continue; // nested
      const key = `step-${step.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = makeStepNode(step);
      node.children = buildStepChildren(step);
      tree.push(node);
    } else if (item.item_type === 'go' && item.go_id) {
      const go = gosById.get(item.go_id);
      if (!go) continue;
      if (go.sprint_id && stepIds.has(go.sprint_id)) continue;
      if (go.task_id && goalIds.has(go.task_id)) continue;
      const key = `go-${go.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tree.push(makeGoNode(go));
    } else if (item.item_type === 'routine' && item.routine_id) {
      const r = routinesById.get(item.routine_id);
      if (!r) continue;
      if (r.step_id && stepIds.has(r.step_id)) continue;
      if (r.goal_id && goalIds.has(r.goal_id)) continue;
      const key = `routine-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tree.push(makeRoutineNode(r));
    }
  }

  // Aggregate counts recursively over the whole tree.
  let total = 0, done = 0;
  const visit = (n: SprintTreeNode) => {
    total += 1; if (n.done) done += 1;
    for (const c of n.children) visit(c);
  };
  for (const n of tree) visit(n);

  return { tree, total, done };
}

const TIME_R  = 46;
const ITEMS_R = 34;
const TIME_C  = 2 * Math.PI * TIME_R;
const ITEMS_C = 2 * Math.PI * ITEMS_R;

function FeaturedSprint({ row, goals, steps, gos, routines, onAddItems }: {
  row: SprintWithProgress;
  goals: Task[];
  steps: Step[];
  gos: Go[];
  routines: Routine[];
  onAddItems: () => void;
}) {
  const { sprint, daysRemaining, daysTotal, daysElapsed, progress } = row;
  const today = ymd(new Date());
  const [expanded, setExpanded] = useState(false);

  const { tree, total, done } = useMemo(() => {
    const goalsById    = new Map(goals.map((g) => [g.id, g]));
    const stepsById    = new Map(steps.map((s) => [s.id, s as Step]));
    const gosById      = new Map(gos.map((g) => [g.id, g]));
    const routinesById = new Map(routines.map((r) => [r.id, r]));
    return buildSprintTree(sprint, goalsById, stepsById, gosById, routinesById, today);
  }, [sprint, goals, steps, gos, routines, today]);

  const elapsedPct = Math.round(progress * 100);
  const itemsPct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const timeOffset  = TIME_C  * (1 - elapsedPct / 100);
  const itemsOffset = ITEMS_C * (1 - itemsPct / 100);

  // Pace in days = how many days "ahead" or "behind" pace items completion is.
  // (itemsPct - elapsedPct) / 100 * daysTotal — positive = ahead, negative = behind.
  const paceDays = daysTotal > 0
    ? Math.round(((itemsPct - elapsedPct) / 100) * daysTotal)
    : 0;
  const paceLabel = daysRemaining === 0 ? 'Closed'
    : paceDays >= 1 ? `↗ ${paceDays}d ahead of pace`
    : paceDays <= -1 ? `↘ ${Math.abs(paceDays)}d behind pace`
    : 'On pace';

  const status = daysRemaining === 0 ? 'Closed'
    : paceDays >= -1 ? 'On track'
    : paceDays <= -3 ? 'At risk'
    : 'Closing soon';
  const statusKey = status === 'Closed' ? 'done'
    : status === 'On track' ? 'on'
    : status === 'At risk' ? 'risk'
    : 'up';

  return (
    <article
      className="sprint-disc"
      style={{ ['--gc' as any]: sprint.color || 'var(--indigo)' }}
    >
      {/* Top accent strip — paints the sprint's chosen color across the
          full width so it's the first thing the eye lands on. */}
      <div className="sd-accent" />
      <div className="sd-disc-row">
        <div className="sd-disc-svg-wrap">
          <svg className="sd-disc-svg" viewBox="0 0 100 100" aria-hidden>
            <circle className="sd-ring-bg" cx="50" cy="50" r={TIME_R}  fill="none" strokeWidth="6" />
            <circle className="sd-ring-time" cx="50" cy="50" r={TIME_R} fill="none" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={TIME_C}
                    strokeDashoffset={timeOffset} transform="rotate(-90 50 50)" />
            <circle className="sd-ring-bg" cx="50" cy="50" r={ITEMS_R} fill="none" strokeWidth="6" />
            <circle className="sd-ring-items" cx="50" cy="50" r={ITEMS_R} fill="none" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={ITEMS_C}
                    strokeDashoffset={itemsOffset} transform="rotate(-90 50 50)" />
          </svg>
          <div className="sd-disc-center">
            <div className="sd-disc-num">{daysRemaining}</div>
            <div className="sd-disc-cap">days left</div>
          </div>
        </div>
        <div className="sd-disc-side">
          <div className="sd-pre-title">Sprint</div>
          <h2 className="sd-title">{sprint.title}</h2>
          <div className="sd-period">{fmtPeriod(sprint.start_date, sprint.end_date)}</div>
          <div className="sd-legend">
            <div className="sd-leg">
              <span className="sd-leg-swatch sd-leg-time" />
              <div className="sd-leg-text">
                <span className="sd-leg-lab">Time</span>
                <span className="sd-leg-val">{elapsedPct}%<em>{daysElapsed}/{daysTotal}d</em></span>
              </div>
            </div>
            <div className="sd-leg">
              <span className="sd-leg-swatch sd-leg-items" />
              <div className="sd-leg-text">
                <span className="sd-leg-lab">Done</span>
                <span className="sd-leg-val">{itemsPct}%<em>{done}/{total}</em></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sd-foot">
        <span className={`step-status step-status-${statusKey}`}>{status}</span>
        <span className="sd-pace">{paceLabel}</span>
      </div>

      {sprint.items.length > 0 ? (
        <button
          type="button"
          className="sd-toggle"
          data-open={expanded || undefined}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={14} />
          {expanded
            ? `Hide ${sprint.items.length} item${sprint.items.length === 1 ? '' : 's'}`
            : `Show ${sprint.items.length} item${sprint.items.length === 1 ? '' : 's'}`}
        </button>
      ) : (
        <button
          type="button"
          className="sd-toggle sd-toggle-add"
          onClick={onAddItems}
        >
          <Plus size={14} />
          Add items
        </button>
      )}

      {expanded && (
        tree.length > 0 ? (
          <div className="sd-items-list">
            {tree.map((node) => <SprintNode key={node.key} node={node} />)}
            <button
              type="button"
              className="sd-toggle sd-toggle-add sd-add-inline"
              onClick={onAddItems}
            >
              <Plus size={14} />
              Add item
            </button>
          </div>
        ) : (
          <div style={{
            padding: '14px 12px', marginTop: 12,
            border: '1px dashed var(--hairline-strong)', borderRadius: 10,
            color: 'var(--ink-4)', fontFamily: 'var(--font-body)', fontSize: 13,
            textAlign: 'center',
          }}>
            Loading items…
          </div>
        )
      )}
    </article>
  );
}

function SprintNode({ node }: { node: SprintTreeNode }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const kindLabel = node.itemType === 'goal' ? 'Goal'
    : node.itemType === 'step' ? 'Step'
    : node.itemType === 'go' ? 'Go'
    : 'Routine';

  return (
    <article className={`m-mc m-mc-${node.itemType}`} data-done={node.done || undefined}>
      <span className="m-mc-kind">{kindLabel}</span>
      {node.itemType === 'goal'    && node.goal    && <MiniGoalContent    goal={node.goal} />}
      {node.itemType === 'step'    && node.step    && <MiniStepContent    step={node.step} />}
      {node.itemType === 'go'      && node.go      && <MiniGoContent      go={node.go} />}
      {node.itemType === 'routine' && node.routine && <MiniRoutineContent routine={node.routine} />}

      {hasChildren && (
        <button
          type="button"
          className="m-mc-toggle"
          data-open={open || undefined}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight size={12} />
          {open ? `Hide ${node.children.length} item${node.children.length === 1 ? '' : 's'}`
                : `Show ${node.children.length} item${node.children.length === 1 ? '' : 's'}`}
        </button>
      )}
      {open && hasChildren && (
        <div className="m-mc-children">
          {node.children.map((c) => <SprintNode key={c.key} node={c} />)}
        </div>
      )}
    </article>
  );
}



// ── AddItemsToSprintSheet — focused sheet for attaching existing entities ──
//
// Lives separate from SprintForm so the user can add items to an existing
// sprint without having to wade through title/dates/color fields. Mirrors
// the same picker-per-type flow.

function AddItemsToSprintSheet({
  sprint, open, onOpenChange, library,
  goalsLib, stepsLib, gosLib, routinesLib,
}: {
  sprint: Sprint;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  library: SprintsLibrary;
  goalsLib: ReturnType<typeof useGoals>;
  stepsLib: ReturnType<typeof useSteps>;
  gosLib: ReturnType<typeof useGos>;
  routinesLib: ReturnType<typeof useRoutines>;
}) {
  const [attachGoals, setAttachGoals] = useState<Set<string>>(new Set());
  const [attachSteps, setAttachSteps] = useState<Set<string>>(new Set());
  const [attachGos, setAttachGos] = useState<Set<string>>(new Set());
  const [attachRoutines, setAttachRoutines] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<'goal' | 'step' | 'go' | 'routine' | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset on each open so prior selections don't leak between sprints.
  useEffect(() => {
    if (open) {
      setAttachGoals(new Set());
      setAttachSteps(new Set());
      setAttachGos(new Set());
      setAttachRoutines(new Set());
      setBusy(false);
    }
  }, [open, sprint.id]);

  // Already-in-sprint ids — exclude from the pickers.
  const existing = useMemo(() => {
    const out = { goal: new Set<string>(), step: new Set<string>(), go: new Set<string>(), routine: new Set<string>() };
    for (const it of sprint.items) {
      if (it.item_type === 'goal'    && it.goal_id)    out.goal.add(it.goal_id);
      if (it.item_type === 'step'    && it.step_id)    out.step.add(it.step_id);
      if (it.item_type === 'go'      && it.go_id)      out.go.add(it.go_id);
      if (it.item_type === 'routine' && it.routine_id) out.routine.add(it.routine_id);
    }
    return out;
  }, [sprint.items]);

  const totalSelected = attachGoals.size + attachSteps.size + attachGos.size + attachRoutines.size;

  const submit = async () => {
    if (totalSelected === 0) { onOpenChange(false); return; }
    setBusy(true);
    const tasks: Promise<unknown>[] = [];
    for (const id of attachGoals)    tasks.push(library.addItem(sprint.id, { item_type: 'goal',    goal_id:    id }));
    for (const id of attachSteps)    tasks.push(library.addItem(sprint.id, { item_type: 'step',    step_id:    id }));
    for (const id of attachGos)      tasks.push(library.addItem(sprint.id, { item_type: 'go',      go_id:      id }));
    for (const id of attachRoutines) tasks.push(library.addItem(sprint.id, { item_type: 'routine', routine_id: id }));
    if (tasks.length) await Promise.all(tasks);
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add items"
      description={`To "${sprint.title}"`}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || totalSelected === 0} onClick={submit}>
          {busy ? 'Saving…' : (totalSelected > 0 ? `Add ${totalSelected}` : 'Add')}
        </button>
      </>}
    >
      <div className="m-form" style={{ gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('goal')}>
              <Plus size={14} /> Goal
              {attachGoals.size > 0 && <span className="m-attach-badge">{attachGoals.size}</span>}
            </button>
            <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('step')}>
              <Plus size={14} /> Step
              {attachSteps.size > 0 && <span className="m-attach-badge">{attachSteps.size}</span>}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('go')}>
              <Plus size={14} /> Go
              {attachGos.size > 0 && <span className="m-attach-badge">{attachGos.size}</span>}
            </button>
            <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('routine')}>
              <Plus size={14} /> Routine
              {attachRoutines.size > 0 && <span className="m-attach-badge">{attachRoutines.size}</span>}
            </button>
          </div>
        </div>

        {totalSelected > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {goalsLib.tasks.filter((g) => attachGoals.has(g.id)).map((g) => (
              <span key={g.id} className="m-attach-chip">
                Goal · {g.title}
                <button type="button" className="m-attach-chip-x"
                  onClick={() => setAttachGoals((p) => { const n = new Set(p); n.delete(g.id); return n; })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {stepsLib.allSteps.filter((s) => attachSteps.has(s.id)).map((s) => (
              <span key={s.id} className="m-attach-chip">
                Step · {s.title}
                <button type="button" className="m-attach-chip-x"
                  onClick={() => setAttachSteps((p) => { const n = new Set(p); n.delete(s.id); return n; })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {gosLib.gos.filter((g) => attachGos.has(g.id)).map((g) => (
              <span key={g.id} className="m-attach-chip">
                Go · {g.title}
                <button type="button" className="m-attach-chip-x"
                  onClick={() => setAttachGos((p) => { const n = new Set(p); n.delete(g.id); return n; })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {routinesLib.routines.filter((r) => attachRoutines.has(r.id)).map((r) => (
              <span key={r.id} className="m-attach-chip">
                Routine · {r.title}
                <button type="button" className="m-attach-chip-x"
                  onClick={() => setAttachRoutines((p) => { const n = new Set(p); n.delete(r.id); return n; })}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <MobilePickerSheet
        open={openPicker === 'goal'}
        onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
        title="Pick a goal"
        entity="Goal"
        items={goalsLib.tasks.filter((t) => !existing.goal.has(t.id))}
        initialSelected={attachGoals}
        onConfirm={(s) => setAttachGoals(s)}
        matches={(g, q) => g.title.toLowerCase().includes(q)}
        render={(g) => g.title}
      />
      <MobilePickerSheet
        open={openPicker === 'step'}
        onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
        title="Pick a step"
        entity="Step"
        items={stepsLib.allSteps.filter((s) => !existing.step.has(s.id))}
        initialSelected={attachSteps}
        onConfirm={(s) => setAttachSteps(s)}
        matches={(s, q) => s.title.toLowerCase().includes(q) || (s.goal?.title?.toLowerCase().includes(q) ?? false)}
        render={(s) => (
          <>
            <div style={{ fontWeight: 500 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>from {s.goal.title}</div>
          </>
        )}
      />
      <MobilePickerSheet
        open={openPicker === 'go'}
        onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
        title="Pick a go"
        entity="Go"
        items={gosLib.gos.filter((g) => !existing.go.has(g.id))}
        initialSelected={attachGos}
        onConfirm={(s) => setAttachGos(s)}
        matches={(g, q) => g.title.toLowerCase().includes(q)}
        render={(g) => g.title}
      />
      <MobilePickerSheet
        open={openPicker === 'routine'}
        onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
        title="Pick a routine"
        entity="Routine"
        items={routinesLib.routines.filter((r) => !existing.routine.has(r.id))}
        initialSelected={attachRoutines}
        onConfirm={(s) => setAttachRoutines(s)}
        matches={(r, q) => r.title.toLowerCase().includes(q)}
        render={(r) => r.title}
      />
    </MobileBottomSheet>
  );
}

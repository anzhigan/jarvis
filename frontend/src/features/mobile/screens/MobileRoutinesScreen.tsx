import { useMemo, useState } from 'react';
import { Check, Loader2, MoreHorizontal, X } from 'lucide-react';
import type { Routine, RoutineEntry, Task } from '../../../api/types';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { todayState as routineTodayState } from '../../routines/hooks/useRoutinesToday';
import {
  currentStreak,
  completionRate,
  isScheduledOn,
  scheduleLabel,
  ymd,
} from '../../routines/lib/heatmap';
import { useGoals } from '../../goals/hooks/useGoals';
import { RoutineCreateDialog } from '../../routines/components/RoutineCreateDialog';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

type StatusFilter = 'all' | 'today' | 'slipping' | 'paused';

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentForGoal(t: Task): string {
  if (t.color) return t.color;
  let h = 0;
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

type CellState = 'done' | 'partial' | 'skipped' | 'empty';

function cellStateOf(r: Routine, entry: RoutineEntry | undefined): CellState {
  if (!entry) return 'empty';
  if (entry.value === 0) return 'skipped';
  if (r.kind === 'numeric' && r.target_value && entry.value < r.target_value) return 'partial';
  return 'done';
}

/** Best streak ever — pure helper. */
function bestStreak(r: Routine): number {
  if (r.entries.length === 0) return 0;
  const sorted = [...r.entries].filter((e) => e.value > 0).map((e) => e.date).sort();
  if (sorted.length === 0) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const here = new Date(sorted[i]);
    const diff = Math.round((here.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { cur++; if (cur > best) best = cur; }
    else cur = 1;
  }
  return best;
}

export default function MobileRoutinesScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useRoutines();
  const goalsLib = useGoals();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const todayDate = useMemo(() => new Date(), []);
  const todayKey = ymd(todayDate);

  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goalsLib.tasks) m.set(t.id, t);
    return m;
  }, [goalsLib.tasks]);

  // Bucketed counts for the status pills.
  const counts = useMemo(() => {
    let total = 0, dueToday = 0, slipping = 0, paused = 0;
    for (const r of lib.routines) {
      total++;
      if (r.is_paused) { paused++; continue; }
      if (isScheduledOn(r, todayDate)) dueToday++;
      if (completionRate(r, 30) < 50) slipping++;
    }
    return { total, dueToday, slipping, paused };
  }, [lib.routines, todayDate]);

  const filtered = useMemo(() => {
    return lib.routines.filter((r) => {
      switch (filter) {
        case 'today':    return !r.is_paused && isScheduledOn(r, todayDate);
        case 'slipping': return !r.is_paused && completionRate(r, 30) < 50;
        case 'paused':   return r.is_paused;
        default:         return true;
      }
    });
  }, [lib.routines, filter, todayDate]);

  // Header summary.
  const summary = useMemo(() => {
    let doneToday = 0, scheduledToday = 0, bestEver = 0, sumPct = 0, denom = 0;
    for (const r of lib.routines) {
      const state = routineTodayState(r, todayDate);
      if (state === 'pending' || state === 'done') scheduledToday++;
      if (state === 'done') doneToday++;
      bestEver = Math.max(bestEver, bestStreak(r));
      sumPct += completionRate(r, 30);
      denom++;
    }
    return {
      doneToday,
      scheduledToday,
      bestEver,
      overall: denom === 0 ? 0 : Math.round(sumPct / denom),
    };
  }, [lib.routines, todayDate]);

  const subtitle = lib.routines.length === 0
    ? 'No routines yet'
    : `${summary.doneToday} of ${summary.scheduledToday} done today`;
  const topBar = (
    <MobileTopBar
      title="Routines"
      subtitle={subtitle}
      onAvatarClick={onAvatarClick}
      addLabel="New routine"
      onAdd={() => setCreateOpen(true)}
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
      <div className="rt-summary">
        <div className="rt-sum-cell">
          <div className="rt-sum-num">{summary.doneToday}<em>/{summary.scheduledToday}</em></div>
          <div className="rt-sum-lab">Done today</div>
        </div>
        <div className="rt-sum-cell">
          <div className="rt-sum-num">{summary.bestEver}<em>d</em></div>
          <div className="rt-sum-lab">Best streak</div>
        </div>
        <div className="rt-sum-cell">
          <div className="rt-sum-num">{summary.overall}<em>%</em></div>
          <div className="rt-sum-lab">30d overall</div>
        </div>
      </div>

      <div className="status-pills">
        {([
          { k: 'all' as const,      label: `All · ${counts.total}` },
          { k: 'today' as const,    label: `Due today · ${counts.dueToday}` },
          { k: 'slipping' as const, label: `Slipping · ${counts.slipping}` },
          { k: 'paused' as const,   label: `On hold · ${counts.paused}` },
        ]).map((p) => (
          <button
            key={p.k}
            className={`sp-pill${filter === p.k ? ' sp-pill-active' : ''}`}
            onClick={() => setFilter(p.k)}
          >{p.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
        }}>
          {filter === 'all' ? 'No routines yet. Tap + to create one.' : 'Nothing in this bucket.'}
        </div>
      ) : (
        <div className="rt-list">
          {filtered.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              parent={r.goal_id ? goalById.get(r.goal_id) ?? null : null}
              todayKey={todayKey}
              onCheck={() => { void lib.toggleDoneToday(r); }}
              onSkip={() => { void lib.skipToday(r.id); }}
            />
          ))}
        </div>
      )}

      <RoutineCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={lib}
      />
    </MobileShell>
  );
}

function RoutineCard({
  routine, parent, todayKey, onCheck, onSkip,
}: {
  routine: Routine;
  parent: Task | null;
  todayKey: string;
  onCheck: () => void;
  onSkip: () => void;
}) {
  const r = routine;
  const entryByDate = new Map<string, RoutineEntry>();
  for (const e of r.entries) entryByDate.set(e.date, e);

  // Last 7 days oldest → today.
  const days: { key: string; state: CellState; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const key = ymd(d);
    days.push({ key, state: cellStateOf(r, entryByDate.get(key)), isToday: key === todayKey });
  }

  const todayEntry = entryByDate.get(todayKey);
  const todayCell = cellStateOf(r, todayEntry);
  const streak = currentStreak(r);
  const compRate = completionRate(r, 30);
  const compClass = compRate >= 80 ? 'rt-comp-strong' : compRate < 50 ? 'rt-comp-weak' : '';
  const streakClass = streak >= 7 ? 'rt-streak-strong' : streak === 0 ? 'rt-streak-zero' : '';

  return (
    <article className="routine-card">
      <header className="rc-head">
        <div className="rc-text">
          <h3 className="rc-name">{r.title}</h3>
          <div className="rc-meta">
            <span className="rc-schedule">{scheduleLabel(r)}</span>
            <span className="rc-sep">·</span>
            {parent ? (
              <span className="rt-goal" style={{ ['--gc' as any]: accentForGoal(parent) }}>
                <span className="rt-goal-dot" />{parent.title}
              </span>
            ) : (
              <span className="rt-goal rt-goal-none">standalone</span>
            )}
          </div>
        </div>
        <button className="rc-edit" aria-label="More"><MoreHorizontal /></button>
      </header>

      <div className="rc-history">
        <div className="rc-hist-cells">
          {days.map((d) => (
            <span
              key={d.key}
              className={`rh-cell rh-cell-${d.state}`}
              data-today={d.isToday || undefined}
              title={`${d.key} · ${d.state}`}
            />
          ))}
        </div>
        <div className="rc-hist-stats">
          <span className={`rt-streak ${streakClass}`}>{streak}<em>d</em></span>
          <span className="rc-stat-sep">·</span>
          <span className={`rt-comp ${compClass}`}>{compRate}%</span>
        </div>
      </div>

      <footer className="rc-actions">
        <button
          className="rc-action rc-action-check"
          data-active={todayCell === 'done' || undefined}
          onClick={onCheck}
          aria-label="Mark done"
        >
          <Check size={16} strokeWidth={2.6} />
        </button>
        <button
          className="rc-action rc-action-skip"
          data-active={todayCell === 'skipped' || undefined}
          onClick={onSkip}
          aria-label="Skip"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </footer>
    </article>
  );
}

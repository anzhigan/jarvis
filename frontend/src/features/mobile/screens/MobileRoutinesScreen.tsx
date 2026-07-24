import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
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
import { RoutineForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import { MobileRoutineDetailSheet } from '../components/MobileRoutineDetailSheet';
import { routinesApi } from '../../../api/client';
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
  // null value = the row only carries a note; the day has no status.
  if (!entry || entry.value === null) return 'empty';
  if (entry.value === 0) return 'skipped';
  if (r.kind === 'numeric' && r.target_value && entry.value < r.target_value) return 'partial';
  return 'done';
}

export default function MobileRoutinesScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useRoutines();
  const goalsLib = useGoals();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);
  // Routine detail sheet — opened on tap of a card; tracks the routine id
  // (not the object) so the sheet keeps showing fresh data after a refresh.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRoutine = useMemo(
    () => lib.routines.find((r) => r.id === detailId) ?? null,
    [lib.routines, detailId],
  );

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

  // Header subtitle — "N of M done today" so the user gets the only stat
  // they actually look at without occupying a separate plate below.
  const todayProgress = useMemo(() => {
    let doneToday = 0, scheduledToday = 0;
    for (const r of lib.routines) {
      const state = routineTodayState(r, todayDate);
      if (state === 'pending' || state === 'done') scheduledToday++;
      if (state === 'done') doneToday++;
    }
    return { doneToday, scheduledToday };
  }, [lib.routines, todayDate]);

  const subtitle = lib.routines.length === 0
    ? 'No routines yet'
    : `${todayProgress.doneToday} of ${todayProgress.scheduledToday} done today`;
  const topBar = (
    <MobileTopBar
      title="Routines"
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

      <button type="button" className="m-add-btn" onClick={() => setCreateOpen(true)}>
        <Plus /> Routine
      </button>

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
            <SwipeableRow
              key={r.id}
              onEdit={() => setEditing(r)}
              onDelete={() => setConfirmDelete(r)}
            >
            <RoutineCard
              routine={r}
              parent={r.goal_id ? goalById.get(r.goal_id) ?? null : null}
              todayKey={todayKey}
              onOpenDetail={() => setDetailId(r.id)}
              onCheckDate={async (routine, dateKey) => {
                const cur = routine.entries.find((e) => e.date === dateKey);
                try {
                  if (cur && (cur.value ?? 0) > 0) {
                    // Keep the row (status cleared) when it carries a note.
                    if (cur.note) await routinesApi.upsertEntry(routine.id, dateKey, null);
                    else await routinesApi.deleteEntry(routine.id, dateKey);
                  } else {
                    await routinesApi.upsertEntry(routine.id, dateKey, 1);
                  }
                  await lib.refresh();
                } catch {/* noop — toast handled inside library */}
              }}
              onSkipDate={async (routine, dateKey) => {
                const cur = routine.entries.find((e) => e.date === dateKey);
                try {
                  if (cur && cur.value === 0) {
                    await routinesApi.deleteEntry(routine.id, dateKey);
                  } else {
                    await routinesApi.upsertEntry(routine.id, dateKey, 0);
                  }
                  await lib.refresh();
                } catch {/* noop */}
              }}
            />
            </SwipeableRow>
          ))}
        </div>
      )}

      <RoutineForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={lib}
      />
      <RoutineForm
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        library={lib}
        editing={editing}
      />
      <MobileRoutineDetailSheet
        routine={detailRoutine}
        library={lib}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onEdit={() => {
          // Hand off from detail sheet → edit form. Close detail first so
          // the form slides in cleanly over the empty backdrop, then push
          // the routine into the edit slot.
          if (detailRoutine) {
            setDetailId(null);
            setEditing(detailRoutine);
          }
        }}
        onDelete={() => {
          if (detailRoutine) setConfirmDelete(detailRoutine);
        }}
      />
      <MobileConfirmSheet
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.title ?? ''}"?`}
        description="The routine and all its tracked entries will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await lib.remove(confirmDelete.id);
        }}
      />
    </MobileShell>
  );
}

function RoutineCard({
  routine, parent, todayKey, onCheckDate, onSkipDate, onOpenDetail,
}: {
  routine: Routine;
  parent: Task | null;
  todayKey: string;
  onCheckDate: (routine: Routine, dateKey: string) => void | Promise<void>;
  onSkipDate:  (routine: Routine, dateKey: string) => void | Promise<void>;
  /** Tap on the header (name + meta) opens the detail sheet. Required so
   *  the calendar / trend / rhythm are reachable on mobile — desktop
   *  exposes them via the in-table expand chevron. */
  onOpenDetail: () => void;
}) {
  const r = routine;
  // Selected date for the action buttons. Default = today; tap any cell to
  // pick a different day and re-use the same Done/Skip buttons for it.
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);

  const entryByDate = new Map<string, RoutineEntry>();
  for (const e of r.entries) entryByDate.set(e.date, e);

  // Last 7 days oldest → today.
  const days: { key: string; state: CellState; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const key = ymd(d);
    days.push({ key, state: cellStateOf(r, entryByDate.get(key)), isToday: key === todayKey });
  }

  const selectedEntry = entryByDate.get(selectedKey);
  const selectedCell = cellStateOf(r, selectedEntry);
  const streak = currentStreak(r);
  const compRate = completionRate(r, 30);
  const compClass = compRate >= 80 ? 'rt-comp-strong' : compRate < 50 ? 'rt-comp-weak' : '';
  const streakClass = streak >= 7 ? 'rt-streak-strong' : streak === 0 ? 'rt-streak-zero' : '';

  const selectedDate = new Date(selectedKey);
  const selectedLabel = selectedKey === todayKey
    ? 'Today'
    : selectedDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <article className="routine-card">
      {/* Header is a button — tap opens the detail sheet with calendar /
          trend / rhythm. Day-cells and Done/Skip below have their own
          click handlers; this button only covers the title + meta area
          so it doesn't intercept those. */}
      <button
        type="button"
        className="rc-head rc-head-btn"
        onClick={onOpenDetail}
        aria-label={`Open details for ${r.title}`}
      >
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
      </button>

      <div className="rc-history">
        <div className="rc-hist-cells">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`rh-cell rh-cell-${d.state}`}
              data-today={d.isToday || undefined}
              data-selected={d.key === selectedKey || undefined}
              onClick={() => setSelectedKey(d.key)}
              title={`${d.key} · ${d.state}`}
              aria-label={`${d.key} — ${d.state}`}
            />
          ))}
        </div>
        <div className="rc-hist-stats">
          <span className={`rt-streak ${streakClass}`}>{streak}<em>d</em></span>
          <span className="rc-stat-sep">·</span>
          <span className={`rt-comp ${compClass}`}>{compRate}%</span>
        </div>
      </div>

      <footer className="rc-actions" style={{ alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
          marginRight: 'auto',
        }}>{selectedLabel}</span>
        <button
          className="rc-action rc-action-check"
          data-active={selectedCell === 'done' || undefined}
          onClick={() => { void onCheckDate(r, selectedKey); }}
          aria-label="Mark done"
        >
          <Check size={16} strokeWidth={2.6} />
        </button>
        <button
          className="rc-action rc-action-skip"
          data-active={selectedCell === 'skipped' || undefined}
          onClick={() => { void onSkipDate(r, selectedKey); }}
          aria-label="Skip"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </footer>
    </article>
  );
}

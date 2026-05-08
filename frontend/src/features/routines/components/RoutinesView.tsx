import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, MoreHorizontal, Plus, X } from 'lucide-react';
import type { Routine, RoutineEntry } from '../../../api/types';
import { useRoutines } from '../hooks/useRoutines';
import { useRoutinesToday } from '../hooks/useRoutinesToday';
import { useGoals } from '../../goals/hooks/useGoals';
import {
  completionRate, currentStreak, scheduleLabel, ymd, addDays, isScheduledOn,
} from '../lib/heatmap';
import { todayState } from '../hooks/useRoutinesToday';
import { RoutineDetailPanel } from './RoutineDetailPanel';
import { RoutineCreateDialog } from './RoutineCreateDialog';
import './routines.css';

const HISTORY_DAYS = 14;

type ViewMode = 'grid' | 'list' | 'today';
const MODE_LABELS: Record<ViewMode, string> = { grid: 'Grid', list: 'List', today: 'Today' };

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(seed: string | null | undefined): string {
  if (!seed) return 'var(--ink-4)';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function fmtToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type CellState = 'done' | 'partial' | 'skipped' | 'empty';

function cellState(routine: Routine, entry: RoutineEntry | undefined): CellState {
  if (!entry) return 'empty';
  if (entry.value === 0) return 'skipped';
  if (routine.kind === 'numeric' && routine.target_value && entry.value < routine.target_value) {
    return 'partial';
  }
  return 'done';
}

/** Longest consecutive run of done days across the routine's entry history. */
function bestStreak(routine: Routine): number {
  if (routine.entries.length === 0) return 0;
  const sorted = [...routine.entries]
    .filter((e) => e.value > 0)
    .map((e) => e.date)
    .sort();
  if (sorted.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const here = new Date(sorted[i]);
    const diff = Math.round((here.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { cur++; if (cur > best) best = cur; }
    else cur = 1;
  }
  return best;
}

export default function RoutinesView() {
  const library = useRoutines();
  const today   = useRoutinesToday(library);
  const goalsLib = useGoals();
  const goalById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of goalsLib.tasks) m.set(t.id, t.title);
    return m;
  }, [goalsLib.tasks]);

  const [mode, setMode] = useState<ViewMode>('grid');
  const [detailRoutineId, setDetailRoutineId] = useState<string | null>(null);
  const detailRoutine = useMemo(
    () => library.routines.find((r) => r.id === detailRoutineId) ?? null,
    [library.routines, detailRoutineId],
  );
  const [createOpen, setCreateOpen] = useState(false);

  const onCheck = useCallback((r: Routine) => { void library.toggleDoneToday(r); }, [library]);
  const onSkip  = useCallback((r: Routine) => { void library.skipToday(r.id); }, [library]);
  const onNew   = useCallback(() => setCreateOpen(true), []);

  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // ── 14-day history columns (oldest → today on the right) ──────────────────
  const historyDays = useMemo(() => {
    const out: { date: Date; ymd: string; isToday: boolean }[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const d = addDays(todayDate, -i);
      out.push({ date: d, ymd: ymd(d), isToday: i === 0 });
    }
    return out;
  }, [todayDate]);

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const longestStreakRoutine = library.routines
    .filter((r) => !r.is_paused)
    .reduce<{ routine: Routine | null; streak: number }>(
      (acc, r) => {
        const s = currentStreak(r);
        return s > acc.streak ? { routine: r, streak: s } : acc;
      },
      { routine: null, streak: 0 },
    );
  const overall30 = (() => {
    const arr = library.routines.filter((r) => !r.is_paused);
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((acc, r) => acc + completionRate(r, 30), 0) / arr.length);
  })();

  const totalActive = library.routines.filter((r) => !r.is_paused).length;
  const heroTitle = totalActive === 0
    ? <>No routines yet,<br /><em>blank slate</em>.</>
    : totalActive === 1
      ? <>One practice,<br /><em>at a glance</em>.</>
      : <>{totalActive} practices,<br /><em>at a glance</em>.</>;

  // ── Bottom summary computations ───────────────────────────────────────────
  const scheduleDist = (() => {
    const counts = { daily: 0, weekly_on_days: 0, every_n_days: 0, times_per_week: 0 };
    for (const r of library.routines) counts[r.schedule_type] = (counts[r.schedule_type] ?? 0) + 1;
    const total = Math.max(1, library.routines.length);
    return [
      { key: 'daily',          label: 'Daily',     count: counts.daily,          color: 'var(--indigo)' },
      { key: 'weekly_on_days', label: 'Weekly',    count: counts.weekly_on_days, color: 'var(--moss)'   },
      { key: 'times_per_week', label: 'X / week',  count: counts.times_per_week, color: 'var(--ochre)'  },
      { key: 'every_n_days',   label: 'Every N',   count: counts.every_n_days,   color: 'var(--slate)'  },
    ].map((row) => ({ ...row, ratio: row.count / total }))
     .filter((row) => row.count > 0);
  })();

  const topStreaks = [...library.routines]
    .filter((r) => !r.is_paused)
    .map((r) => ({ routine: r, streak: currentStreak(r) }))
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 4);

  const needsAttention = [...library.routines]
    .filter((r) => !r.is_paused)
    .map((r) => ({ routine: r, rate: completionRate(r, 30) }))
    .filter((row) => row.rate < 60)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 4);

  const hasAnyRoutines = library.routines.length > 0;

  return (
    <>
      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Routines</b>
            <span className="breadcrumb-sep">›</span>
            <span>All practices</span>
          </div>
          <div className="pill-seg" role="tablist">
            {(['grid', 'list', 'today'] as ViewMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
              >{MODE_LABELS[m]}</button>
            ))}
          </div>
          <button className="new-btn" onClick={onNew}>
            <Plus /> New routine
          </button>
        </div>

        <div className="content-scroll">
          {!hasAnyRoutines ? (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Routines</div>
              <div className="content-empty-title">
                A <em>blank</em> ledger.
              </div>
              <div className="content-empty-desc">
                Recurring practices fire on their schedule and stack into streaks.
                Add the first one to get started.
              </div>
            </div>
          ) : mode !== 'grid' ? (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Routines · {MODE_LABELS[mode]}</div>
              <div className="content-empty-title">
                Coming <em>soon</em>.
              </div>
              <div className="content-empty-desc">
                The {MODE_LABELS[mode]} view is planned for a follow-up.
                Grid view is canonical for now.
              </div>
            </div>
          ) : (
            <>
              <header className="rt-header">
                <div className="rt-header-text">
                  <div className="go-eyebrow">{fmtToday()}</div>
                  <h1 className="rt-header-title">{heroTitle}</h1>
                  <p className="rt-header-sub">
                    Each row is one routine. Each cell is a day of the last fortnight.
                    Today's column is on the right.
                  </p>
                </div>
                <div className="rt-header-stats">
                  <div className="rh-cell">
                    <span className="rh-num">{today.doneCount}<em>/{today.scheduledCount}</em></span>
                    <span className="rh-lab">Done today</span>
                  </div>
                  <div className="rh-cell">
                    <span className="rh-num">{today.pendingCount}</span>
                    <span className="rh-lab">Pending</span>
                  </div>
                  <div className="rh-cell">
                    <span className="rh-num">
                      {longestStreakRoutine.streak}<em>d</em>
                    </span>
                    <span className="rh-lab">Longest streak</span>
                    {longestStreakRoutine.routine && (
                      <span className="rh-meta">{longestStreakRoutine.routine.title}</span>
                    )}
                  </div>
                  <div className="rh-cell">
                    <span className="rh-num">{overall30}<em>%</em></span>
                    <span className="rh-lab">30-day overall</span>
                  </div>
                </div>
              </header>

              <div className="rt-table-wrap">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th className="rt-th-name">Routine</th>
                      <th className="rt-th-history">
                        <div className="rt-th-history-inner">
                          <span className="rt-th-history-label">Last {HISTORY_DAYS} days</span>
                          <div className="hg-head">
                            {historyDays.map((d) => (
                              <div
                                key={d.ymd}
                                className={`hg-head-cell${d.isToday ? ' hg-head-today' : ''}`}
                              >
                                <span className="hg-head-wd">{WD[d.date.getDay()]}</span>
                                <span className="hg-head-num">{d.date.getDate()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </th>
                      <th className="rt-th-streak">Streak</th>
                      <th className="rt-th-completion">Completion</th>
                      <th className="rt-th-action">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {library.routines.map((r) => {
                      const entryByDate = new Map<string, RoutineEntry>();
                      for (const e of r.entries) entryByDate.set(e.date, e);
                      const streak = currentStreak(r);
                      const best = bestStreak(r);
                      const rate = completionRate(r, 30);
                      const compClass = rate >= 80 ? 'rt-comp-strong' : rate < 50 ? 'rt-comp-weak' : '';
                      const streakClass = streak >= 7 ? 'rt-streak-strong' : streak === 0 ? 'rt-streak-zero' : '';
                      const state = todayState(r);
                      const linkedGoal = r.goal_id ? goalById.get(r.goal_id) : null;
                      const goalAccent = r.goal_id ? accentFor(r.goal_id) : null;
                      const scheduledToday = !r.is_paused && isScheduledOn(r, todayDate);

                      return (
                        <tr
                          key={r.id}
                          className="rt-row"
                          data-selected={r.id === detailRoutineId || undefined}
                          onClick={() => setDetailRoutineId(r.id)}
                        >
                          <td className="rt-cell-name">
                            <button
                              className="rt-edit-btn"
                              title="Edit routine"
                              onClick={(e) => { e.stopPropagation(); setDetailRoutineId(r.id); }}
                              aria-label="Edit routine"
                            >
                              <MoreHorizontal />
                            </button>
                            <div className="rt-name">{r.title}</div>
                            <div className="rt-name-meta">
                              <span className="rt-schedule">{scheduleLabel(r)}</span>
                              <span className="rt-meta-sep">·</span>
                              {linkedGoal && goalAccent ? (
                                <span className="rt-goal" style={{ ['--gc' as any]: goalAccent }}>
                                  <span className="rt-goal-dot" />
                                  {linkedGoal}
                                </span>
                              ) : (
                                <span className="rt-goal rt-goal-none">standalone</span>
                              )}
                            </div>
                          </td>

                          <td className="rt-cell-history" onClick={(e) => e.stopPropagation()}>
                            <div className="rt-history-grid">
                              {historyDays.map((d) => {
                                const s = cellState(r, entryByDate.get(d.ymd));
                                return (
                                  <span
                                    key={d.ymd}
                                    className={`hg-cell hg-cell-${s}`}
                                    data-today={d.isToday || undefined}
                                    title={`${d.ymd} · ${s}`}
                                  />
                                );
                              })}
                            </div>
                          </td>

                          <td className="rt-cell-streak">
                            <div className={`rt-streak ${streakClass}`}>
                              {streak}<span className="rt-streak-unit">d</span>
                            </div>
                            {best > 0 && <div className="rt-streak-best">best {best}d</div>}
                          </td>

                          <td className="rt-cell-completion">
                            <div className={`rt-comp ${compClass}`}>{rate}%</div>
                            <div className="rt-comp-label">last 30d</div>
                          </td>

                          <td className="rt-cell-action" onClick={(e) => e.stopPropagation()}>
                            {!scheduledToday ? (
                              <div className="rt-actions"><span className="rt-na">—</span></div>
                            ) : (
                              <div className="rt-actions">
                                <button
                                  className="rt-action rt-action-check"
                                  data-active={state === 'done' || undefined}
                                  title="Mark done"
                                  onClick={() => onCheck(r)}
                                  aria-label="Mark done"
                                >
                                  <Check />
                                </button>
                                <button
                                  className="rt-action rt-action-skip"
                                  data-active={state === 'skipped' || undefined}
                                  title="Skip"
                                  onClick={() => onSkip(r)}
                                  aria-label="Skip"
                                >
                                  <X />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rt-summary">
                <div className="rt-summary-card">
                  <h3 className="rt-summary-title">Distribution by schedule</h3>
                  {scheduleDist.length === 0 ? (
                    <div className="ana-card-empty">No routines yet.</div>
                  ) : (
                    <div className="rt-summary-bars">
                      {scheduleDist.map((row) => (
                        <div key={row.key} className="rt-sb-row">
                          <span className="rt-sb-lbl">{row.label}</span>
                          <div className="rt-sb-bar">
                            <div
                              className="rt-sb-bar-fill"
                              style={{ width: `${Math.max(2, row.ratio * 100)}%`, background: row.color }}
                            />
                          </div>
                          <span className="rt-sb-num">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rt-summary-card">
                  <h3 className="rt-summary-title">Top streaks</h3>
                  {topStreaks.length === 0 ? (
                    <div className="ana-card-empty">No active streaks yet.</div>
                  ) : (
                    <div className="rt-summary-list">
                      {topStreaks.map((row, i) => (
                        <div key={row.routine.id} className="rt-sl-row">
                          <span className="rt-sl-rank">{i + 1}</span>
                          <span className="rt-sl-name">{row.routine.title}</span>
                          <span className="rt-sl-num">{row.streak}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rt-summary-card">
                  <h3 className="rt-summary-title">Needs attention</h3>
                  {needsAttention.length === 0 ? (
                    <div className="ana-card-empty">Everything is on track.</div>
                  ) : (
                    <div className="rt-summary-list">
                      {needsAttention.map((row) => (
                        <div key={row.routine.id} className="rt-sl-row">
                          <span className="rt-sl-rank rt-sl-rank-warn">!</span>
                          <span className="rt-sl-name">{row.routine.title}</span>
                          <span className="rt-sl-num rt-sl-num-warn">{row.rate}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ height: 60 }} />
            </>
          )}
        </div>
      </main>

      <RoutineDetailPanel
        routine={detailRoutine}
        library={library}
        open={detailRoutineId !== null}
        onOpenChange={(o) => { if (!o) setDetailRoutineId(null); }}
      />

      <RoutineCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={library}
      />
    </>
  );
}

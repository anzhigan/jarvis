import { Fragment, useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, MoreHorizontal, Plus, X } from 'lucide-react';
import type { Routine, RoutineEntry } from '../../../api/types';
import { useRoutines } from '../hooks/useRoutines';
import { useRoutinesToday } from '../hooks/useRoutinesToday';
import { useGoals } from '../../goals/hooks/useGoals';
import {
  cellState, completionRate, currentStreak, scheduleLabel, ymd, addDays,
  type CellState,
} from '../lib/heatmap';
import { RoutineDetailPanel } from './RoutineDetailPanel';
import { RoutineCreateDialog } from './RoutineCreateDialog';
import { RoutineHistoryHeatmap } from './RoutineHistoryHeatmap';
import { RoutineExpandedDetails } from './RoutineExpandedDetails';
import './routines.css';

const HISTORY_DAYS = 14;

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

/** Longest consecutive run of done days across the routine's entry history. */
function bestStreak(routine: Routine): number {
  if (routine.entries.length === 0) return 0;
  const sorted = [...routine.entries]
    .filter((e) => (e.value ?? 0) > 0)
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

  const [detailRoutineId, setDetailRoutineId] = useState<string | null>(null);
  const detailRoutine = useMemo(
    () => library.routines.find((r) => r.id === detailRoutineId) ?? null,
    [library.routines, detailRoutineId],
  );
  const [createOpen, setCreateOpen] = useState(false);

  // Single highlighted cell across the whole table — selecting a square in
  // one row clears any previous selection elsewhere. `null` means "no past
  // square picked"; action buttons fall back to today's column for that row.
  const [selectedCell, setSelectedCell] = useState<{ id: string; date: string } | null>(null);
  // Draft text for the note panel that opens under a row when one of its
  // history squares is selected. Seeded from the entry's saved note on select.
  const [noteDraft, setNoteDraft] = useState('');

  // Select a history square and open its note panel, seeding the draft with
  // whatever note that day already has. Clicking the active square closes it.
  const selectCell = useCallback((id: string, date: string, note: string) => {
    setSelectedCell((cur) => {
      if (cur?.id === id && cur.date === date) return null;
      setNoteDraft(note);
      return { id, date };
    });
  }, []);

  // Per-row expand state: when a row's id is in this set, an extra <tr>
  // renders below it with the full-period heatmap (weeks × weekdays). The
  // 14-day line in the row stays — it's a quick last-fortnight glance; the
  // expanded grid is the long-history view, two clicks shorter than opening
  // the detail drawer.
  const [expandedHeatmapIds, setExpandedHeatmapIds] = useState<Set<string>>(new Set());
  const toggleExpandHeatmap = useCallback((id: string) => {
    setExpandedHeatmapIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onCheckDate = useCallback((r: Routine, date: string) => {
    void library.toggleDoneOn(r, date);
  }, [library]);
  const onSkipDate = useCallback((id: string, date: string) => {
    void library.skipOn(id, date);
  }, [library]);
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
                      <th className="rt-th-action">Mark</th>
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
                      const linkedGoal = r.goal_id ? goalById.get(r.goal_id) : null;
                      const goalAccent = r.goal_id ? accentFor(r.goal_id) : null;

                      const isExpanded = expandedHeatmapIds.has(r.id);
                      return (
                        <Fragment key={r.id}>
                        <tr
                          className="rt-row"
                          data-selected={r.id === detailRoutineId || undefined}
                          data-expanded={isExpanded || undefined}
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
                            <div className="rt-history-row">
                              <div className="rt-history-grid">
                                {historyDays.map((d) => {
                                  const dayEntry = entryByDate.get(d.ymd);
                                  const s = cellState(r, dayEntry);
                                  const dayNote = dayEntry?.note ?? '';
                                  const active =
                                    selectedCell?.id === r.id && selectedCell.date === d.ymd;
                                  return (
                                    <button
                                      key={d.ymd}
                                      type="button"
                                      className={`hg-cell hg-cell-${s}`}
                                      data-today={d.isToday || undefined}
                                      data-active={active || undefined}
                                      data-hasnote={dayNote !== '' || undefined}
                                      title={dayNote
                                        ? `${d.ymd} · ${s} · ${dayNote}`
                                        : `${d.ymd} · ${s} · click to edit`}
                                      onClick={() => selectCell(r.id, d.ymd, dayNote)}
                                    />
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                className="rt-history-expand"
                                data-open={isExpanded || undefined}
                                onClick={() => toggleExpandHeatmap(r.id)}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Collapse full history' : 'Expand full history'}
                                title={isExpanded ? 'Hide full history' : 'Show full history'}
                              >
                                <ChevronDown size={13} />
                              </button>
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
                            {(() => {
                              // The day the action buttons apply to: clicked
                              // heatmap cell (only if it belongs to THIS row),
                              // otherwise default to today.
                              const activeDate = selectedCell?.id === r.id
                                ? selectedCell.date
                                : historyDays[historyDays.length - 1].ymd;
                              const activeEntry = entryByDate.get(activeDate);
                              const activeState: CellState = cellState(r, activeEntry);
                              const isToday = activeDate === historyDays[historyDays.length - 1].ymd;
                              return (
                                <div className="rt-actions">
                                  <div className="rt-action-date" title="Editing this date">
                                    {isToday ? 'Today' : activeDate.slice(5)}
                                  </div>
                                  <button
                                    className="rt-action rt-action-check"
                                    data-active={activeState === 'done' || undefined}
                                    title="Mark done"
                                    onClick={() => onCheckDate(r, activeDate)}
                                    aria-label="Mark done"
                                  >
                                    <Check />
                                  </button>
                                  <button
                                    className="rt-action rt-action-skip"
                                    data-active={activeState === 'skipped' || undefined}
                                    title="Skip / clear"
                                    onClick={() => onSkipDate(r.id, activeDate)}
                                    aria-label="Skip"
                                  >
                                    <X />
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                        {selectedCell?.id === r.id && (() => {
                          const selDay = historyDays.find((d) => d.ymd === selectedCell.date);
                          const selEntry = entryByDate.get(selectedCell.date);
                          const savedNote = selEntry?.note ?? '';
                          const state = cellState(r, selEntry);
                          const label = selDay
                            ? selDay.date.toLocaleDateString(undefined, {
                                weekday: 'short', day: 'numeric', month: 'short',
                              })
                            : selectedCell.date;
                          return (
                            <tr className="rt-row-note" onClick={(e) => e.stopPropagation()}>
                              <td colSpan={5} className="rt-row-note__cell">
                                <div className="rt-note-panel">
                                  <div className="rt-note-head">
                                    <span className="rt-note-title">
                                      {label}{selDay?.isToday ? ' · Today' : ''} — what did you do?
                                    </span>
                                    <button
                                      className="rt-note-close"
                                      onClick={() => setSelectedCell(null)}
                                      aria-label="Close"
                                      title="Close"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  <textarea
                                    className="rt-note-input"
                                    placeholder="e.g. ran 5km in the park"
                                    value={noteDraft}
                                    rows={2}
                                    autoFocus
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                        void library.saveNoteOn(r, selectedCell.date, noteDraft.trim());
                                        setSelectedCell(null);
                                      }
                                    }}
                                  />
                                  <div className="rt-note-foot">
                                    <span className="rt-note-hint">
                                      {state === 'done' ? 'Marked done'
                                        : state === 'partial' ? 'Partly done'
                                        : state === 'skipped' ? 'Marked skipped'
                                        : 'No status — a note leaves the day as is'}
                                    </span>
                                    <div className="rt-note-foot-actions">
                                      {savedNote && (
                                        <button
                                          className="rt-note-btn rt-note-btn-clear"
                                          onClick={() => {
                                            void library.saveNoteOn(r, selectedCell.date, '');
                                            setNoteDraft('');
                                          }}
                                        >
                                          Clear note
                                        </button>
                                      )}
                                      <button
                                        className="rt-note-btn rt-note-btn-save"
                                        onClick={() => {
                                          void library.saveNoteOn(r, selectedCell.date, noteDraft.trim());
                                          setSelectedCell(null);
                                        }}
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                        {isExpanded && (
                          <tr
                            className="rt-row-expanded"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <td colSpan={5} className="rt-row-expanded__cell">
                              <div className="rt-row-expanded__layout">
                                <RoutineHistoryHeatmap routine={r} heading={null} />
                                <RoutineExpandedDetails routine={r} />
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
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

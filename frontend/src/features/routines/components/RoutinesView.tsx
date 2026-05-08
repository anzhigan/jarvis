import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, PanelLeftOpen, Plus, Repeat, X } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { Routine } from '../../../api/types';
import { useRoutines } from '../hooks/useRoutines';
import { useRoutinesToday } from '../hooks/useRoutinesToday';
import { useRoutinesFilters } from '../hooks/useRoutinesFilters';
import { useGoals } from '../../goals/hooks/useGoals';
import { currentStreak, scheduleLabel } from '../lib/heatmap';
import { RoutinesPane } from './RoutinesPane';
import { RoutineDetailPanel } from './RoutineDetailPanel';
import { RoutineCreateDialog } from './RoutineCreateDialog';
import './routines.css';

const PANE_COLLAPSED_KEY = 'jarvnote:routines:libCollapsed';

type ViewMode = 'today' | 'week' | 'year';
const VIEW_MODES: ViewMode[] = ['today', 'week', 'year'];
const VIEW_LABELS: Record<ViewMode, string> = { today: 'Today', week: 'Week', year: 'Year' };

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(seed: string | null | undefined): string {
  if (!seed) return 'var(--moss)';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function valueLabel(routine: Routine): string | null {
  if (routine.kind !== 'numeric' || !routine.target_value) return null;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayVal = routine.entries.find((e) => e.date === ymd)?.value ?? 0;
  const unit = routine.unit ? ` ${routine.unit}` : '';
  return `${todayVal} / ${routine.target_value}${unit}`;
}

function fmtToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function RoutinesView() {
  const library = useRoutines();
  const today   = useRoutinesToday(library);
  const f       = useRoutinesFilters();
  const goalsLib = useGoals();
  const goalById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of goalsLib.tasks) m.set(t.id, t.title);
    return m;
  }, [goalsLib.tasks]);

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const [mode, setMode] = useState<ViewMode>('today');
  const [detailRoutineId, setDetailRoutineId] = useState<string | null>(null);
  const detailRoutine = useMemo(
    () => library.routines.find((r) => r.id === detailRoutineId) ?? null,
    [library.routines, detailRoutineId],
  );
  const [createOpen, setCreateOpen] = useState(false);

  const onLog  = useCallback((r: Routine) => { void library.toggleDoneToday(r); }, [library]);
  const onSkip = useCallback((r: Routine) => { void library.skipToday(r.id); }, [library]);
  const onNew  = useCallback(() => setCreateOpen(true), []);

  const streaksCount = useMemo(
    () => library.routines.filter((r) => !r.is_paused && currentStreak(r) >= 3).length,
    [library.routines],
  );

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const longestStreak = library.routines.reduce((m, r) => Math.max(m, currentStreak(r)), 0);
  const skippedCount = today.skippedCount;

  // Headline mirrors the Indigo gallery — "N of M checked off".
  const heroTitle = today.scheduledCount === 0
    ? <>Nothing on the <em>schedule</em>.</>
    : today.doneCount === today.scheduledCount
      ? <>All <em>{today.scheduledCount}</em><br />checked off.</>
      : <>{today.doneCount} of {today.scheduledCount}<br />checked off.</>;

  return (
    <>
      <RoutinesPane
        library={library}
        filters={f.filters}
        setFilter={f.set}
        pendingTodayCount={today.scheduledCount}
        streaksCount={streaksCount}
        linkedGoals={goalsLib.tasks}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
      />

      {paneCollapsed && (
        <Tooltip content="Show library" side="right">
          <button
            className="pane-expand-floating"
            onClick={() => setPaneCollapsed(false)}
            aria-label="Show library"
          >
            <PanelLeftOpen />
          </button>
        </Tooltip>
      )}

      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Routines</b>
            <span className="breadcrumb-sep">›</span>
            <span>{VIEW_LABELS[mode]}</span>
          </div>
          <div className="pill-seg" role="tablist">
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
              >{VIEW_LABELS[m]}</button>
            ))}
          </div>
          <button className="new-btn" onClick={onNew}>
            <Plus /> New routine
          </button>
        </div>

        <div className="content-scroll">
          {mode === 'today' && (
            <>
              <header className="go-hero">
                <div className="go-kicker">{fmtToday()}</div>
                <h1 className="go-hero-title">{heroTitle}</h1>
                {today.scheduledCount > 0 && (
                  <p className="go-lede">
                    Tick what's done, set aside what isn't, and let the rest carry into the afternoon.
                  </p>
                )}
              </header>

              <div className="go-progress-strip">
                <div className="ps-cell">
                  <div className="ps-num">{today.doneCount}<em>/{today.scheduledCount}</em></div>
                  <div className="ps-label">Done today</div>
                </div>
                <div className="ps-cell">
                  <div className="ps-num">{today.pendingCount}</div>
                  <div className="ps-label">Pending</div>
                </div>
                <div className="ps-cell">
                  <div className="ps-num">{skippedCount}</div>
                  <div className="ps-label">Set aside</div>
                </div>
                <div className="ps-cell">
                  <div className="ps-num">{longestStreak}<em> {longestStreak === 1 ? 'day' : 'days'}</em></div>
                  <div className="ps-label">Longest streak</div>
                </div>
              </div>

              <div className="section-head">
                <span className="section-title">Today, in order</span>
                <span className="section-rule" />
                <span className="section-meta">Tap ✓ to mark done · ✗ to skip</span>
              </div>

              {today.list.length === 0 ? (
                <div className="content-empty">
                  <div className="content-empty-eyebrow">Routines</div>
                  <div className="content-empty-title">
                    Nothing scheduled <em>today</em>.
                  </div>
                  <div className="content-empty-desc">
                    Routines fire on their schedule — daily, weekly, or every N days.
                    Add one to start a streak.
                  </div>
                </div>
              ) : (
                <div className="go-list">
                  {today.list.map(({ routine, state }) => {
                    const streak = currentStreak(routine);
                    const accent = accentFor(routine.goal_id);
                    const linkedGoal = routine.goal_id ? goalById.get(routine.goal_id) : null;
                    const sched = scheduleLabel(routine);
                    const meta = linkedGoal ? `${sched} · linked to ${linkedGoal}` : sched;
                    const val = valueLabel(routine);
                    return (
                      <article
                        key={routine.id}
                        className="go-row"
                        data-done={state === 'done' || undefined}
                        data-skipped={state === 'skipped' || undefined}
                        style={{ ['--accent' as any]: accent }}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailRoutineId(routine.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setDetailRoutineId(routine.id); }}
                      >
                        <button
                          className="go-check"
                          data-active={state === 'done' || undefined}
                          onClick={(e) => { e.stopPropagation(); onLog(routine); }}
                          aria-label={state === 'done' ? 'Mark not done' : 'Mark done'}
                        >
                          <Check />
                        </button>
                        <div className="go-text">
                          <h3 className="go-target">{routine.title}</h3>
                          <p className="go-meta">
                            <span className="go-goal-sched">{meta}</span>
                            <span className="go-meta-sep">·</span>
                            <span className={`go-streak${streak === 0 ? ' go-streak-zero' : ''}`}>
                              {state === 'skipped'
                                ? 'set aside'
                                : streak === 0
                                  ? 'no streak'
                                  : <><Repeat size={11} style={{ verticalAlign: -2 }} /> {streak}</>}
                            </span>
                            {val && (
                              <>
                                <span className="go-meta-sep">·</span>
                                <span className="go-value">{val}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          className="card-btn-skip"
                          data-active={state === 'skipped' || undefined}
                          title="Skip"
                          onClick={(e) => { e.stopPropagation(); onSkip(routine); }}
                          aria-label="Skip today"
                        >
                          <X />
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === 'week' && (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Routines · Week</div>
              <div className="content-empty-title">
                The week, <em>in seven columns</em>.
              </div>
              <div className="content-empty-desc">
                Weekly grid view is planned for a follow-up. Today view is canonical for now.
              </div>
            </div>
          )}

          {mode === 'year' && (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Routines · Year</div>
              <div className="content-empty-title">
                A <em>year</em> in heatmaps.
              </div>
              <div className="content-empty-desc">
                Year heatmap per routine is coming. The Analytics section already shows
                the all-routines combined heatmap.
              </div>
            </div>
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

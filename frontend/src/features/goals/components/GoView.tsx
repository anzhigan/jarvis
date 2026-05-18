import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Edit3, Minus, Plus, Repeat, Search, X } from 'lucide-react';
import type { Go, Step, Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { goCurrentStreak, groupGosByGoal } from '../hooks/useGos';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import type { GoMode } from './GoalsView';

type DayFilter = 'past' | 'today' | 'future';
const DAY_LABELS: Record<DayFilter, string> = {
  past:   'Past',
  today:  'Today',
  future: 'Future',
};

type PeriodFilter = '7d' | '30d' | '90d' | 'all';
const PERIODS: PeriodFilter[] = ['7d', '30d', '90d', 'all'];
const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '7d':  '7d',
  '30d': '30d',
  '90d': '90d',
  all:   'All',
};
/** Maps a period chip to its day-count window (null = unlimited). */
const PERIOD_DAYS: Record<PeriodFilter, number | null> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
  all:   null,
};

/** Initial cards shown per Past/Future panel. Bumped via "Show older" button. */
const PAGE_SIZE = 20;

interface Props {
  /** Full list of all gos (un-filtered) — GoView applies its own day-bucket filter. */
  gos: Go[];
  goals: Task[];
  /** Page-level scope: focus one goal vs. aggregate across all. */
  mode: GoMode;
  /** Boolean toggle ↔ numeric set: parent decides next value before calling. */
  onLog: (go: Go, nextValue: number) => void;
  /** Skip = log 0; kept as a separate prop so the parent can attach analytics if needed. */
  onSkip: (go: Go) => void;
  /** Open the goal detail panel (3-dot edit). */
  onSelectGoal: (id: string) => void;
  /** Open the "create step" dialog for the focused goal. */
  onAddStep: (taskId: string) => void;
  /** Open the "create go" dialog pre-filled to this goal — and optionally a step. */
  onAddGo: (taskId: string, stepId?: string | null) => void;
  /** Open the edit dialog for a Step. Click on a timeline station triggers this. */
  onEditStep: (step: Step) => void;
  /** Open the edit dialog for a Go. Click on a tg-card body triggers this. */
  onEditGo: (go: Go) => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;

/** Deterministic accent for a given goal id (so colours stay stable across renders). */
function accentFor(goalId: string): string {
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The entry value that matters for this go's display:
 *  past/future gos use their due_date entry; today/no-due use today's. */
function relevantValue(go: Go): number {
  const today = ymd(new Date());
  const date = go.due_date && go.due_date !== today ? go.due_date : today;
  return (go.entries ?? []).find((e) => e.date === date)?.value ?? 0;
}

function fmtToday(): string {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtDue(due: string | null): { label: string; days: number | null } {
  if (!due) return { label: 'no deadline', days: null };
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d = new Date(due);
  const days = Math.round((d.getTime() - t0.getTime()) / 86_400_000);
  const dateLbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { label: dateLbl, days };
}

function goalPct(t: Task): number {
  if (t.status === 'done') return 100;
  return Math.round(t.progress || 0);
}

/** Defensive: works even if `s` is empty/undefined (which TS says can't
 *  happen but old DB rows sometimes do). */
function capitalize(s: string): string {
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

/** Was the go's target met on the given date? Pulled from its entries. */
function isDoneOnDate(go: Go, dateStr: string): boolean {
  const e = go.entries.find((x) => x.date === dateStr);
  if (!e || e.value <= 0) return false;
  if (go.kind === 'boolean') return true;
  return go.target_value !== null ? e.value >= go.target_value : e.value > 0;
}

interface DayGroup {
  date: string;
  label: string;
  gos: Go[];
  done: number;
  miss: number;
}

/** Group gos by due_date and return an ordered list of day groups.
 *  direction='past'   → descending (newest → oldest)
 *  direction='future' → ascending  (soonest → latest) */
function groupByDay(gos: Go[], direction: 'past' | 'future'): DayGroup[] {
  const map = new Map<string, Go[]>();
  for (const g of gos) {
    if (!g.due_date) continue;
    if (!map.has(g.due_date)) map.set(g.due_date, []);
    map.get(g.due_date)!.push(g);
  }
  const entries = Array.from(map.entries()).sort(([a], [b]) =>
    direction === 'past' ? b.localeCompare(a) : a.localeCompare(b),
  );
  return entries.map(([date, ds]) => {
    const done = ds.filter((g) => isDoneOnDate(g, date)).length;
    const dt = new Date(date + 'T00:00:00');
    const label = dt.toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    return { date, label, gos: ds, done, miss: ds.length - done };
  });
}

/** Relative-day decorator: yesterday/tomorrow/today suffix on a date. */
function relativeLabel(dateStr: string): string | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0)  return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1)  return 'tomorrow';
  if (diff === -2) return '2 days ago';
  if (diff === 2)  return 'in 2 days';
  return null;
}

export function GoView({
  gos: allGos,
  goals,
  mode,
  onLog,
  onSkip,
  onSelectGoal,
  onAddStep,
  onAddGo,
  onEditStep,
  onEditGo,
}: Props) {
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  // null = "all goals" — only meaningful in cross-goal mode.
  const [goalsFilter, setGoalsFilter] = useState<Set<string> | null>(null);
  const [shownLimit, setShownLimit] = useState<number>(PAGE_SIZE);
  // Sidebar search — filters the activeGoals list by title (case-insensitive).
  const [sidebarSearch, setSidebarSearch] = useState('');
  // Sidebar priority + tag filters (multi-select).
  const [sidebarPriority, setSidebarPriority] = useState<Set<TaskPriority>>(new Set());
  const [sidebarTags, setSidebarTags] = useState<Set<string>>(new Set());

  // Day-bucket filter: past / today / future, derived from a Go's window —
  //   today bucket: today ∈ [start_date, end_date]  OR
  //                 due_date === today              OR
  //                 (no start/due dates set — daily-check / standalone gos)
  //   past bucket:   due_date or end_date strictly before today
  //   future bucket: start_date or due_date strictly after today
  // We intentionally don't pull "is_done_today=true" gos into Today — that
  // used to leak past gos into Today after their late-completion click.
  const dayFiltered = useMemo(() => {
    const today = ymd(new Date());
    return allGos.filter((g) => {
      const from = g.start_date;
      const to   = g.due_date;
      // Multi-day Gos belong to "today" while today is inside their window —
      // earlier code only matched due_date === today, which dropped any Go
      // whose period spanned today.
      const inWindow = !!from && !!to && from <= today && to >= today;
      if (dayFilter === 'past') {
        // Strictly past: either no start_date and due_date in the past, or
        // a window that closed before today.
        if (from) return !!to && to < today;
        return !!to && to < today;
      }
      if (dayFilter === 'future') {
        if (from) return from > today;
        return !!to && to > today;
      }
      // today bucket
      return inWindow
        || (!from && !!to && to === today)
        || (!from && !to);
    });
  }, [allGos, dayFilter]);

  // Period filter (7d / 30d / 90d / all) — narrows the past/future window.
  // Today bucket ignores period (it's already a single-day window).
  const periodFiltered = useMemo(() => {
    if (dayFilter === 'today') return dayFiltered;
    const days = PERIOD_DAYS[periodFilter];
    if (days == null) return dayFiltered;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const earliest = new Date(today); earliest.setDate(earliest.getDate() - days);
    const latest   = new Date(today); latest.setDate(latest.getDate()   + days);
    const earliestStr = ymd(earliest);
    const latestStr   = ymd(latest);
    return dayFiltered.filter((g) => {
      if (!g.due_date) return false;
      if (dayFilter === 'past')   return g.due_date >= earliestStr;
      if (dayFilter === 'future') return g.due_date <= latestStr;
      return true;
    });
  }, [dayFiltered, dayFilter, periodFilter]);

  // Goals subset filter (cross-goal only). null/empty Set = include everyone.
  const gos = useMemo(() => {
    if (mode !== 'cross-goal' || !goalsFilter || goalsFilter.size === 0) {
      return periodFiltered;
    }
    return periodFiltered.filter((g) => g.task_id && goalsFilter.has(g.task_id));
  }, [periodFiltered, mode, goalsFilter]);

  // Reset paging whenever any filter changes.
  useEffect(() => { setShownLimit(PAGE_SIZE); }, [dayFilter, periodFilter, goalsFilter, mode]);

  const grouped = useMemo(() => groupGosByGoal(gos), [gos]);
  // Sidebar pool: groups computed off the FULL un-bucketed list. This way the
  // sidebar stays stable when the user toggles Past/Today/Future and they can
  // always pick a goal — even one that has nothing scheduled today.
  const groupedAll = useMemo(() => groupGosByGoal(allGos), [allGos]);
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goals) m.set(t.id, t);
    return m;
  }, [goals]);

  // Goals visible in the sidebar — any goal that has at least one go (filter
  // out empty stubs). Status is no longer filtered here; we group by status
  // inside the sidebar below so user can see backlog / on hold / done too.
  const eligibleGoals = useMemo(
    () => goals
      .filter((t) => (groupedAll.get(t.id)?.length ?? 0) > 0)
      .sort((a, b) => a.order - b.order),
    [goals, groupedAll],
  );
  // Back-compat alias — focused-goal logic below depends on a non-archived
  // shortlist for default-selection and stats; keep the same semantics.
  const activeGoals = useMemo(
    () => eligibleGoals.filter((t) => t.status !== 'done'),
    [eligibleGoals],
  );

  // Tag pool — unique tags present on all eligible goals (sidebar tag filter).
  const sidebarTagPool = useMemo<Tag[]>(() => {
    const seen = new Map<string, Tag>();
    for (const t of eligibleGoals) for (const tag of t.tags) seen.set(tag.id, tag);
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [eligibleGoals]);

  // Sidebar list filtered by search + priority + tags (any status).
  const visibleGoals = useMemo(() => {
    let list = eligibleGoals;
    const q = sidebarSearch.trim().toLowerCase();
    if (q) list = list.filter((g) => g.title.toLowerCase().includes(q));
    if (sidebarPriority.size > 0) {
      list = list.filter((g) => sidebarPriority.has(g.priority));
    }
    if (sidebarTags.size > 0) {
      list = list.filter((g) => g.tags.some((tg) => sidebarTags.has(tg.id)));
    }
    return list;
  }, [eligibleGoals, sidebarSearch, sidebarPriority, sidebarTags]);

  // Group sidebar list by status — used to render collapsible sections.
  const groupedByStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { active: [], backlog: [], paused: [], done: [] };
    for (const g of visibleGoals) out[g.status].push(g);
    return out;
  }, [visibleGoals]);

  /** Which sidebar status sections are open. Active expanded by default,
   *  others collapsed so the page doesn't feel busy. */
  const [openStatus, setOpenStatus] = useState<Record<TaskStatus, boolean>>({
    active: true, backlog: false, paused: false, done: false,
  });
  const toggleStatus = (s: TaskStatus) => setOpenStatus((cur) => ({ ...cur, [s]: !cur[s] }));

  const togglePriority = (p: TaskPriority) => setSidebarPriority((cur) => {
    const next = new Set(cur);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
  const toggleTag = (id: string) => setSidebarTags((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const anyFilter = sidebarPriority.size > 0 || sidebarTags.size > 0 || sidebarSearch.trim().length > 0;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the first active goal but honour a user-clicked done goal —
  // sanity check against the full eligibleGoals (incl. done) so clicking a
  // 100%-complete goal doesn't bounce the selection away (which used to
  // cause a brief render → effect-reselect cycle that could blank the view).
  useEffect(() => {
    if (eligibleGoals.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !eligibleGoals.find((g) => g.id === selectedId)) {
      const fallback = activeGoals[0]?.id ?? eligibleGoals[0].id;
      setSelectedId(fallback);
    }
  }, [eligibleGoals, activeGoals, selectedId]);

  // Selected Step inside the focused goal — drives the timeline highlight
  // and filters tg-cards to that step's gos. Reset whenever the goal changes.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  useEffect(() => { setSelectedStepId(null); }, [selectedId]);

  // Per-bucket counts for the page-tabs badges — mode-aware:
  //   single-goal → only the focused goal's gos
  //   cross-goal  → all gos
  const dayCounts = useMemo(() => {
    const source = mode === 'single-goal'
      ? allGos.filter((g) => g.task_id === selectedId)
      : allGos;
    const today = ymd(new Date());
    let past = 0, todayN = 0, future = 0;
    for (const g of source) {
      const from = g.start_date;
      const to   = g.due_date;
      // Same window logic as `dayFiltered` — keep counts in sync with the
      // actual list, so a multi-day Go covering today is counted in Today.
      const inWindow = !!from && !!to && from <= today && to >= today;
      if (inWindow) { todayN++; continue; }
      if (from) {
        if (from > today) future++;
        else if (to && to < today) past++;
        else todayN++;
      } else if (to) {
        if (to < today) past++;
        else if (to > today) future++;
        else todayN++;
      } else {
        todayN++;
      }
    }
    return { past, today: todayN, future };
  }, [allGos, mode, selectedId]);

  const totals = useMemo(() => {
    const done = gos.filter((g) => g.is_done_today).length;
    const total = gos.length;
    const pending = total - done;
    const goalsWithDoneToday = new Set(
      gos.filter((g) => g.is_done_today && g.task_id).map((g) => g.task_id!),
    ).size;
    return { done, total, pending, advancingGoals: goalsWithDoneToday, totalGoals: activeGoals.length };
  }, [gos, activeGoals.length]);

  if (allGos.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-eyebrow">Go · today</div>
        <div className="content-empty-title">
          Nothing <em>scheduled</em> today.
        </div>
        <div className="content-empty-desc">
          Set daily targets on your active goals to see them here.
        </div>
      </div>
    );
  }

  const pageTabs = (
    <div className="go-section-tabs">
      <div className="goal-section-head">
        <h2 className="goal-section-title">Gos</h2>
        <span className="goal-section-rule" />
        <div className="pill-seg pill-seg-secondary" role="tablist" aria-label="Time bucket">
          {(['past', 'today', 'future'] as DayFilter[]).map((k) => (
            <button
              key={k}
              className={dayFilter === k ? 'on' : ''}
              role="tab"
              aria-selected={dayFilter === k}
              onClick={() => setDayFilter(k)}
            >
              {DAY_LABELS[k]}
              <span className="pill-seg-count">{dayCounts[k]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const heroTitle = totals.total === 0
    ? <>Nothing scheduled<br />for today.</>
    : totals.done === 0
      ? <>Nothing done yet,<br /><em>{totals.total}</em> waiting.</>
      : totals.done === totals.total
        ? <>All <em>{totals.total}</em>,<br />knocked out.</>
        : <><em>{totals.done} of {totals.total}</em>,<br />on the board.</>;

  return (
    <div className="go-shell" data-mode={mode}>
      <aside className="go-leftpane">
        <header className="go-leftpane-head">
          <div className="go-eyebrow">{fmtToday()}</div>
          <h2 className="go-leftpane-title">{heroTitle}</h2>
          <p className="go-leftpane-sub">
            {totals.advancingGoals} of {activeGoals.length} active {activeGoals.length === 1 ? 'goal' : 'goals'} already advanced today.
          </p>
        </header>

        <div className="go-leftpane-stats">
          <div className="lps-cell">
            <span className="lps-num">{totals.done}</span>
            <span className="lps-lab">Done</span>
          </div>
          <div className="lps-cell">
            <span className="lps-num">{totals.pending}</span>
            <span className="lps-lab">Pending</span>
          </div>
          <div className="lps-cell">
            <span className="lps-num">{totals.advancingGoals}/{activeGoals.length}</span>
            <span className="lps-lab">Goals</span>
          </div>
        </div>

        <div className="go-leftpane-search">
          <Search size={12} aria-hidden />
          <input
            type="search"
            className="go-leftpane-search__input"
            placeholder="Search goals…"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
          {sidebarSearch && (
            <button
              type="button"
              className="go-leftpane-search__clear"
              aria-label="Clear search"
              onClick={() => setSidebarSearch('')}
            ><X size={11} /></button>
          )}
        </div>

        <div className="go-leftpane-filters">
          <div className="go-leftpane-filter">
            <span className="go-leftpane-filter__label">Priority</span>
            <div className="go-leftpane-chip-group">
              {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => {
                const on = sidebarPriority.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="go-leftpane-chip"
                    aria-pressed={on}
                    data-prio={p}
                    onClick={() => togglePriority(p)}
                  >
                    <span className="go-leftpane-chip__dot" />
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          {sidebarTagPool.length > 0 && (
            <div className="go-leftpane-filter">
              <span className="go-leftpane-filter__label">Tags</span>
              <div className="go-leftpane-chip-group">
                {sidebarTagPool.map((tag) => {
                  const on = sidebarTags.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className="go-leftpane-chip"
                      aria-pressed={on}
                      onClick={() => toggleTag(tag.id)}
                    >
                      <span className="go-leftpane-chip__dot" style={{ background: tag.color }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {anyFilter && (
            <button
              type="button"
              className="go-leftpane-filters__clear"
              onClick={() => { setSidebarSearch(''); setSidebarPriority(new Set()); setSidebarTags(new Set()); }}
            >Clear all</button>
          )}
        </div>

        <div className="go-leftpane-groups">
          {visibleGoals.length === 0 && (sidebarSearch.trim() || sidebarPriority.size + sidebarTags.size > 0) && (
            <div className="gl-list-empty">No goals match filters.</div>
          )}
          {(['active', 'backlog', 'paused', 'done'] as TaskStatus[]).map((status) => {
            const groupGoals = groupedByStatus[status];
            // Render a status group only if it has at least one goal or it's
            // "active" (always present for orientation, even when empty).
            if (groupGoals.length === 0 && status !== 'active') return null;
            const isOpen = openStatus[status];
            const label = status === 'paused' ? 'On hold' : capitalize(status);
            return (
              <section key={status} className="go-leftpane-group" data-status={status}>
                <button
                  type="button"
                  className="go-leftpane-group__head"
                  onClick={() => toggleStatus(status)}
                  aria-expanded={isOpen}
                >
                  <ChevronRight size={12} className={`go-leftpane-group__chevron${isOpen ? ' on' : ''}`} />
                  <span className="go-leftpane-group__label">{label}</span>
                  <span className="go-list-rule" />
                  <span className="go-list-meta">{groupGoals.length}</span>
                </button>
                {isOpen && (
                  <div className="gl-list">
                    {groupGoals.length === 0 && status === 'active' && (
                      <div className="gl-list-empty">No active goals yet.</div>
                    )}
                    {groupGoals.map((goal) => {
                      const items = grouped.get(goal.id) ?? [];
                      const todayDone = items.filter((g) => g.is_done_today).length;
                      const todayTotal = items.length;
                      const accent = accentFor(goal.id);
                      const pct = goalPct(goal);
                      const due = fmtDue(goal.due_date);
                      const maxStreak = items.reduce((m, g) => Math.max(m, goCurrentStreak(g)), 0);

                      const todayCls = todayTotal === 0
                        ? 'gl-card-today-none'
                        : todayDone === 0
                          ? 'gl-card-today-pending'
                          : todayDone < todayTotal
                            ? 'gl-card-today-mid'
                            : 'gl-card-today-done';
                      const todayTxt = todayTotal === 0
                        ? 'no targets today'
                        : todayDone === 0
                          ? `${todayTotal} pending today`
                          : todayDone < todayTotal
                            ? `${todayDone}/${todayTotal} today`
                            : 'all done today';

                      return (
                        <button
                          key={goal.id}
                          className="gl-card"
                          data-selected={goal.id === selectedId || undefined}
                          style={{ ['--gc' as any]: accent }}
                          onClick={() => setSelectedId(goal.id)}
                        >
                          <div className="gl-card-bar">
                            <div className="gl-card-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="gl-card-text">
                            <div className="gl-card-row1">
                              <h3 className="gl-card-title">{goal.title}</h3>
                              <span className="gl-card-pct">{pct}%</span>
                            </div>
                            {goal.description && (
                              <p className="gl-card-desc">{goal.description}</p>
                            )}
                            <div className="gl-card-meta">
                              <span className={`gl-card-today ${todayCls}`}>{todayTxt}</span>
                              {maxStreak > 0 && (
                                <span className="gl-card-streak">↻ {maxStreak}d</span>
                              )}
                              <span className={`gl-card-due${due.days === null ? ' gl-card-due-none' : ''}`}>
                                {due.days === null
                                  ? 'no deadline'
                                  : due.days < 0
                                    ? `${due.label} · overdue`
                                    : `due ${due.label} · ${due.days}d`}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </aside>

      <section className="go-rightpane">
        <div className="content-scroll">
          {mode === 'single-goal' ? (
            <>
              {selectedId && goalById.has(selectedId) ? (
                <ErrorBoundary key={selectedId} label="Goal view">
                  <FocusedGoal
                    goal={goalById.get(selectedId)!}
                    gos={groupedAll.get(selectedId) ?? []}
                    selectedStepId={selectedStepId}
                    onSelectStep={setSelectedStepId}
                    onLog={onLog}
                    onSkip={onSkip}
                    onEditGoal={() => onSelectGoal(selectedId)}
                    onAddStep={onAddStep}
                    onAddGo={onAddGo}
                    onEditStep={onEditStep}
                    onEditGo={onEditGo}
                  />
                </ErrorBoundary>
              ) : (
                <div className="content-empty" style={{ minHeight: 320 }}>
                  <div className="content-empty-eyebrow">No goal selected</div>
                  <div className="content-empty-title">
                    Pick a goal <em>on the left</em>.
                  </div>
                </div>
              )}
            </>
          ) : (
            <CrossGoalView
              gos={gos}
              goals={goals}
              activeGoalsCount={activeGoals.length}
              dayFilter={dayFilter}
              dayCounts={dayCounts}
              periodFilter={periodFilter}
              onPeriodFilter={setPeriodFilter}
              goalsFilter={goalsFilter}
              onGoalsFilter={setGoalsFilter}
              shownLimit={shownLimit}
              onLoadMore={() => setShownLimit((n) => n + PAGE_SIZE)}
              pageTabs={pageTabs}
              onLog={onLog}
              onSkip={onSkip}
              onEditGo={onEditGo}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Right pane: selected goal + today's targets + recent days ────────────── */

interface FocusedProps {
  goal: Task;
  gos: Go[];
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
  onEditGoal: () => void;
  onAddStep: (taskId: string) => void;
  onAddGo: (taskId: string, stepId?: string | null) => void;
  onEditStep: (step: Step) => void;
  onEditGo: (go: Go) => void;
}

function FocusedGoal({
  goal,
  gos: allGoalGos,
  selectedStepId,
  onSelectStep,
  onLog,
  onSkip,
  onEditGoal,
  onAddStep,
  onAddGo,
  onEditStep,
  onEditGo,
}: FocusedProps) {
  const accent = accentFor(goal.id);
  const pct = goalPct(goal);

  // Collapsible goal description (line-clamp + … expand, mirrors tg-card desc).
  const [goalDescExpanded, setGoalDescExpanded] = useState(false);
  const [goalDescTruncated, setGoalDescTruncated] = useState(false);
  const goalDescRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (goalDescExpanded) return;
    const el = goalDescRef.current;
    if (!el) { setGoalDescTruncated(false); return; }
    setGoalDescTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [goal.description, goalDescExpanded]);
  const due = fmtDue(goal.due_date);

  const steps = goal.steps ?? [];
  const stepById = useMemo(() => {
    const m = new Map<string, Step>();
    for (const s of steps) m.set(s.id, s);
    return m;
  }, [steps]);

  // Gos without a step — direct children of the Goal. Step-attached Gos
  // live in the Step detail panel above; this section is just for the
  // leftovers (one-off tasks, ad-hoc daily checks).
  const looseGos = useMemo(
    () => allGoalGos.filter((g) => !g.step_id),
    [allGoalGos],
  );

  const todayDone = allGoalGos.filter((g) => g.is_done_today).length;
  const maxStreak = allGoalGos.reduce((m, g) => Math.max(m, goCurrentStreak(g)), 0);

  // Recent days: aggregate completion fraction per day across ALL the goal's
  // gos (with-step + loose) — this is the goal's overall daily rhythm.
  const recentDays = useMemo(() => {
    const out: { date: Date; done: number; total: number }[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = ymd(d);
      let done = 0;
      for (const g of allGoalGos) {
        const e = (g.entries ?? []).find((x) => x.date === k);
        const targetMet = g.kind === 'numeric'
          ? (g.target_value && (e?.value ?? 0) >= g.target_value) || (e?.value ?? 0) > 0
          : (e?.value ?? 0) > 0;
        if (targetMet) done++;
      }
      out.push({ date: d, done, total: allGoalGos.length });
    }
    return out;
  }, [allGoalGos]);

  return (
    <>
      <header className="goal-ctx" style={{ ['--gc' as any]: accent }}>
        <div className="goal-ctx-tag-row">
          <div className="goal-ctx-meta-pills">
            {/* Defensive defaults — old DB rows can have null priority/tags
                that TS thinks is required; rendering blindly used to throw
                and white-screened the view. */}
            <span className="goal-ctx-status" data-status={goal.status || 'backlog'}>
              {goal.status === 'paused'
                ? 'On hold'
                : capitalize(goal.status || 'backlog')}
            </span>
            <span className="goal-ctx-prio" data-prio={goal.priority || 'medium'}>
              <span className="goal-ctx-prio__dot" />
              {capitalize(goal.priority || 'medium')}
            </span>
            {(goal.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                className="goal-ctx-tag-chip"
                style={{ ['--tag-color' as any]: tag.color }}
              >
                <span className="goal-ctx-tag-chip__dot" />
                {tag.name}
              </span>
            ))}
          </div>
          <button className="goal-ctx-edit" title="Edit goal" onClick={onEditGoal}>
            <Edit3 size={12} />
          </button>
        </div>
        <div className="goal-ctx-head">
          <div className="goal-ctx-text">
            <h1 className="goal-ctx-title">{goal.title}</h1>
            {goal.description?.trim() && (
              <div className={`goal-ctx-desc-block${goalDescExpanded ? ' goal-ctx-desc-block--expanded' : ''}`}>
                <p ref={goalDescRef} className="goal-ctx-desc">{goal.description}</p>
                {!goalDescExpanded && goalDescTruncated && (
                  <button
                    type="button"
                    className="goal-ctx-desc__more"
                    aria-label="Show full description"
                    onClick={() => setGoalDescExpanded(true)}
                  >…</button>
                )}
                {goalDescExpanded && goalDescTruncated && (
                  <button
                    type="button"
                    className="goal-ctx-desc__less"
                    onClick={() => setGoalDescExpanded(false)}
                  >Show less</button>
                )}
              </div>
            )}
          </div>
          <div className="goal-ctx-pct">
            <div className="goal-ctx-pct-num">{pct}<em>%</em></div>
            <div className="goal-ctx-pct-lab">Complete</div>
          </div>
        </div>

        <div className="goal-ctx-bar">
          <div className="goal-ctx-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="goal-ctx-meta">
          <div className="gcm-cell">
            <span className="gcm-num">{todayDone}<em>/{allGoalGos.length}</em></span>
            <span className="gcm-lab">Today's targets</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">{maxStreak}<em> {maxStreak === 1 ? 'day' : 'days'}</em></span>
            <span className="gcm-lab">Current streak</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">
              {due.days === null
                ? '—'
                : <>{Math.abs(due.days)}<em> {due.days < 0 ? 'over' : 'days'}</em></>}
            </span>
            <span className="gcm-lab">{due.days !== null && due.days < 0 ? 'Overdue' : 'Until deadline'}</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">{due.days === null ? '—' : due.label}</span>
            <span className="gcm-lab">Due date</span>
          </div>
        </div>
      </header>

      <StepsGantt
        goal={goal}
        steps={steps}
        selectedStepId={selectedStepId}
        onSelect={onSelectStep}
        onAddStep={() => onAddStep(goal.id)}
        onAddGo={() => onAddGo(goal.id, selectedStepId)}
        onEditStep={onEditStep}
      />

      {selectedStepId && stepById.get(selectedStepId) && (
        <StepDetail
          step={stepById.get(selectedStepId)!}
          gos={allGoalGos.filter((g) => g.step_id === selectedStepId)}
          goalTitle={goal.title}
          goalAccent={accent}
          onLog={onLog}
          onSkip={onSkip}
          onEditGo={onEditGo}
          onEditStep={onEditStep}
          onAddGo={() => onAddGo(goal.id, selectedStepId)}
        />
      )}

      <div className="goal-section-head" style={{ marginTop: 28 }}>
        <h2 className="goal-section-title">Gos without step</h2>
        <span className="goal-section-rule" />
        <span className="goal-section-meta">
          {looseGos.length === 0
            ? 'none — all Gos are attached to a step'
            : <><b>{looseGos.length}</b> {looseGos.length === 1 ? 'item' : 'items'} · direct children of this goal</>}
        </span>
      </div>

      {looseGos.length === 0 ? (
        <div className="tg-cards-empty">
          Nothing here — every Go is attached to a step. Add one from a step row above.
        </div>
      ) : (
        <div className="tg-cards">
          {looseGos.map((go) => (
            <TgCard
              key={go.id}
              go={go}
              parentTitle={goal.title}
              goalAccent={accent}
              step={null}
              onLog={onLog}
              onSkip={onSkip}
              onEdit={onEditGo}
            />
          ))}
        </div>
      )}

      <div className="goal-section-head" style={{ marginTop: 36 }}>
        <h2 className="goal-section-title">Recent days</h2>
        <span className="goal-section-rule" />
        <span className="goal-section-meta">last 6 days · daily completion summary</span>
      </div>

      <div className="rl-list">
        {recentDays.map(({ date, done, total }) => {
          const dateLbl = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
          const cls = total === 0 || done === 0 ? '' : done === total ? 'rl-rate-full' : 'rl-rate-partial';
          return (
            <div className="rl-row" key={dateLbl}>
              <span className="rl-date">{dateLbl}</span>
              <span className={`rl-rate ${cls}`}>{done}/{total}</span>
              <span className="rl-note">
                {total === 0 ? '—' : done === total ? 'all targets hit' : done === 0 ? 'no progress logged' : `${done} of ${total} hit`}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 60 }} />
    </>
  );
}

/* ── Cross-goal view: flat list of gos across all active goals ───────────── */

interface CrossGoalProps {
  gos: Go[];
  goals: Task[];
  activeGoalsCount: number;
  dayFilter: DayFilter;
  dayCounts: Record<DayFilter, number>;
  periodFilter: PeriodFilter;
  onPeriodFilter: (p: PeriodFilter) => void;
  goalsFilter: Set<string> | null;
  onGoalsFilter: (s: Set<string> | null) => void;
  shownLimit: number;
  onLoadMore: () => void;
  pageTabs: ReactNode;
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
  onEditGo: (go: Go) => void;
}

function CrossGoalView({
  gos,
  goals,
  activeGoalsCount,
  dayFilter,
  dayCounts,
  periodFilter,
  onPeriodFilter,
  goalsFilter,
  onGoalsFilter,
  shownLimit,
  onLoadMore,
  pageTabs,
  onLog,
  onSkip,
  onEditGo,
}: CrossGoalProps) {
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goals) m.set(t.id, t);
    return m;
  }, [goals]);

  // Flat stepById across all goals — used to render tg-step-crumb.
  const stepById = useMemo(() => {
    const m = new Map<string, Step>();
    for (const g of goals) for (const s of (g.steps ?? [])) m.set(s.id, s);
    return m;
  }, [goals]);

  // Sort: pending today first, then by due date ascending, with goal title as tiebreaker.
  const sorted = useMemo(() => {
    return [...gos].sort((a, b) => {
      if (dayFilter === 'today') {
        const ap = a.is_done_today ? 1 : 0;
        const bp = b.is_done_today ? 1 : 0;
        if (ap !== bp) return ap - bp;
      }
      const ad = a.due_date ?? '';
      const bd = b.due_date ?? '';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.title ?? '').localeCompare(b.title ?? '');
    });
  }, [gos, dayFilter]);

  return (
    <>
      <header className="cross-goal-banner">
        <div className="cgb-tag-row">
          <span className="cgb-tag">Cross-goal view</span>
        </div>
        <h1 className="cgb-title">All goals · gos timeline</h1>
        <p className="cgb-sub">
          Aggregated past, current &amp; upcoming gos across every active goal.
        </p>
        <div className="cgb-meta">
          <div className="cgb-meta__cell">
            <span className="cgb-meta__num">{activeGoalsCount}</span>
            <span className="cgb-meta__lab">Active goals</span>
          </div>
          <div className="cgb-meta__cell">
            <span className="cgb-meta__num">{dayCounts.today}</span>
            <span className="cgb-meta__lab">Gos today</span>
          </div>
          <div className="cgb-meta__cell">
            <span className="cgb-meta__num">{dayCounts.past}</span>
            <span className="cgb-meta__lab">Past</span>
          </div>
          <div className="cgb-meta__cell">
            <span className="cgb-meta__num">{dayCounts.future}</span>
            <span className="cgb-meta__lab">Upcoming</span>
          </div>
        </div>
      </header>

      {pageTabs}

      <FilterBar
        dayFilter={dayFilter}
        periodFilter={periodFilter}
        onPeriodFilter={onPeriodFilter}
        totalCount={sorted.length}
        showGoals
        goals={goals}
        goalsFilter={goalsFilter}
        onGoalsFilter={onGoalsFilter}
      />

      {sorted.length === 0 ? (
        <div className="tg-cards-empty">
          {dayFilter === 'past'
            ? 'No past gos to show.'
            : dayFilter === 'future'
              ? 'No upcoming gos scheduled.'
              : 'Nothing scheduled across any goal today.'}
        </div>
      ) : dayFilter === 'today' ? (
        <div className="tg-cards">
          {sorted.map((go) => {
            const parent = go.task_id ? goalById.get(go.task_id) : null;
            return (
              <TgCard
                key={go.id}
                go={go}
                parentTitle={parent?.title ?? 'Standalone'}
                goalAccent={parent ? accentFor(parent.id) : 'var(--ink-4)'}
                step={go.step_id ? stepById.get(go.step_id) ?? null : null}
                onLog={onLog}
                onSkip={onSkip}
                onEdit={onEditGo}
              />
            );
          })}
        </div>
      ) : (
        <DayGroupedCards
          gos={sorted}
          direction={dayFilter}
          shownLimit={shownLimit}
          onLoadMore={onLoadMore}
          renderCard={(go) => {
            const parent = go.task_id ? goalById.get(go.task_id) : null;
            return (
              <TgCard
                key={go.id}
                go={go}
                parentTitle={parent?.title ?? 'Standalone'}
                goalAccent={parent ? accentFor(parent.id) : 'var(--ink-4)'}
                step={go.step_id ? stepById.get(go.step_id) ?? null : null}
                onLog={onLog}
                onSkip={onSkip}
                onEdit={onEditGo}
              />
            );
          }}
        />
      )}

      <div style={{ height: 60 }} />
    </>
  );
}

/* ── Single target card (inline value capture for numeric, big toggle for boolean) ── */

interface TgProps {
  go: Go;
  parentTitle: string;
  /** Accent (CSS var or color) for this go's goal — drives the cross-goal crumb dot. */
  goalAccent: string;
  /** Step the go belongs to (if any) — drives the tg-step-crumb pill in single-goal mode. */
  step?: Step | null;
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
  /** Clicking the card body (not the action buttons) opens an edit dialog. */
  onEdit: (go: Go) => void;
}

function TgCard({ go, parentTitle, goalAccent, step, onLog, onSkip, onEdit }: TgProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncated, setDescTruncated] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  // Detect whether the description overflows the 2-line clamp so we only
  // render the "…" expand button when there's actually hidden content.
  // Important: skip the check while expanded — once the clamp is removed,
  // scrollHeight equals clientHeight and we'd lose the truncated flag,
  // making the "Show less" affordance disappear.
  useEffect(() => {
    if (descExpanded) return;
    const el = descRef.current;
    if (!el) { setDescTruncated(false); return; }
    setDescTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [go.description, descExpanded]);
  const stepCrumb = step ? (
    <span className="tg-step-crumb">
      <span className="tg-step-crumb__num">{String(step.position + 1).padStart(2, '0')}</span>
      {step.title}
    </span>
  ) : null;
  const value = relevantValue(go);
  const target = go.target_value ?? 1;
  const targetMet = go.kind === 'numeric'
    ? (go.target_value !== null && value >= go.target_value)
    : value > 0;
  const partial = !targetMet && value > 0;
  const pct = go.kind === 'numeric' && go.target_value
    ? Math.min(100, Math.round((value / go.target_value) * 100))
    : (value > 0 ? 100 : 0);

  // Increment for numeric stepper: 1 for integer targets, 0.1 for fractional.
  const stepSize = go.target_value !== null && Number.isInteger(go.target_value) ? 1 : 0.1;
  const round = (n: number) => Math.round(n * 10) / 10;

  // Bail out of card-click → edit when click originated on an action button.
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onEdit(go);
  };

  // Kind pill removed — the goal-crumb already conveys context, and the goal's
  // accent color is now applied to the card itself (border-left + crumb dot).
  const kindRow = (
    <div className="tg-kind-row">
      <span className="tg-goal-crumb" style={{ ['--gc' as any]: goalAccent }}>
        <span className="tg-goal-crumb__dot" />
        {parentTitle}
      </span>
      {stepCrumb}
    </div>
  );

  const descBlock = go.description?.trim() ? (
    <div className={`tg-card-desc${descExpanded ? ' tg-card-desc--expanded' : ''}`}>
      <p ref={descRef} className="tg-card-desc__text">{go.description}</p>
      {!descExpanded && descTruncated && (
        <button
          type="button"
          className="tg-card-desc__more"
          aria-label="Show full description"
          onClick={(e) => { e.stopPropagation(); setDescExpanded(true); }}
        >…</button>
      )}
      {descExpanded && descTruncated && (
        <button
          type="button"
          className="tg-card-desc__less"
          aria-label="Collapse description"
          onClick={(e) => { e.stopPropagation(); setDescExpanded(false); }}
        >Show less</button>
      )}
    </div>
  ) : null;

  // Date row — shown when either start or due is set. "Mar 12 → Apr 02"
  // for a window, "Due Apr 02" for due-only, "From Mar 12" for start-only.
  const fmtShort = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const datesBlock = (go.start_date || go.due_date) ? (
    <div className="tg-card-dates">
      {go.start_date && go.due_date ? (
        <>
          <span>{fmtShort(go.start_date)}</span>
          <span className="tg-card-dates__sep">→</span>
          <span>{fmtShort(go.due_date)}</span>
        </>
      ) : go.due_date ? (
        <span>Due {fmtShort(go.due_date)}</span>
      ) : (
        <span>From {fmtShort(go.start_date!)}</span>
      )}
    </div>
  ) : null;

  if (go.kind === 'boolean') {
    return (
      <article
        className="tg-card"
        data-kind="boolean"
        data-done={targetMet || undefined}
        style={{ ['--gc' as any]: goalAccent }}
        onClick={handleCardClick}
      >
        <header className="tg-card-head">
          <div className="tg-card-text">
            {kindRow}
            <h3 className="tg-card-title">{go.title}</h3>
            {datesBlock}
            {descBlock}
          </div>
        </header>

        <div className="tg-bool-block">
          <button
            className={`tg-bool-btn${targetMet ? ' tg-bool-btn-done' : ''}`}
            onClick={(e) => { e.stopPropagation(); onLog(go, targetMet ? 0 : 1); }}
          >
            <Check size={14} /> <span>{targetMet ? 'Done' : 'Mark as done'}</span>
          </button>
          <button
            className="tg-skip-btn"
            title="Delete go"
            onClick={(e) => { e.stopPropagation(); onSkip(go); }}
            aria-label="Delete go"
          >
            <X size={12} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="tg-card"
      data-kind="numeric"
      data-done={targetMet || undefined}
      data-partial={partial || undefined}
      style={{ ['--gc' as any]: goalAccent }}
      onClick={handleCardClick}
    >
      <header className="tg-card-head">
        <div className="tg-card-text">
          {kindRow}
          <h3 className="tg-card-title">{go.title}</h3>
          {datesBlock}
          {descBlock}
        </div>
      </header>

      <div className="tg-numeric-block">
        <div className="tg-num-display">
          <span className="tg-num-logged">{round(value)}</span>
          <span className="tg-num-divider">/</span>
          <span className="tg-num-target">{round(target)}</span>
          {go.unit && <span className="tg-num-unit">{go.unit}</span>}
        </div>
        <div className="tg-stepper">
          <button
            className="tg-step-btn"
            title="Decrease"
            onClick={(e) => { e.stopPropagation(); onLog(go, Math.max(0, round(value - stepSize))); }}
            aria-label="Decrease"
          >
            <Minus size={13} />
          </button>
          <button
            className="tg-step-btn"
            title="Increase"
            onClick={(e) => { e.stopPropagation(); onLog(go, round(value + stepSize)); }}
            aria-label="Increase"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div className="tg-progress-row">
        <div className="tg-progress-bar">
          <div className="tg-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="tg-progress-pct">{pct}%</span>
      </div>

      <footer className="tg-card-foot">
        <span className={`tg-status tg-status-${targetMet ? 'done' : partial ? 'partial' : 'pending'}`}>
          {targetMet
            ? <><Check size={12} /> Logged</>
            : partial
              ? <><Repeat size={12} /> In progress · {pct}%</>
              : 'Pending'}
        </span>
      </footer>
    </article>
  );
}

/* ── StepsGantt: horizontal bar layout of milestones (Gantt-style) ───── */

interface StepsGanttProps {
  goal: Task;
  steps: Step[];
  selectedStepId: string | null;
  onSelect: (stepId: string | null) => void;
  onAddStep: () => void;
  onAddGo: () => void;
  onEditStep: (step: Step) => void;
}

/** Pick a sensible date range for the Gantt axis from goal + step dates.
 *  Falls back to "today ± 6 weeks" when nothing is set so the axis is never
 *  empty. Returns a `[start, end]` pair plus a flag whether we have real
 *  data (controls today-line rendering). */
function ganttRange(goal: Task, steps: Step[]): { start: Date; end: Date; hasDates: boolean } {
  const ms: number[] = [];
  const push = (s: string | null) => { if (s) { const t = Date.parse(s); if (!isNaN(t)) ms.push(t); } };
  push(goal.start_date);
  push(goal.due_date);
  for (const st of steps) { push(st.start_date); push(st.end_date); }
  if (ms.length < 2) {
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate() - 14);
    const end = new Date(today); end.setDate(end.getDate() + 70);
    return { start, end, hasDates: false };
  }
  let start = new Date(Math.min(...ms));
  let end = new Date(Math.max(...ms));
  // 4% padding on each side so first/last bars don't touch the edges
  const span = end.getTime() - start.getTime();
  const pad = Math.max(span * 0.04, 24 * 60 * 60 * 1000);
  start = new Date(start.getTime() - pad);
  end = new Date(end.getTime() + pad);
  return { start, end, hasDates: true };
}

function fmtTick(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function StepsGantt({
  goal,
  steps,
  selectedStepId,
  onSelect,
  onAddStep,
  onAddGo,
  onEditStep,
}: StepsGanttProps) {
  const sorted = useMemo(
    () => [...steps].sort((a, b) => a.position - b.position),
    [steps],
  );
  const N = sorted.length;

  if (N === 0) {
    return (
      <section className="steps">
        <div className="steps-head">
          <span className="steps-head__label">Steps</span>
          <span className="steps-head__rule" />
          <span className="steps-head__meta">no milestones yet</span>
        </div>
        <div className="steps-empty">
          <p className="steps-empty__hint">
            Break this goal into milestones. Each step holds its own Gos.
          </p>
          <div className="steps-empty__actions">
            <button type="button" className="steps-empty__btn primary" onClick={onAddStep}>
              <Plus size={13} /> Add first step
            </button>
            <button type="button" className="steps-empty__btn" onClick={onAddGo}>
              <Plus size={13} /> Add go
            </button>
          </div>
        </div>
      </section>
    );
  }

  const doneCount = sorted.filter((s) => s.status === 'done').length;
  const activeIdx = sorted.findIndex((s) => s.status === 'in_progress');

  // ── Calendar axis ───────────────────────────────────────────────────
  const range = useMemo(() => ganttRange(goal, sorted), [goal, sorted]);
  const rangeMs = range.end.getTime() - range.start.getTime();
  // 6 evenly-spaced date ticks across the header.
  const ticks = useMemo(() => {
    const COUNT = 6;
    const out: { pct: number; date: Date }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const pct = (i / (COUNT - 1)) * 100;
      out.push({ pct, date: new Date(range.start.getTime() + rangeMs * (pct / 100)) });
    }
    return out;
  }, [range.start, rangeMs]);
  // Today line position — only show if today falls inside the visible window.
  const todayPct = ((Date.now() - range.start.getTime()) / rangeMs) * 100;
  const showToday = range.hasDates && todayPct >= 0 && todayPct <= 100;

  // Bar coords for a step: use real dates when available, else fall back to
  // even spacing (i/N to (i+1)/N) so partial-date data still renders sanely.
  const barCoords = (s: Step, i: number): { left: number; width: number } => {
    if (s.start_date && s.end_date) {
      const st = Date.parse(s.start_date);
      const en = Date.parse(s.end_date);
      if (!isNaN(st) && !isNaN(en) && en >= st) {
        const left = ((st - range.start.getTime()) / rangeMs) * 100;
        const width = Math.max(((en - st) / rangeMs) * 100, 1.5);
        return { left, width };
      }
    }
    return { left: (i / N) * 100, width: (1 / N) * 100 };
  };

  return (
    <section className="steps">
      <div className="steps-head">
        <span className="steps-head__label">Steps</span>
        <span className="steps-head__rule" />
        <span className="steps-head__meta">
          <b>{N}</b> {N === 1 ? 'step' : 'steps'} · <b>{doneCount}</b> done
          {activeIdx >= 0 && <> · current is <b>{String(activeIdx + 1).padStart(2, '0')}</b></>}
        </span>
        <div className="steps-head__actions">
          <button type="button" className="steps-head__btn" onClick={onAddStep} title="Add step">
            <Plus size={11} /> Step
          </button>
          <button type="button" className="steps-head__btn" onClick={onAddGo} title="Add go">
            <Plus size={11} /> Go
          </button>
        </div>
      </div>

      <div className="gantt">
        <div className="gantt__corner" />
        <div className="gantt__axis">
          {ticks.map((t, i) => (
            <span key={i} className="gantt__tick" style={{ left: `${t.pct}%` }}>
              {fmtTick(t.date)}
            </span>
          ))}
          {showToday && (
            <>
              <span className="gantt__today-pill" style={{ left: `${todayPct}%` }}>Today</span>
              <span className="gantt__today-line" style={{ left: `${todayPct}%` }} />
            </>
          )}
        </div>
        <div className="gantt__rows-side">
          {sorted.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="gantt-row-side"
              data-selected={s.id === selectedStepId || undefined}
              title={`Open Gos of "${s.title}" — ⌘/Ctrl+click to edit step`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) onEditStep(s);
                else onSelect(s.id === selectedStepId ? null : s.id);
              }}
            >
              <span className="gantt-row-side__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="gantt-row-side__title">{s.title}</span>
              <span className="gantt-row-side__count">{s.gos_done} / {s.gos_count}</span>
            </button>
          ))}
        </div>
        <div className="gantt__rows-bars">
          {sorted.map((s, i) => {
            const state = s.status === 'done'
              ? 'done'
              : s.status === 'in_progress' ? 'active' : 'upcoming';
            const { left, width } = barCoords(s, i);
            const pct = s.gos_count > 0
              ? Math.round((s.gos_done / s.gos_count) * 100)
              : (state === 'done' ? 100 : 0);
            // Mini Go dots — up to 8 to keep the row tidy.
            const dotStates: string[] = [];
            for (let d = 0; d < Math.min(s.gos_count, 8); d++) {
              if (d < s.gos_done) dotStates.push('done');
              else if (state === 'active' && d === s.gos_done) dotStates.push('active');
              else dotStates.push('upcoming');
            }
            return (
              <button
                key={s.id}
                type="button"
                className="gantt-row-bar"
                data-selected={s.id === selectedStepId || undefined}
                title={`Open Gos of "${s.title}"`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) onEditStep(s);
                  else onSelect(s.id === selectedStepId ? null : s.id);
                }}
              >
                <span
                  className="gantt-bar"
                  data-state={state}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {state !== 'upcoming' && (
                    <span className="gantt-bar__fill" style={{ width: `${pct}%` }} />
                  )}
                  <span className="gantt-bar__label">{s.title}</span>
                  <span className="gantt-bar__pct">{pct}%</span>
                </span>
                {dotStates.length > 0 && (
                  <span className="gantt-row-bar__gos">
                    {dotStates.map((ds, di) => (
                      <span key={di} className={`gantt-go-dot ${ds}`} />
                    ))}
                  </span>
                )}
                {showToday && (
                  <span className="gantt__today-line" style={{ left: `${todayPct}%` }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="gantt__hint">
        Click a row to open its Gos below — ⌘/Ctrl+click to edit the step.
      </p>
    </section>
  );
}

/* ── StepDetail: focused-step panel with 2-col Go cards ──────────────── */

interface StepDetailProps {
  step: Step;
  gos: Go[];
  goalTitle: string;
  goalAccent: string;
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
  onEditGo: (go: Go) => void;
  onEditStep: (step: Step) => void;
  onAddGo: () => void;
}

function StepDetail({
  step, gos, goalTitle, goalAccent,
  onLog, onSkip, onEditGo, onEditStep, onAddGo,
}: StepDetailProps) {
  const state = step.status === 'done'
    ? 'done'
    : step.status === 'in_progress' ? 'active' : 'upcoming';
  const statusLabel = state === 'done'
    ? 'done'
    : state === 'active' ? 'in progress' : 'upcoming';
  const pct = step.gos_count > 0
    ? Math.round((step.gos_done / step.gos_count) * 100)
    : (state === 'done' ? 100 : 0);
  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : '—';

  return (
    <section className="step-detail" data-state={state}>
      <header className="step-detail__head">
        <div className="step-detail__crumb"><span>Step detail</span></div>
        <div className="step-detail__title-row">
          <span className="step-detail__num">{String(step.position + 1).padStart(2, '0')}</span>
          <h2 className="step-detail__title">{step.title}</h2>
          <span className={`step-detail__status ${state}`}>{statusLabel}</span>
          <button
            type="button"
            className="steps-head__btn"
            onClick={() => onEditStep(step)}
            title="Edit step"
            style={{ marginLeft: 'auto' }}
          >
            Edit step
          </button>
        </div>
        {step.description?.trim() && (
          <p className="step-detail__sub">{step.description}</p>
        )}
        <div className="step-detail__meta">
          <span><span>Start </span><b className="mono">{fmt(step.start_date)}</b></span>
          <span><span>Due </span><b className="mono">{fmt(step.end_date)}</b></span>
          {step.completed_at && (
            <span><span>Completed </span><b className="mono">{fmt(step.completed_at)}</b></span>
          )}
        </div>
        <div className="step-detail__progress">
          <span className="step-detail__progress-text">{step.gos_done} / {step.gos_count}</span>
          <div className="step-detail__progress-bar">
            <div className="step-detail__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="step-detail__progress-text">{pct}%</span>
        </div>
      </header>

      <div className="step-detail__body">
        <div className="step-detail__body-head">
          <span className="step-detail__body-label">Gos in this step</span>
          <span className="step-detail__body-rule" />
          <span className="step-detail__body-count">
            {gos.length} {gos.length === 1 ? 'item' : 'items'} · {step.gos_done} done
          </span>
          <button type="button" className="step-detail__body-add" onClick={onAddGo}>
            + Add Go
          </button>
        </div>
        {gos.length === 0 ? (
          <div className="step-detail__empty">No Gos in this step yet.</div>
        ) : (
          <div className="step-detail__grid">
            {gos.map((go) => (
              <TgCard
                key={go.id}
                go={go}
                parentTitle={goalTitle}
                goalAccent={goalAccent}
                step={null}
                onLog={onLog}
                onSkip={onSkip}
                onEdit={onEditGo}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── FilterBar: Period chips, optional Goals chip-group, count ─────────── */

interface FilterBarProps {
  dayFilter: DayFilter;
  periodFilter: PeriodFilter;
  onPeriodFilter: (p: PeriodFilter) => void;
  totalCount: number;
  showGoals?: boolean;
  goals?: Task[];
  goalsFilter?: Set<string> | null;
  onGoalsFilter?: (s: Set<string> | null) => void;
}

function FilterBar({
  dayFilter,
  periodFilter,
  onPeriodFilter,
  totalCount,
  showGoals,
  goals,
  goalsFilter,
  onGoalsFilter,
}: FilterBarProps) {
  const visibleGoals = useMemo(
    () => (goals ?? []).filter((g) => g.status !== 'done'),
    [goals],
  );

  return (
    <div className="filter-bar">
      {dayFilter !== 'today' && (
        <div className="filter-group">
          <span className="filter-group__label">Period</span>
          <div className="chip-group" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodFilter === p}
                onClick={() => onPeriodFilter(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      )}
      {showGoals && visibleGoals.length > 0 && (
        <div className="filter-group">
          <span className="filter-group__label">Goals</span>
          <GoalsPicker
            goals={visibleGoals}
            value={goalsFilter ?? null}
            onChange={onGoalsFilter ?? (() => {})}
          />
        </div>
      )}
      <span className="filter-bar__count">
        <b>{totalCount}</b> {totalCount === 1 ? 'go' : 'gos'}
      </span>
    </div>
  );
}

/* ── DayGroupedCards: groups gos by due_date, paginated ─────────────────── */

interface DayGroupedCardsProps {
  gos: Go[];
  direction: 'past' | 'future';
  shownLimit: number;
  onLoadMore: () => void;
  renderCard: (go: Go) => ReactNode;
}

function DayGroupedCards({
  gos,
  direction,
  shownLimit,
  onLoadMore,
  renderCard,
}: DayGroupedCardsProps) {
  const slice = useMemo(() => gos.slice(0, shownLimit), [gos, shownLimit]);
  const groups = useMemo(() => groupByDay(slice, direction), [slice, direction]);
  const remaining = gos.length - slice.length;

  return (
    <>
      {groups.map((group) => {
        const rel = relativeLabel(group.date);
        return (
          <section key={group.date} className="day-group">
            <header className="day-group__head">
              <h4 className="day-group__date">
                {group.label}
                {rel && <em>{rel}</em>}
              </h4>
              <span className="day-group__rule" />
              <span className="day-group__stats">
                {direction === 'past' && group.done > 0 && (
                  <><em className="hit">{group.done} done</em> · </>
                )}
                {direction === 'past' && group.miss > 0 && (
                  <><em className="miss">{group.miss} missed</em> · </>
                )}
                <b>{group.gos.length}</b> total
              </span>
            </header>
            <div className="tg-cards">
              {group.gos.map((go) => renderCard(go))}
            </div>
          </section>
        );
      })}
      {remaining > 0 && (
        <button className="load-more" type="button" onClick={onLoadMore}>
          {direction === 'past' ? 'Show older' : 'Show further'}
          <span className="load-more__hint">
            + {Math.min(remaining, PAGE_SIZE)} more · {remaining} hidden
          </span>
        </button>
      )}
    </>
  );
}

/* ── GoalsPicker: compact searchable multi-select for cross-goal filter ── */

interface GoalsPickerProps {
  goals: Task[];
  value: Set<string> | null;
  onChange: (s: Set<string> | null) => void;
}

function GoalsPicker({ goals, value, onChange }: GoalsPickerProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const rootRef             = useRef<HTMLDivElement>(null);

  // Click-outside + Escape — only while open, to avoid leaking listeners.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset search when closing so the next open starts fresh.
  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const all = !value || value.size === 0;
  const selectedCount = value?.size ?? 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return goals;
    const q = search.toLowerCase();
    return goals.filter((g) => g.title.toLowerCase().includes(q));
  }, [goals, search]);

  const summary = all
    ? `All · ${goals.length}`
    : `${selectedCount} selected`;

  const toggle = (id: string) => {
    const next = new Set(value ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next.size === 0 ? null : next);
  };

  return (
    <div className="goals-picker" ref={rootRef}>
      <button
        type="button"
        className="goals-picker__btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <b>{summary}</b>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="goals-picker__panel" role="dialog" aria-label="Filter by goal">
          <div className="goals-picker__search-row">
            <Search size={12} aria-hidden />
            <input
              className="goals-picker__search"
              type="search"
              placeholder="Search goals…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="goals-picker__actions">
            <button
              type="button"
              className="goals-picker__action"
              data-on={all || undefined}
              onClick={() => onChange(null)}
            >All</button>
            {!all && (
              <button
                type="button"
                className="goals-picker__action"
                onClick={() => onChange(null)}
              >Clear</button>
            )}
            <span className="goals-picker__actions-rule" />
            <span className="goals-picker__count">
              {filtered.length} {filtered.length === 1 ? 'goal' : 'goals'}
            </span>
          </div>
          <div className="goals-picker__list">
            {filtered.length === 0 ? (
              <div className="goals-picker__empty">No goals match.</div>
            ) : filtered.map((g) => {
              const on = value?.has(g.id) ?? false;
              return (
                <button
                  key={g.id}
                  type="button"
                  className="goals-picker__item"
                  aria-pressed={on}
                  onClick={() => toggle(g.id)}
                >
                  <span className="goals-picker__check" data-on={on || undefined}>
                    {on && <Check size={9} strokeWidth={3} />}
                  </span>
                  <span
                    className="goals-picker__dot"
                    style={{ background: accentFor(g.id) }}
                  />
                  <span className="goals-picker__name">{g.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

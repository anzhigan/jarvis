import { useMemo } from 'react';
import { Check, Repeat, X } from 'lucide-react';
import type { Go, Task } from '../../../api/types';
import { goCurrentStreak, groupGosByGoal } from '../hooks/useGos';

interface Props {
  gos: Go[];
  goals: Task[];
  onToggleDone: (go: Go) => void;
  onSkip: (go: Go) => void;
  onSelect: (id: string) => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;

/** Deterministic accent for a given goal id (so colours stay stable across renders). */
function accentFor(goalId: string | '__none__'): string {
  if (goalId === '__none__') return 'var(--ink-4)';
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function fmtToday(): string {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function valueLabel(go: Go): string | null {
  if (go.kind !== 'numeric' || !go.target_value) return null;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayVal = go.entries.find((e) => e.date === ymd)?.value ?? 0;
  const unit = go.unit ? ` ${go.unit}` : '';
  return `${todayVal} / ${go.target_value}${unit}`;
}

export function GoView({ gos, goals, onToggleDone, onSkip, onSelect }: Props) {
  const grouped = useMemo(() => groupGosByGoal(gos), [gos]);
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goals) m.set(t.id, t);
    return m;
  }, [goals]);

  const totals = useMemo(() => {
    const done = gos.filter((g) => g.is_done_today).length;
    const total = gos.length;
    const pending = total - done;
    const bestStreak = gos.reduce((m, g) => Math.max(m, goCurrentStreak(g)), 0);
    const advancing = new Set(gos.filter((g) => g.task_id).map((g) => g.task_id)).size;
    return { done, total, pending, bestStreak, advancing };
  }, [gos]);

  if (gos.length === 0) {
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

  // Stable order: groups by parent display order, orphans last.
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    const oa = goalById.get(a)?.order ?? 0;
    const ob = goalById.get(b)?.order ?? 0;
    return oa - ob;
  });

  return (
    <>
      <header className="go-hero">
        <div className="go-kicker">{fmtToday()}</div>
        <h1 className="go-hero-title">
          {totals.done > 0
            ? <><em>{totals.done} of {totals.total}</em>,<br />{totals.done === totals.total ? 'all done.' : 'on the board.'}</>
            : <>The day, <em>open</em>.</>}
        </h1>
        <p className="go-lede">
          Daily targets pulled from your active goals. Tick what's done,
          set aside what isn't, leave the rest for later in the day.
        </p>
      </header>

      <div className="go-progress-strip">
        <div className="ps-cell">
          <div className="ps-num">{totals.done}<em>/{totals.total}</em></div>
          <div className="ps-label">Done today</div>
        </div>
        <div className="ps-cell">
          <div className="ps-num">{totals.pending}</div>
          <div className="ps-label">Pending</div>
        </div>
        <div className="ps-cell">
          <div className="ps-num">{totals.bestStreak}<em> {totals.bestStreak === 1 ? 'day' : 'days'}</em></div>
          <div className="ps-label">Best streak now</div>
        </div>
        <div className="ps-cell">
          <div className="ps-num">{totals.advancing}</div>
          <div className="ps-label">Goals advancing</div>
        </div>
      </div>

      <div className="section-head">
        <span className="section-title">Today, by goal</span>
        <span className="section-rule" />
        <span className="section-meta">
          {totals.total} item{totals.total === 1 ? '' : 's'} · grouped by parent
        </span>
      </div>

      <div className="go-list">
        {groupKeys.flatMap((goalId) => {
          const items = grouped.get(goalId) ?? [];
          const accent = accentFor(goalId);
          const goalTitle = goalId === '__none__' ? 'Standalone' : goalById.get(goalId)?.title ?? '—';
          return items.map((go) => {
            const streak = goCurrentStreak(go);
            const val = valueLabel(go);
            return (
              <article
                key={go.id}
                className="go-row"
                data-done={go.is_done_today || undefined}
                style={{ ['--accent' as any]: accent }}
                onClick={() => onSelect(go.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(go.id); }}
              >
                <button
                  className="go-check"
                  data-active={go.is_done_today || undefined}
                  onClick={(e) => { e.stopPropagation(); onToggleDone(go); }}
                  aria-label={go.is_done_today ? 'Mark not done' : 'Mark done'}
                >
                  <Check />
                </button>
                <div className="go-text">
                  <h3 className="go-target">{go.title}</h3>
                  <p className="go-meta">
                    {goalId !== '__none__' && (
                      <>
                        <span className="go-goal">{goalTitle}</span>
                        <span className="go-meta-sep">·</span>
                      </>
                    )}
                    <span className={`go-streak${streak === 0 ? ' go-streak-zero' : ''}`}>
                      {streak === 0 ? 'no streak' : <><Repeat size={11} style={{ verticalAlign: -2 }} /> {streak}</>}
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
                  title="Skip"
                  onClick={(e) => { e.stopPropagation(); onSkip(go); }}
                  aria-label="Skip today"
                >
                  <X />
                </button>
              </article>
            );
          });
        })}
      </div>
    </>
  );
}

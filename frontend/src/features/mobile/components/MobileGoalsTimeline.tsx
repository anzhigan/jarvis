import { useMemo } from 'react';
import { Flag } from 'lucide-react';
import type { Task, TaskPriority } from '../../../api/types';

interface Props {
  tasks: Task[];
  onOpenDetail: (taskId: string) => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--ochre)', 'var(--rust)', 'var(--slate)'] as const;
function accent(t: Task): string {
  if (t.color) return t.color;
  let h = 0;
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}
function priorityColor(p: TaskPriority): { bg: string; fg: string } {
  if (p === 'high')   return { bg: 'var(--rust-soft)',  fg: 'var(--rust)'  };
  if (p === 'medium') return { bg: 'var(--ochre-soft)', fg: 'var(--ochre)' };
  return                     { bg: 'var(--cream)',      fg: 'var(--ink-5)' };
}

const MS_DAY = 86_400_000;

/**
 * Mobile Goals · Timeline mode. Shows goals as horizontal bars laid out
 * against a shared date axis. Goals without dates are shown in a separate
 * "Undated" section at the bottom.
 *
 * Axis: from the earliest start_date to the latest due_date across all
 * goals, with a today marker. Each bar is sized by its window relative
 * to the axis, with progress filling. Tap → opens detail sheet.
 */
export function MobileGoalsTimeline({ tasks, onOpenDetail }: Props) {
  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const { dated, undated, axisStart, axisEnd } = useMemo(() => {
    const dated: Task[] = [];
    const undated: Task[] = [];
    let minStart = Infinity, maxEnd = -Infinity;
    for (const t of tasks) {
      if (t.status === 'done') continue;
      if (t.start_date && t.due_date) {
        dated.push(t);
        const s = new Date(t.start_date).getTime();
        const e = new Date(t.due_date).getTime();
        if (s < minStart) minStart = s;
        if (e > maxEnd) maxEnd = e;
      } else if (t.due_date) {
        // Single-date goals — treat as a point. Still go in dated list.
        dated.push(t);
        const e = new Date(t.due_date).getTime();
        if (e < minStart) minStart = e;
        if (e > maxEnd) maxEnd = e;
      } else {
        undated.push(t);
      }
    }
    if (!isFinite(minStart)) minStart = today;
    if (!isFinite(maxEnd))   maxEnd   = today + 30 * MS_DAY;
    // Pad axis by 7 days on each side so today marker has breathing room.
    return {
      dated: dated.sort((a, b) =>
        (a.start_date ?? a.due_date ?? '').localeCompare(b.start_date ?? b.due_date ?? '')),
      undated,
      axisStart: minStart - 7 * MS_DAY,
      axisEnd:   maxEnd   + 7 * MS_DAY,
    };
  }, [tasks, today]);

  const axisSpan = axisEnd - axisStart;
  const pctOf = (ms: number) => ((ms - axisStart) / axisSpan) * 100;

  // Month markers — pick first-of-month dates within the axis so the user
  // can locate "January" / "February" without a separate header.
  const months = useMemo(() => {
    const out: { label: string; pct: number }[] = [];
    const start = new Date(axisStart); start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(axisEnd);
    let cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      const pct = pctOf(cur.getTime());
      if (pct >= 0 && pct <= 100) {
        out.push({
          label: cur.toLocaleDateString(undefined, { month: 'short' }),
          pct,
        });
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }, [axisStart, axisEnd]);

  const todayPct = pctOf(today);
  const todayVisible = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="m-tl">
      {/* Axis with month labels + today marker */}
      <div className="m-tl__axis">
        {months.map((m, i) => (
          <span
            key={i}
            className="m-tl__axis-mo"
            style={{ left: `${m.pct}%` }}
          >{m.label}</span>
        ))}
        {todayVisible && (
          <span className="m-tl__axis-today" style={{ left: `${todayPct}%` }}>today</span>
        )}
      </div>

      {dated.length === 0 && undated.length === 0 ? (
        <div className="m-day-empty" style={{ padding: 28, textAlign: 'center' }}>
          No active goals to plot.
        </div>
      ) : (
        <>
          {dated.length > 0 && (
            <div className="m-tl__lanes">
              {dated.map((t) => {
                const start = t.start_date ? new Date(t.start_date).getTime() : null;
                const end = t.due_date ? new Date(t.due_date).getTime() : start;
                if (end === null) return null;
                const sPct = start === null ? pctOf(end) : pctOf(start);
                const ePct = pctOf(end);
                const widthPct = Math.max(2, ePct - sPct);
                const prog = Math.max(0, Math.min(100, Math.round(t.progress ?? 0)));
                const pri = priorityColor(t.priority);
                const a = accent(t);
                // Bar fill = progress %. Track shows the goal's window.
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="m-tl__lane"
                    onClick={() => onOpenDetail(t.id)}
                    aria-label={`Open ${t.title}`}
                  >
                    <span className="m-tl__lane-title">{t.title}</span>
                    <span
                      className="m-tl__lane-flag"
                      style={{ background: pri.bg, color: pri.fg }}
                      title={`Priority: ${t.priority}`}
                    ><Flag size={9} /></span>
                    <div className="m-tl__lane-track">
                      <div
                        className="m-tl__lane-bar"
                        style={{
                          left: `${sPct}%`,
                          width: `${widthPct}%`,
                          background: `color-mix(in srgb, ${a} 20%, var(--paper))`,
                          borderColor: a,
                        }}
                      >
                        <div
                          className="m-tl__lane-fill"
                          style={{ width: `${prog}%`, background: a }}
                        />
                      </div>
                      {todayVisible && (
                        <span
                          className="m-tl__lane-today"
                          style={{ left: `${todayPct}%` }}
                        />
                      )}
                    </div>
                    <span className="m-tl__lane-pct">{prog}%</span>
                  </button>
                );
              })}
            </div>
          )}

          {undated.length > 0 && (
            <div className="m-tl__undated">
              <div className="m-day-sec__title" style={{ marginTop: 16 }}>
                Undated · {undated.length}
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8,
              }}>
                {undated.map((t) => {
                  const a = accent(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="m-tl__undated-row"
                      onClick={() => onOpenDetail(t.id)}
                    >
                      <span className="m-tl__undated-dot" style={{ background: a }} />
                      <span className="m-tl__undated-title">{t.title}</span>
                      <span className="m-tl__undated-pct">{Math.round(t.progress ?? 0)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

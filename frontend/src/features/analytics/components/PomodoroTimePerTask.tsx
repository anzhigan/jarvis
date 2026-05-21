import { useEffect, useMemo, useState } from 'react';
import {
  readSessions,
  POMODORO_SESSIONS_CHANGE_EVENT,
  type PomoSession,
} from '../lib/pomodoroLog';

interface Props {
  /** Window in days to aggregate over. Sessions older than that are dropped. */
  periodDays: number;
  /** Max rows to plot; the rest get collapsed into "Other". */
  topN?: number;
}

interface Row {
  key: string;
  label: string;
  totalMin: number;
  sessions: number;
  isUnassigned: boolean;
  isOther: boolean;
}

const MS_DAY = 86_400_000;
const NO_TASK_KEY = '__no_task__';

/**
 * Pomodoro time-per-task — horizontal bar chart aggregating completed
 * focus sessions from local storage by task. Bars are rust-tinted to
 * match the Pomodoro panel; unassigned focus time is shown as a
 * separate "No task" row with a muted treatment.
 */
export function PomodoroTimePerTask({ periodDays, topN = 6 }: Props) {
  const [sessions, setSessions] = useState<PomoSession[]>(() => readSessions());

  // Pick up newly recorded sessions without a page reload.
  useEffect(() => {
    const handler = () => setSessions(readSessions());
    window.addEventListener(POMODORO_SESSIONS_CHANGE_EVENT, handler);
    return () => window.removeEventListener(POMODORO_SESSIONS_CHANGE_EVENT, handler);
  }, []);

  const { rows, totalMin, otherCount } = useMemo(() => {
    const cutoff = Date.now() - periodDays * MS_DAY;
    const inWindow = sessions.filter(
      (s) => s.mode === 'focus' && s.completedAt >= cutoff && s.durationSec > 0,
    );

    // Group by taskId (null → unassigned bucket).
    const byTask = new Map<string, { label: string; totalSec: number; sessions: number; isUnassigned: boolean }>();
    for (const s of inWindow) {
      const key = s.taskId ?? NO_TASK_KEY;
      const existing = byTask.get(key);
      const label = s.taskTitle ?? 'No task';
      if (existing) {
        existing.totalSec += s.durationSec;
        existing.sessions += 1;
      } else {
        byTask.set(key, {
          label,
          totalSec: s.durationSec,
          sessions: 1,
          isUnassigned: s.taskId === null,
        });
      }
    }

    const all: Row[] = Array.from(byTask.entries())
      .map(([key, v]) => ({
        key,
        label: v.label,
        totalMin: Math.round(v.totalSec / 60),
        sessions: v.sessions,
        isUnassigned: v.isUnassigned,
        isOther: false,
      }))
      .filter((r) => r.totalMin > 0)
      .sort((a, b) => b.totalMin - a.totalMin);

    let displayed = all.slice(0, topN);
    let otherCount = 0;
    if (all.length > topN) {
      const rest = all.slice(topN);
      const restMin = rest.reduce((sum, r) => sum + r.totalMin, 0);
      const restSessions = rest.reduce((sum, r) => sum + r.sessions, 0);
      otherCount = rest.length;
      if (restMin > 0) {
        displayed = [
          ...displayed,
          {
            key: '__other__',
            label: `${rest.length} more task${rest.length === 1 ? '' : 's'}`,
            totalMin: restMin,
            sessions: restSessions,
            isUnassigned: false,
            isOther: true,
          },
        ];
      }
    }

    const totalMin = all.reduce((sum, r) => sum + r.totalMin, 0);
    return { rows: displayed, totalMin, otherCount };
  }, [sessions, periodDays, topN]);

  const maxMin = rows.reduce((m, r) => Math.max(m, r.totalMin), 0);
  const sessionCount = rows.reduce((s, r) => s + r.sessions, 0);

  return (
    <div className="ana-card-chart pomo-tpt">
      <div className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Focus time per task</h3>
          <div className="acc-sub">
            Completed Pomodoro sessions, last {periodDays} days
          </div>
        </div>
        <div className="pomo-tpt-total">
          <span className="pomo-tpt-total-num">{fmtTotal(totalMin)}</span>
          <span className="pomo-tpt-total-cap">{sessionCount} session{sessionCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="pomo-tpt-empty">
          No focus sessions yet — start a Pomodoro and pick a task to track time here.
        </div>
      ) : (
        <ul className="pomo-tpt-list" role="list">
          {rows.map((r) => (
            <li key={r.key} className="pomo-tpt-row" data-unassigned={r.isUnassigned || undefined} data-other={r.isOther || undefined}>
              <div className="pomo-tpt-label" title={r.label}>{r.label}</div>
              <div className="pomo-tpt-track">
                <div
                  className="pomo-tpt-bar"
                  style={{ width: `${maxMin > 0 ? (r.totalMin / maxMin) * 100 : 0}%` }}
                />
              </div>
              <div className="pomo-tpt-val">
                <span className="pomo-tpt-min">{fmtMin(r.totalMin)}</span>
                <span className="pomo-tpt-sess">{r.sessions}×</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {otherCount > 0 && (
        <div className="pomo-tpt-foot">
          Showing top {topN} of {topN + otherCount} tasks.
        </div>
      )}
    </div>
  );
}

function fmtMin(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTotal(min: number): string {
  if (min === 0) return '0m';
  return fmtMin(min);
}

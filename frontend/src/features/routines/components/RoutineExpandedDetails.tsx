import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import {
  addDays, completionRate, currentStreak, entriesByDate, isScheduledOn,
  scheduleLabel, startOfDay, ymd,
} from '../lib/heatmap';

interface Props {
  routine: Routine;
}

const TREND_DAYS = 30;
const RHYTHM_WEEKS = 4;

/** Right-pane companion to the expanded calendar — a 30-day trend mini-chart
 *  + a rhythm card. Rhythm covers both routines AND gos in the Analysis day
 *  panel; here, for a single routine, it surfaces the routine's own cadence:
 *
 *    - this week vs average week (4-week trailing baseline)
 *    - current streak vs best streak in window
 *    - schedule label for context
 */
export function RoutineExpandedDetails({ routine }: Props) {
  // Trend over the last 30 days. Each bar is either:
  //   - boolean: full or empty
  //   - numeric: scaled value/target (clamped to 1.0)
  const trend = useMemo(() => {
    const today = startOfDay(new Date());
    const map = entriesByDate(routine.entries ?? []);
    const target = routine.target_value ?? 1;
    const points: { date: string; ratio: number; scheduled: boolean; hit: boolean }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const k = ymd(d);
      const entry = map.get(k);
      const scheduled = isScheduledOn(routine, d);
      let ratio = 0;
      let hit = false;
      if (entry && entry.value > 0) {
        hit = true;
        if (routine.kind === 'numeric' && target > 0) {
          ratio = Math.min(1, entry.value / target);
        } else {
          ratio = 1;
        }
      }
      points.push({ date: k, ratio, scheduled, hit });
    }
    return points;
  }, [routine]);

  // Rhythm: this-week completion ratio vs trailing 4-week avg.
  // For "scheduled this week" we count days where the routine was scheduled
  // AND the day has already happened (so future scheduled days don't drag
  // the ratio down mid-week).
  const rhythm = useMemo(() => {
    const today = startOfDay(new Date());
    const map = entriesByDate(routine.entries ?? []);
    // Week boundaries: walk back to the most recent Monday. We treat
    // Mon-Sun as the week so users in en/ru both see a sensible block.
    const dow = today.getDay(); // 0 = Sun, 1 = Mon, …
    const monOffset = dow === 0 ? 6 : dow - 1;
    const thisMonday = addDays(today, -monOffset);
    // Count of (scheduled, hit) pairs in a [start, end] inclusive window.
    const countWindow = (start: Date, end: Date) => {
      let sched = 0, hit = 0;
      const ms = startOfDay(start).getTime();
      const me = startOfDay(end).getTime();
      for (let t = ms; t <= me; t += 86_400_000) {
        const d = new Date(t);
        if (d > today) break;
        if (!isScheduledOn(routine, d)) continue;
        sched++;
        const e = map.get(ymd(d));
        if (e && e.value > 0) hit++;
      }
      return { sched, hit };
    };
    const thisWeek = countWindow(thisMonday, today);
    // Trailing 4 weeks ending Sunday-before-this-Monday.
    const prevSun = addDays(thisMonday, -1);
    const prevStart = addDays(prevSun, -(RHYTHM_WEEKS * 7 - 1));
    const prev = countWindow(prevStart, prevSun);
    const thisRate = thisWeek.sched > 0 ? thisWeek.hit / thisWeek.sched : 0;
    const prevRate = prev.sched > 0 ? prev.hit / prev.sched : 0;
    const deltaPct = prevRate > 0
      ? Math.round(((thisRate - prevRate) / prevRate) * 100)
      : (thisRate > 0 ? 100 : 0);
    let tone: 'above' | 'below' | 'on' = 'on';
    if (prev.sched > 0) {
      if (deltaPct > 10) tone = 'above';
      else if (deltaPct < -10) tone = 'below';
    }
    return {
      thisHit: thisWeek.hit,
      thisSched: thisWeek.sched,
      thisRatePct: Math.round(thisRate * 100),
      prevRatePct: Math.round(prevRate * 100),
      deltaPct,
      tone,
      hasBaseline: prev.sched > 0,
    };
  }, [routine]);

  // Streak numbers — current vs best-in-window. We compute best from the
  // 30-day points so a long-ago record streak doesn't dominate the rhythm
  // narrative (the calendar nav already lets the user scroll deeper).
  const streaks = useMemo(() => {
    const cur = currentStreak(routine);
    let best = 0, run = 0;
    for (const p of trend) {
      if (p.hit) { run++; if (run > best) best = run; } else { run = 0; }
    }
    return { cur, best };
  }, [routine, trend]);

  const rate30 = useMemo(() => completionRate(routine, 30), [routine]);

  return (
    <div className="rt-side">
      {/* ── Trend ───────────────────────────────────────────────────────── */}
      <div className="rt-side__sec">
        <div className="rt-side__head">
          <span className="rt-side__title">Trend · 30 days</span>
          <span className="rt-side__head-stat">
            {rate30}<em>%</em>
          </span>
        </div>
        <div className="rt-trend">
          {trend.map((p) => (
            <div
              key={p.date}
              className="rt-trend__col"
              data-scheduled={p.scheduled || undefined}
              data-hit={p.hit || undefined}
              title={`${p.date} · ${p.hit
                ? routine.kind === 'numeric'
                  ? `${Math.round(p.ratio * 100)}% of target`
                  : 'done'
                : p.scheduled ? 'missed' : 'off-day'}`}
            >
              <div
                className="rt-trend__bar"
                style={{ height: `${Math.max(p.hit ? 8 : 2, p.ratio * 100)}%` }}
                data-color={routine.color}
              />
            </div>
          ))}
        </div>
        <div className="rt-side__foot">
          <span>{scheduleLabel(routine)}</span>
        </div>
      </div>

      {/* ── Rhythm ──────────────────────────────────────────────────────── */}
      <div className="rt-side__sec">
        <div className="rt-side__head">
          <span className="rt-side__title">Rhythm</span>
        </div>
        <div className="rt-rhythm" data-tone={rhythm.tone}>
          <div className="rt-rhythm__arrow">
            {rhythm.tone === 'above' ? '▲' : rhythm.tone === 'below' ? '▼' : '='}
          </div>
          <div className="rt-rhythm__text">
            <div className="rt-rhythm__line">
              <strong>{rhythm.thisHit}/{rhythm.thisSched || '–'}</strong> this week
            </div>
            <div className="rt-rhythm__sub">
              {rhythm.hasBaseline ? (
                <>
                  4-week avg <em>{rhythm.prevRatePct}%</em>
                  {rhythm.tone !== 'on' && (
                    <> · {rhythm.deltaPct > 0 ? '+' : ''}{rhythm.deltaPct}%</>
                  )}
                </>
              ) : (
                <>not enough history yet</>
              )}
            </div>
          </div>
        </div>
        <div className="rt-rhythm__streaks">
          <div className="rt-rhythm__streak">
            <span className="rt-rhythm__streak-num">{streaks.cur}<em>d</em></span>
            <span className="rt-rhythm__streak-lbl">current streak</span>
          </div>
          <div className="rt-rhythm__streak">
            <span className="rt-rhythm__streak-num">{streaks.best}<em>d</em></span>
            <span className="rt-rhythm__streak-lbl">best · 30d</span>
          </div>
        </div>
      </div>
    </div>
  );
}

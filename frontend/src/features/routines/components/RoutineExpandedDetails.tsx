import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import {
  addDays, completionRate, currentStreak, entriesByDate, isScheduledOn,
  scheduleLabel, startOfDay, ymd,
} from '../lib/heatmap';
import { buildDailySeries, buildPulsePaths } from '../lib/pulse';

interface Props {
  routine: Routine;
}

const TREND_DAYS = 30;
const RHYTHM_WEEKS = 4;
/** Match Analysis "Per-routine pulse" geometry so the line reads identically.
 *  Width scales to the container via SVG viewBox; height is intrinsic. */
const PULSE_W = 280;
const PULSE_H = 70;

/** Right-pane companion to the expanded calendar — a 30-day trend mini-chart
 *  + a rhythm card. Rhythm covers both routines AND gos in the Analysis day
 *  panel; here, for a single routine, it surfaces the routine's own cadence:
 *
 *    - this week vs average week (4-week trailing baseline)
 *    - current streak vs best streak in window
 *    - schedule label for context
 */
export function RoutineExpandedDetails({ routine }: Props) {
  // Daily-completion series (0..1) over the last 30 days — same source as
  // the Analysis "Per-routine pulse" line so the two surfaces agree on what
  // the routine looks like. Smoothed via 3-pt Hann inside buildPulsePaths.
  const series = useMemo(() => buildDailySeries(routine, TREND_DAYS), [routine]);
  const pulse = useMemo(() => buildPulsePaths(series, PULSE_W, PULSE_H), [series]);
  // For the streak calculation we keep the raw hit flags — smoothing is a
  // chart concern, not a counting one.
  const rawHits = useMemo(() => series.map((v) => v > 0), [series]);

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
  // 30-day raw hits (smoothed series would round zero-days up).
  const streaks = useMemo(() => {
    const cur = currentStreak(routine);
    let best = 0, run = 0;
    for (const hit of rawHits) {
      if (hit) { run++; if (run > best) best = run; } else { run = 0; }
    }
    return { cur, best };
  }, [routine, rawHits]);

  const rate30 = useMemo(() => completionRate(routine, 30), [routine]);

  // State buckets mirror Analysis PerRoutinePulse — same accent palette
  // for the same rate ranges so the per-row chart inherits the design
  // system's vocabulary instead of using `routine.color` (which is the
  // user-picked routine accent, often outside the indigo/moss/ochre/rust
  // family). Strong ≥ 80 → moss · warm ≥ 50 → ochre · slip < 50 → rust.
  const state: 'strong' | 'warm' | 'slip' =
    rate30 >= 80 ? 'strong' : rate30 >= 50 ? 'warm' : 'slip';

  // Returns two top-level siblings (no wrapping div) so the outer grid in
  // RoutinesView can place them as separate columns next to the calendar:
  //   [calendar] [trend] [rhythm]
  return (
    <>
      {/* ── Trend ───────────────────────────────────────────────────────── */}
      <div className="rt-side__sec">
        <div className="rt-side__head">
          <span className="rt-side__title">Trend · 30 days</span>
          <span className="rt-side__head-stat">
            {rate30}<em>%</em>
          </span>
        </div>
        <div className="rt-pulse" data-state={state}>
          <svg
            className="rt-pulse__svg"
            viewBox={`0 0 ${PULSE_W} ${PULSE_H}`}
            preserveAspectRatio="none"
          >
            {/* 50%-completion reference line */}
            <line
              className="rt-pulse__axis"
              x1={0} x2={PULSE_W}
              y1={pulse.baselineY} y2={pulse.baselineY}
            />
            {/* Faint weekly grid ticks — same idea as in Analysis spark */}
            {pulse.weekTicks.map((x, i) => (
              <line
                key={i}
                className="rt-pulse__week"
                x1={x} x2={x} y1={0} y2={PULSE_H}
              />
            ))}
            {pulse.area && <path className="rt-pulse__area" d={pulse.area} />}
            {pulse.line && <path className="rt-pulse__line" d={pulse.line} />}
            {/* Min / max / today markers */}
            {pulse.pts.length > 0 && (
              <>
                <circle
                  className="rt-pulse__min"
                  cx={pulse.pts[pulse.minIdx][0]}
                  cy={pulse.pts[pulse.minIdx][1]}
                  r={2.4}
                />
                <circle
                  className="rt-pulse__max"
                  cx={pulse.pts[pulse.maxIdx][0]}
                  cy={pulse.pts[pulse.maxIdx][1]}
                  r={2.4}
                />
                <circle
                  className="rt-pulse__now"
                  cx={pulse.pts[pulse.pts.length - 1][0]}
                  cy={pulse.pts[pulse.pts.length - 1][1]}
                  r={3}
                />
              </>
            )}
          </svg>
          <div className="rt-pulse__axis-lab">
            <span>30d ago</span>
            <span>today</span>
          </div>
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
    </>
  );
}

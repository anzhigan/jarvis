/**
 * PerRoutinePulse — auto-fill grid with one mini "function plot" per
 * routine. Each card carries title, streak pill, a smoothed 30-day line
 * chart, and short footer with rate / fraction. State (strong/warm/slip)
 * drives an accent border and the line colour through currentColor.
 *
 * Density toggle ("Compact" ↔ "Comfortable") shrinks the cells and hides
 * footers so a user with many routines can fit them all without scrolling
 * — a single-screen pulse strip is the goal here.
 */
import { useMemo, useState } from 'react';
import type { Routine } from '../../../api/types';
import { addDays, currentStreak, completionRate, ymd } from '../../routines/lib/heatmap';

interface Props {
  routines: Routine[];
  /** Window for the line chart (days). Defaults to 30. */
  windowDays?: number;
}

type State = 'strong' | 'warm' | 'slip';

const W = 200;
const H = 36;
const PAD_Y = 3;

interface RoutineRow {
  routine: Routine;
  state: State;
  streak: number;
  rate: number;
  fraction: { done: number; total: number };
  series: number[];      // smoothed, 0..1
  svg: string;
}

/* ── Path builder ─────────────────────────────────────────────────── */

function smooth(values: number[]): number[] {
  // 3-pt Hann window — light, just enough to read direction without
  // turning a real spike into a flat curve.
  return values.map((_, i, arr) => {
    const p = arr[i - 1] ?? arr[i];
    const n = arr[i + 1] ?? arr[i];
    return p * 0.25 + arr[i] * 0.5 + n * 0.25;
  });
}

function buildSvg(rawValues: number[]): string {
  if (rawValues.length === 0) return '';
  const values = smooth(rawValues);
  const N = values.length;
  const innerH = H - PAD_Y * 2;
  const step = W / Math.max(1, N - 1);
  const toY = (v: number) =>
    PAD_Y + innerH * (1 - Math.max(0, Math.min(1, v)));

  const pts: [number, number][] = values.map((v, i) => [i * step, toY(v)]);

  // Catmull-Rom → cubic Bezier for soft trajectory.
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${path} L${W},${H} L0,${H} Z`;

  // min / max / now markers
  let minI = 0, maxI = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[minI]) minI = i;
    if (values[i] > values[maxI]) maxI = i;
  }
  const last = pts.length - 1;
  const baselineY = toY(0.5);

  // Weekly tick marks — faint vertical lines every 7 days so the reader
  // can locate "this Monday" relative to "today" without a separate axis.
  const weekTicks: string[] = [];
  for (let i = N - 1 - 7; i > 0; i -= 7) {
    const x = (i * step).toFixed(1);
    weekTicks.push(`<line class="prp-week" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  }

  return `
    <line class="prp-axis" x1="0" y1="${baselineY.toFixed(1)}" x2="${W}" y2="${baselineY.toFixed(1)}"/>
    ${weekTicks.join('')}
    <path class="prp-area" d="${area}"/>
    <path class="prp-line" d="${path}"/>
    <circle class="prp-min" cx="${pts[minI][0].toFixed(1)}" cy="${pts[minI][1].toFixed(1)}" r="2"/>
    <circle class="prp-max" cx="${pts[maxI][0].toFixed(1)}" cy="${pts[maxI][1].toFixed(1)}" r="2"/>
    <circle class="prp-now" cx="${pts[last][0].toFixed(1)}" cy="${pts[last][1].toFixed(1)}" r="2.5"/>
  `;
}

/* ── Component ────────────────────────────────────────────────────── */

export function PerRoutinePulse({ routines, windowDays = 30 }: Props) {
  const [compact, setCompact] = useState(false);

  const rows = useMemo<RoutineRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return routines
      .filter((r) => !r.is_paused)
      .map<RoutineRow>((r) => {
        // Build the daily value series (0..1) over the window.
        const dateValue = new Map<string, number>();
        for (const e of r.entries) dateValue.set(e.date, e.value ?? 0);

        // For numeric routines we normalise against the target; for
        // boolean we just treat value > 0 as 1.
        const norm = (v: number | undefined) => {
          if (v === undefined) return 0;
          if (v <= 0) return 0;
          if (r.kind === 'numeric' && r.target_value) {
            return Math.min(1, v / r.target_value);
          }
          return 1;
        };

        const series: number[] = [];
        let done = 0;
        for (let i = windowDays - 1; i >= 0; i--) {
          const d = addDays(today, -i);
          const key = ymd(d);
          const v = norm(dateValue.get(key));
          series.push(v);
          if (v > 0) done++;
        }

        const rate = completionRate(r, windowDays);
        // "Strong" if rate is >= 80% and not slipping; "warm" if 50–80;
        // "slip" if < 50%. Streak alone isn't a state signal because a
        // user can have a fresh 1-day streak inside an otherwise weak month.
        const state: State =
          rate >= 80 ? 'strong'
          : rate >= 50 ? 'warm'
                       : 'slip';

        return {
          routine: r,
          state,
          streak: currentStreak(r),
          rate,
          fraction: { done, total: windowDays },
          series,
          svg: buildSvg(series),
        };
      });
  }, [routines, windowDays]);

  if (rows.length === 0) {
    return (
      <div className="prp-empty">No active routines to plot — start one to see its pulse.</div>
    );
  }

  return (
    <section className="prp-section">
      <div className="prp-head">
        <span className="prp-head-label">Per-routine pulse</span>
        <span className="prp-head-rule" />
        <span className="prp-head-meta">
          <b>{rows.length}</b> routines · {windowDays} days
        </span>
        <button
          type="button"
          className="prp-head-action"
          onClick={() => setCompact((v) => !v)}
        >{compact ? 'Comfortable' : 'Compact'}</button>
      </div>
      <div className={`prp-grid${compact ? ' prp-grid--compact' : ''}`}>
        {rows.map((row) => (
          <div
            key={row.routine.id}
            className="prp-card"
            data-state={row.state}
          >
            <div className="prp-card__head">
              <span className="prp-card__title">{row.routine.title}</span>
              {row.streak > 0 && (
                <span className="prp-card__pill">{row.streak}d</span>
              )}
            </div>
            <div
              className="prp-card__spark"
              dangerouslySetInnerHTML={{
                __html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${row.svg}</svg>`,
              }}
            />
            {/* Tiny axis hint — anchors the reader: leftmost cell = N days
                ago, rightmost = today. Faint weekly grid lines above
                (drawn inside the SVG) handle intra-period orientation. */}
            <div className="prp-card__axis">
              <span>{windowDays}d ago</span>
              <span>today</span>
            </div>
            {!compact && (
              <div className="prp-card__foot">
                <span>{routineScheduleLabel(row.routine)}</span>
                <span><b>{row.rate}%</b> · {row.fraction.done}/{row.fraction.total}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function routineScheduleLabel(r: Routine): string {
  switch (r.schedule_type) {
    case 'daily':          return r.kind === 'numeric' ? 'daily · numeric' : 'daily';
    case 'weekly_on_days': return `weekly · ${(r.schedule_days?.length ?? 0)}d/wk`;
    case 'every_n_days':   return `every ${r.schedule_n_days ?? '?'}d`;
    case 'times_per_week': return `${r.schedule_count_per_period ?? '?'}× / week`;
    default:               return 'routine';
  }
}

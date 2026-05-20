import type { Routine } from '../../../api/types';
import { addDays, ymd } from './heatmap';

/** 3-point Hann smoothing — light, just enough to read direction without
 *  flattening real spikes. Lifted from PerRoutinePulse so the per-routine
 *  inline trend chart in the routines table uses the *same* curve shape
 *  as the Analysis page; they shouldn't diverge. */
export function smooth(values: number[]): number[] {
  return values.map((_, i, arr) => {
    const p = arr[i - 1] ?? arr[i];
    const n = arr[i + 1] ?? arr[i];
    return p * 0.25 + arr[i] * 0.5 + n * 0.25;
  });
}

/** Build a 0..1 daily-completion series for a routine over the last
 *  `windowDays`, ending today. Boolean: hit→1, miss→0. Numeric:
 *  `value/target` clamped to 1. Days without an entry → 0. */
export function buildDailySeries(routine: Routine, windowDays: number): number[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dateValue = new Map<string, number>();
  for (const e of routine.entries ?? []) dateValue.set(e.date, e.value);
  const norm = (v: number | undefined): number => {
    if (v === undefined || v <= 0) return 0;
    if (routine.kind === 'numeric' && routine.target_value) {
      return Math.min(1, v / routine.target_value);
    }
    return 1;
  };
  const out: number[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    out.push(norm(dateValue.get(ymd(addDays(today, -i)))));
  }
  return out;
}

export interface PulsePaths {
  /** Catmull-Rom → cubic-Bezier path through the smoothed series. */
  line: string;
  /** `line` closed back along the bottom edge — gives an area fill. */
  area: string;
  /** Resolved (x, y) tuples per data point — used for markers. */
  pts: [number, number][];
  /** Index of the lowest point in the smoothed series. */
  minIdx: number;
  /** Index of the highest point. */
  maxIdx: number;
  /** Y-coord of the 0.5 reference line (50% completion). */
  baselineY: number;
  /** X-positions of the 7-day grid ticks within the chart area. */
  weekTicks: number[];
}

/** Smoothed-line + area + markers for a daily-completion sparkline. Pure
 *  geometry — no class names baked in; callers render SVG with whatever
 *  stylesheet they own. Matches PerRoutinePulse's path math 1:1. */
export function buildPulsePaths(rawValues: number[], W: number, H: number, padY = 3): PulsePaths {
  if (rawValues.length === 0) {
    return { line: '', area: '', pts: [], minIdx: 0, maxIdx: 0, baselineY: H / 2, weekTicks: [] };
  }
  const values = smooth(rawValues);
  const N = values.length;
  const innerH = H - padY * 2;
  const step = W / Math.max(1, N - 1);
  const toY = (v: number) => padY + innerH * (1 - Math.max(0, Math.min(1, v)));
  const pts: [number, number][] = values.map((v, i) => [i * step, toY(v)]);

  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
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
    line += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${line} L${W},${H} L0,${H} Z`;

  let minIdx = 0, maxIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[minIdx]) minIdx = i;
    if (values[i] > values[maxIdx]) maxIdx = i;
  }
  const baselineY = toY(0.5);

  const weekTicks: number[] = [];
  for (let i = N - 1 - 7; i > 0; i -= 7) weekTicks.push(i * step);

  return { line, area, pts, minIdx, maxIdx, baselineY, weekTicks };
}

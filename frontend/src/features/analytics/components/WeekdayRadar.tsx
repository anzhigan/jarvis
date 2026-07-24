/**
 * WeekdayRadar — 7-axis polygon showing routine completion % by weekday
 * over the current period. The "weakest" day (one with the lowest %) is
 * tinted rust so you can see at a glance where the week sags.
 *
 * Completion per weekday = (entries with value > 0 logged that weekday) /
 * (number-of-instances-of-that-weekday in window × active routines). We
 * approximate "scheduled" as `active_routines × occurrences_of_weekday`
 * which under-counts non-daily routines, but it's directionally honest
 * for what users want here: "are Tuesdays strong, are Fridays weak."
 */
import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import { addDays, ymd } from '../../routines/lib/heatmap';

interface Props {
  routines: Routine[];
  /** Length of the analysis window — number of days back from today. */
  periodDays: number;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// SVG coordinates. Centred slightly left of viewBox centre to leave room
// for axis labels on the right edge ("Tue" / "Wed").
const CX = 160, CY = 100, R = 80;

export function WeekdayRadar({ routines, periodDays }: Props) {
  const stats = useMemo(() => {
    if (routines.length === 0) {
      return { pct: [0, 0, 0, 0, 0, 0, 0], weakestIdx: -1, midweekAvg: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // For each routine, build a quick date→value map.
    const byDate = routines.map((r) => {
      const m = new Map<string, number>();
      for (const e of r.entries) m.set(e.date, e.value ?? 0);
      return m;
    });

    // Count occurrences of each weekday in the window AND completions.
    const occurrences = [0, 0, 0, 0, 0, 0, 0];
    const completions = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < periodDays; i++) {
      const d = addDays(today, -i);
      // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat. We want Mon=0..Sun=6.
      const idx = (d.getDay() + 6) % 7;
      const key = ymd(d);
      occurrences[idx]++;
      for (const map of byDate) {
        if ((map.get(key) ?? 0) > 0) completions[idx]++;
      }
    }

    const activeR = routines.filter((r) => !r.is_paused).length;
    const denom = (idx: number) => occurrences[idx] * Math.max(1, activeR);
    const pct = completions.map((c, i) => {
      const d = denom(i);
      return d === 0 ? 0 : Math.min(100, Math.round((c / d) * 100));
    });

    let weakest = 0;
    for (let i = 1; i < 7; i++) if (pct[i] < pct[weakest]) weakest = i;
    // Mid-week avg = Tue, Wed, Thu (idx 1, 2, 3)
    const midweekAvg = Math.round((pct[1] + pct[2] + pct[3]) / 3);

    return { pct, weakestIdx: weakest, midweekAvg };
  }, [routines, periodDays]);

  const N = 7;
  const TAU = Math.PI * 2;

  // Axis angle: top = Mon, then clockwise.
  const axisAngle = (i: number) => -Math.PI / 2 + (i / N) * TAU;
  const pt = (r: number, i: number): [number, number] => [
    CX + r * Math.cos(axisAngle(i)),
    CY + r * Math.sin(axisAngle(i)),
  ];

  // Grid heptagons at 25/50/75/100%
  const gridLevels = [0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    points: Array.from({ length: N }, (_, i) => pt(R * f, i).map((n) => n.toFixed(1)).join(',')).join(' '),
  }));

  const dataPts = stats.pct.map((v, i) => pt(R * v / 100, i));
  const polyPts = dataPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Weekday <em>rhythm</em></h3>
          <p className="acc-sub">routine completion % by day</p>
        </div>
        {stats.weakestIdx >= 0 && (
          <div className="acc-stat">
            <div className="acc-stat-num" style={{ color: 'var(--rust)' }}>
              {stats.pct[stats.weakestIdx]}<em>%</em>
            </div>
            <div className="acc-stat-trend">weakest: {DAYS[stats.weakestIdx]}</div>
          </div>
        )}
      </header>
      <div className="wr-body">
        <svg viewBox="0 0 320 200" className="wr-svg" preserveAspectRatio="xMidYMid meet" aria-hidden>
          {/* Concentric grid heptagons */}
          {gridLevels.map(({ f, points }) => (
            <polygon key={f} className="wr-grid" points={points} />
          ))}
          {/* Radial spokes */}
          {Array.from({ length: N }, (_, i) => {
            const [x, y] = pt(R, i);
            return <line key={i} className="wr-axis" x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
          })}
          {/* Data polygon */}
          <polygon className="wr-shape" points={polyPts} />
          {/* Data points — weakest one in rust */}
          {dataPts.map(([x, y], i) => (
            <circle
              key={i}
              className="wr-point"
              data-weak={i === stats.weakestIdx || undefined}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={3}
            />
          ))}
          {/* Day labels just outside the outer ring */}
          {DAYS.map((d, i) => {
            const [lx, ly] = pt(R + 12, i);
            return (
              <text
                key={d}
                className="wr-label"
                data-weak={i === stats.weakestIdx || undefined}
                x={lx.toFixed(1)}
                y={(ly + 3).toFixed(1)}
              >{d}</text>
            );
          })}
          {/* 50% / 100% scale labels along top spoke */}
          {[0.5, 1].map((f) => {
            const [x, y] = pt(R * f, 0);
            return (
              <text key={f} className="wr-axis-label" x={(x + 4).toFixed(1)} y={y.toFixed(1)}>
                {Math.round(f * 100)}%
              </text>
            );
          })}
        </svg>
        <div className="wr-caption">
          <span>
            Mid-week is your spine — Tue–Thu averages{' '}
            <em>{stats.midweekAvg}%</em>.
          </span>
          {stats.weakestIdx >= 0 && stats.pct[stats.weakestIdx] < 70 && (
            <span className="wr-caption__delta">
              {DAYS[stats.weakestIdx]}: <b>{stats.pct[stats.weakestIdx]}%</b>
              {' '}· −{stats.midweekAvg - stats.pct[stats.weakestIdx]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

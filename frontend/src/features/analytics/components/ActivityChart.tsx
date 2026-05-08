import { useMemo } from 'react';
import type { ActivityPoint } from '../hooks/useAnalytics';

interface Props {
  data: ActivityPoint[];
}

const W = 740;
const H = 180;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOT = 24;

/**
 * Daily completions bar chart — goals stacked on routines. Indigo + moss
 * accents, hairline baseline. The chart sits inside an .ana-card so it can
 * share the row layout with the donut.
 */
export function ActivityChart({ data }: Props) {
  const { paths, ticks } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.goals + d.routines));
    const innerH = H - PAD_TOP - PAD_BOT;
    const slot = (W - PAD_X * 2) / Math.max(1, data.length);
    const barW = Math.max(2, slot - 1);
    const out: { x: number; routH: number; goalH: number; date: string; label: string }[] = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = PAD_X + i * slot;
      const routH = (d.routines / max) * innerH;
      const goalH = (d.goals / max) * innerH;
      out.push({ x, routH, goalH, date: d.date, label: d.label });
    }
    const stride = Math.max(1, Math.floor(data.length / 6));
    const ticks = data.filter((_, i) => i % stride === 0 || i === data.length - 1);
    return { paths: out.map((b) => ({ ...b, barW })), ticks };
  }, [data]);

  const baselineY = H - PAD_BOT;

  if (data.length === 0) {
    return (
      <div className="ana-card">
        <div className="ana-card-eyebrow">Daily completions</div>
        <h3 className="ana-card-title">Goals + routines per day</h3>
        <div className="ana-card-empty">Nothing logged in this period yet.</div>
      </div>
    );
  }

  return (
    <div className="ana-card">
      <div className="ana-card-eyebrow">Daily completions</div>
      <h3 className="ana-card-title">Goals + routines per day</h3>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ana-chart" xmlns="http://www.w3.org/2000/svg">
        <line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke="var(--hairline)" strokeWidth={1} />

        {paths.map((b) => {
          const yRout = baselineY - b.routH;
          const yGoal = yRout - b.goalH;
          return (
            <g key={b.date}>
              <rect
                x={b.x} y={yRout}
                width={b.barW} height={b.routH}
                fill="var(--moss)" rx={1}
              />
              <rect
                x={b.x} y={yGoal}
                width={b.barW} height={b.goalH}
                fill="var(--indigo)" rx={1}
              />
            </g>
          );
        })}

        <g className="ana-chart-axis">
          {ticks.map((t, i) => {
            const idx = data.findIndex((d) => d.date === t.date);
            const x = PAD_X + idx * ((W - PAD_X * 2) / data.length);
            return (
              <text key={i} x={x} y={H - 6}>{t.label}</text>
            );
          })}
        </g>
      </svg>

      <div className="ana-chart-legend">
        <span><span className="swatch" style={{ background: 'var(--indigo)' }} /> Goals</span>
        <span><span className="swatch" style={{ background: 'var(--moss)' }} /> Routines</span>
      </div>
    </div>
  );
}

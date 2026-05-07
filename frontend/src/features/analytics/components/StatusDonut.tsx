import { useMemo } from 'react';
import type { StatusSlice } from '../hooks/useAnalytics';

interface Props {
  slices: StatusSlice[];
}

const SIZE = 140;
const R = 60;
const STROKE = 22;
const CIRC = 2 * Math.PI * R; // ≈ 376.99

export function StatusDonut({ slices }: Props) {
  const total = slices.reduce((acc, s) => acc + s.count, 0);
  const segments = useMemo(() => {
    const out: { color: string; len: number; offset: number }[] = [];
    let acc = 0;
    for (const s of slices) {
      const len = total === 0 ? 0 : (s.count / total) * CIRC;
      out.push({ color: s.color, len, offset: -acc });
      acc += len;
    }
    return out;
  }, [slices, total]);

  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Goal status</div>
          <div className="an-card-sub">Distribution across all {total} goals</div>
        </div>
      </div>
      <div className="status-donut-wrap">
        <div className="status-donut" style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none" stroke="var(--bg-active)" strokeWidth={STROKE}
            />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE}
                strokeDasharray={`${seg.len} ${CIRC}`}
                strokeDashoffset={seg.offset}
              />
            ))}
          </svg>
          <div className="status-donut-num">
            <b>{total}</b>
            <span>goals</span>
          </div>
        </div>
        <div className="status-legend">
          {slices.map((s) => {
            const pct = total === 0 ? 0 : Math.round((s.count / total) * 100);
            return (
              <div key={s.status} className="status-legend-row">
                <span className="status-legend-dot" style={{ background: s.color }} />
                <span className="status-legend-name">{s.label}</span>
                <span className="status-legend-num">{s.count}</span>
                <span className="status-legend-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import type { StatusSlice } from '../hooks/useAnalytics';

interface Props {
  slices: StatusSlice[];
}

const SIZE = 132;
const R = 54;
const STROKE = 18;
const CIRC = 2 * Math.PI * R;

/** Indigo accent palette mapped per status — overrides the hook's mobile-era colours. */
const COLOR: Record<StatusSlice['status'], string> = {
  active:  'var(--indigo)',
  backlog: 'var(--ochre)',
  paused:  'var(--ink-5)',
  done:    'var(--moss)',
};

export function StatusDonut({ slices }: Props) {
  const total = slices.reduce((acc, s) => acc + s.count, 0);
  const segments = useMemo(() => {
    const out: { color: string; len: number; offset: number }[] = [];
    let acc = 0;
    for (const s of slices) {
      const len = total === 0 ? 0 : (s.count / total) * CIRC;
      out.push({ color: COLOR[s.status], len, offset: -acc });
      acc += len;
    }
    return out;
  }, [slices, total]);

  return (
    <div className="ana-card">
      <div className="ana-card-eyebrow">Goal status</div>
      <h3 className="ana-card-title">Distribution across {total} {total === 1 ? 'goal' : 'goals'}</h3>

      <div className="ana-donut-wrap">
        <div className="ana-donut">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none" stroke="var(--cream)" strokeWidth={STROKE}
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
            <text
              x={SIZE / 2} y={SIZE / 2 + 6}
              textAnchor="middle"
              transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}
              className="ana-donut-center"
              fontSize={22}
            >{total}</text>
          </svg>
        </div>
        <div className="ana-donut-legend">
          {slices.map((s) => {
            const pct = total === 0 ? 0 : Math.round((s.count / total) * 100);
            return (
              <div key={s.status} className="ana-donut-row">
                <span className="swatch" style={{ background: COLOR[s.status] }} />
                <span>{s.label}</span>
                <span className="count">{s.count} · {pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

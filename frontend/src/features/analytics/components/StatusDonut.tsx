import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import { completionRate, currentStreak } from '../../routines/lib/heatmap';

interface Props {
  routines: Routine[];
}

const SEG = [
  { key: 'strong',   label: 'Strong streak', color: 'var(--moss)'   },
  { key: 'active',   label: 'Active',        color: 'var(--indigo)' },
  { key: 'slipping', label: 'Slipping',      color: 'var(--ochre)'  },
  { key: 'paused',   label: 'On hold',       color: 'var(--rust)'   },
] as const;

type SegKey = typeof SEG[number]['key'];

function categorize(r: Routine): SegKey {
  if (r.is_paused) return 'paused';
  if (currentStreak(r) >= 7) return 'strong';
  if (completionRate(r, 30) < 50) return 'slipping';
  return 'active';
}

const SIZE = 200;
const CX = 100;
const CY = 100;
const R_OUTER = 92;
const R_INNER = 60;

/** Build the SVG path for a donut segment between two angles (radians, 0 = top). */
function donutPath(startAngle: number, endAngle: number): string {
  const ax = CX + R_OUTER * Math.sin(startAngle);
  const ay = CY - R_OUTER * Math.cos(startAngle);
  const bx = CX + R_OUTER * Math.sin(endAngle);
  const by = CY - R_OUTER * Math.cos(endAngle);
  const cx = CX + R_INNER * Math.sin(endAngle);
  const cy = CY - R_INNER * Math.cos(endAngle);
  const dx = CX + R_INNER * Math.sin(startAngle);
  const dy = CY - R_INNER * Math.cos(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} ` +
         `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${bx.toFixed(2)} ${by.toFixed(2)} ` +
         `L ${cx.toFixed(2)} ${cy.toFixed(2)} ` +
         `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${dx.toFixed(2)} ${dy.toFixed(2)} Z`;
}

export function StatusDonut({ routines }: Props) {
  const counts = useMemo(() => {
    const out: Record<SegKey, number> = { strong: 0, active: 0, slipping: 0, paused: 0 };
    for (const r of routines) out[categorize(r)]++;
    return out;
  }, [routines]);

  const total = routines.length;

  // Build segment paths.
  const paths = useMemo(() => {
    if (total === 0) return [] as { key: SegKey; color: string; d: string }[];
    const out: { key: SegKey; color: string; d: string }[] = [];
    let acc = 0;
    for (const { key, color } of SEG) {
      const v = counts[key];
      if (v === 0) continue;
      const start = (acc / total) * Math.PI * 2;
      acc += v;
      const end = (acc / total) * Math.PI * 2;
      out.push({ key, color, d: donutPath(start, end) });
    }
    return out;
  }, [counts, total]);

  return (
    <div className="ana-card-chart ana-card-donut">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Routines by status</h3>
          <p className="acc-sub">{total} {total === 1 ? 'practice' : 'practices'}</p>
        </div>
      </header>
      <div className="donut-block">
        <div className="donut-svg-wrap">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut-svg">
            {total === 0 ? (
              <circle cx={CX} cy={CY} r={R_OUTER} fill="var(--cream)" />
            ) : (
              paths.map((p) => <path key={p.key} d={p.d} fill={p.color} />)
            )}
            <text
              x={CX} y={CY - 4}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize={28}
              fontFamily="Fraunces"
              fontWeight={500}
              letterSpacing="-0.02em"
            >{total}</text>
            <text
              x={CX} y={CY + 14}
              textAnchor="middle"
              fill="var(--ink-4)"
              fontSize={10}
              fontFamily="Inter"
              fontWeight={500}
              letterSpacing="0.10em"
            >ROUTINES</text>
          </svg>
        </div>
        <div className="donut-legend">
          {SEG.map(({ key, label, color }) => (
            <div key={key} className="donut-legend-row">
              <span className="dl-swatch" style={{ background: color }} />
              <span className="dl-label">{label}</span>
              <span className="dl-num">{counts[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

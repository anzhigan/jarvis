import type { KPI } from '../hooks/useAnalytics';

/**
 * 2×2 KPI grid with display-typography numbers, italic unit accent, and an
 * optional trend line. Replaces the v4 single-row stats strip.
 */
function splitValue(raw: string): { num: string; unit: string } {
  const m = raw.match(/^([\d.,-]+)(.*)$/);
  if (!m) return { num: raw, unit: '' };
  return { num: m[1], unit: m[2] };
}

interface Props {
  kpis: KPI[];
  /** Optional per-key trend line: text + direction (up/down/neutral). */
  trends?: Record<string, { label: string; dir: 'up' | 'down' | 'neutral' }>;
}

export function KpiGrid({ kpis, trends }: Props) {
  return (
    <div className="kpi-grid">
      {kpis.map((kpi) => {
        const { num, unit } = splitValue(kpi.value);
        const trend = trends?.[kpi.key];
        return (
          <div key={kpi.key} className="kpi-tile">
            <div className="kpi-num">
              {num}
              {unit && <em>{unit}</em>}
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className={`kpi-trend kpi-trend-${trend?.dir ?? 'neutral'}`}>
              {trend?.label ?? kpi.foot}
            </div>
          </div>
        );
      })}
    </div>
  );
}

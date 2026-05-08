import type { KPI } from '../hooks/useAnalytics';

/**
 * Indigo Editorial 4-cell KPI strip — large display number with italic unit
 * accent and an optional foot line. Hairline rule top + bottom, vertical
 * hairlines between cells. Maps directly onto the gallery's `.ana-stats-row`.
 *
 * The hook gives a plain string for the value (e.g. "47" or "87%"). We split
 * the value into the leading numeric portion and the trailing unit so the
 * unit renders as italic Source Serif 4 to match the gallery aesthetic.
 */
function splitValue(raw: string): { num: string; unit: string } {
  const m = raw.match(/^([\d.,-]+)(.*)$/);
  if (!m) return { num: raw, unit: '' };
  return { num: m[1], unit: m[2] };
}

export function KPIStrip({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="ana-stats-row">
      {kpis.map((kpi) => {
        const { num, unit } = splitValue(kpi.value);
        return (
          <div key={kpi.key} className="ana-stat">
            <div className="ana-stat-num">
              {num}
              {unit && <em>{unit}</em>}
            </div>
            <div className="ana-stat-label">{kpi.label}</div>
            <div className="ana-stat-foot">{kpi.foot}</div>
          </div>
        );
      })}
    </div>
  );
}

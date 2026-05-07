import { CheckCircle2, Repeat, Flame, TrendingUp } from 'lucide-react';
import type { KPI } from '../hooks/useAnalytics';

const ICONS: Record<KPI['key'], React.ElementType> = {
  goals_done:      CheckCircle2,
  routines_logged: Repeat,
  streaks:         Flame,
  today_rate:      TrendingUp,
};

export function KPIStrip({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="kpi-strip">
      {kpis.map((kpi) => {
        const Icon = ICONS[kpi.key];
        return (
          <div key={kpi.key} className="kpi-card" style={{ ['--kpi-color' as any]: kpi.color }}>
            <div className="kpi-head">
              <span className="kpi-icon"><Icon /></span>
              <span className="kpi-label">{kpi.label}</span>
            </div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-foot">{kpi.foot}</div>
          </div>
        );
      })}
    </div>
  );
}

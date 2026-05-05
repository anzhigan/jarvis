import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import { cellColor, entriesByDate, isScheduledOn, lastNDays, ymd } from './heatmap';

interface Props {
  routine: Routine;
  days: number;
  onCellClick: (date: string, currentValue: number) => void;
}

export function RoutineHeatmap({ routine, days, onCellClick }: Props) {
  const dates = useMemo(() => lastNDays(days), [days]);
  const map = useMemo(() => entriesByDate(routine.entries ?? []), [routine.entries]);
  const today = new Date();
  const baseColor = routine.color || '#10B981';

  return (
    <div className="rt-heatmap" role="grid" aria-label={`Heatmap for ${routine.title}`}>
      {dates.map((d) => {
        const key = ymd(d);
        const entry = map.get(key);
        const value = entry?.value ?? 0;
        const future = d.getTime() > today.getTime() + 86_400_000 - 1;
        const scheduled = isScheduledOn(routine, d);
        const color = cellColor(routine, value, baseColor);
        const tip = `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${
          value > 0
            ? routine.kind === 'numeric' ? `${value}${routine.unit ? ` ${routine.unit}` : ''}` : 'Done'
            : scheduled ? 'Missed' : '—'
        }`;
        return (
          <button
            key={key}
            type="button"
            className="rt-heatcell"
            data-future={future || undefined}
            data-out-of-window={!scheduled || undefined}
            style={{ background: color }}
            title={tip}
            onClick={() => !future && onCellClick(key, value)}
          />
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import type { Routine } from '../../../api/types';
import { addDays, cellColor, entriesByDate, startOfDay, ymd } from '../lib/heatmap';

interface Props {
  routine: Routine;
  /** When true, scroll the grid to the right edge (today) on mount and on
   *  routine change. The drawer uses this; the inline expand toggle does
   *  too — both want the newest weeks visible first. */
  autoScrollEnd?: boolean;
  /** Heading shown above the grid (e.g. "Full history"). Pass null to
   *  suppress — useful when the inline expand row already provides a label. */
  heading?: string | null;
  /** Optional subtitle to the right of the heading (e.g. entry count). */
  subTitle?: string;
}

/** Github-style weeks × weekdays grid covering the whole observation period
 *  of a single routine. Reused by RoutineDetailPanel (drawer) and inline
 *  expand-row in RoutinesView. */
export function RoutineHistoryHeatmap({
  routine, autoScrollEnd = true, heading = 'Full history', subTitle,
}: Props) {
  const heatmap = useMemo(() => {
    const startISO = routine.start_date
      ?? (routine.created_at ? routine.created_at.slice(0, 10) : null);
    if (!startISO) return { weeks: [], months: [], todayKey: ymd(new Date()) };
    const startD = startOfDay(new Date(startISO));
    const dow = startD.getDay();
    const gridStart = addDays(startD, -dow);
    const endD = routine.end_date
      ? startOfDay(new Date(routine.end_date))
      : startOfDay(new Date());
    const totalDays = Math.max(
      0,
      Math.round((endD.getTime() - gridStart.getTime()) / 86_400_000) + 1,
    );
    const weeksCount = Math.max(1, Math.ceil(totalDays / 7));
    const map = entriesByDate(routine.entries ?? []);
    const todayKey = ymd(new Date());

    interface Cell { date: string; value: number; inWindow: boolean; isToday: boolean }
    const weeks: Cell[][] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeksCount; w++) {
      const col: Cell[] = [];
      let weekStartMonth = -1;
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        if (d === 0) weekStartMonth = date.getMonth();
        const k = ymd(date);
        const inWindow = date >= startD && date <= endD;
        const e = map.get(k);
        col.push({
          date: k,
          value: e?.value ?? 0,
          inWindow,
          isToday: k === todayKey,
        });
      }
      if (weekStartMonth !== lastMonth) {
        const refDate = addDays(gridStart, w * 7);
        months.push({
          col: w,
          label: refDate.toLocaleDateString(undefined, { month: 'short' }),
        });
        lastMonth = weekStartMonth;
      }
      weeks.push(col);
    }
    return { weeks, months, todayKey };
  }, [routine.start_date, routine.end_date, routine.created_at, routine.entries]);

  const tipForCell = (value: number): string => {
    if (value <= 0) return 'no entry';
    if (routine.kind === 'numeric') {
      return `${value}${routine.unit ? ' ' + routine.unit : ''}`;
    }
    return 'done';
  };

  // Right-anchor scroll: long histories grow rightward; newest is the
  // signal users care about first.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoScrollEnd) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
    return () => cancelAnimationFrame(id);
  }, [autoScrollEnd, routine.id]);

  if (heatmap.weeks.length === 0) return null;

  const target = routine.target_value ?? 1;

  return (
    <div className="rt-heatmap">
      {heading !== null && (
        <div className="rt-heatmap__head">
          <span>{heading}</span>
          {subTitle && <span className="rt-heatmap__sub">{subTitle}</span>}
        </div>
      )}
      <div className="rt-heatmap__scroller" ref={scrollRef}>
        <div
          className="rt-heatmap__grid"
          style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 11px)` }}
        >
          <div
            className="rt-heatmap__months"
            style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 11px)` }}
          >
            {heatmap.months.map((m) => (
              <span
                key={m.col}
                className="rt-heatmap__month"
                style={{ gridColumn: `${m.col + 1} / span 1` }}
              >{m.label}</span>
            ))}
          </div>
          {heatmap.weeks.map((week, wi) => (
            <div key={wi} className="rt-heatmap__week">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  className="rt-heatmap__cell"
                  data-empty={!cell.inWindow || undefined}
                  data-today={cell.isToday || undefined}
                  title={`${cell.date} · ${tipForCell(cell.value)}`}
                  style={cell.inWindow
                    ? { background: cellColor(routine, cell.value, routine.color) }
                    : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="rt-heatmap__legend">
        <span>Less</span>
        <span className="rt-heatmap__sw" style={{ background: 'var(--bg-hover)' }} />
        <span className="rt-heatmap__sw" style={{ background: cellColor(routine, target * 0.25, routine.color) }} />
        <span className="rt-heatmap__sw" style={{ background: cellColor(routine, target * 0.5, routine.color) }} />
        <span className="rt-heatmap__sw" style={{ background: cellColor(routine, target * 0.85, routine.color) }} />
        <span className="rt-heatmap__sw" style={{ background: routine.color }} />
        <span>More</span>
      </div>
    </div>
  );
}

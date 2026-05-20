import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Routine } from '../../../api/types';
import { cellState, entriesByDate, ymd } from '../lib/heatmap';

interface Props {
  routine: Routine;
  /** Heading text. Pass null to render no heading row (the inline expand
   *  row already provides its own visual anchor). */
  heading?: string | null;
  /** Optional subtitle alongside the heading (e.g. entry count). */
  subTitle?: string;
}

/** Lower bound for month paging — the user asked for navigation back to 2025.
 *  Anything earlier (e.g. an older routine with start_date < 2025) is also
 *  reachable because we allow paging back as long as the floor month is
 *  reachable; this constant just sets the *floor* the paging won't cross. */
const FLOOR_YEAR = 2025;
const FLOOR_MONTH = 0;  // January

/** Single-month paged calendar of a routine's daily entries. Each cell uses
 *  the same `.hg-cell` / `.hg-cell-{state}` classes as the inline 14-day
 *  strip — so colors and shape match exactly. Squares are bigger because
 *  the grid is 7 columns wide instead of 14, but the visual vocabulary
 *  (moss/rust/dashed-cream) is identical. */
export function RoutineHistoryHeatmap({
  routine, heading = null, subTitle,
}: Props) {
  // View state: which month is shown. Default = today's month.
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayKey = ymd(today);

  // Cells for the current month. Pad leading cells with empty placeholders
  // so the 1st sits in its real weekday column. Renamed `month` outer-binding
  // to `monthCells` to avoid shadowing `view.month` inside the callback —
  // some minifiers garble that pattern.
  const monthCells = useMemo(() => {
    const year = view.year;
    const m = view.month;
    const first = new Date(year, m, 1);
    const firstDow = first.getDay(); // 0 = Sun
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const map = entriesByDate(routine.entries ?? []);
    const startISO = routine.start_date
      ?? (routine.created_at ? routine.created_at.slice(0, 10) : null);
    const startD = startISO ? new Date(startISO) : null;
    if (startD) startD.setHours(0, 0, 0, 0);
    const endD = routine.end_date ? new Date(routine.end_date) : null;
    if (endD) endD.setHours(0, 0, 0, 0);

    interface Cell {
      kind: 'pad' | 'day';
      key: string;
      day?: number;
      ymdKey?: string;
      state?: 'done' | 'partial' | 'skipped' | 'empty';
      isToday?: boolean;
      outOfWindow?: boolean;
    }
    const cells: Cell[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push({ kind: 'pad', key: `p-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m, d);
      const k = ymd(date);
      const entry = map.get(k);
      const outBefore = startD ? date < startD : false;
      const outAfter  = endD   ? date > endD   : false;
      const outFuture = date > today;
      const outOfWindow = outBefore || outAfter || outFuture;
      cells.push({
        kind: 'day',
        key: k,
        day: d,
        ymdKey: k,
        state: outOfWindow ? 'empty' : cellState(routine, entry),
        isToday: k === todayKey,
        outOfWindow,
      });
    }
    return cells;
  }, [view, routine, today, todayKey]);

  const monthLabel = useMemo(() => {
    const d = new Date(view.year, view.month, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [view]);

  // Reachability of prev/next buttons. Floor is max(Jan 2025, start_date's
  // month); ceiling is today's month.
  const { canPrev, canNext } = useMemo(() => {
    const startISO = routine.start_date
      ?? (routine.created_at ? routine.created_at.slice(0, 10) : null);
    const startD = startISO ? new Date(startISO) : null;
    const floorYear  = Math.max(FLOOR_YEAR,  startD ? startD.getFullYear()  : FLOOR_YEAR);
    const floorMonth = startD && startD.getFullYear() > FLOOR_YEAR
      ? startD.getMonth() : FLOOR_MONTH;
    const todayYear  = today.getFullYear();
    const todayMonth = today.getMonth();
    const atFloor = view.year < floorYear
      || (view.year === floorYear && view.month <= floorMonth);
    const atToday = view.year > todayYear
      || (view.year === todayYear && view.month >= todayMonth);
    return { canPrev: !atFloor, canNext: !atToday };
  }, [view, routine.start_date, routine.created_at, today]);

  const stepMonth = (delta: number) => {
    setView((cur) => {
      const m = cur.month + delta;
      const yShift = Math.floor(m / 12);
      const newMonth = ((m % 12) + 12) % 12;
      return { year: cur.year + yShift, month: newMonth };
    });
  };

  return (
    <div className="rt-month">
      {heading !== null && (
        <div className="rt-month__heading">
          <span>{heading}</span>
          {subTitle && <span className="rt-month__heading-sub">{subTitle}</span>}
        </div>
      )}
      <div className="rt-month__nav">
        <button
          type="button"
          className="rt-month__nav-btn"
          onClick={() => stepMonth(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          title="Previous month"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="rt-month__title">{monthLabel}</div>
        <button
          type="button"
          className="rt-month__nav-btn"
          onClick={() => stepMonth(1)}
          disabled={!canNext}
          aria-label="Next month"
          title="Next month"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="rt-month__wd-row">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <span key={i} className="rt-month__wd">{w}</span>
        ))}
      </div>
      <div className="rt-month__grid">
        {monthCells.map((cell) => {
          if (cell.kind === 'pad') {
            return <span key={cell.key} className="rt-month__pad" />;
          }
          const stateClass = `hg-cell hg-cell-${cell.state}`;
          return (
            <span
              key={cell.key}
              className={`${stateClass} rt-month__day`}
              data-today={cell.isToday || undefined}
              data-out={cell.outOfWindow || undefined}
              title={`${cell.ymdKey} · ${cell.state}`}
            >
              <span className="rt-month__day-num">{cell.day}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

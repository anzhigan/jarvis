import { useMemo } from 'react';
import type { Go, Routine } from '../../../api/types';
import { isScheduledOn, ymd } from '../../routines/lib/heatmap';
import { MobileBottomSheet } from './MobileBottomSheet';

interface Props {
  /** Picked date in YYYY-MM-DD, or null when no day is selected. */
  date: string | null;
  routines: Routine[];
  gos: Go[];
  /** 7-day moving average ending on `date` — passed in from the chart so we
   *  don't recompute the series here. */
  rhythmAvg7: number | null;
  /** Today's value of the chart's combined metric (routines+gos %). Drives
   *  the above/below/on rhythm verdict against `rhythmAvg7`. */
  todayLoad: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RoutineRowState = 'done' | 'partial' | 'skipped' | 'missed' | 'pending' | 'off';
interface RoutineRow {
  id: string;
  title: string;
  state: RoutineRowState;
  valueLabel: string;
}

interface GoRow {
  id: string;
  title: string;
  state: 'done' | 'pending';
  valueLabel: string;
}

/**
 * Day-detail sheet — opened when the user taps a point on the Daily
 * completion chart. Mirrors desktop's click-to-inspect day panel but
 * stacked vertically for mobile.
 *
 * Sections:
 *   1. Routines — every routine scheduled OR logged that day, with state.
 *   2. Go-targets — every go with a positive entry that day, plus any due.
 *   3. Rhythm — today's load vs the 7-day moving average ending on that
 *      day. Same arrow / tone vocabulary as Routine detail's rhythm card.
 */
export function MobileDayDetailSheet({
  date, routines, gos, rhythmAvg7, todayLoad, open, onOpenChange,
}: Props) {
  // Hooks need to run even when `date` is null — controlled sheet pattern.
  const dateObj = useMemo(() => date ? new Date(date) : null, [date]);

  const routineRows = useMemo<RoutineRow[]>(() => {
    if (!date || !dateObj) return [];
    const out: RoutineRow[] = [];
    const todayKey = ymd(new Date());
    for (const r of routines) {
      const entry = r.entries.find((e) => e.date === date);
      const scheduled = isScheduledOn(r, dateObj);
      let state: RoutineRowState = 'off';
      let valueLabel = '—';
      if (entry) {
        if (entry.value <= 0) {
          state = 'skipped';
          valueLabel = 'skipped';
        } else if (r.kind === 'numeric') {
          state = (r.target_value && entry.value < r.target_value) ? 'partial' : 'done';
          valueLabel = `${entry.value}${r.unit ? ' ' + r.unit : ''}`;
        } else {
          state = 'done';
          valueLabel = 'done';
        }
      } else if (scheduled) {
        // No entry but scheduled — pending for today / today+future, missed
        // for the past.
        state = (date >= todayKey) ? 'pending' : 'missed';
        valueLabel = state === 'pending' ? '—' : 'missed';
      } else {
        // Off-day with no entry: hide from the list so quiet days don't
        // produce a wall of "—" rows.
        continue;
      }
      out.push({ id: r.id, title: r.title, state, valueLabel });
    }
    // Sort: done first → partial → pending → skipped → missed → off.
    const rank: Record<RoutineRowState, number> = {
      done: 0, partial: 1, pending: 2, skipped: 3, missed: 4, off: 5,
    };
    out.sort((a, b) => rank[a.state] - rank[b.state]);
    return out;
  }, [date, dateObj, routines]);

  const goRows = useMemo<GoRow[]>(() => {
    if (!date) return [];
    const out: GoRow[] = [];
    for (const g of gos) {
      // Sum positive entries that day (handles numeric "log twice on
      // Sunday" cases) and check whether the go was due that day.
      let dayValue = 0;
      for (const e of g.entries) {
        if (e.date === date && e.value > 0) dayValue += e.value;
      }
      const dueThatDay = g.due_date === date;
      if (dayValue <= 0 && !dueThatDay) continue;
      const state: GoRow['state'] = dayValue > 0 ? 'done' : 'pending';
      const valueLabel = dayValue > 0
        ? (g.unit ? `${dayValue} ${g.unit}` : dayValue > 1 ? `×${dayValue}` : 'done')
        : 'due';
      out.push({ id: g.id, title: g.title, state, valueLabel });
    }
    out.sort((a, b) => (a.state === b.state ? 0 : a.state === 'done' ? -1 : 1));
    return out;
  }, [date, gos]);

  const rhythm = useMemo(() => {
    if (rhythmAvg7 === null) {
      return { tone: 'on' as const, pct: 0, hasBaseline: false };
    }
    if (rhythmAvg7 === 0) {
      return {
        tone: (todayLoad > 0 ? 'above' : 'on') as 'above' | 'on',
        pct: todayLoad > 0 ? 100 : 0,
        hasBaseline: true,
      };
    }
    const pct = Math.round(((todayLoad - rhythmAvg7) / rhythmAvg7) * 100);
    let tone: 'above' | 'below' | 'on' = 'on';
    if (pct > 10) tone = 'above';
    else if (pct < -10) tone = 'below';
    return { tone, pct, hasBaseline: true };
  }, [rhythmAvg7, todayLoad]);

  if (!date || !dateObj) return null;

  const niceDate = isNaN(dateObj.getTime())
    ? date
    : dateObj.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

  // Schedule-vs-hit summary for routines (used as the description).
  let routSched = 0, routHit = 0;
  for (const r of routineRows) {
    if (r.state === 'off') continue;
    routSched++;
    if (r.state === 'done' || r.state === 'partial') routHit++;
  }

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={niceDate}
      description={
        routSched > 0
          ? `${routHit} of ${routSched} routines · ${goRows.filter((g) => g.state === 'done').length} go${goRows.filter((g) => g.state === 'done').length === 1 ? '' : 's'} worked`
          : `${goRows.filter((g) => g.state === 'done').length} go${goRows.filter((g) => g.state === 'done').length === 1 ? '' : 's'} worked`
      }
    >
      {/* ── Routines ─────────────────────────────────────────────────── */}
      <section className="m-day-sec">
        <h3 className="m-day-sec__title">Routines</h3>
        {routineRows.length === 0 ? (
          <div className="m-day-empty">No routines tracked.</div>
        ) : (
          <div>
            {routineRows.map((r) => (
              <div key={r.id} className="m-day-row" data-state={r.state}>
                <span className="m-day-dot" />
                <span className="m-day-row__title">{r.title}</span>
                <span className="m-day-row__sub">{r.valueLabel}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Go-targets ───────────────────────────────────────────────── */}
      <section className="m-day-sec">
        <h3 className="m-day-sec__title">Go-targets</h3>
        {goRows.length === 0 ? (
          <div className="m-day-empty">Nothing logged or due.</div>
        ) : (
          <div>
            {goRows.map((g) => (
              <div key={g.id} className="m-day-row" data-state={g.state}>
                <span className="m-day-dot" />
                <span className="m-day-row__title">{g.title}</span>
                <span className="m-day-row__sub">{g.valueLabel}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Rhythm vs 7-day avg ──────────────────────────────────────── */}
      <section className="m-day-sec">
        <h3 className="m-day-sec__title">Rhythm</h3>
        <div className="m-day-rhythm" data-tone={rhythm.tone}>
          <span className="m-day-rhythm__arrow">
            {rhythm.tone === 'above' ? '▲' : rhythm.tone === 'below' ? '▼' : '='}
          </span>
          <div>
            <div className="m-day-rhythm__line">
              <strong>{Math.round(todayLoad)}</strong> activity{' '}
              <span style={{ color: 'var(--ink-4)' }}>this day</span>
            </div>
            <div className="m-day-rhythm__sub">
              {rhythm.hasBaseline ? (
                <>
                  7-day avg {rhythmAvg7 === null ? '—' : Math.round(rhythmAvg7)}
                  {rhythm.tone !== 'on' && (
                    <> · {rhythm.pct > 0 ? '+' : ''}{rhythm.pct}%</>
                  )}
                </>
              ) : (
                <>not enough history yet</>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Breathing room above the tab bar */}
      <div style={{ height: 12 }} />
    </MobileBottomSheet>
  );
}

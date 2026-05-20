import { useMemo } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import type { Routine } from '../../../api/types';
import type { RoutinesLibrary } from '../../routines/hooks/useRoutines';
import {
  addDays, completionRate, currentStreak, entriesByDate, isScheduledOn,
  scheduleLabel, startOfDay, ymd,
} from '../../routines/lib/heatmap';
import { buildDailySeries, buildPulsePaths } from '../../routines/lib/pulse';
import { RoutineHistoryHeatmap } from '../../routines/components/RoutineHistoryHeatmap';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';
import { MobileListGroup, MobileListCell } from './MobileList';
import { MobileSwitch } from './MobileSwitch';
// Calendar (.rt-month) styles live in the desktop routines.css — imported
// here so the sheet renders correctly even when the user lands on Routines
// before any desktop view that would have loaded it.
import '../../routines/components/routines.css';

interface Props {
  routine: Routine | null;
  library: RoutinesLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the RoutineForm bottom-sheet for title/description/schedule edits. */
  onEdit: () => void;
  /** Open the destructive confirm sheet. The parent owns the confirm so the
   *  detail sheet can close while the confirm slides in. */
  onDelete: () => void;
}

const TREND_DAYS = 30;
const PULSE_W = 280;
const PULSE_H = 100;
const RHYTHM_WEEKS = 4;

/**
 * Mobile detail view for a single routine. Opens as a bottom sheet on tap
 * of a RoutineCard. Vertical stack of:
 *
 *   1. Stat triplet — current streak / best (30d) / 30-day rate.
 *   2. Calendar — paged month grid (shared `RoutineHistoryHeatmap`).
 *   3. Trend — same 30-day smoothed line as Analysis "Per-routine pulse";
 *      color tone from design-system state palette (moss/ochre/rust).
 *   4. Rhythm — this-week vs 4-week-avg with arrow + delta.
 *   5. Pause / Delete actions — inset list at the bottom.
 *
 * Primary actions in the sheet footer:
 *   - "Edit" (tinted) → opens RoutineForm for full field editing.
 *   - "Done" (filled) → closes the sheet.
 */
export function MobileRoutineDetailSheet({
  routine, library, open, onOpenChange, onEdit, onDelete,
}: Props) {
  // Hooks must run unconditionally regardless of `routine` — the sheet is
  // controlled, and `routine` can be null when the parent is unmounting it
  // mid-transition (drag-down dismissal).
  const series = useMemo(
    () => routine ? buildDailySeries(routine, TREND_DAYS) : [],
    [routine],
  );
  const pulse = useMemo(
    () => buildPulsePaths(series, PULSE_W, PULSE_H, 5),
    [series],
  );
  const rawHits = useMemo(() => series.map((v) => v > 0), [series]);

  const rate30 = useMemo(
    () => routine ? completionRate(routine, 30) : 0,
    [routine],
  );
  const streak = useMemo(
    () => routine ? currentStreak(routine) : 0,
    [routine],
  );
  // Best streak within the trend window — keeps the comparison fresh.
  // A 30-day window matches what the desktop expanded row shows.
  const best = useMemo(() => {
    let b = 0, run = 0;
    for (const hit of rawHits) {
      if (hit) { run++; if (run > b) b = run; } else { run = 0; }
    }
    return b;
  }, [rawHits]);

  const state: 'strong' | 'warm' | 'slip' =
    rate30 >= 80 ? 'strong' : rate30 >= 50 ? 'warm' : 'slip';

  // Rhythm — same window math as desktop RoutineExpandedDetails so the
  // mobile sheet and the desktop expanded row tell the same story.
  const rhythm = useMemo(() => {
    if (!routine) {
      return { thisHit: 0, thisSched: 0, prevRatePct: 0, deltaPct: 0,
               tone: 'on' as const, hasBaseline: false };
    }
    const today = startOfDay(new Date());
    const map = entriesByDate(routine.entries ?? []);
    const dow = today.getDay();
    const monOffset = dow === 0 ? 6 : dow - 1;
    const thisMonday = addDays(today, -monOffset);
    const countWindow = (start: Date, end: Date) => {
      let sched = 0, hit = 0;
      const ms = startOfDay(start).getTime();
      const me = startOfDay(end).getTime();
      for (let t = ms; t <= me; t += 86_400_000) {
        const d = new Date(t);
        if (d > today) break;
        if (!isScheduledOn(routine, d)) continue;
        sched++;
        const e = map.get(ymd(d));
        if (e && e.value > 0) hit++;
      }
      return { sched, hit };
    };
    const thisWeek = countWindow(thisMonday, today);
    const prevSun = addDays(thisMonday, -1);
    const prevStart = addDays(prevSun, -(RHYTHM_WEEKS * 7 - 1));
    const prev = countWindow(prevStart, prevSun);
    const thisRate = thisWeek.sched > 0 ? thisWeek.hit / thisWeek.sched : 0;
    const prevRate = prev.sched > 0 ? prev.hit / prev.sched : 0;
    const deltaPct = prevRate > 0
      ? Math.round(((thisRate - prevRate) / prevRate) * 100)
      : (thisRate > 0 ? 100 : 0);
    let tone: 'above' | 'below' | 'on' = 'on';
    if (prev.sched > 0) {
      if (deltaPct > 10) tone = 'above';
      else if (deltaPct < -10) tone = 'below';
    }
    return {
      thisHit: thisWeek.hit,
      thisSched: thisWeek.sched,
      prevRatePct: Math.round(prevRate * 100),
      deltaPct,
      tone,
      hasBaseline: prev.sched > 0,
    };
  }, [routine]);

  if (!routine) return null;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={routine.title}
      description={`${scheduleLabel(routine)}${routine.is_paused ? ' · On hold' : ''}`}
      footer={
        <>
          <MobileButton variant="tinted" block onClick={onEdit}>Edit</MobileButton>
          <MobileButton variant="filled" block onClick={() => onOpenChange(false)}>Done</MobileButton>
        </>
      }
    >
      {/* ── Stat triplet ─────────────────────────────────────────────── */}
      <div className="m-rsd__stats">
        <div className="m-rsd__stat">
          <div className="m-rsd__stat-num">{streak}<em>d</em></div>
          <div className="m-rsd__stat-lab">Current</div>
        </div>
        <div className="m-rsd__stat">
          <div className="m-rsd__stat-num">{best}<em>d</em></div>
          <div className="m-rsd__stat-lab">Best · 30d</div>
        </div>
        <div className="m-rsd__stat">
          <div className="m-rsd__stat-num">{rate30}<em>%</em></div>
          <div className="m-rsd__stat-lab">30d rate</div>
        </div>
      </div>

      {/* ── Calendar ─────────────────────────────────────────────────── */}
      <div className="m-rsd__section">
        <h3 className="m-rsd__sec-title">Calendar</h3>
        <div className="m-rsd__cal-wrap">
          <RoutineHistoryHeatmap routine={routine} heading={null} />
        </div>
      </div>

      {/* ── Trend ────────────────────────────────────────────────────── */}
      <div className="m-rsd__section">
        <h3 className="m-rsd__sec-title">Trend · 30 days</h3>
        <div className="m-rsd__trend" data-state={state}>
          <svg
            className="m-rsd__trend-svg"
            viewBox={`0 0 ${PULSE_W} ${PULSE_H}`}
            preserveAspectRatio="none"
          >
            <line
              className="m-rsd__trend-axis"
              x1={0} x2={PULSE_W}
              y1={pulse.baselineY} y2={pulse.baselineY}
            />
            {pulse.weekTicks.map((x, i) => (
              <line
                key={i}
                className="m-rsd__trend-week"
                x1={x} x2={x} y1={0} y2={PULSE_H}
              />
            ))}
            {pulse.area && <path className="m-rsd__trend-area" d={pulse.area} />}
            {pulse.line && <path className="m-rsd__trend-line" d={pulse.line} />}
            {pulse.pts.length > 0 && (
              <>
                <circle
                  className="m-rsd__trend-min"
                  cx={pulse.pts[pulse.minIdx][0]}
                  cy={pulse.pts[pulse.minIdx][1]}
                  r={2.6}
                />
                <circle
                  className="m-rsd__trend-max"
                  cx={pulse.pts[pulse.maxIdx][0]}
                  cy={pulse.pts[pulse.maxIdx][1]}
                  r={2.6}
                />
                <circle
                  className="m-rsd__trend-now"
                  cx={pulse.pts[pulse.pts.length - 1][0]}
                  cy={pulse.pts[pulse.pts.length - 1][1]}
                  r={3.4}
                />
              </>
            )}
          </svg>
          <div className="m-rsd__trend-axis-lab">
            <span>30d ago</span>
            <span>today</span>
          </div>
        </div>
      </div>

      {/* ── Rhythm ───────────────────────────────────────────────────── */}
      <div className="m-rsd__section">
        <h3 className="m-rsd__sec-title">Rhythm</h3>
        <div className="m-rsd__rhythm" data-tone={rhythm.tone}>
          <span className="m-rsd__rhythm-arrow">
            {rhythm.tone === 'above' ? '▲' : rhythm.tone === 'below' ? '▼' : '='}
          </span>
          <div className="m-rsd__rhythm-text">
            <div className="m-rsd__rhythm-line">
              <strong>{rhythm.thisHit}/{rhythm.thisSched || '–'}</strong> this week
            </div>
            <div className="m-rsd__rhythm-sub">
              {rhythm.hasBaseline ? (
                <>
                  4-week avg {rhythm.prevRatePct}%
                  {rhythm.tone !== 'on' && (
                    <> · {rhythm.deltaPct > 0 ? '+' : ''}{rhythm.deltaPct}%</>
                  )}
                </>
              ) : (
                <>not enough history yet</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pause / Delete ──────────────────────────────────────────── */}
      <div className="m-rsd__section">
        <MobileListGroup>
          <MobileListCell
            icon={routine.is_paused ? <Play size={15} /> : <Pause size={15} />}
            iconColor={routine.is_paused ? 'moss' : 'slate'}
            title={routine.is_paused ? 'On hold' : 'Tracking'}
            subtitle={routine.is_paused
              ? 'Paused — toggle to resume'
              : 'Active — toggle to pause'}
            trailing={
              <MobileSwitch
                checked={!routine.is_paused}
                onCheckedChange={() => library.togglePause(routine.id, routine.is_paused)}
                aria-label="Tracking enabled"
              />
            }
          />
          <MobileListCell
            icon={<Trash2 size={15} />}
            iconColor="rust"
            title="Delete routine"
            destructive
            chevron
            onClick={() => {
              // Close THIS sheet first so the destructive confirm slides
              // in cleanly over the now-empty backdrop. The parent owns
              // the actual delete dispatch.
              onOpenChange(false);
              onDelete();
            }}
          />
        </MobileListGroup>
      </div>
    </MobileBottomSheet>
  );
}

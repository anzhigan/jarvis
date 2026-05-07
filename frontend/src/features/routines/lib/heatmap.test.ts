import { describe, expect, it } from 'vitest';
import {
  addDays,
  completionRate,
  currentStreak,
  diffDays,
  entriesByDate,
  isScheduledOn,
  lastNDays,
  scheduleLabel,
  startOfDay,
  ymd,
} from './heatmap';
import type { Routine } from '../../../api/types';

// ─── Tiny factory so tests aren't 30 lines of boilerplate per case ────────

function makeRoutine(over: Partial<Routine> = {}): Routine {
  const now = new Date();
  return {
    id: 'r1',
    user_id: 'u1',
    goal_id: null,
    step_id: null,
    title: 'Test routine',
    description: '',
    color: '#10B981',
    schedule_type: 'daily',
    schedule_days: '',
    schedule_n_days: 0,
    schedule_count_per_period: 0,
    schedule_period: 'week',
    start_date: null,
    end_date: null,
    is_paused: false,
    kind: 'boolean',
    unit: '',
    target_value: null,
    entries: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...over,
  };
}

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const T = (offsetDays: number) => addDays(TODAY, offsetDays);
const TS = (offsetDays: number) => ymd(T(offsetDays));

// ─── Date helpers ──────────────────────────────────────────────────────────

describe('ymd', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 4, 7))).toBe('2026-05-07');
  });

  it('zero-pads single-digit month and day', () => {
    expect(ymd(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('startOfDay', () => {
  it('strips time portion', () => {
    const d = new Date(2026, 4, 7, 13, 45, 30);
    const s = startOfDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(ymd(addDays(new Date(2026, 0, 1), 5))).toBe('2026-01-06');
  });
  it('handles negative days', () => {
    expect(ymd(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });
});

describe('diffDays', () => {
  it('returns difference in days', () => {
    expect(diffDays(new Date(2026, 0, 5), new Date(2026, 0, 1))).toBe(4);
  });
  it('returns negative when first is earlier', () => {
    expect(diffDays(new Date(2026, 0, 1), new Date(2026, 0, 5))).toBe(-4);
  });
});

describe('lastNDays', () => {
  it('returns N days ending today, oldest first', () => {
    const days = lastNDays(7, new Date(2026, 4, 7));
    expect(days).toHaveLength(7);
    expect(ymd(days[0])).toBe('2026-05-01');
    expect(ymd(days[6])).toBe('2026-05-07');
  });
});

describe('entriesByDate', () => {
  it('builds a map keyed by ymd', () => {
    const entries = [
      { id: '1', routine_id: 'r1', date: '2026-05-01', value: 1 },
      { id: '2', routine_id: 'r1', date: '2026-05-02', value: 0 },
    ];
    const m = entriesByDate(entries);
    expect(m.size).toBe(2);
    expect(m.get('2026-05-01')?.value).toBe(1);
  });
});

// ─── currentStreak ─────────────────────────────────────────────────────────

describe('currentStreak', () => {
  it('zero for routine with no entries', () => {
    expect(currentStreak(makeRoutine())).toBe(0);
  });

  it('counts consecutive done days back from today', () => {
    const r = makeRoutine({
      entries: [
        { id: '1', routine_id: 'r1', date: TS(0),  value: 1 },
        { id: '2', routine_id: 'r1', date: TS(-1), value: 1 },
        { id: '3', routine_id: 'r1', date: TS(-2), value: 1 },
      ],
    });
    expect(currentStreak(r)).toBe(3);
  });

  it("today unfinished doesn't break the streak", () => {
    // No entry for today, but yesterday and day-before were done
    const r = makeRoutine({
      entries: [
        { id: '1', routine_id: 'r1', date: TS(-1), value: 1 },
        { id: '2', routine_id: 'r1', date: TS(-2), value: 1 },
      ],
    });
    expect(currentStreak(r)).toBe(2);
  });

  it('breaks at the first missed day', () => {
    const r = makeRoutine({
      entries: [
        { id: '1', routine_id: 'r1', date: TS(0),  value: 1 },
        { id: '2', routine_id: 'r1', date: TS(-1), value: 1 },
        // gap on day -2
        { id: '3', routine_id: 'r1', date: TS(-3), value: 1 },
      ],
    });
    expect(currentStreak(r)).toBe(2);
  });
});

// ─── completionRate ────────────────────────────────────────────────────────

describe('completionRate', () => {
  it('zero for routine never logged', () => {
    expect(completionRate(makeRoutine())).toBe(0);
  });

  it('100% when all scheduled days are done', () => {
    const days = lastNDays(30);
    const entries = days.map((d, i) => ({
      id: `${i}`, routine_id: 'r1', date: ymd(d), value: 1,
    }));
    const r = makeRoutine({ entries });
    expect(completionRate(r, 30)).toBe(100);
  });

  it('around 50% when half the days are done', () => {
    const days = lastNDays(30);
    const entries = days.filter((_, i) => i % 2 === 0).map((d, i) => ({
      id: `${i}`, routine_id: 'r1', date: ymd(d), value: 1,
    }));
    const r = makeRoutine({ entries });
    const rate = completionRate(r, 30);
    expect(rate).toBeGreaterThanOrEqual(45);
    expect(rate).toBeLessThanOrEqual(55);
  });

  it('respects paused routines (returns 0 — no scheduled days)', () => {
    const r = makeRoutine({ is_paused: true });
    expect(completionRate(r, 30)).toBe(0);
  });
});

// ─── isScheduledOn ─────────────────────────────────────────────────────────

describe('isScheduledOn', () => {
  it('paused routine is never scheduled', () => {
    expect(isScheduledOn(makeRoutine({ is_paused: true }), TODAY)).toBe(false);
  });

  it('daily routine is scheduled every day', () => {
    expect(isScheduledOn(makeRoutine({ schedule_type: 'daily' }), TODAY)).toBe(true);
  });

  it('weekly_on_days respects the day mask', () => {
    // Allow only the day-of-week of TODAY
    const dow = TODAY.getDay();
    const r = makeRoutine({
      schedule_type: 'weekly_on_days',
      schedule_days: String(dow),
    });
    expect(isScheduledOn(r, TODAY)).toBe(true);
    // Tomorrow is a different dow (assuming, edge case if week wraps — that's still a different value)
    const otherDow = (dow + 1) % 7;
    expect(isScheduledOn(makeRoutine({
      schedule_type: 'weekly_on_days',
      schedule_days: String(otherDow),
    }), TODAY)).toBe(false);
  });

  it('every_n_days hits start day and multiples', () => {
    const start = T(-6);
    const r = makeRoutine({
      schedule_type: 'every_n_days',
      schedule_n_days: 3,
      start_date: ymd(start),
    });
    // 6 days after start = 2 cycles of 3 — scheduled today
    expect(isScheduledOn(r, TODAY)).toBe(true);
    // 4 days after start — not a multiple, not scheduled
    expect(isScheduledOn(r, addDays(start, 4))).toBe(false);
  });

  it('respects start_date — before-start days are unscheduled', () => {
    const r = makeRoutine({
      schedule_type: 'daily',
      start_date: ymd(T(1)),  // starts tomorrow
    });
    expect(isScheduledOn(r, TODAY)).toBe(false);
  });

  it('respects end_date — after-end days are unscheduled', () => {
    const r = makeRoutine({
      schedule_type: 'daily',
      end_date: ymd(T(-1)),  // ended yesterday
    });
    expect(isScheduledOn(r, TODAY)).toBe(false);
  });
});

// ─── scheduleLabel ─────────────────────────────────────────────────────────

describe('scheduleLabel', () => {
  it('daily', () => {
    expect(scheduleLabel(makeRoutine({ schedule_type: 'daily' }))).toBe('Every day');
  });

  it('weekly_on_days lists day names', () => {
    const r = makeRoutine({
      schedule_type: 'weekly_on_days',
      schedule_days: '1,3,5',
    });
    expect(scheduleLabel(r)).toBe('Mon · Wed · Fri');
  });

  it('every_n_days', () => {
    const r = makeRoutine({ schedule_type: 'every_n_days', schedule_n_days: 4 });
    expect(scheduleLabel(r)).toBe('Every 4 days');
  });

  it('times_per_week', () => {
    const r = makeRoutine({
      schedule_type: 'times_per_week',
      schedule_count_per_period: 3,
      schedule_period: 'week',
    });
    expect(scheduleLabel(r)).toBe('3× per week');
  });
});

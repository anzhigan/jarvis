import { describe, expect, it } from 'vitest';
import { adaptiveSteps, formatDate, goValueToday, STRIPE_COLOR, todayIso } from './helpers';
import type { Go } from '../../api/types';

describe('todayIso', () => {
  it('returns YYYY-MM-DD format', () => {
    const iso = todayIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches local date components', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(todayIso()).toBe(expected);
  });
});

describe('adaptiveSteps', () => {
  it('returns default range for null/undefined target', () => {
    expect(adaptiveSteps(null)).toEqual([1, 5]);
    expect(adaptiveSteps(undefined)).toEqual([1, 5]);
    expect(adaptiveSteps(0)).toEqual([1, 5]);
  });

  it('escalates with target size', () => {
    expect(adaptiveSteps(5)).toEqual([1]);
    expect(adaptiveSteps(50)).toEqual([1, 5]);
    expect(adaptiveSteps(200)).toEqual([5, 10, 25]);
    expect(adaptiveSteps(1000)).toEqual([10, 50, 100]);
    expect(adaptiveSteps(5000)).toEqual([50, 100, 500]);
  });
});

describe('formatDate', () => {
  it('returns null for falsy input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate('')).toBeNull();
  });

  it('formats ISO date string', () => {
    const out = formatDate('2026-05-04');
    // Locale-dependent — just check it's not the raw input and not null
    expect(out).not.toBeNull();
    expect(out).not.toBe('2026-05-04');
  });
});

describe('goValueToday', () => {
  const baseGo: Go = {
    id: 'g1',
    user_id: 'u1',
    task_id: null,
    sprint_id: null,
    title: 'Test',
    description: '',
    kind: 'boolean',
    unit: '',
    target_value: null,
    recurrence: 'none',
    start_date: null,
    due_date: null,
    color: '#000',
    entries: [],
    task_title: null,
    sprint_title: null,
    total_value: 0,
    is_done_today: false,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('returns 0 when no entry for today', () => {
    expect(goValueToday(baseGo)).toBe(0);
  });

  it('returns the value of today\'s entry', () => {
    const today = todayIso();
    const go: Go = {
      ...baseGo,
      entries: [{ id: 'e1', go_id: 'g1', date: today, value: 5 }],
    };
    expect(goValueToday(go)).toBe(5);
  });
});

describe('STRIPE_COLOR', () => {
  it('has entries for all GoRecurrence values', () => {
    expect(STRIPE_COLOR.none).toBeTruthy();
    expect(STRIPE_COLOR.daily).toBeTruthy();
    expect(STRIPE_COLOR.weekly).toBeTruthy();
  });
});

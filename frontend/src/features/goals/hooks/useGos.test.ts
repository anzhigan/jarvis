import { describe, expect, it } from 'vitest';
import { bucketOfGo, groupGos } from './useGos';
import type { Go } from '../../../api/types';

function makeGo(over: Partial<Go> = {}): Go {
  return {
    id: 'g1',
    user_id: 'u1',
    task_id: null,
    sprint_id: null,
    title: 'Go',
    description: '',
    kind: 'boolean',
    unit: '',
    target_value: null,
    recurrence: 'none',
    start_date: null,
    due_date: null,
    color: '#6366F1',
    entries: [],
    task_title: null,
    sprint_title: null,
    total_value: 0,
    is_done_today: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const TODAY = '2026-05-07';

describe('bucketOfGo', () => {
  it('done bucket when is_done_today', () => {
    expect(bucketOfGo(makeGo({ is_done_today: true }), TODAY)).toBe('done');
  });

  it('done wins over a past due_date', () => {
    expect(bucketOfGo(
      makeGo({ is_done_today: true, due_date: '2026-04-01' }),
      TODAY,
    )).toBe('done');
  });

  it('upcoming when no due_date', () => {
    expect(bucketOfGo(makeGo(), TODAY)).toBe('upcoming');
  });

  it('overdue when due_date < today', () => {
    expect(bucketOfGo(makeGo({ due_date: '2026-04-30' }), TODAY)).toBe('overdue');
  });

  it("today when due_date === today", () => {
    expect(bucketOfGo(makeGo({ due_date: TODAY }), TODAY)).toBe('today');
  });

  it('upcoming when due_date in future', () => {
    expect(bucketOfGo(makeGo({ due_date: '2026-05-15' }), TODAY)).toBe('upcoming');
  });
});

describe('groupGos', () => {
  it('produces empty buckets for empty input', () => {
    const g = groupGos([], TODAY);
    expect(g.overdue).toHaveLength(0);
    expect(g.today).toHaveLength(0);
    expect(g.upcoming).toHaveLength(0);
    expect(g.done).toHaveLength(0);
  });

  it('routes each go into the right bucket', () => {
    const items = [
      makeGo({ id: 'a', is_done_today: true }),
      makeGo({ id: 'b', due_date: '2026-04-01' }),
      makeGo({ id: 'c', due_date: TODAY }),
      makeGo({ id: 'd', due_date: '2026-06-01' }),
      makeGo({ id: 'e' }), // no due → upcoming
    ];
    const g = groupGos(items, TODAY);
    expect(g.done.map((x) => x.id)).toEqual(['a']);
    expect(g.overdue.map((x) => x.id)).toEqual(['b']);
    expect(g.today.map((x) => x.id)).toEqual(['c']);
    expect(g.upcoming.map((x) => x.id).sort()).toEqual(['d', 'e']);
  });
});

import { describe, expect, it } from 'vitest';
import { bucketOfStep, groupSteps } from './useSteps';
import type { Task } from '../../../api/types';
import type { StepWithGoal } from './useSteps';

function makeStep(over: Partial<StepWithGoal> & { id?: string } = {}): StepWithGoal {
  const goal = {
    id: 'goal',
    title: 'Parent goal',
    description: '',
    status: 'active',
    priority: 'medium',
    start_date: null,
    due_date: null,
    is_completed: false,
    order: 0,
    color: '#10B981',
    sprints: [],
    gos: [],
    tags: [],
    progress: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  } as unknown as Task;

  return {
    id: 's1',
    task_id: 'goal',
    user_id: 'u1',
    title: 'Step',
    description: '',
    start_date: '2026-04-01',
    end_date: '2026-04-15',
    is_completed: false,
    color: '',
    gos: [],
    task_title: 'Parent goal',
    progress: 0,
    created_at: '2026-04-01',
    updated_at: '2026-04-01',
    goal,
    ...over,
  } as StepWithGoal;
}

const TODAY = '2026-05-07';

describe('bucketOfStep', () => {
  it('done when is_completed', () => {
    expect(bucketOfStep(makeStep({ is_completed: true }), TODAY)).toBe('done');
  });

  it('overdue when end_date < today and not done', () => {
    expect(bucketOfStep(makeStep({
      start_date: '2026-04-01', end_date: '2026-04-15',
    }), TODAY)).toBe('overdue');
  });

  it('upcoming when start_date > today', () => {
    expect(bucketOfStep(makeStep({
      start_date: '2026-06-01', end_date: '2026-06-15',
    }), TODAY)).toBe('upcoming');
  });

  it('active when today is inside [start, end]', () => {
    expect(bucketOfStep(makeStep({
      start_date: '2026-05-01', end_date: '2026-05-15',
    }), TODAY)).toBe('active');
  });

  it('done wins over an overdue end_date', () => {
    expect(bucketOfStep(makeStep({
      start_date: '2026-04-01', end_date: '2026-04-15', is_completed: true,
    }), TODAY)).toBe('done');
  });
});

describe('groupSteps', () => {
  it('routes steps into matching buckets', () => {
    const steps = [
      makeStep({ id: 'a', is_completed: true }),
      makeStep({ id: 'b', start_date: '2026-04-01', end_date: '2026-04-15' }),
      makeStep({ id: 'c', start_date: '2026-05-01', end_date: '2026-05-15' }),
      makeStep({ id: 'd', start_date: '2026-06-01', end_date: '2026-06-15' }),
    ];
    const g = groupSteps(steps, TODAY);
    expect(g.done.map((s) => s.id)).toEqual(['a']);
    expect(g.overdue.map((s) => s.id)).toEqual(['b']);
    expect(g.active.map((s) => s.id)).toEqual(['c']);
    expect(g.upcoming.map((s) => s.id)).toEqual(['d']);
  });
});

import { describe, expect, it } from 'vitest';
import { applyGoalsFilters } from './useGoalsFilters';
import type { Tag, Task } from '../../../api/types';

const TAG_WORK: Tag = { id: 'tag-w', name: 'Work', color: '#6366F1', created_at: '2026-01-01' };
const TAG_HEALTH: Tag = { id: 'tag-h', name: 'Health', color: '#10B981', created_at: '2026-01-01' };

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    status: 'active',
    priority: 'medium',
    start_date: null,
    due_date: null,
    is_completed: false,
    order: 0,
    color: '#6366F1',
    sprints: [],
    gos: [],
    tags: [],
    progress: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over,
  };
}

const F = {
  status: 'all', priority: 'all', tagId: null, search: '', sort: 'manual',
} as const;

describe('applyGoalsFilters — filtering', () => {
  it('returns all when filters are at defaults', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b', status: 'done' })];
    expect(applyGoalsFilters(tasks, { ...F })).toHaveLength(2);
  });

  it('filters by status', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'active' }),
      makeTask({ id: 'b', status: 'done' }),
      makeTask({ id: 'c', status: 'paused' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, status: 'done' });
    expect(out.map((t) => t.id)).toEqual(['b']);
  });

  it('filters by priority', () => {
    const tasks = [
      makeTask({ id: 'a', priority: 'high' }),
      makeTask({ id: 'b', priority: 'low' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, priority: 'high' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('filters by tagId', () => {
    const tasks = [
      makeTask({ id: 'a', tags: [TAG_WORK] }),
      makeTask({ id: 'b', tags: [TAG_HEALTH] }),
      makeTask({ id: 'c', tags: [TAG_WORK, TAG_HEALTH] }),
      makeTask({ id: 'd', tags: [] }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, tagId: TAG_WORK.id });
    expect(out.map((t) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('search matches title or description case-insensitively', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Migrate to Postgres' }),
      makeTask({ id: 'b', title: 'Run', description: 'including a postgres exporter' }),
      makeTask({ id: 'c', title: 'Other' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, search: 'POSTGRES' });
    expect(out.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('search whitespace is trimmed; empty query is no-op', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    expect(applyGoalsFilters(tasks, { ...F, search: '   ' })).toHaveLength(2);
  });

  it('combines multiple filters', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'active', priority: 'high', tags: [TAG_WORK] }),
      makeTask({ id: 'b', status: 'active', priority: 'low',  tags: [TAG_WORK] }),
      makeTask({ id: 'c', status: 'done',   priority: 'high', tags: [TAG_WORK] }),
    ];
    const out = applyGoalsFilters(tasks, {
      ...F, status: 'active', priority: 'high', tagId: TAG_WORK.id,
    });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });
});

describe('applyGoalsFilters — sorting', () => {
  it('manual sort uses task.order', () => {
    const tasks = [
      makeTask({ id: 'a', order: 2 }),
      makeTask({ id: 'b', order: 0 }),
      makeTask({ id: 'c', order: 1 }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, sort: 'manual' });
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('priority sort: high → medium → low', () => {
    const tasks = [
      makeTask({ id: 'a', priority: 'low' }),
      makeTask({ id: 'b', priority: 'high' }),
      makeTask({ id: 'c', priority: 'medium' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, sort: 'priority' });
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('due sort: nulls last, ascending dates', () => {
    const tasks = [
      makeTask({ id: 'a', due_date: '2026-06-01' }),
      makeTask({ id: 'b', due_date: null }),
      makeTask({ id: 'c', due_date: '2026-05-01' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, sort: 'due' });
    expect(out.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('recent sort: latest updated_at first', () => {
    const tasks = [
      makeTask({ id: 'a', updated_at: '2026-05-01' }),
      makeTask({ id: 'b', updated_at: '2026-05-07' }),
      makeTask({ id: 'c', updated_at: '2026-04-15' }),
    ];
    const out = applyGoalsFilters(tasks, { ...F, sort: 'recent' });
    expect(out.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });
});

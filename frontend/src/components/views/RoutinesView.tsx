import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Pause, Play, Trash2, Check, MoreHorizontal, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi } from '../../api/client';
import type { Routine } from '../../api/types';
import { Button, IconButton, Segmented, Dropdown, MenuItem, MenuSeparator } from '../ui';
import { RoutineHeatmap } from './routines/RoutineHeatmap';
import { RoutineCreateDialog } from './routines/RoutineCreateDialog';
import { completionRate, currentStreak, scheduleLabel, ymd } from './routines/heatmap';

type Filter = 'all' | 'active' | 'paused';

export default function RoutinesView() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [days, setDays] = useState<number>(() => Number(localStorage.getItem('jarvnote:routines:days') || 91));

  useEffect(() => { localStorage.setItem('jarvnote:routines:days', String(days)); }, [days]);

  const load = async () => {
    try {
      const data = await routinesApi.list();
      setRoutines(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load routines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onNew = () => setCreateOpen(true);
    window.addEventListener('jarvnote:newRoutine', onNew);
    return () => window.removeEventListener('jarvnote:newRoutine', onNew);
  }, []);

  const visible = useMemo(() => {
    if (filter === 'active') return routines.filter((r) => !r.is_paused);
    if (filter === 'paused') return routines.filter((r) => r.is_paused);
    return routines;
  }, [routines, filter]);

  const onToggleEntry = async (r: Routine, date: string, currentValue: number) => {
    if (r.kind === 'boolean') {
      const next = currentValue > 0 ? 0 : 1;
      try {
        if (next === 0) {
          await routinesApi.deleteEntry(r.id, date);
        } else {
          await routinesApi.upsertEntry(r.id, date, 1);
        }
        // optimistic
        setRoutines((prev) => prev.map((x) => x.id === r.id
          ? {
              ...x,
              entries: next === 0
                ? x.entries.filter((e) => e.date !== date)
                : [...x.entries.filter((e) => e.date !== date), { id: '', routine_id: x.id, date, value: 1 }],
            }
          : x,
        ));
      } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    } else {
      const v = prompt(`Log value for ${date}${r.unit ? ` (${r.unit})` : ''}:`, String(currentValue || ''));
      if (v === null) return;
      const num = Number(v);
      if (Number.isNaN(num)) return;
      try {
        if (num <= 0) await routinesApi.deleteEntry(r.id, date);
        else await routinesApi.upsertEntry(r.id, date, num);
        setRoutines((prev) => prev.map((x) => x.id === r.id
          ? {
              ...x,
              entries: num <= 0
                ? x.entries.filter((e) => e.date !== date)
                : [...x.entries.filter((e) => e.date !== date), { id: '', routine_id: x.id, date, value: num }],
            }
          : x,
        ));
      } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    }
  };

  const checkInToday = async (r: Routine) => {
    const today = ymd(new Date());
    const todayEntry = r.entries?.find((e) => e.date === today);
    await onToggleEntry(r, today, todayEntry?.value ?? 0);
  };

  const togglePause = async (r: Routine) => {
    try {
      await routinesApi.update(r.id, { is_paused: !r.is_paused } as any);
      setRoutines((prev) => prev.map((x) => x.id === r.id ? { ...x, is_paused: !x.is_paused } : x));
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const remove = async (r: Routine) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    try {
      await routinesApi.delete(r.id);
      setRoutines((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const create = async (data: Parameters<typeof routinesApi.create>[0]) => {
    try {
      const created = await routinesApi.create(data);
      setRoutines((prev) => [...prev, created]);
      toast.success('Routine created');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="dt-page" data-visible="true">
        <div className="size-full flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dt-page" data-visible="true">
      <div className="dt-vw">
        <header className="dt-vw-head">
          <div className="dt-vw-head-text">
            <h1 className="dt-vw-title">Routines</h1>
            <p className="dt-vw-subtitle">{routines.length} total · {routines.filter((r) => !r.is_paused).length} active</p>
          </div>
          <div className="dt-vw-head-actions">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New routine
            </Button>
          </div>
        </header>

        <div className="dt-vw-toolbar">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all',    label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
          />
          <span className="flex-1" />
          <Segmented<string>
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: '35',  label: '5 weeks' },
              { value: '91',  label: '13 weeks' },
              { value: '182', label: '6 months' },
              { value: '365', label: '1 year' },
            ]}
          />
        </div>

        <div className="dt-vw-body">
          {visible.length === 0 ? (
            <div className="dt-empty">
              <Repeat size={32} style={{ color: 'var(--fg-faint)' }} />
              <div>
                <div className="dt-empty-title">{filter === 'all' ? 'No routines yet' : `No ${filter} routines`}</div>
                <div className="dt-empty-desc mt-1">Track recurring habits with flexible schedules.</div>
              </div>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>Create your first routine</Button>
            </div>
          ) : (
            <div className="rt-list">
              {visible.map((r) => {
                const streak = currentStreak(r);
                const rate = completionRate(r, 30);
                const today = ymd(new Date());
                const todayEntry = r.entries?.find((e) => e.date === today);
                const doneToday = (todayEntry?.value ?? 0) > 0;
                return (
                  <article key={r.id} className="rt-card" data-paused={r.is_paused || undefined}>
                    <span className="rt-card-color" style={{ background: r.color || 'var(--accent-routines)' }} />
                    <header className="rt-head">
                      <div className="rt-head-text">
                        <div className="rt-title">
                          {r.title}
                          {r.is_paused && <span className="rt-title-paused-badge">Paused</span>}
                        </div>
                        <div className="rt-schedule">
                          {scheduleLabel(r)}
                          {r.kind === 'numeric' && r.unit && ` · target ${r.target_value ?? '–'} ${r.unit}`}
                        </div>
                      </div>
                      <div className="rt-actions">
                        <button
                          className="rt-action-btn"
                          data-done={doneToday || undefined}
                          data-paused={r.is_paused || undefined}
                          onClick={() => checkInToday(r)}
                          disabled={r.is_paused}
                        >
                          {doneToday
                            ? <><Check size={13} /> Done today</>
                            : r.kind === 'boolean' ? <>Mark today done</> : <>Log today</>
                          }
                        </button>
                        <Dropdown trigger={<IconButton size="md" aria-label="Routine actions"><MoreHorizontal size={14} /></IconButton>}>
                          <MenuItem icon={r.is_paused ? <Play size={12} /> : <Pause size={12} />} onSelect={() => togglePause(r)}>
                            {r.is_paused ? 'Resume' : 'Pause'}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={() => remove(r)}>Delete</MenuItem>
                        </Dropdown>
                      </div>
                    </header>

                    <div className="rt-stats">
                      <div className="rt-stat">
                        <span className="rt-stat-label">Streak</span>
                        <span className="rt-stat-value" data-tone={streak > 0 ? 'success' : 'muted'}>
                          {streak} {streak === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                      <div className="rt-stat">
                        <span className="rt-stat-label">30-day rate</span>
                        <span className="rt-stat-value">{rate}%</span>
                      </div>
                      <div className="rt-stat">
                        <span className="rt-stat-label">Total entries</span>
                        <span className="rt-stat-value">{r.entries?.length ?? 0}</span>
                      </div>
                    </div>

                    <RoutineHeatmap
                      routine={r}
                      days={days}
                      onCellClick={(date, value) => onToggleEntry(r, date, value)}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RoutineCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={create} />
    </div>
  );
}

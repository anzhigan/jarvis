import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Calendar, Trash2, MoreHorizontal, Zap, Target, ListChecks, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { sprintsApi } from '../../api/client';
import type { Sprint, SprintItem } from '../../api/types';
import { Button, IconButton, Dropdown, MenuItem, MenuSeparator, Segmented } from '../ui';
import { SprintCreateDialog } from './sprints/SprintCreateDialog';

type Bucket = 'current' | 'future' | 'past';
type Filter = 'all' | Bucket;

const BUCKET_ORDER: Bucket[] = ['current', 'future', 'past'];

function classify(s: Sprint, today: Date): Bucket {
  const start = new Date(s.start_date);
  const end = new Date(s.end_date);
  const t = today.getTime();
  if (t < start.getTime()) return 'future';
  if (t > end.getTime() + 86_400_000 - 1) return 'past';
  return 'current';
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysLeft(s: Sprint, today: Date): number {
  return Math.ceil((new Date(s.end_date).getTime() - today.getTime()) / 86_400_000);
}

function ItemIcon({ kind }: { kind: SprintItem['item_type'] }) {
  switch (kind) {
    case 'goal':    return <Target className="sp-item-icon" />;
    case 'step':    return <ListChecks className="sp-item-icon" />;
    case 'go':      return <Zap className="sp-item-icon" />;
    case 'routine': return <Repeat className="sp-item-icon" />;
  }
}

export default function SprintsView() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = async () => {
    try {
      const data = await sprintsApi.list();
      setSprints(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load sprints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onNew = () => setCreateOpen(true);
    window.addEventListener('jarvnote:newSprint', onNew);
    return () => window.removeEventListener('jarvnote:newSprint', onNew);
  }, []);

  const today = useMemo(() => new Date(), [sprints]);

  const grouped = useMemo(() => {
    const out: Record<Bucket, Sprint[]> = { current: [], future: [], past: [] };
    for (const s of sprints) out[classify(s, today)].push(s);
    out.current.sort((a, b) => a.end_date.localeCompare(b.end_date));
    out.future.sort((a, b) => a.start_date.localeCompare(b.start_date));
    out.past.sort((a, b) => b.end_date.localeCompare(a.end_date));
    return out;
  }, [sprints, today]);

  const visibleBuckets = filter === 'all' ? BUCKET_ORDER : [filter];

  const create = async (data: Parameters<typeof sprintsApi.create>[0]) => {
    try {
      const created = await sprintsApi.create(data);
      setSprints((prev) => [created, ...prev]);
      toast.success('Sprint created');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      throw e;
    }
  };

  const removeItem = async (sprintId: string, itemId: string) => {
    try {
      await sprintsApi.removeItem(sprintId, itemId);
      setSprints((prev) => prev.map((s) => s.id === sprintId
        ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
        : s,
      ));
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const remove = async (s: Sprint) => {
    if (!confirm(`Delete sprint "${s.title}"?`)) return;
    try {
      await sprintsApi.delete(s.id);
      setSprints((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
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
            <h1 className="dt-vw-title">Sprints</h1>
            <p className="dt-vw-subtitle">
              {grouped.current.length} active · {grouped.future.length} upcoming · {grouped.past.length} completed
            </p>
          </div>
          <div className="dt-vw-head-actions">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New sprint
            </Button>
          </div>
        </header>

        <div className="dt-vw-toolbar">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all',     label: 'All' },
              { value: 'current', label: 'Active' },
              { value: 'future',  label: 'Upcoming' },
              { value: 'past',    label: 'Completed' },
            ]}
          />
        </div>

        <div className="dt-vw-body">
          {sprints.length === 0 ? (
            <div className="dt-empty">
              <Zap size={32} style={{ color: 'var(--fg-faint)' }} />
              <div>
                <div className="dt-empty-title">No sprints yet</div>
                <div className="dt-empty-desc mt-1">Group goals and routines into time-bounded focus periods.</div>
              </div>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>Create your first sprint</Button>
            </div>
          ) : (
            <>
              {visibleBuckets.map((bucket) => {
                const items = grouped[bucket];
                if (items.length === 0) return null;
                return (
                  <section key={bucket}>
                    <div className="sp-section-head" style={{ padding: 'var(--sp-7) var(--sp-12) var(--sp-3)' }}>
                      <span className="sp-section-name">
                        {bucket === 'current' ? 'Active' : bucket === 'future' ? 'Upcoming' : 'Completed'}
                      </span>
                      <span className="sp-section-rule" />
                      <span className="sp-section-name">{items.length}</span>
                    </div>
                    <div className="sp-grid">
                      {items.map((s) => {
                        const cls = classify(s, today);
                        const dleft = daysLeft(s, today);
                        return (
                          <article key={s.id} className="sp-card">
                            <span className="sp-card-color" style={{ background: s.color || 'var(--accent-sprints)' }} />
                            <div className="flex items-center gap-2">
                              <span className="sp-card-status-badge" data-status={cls}>
                                {cls === 'current' ? `${dleft}d left` : cls === 'future' ? 'Upcoming' : 'Done'}
                              </span>
                              <span className="sp-card-period">
                                <Calendar size={11} /> {fmt(s.start_date)} – {fmt(s.end_date)}
                              </span>
                              <span className="flex-1" />
                              <Dropdown trigger={<IconButton size="sm" aria-label="Sprint actions"><MoreHorizontal size={12} /></IconButton>}>
                                <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={() => remove(s)}>Delete</MenuItem>
                                <MenuSeparator />
                                <MenuItem onSelect={() => alert('Edit coming next phase')}>Edit (soon)</MenuItem>
                              </Dropdown>
                            </div>
                            <div className="sp-card-title">{s.title}</div>
                            {s.description && <div className="sp-card-desc">{s.description}</div>}

                            {s.items.length > 0 && (
                              <div className="sp-card-items">
                                {s.items.slice(0, 8).map((it) => (
                                  <div key={it.id} className="sp-item-row" style={it.color ? { color: it.color } : undefined}>
                                    <ItemIcon kind={it.item_type} />
                                    <span className="sp-item-text" style={{ color: 'var(--fg-secondary)' }}>{it.title || `Untitled ${it.item_type}`}</span>
                                    <button
                                      type="button"
                                      className="sp-item-remove"
                                      title="Remove from sprint"
                                      onClick={() => removeItem(s.id, it.id)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                {s.items.length > 8 && (
                                  <div className="sp-item-row" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-xs)' }}>
                                    + {s.items.length - 8} more
                                  </div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>

      <SprintCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={create} />
    </div>
  );
}

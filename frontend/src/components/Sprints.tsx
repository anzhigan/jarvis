import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, X, Target, ListChecks, Repeat as RepeatIcon, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { sprintsApi, tasksApi, routinesApi, gosApi, resolveUrl } from '../api/client';
import type { Sprint, SprintItem, SprintItemType, Task, Routine, Go } from '../api/types';
import PullToRefresh from './PullToRefresh';
import SwipeRow from './SwipeRow';
import { useT } from '../store/i18n';
import { useAuthStore } from '../store/auth';
import CreateSheet, { FormField } from './CreateSheet';
import { ENTITY_COLORS } from '../lib/colors';

const SPRINT_COLORS = ENTITY_COLORS;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function plusDaysIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function classifySprint(s: Sprint): 'current' | 'future' | 'past' {
  const today = todayIso();
  if (s.end_date < today) return 'past';
  if (s.start_date > today) return 'future';
  return 'current';
}

function ItemTypeIcon({ type, size = 13 }: { type: SprintItemType; size?: number }) {
  switch (type) {
    case 'goal': return <Target size={size} />;
    case 'step': return <ListChecks size={size} />;
    case 'go': return <CircleDot size={size} />;
    case 'routine': return <RepeatIcon size={size} />;
  }
}

function itemTypeLabel(type: SprintItemType): string {
  return { goal: 'Goal', step: 'Step', go: 'Go', routine: 'Routine' }[type];
}

// ═══════════════════════════════════════════════════════════════════════════
// AddItemPanel — picker to add Goal/Step/Go/Routine to a sprint
// ═══════════════════════════════════════════════════════════════════════════
function AddItemPanel({
  sprint, onClose, onAdded,
}: {
  sprint: Sprint;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [tab, setTab] = useState<SprintItemType>('goal');
  const [goals, setGoals] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [gos, setGos] = useState<Go[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [g, r, gosData] = await Promise.all([
          tasksApi.list(),
          routinesApi.list(),
          gosApi.list(),
        ]);
        setGoals(g);
        setRoutines(r);
        setGos(gosData);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const existingIds = useMemo(() => {
    const ids = { goal: new Set<string>(), step: new Set<string>(), go: new Set<string>(), routine: new Set<string>() };
    for (const it of sprint.items) {
      if (it.item_type === 'goal' && it.goal_id) ids.goal.add(it.goal_id);
      if (it.item_type === 'step' && it.step_id) ids.step.add(it.step_id);
      if (it.item_type === 'go' && it.go_id) ids.go.add(it.go_id);
      if (it.item_type === 'routine' && it.routine_id) ids.routine.add(it.routine_id);
    }
    return ids;
  }, [sprint.items]);

  const filteredOptions = useMemo(() => {
    const s = search.trim().toLowerCase();
    const match = (t: string) => !s || t.toLowerCase().includes(s);
    if (tab === 'goal') {
      return goals.filter((g) => !existingIds.goal.has(g.id) && match(g.title));
    }
    if (tab === 'step') {
      const items: { id: string; title: string; goalTitle: string; color: string }[] = [];
      for (const g of goals) {
        for (const sp of g.sprints || []) {
          if (!existingIds.step.has(sp.id) && match(sp.title)) {
            items.push({ id: sp.id, title: sp.title, goalTitle: g.title, color: sp.color });
          }
        }
      }
      return items;
    }
    if (tab === 'go') {
      return gos.filter((g) => !existingIds.go.has(g.id) && match(g.title));
    }
    return routines.filter((r) => !existingIds.routine.has(r.id) && match(r.title));
  }, [tab, goals, routines, gos, existingIds, search]);

  const add = async (kind: SprintItemType, id: string) => {
    try {
      await sprintsApi.addItem(sprint.id, {
        item_type: kind,
        goal_id: kind === 'goal' ? id : null,
        step_id: kind === 'step' ? id : null,
        go_id: kind === 'go' ? id : null,
        routine_id: kind === 'routine' ? id : null,
      });
      await onAdded();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel w-full md:max-w-lg rounded-t-[var(--r-shell)] md:rounded-[var(--r-shell)] flex flex-col max-h-[85vh] md:max-h-[80vh]"
        style={{ boxShadow: 'var(--sh-popover)' }}
      >
        <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          <h3 className="text-base font-semibold">Add to focus</h3>
          <button aria-label="Close" onClick={onClose} className="icon-btn icon-btn-sm"><X size={18} /></button>
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 p-3 flex-shrink-0" style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          {(['goal', 'step', 'go', 'routine'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className="flex-1 h-9 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              style={{
                borderRadius: 'var(--r-control)',
                ...(tab === k ? { background: 'var(--accent-primary)', color: '#fff' } : { background: 'var(--bg-hover)', color: 'var(--fg-secondary)' }),
              }}
            >
              <ItemTypeIcon type={k} size={13} />
              {itemTypeLabel(k)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 pt-3 flex-shrink-0">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="input w-full" />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8" style={{ color: 'var(--fg-muted)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : filteredOptions.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No items.</p>
          ) : (
            <div className="space-y-1.5">
              {tab === 'goal' && (filteredOptions as Task[]).map((g) => (
                <button key={g.id} onClick={() => add('goal', g.id)}
                  className="goal-card w-full text-left p-2.5 hover:bg-secondary transition-colors flex items-center gap-2">
                  <Target size={14} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{g.title}</span>
                  <span className="text-[10px] capitalize" style={{ color: 'var(--fg-muted)' }}>{g.status}</span>
                </button>
              ))}
              {tab === 'step' && (filteredOptions as { id: string; title: string; goalTitle: string; color: string }[]).map((s) => (
                <button key={s.id} onClick={() => add('step', s.id)}
                  className="goal-card w-full text-left p-2.5 hover:bg-secondary transition-colors flex items-center gap-2">
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <ListChecks size={14} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{s.title}</div>
                    <div className="text-[10px] truncate" style={{ color: 'var(--fg-muted)' }}>↳ {s.goalTitle}</div>
                  </div>
                </button>
              ))}
              {tab === 'go' && (filteredOptions as Go[]).map((g) => (
                <button key={g.id} onClick={() => add('go', g.id)}
                  className="goal-card w-full text-left p-2.5 hover:bg-secondary transition-colors flex items-center gap-2">
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <CircleDot size={14} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{g.title}</span>
                  {g.due_date && <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{fmtDate(g.due_date)}</span>}
                </button>
              ))}
              {tab === 'routine' && (filteredOptions as Routine[]).map((r) => (
                <button key={r.id} onClick={() => add('routine', r.id)}
                  className="goal-card w-full text-left p-2.5 hover:bg-secondary transition-colors flex items-center gap-2">
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <RepeatIcon size={14} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{r.title}</span>
                  <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{r.schedule_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SprintCard
// ═══════════════════════════════════════════════════════════════════════════
function SprintCard({
  sprint, onReload, onOpen,
}: {
  sprint: Sprint;
  onReload: () => Promise<void>;
  onOpen: () => void;
}) {
  const itemsByType = useMemo(() => {
    const byType: Record<SprintItemType, SprintItem[]> = { goal: [], step: [], go: [], routine: [] };
    for (const it of sprint.items) byType[it.item_type].push(it);
    return byType;
  }, [sprint.items]);

  const status = classifySprint(sprint);

  return (
    <button
      onClick={onOpen}
      className="goal-card"
      style={{ width: '100%', textAlign: 'left', display: 'block', position: 'relative' }}
    >
      {/* color stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        borderRadius: '0 999px 999px 0', background: sprint.color, opacity: 0.7,
      }} />
      <div style={{ paddingLeft: 8 }}>
        <div className="flex items-start justify-between gap-2" style={{ marginBottom: 6 }}>
          <span className="goal-card-title" style={{ margin: 0, flex: 1 }}>{sprint.title}</span>
          {status === 'current' && <span className="tag" style={{ background: 'var(--accent-routines-bg)', color: 'var(--accent-routines-fg)' }}>Active</span>}
          {status === 'future' && <span className="tag" style={{ background: 'var(--accent-notes-bg)', color: 'var(--accent-notes-fg)' }}>Upcoming</span>}
          {status === 'past' && <span className="tag" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)' }}>Finished</span>}
        </div>
        <div className="goal-card-meta" style={{ marginTop: 0, marginBottom: 8 }}>
          <span>{fmtDate(sprint.start_date)} — {fmtDate(sprint.end_date)}</span>
        </div>

        {sprint.description && (
          <p className="goal-card-meta" style={{ marginBottom: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sprint.description}</p>
        )}

        {sprint.items.length > 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {(['goal', 'step', 'go', 'routine'] as const).map((k) =>
              itemsByType[k].length > 0 ? (
                <span key={k} className="tag" style={{ background: 'var(--bg-input)', color: 'var(--fg-secondary)' }}>
                  <ItemTypeIcon type={k} size={11} />
                  {itemsByType[k].length}
                </span>
              ) : null
            )}
          </div>
        ) : (
          <p className="goal-card-meta" style={{ fontStyle: 'italic', marginTop: 0 }}>No items in focus yet</p>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EditSprintSheet — bottom sheet (like EditGoSheet) with fields + items list
// Replaces the old full-page SprintDetail.
// ═══════════════════════════════════════════════════════════════════════════
function EditSprintSheet({
  sprint, onClose, onReload, onDelete,
}: {
  sprint: Sprint;
  onClose: () => void;
  onReload: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useT();
  const [title, setTitle] = useState(sprint.title);
  const [desc, setDesc] = useState(sprint.description);
  const [start, setStart] = useState(sprint.start_date);
  const [end, setEnd] = useState(sprint.end_date);
  const [color, setColor] = useState(sprint.color);
  const [adding, setAdding] = useState(false);

  const canSubmit = !!title.trim();

  const save = async () => {
    await sprintsApi.update(sprint.id, {
      title: title.trim() || sprint.title,
      description: desc,
      start_date: start,
      end_date: end,
      color,
    } as any);
    await onReload();
    onClose();
  };

  const removeItem = async (itemId: string) => {
    try {
      await sprintsApi.removeItem(sprint.id, itemId);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const itemsByType = useMemo(() => {
    const byType: Record<SprintItemType, SprintItem[]> = { goal: [], step: [], go: [], routine: [] };
    for (const it of sprint.items) byType[it.item_type].push(it);
    return byType;
  }, [sprint.items]);

  return (
    <>
      <CreateSheet
        open
        onClose={onClose}
        title="Edit sprint"
        primaryLabel={t('common.save') || 'Save'}
        canSubmit={canSubmit}
        onSubmit={save}
      >
        <FormField label="Title">
          <input type="text" className="input w-full" value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Description">
          <textarea className="textarea w-full" value={desc}
            onChange={(e) => setDesc(e.target.value)} rows={3} placeholder={t('tasks.descriptionPh')} />
        </FormField>
        <div className="form-row-2col">
          <FormField label="Start date">
            <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <FormField label="End date">
            <input type="date" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Color">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
            {SPRINT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={(e) => { e.preventDefault(); setColor(c); }}
                className="w-9 h-9 rounded-full transition-all active:scale-90"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }}
              />
            ))}
          </div>
        </FormField>

        <FormField label="In focus">
          {sprint.items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '6px 0' }}>
              Empty. Add Goals, Steps, Gos or Routines.
            </div>
          ) : (
            <div className="space-y-3">
              {(['goal', 'step', 'go', 'routine'] as const).map((kind) => {
                const items = itemsByType[kind];
                if (items.length === 0) return null;
                return (
                  <div key={kind}>
                    <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <ItemTypeIcon type={kind} size={12} />
                      {itemTypeLabel(kind)}s
                      <span className="opacity-60 normal-case font-normal">({items.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {items.map((it) => (
                        <div key={it.id} className="goal-card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                          {it.color && <span className="flex-shrink-0" style={{ width: 3, height: 20, borderRadius: 'var(--r-pill)', backgroundColor: it.color }} />}
                          <span style={{ color: 'var(--fg-muted)' }}><ItemTypeIcon type={kind} size={12} /></span>
                          <span className="flex-1 truncate" style={{ fontSize: 12.5 }}>{it.title || '(untitled)'}</span>
                          <button type="button" aria-label="Remove item" onClick={() => removeItem(it.id)} className="icon-btn icon-btn-sm" style={{ color: 'var(--danger)' }}>
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-ghost w-full"
            style={{ marginTop: 10, justifyContent: 'center' }}
          >
            <Plus size={15} /> Add to focus
          </button>
        </FormField>

        <div style={{ marginTop: 14, paddingTop: 14, boxShadow: 'inset 0 0.5px 0 var(--line)' }}>
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`Delete sprint "${sprint.title}"?`)) return;
              await onDelete();
              onClose();
            }}
            className="btn w-full"
            style={{ color: 'var(--danger)', justifyContent: 'center' }}
          >
            Delete sprint
          </button>
        </div>
      </CreateSheet>

      {adding && (
        <AddItemPanel
          sprint={sprint}
          onClose={() => setAdding(false)}
          onAdded={async () => { setAdding(false); await onReload(); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CreateSprintForm
// ═══════════════════════════════════════════════════════════════════════════
function CreateSprintForm({ open, onCreated, onCancel }: { open: boolean; onCreated: () => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(plusDaysIso(7));
  const [color, setColor] = useState(SPRINT_COLORS[0]);
  const [allGos, setAllGos] = useState<Go[]>([]);
  const [selectedGoIds, setSelectedGoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setStart(todayIso()); setEnd(plusDaysIso(7));
      setColor(SPRINT_COLORS[0]); setSelectedGoIds(new Set());
    } else {
      gosApi.list().then(setAllGos).catch(() => setAllGos([]));
    }
  }, [open]);

  const toggleGo = (id: string) => {
    setSelectedGoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    const created = await sprintsApi.create({ title: title.trim(), description: description.trim(), start_date: start, end_date: end, color });
    for (const goId of selectedGoIds) {
      try { await sprintsApi.addItem(created.id, { item_type: 'go', go_id: goId }); } catch { /* ignore */ }
    }
    onCancel();
    await onCreated();
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="New sprint"
      primaryLabel="Create sprint"
      canSubmit={!!title.trim() && !!start && !!end}
      onSubmit={handleSubmit}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sprint title (e.g. Apr 28 — May 5)" autoFocus />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description…" />
      </FormField>
      <div className="form-row-2col">
        <FormField label="Start">
          <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label="End">
          <input type="date" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
          {SPRINT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }}
            />
          ))}
        </div>
      </FormField>
      {allGos.length > 0 && (
        <FormField label="Go items">
          <select
            value=""
            onChange={(e) => { if (e.target.value) toggleGo(e.target.value); }}
            className="select-base w-full"
          >
            <option value="">— Add a go —</option>
            {allGos.filter((g) => !selectedGoIds.has(g.id)).map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
          {selectedGoIds.size > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {Array.from(selectedGoIds).map((id) => {
                const g = allGos.find((x) => x.id === id);
                if (!g) return null;
                return (
                  <span key={id} className="tag-chip removable" style={{ backgroundColor: `${g.color}20`, color: g.color, border: `1px solid ${g.color}40` }}>
                    {g.title}
                    <button type="button" onClick={() => toggleGo(id)} className="x" title="Remove">
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </FormField>
      )}
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════
export default function Sprints() {
  const { user } = useAuthStore();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'current' | 'future' | 'past'>('current');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const list = await sprintsApi.list();
      setSprints(list);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load sprints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => ({
    current: sprints.filter((s) => classifySprint(s) === 'current'),
    future: sprints.filter((s) => classifySprint(s) === 'future'),
    past: sprints.filter((s) => classifySprint(s) === 'past'),
  }), [sprints]);

  const visible = grouped[filter];

  const editingSprint = editingSprintId ? sprints.find((s) => s.id === editingSprintId) : null;

  return (
    <div className="size-full overflow-y-auto">
      {editingSprint && (
        <EditSprintSheet
          sprint={editingSprint}
          onClose={() => setEditingSprintId(null)}
          onReload={load}
          onDelete={async () => {
            try { await sprintsApi.delete(editingSprint.id); await load(); }
            catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
          }}
        />
      )}
      <PullToRefresh onRefresh={load}>
        {isMobile ? (
          <>
            <div className="big-title-row">
              <div>
                <div className="big-title">Sprints</div>
                <div className="big-title-sub">
                  {grouped.current.length} active
                  {grouped.future.length > 0 && ` · ${grouped.future.length} upcoming`}
                </div>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'profile' }))}
                className="profile-btn"
                title="Profile"
              >
                {user?.avatar_url ? (
                  <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar">{user?.username?.charAt(0).toUpperCase() ?? '?'}</span>
                )}
              </button>
            </div>
            <div className="chips-row">
              {(['current', 'future', 'past'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className="chip" data-active={filter === f}>
                  {f === 'current' ? 'Current' : f === 'future' ? 'Future' : 'Past'}
                  <span className="chip-count">{grouped[f].length}</span>
                </button>
              ))}
              <button onClick={() => setCreating(true)} className="chip" style={{ marginLeft: 'auto' }}>
                <Plus size={13} /> New
              </button>
            </div>
          </>
        ) : null}
        <div className="page-container">
          {!isMobile && (
            <div className="page-head">
              <div className="page-head-info">
                <h1 className="page-title">Sprints</h1>
                <p className="page-subtitle">Deep work, focused time, meaningful progress.</p>
              </div>
            </div>
          )}

          {!isMobile && (
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {(['current', 'future', 'past'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="pill"
                  data-active={filter === f}
                >
                  {f === 'current' ? 'Current' : f === 'future' ? 'Future' : 'Past'}
                  <span className="pill-count">{grouped[f].length}</span>
                </button>
              ))}
            </div>
          )}

          {!isMobile && (
            <button
              onClick={() => setCreating(true)}
              className="btn btn-ghost w-full"
              style={{ marginBottom: 16, justifyContent: 'center' }}
            >
              <Plus size={15} /> New sprint
            </button>
          )}
          <CreateSprintForm open={creating} onCancel={() => setCreating(false)} onCreated={load} />

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">
                {filter === 'current' ? 'No active sprints right now.' :
                 filter === 'future' ? 'No upcoming sprints.' :
                 'No past sprints.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((s) => (
                <SwipeRow
                  key={s.id}
                  onEdit={() => setEditingSprintId(s.id)}
                  onDelete={async () => {
                    if (!confirm(`Delete sprint "${s.title}"?`)) return;
                    try { await sprintsApi.delete(s.id); await load(); }
                    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
                  }}
                >
                  <SprintCard sprint={s} onReload={load} onOpen={() => setEditingSprintId(s.id)} />
                </SwipeRow>
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}

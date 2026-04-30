import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Pencil, Trash2, X, Calendar, Target, ListChecks, Repeat as RepeatIcon, CircleDot, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { focusSprintsApi, tasksApi, routinesApi, gosApi } from '../api/client';
import type { FocusSprint, FocusSprintItem, FocusSprintItemType, Task, Routine, Go } from '../api/types';
import PullToRefresh from './PullToRefresh';
import { useSwipeBack } from '../native/useSwipeBack';
import { useT } from '../store/i18n';

const SPRINT_COLORS = [
  '#4f46e5', '#7c3aed', '#ec4899', '#e11d48', '#ea580c',
  '#d97706', '#0891b2', '#3b82f6', '#10b981', '#64748b',
];

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

function classifySprint(s: FocusSprint): 'current' | 'future' | 'past' {
  const today = todayIso();
  if (s.end_date < today) return 'past';
  if (s.start_date > today) return 'future';
  return 'current';
}

function ItemTypeIcon({ type, size = 13 }: { type: FocusSprintItemType; size?: number }) {
  switch (type) {
    case 'goal': return <Target size={size} />;
    case 'step': return <ListChecks size={size} />;
    case 'go': return <CircleDot size={size} />;
    case 'routine': return <RepeatIcon size={size} />;
  }
}

function itemTypeLabel(type: FocusSprintItemType): string {
  return { goal: 'Goal', step: 'Step', go: 'Go', routine: 'Routine' }[type];
}

// ═══════════════════════════════════════════════════════════════════════════
// AddItemPanel — picker to add Goal/Step/Go/Routine to a sprint
// ═══════════════════════════════════════════════════════════════════════════
function AddItemPanel({
  sprint, onClose, onAdded,
}: {
  sprint: FocusSprint;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [tab, setTab] = useState<FocusSprintItemType>('goal');
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

  const add = async (kind: FocusSprintItemType, id: string) => {
    try {
      await focusSprintsApi.addItem(sprint.id, {
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
        className="w-full md:max-w-lg bg-card border border-border rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] md:max-h-[80vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h3 className="text-base font-semibold">Add to focus</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 p-3 border-b border-border flex-shrink-0">
          {(['goal', 'step', 'go', 'routine'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 h-9 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                tab === k ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              <ItemTypeIcon type={k} size={13} />
              {itemTypeLabel(k)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 pt-3 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : filteredOptions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No items.</p>
          ) : (
            <div className="space-y-1.5">
              {tab === 'goal' && (filteredOptions as Task[]).map((g) => (
                <button
                  key={g.id}
                  onClick={() => add('goal', g.id)}
                  className="w-full text-left p-2.5 bg-card border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <Target size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{g.title}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{g.status}</span>
                </button>
              ))}
              {tab === 'step' && (filteredOptions as { id: string; title: string; goalTitle: string; color: string }[]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => add('step', s.id)}
                  className="w-full text-left p-2.5 bg-card border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <ListChecks size={14} className="text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{s.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">↳ {s.goalTitle}</div>
                  </div>
                </button>
              ))}
              {tab === 'go' && (filteredOptions as Go[]).map((g) => (
                <button
                  key={g.id}
                  onClick={() => add('go', g.id)}
                  className="w-full text-left p-2.5 bg-card border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <CircleDot size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{g.title}</span>
                  {g.due_date && <span className="text-[10px] text-muted-foreground">{fmtDate(g.due_date)}</span>}
                </button>
              ))}
              {tab === 'routine' && (filteredOptions as Routine[]).map((r) => (
                <button
                  key={r.id}
                  onClick={() => add('routine', r.id)}
                  className="w-full text-left p-2.5 bg-card border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <RepeatIcon size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{r.title}</span>
                  <span className="text-[10px] text-muted-foreground">{r.schedule_type}</span>
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
  sprint: FocusSprint;
  onReload: () => Promise<void>;
  onOpen: () => void;
}) {
  const itemsByType = useMemo(() => {
    const byType: Record<FocusSprintItemType, FocusSprintItem[]> = { goal: [], step: [], go: [], routine: [] };
    for (const it of sprint.items) byType[it.item_type].push(it);
    return byType;
  }, [sprint.items]);

  const status = classifySprint(sprint);

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-stretch rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: sprint.color }} />
      <div className="flex-1 p-3.5 min-w-0">
        <div className="flex items-start gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{sprint.title}</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
              <Calendar size={11} />
              <span>{fmtDate(sprint.start_date)} — {fmtDate(sprint.end_date)}</span>
              {status === 'current' && <span className="px-1.5 py-px rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">Active</span>}
              {status === 'future' && <span className="px-1.5 py-px rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-medium">Upcoming</span>}
              {status === 'past' && <span className="px-1.5 py-px rounded bg-muted text-muted-foreground">Finished</span>}
            </div>
          </div>
        </div>

        {sprint.description && (
          <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2 whitespace-pre-wrap">{sprint.description}</p>
        )}

        {sprint.items.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {(['goal', 'step', 'go', 'routine'] as const).map((k) =>
              itemsByType[k].length > 0 ? (
                <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[11px] text-foreground">
                  <ItemTypeIcon type={k} size={11} />
                  {itemsByType[k].length}
                </span>
              ) : null
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No items in focus yet</p>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SprintDetail — full view with items and add/remove
// ═══════════════════════════════════════════════════════════════════════════
function SprintDetail({
  sprint, onBack, onReload,
}: {
  sprint: FocusSprint;
  onBack: () => void;
  onReload: () => Promise<void>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  // Native iOS swipe-back gesture
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  useSwipeBack({ onBack, enabled: isMobile && !editing });

  const [adding, setAdding] = useState(false);
  const [editTitle, setEditTitle] = useState(sprint.title);
  const [editDesc, setEditDesc] = useState(sprint.description);
  const [editStart, setEditStart] = useState(sprint.start_date);
  const [editEnd, setEditEnd] = useState(sprint.end_date);
  const [editColor, setEditColor] = useState(sprint.color);
  const [saving, setSaving] = useState(false);

  const removeItem = async (itemId: string) => {
    try {
      await focusSprintsApi.removeItem(sprint.id, itemId);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const removeSprint = async () => {
    if (!confirm(`Delete sprint "${sprint.title}"?`)) return;
    try {
      await focusSprintsApi.delete(sprint.id);
      await onReload();
      onBack();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await focusSprintsApi.update(sprint.id, {
        title: editTitle.trim() || sprint.title,
        description: editDesc,
        start_date: editStart,
        end_date: editEnd,
        color: editColor,
      } as any);
      setEditing(false);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const itemsByType = useMemo(() => {
    const byType: Record<FocusSprintItemType, FocusSprintItem[]> = { goal: [], step: [], go: [], routine: [] };
    for (const it of sprint.items) byType[it.item_type].push(it);
    return byType;
  }, [sprint.items]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 md:px-6 pt-4 pb-3 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <h1 className="text-lg font-semibold truncate">{sprint.title}</h1>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Calendar size={11} />
                {fmtDate(sprint.start_date)} — {fmtDate(sprint.end_date)}
              </div>
            </>
          ) : (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full h-9 px-2 text-sm font-semibold bg-input-background border border-border rounded-md"
            />
          )}
        </div>
        {!editing ? (
          <>
            <button onClick={() => setEditing(true)}
              className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" title="Edit">
              <Pencil size={16} />
            </button>
            <button onClick={removeSprint}
              className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
              <Trash2 size={16} />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setEditTitle(sprint.title); setEditDesc(sprint.description); setEditStart(sprint.start_date); setEditEnd(sprint.end_date); setEditColor(sprint.color); }}
              className="h-9 px-3 text-sm rounded-md hover:bg-secondary">{t('common.cancel')}</button>
            <button onClick={saveEdit} disabled={saving}
              className="h-9 px-3 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1">
              {saving && <Loader2 size={11} className="animate-spin" />}
              {t('common.save')}
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {editing && (
            <div className="p-3 bg-card border border-border rounded-xl mb-4 space-y-2">
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2}
                placeholder="Description…"
                className="w-full px-2.5 py-2 text-sm bg-input-background border border-border rounded-md resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="text-[10px] text-muted-foreground">Start</label>
                  <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] text-muted-foreground">End</label>
                  <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {SPRINT_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEditColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${editColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          )}

          {!editing && sprint.description && (
            <div className="mb-4 p-3 bg-muted/40 rounded-md text-sm text-foreground whitespace-pre-wrap">
              {sprint.description}
            </div>
          )}

          {/* Items in focus, grouped by type */}
          <div className="space-y-4">
            {(['goal', 'step', 'go', 'routine'] as const).map((kind) => {
              const items = itemsByType[kind];
              if (items.length === 0) return null;
              return (
                <div key={kind}>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <ItemTypeIcon type={kind} size={12} />
                    {itemTypeLabel(kind)}s
                    <span className="opacity-60 normal-case font-normal">({items.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((it) => (
                      <div key={it.id}
                        className="flex items-center gap-2 p-2.5 bg-card border border-border rounded-md group">
                        {it.color && <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: it.color }} />}
                        <ItemTypeIcon type={kind} size={13} />
                        <span className="flex-1 text-sm truncate">{it.title || '(untitled)'}</span>
                        <button onClick={() => removeItem(it.id)}
                          className="opacity-0 group-hover:opacity-100 md:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setAdding(true)}
            className="w-full h-11 mt-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5 font-medium text-sm"
          >
            <Plus size={16} /> Add to focus
          </button>

          {sprint.items.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Empty sprint. Add Goals, Steps, Gos or Routines to focus on this period.</p>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddItemPanel
          sprint={sprint}
          onClose={() => setAdding(false)}
          onAdded={async () => { setAdding(false); await onReload(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CreateSprintForm
// ═══════════════════════════════════════════════════════════════════════════
function CreateSprintForm({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(plusDaysIso(7));
  const [color, setColor] = useState(SPRINT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !start || !end) return;
    setSaving(true);
    try {
      await focusSprintsApi.create({
        title: title.trim(),
        description: description.trim(),
        start_date: start,
        end_date: end,
        color,
      });
      import('../native/bridge').then(({ hapticSuccess }) => hapticSuccess());
      onCancel();
      await onCreated();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-card border border-border rounded-xl mb-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">New sprint</span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      <input type="text" placeholder="Sprint title (e.g. Apr 28 — May 5)"
        value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
        placeholder="Description…"
        className="w-full px-2.5 py-2 text-sm bg-input-background border border-border rounded-md resize-none" />
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label className="text-[10px] text-muted-foreground">Start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        </div>
        <div className="min-w-0">
          <label className="text-[10px] text-muted-foreground">End</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        </div>
      </div>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-1.5">
          {SPRINT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <button onClick={submit} disabled={saving || !title.trim()}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5 text-sm">
          {saving && <Loader2 size={11} className="animate-spin" />}
          <Plus size={15} /> Create
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════
export default function Sprints() {
  const t = useT();
  const [sprints, setSprints] = useState<FocusSprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openSprintId, setOpenSprintId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'current' | 'future' | 'past'>('current');

  const load = async () => {
    setLoading(true);
    try {
      const list = await focusSprintsApi.list();
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

  const openSprint = openSprintId ? sprints.find((s) => s.id === openSprintId) : null;

  if (openSprint) {
    return <SprintDetail sprint={openSprint} onBack={() => setOpenSprintId(null)} onReload={load} />;
  }

  return (
    <div className="size-full flex flex-col">
      <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Sprints</h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PullToRefresh onRefresh={load}>
          <div className="px-4 md:px-6 py-4">
            <div className="max-w-3xl mx-auto">
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {(['current', 'future', 'past'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="btn-pill"
                data-active={filter === f}
              >
                {f === 'current' ? 'Current' : f === 'future' ? 'Future' : 'Past'}
                <span className="opacity-70">{grouped[f].length}</span>
              </button>
            ))}
          </div>

          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full h-11 mb-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5 font-medium text-sm"
            >
              <Plus size={16} /> New sprint
            </button>
          ) : (
            <CreateSprintForm onCancel={() => setCreating(false)} onCreated={load} />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {filter === 'current' ? 'No active sprints right now.' :
                 filter === 'future' ? 'No upcoming sprints.' :
                 'No past sprints.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((s) => (
                <SprintCard key={s.id} sprint={s} onReload={load} onOpen={() => setOpenSprintId(s.id)} />
              ))}
            </div>
          )}
            </div>
          </div>
        </PullToRefresh>
      </div>
    </div>
  );
}

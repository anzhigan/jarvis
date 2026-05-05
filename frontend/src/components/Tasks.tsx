import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronRight, Loader2,
  ListTodo, Target as TargetIcon, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import AddItemButton from './AddItemButton';
import ConfirmDialog from './ConfirmDialog';
import CreateSheet, { FormField } from './CreateSheet';
import PullToRefresh from './PullToRefresh';
import DeferredTagPicker from './tasks/DeferredTagPicker';
import GoPanel from './tasks/GoPanel';
import StepPanel from './tasks/StepPanel';
import TaskCard from './tasks/TaskCard';
import { tasksApi, tagsApi, routinesApi, resolveUrl } from '../api/client';
import type { Routine, Task, TaskPriority, TaskStatus } from '../api/types';
import { ENTITY_COLORS, STANDARD_COLORS } from '../lib/colors';
import { useT } from '../store/i18n';
import { useAuthStore } from '../store/auth';

// Re-exported for any legacy importers (other tabs use ../lib/colors directly)
export { ENTITY_COLORS, STANDARD_COLORS };

const STATUSES: { key: TaskStatus; labelKey: string }[] = [
  { key: 'backlog', labelKey: 'tasks.status.backlog' },
  { key: 'active', labelKey: 'tasks.status.active' },
  { key: 'paused', labelKey: 'tasks.status.paused' },
  { key: 'done', labelKey: 'tasks.status.done' },
];

// Order for the mobile chip filter row only — kanban columns keep canonical order.
const MOBILE_FILTER_ORDER: TaskStatus[] = ['active', 'done', 'paused', 'backlog'];

export default function Tasks() {
  const t = useT();
  const { user } = useAuthStore();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tasks' | 'go' | 'step'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('tasks:view') : null;
    if (saved === 'tasks' || saved === 'go' || saved === 'step') return saved;
    if (saved === 'sprint') return 'step'; // legacy migration
    return 'tasks';
  });
  useEffect(() => {
    localStorage.setItem('tasks:view', view);
  }, [view]);

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newStart, setNewStart] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTagIds, setNewTagIds] = useState<string[]>([]);
  const [newColor, setNewColor] = useState(ENTITY_COLORS[0]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [mobileStatusFilter, setMobileStatusFilter] = useState<TaskStatus | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const toggleCollapsed = (s: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);
  const [goalCompletion, setGoalCompletion] = useState<{ taskId: string; routines: Routine[] } | null>(null);

  const load = async () => {
    try {
      const [data, tagsList] = await Promise.all([
        tasksApi.list(),
        tagsApi.list().catch(() => []),
      ]);
      setTasks(data);
      setAllTags(tagsList);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const tasksByStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { backlog: [], active: [], paused: [], done: [] };
    // Defensive remap: handle legacy backend statuses if they leak through
    const remap: Record<string, TaskStatus> = {
      todo: 'backlog',
      in_progress: 'active',
      background: 'active',
      backlog: 'backlog',
      active: 'active',
      paused: 'paused',
      done: 'done',
    };
    for (const tk of tasks) {
      const k = remap[tk.status as string] ?? 'backlog';
      out[k].push(tk);
    }
    return out;
  }, [tasks]);

  const createTask = async () => {
    const created = await tasksApi.create({
      title: newTitle.trim(), priority: newPriority,
      start_date: newStart || null, due_date: newDue || null,
      description: newDescription || '', color: newColor,
    });
    for (const tagId of newTagIds) {
      try { await tasksApi.attachTag(created.id, tagId); } catch { /* ignore individual */ }
    }
    setNewTitle(''); setNewPriority('medium'); setNewStart(''); setNewDue(''); setNewDescription(''); setNewTagIds([]); setNewColor(ENTITY_COLORS[0]);
    setShowCreateForm(false);
    await load();
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    if (data.status === 'done') {
      try {
        const linked: Routine[] = await routinesApi.byGoal(id);
        const activeLinked = linked.filter((r) => !r.is_paused);
        if (activeLinked.length > 0) {
          setGoalCompletion({ taskId: id, routines: activeLinked });
          return;
        }
      } catch { /* ignore — proceed without dialog */ }
    }
    try { await tasksApi.update(id, data); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const completeGoalWithChoice = async (taskId: string, choice: 'finish_all' | 'keep_active' | 'unlink') => {
    try {
      await tasksApi.update(taskId, { status: 'done' });
      if (goalCompletion) {
        for (const r of goalCompletion.routines) {
          if (choice === 'finish_all') {
            await routinesApi.update(r.id, { is_paused: true });
          } else if (choice === 'unlink') {
            await routinesApi.update(r.id, { goal_id: null });
          }
        }
      }
      setGoalCompletion(null);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const deleteTask = async (id: string) => {
    setConfirmState({
      title: 'Delete task?',
      message: t('tasks.deleteMsg'),
      onConfirm: async () => {
        try { await tasksApi.delete(id); await load(); }
        catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
      },
    });
  };

  if (loading) {
    return <div className="size-full flex items-center justify-center"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <ConfirmDialog open={confirmState !== null} title={confirmState?.title ?? ''} message={confirmState?.message}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }} />

      {goalCompletion && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setGoalCompletion(null)}>
          <div className="modal-panel max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Goal completed 🎉</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--fg-muted)' }}>
              This goal has {goalCompletion.routines.length} active routine{goalCompletion.routines.length > 1 ? 's' : ''} linked to it. What would you like to do?
            </p>
            <div className="space-y-2 mb-4 max-h-32 overflow-y-auto">
              {goalCompletion.routines.map((r: Routine) => (
                <div key={r.id} className="flex items-center gap-2 text-sm p-2" style={{ borderRadius: 'var(--r-control)', background: 'var(--bg-hover)' }}>
                  <span className="w-1 h-4 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="truncate">{r.title}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button onClick={() => completeGoalWithChoice(goalCompletion.taskId, 'keep_active')} className="goal-card w-full text-left p-3 hover:bg-secondary transition-colors">
                <div className="text-sm font-medium">Keep routines active</div>
                <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>They continue independently</div>
              </button>
              <button onClick={() => completeGoalWithChoice(goalCompletion.taskId, 'unlink')} className="goal-card w-full text-left p-3 hover:bg-secondary transition-colors">
                <div className="text-sm font-medium">Unlink from goal</div>
                <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>Routines stay active but no longer tied to this goal</div>
              </button>
              <button onClick={() => completeGoalWithChoice(goalCompletion.taskId, 'finish_all')} className="goal-card w-full text-left p-3 hover:bg-secondary transition-colors">
                <div className="text-sm font-medium">Pause routines</div>
                <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>Mark routines as paused along with the goal</div>
              </button>
            </div>
            <button onClick={() => setGoalCompletion(null)} className="btn btn-ghost w-full mt-3">Cancel</button>
          </div>
        </div>
      )}

      <PullToRefresh onRefresh={load} disabled={!isMobile}>
        <div className="size-full overflow-y-auto">
          {isMobile ? (
            <div>
              <div className="big-title-row">
                <div>
                  <div className="big-title">Goals</div>
                  <div className="big-title-sub">
                    {tasks.filter((tk) => tk.status === 'active').length} active
                    {tasks.filter((tk) => tk.status === 'paused').length > 0 && ` · ${tasks.filter((tk) => tk.status === 'paused').length} paused`}
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
              <div style={{ padding: '0 16px 10px' }}>
                <div className="segmented" style={{ width: '100%' }}>
                  <button onClick={() => setView('tasks')} className="segmented-item" data-active={view === 'tasks'} style={{ flex: 1 }}>Goals</button>
                  <button onClick={() => setView('go')} className="segmented-item" data-active={view === 'go'} style={{ flex: 1 }}>Go</button>
                  <button onClick={() => setView('step')} className="segmented-item" data-active={view === 'step'} style={{ flex: 1 }}>Step</button>
                </div>
              </div>
              {view === 'tasks' && (
                <div className="chips-row chips-row-lg">
                  <button className="chip" data-active={mobileStatusFilter === null} onClick={() => setMobileStatusFilter(null)}>
                    All <span className="chip-count">{tasks.length}</span>
                  </button>
                  {MOBILE_FILTER_ORDER.map((key) => (
                    <button key={key} className="chip" data-active={mobileStatusFilter === key} onClick={() => setMobileStatusFilter(key)}>
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                      <span className="chip-count">{tasksByStatus[key]?.length ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className={isMobile ? 'px-4' : 'page-container'}>
          {!isMobile && (
          <div className="page-head">
            <div className="page-head-info">
              <h1 className="page-title">Goals</h1>
              <p className="page-subtitle">Refine direction. Track progress. Grow with intention.</p>
              <div className="subtabs" style={{ marginTop: 12 }}>
                <button onClick={() => setView('tasks')} className="subtab" data-active={view === 'tasks'}>Goals</button>
                <button onClick={() => setView('go')} className="subtab" data-active={view === 'go'}>Go</button>
                <button onClick={() => setView('step')} className="subtab" data-active={view === 'step'}>Step</button>
              </div>
            </div>
          </div>
          )}

          <div className="mb-5" style={{ display: 'none' }}>
            <div className="hidden md:flex text-sm p-0.5 w-fit" style={{ background: 'var(--bg-hover)', borderRadius: 'var(--r-control)' }}>
              {([
                { v: 'tasks', Icon: TargetIcon, label: t('tasks.tasksTab') },
                { v: 'go', Icon: ListTodo, label: t('tasks.goTab') },
                { v: 'step', Icon: Zap, label: t('tasks.stepTab') },
              ] as const).map(({ v, Icon, label }) => (
                <button key={v} onClick={() => setView(v)}
                  className="px-3 h-8 flex items-center gap-1.5"
                  style={{
                    borderRadius: 'calc(var(--r-control) - 2px)',
                    ...(view === v ? { background: 'var(--bg-card)', fontWeight: 500, boxShadow: 'var(--sh-sm)' } : { color: 'var(--fg-muted)' }),
                  }}
                >
                  <Icon size={14} />{label}
                </button>
              ))}
            </div>
          </div>

          {view === 'go' ? (
            <div className="go-step-panel" style={{ padding: '0 12px' }}>
              <GoPanel tasks={tasks} onReload={load} />
            </div>
          ) : view === 'step' ? (
            <div className="go-step-panel" style={{ padding: '0 12px' }}>
              <StepPanel tasks={tasks} onReload={load} />
            </div>
          ) : (
            <>
              <AddItemButton label={t('tasks.addTask')} onClick={() => setShowCreateForm(true)} />
              <CreateSheet
                open={showCreateForm}
                onClose={() => { setShowCreateForm(false); setNewTitle(''); setNewDescription(''); setNewStart(''); setNewDue(''); setNewTagIds([]); setNewColor(ENTITY_COLORS[0]); }}
                title={t('tasks.addTask')}
                primaryLabel="Create goal"
                canSubmit={!!newTitle.trim()}
                onSubmit={createTask}
              >
                <FormField label="Title">
                  <input type="text" className="input w-full" value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t('tasks.new')} />
                </FormField>
                <FormField label="Priority">
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)} className="select-base">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </FormField>
                <FormField label="Description">
                  <textarea className="textarea w-full" value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder={t('tasks.descriptionPh')} rows={2} />
                </FormField>
                <FormField label="Color">
                  <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
                    {ENTITY_COLORS.map((c) => (
                      <button key={c} type="button" onClick={(e) => { e.preventDefault(); setNewColor(c); }}
                        className="w-9 h-9 rounded-full transition-all active:scale-90"
                        style={{ backgroundColor: c, boxShadow: newColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
                    ))}
                  </div>
                </FormField>
                <FormField label="Tags">
                  <DeferredTagPicker
                    allTags={allTags}
                    selectedIds={newTagIds}
                    onChange={setNewTagIds}
                    onCreateTag={async (name, color) => {
                      const created = await tagsApi.create(name, color);
                      setAllTags([...allTags, created]);
                      return created;
                    }}
                  />
                </FormField>
                <div className="form-row-2col">
                  <FormField label={t('tasks.start')}>
                    <input type="date" className="input w-full" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                  </FormField>
                  <FormField label={t('tasks.due')}>
                    <input type="date" className="input w-full" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                  </FormField>
                </div>
              </CreateSheet>

              <div className="kanban-grid">
                {STATUSES.filter(({ key }) => !isMobile || mobileStatusFilter === null || mobileStatusFilter === key).map(({ key, labelKey }) => {
                  const list = tasksByStatus[key] ?? [];
                  const isDropTarget = dragOverStatus === key;
                  const label = t(labelKey);
                  return (
                    <div key={key}
                      onDragOver={(e) => { if (!draggingId) return; e.preventDefault(); setDragOverStatus(key); }}
                      onDragLeave={() => setDragOverStatus((p) => p === key ? null : p)}
                      onDrop={(e) => {
                        if (!draggingId) return;
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        setDragOverStatus(null); setDraggingId(null);
                        if (id) {
                          updateTask(id, { status: key });
                        }
                      }}
                      className="kanban-column"
                      style={isDropTarget ? { background: 'var(--accent-notes-bg)', boxShadow: 'inset 0 0 0 1.5px var(--accent-notes)', borderRadius: 'var(--r-card)' } : undefined}
                    >
                      <button
                        onClick={() => isMobile && toggleCollapsed(key)}
                        className="kanban-column-head"
                        style={{ width: '100%', cursor: isMobile ? 'pointer' : 'default', justifyContent: 'space-between' }}
                      >
                        <span className="kanban-column-name">{label}</span>
                        <span className="kanban-column-count">{list.length}</span>
                        {isMobile && (collapsed.has(key)
                          ? <ChevronRight size={14} style={{ color: 'var(--fg-muted)', marginLeft: 'auto' }} />
                          : <ChevronDown size={14} style={{ color: 'var(--fg-muted)', marginLeft: 'auto' }} />)}
                      </button>
                      {(!isMobile || !collapsed.has(key)) && (
                        <div style={{ padding: 8, minHeight: 80 }}>
                          <AnimatePresence>
                            {list.map((task) => (
                              <TaskCard key={task.id} task={task}
                                onUpdate={(data) => updateTask(task.id, data)}
                                onDelete={() => deleteTask(task.id)}
                                onReload={load}
                                onDragStart={() => setDraggingId(task.id)}
                                onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                                isDragging={draggingId === task.id}
                                isMobile={isMobile} />
                            ))}
                          </AnimatePresence>
                          {list.length === 0 && !isDropTarget && (
                            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 11, color: 'var(--fg-muted)' }}>
                              {draggingId ? t('tasks.dropHere') : t('tasks.noTasks')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </div>
        </div>
      </PullToRefresh>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Calendar,
  X,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  Loader2,
  Flame,
  Check,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { practicesApi, tasksApi } from '../api/client';
import type {
  Practice,
  PracticeKind,
  Task,
  TaskPriority,
  TaskStatus,
} from '../api/types';

const STATUSES: { key: TaskStatus; label: string; dot: string }[] = [
  { key: 'todo', label: 'Backlog', dot: 'bg-muted-foreground' },
  { key: 'in_progress', label: 'In Progress', dot: 'bg-chart-3' },
  { key: 'done', label: 'Done', dot: 'bg-chart-5' },
];

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  return Math.floor((+new Date(b) - +new Date(a)) / 86_400_000);
}

// Build list of past N days (oldest first) as ISO strings
function pastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

function computeStreak(practice: Practice): number {
  const byDate = new Map<string, number>();
  practice.entries.forEach((e) => byDate.set(e.date, e.value));
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const v = byDate.get(key);
    if (v === undefined) {
      if (i === 0) continue; // skip today if not yet logged
      break;
    }
    if (v > 0) streak++;
    else break;
  }
  return streak;
}

// ─── Practice mini widget ────────────────────────────────────────────────────
function PracticeWidget({
  practice,
  onUpdate,
  onDelete,
  onReload,
}: {
  practice: Practice;
  onUpdate: (data: Partial<Practice>) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [logging, setLogging] = useState(false);
  const [numericValue, setNumericValue] = useState('');
  const entriesByDate = useMemo(() => {
    const m = new Map<string, number>();
    practice.entries.forEach((e) => m.set(e.date, e.value));
    return m;
  }, [practice.entries]);

  const streak = computeStreak(practice);

  const totalDays = practice.duration_days ?? 30;
  const daysToShow = Math.min(totalDays, 35);
  const days = pastDays(daysToShow);

  const completedDays = practice.entries.filter((e) => e.value > 0).length;
  const progressPct = practice.duration_days
    ? Math.min(100, (completedDays / practice.duration_days) * 100)
    : 0;

  const toggleToday = async () => {
    if (logging) return;
    const today = todayISO();
    const current = entriesByDate.get(today) ?? 0;
    setLogging(true);
    try {
      await practicesApi.logEntry(practice.id, today, current > 0 ? 0 : 1);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log');
    } finally {
      setLogging(false);
    }
  };

  const logNumeric = async () => {
    const v = parseFloat(numericValue);
    if (isNaN(v)) return;
    setLogging(true);
    try {
      await practicesApi.logEntry(practice.id, todayISO(), v);
      setNumericValue('');
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log');
    } finally {
      setLogging(false);
    }
  };

  const toggleStatus = async () => {
    const next = practice.status === 'paused' ? 'active' : 'paused';
    await onUpdate({ status: next });
  };

  const isPaused = practice.status === 'paused';
  const isDone = practice.status === 'done';

  return (
    <div
      className={`rounded-lg border p-3 transition-opacity ${isPaused ? 'opacity-60' : ''}`}
      style={{ borderColor: `${practice.color}30`, backgroundColor: `${practice.color}08` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: practice.color }} />
          <span className="text-sm font-medium truncate">{practice.title}</span>
          {streak > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-orange-600 dark:text-orange-400 flex-shrink-0">
              <Flame size={11} />
              {streak}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={toggleStatus}
            title={isPaused ? 'Resume' : 'Pause'}
            className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            {isPaused ? <Play size={11} /> : <Pause size={11} />}
          </button>
          <button
            onClick={onDelete}
            title="Delete practice"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Heatmap for boolean */}
      {practice.kind === 'boolean' && (
        <>
          <div className="flex gap-0.5 mb-2.5 flex-wrap">
            {days.map((d) => {
              const val = entriesByDate.get(d);
              const isToday = d === todayISO();
              let bg = 'bg-muted';
              if (val !== undefined) {
                bg = val > 0 ? '' : 'bg-destructive/30';
              }
              return (
                <div
                  key={d}
                  title={`${d}${val !== undefined ? (val > 0 ? ' ✓' : ' ✗') : ''}`}
                  className={`w-4 h-4 rounded-sm ${bg} ${isToday ? 'ring-1 ring-offset-1 ring-ring ring-offset-background' : ''}`}
                  style={val !== undefined && val > 0 ? { backgroundColor: practice.color } : undefined}
                />
              );
            })}
          </div>
          <button
            onClick={toggleToday}
            disabled={logging || isPaused || isDone}
            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-50"
            style={{
              backgroundColor: (entriesByDate.get(todayISO()) ?? 0) > 0 ? practice.color : 'transparent',
              color: (entriesByDate.get(todayISO()) ?? 0) > 0 ? 'white' : practice.color,
              border: `1px solid ${practice.color}`,
            }}
          >
            {logging ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (entriesByDate.get(todayISO()) ?? 0) > 0 ? (
              <><Check size={12} /> Done today</>
            ) : (
              <>Mark today</>
            )}
          </button>
        </>
      )}

      {/* Numeric input */}
      {practice.kind === 'numeric' && (
        <>
          <div className="text-xs text-muted-foreground mb-1.5">
            Today: <span className="font-medium text-foreground">
              {entriesByDate.get(todayISO()) ?? 0} {practice.unit}
            </span>
            {practice.target_value && (
              <span> / {practice.target_value} {practice.unit}</span>
            )}
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              placeholder={`Value${practice.unit ? ` (${practice.unit})` : ''}`}
              value={numericValue}
              onChange={(e) => setNumericValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
              disabled={logging || isPaused || isDone}
              className="flex-1 h-8 px-2.5 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
            <button
              onClick={logNumeric}
              disabled={logging || !numericValue || isPaused || isDone}
              className="h-8 px-3 text-xs font-medium rounded-md disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: practice.color, color: 'white' }}
            >
              {logging ? <Loader2 size={11} className="animate-spin" /> : 'Log'}
            </button>
          </div>
        </>
      )}

      {practice.duration_days && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1">
              <Target size={9} />
              {completedDays}/{practice.duration_days} days
            </span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${progressPct}%`, backgroundColor: practice.color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task card ───────────────────────────────────────────────────────────────
function TaskCard({
  task,
  onUpdate,
  onDelete,
  onReload,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task;
  onUpdate: (data: Partial<Task>) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  // New practice form
  const [pTitle, setPTitle] = useState('');
  const [pKind, setPKind] = useState<PracticeKind>('boolean');
  const [pUnit, setPUnit] = useState('');
  const [pTarget, setPTarget] = useState('');
  const [pDuration, setPDuration] = useState('30');
  const [pColor, setPColor] = useState(COLORS[0]);
  const [pSaving, setPSaving] = useState(false);

  const isOverdue =
    task.status !== 'done' &&
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const createPractice = async () => {
    if (!pTitle.trim()) return;
    setPSaving(true);
    try {
      await practicesApi.create(task.id, {
        title: pTitle.trim(),
        kind: pKind,
        unit: pUnit.trim(),
        target_value: pTarget ? parseFloat(pTarget) : null,
        duration_days: pDuration ? parseInt(pDuration) : null,
        color: pColor,
      });
      setPTitle('');
      setPUnit('');
      setPTarget('');
      setPDuration('30');
      setPColor(COLORS[0]);
      setPKind('boolean');
      setAdding(false);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create practice');
    } finally {
      setPSaving(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group bg-card border border-border rounded-lg hover:border-border-strong hover:shadow-sm transition-all overflow-hidden cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_CLS[task.priority]}`}>
            {task.priority === 'high' && <AlertCircle size={11} />}
            {task.priority === 'medium' && <ArrowUp size={11} />}
            {task.priority === 'low' && <ArrowRight size={11} />}
            {task.priority.toUpperCase()}
          </div>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          >
            <X size={13} />
          </button>
        </div>

        <h4 className="text-sm font-medium mb-2.5 leading-snug">{task.title}</h4>

        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
            {task.due_date && (
              <>
                <Calendar size={11} />
                {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </>
            )}
          </div>
          <select
            value={task.status}
            onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
            onClick={(e) => e.stopPropagation()}
            className="text-xs bg-transparent border-0 focus:outline-none text-muted-foreground cursor-pointer hover:text-foreground"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Practices toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2 border-t border-border flex items-center gap-1.5 text-xs text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <TrendingUp size={11} />
        <span>Practices</span>
        {task.practices.length > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium">
            {task.practices.length}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-secondary/20 space-y-2">
              {task.practices.map((p) => (
                <PracticeWidget
                  key={p.id}
                  practice={p}
                  onUpdate={async (data) => {
                    await practicesApi.update(p.id, data as any);
                    await onReload();
                  }}
                  onDelete={async () => {
                    if (!confirm('Delete this practice?')) return;
                    await practicesApi.delete(p.id);
                    await onReload();
                  }}
                  onReload={onReload}
                />
              ))}

              {!adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors"
                >
                  <Plus size={11} />
                  Add practice
                </button>
              ) : (
                <div className="p-2.5 bg-card border border-border rounded-md space-y-2">
                  <input
                    type="text"
                    placeholder="Practice title (e.g. Don't smoke)"
                    value={pTitle}
                    onChange={(e) => setPTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createPractice()}
                    autoFocus
                    className="w-full h-8 px-2.5 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={pKind}
                      onChange={(e) => setPKind(e.target.value as PracticeKind)}
                      className="h-8 px-2 text-xs bg-input-background border border-border rounded-md"
                    >
                      <option value="boolean">Yes / No</option>
                      <option value="numeric">Numeric</option>
                    </select>
                    {pKind === 'numeric' && (
                      <input
                        type="text"
                        placeholder="Unit"
                        value={pUnit}
                        onChange={(e) => setPUnit(e.target.value)}
                        className="w-20 h-8 px-2 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                      />
                    )}
                    <input
                      type="number"
                      placeholder="Days"
                      value={pDuration}
                      onChange={(e) => setPDuration(e.target.value)}
                      className="w-16 h-8 px-2 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                    />
                    {pKind === 'numeric' && (
                      <input
                        type="number"
                        placeholder="Target"
                        value={pTarget}
                        onChange={(e) => setPTarget(e.target.value)}
                        className="w-20 h-8 px-2 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setPColor(c)}
                          className={`w-5 h-5 rounded transition-all ${pColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setAdding(false)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createPractice}
                        disabled={pSaving || !pTitle.trim()}
                        className="h-7 px-3 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50"
                      >
                        {pSaving ? <Loader2 size={10} className="animate-spin" /> : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const load = async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await tasksApi.create({
        title: title.trim(),
        priority,
        status: 'todo',
        due_date: dueDate || null,
      });
      setTitle('');
      setPriority('medium');
      setDueDate('');
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    try {
      await tasksApi.update(id, data as any);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to update');
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task and all its practices?')) return;
    try {
      await tasksApi.delete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete');
    }
  };

  const handleDrop = async (taskId: string, targetStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t)));

    try {
      await tasksApi.update(taskId, { status: targetStatus });
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to move task');
      await load(); // revert from server
    }
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tasks.length} total · {tasksByStatus('done').length} completed
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Plus size={15} />
            New task
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="p-5 bg-card border border-border rounded-lg">
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  className="w-full h-10 px-3 mb-3 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="h-9 px-3 rounded-lg border border-border bg-input-background text-sm cursor-pointer"
                  >
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                  </select>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-border bg-input-background text-sm"
                  />
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowForm(false)}
                    className="h-9 px-3.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={create}
                    disabled={creating || !title.trim()}
                    className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {creating && <Loader2 size={13} className="animate-spin" />}
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STATUSES.map((status) => {
            const list = tasksByStatus(status.key);
            const isDropTarget = dragOverStatus === status.key;
            return (
              <div
                key={status.key}
                className="flex flex-col"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                  if (dragOverStatus !== status.key) setDragOverStatus(status.key);
                }}
                onDragLeave={(e) => {
                  // Only clear if we're leaving the column itself, not a child
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStatus(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) handleDrop(id, status.key);
                  setDragOverStatus(null);
                }}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-2 h-2 rounded-full ${status.dot}`} />
                  <h3 className="text-sm font-semibold">{status.label}</h3>
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div
                  className={`flex flex-col gap-2 min-h-[160px] p-1 rounded-lg transition-colors ${
                    isDropTarget ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''
                  }`}
                >
                  <AnimatePresence>
                    {list.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onUpdate={(data) => updateTask(task.id, data)}
                        onDelete={() => deleteTask(task.id)}
                        onReload={load}
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStatus(null);
                        }}
                        isDragging={draggingId === task.id}
                      />
                    ))}
                  </AnimatePresence>
                  {list.length === 0 && !isDropTarget && (
                    <div className="py-6 px-3 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      {draggingId ? 'Drop here' : 'No tasks'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight, Loader2, Check,
  ChevronDown, ChevronRight, Pencil, Trash2, Target as TargetIcon,
  ListTodo, Repeat,
} from 'lucide-react';
import { toast } from 'sonner';
import SwipeRow from './SwipeRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import { tasksApi, todosApi } from '../api/client';
import type { Task, TaskPriority, TaskStatus, Todo, TodoKind, TodoRecurrence } from '../api/types';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════
const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'Backlog' },
  { key: 'background', label: 'Background' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high:   'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  low:    'text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-800',
};

const TODO_COLORS = ['#4f46e5', '#e11d48', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#7c3aed'];

// Left-stripe colors by recurrence kind
const STRIPE_COLOR: Record<TodoRecurrence, string> = {
  weekly: '#3b82f6',   // blue
  daily:  '#10b981',   // green
  none:   '#8b5cf6',   // purple (one-off)
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function todoValueToday(todo: Todo): number {
  const today = todayIso();
  const entry = todo.entries.find((e) => e.date === today);
  return entry?.value ?? 0;
}

// Adaptive increment steps based on target value
function adaptiveSteps(target: number | null | undefined): number[] {
  if (!target || target <= 0) return [1, 5];
  if (target <= 10) return [1];
  if (target <= 50) return [1, 5];
  if (target <= 200) return [5, 10, 25];
  if (target <= 1000) return [10, 50, 100];
  return [50, 100, 500];
}

// ═══════════════════════════════════════════════════════════════════════════
// TodoRow — single todo with stripe, checkbox/numeric input, +N buttons
// ═══════════════════════════════════════════════════════════════════════════
function TodoRow({ todo, onReload, showMeta = false }: {
  todo: Todo;
  onReload: () => Promise<void>;
  showMeta?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [numInput, setNumInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = todayIso();
  const todayVal = todoValueToday(todo);
  const steps = adaptiveSteps(todo.target_value);

  const stripeColor = STRIPE_COLOR[todo.recurrence];

  const toggle = async () => {
    if (todo.kind !== 'boolean') return;
    setBusy(true);
    try {
      await todosApi.upsertEntry(todo.id, today, todayVal > 0 ? 0 : 1);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const logNumeric = async (valueOverride?: number) => {
    const v = valueOverride !== undefined ? valueOverride : parseFloat(numInput);
    if (isNaN(v) || v < 0) return;
    setBusy(true);
    try {
      await todosApi.upsertEntry(todo.id, today, todayVal + v);
      setNumInput('');
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteTodo = async () => {
    setBusy(true);
    try {
      await todosApi.delete(todo.id);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const recurrenceLabel =
    todo.recurrence === 'daily' ? 'Daily' :
    todo.recurrence === 'weekly' ? 'Weekly' :
    todo.due_date ? new Date(todo.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) :
    '';

  // Numeric progress based on total_value (which sums own + children entries)
  const numericTotal = todo.total_value;
  const numericPct = todo.target_value && todo.target_value > 0
    ? Math.min(100, (numericTotal / todo.target_value) * 100)
    : 0;

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete todo?"
        message={`"${todo.title}" will be removed.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteTodo}
      />
      <div className="group relative flex items-stretch gap-0 rounded-md bg-card border border-border overflow-hidden">
        {/* Left stripe — color by recurrence */}
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: stripeColor }} />

        <div className="flex-1 p-2.5 min-w-0">
          <div className="flex items-center gap-2">
            {/* Boolean: checkbox */}
            {todo.kind === 'boolean' && (
              <button
                onClick={toggle}
                disabled={busy}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  todayVal > 0 ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'
                }`}
                title={todayVal > 0 ? 'Mark as not done' : 'Mark as done'}
              >
                {busy ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> :
                 todayVal > 0 ? <Check size={13} className="text-primary-foreground" /> : null}
              </button>
            )}

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${todayVal > 0 && todo.kind === 'boolean' ? 'line-through text-muted-foreground' : ''}`}>
                {todo.title}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {todo.recurrence !== 'none' && (
                  <span className="inline-flex items-center gap-0.5">
                    <Repeat size={10} />
                    {recurrenceLabel}
                  </span>
                )}
                {todo.recurrence === 'none' && recurrenceLabel && (
                  <span className="inline-flex items-center gap-0.5">
                    <Calendar size={10} />
                    {recurrenceLabel}
                  </span>
                )}
                {todo.kind === 'numeric' && (
                  <span>
                    {numericTotal}{todo.target_value ? ` / ${todo.target_value}` : ''}
                    {todo.unit ? ` ${todo.unit}` : ''}
                  </span>
                )}
                {showMeta && todo.task_title && (
                  <span className="truncate max-w-[160px]">· {todo.task_title}</span>
                )}
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Numeric input row + adaptive +N buttons */}
          {todo.kind === 'numeric' && (
            <>
              {todo.target_value && todo.target_value > 0 && (
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${numericPct}%`, backgroundColor: stripeColor }} />
                </div>
              )}
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="+value"
                  value={numInput}
                  onChange={(e) => setNumInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
                  className="w-20 h-8 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                />
                {steps.map((step) => (
                  <button
                    key={step}
                    onClick={() => logNumeric(step)}
                    disabled={busy}
                    className="h-8 px-2 text-xs bg-secondary border border-border rounded-md hover:bg-secondary/80 disabled:opacity-50 font-medium"
                  >
                    +{step}
                  </button>
                ))}
                <button
                  onClick={() => logNumeric()}
                  disabled={busy || !numInput}
                  className="h-8 px-2.5 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-40 font-medium"
                >
                  Log
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly with children — shown in Weekly section
// ═══════════════════════════════════════════════════════════════════════════
function WeeklyTodoBlock({ weekly, allTodos, onReload }: {
  weekly: Todo;
  allTodos: Todo[];
  onReload: () => Promise<void>;
}) {
  const children = allTodos.filter((t) => t.parent_todo_id === weekly.id);
  const stripeColor = STRIPE_COLOR.weekly;

  const numericTotal = weekly.total_value;
  const pct = weekly.target_value && weekly.target_value > 0
    ? Math.min(100, (numericTotal / weekly.target_value) * 100)
    : 0;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-stretch">
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: stripeColor }} />
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: `${stripeColor}20`, color: stripeColor }}>
              WEEKLY
            </span>
            <span className="font-medium text-sm flex-1 truncate">{weekly.title}</span>
            {weekly.kind === 'numeric' && (
              <span className="text-xs text-muted-foreground">
                {numericTotal}/{weekly.target_value} {weekly.unit}
              </span>
            )}
          </div>
          {weekly.task_title && (
            <div className="text-[11px] text-muted-foreground mb-2">from task: {weekly.task_title}</div>
          )}
          {weekly.kind === 'numeric' && weekly.target_value && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
              <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: stripeColor }} />
            </div>
          )}
          {children.length > 0 && (
            <div className="mt-2 pl-3 border-l-2 border-border space-y-1.5">
              {children.map((child) => (
                <TodoRow key={child.id} todo={child} onReload={onReload} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create-todo form (used inside a task and in agenda)
// ═══════════════════════════════════════════════════════════════════════════
function CreateTodoForm({
  weeklies, defaultTaskId, onCreate, onCancel,
}: {
  weeklies?: Todo[];           // available weeklies to attach as parent
  defaultTaskId?: string | null;
  onCreate: (data: {
    title: string;
    kind: TodoKind;
    unit: string;
    target_value: number | null;
    recurrence: TodoRecurrence;
    due_date: string | null;
    color: string;
    parent_todo_id: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TodoKind>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [recurrence, setRecurrence] = useState<TodoRecurrence>('none');
  const [due, setDue] = useState('');
  const [color, setColor] = useState(TODO_COLORS[0]);
  const [parentId, setParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        kind,
        unit: unit.trim(),
        target_value: target ? parseFloat(target) : null,
        recurrence,
        due_date: due || null,
        color,
        parent_todo_id: parentId || null,
      });
    } finally {
      setSaving(false);
    }
  };

  // Can only attach to weekly if this is a daily
  const canAttachParent = recurrence === 'daily' && weeklies && weeklies.length > 0;

  return (
    <div className="p-2.5 bg-card border border-border rounded-md space-y-2">
      <input
        type="text"
        placeholder='Todo title (e.g. "Solve 50 algebra problems")'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
      />
      <div className="flex flex-wrap gap-1.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TodoKind)}
          className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        >
          <option value="boolean">Done / Not done</option>
          <option value="numeric">Numeric</option>
        </select>
        <select
          value={recurrence}
          onChange={(e) => {
            const v = e.target.value as TodoRecurrence;
            setRecurrence(v);
            if (v !== 'daily') setParentId('');
          }}
          className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        >
          <option value="none">One-off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        {kind === 'numeric' && (
          <>
            <input
              type="text"
              placeholder="Unit (pages)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-24 h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
            <input
              type="number"
              placeholder="Target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-20 h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
          </>
        )}
        {recurrence === 'none' && (
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
        )}
        {canAttachParent && (
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-9 px-2 text-sm bg-input-background border border-border rounded-md max-w-[200px]"
          >
            <option value="">No weekly parent</option>
            {weeklies!.map((w) => (
              <option key={w.id} value={w.id}>↳ {w.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {TODO_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded transition-all ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim()}
            className="h-8 px-3 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Progress block inside a task — weekly with children + flat list + create
// ═══════════════════════════════════════════════════════════════════════════
function ProgressBlock({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const weeklies = task.todos.filter((t) => t.recurrence === 'weekly');
  const topLevelNonWeekly = task.todos.filter((t) => !t.parent_todo_id && t.recurrence !== 'weekly');

  return (
    <div className="p-3 bg-secondary/20 space-y-2.5">
      {task.todos.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-muted-foreground">Progress</span>
            <span className="font-semibold">{task.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      )}

      {/* Weekly blocks with children */}
      {weeklies.map((w) => (
        <WeeklyTodoBlock key={w.id} weekly={w} allTodos={task.todos} onReload={onReload} />
      ))}

      {/* Non-weekly top-level todos (flat) */}
      {topLevelNonWeekly.map((todo) => (
        <TodoRow key={todo.id} todo={todo} onReload={onReload} />
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full h-10 md:h-8 flex items-center justify-center gap-1.5 text-sm md:text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors"
        >
          <Plus size={13} /> Add todo
        </button>
      ) : (
        <CreateTodoForm
          weeklies={weeklies}
          onCancel={() => setAdding(false)}
          onCreate={async (data) => {
            await todosApi.createForTask(task.id, data);
            setAdding(false);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Task card
// ═══════════════════════════════════════════════════════════════════════════
function TaskCard({
  task, onUpdate, onDelete, onReload, onDragStart, onDragEnd, isDragging, isMobile,
}: {
  task: Task;
  onUpdate: (data: Partial<Task>) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isMobile: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editStart, setEditStart] = useState(task.start_date ?? '');
  const [editDue, setEditDue] = useState(task.due_date ?? '');
  const [editSaving, setEditSaving] = useState(false);

  const isOverdue =
    task.status !== 'done' &&
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const startEdit = () => {
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditStart(task.start_date ?? '');
    setEditDue(task.due_date ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate({
        title: editTitle.trim(),
        priority: editPriority,
        start_date: editStart || null,
        due_date: editDue || null,
      });
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  const periodLabel = task.start_date && task.due_date
    ? `${formatDate(task.start_date)} – ${formatDate(task.due_date)}`
    : formatDate(task.due_date);

  const cardBody = (
    <>
      {editing ? (
        <div className="p-4 space-y-2.5">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full h-10 px-3 text-base md:text-sm rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
              className="h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm cursor-pointer flex-1 min-w-0"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-muted-foreground">Start</label>
              <input
                type="date"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className="w-full h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-muted-foreground">Due</label>
              <input
                type="date"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                className="w-full h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditing(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground rounded-md">
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={editSaving || !editTitle.trim()}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {editSaving && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="p-4 md:p-3.5">
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_CLS[task.priority]}`}>
                {task.priority === 'high' && <AlertCircle size={11} />}
                {task.priority === 'medium' && <ArrowUp size={11} />}
                {task.priority === 'low' && <ArrowRight size={11} />}
                {task.priority.toUpperCase()}
              </div>
              {!isMobile && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(); }} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            <h4 className="text-base md:text-sm font-medium mb-2 leading-snug">{task.title}</h4>

            <div className="mb-2.5">
              <TagSelector targetId={task.id} targetKind="task" tags={task.tags ?? []} onChange={onReload} compact />
            </div>

            {task.todos.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-[11px] mb-0.5 text-muted-foreground">
                  <span>Progress</span>
                  <span className="font-semibold text-foreground">{task.progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1 text-sm md:text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                {periodLabel && (<>
                  <Calendar size={13} />
                  {periodLabel}
                </>)}
              </div>
              <select
                value={task.status}
                onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
                onClick={(e) => e.stopPropagation()}
                className="text-sm md:text-xs bg-transparent border-0 focus:outline-none text-muted-foreground cursor-pointer hover:text-foreground"
              >
                {STATUSES.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
              </select>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 md:px-3.5 py-2.5 md:py-2 border-t border-border flex items-center gap-1.5 text-sm md:text-xs text-muted-foreground hover:bg-secondary/50 transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <ListTodo size={13} />
            <span>Todos</span>
            {task.todos.length > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-muted text-[11px] md:text-[10px] font-medium">
                {task.todos.length}
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
                <ProgressBlock task={task} onReload={onReload} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );

  const cardClasses = `group bg-card border border-border rounded-lg hover:border-border-strong hover:shadow-sm transition-all overflow-hidden ${
    isDragging ? 'opacity-40' : ''
  } ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'}`;

  if (isMobile) {
    return (
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
        <SwipeRow enabled={!editing} onEdit={startEdit} onDelete={onDelete}>
          <div className={cardClasses}>{cardBody}</div>
        </SwipeRow>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable={!editing}
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cardClasses}
    >
      {cardBody}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ToDo panel — 4 sections: Today / Weekly / Future / Past
// ═══════════════════════════════════════════════════════════════════════════
function TodoPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const [section, setSection] = useState<'today' | 'week' | 'future' | 'past'>('today');
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pastDays, setPastDays] = useState(30);
  const [adding, setAdding] = useState(false);
  const [addTaskId, setAddTaskId] = useState<string>('');

  const loadSection = async () => {
    setLoading(true);
    try {
      const data = await todosApi.agenda(section, pastDays);
      setItems(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSection(); }, [section, pastDays]);

  const addTodo = async (data: any) => {
    try {
      if (addTaskId) {
        await todosApi.createForTask(addTaskId, data);
      } else {
        await todosApi.createStandalone(data);
      }
      setAdding(false);
      setAddTaskId('');
      await loadSection();
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  // Group future items by due_date
  const futureGroups = useMemo(() => {
    if (section !== 'future') return [];
    const groups = new Map<string, Todo[]>();
    for (const item of items) {
      const key = item.due_date || 'no-date';
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, section]);

  // For weekly view: find all weeklies from tasks
  const weeklyWithChildren = useMemo(() => {
    if (section !== 'week') return null;
    const allTodos: Todo[] = [];
    tasks.forEach((t) => allTodos.push(...t.todos));
    // Show weeklies (recurrence='weekly') with their children OR any item from agenda
    const weeklies = items.filter((t) => t.recurrence === 'weekly');
    const others = items.filter((t) => t.recurrence !== 'weekly');
    return { weeklies, others, allTodos };
  }, [items, section, tasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().split('T')[0];
  const todayLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const completedToday = items.filter((t) => (t.entries.find((e) => e.date === todayIso)?.value ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
        {(['today', 'week', 'future', 'past'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 h-8 rounded text-sm capitalize ${section === s ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
          >
            {s === 'today' ? 'Today' : s === 'week' ? 'Weekly' : s === 'future' ? 'Future' : 'Past'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Section header */}
          {section === 'today' && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">{todayLabel}</h2>
              <span className="text-xs text-muted-foreground">{completedToday} of {items.length} done</span>
            </div>
          )}

          {/* Today: flat list */}
          {section === 'today' && items.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">Nothing for today.</div>
          )}
          {section === 'today' && items.map((t) => (
            <TodoRow key={t.id} todo={t} onReload={async () => { await loadSection(); await onReload(); }} showMeta />
          ))}

          {/* Weekly: show weeklies with children + other non-weekly one-off items due this week */}
          {section === 'week' && weeklyWithChildren && (
            <>
              {weeklyWithChildren.weeklies.length === 0 && weeklyWithChildren.others.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">Nothing for this week.</div>
              )}
              {weeklyWithChildren.weeklies.map((w) => (
                <WeeklyTodoBlock
                  key={w.id}
                  weekly={w}
                  allTodos={weeklyWithChildren.allTodos}
                  onReload={async () => { await loadSection(); await onReload(); }}
                />
              ))}
              {weeklyWithChildren.others.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Other this week</div>
                  {weeklyWithChildren.others.map((t) => (
                    <div key={t.id} className="mb-1.5">
                      <TodoRow todo={t} onReload={async () => { await loadSection(); await onReload(); }} showMeta />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Future: grouped by date */}
          {section === 'future' && (
            futureGroups.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No future items.</div>
            ) : futureGroups.map(([date, list]) => (
              <div key={date}>
                <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
                  {date === 'no-date' ? 'No date' :
                    new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <TodoRow key={t.id} todo={t} onReload={async () => { await loadSection(); await onReload(); }} showMeta />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Past: list + "Show older" button */}
          {section === 'past' && (
            <>
              {items.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Nothing in the past {pastDays} days.</div>
              ) : (
                items.map((t) => (
                  <TodoRow key={t.id} todo={t} onReload={async () => { await loadSection(); await onReload(); }} showMeta />
                ))
              )}
              <button
                onClick={() => setPastDays(pastDays + 30)}
                className="w-full h-9 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors"
              >
                Show older ({pastDays}+ days)
              </button>
            </>
          )}

          {/* Add todo (only in today/week/future) */}
          {section !== 'past' && (
            !adding ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full h-10 md:h-9 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors mt-3"
              >
                <Plus size={14} /> Add todo
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <select
                  value={addTaskId}
                  onChange={(e) => setAddTaskId(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
                >
                  <option value="">— Standalone (no task) —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <CreateTodoForm
                  weeklies={addTaskId ? tasks.find((t) => t.id === addTaskId)?.todos.filter((t) => t.recurrence === 'weekly') : []}
                  onCancel={() => { setAdding(false); setAddTaskId(''); }}
                  onCreate={addTodo}
                />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tasks' | 'todo'>('tasks');

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newStart, setNewStart] = useState('');
  const [newDue, setNewDue] = useState('');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tasksByStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { todo: [], background: [], in_progress: [], done: [] };
    for (const t of tasks) out[t.status]?.push(t);
    return out;
  }, [tasks]);

  const createTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await tasksApi.create({
        title: newTitle.trim(),
        priority: newPriority,
        start_date: newStart || null,
        due_date: newDue || null,
      });
      setNewTitle(''); setNewPriority('medium'); setNewStart(''); setNewDue('');
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    try {
      await tasksApi.update(id, data as any);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const deleteTask = async (id: string) => {
    setConfirmState({
      title: 'Delete task?',
      message: 'All todos attached to this task will be deleted.',
      onConfirm: async () => {
        try { await tasksApi.delete(id); await load(); }
        catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
      },
    });
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
      />

      <div className="size-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          {/* View switcher: Tasks | ToDo */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex text-sm bg-muted rounded-md p-0.5">
              <button
                onClick={() => setView('tasks')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'tasks' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <TargetIcon size={14} /> Tasks
              </button>
              <button
                onClick={() => setView('todo')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'todo' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <ListTodo size={14} /> ToDo
              </button>
            </div>
          </div>

          {view === 'todo' ? (
            <TodoPanel tasks={tasks} onReload={load} />
          ) : (
            <>
              {/* New task form */}
              <div className="p-3 bg-card border border-border rounded-xl mb-5 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="New task..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createTask()}
                    className="flex-1 min-w-[200px] h-10 px-3 rounded-md border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="h-10 px-3 rounded-md border border-border bg-input-background text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button
                    onClick={createTask}
                    disabled={!newTitle.trim()}
                    className="h-10 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus size={15} /> Create
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-[11px] text-muted-foreground">Start</label>
                    <input
                      type="date"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-input-background text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-[11px] text-muted-foreground">Due</label>
                    <input
                      type="date"
                      value={newDue}
                      onChange={(e) => setNewDue(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-input-background text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Board — 4 columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {STATUSES.map(({ key, label }) => {
                  const list = tasksByStatus[key] ?? [];
                  const isDropTarget = dragOverStatus === key;
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => { if (!draggingId) return; e.preventDefault(); setDragOverStatus(key); }}
                      onDragLeave={() => setDragOverStatus((p) => p === key ? null : p)}
                      onDrop={(e) => {
                        if (!draggingId) return;
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        setDragOverStatus(null);
                        setDraggingId(null);
                        if (id) updateTask(id, { status: key });
                      }}
                      className={`rounded-xl border transition-all ${
                        isDropTarget ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20'
                      }`}
                    >
                      <div className="px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{label}</h3>
                          <span className="text-xs text-muted-foreground">{list.length}</span>
                        </div>
                      </div>
                      <div className="p-2 space-y-2 min-h-[80px]">
                        <AnimatePresence>
                          {list.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onUpdate={(data) => updateTask(task.id, data)}
                              onDelete={() => deleteTask(task.id)}
                              onReload={load}
                              onDragStart={() => setDraggingId(task.id)}
                              onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                              isDragging={draggingId === task.id}
                              isMobile={isMobile}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

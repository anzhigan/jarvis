import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight, Loader2, Check,
  ChevronDown, ChevronRight, TrendingUp, Pencil, Trash2, Target as TargetIcon,
  Inbox, ListTodo, Repeat,
} from 'lucide-react';
import { toast } from 'sonner';
import SwipeRow from './SwipeRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import { tasksApi, todosApi } from '../api/client';
import type { Task, TaskPriority, TaskStatus, Todo, TodoKind, TodoRecurrence } from '../api/types';

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high:   'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  low:    'text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-800',
};

const TODO_COLORS = ['#4f46e5', '#e11d48', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#7c3aed'];

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

// ═══════════════════════════════════════════════════════════════════════════
// Progress block — shows completion bar + compact todo list
// ═══════════════════════════════════════════════════════════════════════════
function ProgressBlock({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [tTitle, setTTitle] = useState('');
  const [tKind, setTKind] = useState<TodoKind>('boolean');
  const [tUnit, setTUnit] = useState('');
  const [tTarget, setTTarget] = useState('');
  const [tRecurrence, setTRecurrence] = useState<TodoRecurrence>('none');
  const [tDue, setTDue] = useState('');
  const [tColor, setTColor] = useState(TODO_COLORS[0]);
  const [tSaving, setTSaving] = useState(false);

  const createTodo = async () => {
    if (!tTitle.trim()) return;
    setTSaving(true);
    try {
      await todosApi.createForTask(task.id, {
        title: tTitle.trim(),
        kind: tKind,
        unit: tUnit.trim(),
        target_value: tTarget ? parseFloat(tTarget) : null,
        recurrence: tRecurrence,
        due_date: tDue || null,
        color: tColor,
      });
      setTTitle(''); setTUnit(''); setTTarget(''); setTDue('');
      setTRecurrence('none'); setTKind('boolean'); setTColor(TODO_COLORS[0]);
      setAdding(false);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create todo');
    } finally {
      setTSaving(false);
    }
  };

  return (
    <div className="p-3 bg-secondary/20 space-y-2.5">
      {/* Progress bar */}
      {task.todos.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-muted-foreground">Progress</span>
            <span className="font-semibold">{task.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Todo list */}
      {task.todos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} onReload={onReload} />
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full h-10 md:h-8 flex items-center justify-center gap-1.5 text-sm md:text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors"
        >
          <Plus size={13} />
          Add todo
        </button>
      ) : (
        <div className="p-2.5 bg-card border border-border rounded-md space-y-2">
          <input
            type="text"
            placeholder='Todo title (e.g. "Read 20 pages")'
            value={tTitle}
            onChange={(e) => setTTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTodo()}
            autoFocus
            className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
          <div className="flex flex-wrap gap-1.5">
            <select
              value={tKind}
              onChange={(e) => setTKind(e.target.value as TodoKind)}
              className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
            >
              <option value="boolean">Done / Not done</option>
              <option value="numeric">Numeric</option>
            </select>
            <select
              value={tRecurrence}
              onChange={(e) => setTRecurrence(e.target.value as TodoRecurrence)}
              className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
            >
              <option value="none">One-off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            {tKind === 'numeric' && (
              <>
                <input
                  type="text"
                  placeholder="Unit (pages)"
                  value={tUnit}
                  onChange={(e) => setTUnit(e.target.value)}
                  className="w-24 h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                />
                <input
                  type="number"
                  placeholder="Target"
                  value={tTarget}
                  onChange={(e) => setTTarget(e.target.value)}
                  className="w-20 h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                />
              </>
            )}
            {tRecurrence === 'none' && (
              <input
                type="date"
                value={tDue}
                onChange={(e) => setTDue(e.target.value)}
                className="h-9 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
            )}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1">
              {TODO_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTColor(c)}
                  className={`w-6 h-6 rounded transition-all ${tColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAdding(false)}
                className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={createTodo}
                disabled={tSaving || !tTitle.trim()}
                className="h-8 px-3 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1"
              >
                {tSaving && <Loader2 size={11} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Single todo row — check/uncheck or numeric input for today's value
// ═══════════════════════════════════════════════════════════════════════════
export function TodoRow({ todo, onReload, showTask = false }: { todo: Todo; onReload: () => Promise<void>; showTask?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [numInput, setNumInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = todayIso();
  const todayVal = todoValueToday(todo);

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

  const logNumeric = async () => {
    const v = parseFloat(numInput);
    if (isNaN(v) || v < 0) return;
    setBusy(true);
    try {
      await todosApi.upsertEntry(todo.id, today, v);
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

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete todo?"
        message={`"${todo.title}" will be removed.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteTodo}
      />
      <div className="group flex items-center gap-2 p-2 rounded-md bg-card border border-border">
        {/* Color strip */}
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: todo.color }} />

        {/* Boolean: checkbox-style button */}
        {todo.kind === 'boolean' && (
          <button
            onClick={toggle}
            disabled={busy}
            className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
              todayVal > 0 ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'
            }`}
            title={todayVal > 0 ? 'Mark as not done' : 'Mark as done'}
          >
            {busy ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> :
             todayVal > 0 ? <Check size={15} className="text-primary-foreground" /> : null}
          </button>
        )}

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${todayVal > 0 && todo.kind === 'boolean' ? 'line-through text-muted-foreground' : ''}`}>
            {todo.title}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                {todo.entries.reduce((s, e) => s + e.value, 0)}
                {todo.target_value ? ` / ${todo.target_value}` : ''}
                {todo.unit ? ` ${todo.unit}` : ''}
              </span>
            )}
            {showTask && todo.task_title && (
              <span className="truncate max-w-[160px]">· {todo.task_title}</span>
            )}
          </div>
        </div>

        {/* Numeric: input for today */}
        {todo.kind === 'numeric' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="number"
              inputMode="decimal"
              placeholder="+"
              value={numInput}
              onChange={(e) => setNumInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
              className="w-14 h-8 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
            <button
              onClick={logNumeric}
              disabled={busy || !numInput}
              className="h-8 px-2 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-40"
            >
              Log
            </button>
          </div>
        )}

        {/* Delete */}
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </>
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
  const [editDueDate, setEditDueDate] = useState(task.due_date ?? '');
  const [editSaving, setEditSaving] = useState(false);

  const isOverdue =
    task.status !== 'done' &&
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const startEdit = () => {
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDueDate(task.due_date ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate({
        title: editTitle.trim(),
        priority: editPriority,
        due_date: editDueDate || null,
      });
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

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
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm flex-1 min-w-0"
            />
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

            {/* Progress bar (collapsed) */}
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
                {task.due_date && (<>
                  <Calendar size={13} />
                  {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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

          {/* Progress toggle */}
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
// Today / Week agenda panel
// ═══════════════════════════════════════════════════════════════════════════
function AgendaPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [agendaTodos, setAgendaTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  // Ad-hoc todo creation
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<TodoKind>('boolean');
  const [newTaskId, setNewTaskId] = useState<string>('');
  const [newRecurrence, setNewRecurrence] = useState<TodoRecurrence>('none');
  const [newDueDate, setNewDueDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);

  const loadAgenda = async () => {
    setLoading(true);
    try {
      const data = await todosApi.agenda(range);
      setAgendaTodos(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAgenda(); }, [range]);

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      if (newTaskId) {
        await todosApi.createForTask(newTaskId, {
          title: newTitle.trim(),
          kind: newKind,
          recurrence: newRecurrence,
          due_date: newRecurrence === 'none' ? newDueDate : null,
        });
      } else {
        await todosApi.createStandalone({
          title: newTitle.trim(),
          kind: newKind,
          recurrence: newRecurrence,
          due_date: newRecurrence === 'none' ? newDueDate : null,
        });
      }
      setNewTitle(''); setNewTaskId(''); setNewRecurrence('none'); setNewKind('boolean');
      setAdding(false);
      await loadAgenda();
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setCreating(false);
    }
  };

  const completedToday = agendaTodos.filter((t) => todoValueToday(t) > 0).length;

  return (
    <div className="p-4 md:p-5 bg-card border border-border rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <p className="text-xs text-muted-foreground">
            {completedToday} of {agendaTodos.length} done
          </p>
        </div>
        <div className="flex text-xs bg-muted rounded-md p-0.5">
          <button
            onClick={() => setRange('today')}
            className={`px-3 h-7 rounded ${range === 'today' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
          >
            Today
          </button>
          <button
            onClick={() => setRange('week')}
            className={`px-3 h-7 rounded ${range === 'week' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
          >
            Week
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {agendaTodos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nothing on your {range === 'today' ? 'today' : 'this week'} list.
            </div>
          ) : (
            agendaTodos.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onReload={async () => { await loadAgenda(); await onReload(); }}
                showTask
              />
            ))
          )}

          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="w-full h-10 md:h-9 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors mt-2"
            >
              <Plus size={14} />
              Add todo
            </button>
          ) : (
            <div className="p-3 bg-secondary/30 border border-border rounded-md space-y-2 mt-2">
              <input
                type="text"
                placeholder="Todo title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                autoFocus
                className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
              <div className="flex flex-wrap gap-1.5">
                <select
                  value={newTaskId}
                  onChange={(e) => setNewTaskId(e.target.value)}
                  className="h-9 px-2 text-sm bg-input-background border border-border rounded-md max-w-[180px]"
                >
                  <option value="">— No task —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as TodoKind)}
                  className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
                >
                  <option value="boolean">Done / Not done</option>
                  <option value="numeric">Numeric</option>
                </select>
                <select
                  value={newRecurrence}
                  onChange={(e) => setNewRecurrence(e.target.value as TodoRecurrence)}
                  className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
                >
                  <option value="none">One-off</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                {newRecurrence === 'none' && (
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="h-9 px-2 text-sm bg-input-background border border-border rounded-md"
                  />
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAdding(false)}
                  className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={addTodo}
                  disabled={creating || !newTitle.trim()}
                  className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating && <Loader2 size={12} className="animate-spin" />}
                  Add
                </button>
              </div>
            </div>
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
  const [view, setView] = useState<'board' | 'agenda'>('board');

  // New task form
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newDueDate, setNewDueDate] = useState('');

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Confirm dialog
  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tasksByStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) out[t.status]?.push(t);
    return out;
  }, [tasks]);

  const createTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await tasksApi.create({
        title: newTitle.trim(),
        priority: newPriority,
        due_date: newDueDate || null,
      });
      setNewTitle(''); setNewPriority('medium'); setNewDueDate('');
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create');
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
      message: 'All todos attached to this task will also be deleted.',
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
          {/* View switcher */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex text-sm bg-muted rounded-md p-0.5">
              <button
                onClick={() => setView('board')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'board' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <TargetIcon size={14} />
                Board
              </button>
              <button
                onClick={() => setView('agenda')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'agenda' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <Inbox size={14} />
                Agenda
              </button>
            </div>
          </div>

          {view === 'agenda' ? (
            <AgendaPanel tasks={tasks} onReload={load} />
          ) : (
            <>
              {/* New task form */}
              <div className="p-3 bg-card border border-border rounded-xl mb-5 flex flex-wrap gap-2">
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
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="h-10 px-3 rounded-md border border-border bg-input-background text-sm"
                />
                <button
                  onClick={createTask}
                  disabled={!newTitle.trim()}
                  className="h-10 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus size={15} />
                  Create
                </button>
              </div>

              {/* Board */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {STATUSES.map(({ key, label }) => {
                  const list = tasksByStatus[key] ?? [];
                  const isDropTarget = dragOverStatus === key;
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => {
                        if (!draggingId) return;
                        e.preventDefault();
                        setDragOverStatus(key);
                      }}
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
                        isDropTarget
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-secondary/20'
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

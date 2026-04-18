import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi } from '../api/client';
import type { Task, TaskPriority, TaskStatus } from '../api/types';

const STATUSES: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'todo', label: 'To Do', color: 'bg-muted-foreground' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-chart-3' },
  { key: 'done', label: 'Done', color: 'bg-success' },
];

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
  low: 'bg-muted text-muted-foreground border-border',
};

function PriorityIcon({ p }: { p: TaskPriority }) {
  if (p === 'high') return <AlertCircle size={11} />;
  if (p === 'medium') return <ArrowUp size={11} />;
  return <ArrowRight size={11} />;
}

function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const isOverdue =
    task.status !== 'done' &&
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group p-3.5 bg-card border border-border rounded-lg hover:border-border-strong hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-2.5">
        <div
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_CLS[task.priority]}`}
        >
          <PriorityIcon p={task.priority} />
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
          className="text-xs bg-transparent border-0 focus:outline-none text-muted-foreground cursor-pointer hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </motion.div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');

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

  useEffect(() => {
    load();
  }, []);

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
    try {
      await tasksApi.delete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete');
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

        {/* Form */}
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
                    className="h-9 px-3.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {STATUSES.map((status) => {
            const list = tasksByStatus(status.key);
            return (
              <div key={status.key} className="flex flex-col">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-2 h-2 rounded-full ${status.color}`} />
                  <h3 className="text-sm font-semibold">{status.label}</h3>
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div className="flex flex-col gap-2 min-h-[120px]">
                  <AnimatePresence>
                    {list.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onUpdate={(data) => updateTask(task.id, data)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}
                  </AnimatePresence>
                  {list.length === 0 && (
                    <div className="py-6 px-3 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      No tasks
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

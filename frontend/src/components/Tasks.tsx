import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';

type Priority = 'high' | 'medium' | 'low';
type Status = 'todo' | 'in-progress' | 'done';

interface Task {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  priority: Priority;
  status: Status;
  completedAt?: Date;
}

const ITEM_TYPE = 'TASK';

interface DragItem {
  id: string;
  status: Status;
}

function TaskCard({ task, onDelete, onStatusChange }: {
  task: Task;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
}) {
  const [{ isDragging }, drag] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: ITEM_TYPE,
    item: { id: task.id, status: task.status },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const isOverdue = () => {
    if (task.status === 'done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(task.endDate);
    return endDate < today;
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-chart-4 text-white';
      case 'low':
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case 'high':
        return <AlertCircle size={12} />;
      case 'medium':
        return <ArrowUp size={12} />;
      case 'low':
        return <ArrowRight size={12} />;
    }
  };

  return (
    <motion.div
      ref={drag}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`p-3 bg-card border border-border rounded-lg hover:border-muted-foreground transition-colors cursor-move group ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getPriorityColor(task.priority)}`}>
            {getPriorityIcon(task.priority)}
            {task.priority.toUpperCase()}
          </div>
        </div>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
        >
          <X size={14} />
        </button>
      </div>

      <h4 className="mb-2 text-foreground">{task.title}</h4>

      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Calendar size={12} />
        <span>
          {new Date(task.startDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
          {' - '}
          {new Date(task.endDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      {isOverdue() && (
        <div className="mt-2 text-destructive text-sm">Overdue</div>
      )}

      {task.status === 'done' && task.completedAt && (
        <div className="mt-2 text-muted-foreground text-sm">
          Completed {task.completedAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </div>
      )}
    </motion.div>
  );
}

function KanbanColumn({
  title,
  status,
  tasks,
  onDrop,
  onDelete,
  onStatusChange,
  count
}: {
  title: string;
  status: Status;
  tasks: Task[];
  onDrop: (taskId: string, newStatus: Status) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  count: number;
}) {
  const [{ isOver }, drop] = useDrop<DragItem, unknown, { isOver: boolean }>({
    accept: ITEM_TYPE,
    drop: (item) => {
      if (item.status !== status) {
        onDrop(item.id, status);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div className="flex flex-col min-w-80 flex-1">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-foreground">{title}</h3>
        <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-sm">{count}</span>
      </div>

      <div
        ref={drop}
        className={`flex-1 p-4 space-y-3 transition-colors ${
          isOver ? 'bg-accent' : 'bg-background'
        }`}
      >
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
            />
          ))}
        </AnimatePresence>

        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

function TasksContent() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Complete project documentation',
      startDate: '2026-04-08',
      endDate: '2026-04-12',
      priority: 'high',
      status: 'in-progress',
    },
    {
      id: '2',
      title: 'Review design mockups',
      startDate: '2026-04-10',
      endDate: '2026-04-11',
      priority: 'medium',
      status: 'done',
      completedAt: new Date('2026-04-10'),
    },
    {
      id: '3',
      title: 'Prepare presentation slides',
      startDate: '2026-04-11',
      endDate: '2026-04-15',
      priority: 'high',
      status: 'todo',
    },
    {
      id: '4',
      title: 'Update API documentation',
      startDate: '2026-04-09',
      endDate: '2026-04-13',
      priority: 'low',
      status: 'todo',
    },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');

  const handleCreate = () => {
    if (!newTitle.trim() || !newStartDate || !newEndDate) return;

    const task: Task = {
      id: Date.now().toString(),
      title: newTitle,
      startDate: newStartDate,
      endDate: newEndDate,
      priority: newPriority,
      status: 'todo',
    };

    setTasks([task, ...tasks]);
    setNewTitle('');
    setNewStartDate('');
    setNewEndDate('');
    setNewPriority('medium');
    setIsCreating(false);
  };

  const handleDrop = (taskId: string, newStatus: Status) => {
    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          const wasDone = task.status === 'done';
          const isDone = newStatus === 'done';

          if (!wasDone && isDone) {
            confetti({
              particleCount: 50,
              spread: 60,
              origin: { y: 0.6 },
              colors: ['#030213', '#717182', '#ececf0'],
            });
          }

          return {
            ...task,
            status: newStatus,
            completedAt: isDone ? new Date() : undefined,
          };
        }
        return task;
      })
    );
  };

  const handleDelete = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  const handleStatusChange = (id: string, status: Status) => {
    handleDrop(id, status);
  };

  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div className="size-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-foreground">Task Board</h2>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Priority:</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-1 bg-destructive text-destructive-foreground rounded text-xs">
                <AlertCircle size={12} />
                High
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-chart-4 text-white rounded text-xs">
                <ArrowUp size={12} />
                Medium
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                <ArrowRight size={12} />
                Low
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Create Task Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setIsCreating(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4"
            >
              <h3 className="mb-4">Create New Task</h3>

              <input
                type="text"
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full mb-3 px-3 py-2 bg-input-background rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />

              <div className="mb-3">
                <label className="block mb-2 text-muted-foreground">Priority</label>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as Priority[]).map((priority) => (
                    <button
                      key={priority}
                      onClick={() => setNewPriority(priority)}
                      className={`flex-1 px-3 py-2 rounded-lg transition-colors ${
                        newPriority === priority
                          ? priority === 'high'
                            ? 'bg-destructive text-destructive-foreground'
                            : priority === 'medium'
                            ? 'bg-chart-4 text-white'
                            : 'bg-muted text-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-accent'
                      }`}
                    >
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block mb-2 text-muted-foreground">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-input-background rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-input-background rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewTitle('');
                    setNewStartDate('');
                    setNewEndDate('');
                    setNewPriority('medium');
                  }}
                  className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanban Board */}
      <div className="flex-1 flex overflow-x-auto">
        <KanbanColumn
          title="To Do"
          status="todo"
          tasks={todoTasks}
          onDrop={handleDrop}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          count={todoTasks.length}
        />
        <div className="w-px bg-border flex-shrink-0" />
        <KanbanColumn
          title="In Progress"
          status="in-progress"
          tasks={inProgressTasks}
          onDrop={handleDrop}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          count={inProgressTasks.length}
        />
        <div className="w-px bg-border flex-shrink-0" />
        <KanbanColumn
          title="Done"
          status="done"
          tasks={doneTasks}
          onDrop={handleDrop}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          count={doneTasks.length}
        />
      </div>
    </div>
  );
}

export default function Tasks() {
  return (
    <DndProvider backend={HTML5Backend}>
      <TasksContent />
    </DndProvider>
  );
}

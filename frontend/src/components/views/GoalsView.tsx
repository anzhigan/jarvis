import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi } from '../../api/client';
import type { Task, TaskStatus } from '../../api/types';
import { Button } from '../ui';
import { GoalCard } from './goals/GoalCard';
import { GoalCreateDialog } from './goals/GoalCreateDialog';
import { GoalDetailPanel } from './goals/GoalDetailPanel';

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'active',  label: 'Active' },
  { key: 'paused',  label: 'On hold' },
  { key: 'done',    label: 'Done' },
];

function KanbanColumn({
  status, tasks, onCardClick, onAdd, onChangeStatus, onDeleteTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  onCardClick: (t: Task) => void;
  onAdd: () => void;
  onChangeStatus: (t: Task, s: TaskStatus) => void;
  onDeleteTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { type: 'column', status } });
  const col = COLUMNS.find((c) => c.key === status)!;
  return (
    <section
      ref={setNodeRef}
      className="kb-col"
      data-over={isOver || undefined}
    >
      <header className="kb-col-head">
        <span className="kb-col-marker" data-status={status} />
        <span className="kb-col-name">{col.label}</span>
        <span className="kb-col-count">{tasks.length}</span>
      </header>
      <div className="kb-col-body">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <GoalCard
              key={t.id}
              task={t}
              onClick={() => onCardClick(t)}
              onChangeStatus={(s) => onChangeStatus(t, s)}
              onDelete={() => onDeleteTask(t.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="kb-empty-col">{status === 'backlog' ? 'No goals yet' : `No ${col.label.toLowerCase()} goals`}</div>
        )}
        <button className="kb-add" type="button" onClick={onAdd}>
          <Plus size={14} /> Add goal
        </button>
      </div>
    </section>
  );
}

export default function GoalsView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragSourceStatus = useRef<TaskStatus | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Listen for command-palette events.
  useEffect(() => {
    const onNew = () => setCreateOpen(true);
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const t = tasks.find((x) => x.id === id);
      if (t) setActiveTask(t);
    };
    window.addEventListener('jarvnote:newGoal', onNew);
    window.addEventListener('jarvnote:openGoal', onOpen);
    return () => {
      window.removeEventListener('jarvnote:newGoal', onNew);
      window.removeEventListener('jarvnote:openGoal', onOpen);
    };
  }, [tasks]);

  const byStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { backlog: [], active: [], paused: [], done: [] };
    const remap: Record<string, TaskStatus> = {
      todo: 'backlog', in_progress: 'active', background: 'active',
      backlog: 'backlog', active: 'active', paused: 'paused', done: 'done',
    };
    for (const t of tasks) {
      const k = remap[t.status as string] ?? 'backlog';
      out[k].push(t);
    }
    for (const k of Object.keys(out) as TaskStatus[]) {
      out[k].sort((a, b) => a.order - b.order);
    }
    return out;
  }, [tasks]);

  const handleCreate = async (data: { title: string; description: string; priority: 'low'|'medium'|'high'; color: string; due_date: string | null }) => {
    try {
      const created = await tasksApi.create({
        title: data.title,
        description: data.description,
        priority: data.priority,
        color: data.color,
        due_date: data.due_date,
        status: 'backlog',
      });
      setTasks((prev) => [...prev, created]);
      toast.success('Goal created');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create');
      throw e;
    }
  };

  const handleSave = async (id: string, data: Partial<Task>) => {
    try {
      const updated = await tasksApi.update(id, data as any);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
      if (activeTask && activeTask.id === id) setActiveTask({ ...activeTask, ...updated });
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete');
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string;
    setDragId(id);
    const t = tasks.find((x) => x.id === id);
    if (t) dragSourceStatus.current = t.status;
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const movingId = active.id as string;
    const moving = tasks.find((t) => t.id === movingId);
    if (!moving) return;

    const overData = (over.data.current ?? {}) as { type?: string; status?: TaskStatus; task?: Task };
    let targetStatus: TaskStatus | null = null;
    let beforeId: string | null = null;

    if (overData.type === 'column' && overData.status) {
      targetStatus = overData.status;
    } else if (overData.type === 'task' && overData.task) {
      targetStatus = overData.task.status;
      beforeId = overData.task.id;
    } else if (typeof over.id === 'string' && over.id.startsWith('col:')) {
      targetStatus = over.id.slice(4) as TaskStatus;
    }
    if (!targetStatus) return;

    const sameStatus = moving.status === targetStatus;

    // Optimistic update.
    setTasks((prev) => {
      let next = [...prev];
      if (sameStatus && beforeId && beforeId !== movingId) {
        const indexes = next.map((t, i) => ({ t, i })).filter((x) => x.t.status === targetStatus);
        const fromIdx = indexes.findIndex((x) => x.t.id === movingId);
        const toIdx   = indexes.findIndex((x) => x.t.id === beforeId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const reordered = arrayMove(indexes.map((x) => x.t), fromIdx, toIdx);
          let r = 0;
          next = next.map((t) => (t.status === targetStatus ? reordered[r++] : t));
        }
      } else if (!sameStatus) {
        next = next.map((t) => (t.id === movingId ? { ...t, status: targetStatus! } : t));
      }
      return next;
    });

    if (!sameStatus) {
      try {
        await tasksApi.update(movingId, { status: targetStatus });
      } catch (e: any) {
        toast.error(e?.detail ?? 'Failed to update');
        load(); // resync
      }
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

  const dragging = dragId ? tasks.find((t) => t.id === dragId) ?? null : null;

  return (
    <div className="dt-page" data-visible="true">
      <div className="dt-vw">
        <header className="dt-vw-head">
          <div className="dt-vw-head-text">
            <h1 className="dt-vw-title">Goals</h1>
            <p className="dt-vw-subtitle">{tasks.length} total · {byStatus.active.length} active · {byStatus.done.length} done</p>
          </div>
          <div className="dt-vw-head-actions">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New goal
            </Button>
          </div>
        </header>

        <div className="dt-vw-body">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragId(null)}
          >
            <div className="kb-board">
              {COLUMNS.map((c) => (
                <KanbanColumn
                  key={c.key}
                  status={c.key}
                  tasks={byStatus[c.key]}
                  onCardClick={setActiveTask}
                  onAdd={() => setCreateOpen(true)}
                  onChangeStatus={(t, s) => handleSave(t.id, { status: s })}
                  onDeleteTask={handleDelete}
                />
              ))}
            </div>
            <DragOverlay>
              {dragging && <GoalCard task={dragging} onClick={() => {}} isOverlay />}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {activeTask && (
        <GoalDetailPanel
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      <GoalCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

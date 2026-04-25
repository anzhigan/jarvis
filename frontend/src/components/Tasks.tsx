import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight, Loader2, Check,
  ChevronDown, ChevronRight, Pencil, Trash2, Target as TargetIcon,
  ListTodo, Repeat, Zap, Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import SwipeRow from './SwipeRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import { tasksApi, gosApi, sprintsApi } from '../api/client';
import type { Task, TaskPriority, TaskStatus, Go, GoKind, GoRecurrence, Sprint } from '../api/types';
import { useT } from '../store/i18n';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════
const STATUSES: { key: TaskStatus; labelKey: string }[] = [
  { key: 'todo', labelKey: 'tasks.status.todo' },
  { key: 'background', labelKey: 'tasks.status.background' },
  { key: 'in_progress', labelKey: 'tasks.status.in_progress' },
  { key: 'done', labelKey: 'tasks.status.done' },
];

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-slate-400',
};

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high:   'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  low:    'text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-800',
};

const GO_COLORS = ['#4f46e5', '#e11d48', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#7c3aed'];

const STRIPE_COLOR: Record<GoRecurrence, string> = {
  weekly: '#3b82f6',
  daily:  '#10b981',
  none:   '#8b5cf6',
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
function todayIso(): string {
  // Use local date, not UTC (avoids timezone edge case around midnight)
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function goValueToday(go: Go): number {
  const today = todayIso();
  return go.entries.find((e) => e.date === today)?.value ?? 0;
}

function adaptiveSteps(target: number | null | undefined): number[] {
  if (!target || target <= 0) return [1, 5];
  if (target <= 10) return [1];
  if (target <= 50) return [1, 5];
  if (target <= 200) return [5, 10, 25];
  if (target <= 1000) return [10, 50, 100];
  return [50, 100, 500];
}

function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GoRow — single Go with stripe + checkbox/numeric + edit
// ═══════════════════════════════════════════════════════════════════════════
function GoRow({ go, availableSprints, onReload, onLocalUpdate, showMeta = false }: {
  go: Go;
  availableSprints?: Sprint[];
  onReload: () => Promise<void>;
  onLocalUpdate?: (patched: Go) => void;   // optimistic-local update (avoids full refetch flicker)
  showMeta?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [busy, setBusy] = useState(false);
  const [numInput, setNumInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(go.title);
  const [editSprintId, setEditSprintId] = useState<string>(go.sprint_id ?? '');
  const [editDue, setEditDue] = useState(go.due_date ?? '');
  const [editColor, setEditColor] = useState(go.color);

  const today = todayIso();
  const todayVal = goValueToday(go);
  const steps = adaptiveSteps(go.target_value);
  // Use user-chosen go.color always. STRIPE_COLOR is only a legacy fallback if color missing.
  const stripeColor = go.color || STRIPE_COLOR[go.recurrence];
  // Compute is_done locally instead of trusting server field (avoids timezone
  // edge cases where server UTC "today" differs from user's local "today")
  const isDone = go.kind === 'boolean'
    ? todayVal > 0
    : (() => {
        if (go.recurrence === 'none') {
          return go.target_value !== null && go.total_value >= (go.target_value ?? 0);
        }
        return go.target_value !== null && todayVal >= (go.target_value ?? 0);
      })();

  const toggle = async () => {
    if (go.kind !== 'boolean') return;
    const newValue = todayVal > 0 ? 0 : 1;

    // Optimistic local update — immediately reflect in UI
    if (onLocalUpdate) {
      const otherEntries = go.entries.filter((e) => e.date !== today);
      const newEntries = newValue === 0
        ? otherEntries
        : [...otherEntries, { id: `temp-${Date.now()}`, go_id: go.id, date: today, value: newValue }];
      const newTotal = newEntries.reduce((s, e) => s + e.value, 0);
      onLocalUpdate({ ...go, entries: newEntries, total_value: newTotal });
    }

    setBusy(true);
    try {
      await gosApi.upsertEntry(go.id, today, newValue);
      if (!onLocalUpdate) await onReload();  // fallback: full reload when no optimistic handler
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      if (onLocalUpdate) await onReload();   // on error: re-sync from server
    } finally { setBusy(false); }
  };

  const logNumeric = async (override?: number) => {
    const v = override !== undefined ? override : parseFloat(numInput);
    if (isNaN(v) || v < 0) return;
    const newValue = todayVal + v;

    if (onLocalUpdate) {
      const otherEntries = go.entries.filter((e) => e.date !== today);
      const newEntries = newValue === 0
        ? otherEntries
        : [...otherEntries, { id: `temp-${Date.now()}`, go_id: go.id, date: today, value: newValue }];
      const newTotal = newEntries.reduce((s, e) => s + e.value, 0);
      onLocalUpdate({ ...go, entries: newEntries, total_value: newTotal });
    }

    setBusy(true);
    try {
      await gosApi.upsertEntry(go.id, today, newValue);
      setNumInput('');
      if (!onLocalUpdate) await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      if (onLocalUpdate) await onReload();
    } finally { setBusy(false); }
  };

  const deleteGo = async () => {
    setBusy(true);
    try { await gosApi.delete(go.id); await onReload(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await gosApi.update(go.id, {
        title: editTitle.trim() || go.title,
        sprint_id: editSprintId || null,
        due_date: editDue || null,
        color: editColor,
      });
      setEditing(false);
      await onReload();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setBusy(false); }
  };

  const recurrenceLabel =
    go.recurrence === 'daily' ? 'Daily' :
    go.recurrence === 'weekly' ? 'Weekly' :
    go.due_date ? formatDate(go.due_date) ?? '' : '';

  const numericPct = go.target_value && go.target_value > 0
    ? Math.min(100, (go.total_value / go.target_value) * 100)
    : 0;

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete go?"
        message={`"${go.title}" will be removed.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteGo}
      />
      {(() => {
        const cardBody = (
    <div className="group relative flex items-stretch rounded-md bg-card border border-border overflow-hidden">
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: stripeColor }} />
        <div className="flex-1 p-2.5 min-w-0">
          <div className="flex items-center gap-2">
            {go.kind === 'boolean' && (
              <button
                onClick={toggle}
                disabled={busy}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  isDone ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                {busy ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> :
                 isDone ? <Check size={13} className="text-primary-foreground" /> : null}
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                {go.title}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {go.recurrence !== 'none' && recurrenceLabel && (
                  <span className="inline-flex items-center gap-0.5"><Repeat size={10} /> {recurrenceLabel}</span>
                )}
                {go.recurrence === 'none' && recurrenceLabel && (
                  <span className="inline-flex items-center gap-0.5"><Calendar size={10} /> {recurrenceLabel}</span>
                )}
                {go.kind === 'numeric' && (
                  <span>
                    {go.total_value}{go.target_value ? ` / ${go.target_value}` : ''}
                    {go.unit ? ` ${go.unit}` : ''}
                  </span>
                )}
                {showMeta && go.task_title && <span className="truncate max-w-[140px]">· {go.task_title}</span>}
                {showMeta && go.sprint_title && (
                  <span className="truncate max-w-[140px] inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                    <LinkIcon size={9} />{go.sprint_title}
                  </span>
                )}
              </div>
            </div>
            {!editing && availableSprints !== undefined && (
              <button
                onClick={() => setEditing(true)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {editing && (
            <div className="mt-2 p-2 bg-secondary/30 border border-border rounded-md space-y-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
              {availableSprints && availableSprints.length > 0 && (
                <div>
                  <label className="text-[11px] text-muted-foreground">Attach to sprint</label>
                  <select
                    value={editSprintId}
                    onChange={(e) => setEditSprintId(e.target.value)}
                    className="w-full h-8 px-2 text-sm bg-input-background border border-border rounded-md"
                  >
                    <option value="">— No sprint —</option>
                    {availableSprints.map((s) => (
                      <option key={s.id} value={s.id}>↳ {s.title} ({formatDate(s.start_date)}–{formatDate(s.end_date)})</option>
                    ))}
                  </select>
                </div>
              )}
              {go.recurrence === 'none' && (
                <div>
                  <label className="text-[11px] text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="w-full h-8 px-2 text-sm bg-input-background border border-border rounded-md"
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Color</label>
                <div className="flex gap-1">
                  {GO_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={(e) => { e.preventDefault(); setEditColor(c); }}
                      className={`w-6 h-6 rounded transition-all ${editColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => { setEditing(false); setEditTitle(go.title); setEditSprintId(go.sprint_id ?? ''); setEditDue(go.due_date ?? ''); setEditColor(go.color); }}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >Cancel</button>
                <button
                  onClick={saveEdit} disabled={busy}
                  className="h-8 px-3 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  {busy && <Loader2 size={11} className="animate-spin" />}Save
                </button>
              </div>
            </div>
          )}

          {go.kind === 'numeric' && !editing && (
            <>
              {go.target_value && go.target_value > 0 && (
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${numericPct}%`, backgroundColor: stripeColor }} />
                </div>
              )}
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <input
                  type="number" inputMode="decimal" placeholder="+value"
                  value={numInput} onChange={(e) => setNumInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
                  className="w-20 h-8 px-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                />
                {steps.map((step) => (
                  <button
                    key={step} onClick={() => logNumeric(step)} disabled={busy}
                    className="h-8 px-2 text-xs bg-secondary border border-border rounded-md hover:bg-secondary/80 disabled:opacity-50 font-medium"
                  >+{step}</button>
                ))}
                <button
                  onClick={() => logNumeric()} disabled={busy || !numInput}
                  className="h-8 px-2.5 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-40 font-medium"
                >Log</button>
              </div>
            </>
          )}

          {/* Daily streak heatmap (only for recurring daily boolean) */}
          {go.kind === 'boolean' && go.recurrence === 'daily' && !editing && (
            <DailyStreak go={go} />
          )}
        </div>
      </div>
        );
        return isMobile && !editing
          ? <SwipeRow enabled onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{cardBody}</SwipeRow>
          : cardBody;
      })()}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DailyStreak — shows last N days as colored squares (green=done, red=missed)
// ═══════════════════════════════════════════════════════════════════════════
function DailyStreak({ go }: { go: Go }) {
  const [expanded, setExpanded] = useState(false);
  const baseDays = 10;
  const allDaysMax = 60;

  // Build map: date -> value
  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of go.entries) m.set(e.date, e.value);
    return m;
  }, [go.entries]);

  // Don't show days before go.created_at
  const createdDate = useMemo(() => {
    const d = new Date(go.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [go.created_at]);

  const daysToShow = expanded ? allDaysMax : baseDays;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const squares: { date: string; value: number; isFuture: boolean; beforeCreation: boolean }[] = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    squares.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isFuture: d > today,
      beforeCreation: d < createdDate,
    });
  }

  const doneCount = squares.filter((s) => !s.beforeCreation && s.value > 0).length;
  const eligible = squares.filter((s) => !s.beforeCreation).length;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>Streak · {doneCount}/{eligible}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-[10px] hover:text-foreground underline"
        >
          {expanded ? 'collapse' : 'more'}
        </button>
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {squares.map((s) => {
          let bg = 'bg-muted';  // before creation / unknown
          let title = s.date;
          if (s.beforeCreation) {
            bg = 'bg-muted/40';
            title = `${s.date} — before start`;
          } else if (s.value > 0) {
            bg = 'bg-emerald-500';
            title = `${s.date} — done`;
          } else {
            bg = 'bg-rose-400/60 dark:bg-rose-600/50';
            title = `${s.date} — missed`;
          }
          return (
            <div
              key={s.date}
              title={title}
              className={`w-3 h-3 rounded-sm ${bg}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SprintBlock — Sprint card with progress + children Go
// ═══════════════════════════════════════════════════════════════════════════
function SprintBlock({ sprint, allSprintsOfTask, onReload, onGoLocalUpdate, showMeta = true }: {
  sprint: Sprint;
  allSprintsOfTask?: Sprint[];
  onReload: () => Promise<void>;
  onGoLocalUpdate?: (go: Go) => void;
  showMeta?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sprint.title);
  const [editStart, setEditStart] = useState(sprint.start_date);
  const [editEnd, setEditEnd] = useState(sprint.end_date);
  const [editDescription, setEditDescription] = useState(sprint.description ?? '');
  const [editColor, setEditColor] = useState(sprint.color);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingGo, setAddingGo] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const save = async () => {
    if (!editTitle.trim()) return;
    setBusy(true);
    try {
      await sprintsApi.update(sprint.id, {
        title: editTitle.trim(),
        start_date: editStart,
        end_date: editEnd,
        description: editDescription,
        color: editColor,
      });
      setEditing(false);
      await onReload();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setBusy(false); }
  };

  const del = async () => {
    setBusy(true);
    try { await sprintsApi.delete(sprint.id); await onReload(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  const gosOfSprint = sprint.gos;

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete sprint?"
        message={`"${sprint.title}" — attached Gos will stay but lose their sprint link.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={del}
      />
      {(() => {
        const sprintCard = (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-stretch">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: sprint.color }} />
          <div className="flex-1 min-w-0">
            <div className="p-3">
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-9 px-2.5 text-sm font-medium bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">{t("tasks.start")}</label>
                      <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                        className="w-full h-8 px-2 text-sm bg-input-background border border-border rounded-md" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">End</label>
                      <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                        className="w-full h-8 px-2 text-sm bg-input-background border border-border rounded-md" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Description</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Sprint notes…"
                      rows={2}
                      className="w-full px-2 py-1.5 text-sm bg-input-background border border-border rounded-md resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">Color</label>
                    <div className="flex gap-1">
                      {['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0891b2'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditColor(c)}
                          className={`w-6 h-6 rounded ${editColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setEditing(false)} className="h-8 px-2 text-xs text-muted-foreground">Cancel</button>
                    <button onClick={save} disabled={busy} className="h-8 px-3 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                      {busy && <Loader2 size={11} className="animate-spin" />}Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="flex items-center gap-1 flex-1 min-w-0 text-left hover:text-primary"
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="font-medium text-sm truncate">{sprint.title}</span>
                    </button>
                    <span className="text-xs font-semibold text-muted-foreground flex-shrink-0">{sprint.progress}%</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setConfirmDelete(true)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-2">
                    {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}
                    {showMeta && sprint.task_title && <span> · task: {sprint.task_title}</span>}
                  </div>
                  {sprint.description && sprint.description.trim() && (
                    <p className="text-[11px] text-muted-foreground mb-2 whitespace-pre-wrap">{sprint.description}</p>
                  )}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full transition-all" style={{ width: `${sprint.progress}%`, backgroundColor: sprint.color }} />
                  </div>
                </>
              )}
            </div>

            {expanded && !editing && (
              <div className="px-3 pb-3 space-y-1.5">
                {gosOfSprint.length === 0 && !addingGo && (
                  <div className="py-2 text-center text-xs text-muted-foreground">No go items yet.</div>
                )}
                {gosOfSprint.map((go) => (
                  <GoRow
                    key={go.id}
                    go={go}
                    availableSprints={allSprintsOfTask}
                    onReload={onReload}
                    onLocalUpdate={onGoLocalUpdate}
                  />
                ))}

                {!addingGo ? (
                  <button
                    onClick={() => setAddingGo(true)}
                    className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md"
                  >
                    <Plus size={12} /> {t('tasks.addGo')}
                  </button>
                ) : (
                  <CreateGoForm
                    defaultTaskId={sprint.task_id}
                    defaultSprintId={sprint.id}
                    onCancel={() => setAddingGo(false)}
                    onCreate={async (data) => {
                      await gosApi.create({ ...data, task_id: sprint.task_id, sprint_id: sprint.id });
                      setAddingGo(false);
                      await onReload();
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
        );
        return isMobile && !editing
          ? <SwipeRow enabled onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{sprintCard}</SwipeRow>
          : sprintCard;
      })()}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Go form
// ═══════════════════════════════════════════════════════════════════════════
function CreateGoForm({
  defaultTaskId, defaultSprintId, availableSprints, onCreate, onCancel,
}: {
  defaultTaskId?: string | null;
  defaultSprintId?: string | null;
  availableSprints?: Sprint[];
  onCreate: (data: {
    title: string; kind: GoKind; unit: string; target_value: number | null;
    recurrence: GoRecurrence; due_date: string | null; color: string;
    task_id: string | null; sprint_id: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GoKind>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [recurrence, setRecurrence] = useState<GoRecurrence>('none');
  const [due, setDue] = useState('');
  const [color, setColor] = useState(GO_COLORS[0]);
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(), kind, unit: unit.trim(),
        target_value: target ? parseFloat(target) : null,
        recurrence, due_date: due || null, color,
        task_id: defaultTaskId ?? null,
        sprint_id: sprintId || null,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-2.5 bg-card border border-border rounded-md space-y-2">
      <input
        type="text" placeholder="Go title (e.g. Solve 50 problems)"
        value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
      />
      <div className="flex flex-wrap gap-1.5">
        <select value={kind} onChange={(e) => setKind(e.target.value as GoKind)}
          className="h-9 px-2 text-sm bg-input-background border border-border rounded-md">
          <option value="boolean">Done / Not done</option>
          <option value="numeric">Numeric</option>
        </select>
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as GoRecurrence)}
          className="h-9 px-2 text-sm bg-input-background border border-border rounded-md">
          <option value="none">One-off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        {kind === 'numeric' && <>
          <input type="text" placeholder="Unit (pages)" value={unit} onChange={(e) => setUnit(e.target.value)}
            className="w-24 h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
          <input type="number" placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)}
            className="w-20 h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        </>}
        {recurrence === 'none' && (
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        )}
        {availableSprints && availableSprints.length > 0 && !defaultSprintId && (
          <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}
            className="h-9 px-2 text-sm bg-input-background border border-border rounded-md max-w-[200px]">
            <option value="">No sprint</option>
            {availableSprints.map((s) => (
              <option key={s.id} value={s.id}>↳ {s.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {GO_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.preventDefault(); setColor(c); }}
              className={`w-6 h-6 rounded transition-all ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="h-8 px-2 text-sm text-muted-foreground">Cancel</button>
          <button onClick={submit} disabled={saving || !title.trim()}
            className="h-8 px-3 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1">
            {saving && <Loader2 size={11} className="animate-spin" />}Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Sprint form (inside a task)
// ═══════════════════════════════════════════════════════════════════════════
function CreateSprintForm({
  taskId, availableGos, onCreate, onCancel,
}: {
  taskId: string;
  availableGos: Go[];   // unattached gos of this task to optionally link
  onCreate: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState('#8b5cf6');
  const [toAttach, setToAttach] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !start || !end) return;
    setSaving(true);
    try {
      const sprint = await sprintsApi.create({
        task_id: taskId,
        title: title.trim(),
        description,
        start_date: start,
        end_date: end,
        color,
      });
      for (const goId of toAttach) {
        await sprintsApi.attachGo(sprint.id, goId);
      }
      await onCreate();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setSaving(false); }
  };

  const toggleAttach = (id: string) => {
    setToAttach((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-3 bg-card border border-border rounded-md space-y-2">
      <input
        type="text" placeholder="{t('sprint.titlePh')}"
        value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">{t("tasks.start")}</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">End</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md" />
        </div>
      </div>
      {availableGos.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Attach existing Go items:</div>
          <div className="max-h-40 overflow-y-auto border border-border rounded-md">
            {availableGos.map((g) => (
              <label key={g.id} className="flex items-center gap-2 p-1.5 text-xs hover:bg-secondary cursor-pointer">
                <input type="checkbox" checked={toAttach.has(g.id)} onChange={() => toggleAttach(g.id)} />
                <span className="truncate flex-1">{g.title}</span>
                {g.due_date && <span className="text-muted-foreground">{formatDate(g.due_date)}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0891b2'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.preventDefault(); setColor(c); }}
              className={`w-6 h-6 rounded ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="h-8 px-2 text-sm text-muted-foreground">Cancel</button>
          <button onClick={submit} disabled={saving || !title.trim() || !start || !end}
            className="h-8 px-3 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1">
            {saving && <Loader2 size={11} className="animate-spin" />}Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Task expanded content: sprints + direct gos
// ═══════════════════════════════════════════════════════════════════════════
function TaskExpanded({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
  const [addingSprint, setAddingSprint] = useState(false);
  const [addingGo, setAddingGo] = useState(false);
  const directGos = task.gos;

  return (
    <div className="p-3 bg-secondary/20 space-y-3">
      {task.sprints.length > 0 && (
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

      {/* Sprints */}
      {task.sprints.map((s) => (
        <SprintBlock
          key={s.id}
          sprint={s}
          allSprintsOfTask={task.sprints}
          onReload={onReload}
          showMeta={false}
        />
      ))}

      {!addingSprint ? (
        <button
          onClick={() => setAddingSprint(true)}
          className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md"
        >
          <Zap size={12} /> {t('tasks.addSprint')}
        </button>
      ) : (
        <CreateSprintForm
          taskId={task.id}
          availableGos={directGos.filter((g) => !g.sprint_id)}
          onCancel={() => setAddingSprint(false)}
          onCreate={async () => { setAddingSprint(false); await onReload(); }}
        />
      )}

      {/* Direct Gos (not in any sprint) */}
      {directGos.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Direct gos</div>
          <div className="space-y-1.5">
            {directGos.map((g) => (
              <GoRow key={g.id} go={g} availableSprints={task.sprints} onReload={onReload} />
            ))}
          </div>
        </div>
      )}

      {!addingGo ? (
        <button
          onClick={() => setAddingGo(true)}
          className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md"
        >
          <Plus size={12} /> {t('tasks.addGo')}
        </button>
      ) : (
        <CreateGoForm
          defaultTaskId={task.id}
          availableSprints={task.sprints}
          onCancel={() => setAddingGo(false)}
          onCreate={async (data) => {
            await gosApi.create({ ...data, task_id: task.id });
            setAddingGo(false);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TaskCard
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
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editStart, setEditStart] = useState(task.start_date ?? '');
  const [editDue, setEditDue] = useState(task.due_date ?? '');
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editSaving, setEditSaving] = useState(false);

  const isOverdue = task.status !== 'done' && task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const startEdit = () => {
    setEditTitle(task.title); setEditPriority(task.priority);
    setEditStart(task.start_date ?? ''); setEditDue(task.due_date ?? '');
    setEditDescription(task.description ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate({
        title: editTitle.trim(), priority: editPriority,
        start_date: editStart || null, due_date: editDue || null,
        description: editDescription,
      });
      setEditing(false);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setEditSaving(false); }
  };

  const periodLabel = task.start_date && task.due_date
    ? `${formatDate(task.start_date)} – ${formatDate(task.due_date)}`
    : formatDate(task.due_date);

  const hasContent = task.sprints.length > 0 || task.gos.length > 0;

  const cardBody = (
    <>
      {editing ? (
        <div className="p-4 space-y-2.5">
          <input
            type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full h-10 px-3 text-base md:text-sm rounded-lg border border-border bg-input-background" autoFocus
          />
          <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
            className="w-full h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-muted-foreground">{t("tasks.start")}</label>
              <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                className="w-full h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-muted-foreground">{t("tasks.due")}</label>
              <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)}
                className="w-full h-10 md:h-9 px-3 rounded-lg border border-border bg-input-background text-sm" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Notes, context, details…"
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-input-background resize-y min-h-[70px]"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditing(false)} className="h-9 px-3 text-sm text-muted-foreground">Cancel</button>
            <button onClick={saveEdit} disabled={editSaving || !editTitle.trim()}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
              {editSaving && <Loader2 size={12} className="animate-spin" />}Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="p-4 md:p-3.5">
            <div className="flex items-start gap-2 mb-2">
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${PRIORITY_DOT[task.priority]}`}
                title={`${task.priority} priority`}
              />
              <h4 className="flex-1 min-w-0 text-base md:text-sm font-medium leading-snug">{task.title}</h4>
              {!isMobile && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(); }}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                    <Pencil size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            {task.description && task.description.trim() && (
              <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">{task.description}</p>
            )}

            <div className="mb-2.5">
              <TagSelector targetId={task.id} targetKind="task" tags={task.tags ?? []} onChange={onReload} compact />
            </div>

            {hasContent && (
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
                {periodLabel && <><Calendar size={13} />{periodLabel}</>}
              </div>
              <select value={task.status}
                onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
                onClick={(e) => e.stopPropagation()}
                className="text-sm md:text-xs bg-transparent border-0 focus:outline-none text-muted-foreground cursor-pointer">
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
              </select>
            </div>
          </div>

          <button onClick={() => setExpanded(!expanded)}
            className="w-full px-4 md:px-3.5 py-2.5 md:py-2 border-t border-border flex items-center gap-1.5 text-sm md:text-xs text-muted-foreground hover:bg-secondary/50">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Zap size={13} />
            <span>Sprints & Gos</span>
            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-muted text-[11px] md:text-[10px] font-medium">
              {task.sprints.length + task.gos.length}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <TaskExpanded task={task} onReload={onReload} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );

  const cls = `group bg-card border border-border rounded-lg hover:border-border-strong hover:shadow-sm transition-all overflow-hidden ${
    isDragging ? 'opacity-40' : ''
  } ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'}`;

  if (isMobile) {
    return (
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
        <SwipeRow enabled={!editing} onEdit={startEdit} onDelete={onDelete}>
          <div className={cls}>{cardBody}</div>
        </SwipeRow>
      </motion.div>
    );
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      draggable={!editing}
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cls}
    >
      {cardBody}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GoPanel — Past / Today / Future
// ═══════════════════════════════════════════════════════════════════════════
function GoPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const t = useT();
  const [todayItems, setTodayItems] = useState<Go[]>([]);
  const [pastItems, setPastItems] = useState<Go[]>([]);
  const [futureItems, setFutureItems] = useState<Go[]>([]);
  const [pastDays, setPastDays] = useState(30);
  const [pastOpen, setPastOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addTaskId, setAddTaskId] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const [today, past, future] = await Promise.all([
        gosApi.agenda('today'),
        gosApi.agenda('past', pastDays),
        gosApi.agenda('future'),
      ]);
      setTodayItems(today);
      setPastItems(past);
      setFutureItems(future);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pastDays]);

  const reload = async () => { await load(); await onReload(); };

  const futureGroups = useMemo(() => {
    const groups = new Map<string, Go[]>();
    for (const item of futureItems) {
      const key = item.due_date || 'no-date';
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [futureItems]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const todayIsoStr = today.toISOString().split('T')[0];
  const completedToday = todayItems.filter((g) => (g.entries.find((e) => e.date === todayIsoStr)?.value ?? 0) > 0).length;

  const sprintsByTask = useMemo(() => {
    const m = new Map<string, Sprint[]>();
    tasks.forEach((t) => m.set(t.id, t.sprints));
    return m;
  }, [tasks]);

  // Patch a single Go locally across all section arrays — avoids full server refetch
  const patchGoLocal = (patched: Go) => {
    const upd = (list: Go[]) => list.map((g) => g.id === patched.id ? patched : g);
    setTodayItems(upd);
    setPastItems(upd);
    setFutureItems(upd);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">{t('tasks.goTab')}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="h-8 px-3 flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium">
            <Plus size={14} /> {t('tasks.addGo')}
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 p-3 bg-card border border-border rounded-xl">
          <select value={addTaskId} onChange={(e) => setAddTaskId(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md">
            <option value="">{t('go.standalone')}</option>
            {tasks.map((task) => (<option key={task.id} value={task.id}>{task.title}</option>))}
          </select>
          <CreateGoForm
            defaultTaskId={addTaskId || null}
            availableSprints={addTaskId ? tasks.find((tk) => tk.id === addTaskId)?.sprints : []}
            onCancel={() => { setAdding(false); setAddTaskId(''); }}
            onCreate={async (data) => {
              await gosApi.create(data);
              setAdding(false); setAddTaskId('');
              await reload();
            }}
          />
        </div>
      )}

      {/* Past */}
      <div className="border-b border-border pb-3">
        <button onClick={() => setPastOpen(!pastOpen)}
          className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {pastOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{t('go.past')}</span>
          <span className="ml-auto text-xs">{t('go.items', { n: pastItems.length })}</span>
        </button>
        {pastOpen && (
          <div className="mt-3 space-y-1.5">
            {pastItems.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t('go.nothingPast', { days: pastDays })}</div>
            ) : pastItems.map((g) => (
              <GoRow key={g.id} go={g}
                availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
            ))}
            <button onClick={() => setPastDays(pastDays + 30)}
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md">
              {t('go.showOlder', { days: pastDays })}
            </button>
          </div>
        )}
      </div>

      {/* Today */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-semibold">{t('go.today')} · {todayLabel}</h2>
          <span className="text-xs text-muted-foreground">{t('go.ofDone', { done: completedToday, total: todayItems.length })}</span>
        </div>
        {todayItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('go.nothingToday')}</div>
        ) : (
          <div className="space-y-1.5">
            {todayItems.map((g) => (
              <GoRow key={g.id} go={g}
                availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
            ))}
          </div>
        )}
      </div>

      {/* Future */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-semibold">{t('go.future')}</h2>
          <span className="text-xs text-muted-foreground">{t('go.upcoming', { n: futureItems.length })}</span>
        </div>
        {futureGroups.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('go.noFuture')}</div>
        ) : (
          <div className="space-y-3">
            {futureGroups.map(([date, list]) => (
              <div key={date}>
                <div className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wider">
                  {date === 'no-date' ? 'No date' :
                    new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1.5">
                  {list.map((g) => (
                    <GoRow key={g.id} go={g}
                      availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                      onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SprintPanel — Past / Current / Future
// ═══════════════════════════════════════════════════════════════════════════
function SprintPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const t = useT();
  const [current, setCurrent] = useState<Sprint[]>([]);
  const [past, setPast] = useState<Sprint[]>([]);
  const [future, setFuture] = useState<Sprint[]>([]);
  const [pastDays, setPastDays] = useState(90);
  const [pastOpen, setPastOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addTaskId, setAddTaskId] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const [cur, p, f] = await Promise.all([
        sprintsApi.agenda('current'),
        sprintsApi.agenda('past', pastDays),
        sprintsApi.agenda('future'),
      ]);
      setCurrent(cur); setPast(p); setFuture(f);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pastDays]);

  const reload = async () => { await load(); await onReload(); };

  // Patch a Go inside all sprint arrays — avoids full refetch flicker
  const patchGoInSprint = (patched: Go) => {
    const updSprint = (s: Sprint): Sprint => {
      if (!s.gos.some((g) => g.id === patched.id)) return s;
      const newGos = s.gos.map((g) => g.id === patched.id ? patched : g);
      // Recompute sprint progress locally
      let completed = 0;
      for (const g of newGos) {
        if (g.kind === 'boolean') {
          if (g.entries.some((e) => e.value > 0)) completed += 1;
        } else {
          const total = g.entries.reduce((sum, e) => sum + e.value, 0);
          const target = g.target_value || 0;
          if ((target > 0 && total >= target) || (target === 0 && total > 0)) completed += 1;
        }
      }
      const progress = newGos.length > 0 ? Math.round(100 * completed / newGos.length) : 0;
      return { ...s, gos: newGos, progress };
    };
    const upd = (list: Sprint[]) => list.map(updSprint);
    setCurrent(upd);
    setPast(upd);
    setFuture(upd);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">{t('tasks.sprintTab')}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="h-8 px-3 flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium">
            <Plus size={14} /> {t('tasks.addSprint')}
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 p-3 bg-card border border-border rounded-xl">
          <select value={addTaskId} onChange={(e) => setAddTaskId(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md">
            <option value="">{t('sprint.pickTask')}</option>
            {tasks.map((task) => (<option key={task.id} value={task.id}>{task.title}</option>))}
          </select>
          {addTaskId && (
            <CreateSprintForm
              taskId={addTaskId}
              availableGos={(tasks.find((tk) => tk.id === addTaskId)?.gos ?? []).filter((g) => !g.sprint_id)}
              onCancel={() => { setAdding(false); setAddTaskId(''); }}
              onCreate={async () => { setAdding(false); setAddTaskId(''); await reload(); }}
            />
          )}
        </div>
      )}

      {/* Past */}
      <div className="border-b border-border pb-3">
        <button onClick={() => setPastOpen(!pastOpen)}
          className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {pastOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{t('sprint.past')}</span>
          <span className="ml-auto text-xs">{past.length}</span>
        </button>
        {pastOpen && (
          <div className="mt-3 space-y-2">
            {past.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t('sprint.none_past', { days: pastDays })}</div>
            ) : past.map((s) => {
              const taskSprints = tasks.find((tk) => tk.id === s.task_id)?.sprints ?? [];
              return <SprintBlock key={s.id} sprint={s} allSprintsOfTask={taskSprints} onReload={reload} onGoLocalUpdate={patchGoInSprint} />;
            })}
            <button onClick={() => setPastDays(pastDays + 90)}
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md">
              {t('go.showOlder', { days: pastDays })}
            </button>
          </div>
        )}
      </div>

      {/* Current */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-semibold">{t('sprint.current')}</h2>
          <span className="text-xs text-muted-foreground">{t('sprint.active', { n: current.length })}</span>
        </div>
        {current.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('sprint.none_current')}</div>
        ) : (
          <div className="space-y-2">
            {current.map((s) => {
              const taskSprints = tasks.find((tk) => tk.id === s.task_id)?.sprints ?? [];
              return <SprintBlock key={s.id} sprint={s} allSprintsOfTask={taskSprints} onReload={reload} onGoLocalUpdate={patchGoInSprint} />;
            })}
          </div>
        )}
      </div>

      {/* Future */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-semibold">{t('sprint.future')}</h2>
          <span className="text-xs text-muted-foreground">{t('sprint.upcoming', { n: future.length })}</span>
        </div>
        {future.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('sprint.none_future')}</div>
        ) : (
          <div className="space-y-2">
            {future.map((s) => {
              const taskSprints = tasks.find((tk) => tk.id === s.task_id)?.sprints ?? [];
              return <SprintBlock key={s.id} sprint={s} allSprintsOfTask={taskSprints} onReload={reload} onGoLocalUpdate={patchGoInSprint} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
export default function Tasks() {
  const t = useT();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tasks' | 'go' | 'sprint'>('tasks');

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newStart, setNewStart] = useState('');
  const [newDue, setNewDue] = useState('');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  // Collapsed columns (mobile mainly — long scrolls)
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const toggleCollapsed = (s: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

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
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
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
        title: newTitle.trim(), priority: newPriority,
        start_date: newStart || null, due_date: newDue || null,
      });
      setNewTitle(''); setNewPriority('medium'); setNewStart(''); setNewDue('');
      await load();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    try { await tasksApi.update(id, data as any); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
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

      <div className="size-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          {/* Desktop segmented + mobile pill nav with Go in center */}
          <div className="mb-5">
            {/* Desktop */}
            <div className="hidden md:flex text-sm bg-muted rounded-md p-0.5 w-fit">
              <button onClick={() => setView('tasks')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'tasks' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
                <TargetIcon size={14} /> {t('tasks.tasksTab')}
              </button>
              <button onClick={() => setView('go')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'go' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
                <ListTodo size={14} /> {t('tasks.goTab')}
              </button>
              <button onClick={() => setView('sprint')}
                className={`px-3 h-8 rounded flex items-center gap-1.5 ${view === 'sprint' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
                <Zap size={14} /> {t('tasks.sprintTab')}
              </button>
            </div>

            {/* Mobile: three pill-shaped buttons, Go centered (larger/primary) */}
            <div className="md:hidden grid grid-cols-3 gap-2">
              <button
                onClick={() => setView('tasks')}
                className={`h-11 rounded-full font-medium text-sm flex items-center justify-center gap-1.5 transition-all ${
                  view === 'tasks'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground'
                }`}
              >
                <TargetIcon size={15} />
                {t('tasks.tasksTab')}
              </button>
              <button
                onClick={() => setView('go')}
                className={`h-11 rounded-full font-semibold text-sm flex items-center justify-center gap-1.5 transition-all ${
                  view === 'go'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground'
                }`}
              >
                <ListTodo size={16} />
                {t('tasks.goTab')}
              </button>
              <button
                onClick={() => setView('sprint')}
                className={`h-11 rounded-full font-medium text-sm flex items-center justify-center gap-1.5 transition-all ${
                  view === 'sprint'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground'
                }`}
              >
                <Zap size={15} />
                {t('tasks.sprintTab')}
              </button>
            </div>
          </div>

          {view === 'go' ? (
            <GoPanel tasks={tasks} onReload={load} />
          ) : view === 'sprint' ? (
            <SprintPanel tasks={tasks} onReload={load} />
          ) : (
            <>
              <div className="p-3 bg-card border border-border rounded-xl mb-5 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input type="text" placeholder={t("tasks.new")} value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createTask()}
                    className="flex-1 min-w-0 h-10 px-3 rounded-md border border-border bg-input-background" />
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="h-10 px-3 rounded-md border border-border bg-input-background text-sm">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                  <button onClick={createTask} disabled={!newTitle.trim()}
                    className="h-10 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5">
                    <Plus size={15} /> {t('common.create')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label className="text-[11px] text-muted-foreground">{t("tasks.start")}</label>
                    <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                      className="w-full h-10 px-2 rounded-md border border-border bg-input-background text-sm" />
                  </div>
                  <div className="min-w-0">
                    <label className="text-[11px] text-muted-foreground">{t("tasks.due")}</label>
                    <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                      className="w-full h-10 px-2 rounded-md border border-border bg-input-background text-sm" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {STATUSES.map(({ key, labelKey }) => {
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
                        if (id) updateTask(id, { status: key });
                      }}
                      className={`rounded-xl border transition-all ${
                        isDropTarget ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20'
                      }`}>
                      <button
                        onClick={() => toggleCollapsed(key)}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{label}</h3>
                          <span className="text-xs text-muted-foreground">{list.length}</span>
                        </div>
                        {collapsed.has(key)
                          ? <ChevronRight size={14} className="text-muted-foreground" />
                          : <ChevronDown size={14} className="text-muted-foreground" />}
                      </button>
                      {!collapsed.has(key) && (
                        <div className="p-2 space-y-2 min-h-[80px]">
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
                            <div className="py-6 px-3 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
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
    </>
  );
}

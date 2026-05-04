import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Calendar, X, AlertCircle, ArrowUp, ArrowRight, Loader2, Check,
  ChevronDown, ChevronRight, Pencil, Trash2, Target as TargetIcon,
  ListTodo, Repeat, Zap, Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import AddItemButton from './AddItemButton';
import SwipeRow from './SwipeRow';
import PullToRefresh from './PullToRefresh';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import CreateSheet, { FormField } from './CreateSheet';
import { tasksApi, gosApi, sprintsApi, routinesApi, tagsApi, resolveUrl } from '../api/client';
import type { Task, TaskPriority, TaskStatus, Go, GoKind, GoRecurrence, Sprint, Routine, GoalRoutineLink } from '../api/types';
import { useT } from '../store/i18n';
import { useAuthStore } from '../store/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════
const STATUSES: { key: TaskStatus; labelKey: string }[] = [
  { key: 'backlog', labelKey: 'tasks.status.backlog' },
  { key: 'active', labelKey: 'tasks.status.active' },
  { key: 'paused', labelKey: 'tasks.status.paused' },
  { key: 'done', labelKey: 'tasks.status.done' },
];

const PRIORITY_STARS: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function PriorityStars({ priority, size = 12 }: { priority: TaskPriority; size?: number }) {
  const n = PRIORITY_STARS[priority];
  return (
    <span title={`${priority} priority`} className="inline-flex items-center gap-px text-muted-foreground/70" style={{ fontSize: size }}>
      {'★'.repeat(n)}
    </span>
  );
}

const PRIORITY_CLS: Record<TaskPriority, string> = {
  high:   'text-foreground bg-secondary border-border',
  medium: 'text-foreground bg-secondary border-border',
  low:    'text-foreground bg-secondary border-border',
};

// Unified palette — 6 carefully picked colors for tasks/goals/steps/gos/routines/tags/sprints
// Standard 7-color palette — used everywhere across the app for visual consistency.
export const ENTITY_COLORS = [
  '#5B5BD6', // indigo (brand)
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EF4444', // red
  '#71717A', // slate
];

export const STANDARD_COLORS = ENTITY_COLORS;
const GO_COLORS = ENTITY_COLORS;

const STRIPE_COLOR: Record<GoRecurrence, string> = {
  weekly: ENTITY_COLORS[4],   // cyan
  daily:  ENTITY_COLORS[1],   // emerald
  none:   ENTITY_COLORS[0],   // indigo
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
  const t = useT();
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

  const today = todayIso();
  const todayVal = goValueToday(go);
  const steps = adaptiveSteps(go.target_value);
  // Use user-chosen go.color always. STRIPE_COLOR is only a legacy fallback if color missing.
  const stripeColor = go.color || STRIPE_COLOR[go.recurrence];
  // Compute is_done locally instead of trusting server field (avoids timezone
  // edge cases where server UTC "today" differs from user's local "today")
  // For one-off boolean: any positive entry counts (could be past)
  // For daily/weekly recurring boolean: check today
  // For numeric: check based on recurrence
  const hasAnyPositive = go.entries.some((e) => e.value > 0);
  const isDone = go.kind === 'boolean'
    ? (go.recurrence === 'none' ? hasAnyPositive : todayVal > 0)
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

  const recurrenceLabel =
    go.recurrence === 'daily' ? 'Daily' :
    go.recurrence === 'weekly' ? 'Weekly' :
    go.due_date ? formatDate(go.due_date) ?? '' : '';

  const numericPct = go.target_value && go.target_value > 0
    ? Math.min(100, (go.total_value / go.target_value) * 100)
    : 0;

  const subParts: string[] = [];
  if (go.task_title) subParts.push(go.task_title);
  else subParts.push('Standalone');
  if (recurrenceLabel) subParts.push(recurrenceLabel);
  if (go.kind === 'numeric') {
    subParts.push(`${go.total_value}${go.target_value ? ` / ${go.target_value}` : ''}${go.unit ? ` ${go.unit}` : ''}`);
  }
  if (go.sprint_title) subParts.push(`↳ ${go.sprint_title}`);
  const subText = subParts.join(' · ');

  const goRowEl = (
    <div className="go-row group" data-done={isDone ? "true" : undefined}>
      <button
        onClick={go.kind === 'boolean' ? toggle : undefined}
        disabled={busy}
        className="check-circle"
        data-state={isDone ? "done" : "outline"}
      >
        {busy ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div className="go-info">
        <div className="go-title">{go.title}</div>
        {subText && <div className="go-sub">{subText}</div>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="icon-btn icon-btn-sm" title="Edit">
          <Pencil size={12} />
        </button>
        <button onClick={() => setConfirmDelete(true)} className="icon-btn icon-btn-sm">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete go?"
        message={`"${go.title}" will be removed.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteGo}
      />

      {editing && (
        <EditGoSheet
          go={go}
          availableSprints={availableSprints}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await onReload(); }}
        />
      )}

      {isMobile
        ? <SwipeRow enabled={!editing} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{goRowEl}</SwipeRow>
        : goRowEl
      }

      {go.kind === 'numeric' && !editing && (
        <div style={{ padding: '2px 16px 10px', marginTop: -6 }}>
          {go.target_value && go.target_value > 0 && (
            <div style={{ height: 3, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'rgba(0,0,0,0.06)', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${numericPct}%`, backgroundColor: stripeColor, borderRadius: 'inherit' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" inputMode="decimal" placeholder="+value"
              value={numInput} onChange={(e) => setNumInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
              className="input" style={{ width: 80, height: 28 }}
            />
            {steps.map((step) => (
              <button key={step} onClick={() => logNumeric(step)} disabled={busy} className="btn btn-secondary btn-sm">+{step}</button>
            ))}
            <button onClick={() => logNumeric()} disabled={busy || !numInput} className="btn btn-primary btn-sm">Log</button>
          </div>
        </div>
      )}

      {go.kind === 'boolean' && go.recurrence === 'daily' && !editing && (
        <div style={{ padding: '2px 16px 10px', marginTop: -6 }}>
          <DailyStreak go={go} />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EditGoSheet — bottom-sheet editor for a Go item
// ═══════════════════════════════════════════════════════════════════════════
function EditGoSheet({ go, availableSprints, onClose, onSaved }: {
  go: Go;
  availableSprints?: Sprint[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const [editTitle, setEditTitle] = useState(go.title);
  const [editDescription, setEditDescription] = useState(go.description ?? '');
  const [editSprintId, setEditSprintId] = useState<string>(go.sprint_id ?? '');
  const [editDue, setEditDue] = useState(go.due_date ?? '');
  const [editColor, setEditColor] = useState(go.color);

  const canSave = editTitle.trim().length > 0;

  const handleSave = async () => {
    await gosApi.update(go.id, {
      title: editTitle.trim() || go.title,
      description: editDescription,
      sprint_id: editSprintId || null,
      due_date: editDue || null,
      color: editColor,
    } as any);
    await onSaved();
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editGo')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder={t('tasks.descriptionPh')} rows={3} />
      </FormField>
      {availableSprints && availableSprints.length > 0 && (
        <FormField label="Attach to step">
          <select value={editSprintId} onChange={(e) => setEditSprintId(e.target.value)} className="select-base w-full">
            <option value="">— No step —</option>
            {availableSprints.map((s) => <option key={s.id} value={s.id}>↳ {s.title}</option>)}
          </select>
        </FormField>
      )}
      {go.recurrence === 'none' && (
        <FormField label="Due date">
          <input type="date" className="input w-full" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
        </FormField>
      )}
      <FormField label="Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
          {GO_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.preventDefault(); setEditColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }}
            />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DailyStreak — shows last N days as colored squares (green=done, red=missed)
// ═══════════════════════════════════════════════════════════════════════════
function DailyStreak({ go }: { go: Go }) {
  const days = 14;

  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of go.entries) m.set(e.date, e.value);
    return m;
  }, [go.entries]);

  const createdDate = useMemo(() => {
    const d = new Date(go.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [go.created_at]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const squares: { date: string; value: number; isToday: boolean; beforeCreation: boolean; weekdayIdx: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    squares.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isToday: i === 0,
      beforeCreation: d < createdDate,
      weekdayIdx: d.getDay(),
    });
  }

  const doneCount = squares.filter((s) => !s.beforeCreation && s.value > 0).length;
  const eligible = squares.filter((s) => !s.beforeCreation).length;

  // Reverse so today appears on the LEFT (latest first), past on the right
  const ordered = [...squares].reverse();

  // Mon=1, Sun=0 — show first letter
  const wkLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
        <span>← today &nbsp;·&nbsp; <span className="font-medium text-foreground">{doneCount}</span>/{eligible}</span>
      </div>
      <div className="flex gap-1 items-end">
        {ordered.map((s) => {
          let cellStyle: React.CSSProperties = { background: 'color-mix(in srgb, var(--fg-muted) 20%, transparent)' };
          let inner: React.ReactNode = null;
          let title = s.date;
          if (s.beforeCreation) {
            cellStyle = { background: 'color-mix(in srgb, var(--fg-muted) 10%, transparent)' };
            title = `${s.date} — before start`;
          } else if (s.value > 0) {
            cellStyle = { background: 'var(--success)' };
            inner = <span style={{ color: '#fff', fontSize: 8 }}>✓</span>;
            title = `${s.date} — done`;
          } else if (s.isToday) {
            cellStyle = { background: 'var(--bg-card)', boxShadow: `0 0 0 2px var(--accent-primary)` };
            title = `${s.date} — today (not yet)`;
          } else {
            cellStyle = { background: 'color-mix(in srgb, var(--danger) 30%, transparent)' };
            title = `${s.date} — missed`;
          }
          return (
            <div key={s.date} className="flex flex-col items-center gap-0.5">
              <div
                title={title}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${s.isToday ? 'scale-110' : ''}`}
                style={cellStyle}
              >
                {inner}
              </div>
              <span className={`text-[8px] ${s.isToday ? 'font-semibold' : ''}`} style={{ color: s.isToday ? 'var(--fg-primary)' : 'var(--fg-muted)' }}>
                {wkLabels[s.weekdayIdx]}
              </span>
            </div>
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
      <div className="goal-card overflow-hidden">
        <div className="flex items-stretch">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: sprint.color }} />
          <div className="flex-1 min-w-0">
            <div className="p-3">
              {editing ? (
                <div className="space-y-2">
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input w-full" />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-label">{t("tasks.start")}</label>
                      <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="input w-full" />
                    </div>
                    <div className="flex-1">
                      <label className="text-label">End</label>
                      <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="input w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="text-label">Description</label>
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Sprint notes…" rows={2} className="textarea w-full" />
                  </div>
                  <div>
                    <label className="text-label block mb-1">Color</label>
                    <div className="flex gap-1">
                      {ENTITY_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setEditColor(c)}
                          className="w-7 h-7 rounded-full"
                          style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3px ${c}` : 'none' }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
                    <button onClick={save} disabled={busy} className="btn btn-primary btn-sm flex items-center gap-1">
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
                    <div className="hidden md:flex items-center gap-0.5 transition-all">
                      <button onClick={() => setEditing(true)} className="icon-btn icon-btn-sm"><Pencil size={12} /></button>
                      <button onClick={() => setConfirmDelete(true)} className="icon-btn icon-btn-sm" style={{ '--icon-btn-hover-bg': 'color-mix(in srgb, var(--danger) 10%, transparent)', '--icon-btn-hover-color': 'var(--danger)' } as React.CSSProperties}><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-2">
                    {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}
                    {showMeta && sprint.task_title && <span> · task: {sprint.task_title}</span>}
                  </div>
                  {sprint.description && sprint.description.trim() && (
                    <p className="text-[11px] text-muted-foreground mb-2 whitespace-pre-wrap">{sprint.description}</p>
                  )}
                  <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-hover)' }}>
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

                <AddItemButton label={t('tasks.addGo')} onClick={() => setAddingGo(true)} />
                <CreateGoForm
                  open={addingGo}
                  defaultTaskId={sprint.task_id}
                  defaultSprintId={sprint.id}
                  onCancel={() => setAddingGo(false)}
                  onCreate={async (data) => {
                    await gosApi.create({ ...data, task_id: sprint.task_id, sprint_id: sprint.id });
                    setAddingGo(false);
                    await onReload();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
        );
        return isMobile
          ? <SwipeRow enabled={!editing} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{sprintCard}</SwipeRow>
          : sprintCard;
      })()}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Go form
// ═══════════════════════════════════════════════════════════════════════════
function CreateGoForm({
  open, defaultTaskId, defaultSprintId, availableSprints, tasks, onCreate, onCancel,
}: {
  open: boolean;
  defaultTaskId?: string | null;
  defaultSprintId?: string | null;
  availableSprints?: Sprint[];
  tasks?: Task[];
  onCreate: (data: {
    title: string; description: string; kind: GoKind; unit: string; target_value: number | null;
    recurrence: GoRecurrence; due_date: string | null; color: string;
    task_id: string | null; sprint_id: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<GoKind>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [recurrence] = useState<GoRecurrence>('none');
  const [due, setDue] = useState('');
  const [color, setColor] = useState(GO_COLORS[0]);
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(defaultTaskId ?? '');

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setKind('boolean');
      setUnit(''); setTarget(''); setDue(''); setColor(GO_COLORS[0]);
      setSprintId(defaultSprintId ?? ''); setSelectedTaskId(defaultTaskId ?? '');
    }
  }, [open, defaultSprintId, defaultTaskId]);

  const effectiveTaskId = tasks ? selectedTaskId : (defaultTaskId ?? null);
  const derivedSprints = tasks
    ? (tasks.find((tk) => tk.id === selectedTaskId)?.sprints ?? [])
    : (availableSprints ?? []);

  const handleSubmit = async () => {
    await onCreate({
      title: title.trim(), description: description.trim(), kind, unit: unit.trim(),
      target_value: target ? parseFloat(target) : null,
      recurrence, due_date: due || null, color,
      task_id: effectiveTaskId || null,
      sprint_id: sprintId || null,
    });
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="Add go"
      primaryLabel="Add go"
      canSubmit={!!title.trim()}
      onSubmit={handleSubmit}
    >
      {tasks && (
        <FormField label="Goal">
          <select value={selectedTaskId} onChange={(e) => { setSelectedTaskId(e.target.value); setSprintId(''); }} className="select-base">
            <option value="">{t('go.standalone')}</option>
            {tasks.map((tk) => (<option key={tk.id} value={tk.id}>{tk.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Go title (e.g. Solve 50 problems)" />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder={t('tasks.descriptionPh')} rows={2} />
      </FormField>
      <FormField label="Type">
        <select value={kind} onChange={(e) => setKind(e.target.value as GoKind)} className="select-base">
          <option value="boolean">Done / Not done</option>
          <option value="numeric">Numeric</option>
        </select>
      </FormField>
      {kind === 'numeric' && (
        <div className="form-row-2col">
          <FormField label="Unit">
            <input type="text" className="input w-full" placeholder="pages" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </FormField>
          <FormField label="Target">
            <input type="number" className="input w-full" placeholder="0" value={target} onChange={(e) => setTarget(e.target.value)} />
          </FormField>
        </div>
      )}
      <FormField label="Due date">
        <input type="date" className="input w-full" value={due} onChange={(e) => setDue(e.target.value)} />
      </FormField>
      {derivedSprints.length > 0 && !defaultSprintId && (
        <FormField label="Sprint">
          <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="select-base">
            <option value="">No sprint</option>
            {derivedSprints.map((s) => (<option key={s.id} value={s.id}>↳ {s.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {GO_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Sprint form (inside a task)
// ═══════════════════════════════════════════════════════════════════════════
function CreateSprintForm({
  open, taskId, tasks, availableGos, onCreate, onCancel,
}: {
  open: boolean;
  taskId?: string;
  tasks?: Task[];
  availableGos?: Go[];
  onCreate: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [color, setColor] = useState(ENTITY_COLORS[1]);
  const [toAttach, setToAttach] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string>(taskId ?? '');

  useEffect(() => {
    if (!open) { setTitle(''); setDescription(''); setColor(ENTITY_COLORS[1]); setToAttach(new Set()); setSelectedTaskId(taskId ?? ''); }
  }, [open, taskId]);

  const toggleAttach = (id: string) => {
    setToAttach((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const effectiveTaskId = tasks ? selectedTaskId : (taskId ?? '');
  const effectiveGos = tasks
    ? ((tasks.find((tk) => tk.id === selectedTaskId)?.gos ?? []).filter((g) => !g.sprint_id))
    : (availableGos ?? []);

  const handleSubmit = async () => {
    if (!effectiveTaskId) throw new Error('Please select a goal first');
    const sprint = await sprintsApi.create({ task_id: effectiveTaskId, title: title.trim(), description, start_date: start, end_date: end, color });
    for (const goId of toAttach) await sprintsApi.attachGo(sprint.id, goId);
    onCancel();
    await onCreate();
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="Add step"
      primaryLabel="Add step"
      canSubmit={!!title.trim() && !!start && !!end && (tasks ? !!selectedTaskId : true)}
      onSubmit={handleSubmit}
    >
      {tasks && (
        <FormField label="Goal">
          <select value={selectedTaskId} onChange={(e) => { setSelectedTaskId(e.target.value); setToAttach(new Set()); }} className="select-base">
            <option value="">{t('sprint.pickTask')}</option>
            {tasks.map((tk) => (<option key={tk.id} value={tk.id}>{tk.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder={t('sprint.titlePh')} />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder={t('sprint.notesPh')} rows={2} />
      </FormField>
      <div className="form-row-2col">
        <FormField label={t('tasks.start')}>
          <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label={t('sprint.end')}>
          <input type="date" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>
      {(effectiveGos.length > 0 || (tasks ? !!selectedTaskId : !!taskId)) && (
        <FormField label="Attach go items">
          {effectiveGos.length > 0 ? (
            <div className="max-h-40 overflow-y-auto" style={{ borderRadius: 'var(--r-control)', boxShadow: '0 0 0 0.5px var(--line)' }}>
              {effectiveGos.map((g) => (
                <label key={g.id} className="flex items-center gap-2 p-1.5 text-xs cursor-pointer hover:bg-secondary">
                  <input type="checkbox" checked={toAttach.has(g.id)} onChange={() => toggleAttach(g.id)} />
                  <span className="truncate flex-1">{g.title}</span>
                  {g.due_date && <span style={{ color: 'var(--fg-muted)' }}>{formatDate(g.due_date)}</span>}
                </label>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '6px 0' }}>No unattached Go items for this goal.</div>
          )}
        </FormField>
      )}
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Task expanded content: sprints + direct gos
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// GoalLinkedRoutines — separate expandable section for linked routines
// ═══════════════════════════════════════════════════════════════════════════
function GoalLinkedRoutines({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const [linkedRoutines, setLinkedRoutines] = useState<Routine[]>([]);
  const [routineLinks, setRoutineLinks] = useState<GoalRoutineLink[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [allRoutines, setAllRoutines] = useState<Routine[]>([]);

  const loadLinks = async () => {
    try {
      const links = await routinesApi.linksByGoal(task.id);
      setRoutineLinks(links);
      setLinkedRoutines(links.map((l) => l.routine));
    } catch {
      try { const r = await routinesApi.byGoal(task.id); setLinkedRoutines(r); } catch {}
    }
  };

  useEffect(() => { loadLinks(); }, [task.id, task.updated_at]);

  const computeConsistency = (link: GoalRoutineLink): { done: number; total: number; pct: number } => {
    const r = link.routine;
    const start = new Date(link.start_date);
    const end = link.end_date ? new Date(link.end_date) : new Date();
    let total = link.target_count ?? 0;
    let done = 0;
    for (const e of r.entries) {
      const d = new Date(e.date);
      if (d >= start && d <= end && e.value > 0) done += 1;
    }
    if (!link.target_count) {
      const dayMs = 86400000;
      total = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
    }
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return { done, total, pct };
  };

  return (
    <div className="task-expanded">
      <div className="flex items-center justify-between mb-1.5">
        <div className="task-expanded-section-label" style={{ marginBottom: 0 }}>
          <span className="flex items-center gap-1.5">
            <Repeat size={11} /> Linked routines
            {linkedRoutines.length > 0 && <span style={{ opacity: 0.6, fontWeight: 400 }}>({linkedRoutines.length})</span>}
          </span>
        </div>
        <button
          onClick={async () => {
            try { const all = await routinesApi.list(); setAllRoutines(all); } catch {}
            setShowLinkPicker(true);
          }}
          style={{ fontSize: 11, color: 'var(--accent-notes)', display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 0, cursor: 'pointer' }}
        >
          <Plus size={11} /> Link routine
        </button>
      </div>

      {linkedRoutines.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic', padding: '4px 0' }}>
          No routines linked yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {routineLinks.length > 0 ? routineLinks.map((link) => {
            const r = link.routine;
            const { done, total, pct } = computeConsistency(link);
            return (
              <div key={link.id} className={`goal-card overflow-hidden ${r.is_paused ? 'opacity-60' : ''}`} style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 4, height: 16, borderRadius: 2, flexShrink: 0, backgroundColor: r.color }} />
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>{done}/{total}</span>
                  <button
                    onClick={async () => {
                      if (!confirm(`Unlink "${r.title}" from this goal?`)) return;
                      try { await routinesApi.deleteLink(link.id); await loadLinks(); }
                      catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
                    }}
                    style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'none', border: 0, cursor: 'pointer', color: 'var(--fg-muted)' }}
                    title="Unlink"
                  >
                    <X size={11} />
                  </button>
                </div>
                <div style={{ height: 4, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--bg-app)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: r.color, borderRadius: 'inherit', transition: 'width 500ms' }} />
                </div>
              </div>
            );
          }) : linkedRoutines.map((r) => (
            <div key={r.id} className={`goal-card ${r.is_paused ? 'opacity-60' : ''}`} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 4, height: 16, borderRadius: 2, flexShrink: 0, backgroundColor: r.color }} />
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'capitalize' }}>{r.schedule_type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {showLinkPicker && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(4px)' }}
          onClick={() => setShowLinkPicker(false)}>
          <div className="modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
              <h3 className="text-base font-semibold">Link a routine</h3>
              <button onClick={() => setShowLinkPicker(false)} className="icon-btn icon-btn-sm">✕</button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {allRoutines.filter((r) => !linkedRoutines.find((lr) => lr.id === r.id)).length === 0 ? (
                <div style={{ fontSize: 13, textAlign: 'center', padding: '24px 0', color: 'var(--fg-muted)' }}>
                  No more routines to link. Create one in the Routines section first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allRoutines.filter((r) => !linkedRoutines.find((lr) => lr.id === r.id)).map((r) => (
                    <button
                      key={r.id}
                      onClick={async () => {
                        const today = new Date().toISOString().slice(0, 10);
                        try {
                          await routinesApi.createLink({
                            goal_id: task.id,
                            routine_id: r.id,
                            start_date: task.start_date ?? today,
                            end_date: task.due_date ?? null,
                            target_count: null,
                          });
                          await loadLinks();
                          setShowLinkPicker(false);
                          toast.success(`Linked "${r.title}"`);
                        } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
                      }}
                      className="goal-card"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }}
                    >
                      <span style={{ width: 6, height: 24, borderRadius: 3, flexShrink: 0, backgroundColor: r.color }} />
                      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'capitalize' }}>{r.schedule_type.replace('_', ' ')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TaskExpanded — Steps (Sprints) + Direct Gos only
// ═══════════════════════════════════════════════════════════════════════════
function TaskExpanded({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
  const [addingSprint, setAddingSprint] = useState(false);
  const [addingGo, setAddingGo] = useState(false);
  const directGos = task.gos;

  return (
    <div className="task-expanded">
      {task.sprints.length > 0 && (
        <div>
          <div style={{ height: 4, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--bg-app)', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${task.progress}%`, background: 'var(--accent-goals)', borderRadius: 'inherit', transition: 'width 300ms' }} />
          </div>
        </div>
      )}

      {task.sprints.map((s) => (
        <SprintBlock
          key={s.id}
          sprint={s}
          allSprintsOfTask={task.sprints}
          onReload={onReload}
          showMeta={false}
        />
      ))}

      <AddItemButton label={t('tasks.addSprint')} onClick={() => setAddingSprint(true)} />
      <CreateSprintForm
        open={addingSprint}
        taskId={task.id}
        availableGos={directGos.filter((g) => !g.sprint_id)}
        onCancel={() => setAddingSprint(false)}
        onCreate={async () => { setAddingSprint(false); await onReload(); }}
      />

      {directGos.length > 0 && (
        <div>
          <div className="task-expanded-section-label">Direct gos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {directGos.map((g) => (
              <GoRow key={g.id} go={g} availableSprints={task.sprints} onReload={onReload} />
            ))}
          </div>
        </div>
      )}

      <AddItemButton label={t('tasks.addGo')} onClick={() => setAddingGo(true)} />
      <CreateGoForm
        open={addingGo}
        defaultTaskId={task.id}
        availableSprints={task.sprints}
        onCancel={() => setAddingGo(false)}
        onCreate={async (data) => {
          await gosApi.create({ ...data, task_id: task.id });
          setAddingGo(false);
          await onReload();
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EditTaskSheet — bottom-sheet editor for a Goal (Task)
// ═══════════════════════════════════════════════════════════════════════════
function EditTaskSheet({ task, onClose, onSaved }: {
  task: Task;
  onClose: () => void;
  onSaved: (data: Partial<Task>) => Promise<void>;
}) {
  const t = useT();
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editStart, setEditStart] = useState(task.start_date ?? '');
  const [editDue, setEditDue] = useState(task.due_date ?? '');
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editColor, setEditColor] = useState(task.color ?? ENTITY_COLORS[0]);

  const canSave = editTitle.trim().length > 0;

  const handleSave = async () => {
    await onSaved({
      title: editTitle.trim(),
      priority: editPriority,
      start_date: editStart || null,
      due_date: editDue || null,
      description: editDescription,
      color: editColor,
    });
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editGoal')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
      </FormField>
      <FormField label="Priority">
        <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as TaskPriority)} className="select-base w-full">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </FormField>
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setEditColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
      <div style={{ display: 'flex', gap: 10 }}>
        <FormField label={t('tasks.start') || 'Start'}>
          <input type="date" className="input w-full" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
        </FormField>
        <FormField label={t('tasks.due') || 'Due'}>
          <input type="date" className="input w-full" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Description">
        <textarea className="textarea w-full" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Notes, context, details…" rows={3} />
      </FormField>
    </CreateSheet>
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
  const [showLinked, setShowLinked] = useState(false);
  const [editing, setEditing] = useState(false);

  const isOverdue = task.status !== 'done' && task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const startEdit = () => setEditing(true);

  const periodLabel = task.start_date && task.due_date
    ? `${formatDate(task.start_date)} – ${formatDate(task.due_date)}`
    : formatDate(task.due_date);

  const hasContent = task.sprints.length > 0 || task.gos.length > 0;

  const cardBody = (
    <>
      <div style={{ padding: '12px 13px' }}>
            <div className="flex items-start gap-2" style={{ marginBottom: 6 }}>
              <h4 className="goal-card-title" style={{ margin: 0, flex: 1 }}>{task.title}</h4>
              {!isMobile && (
                <div className="flex items-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(); }} className="icon-btn icon-btn-sm">
                    <Pencil size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="icon-btn icon-btn-sm" style={{ color: 'var(--danger)' }}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            {task.description && task.description.trim() && (
              <p className="goal-card-meta" style={{ marginBottom: 6, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{task.description}</p>
            )}

            <div style={{ marginBottom: 8 }}>
              <TagSelector targetId={task.id} targetKind="task" tags={task.tags ?? []} onChange={onReload} compact={!isMobile} />
            </div>

            {hasContent && (
              <div className="goal-card-progress" style={{ marginBottom: 8 }}>
                <div className="goal-card-bar">
                  <div className="goal-card-bar-fill" style={{ width: `${task.progress}%`, background: 'var(--accent-goals)' }} />
                </div>
                <span className="goal-card-pct">{task.progress}%</span>
              </div>
            )}

            <div className="goal-card-meta" style={{ marginTop: 0, justifyContent: 'space-between' }}>
              <div className="flex items-center gap-2" style={{ color: isOverdue ? 'var(--danger)' : 'var(--fg-muted)' }}>
                {periodLabel && <span className="flex items-center gap-1"><Calendar size={11} />{periodLabel}</span>}
                <PriorityStars priority={task.priority} size={10} />
              </div>
              <select value={task.status}
                onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'transparent', border: 0, color: 'var(--fg-muted)', fontSize: 10, cursor: 'pointer' }}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
              </select>
            </div>
          </div>

          <button onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1.5"
            style={{
              padding: '10px 14px 10px',
              boxShadow: 'inset 0 0.5px 0 var(--line)',
              fontSize: 11, color: 'var(--fg-muted)',
              background: 'transparent',
            }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Zap size={12} />
            <span>{t('tasks.sprintsAndGos')}</span>
            <span style={{ marginLeft: 'auto', background: 'var(--bg-hover)', borderRadius: 'var(--r-pill)', padding: '1px 7px', fontSize: 10, fontWeight: 500 }}>
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

          {/* Linked routines — separate collapsible section */}
          <button onClick={() => setShowLinked(!showLinked)}
            className="w-full flex items-center gap-1.5"
            style={{
              padding: '8px 14px',
              boxShadow: 'inset 0 0.5px 0 var(--line)',
              fontSize: 11, color: 'var(--fg-muted)',
              background: 'transparent',
            }}
          >
            {showLinked ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Repeat size={12} />
            <span>Linked routines</span>
          </button>

          <AnimatePresence initial={false}>
            {showLinked && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <GoalLinkedRoutines task={task} onReload={onReload} />
              </motion.div>
            )}
          </AnimatePresence>
    </>
  );

  const cls = `group goal-card overflow-hidden ${
    isDragging ? 'opacity-40 scale-[0.98]' : ''
  } ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'}`;

  if (isMobile) {
    return (
      <>
        {editing && (
          <EditTaskSheet
            task={task}
            onClose={() => setEditing(false)}
            onSaved={async (data) => { await onUpdate(data); setEditing(false); }}
          />
        )}
        <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
          <SwipeRow onEdit={startEdit} onDelete={onDelete}>
            <div className={cls}>{cardBody}</div>
          </SwipeRow>
        </motion.div>
      </>
    );
  }

  return (
    <>
      {editing && (
        <EditTaskSheet
          task={task}
          onClose={() => setEditing(false)}
          onSaved={async (data) => { await onUpdate(data); setEditing(false); }}
        />
      )}
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        draggable
        onDragStart={(e) => {
          (e as unknown as DragEvent).dataTransfer?.setData('text/plain', task.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cls}
      >
        {cardBody}
      </motion.div>
    </>
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

  const focusByTask = useMemo(() => {
    const m = new Map<string, { done: number; total: number; color: string }>();
    for (const g of todayItems) {
      const key = g.task_title || 'Standalone';
      const entry = m.get(key) ?? { done: 0, total: 0, color: g.color };
      entry.total++;
      const val = g.entries.find((e) => e.date === todayIsoStr)?.value ?? 0;
      if (val > 0) entry.done++;
      m.set(key, entry);
    }
    return [...m.entries()];
  }, [todayItems, todayIsoStr]);

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }

  const donePct = todayItems.length > 0 ? Math.round(100 * completedToday / todayItems.length) : 0;

  return (
    <>
      {/* Add Go button + form */}
      {!adding && <AddItemButton label={t('tasks.addGo')} onClick={() => setAdding(true)} />}

      <CreateGoForm
        open={adding}
        tasks={tasks}
        onCancel={() => setAdding(false)}
        onCreate={async (data) => {
          await gosApi.create(data);
          setAdding(false);
          await reload();
        }}
      />

      {/* KPI row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Done today</div>
          <div className="kpi-value">{completedToday}<span style={{ fontSize: 14, color: 'var(--fg-muted)', fontWeight: 400 }}> / {todayItems.length}</span></div>
          <div className="kpi-trend" data-trend={donePct > 0 ? undefined : 'neutral'}>{donePct}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Streak</div>
          <div className="kpi-value">—</div>
          <div className="kpi-trend" data-trend="neutral">days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Upcoming</div>
          <div className="kpi-value">{futureItems.length}</div>
          <div className="kpi-trend" data-trend="neutral">next 7 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Past {pastDays} days</div>
          <div className="kpi-value">{pastItems.length}</div>
          <div className="kpi-trend" data-trend="neutral">items</div>
        </div>
      </div>

      {/* Main + right panel */}
      <div className="section-row">
        <div style={{ minWidth: 0 }}>
          {/* Past (collapsible) */}
          <div style={{ marginBottom: 18 }}>
            <button className="past-bar" onClick={() => setPastOpen(!pastOpen)}>
              {pastOpen
                ? <ChevronDown size={11} strokeWidth={2} />
                : <ChevronRight size={11} strokeWidth={2} />
              }
              <span>Past</span>
              <span className="past-bar-meta">{pastItems.length} items · {pastDays}d</span>
            </button>

            {pastOpen && (
              <div style={{ marginTop: 8 }}>
                {pastItems.length === 0 ? (
                  <div className="py-4 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>{t('go.nothingPast', { days: pastDays })}</div>
                ) : pastItems.map((g) => (
                  <GoRow key={g.id} go={g}
                    availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                    onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
                ))}
                <button onClick={() => setPastDays(pastDays + 30)} className="btn btn-ghost btn-sm w-full">
                  {t('go.showOlder', { days: pastDays })}
                </button>
              </div>
            )}
          </div>

          {/* Today */}
          <section style={{ marginBottom: 24 }}>
            <div className="day-head">
              <h2 className="day-head-title">{t('go.today')} · {todayLabel}</h2>
              <span className="day-head-meta">{completedToday} of {todayItems.length} done</span>
            </div>
            {todayItems.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('go.nothingToday')}</div>
            ) : todayItems.map((g) => (
              <GoRow key={g.id} go={g}
                availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
            ))}
          </section>

          {/* Future */}
          <section>
            <div className="day-head">
              <h2 className="day-head-title">{t('go.future')}</h2>
              <span className="day-head-meta">{futureItems.length} upcoming</span>
            </div>
            {futureGroups.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('go.noFuture')}</div>
            ) : futureGroups.map(([date, list]) => (
              <div key={date} style={{ marginBottom: 14 }}>
                <div className="date-label">
                  {date === 'no-date' ? 'No date' :
                    new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                {list.map((g) => (
                  <GoRow key={g.id} go={g}
                    availableSprints={g.task_id ? sprintsByTask.get(g.task_id) : undefined}
                    onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
                ))}
              </div>
            ))}
          </section>
        </div>

        {/* Right panel */}
        <aside className="right-panel">
          <div className="panel-card">
            <div className="panel-head">Today's focus</div>
            {focusByTask.length === 0 ? (
              <p className="panel-empty">No gos today</p>
            ) : focusByTask.map(([name, { done, total, color }]) => (
              <div key={name} className="panel-row">
                <span className="dot" style={{ background: color || 'var(--fg-muted)' }} />
                <span className="panel-row-title">{name}</span>
                <span className="panel-row-meta">{done} / {total}</span>
              </div>
            ))}
          </div>
          <div className="panel-card">
            <div className="panel-head">Last 14 days</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 50, gap: 3, paddingTop: 8 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const h = 30 + Math.round(Math.random() * 60);
                const isToday = i === 13;
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h}%`, borderRadius: 2,
                    background: isToday ? 'var(--accent-sprints)' : 'var(--success)',
                    opacity: isToday ? 1 : 0.5 + (h / 200),
                  }} />
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>14d ago</span><span>today</span>
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-head">Tip</div>
            <p className="panel-prose">Group your gos by goal for a clearer picture of what moves the needle most today.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EditSprintSheet — bottom-sheet editor for a Step (Sprint)
// ═══════════════════════════════════════════════════════════════════════════
function EditSprintSheet({ sprint, tasks, onClose, onSaved }: { sprint: Sprint; tasks?: Task[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useT();
  const [title, setTitle] = useState(sprint.title);
  const [startDate, setStartDate] = useState(sprint.start_date);
  const [endDate, setEndDate] = useState(sprint.end_date);
  const [description, setDescription] = useState(sprint.description ?? '');
  const [color, setColor] = useState(sprint.color);
  const [selectedTaskId, setSelectedTaskId] = useState(sprint.task_id ?? '');
  // Go management — track which go IDs should be attached after save
  const [goAttachIds, setGoAttachIds] = useState<Set<string>>(
    new Set(sprint.gos.map((g) => g.id))
  );

  const canSave = title.trim().length > 0;

  // All gos from the currently selected task
  const taskForGos = tasks?.find((tk) => tk.id === (selectedTaskId || (sprint.task_id ?? '')));
  const allTaskGos = taskForGos?.gos ?? sprint.gos;

  const toggleGoAttach = (goId: string) => {
    setGoAttachIds((prev) => {
      const next = new Set(prev);
      if (next.has(goId)) next.delete(goId); else next.add(goId);
      return next;
    });
  };

  const handleSave = async () => {
    const payload: Parameters<typeof sprintsApi.update>[1] = {
      title: title.trim(),
      start_date: startDate,
      end_date: endDate,
      description,
      color,
    };
    if (selectedTaskId !== (sprint.task_id ?? '')) {
      payload.task_id = selectedTaskId || null;
    }
    await sprintsApi.update(sprint.id, payload);
    // Apply go attach/detach changes
    const originalIds = new Set(sprint.gos.map((g) => g.id));
    await Promise.all([
      ...[...originalIds].filter((id) => !goAttachIds.has(id)).map((id) => sprintsApi.detachGo(sprint.id, id)),
      ...[...goAttachIds].filter((id) => !originalIds.has(id)).map((id) => sprintsApi.attachGo(sprint.id, id)),
    ]);
    await onSaved();
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editStep')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Goal">
        {tasks && tasks.length > 0 ? (
          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)} className="select-base w-full">
            <option value="">— Standalone —</option>
            {tasks.map((tk) => <option key={tk.id} value={tk.id}>{tk.title}</option>)}
          </select>
        ) : (
          <div className="input" style={{ color: 'var(--fg-muted)' }}>{sprint.task_title ?? '—'}</div>
        )}
      </FormField>
      <FormField label="Title">
        <input
          type="text"
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title"
        />
      </FormField>
      <div style={{ display: 'flex', gap: 10 }}>
        <FormField label={t('tasks.start') || 'Start'}>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label={t('tasks.due') || 'End'}>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
      <FormField label="Description">
        <textarea
          className="textarea w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes, context…"
          rows={3}
        />
      </FormField>
      {allTaskGos.length > 0 && (
        <FormField label="Go items">
          <div style={{ borderRadius: 'var(--r-control)', boxShadow: '0 0 0 0.5px var(--line)' }}>
            {allTaskGos.map((g) => {
              const checked = goAttachIds.has(g.id);
              return (
                <label key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', cursor: 'pointer',
                  boxShadow: 'inset 0 0.5px 0 var(--line-faint)',
                  background: checked ? 'color-mix(in srgb, var(--success) 6%, transparent)' : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleGoAttach(g.id)}
                    style={{ width: 16, height: 16, accentColor: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, color: checked ? 'var(--fg-primary)' : 'var(--fg-secondary)', textDecoration: checked ? 'none' : undefined }}>
                    {g.title}
                  </span>
                  {g.sprint_id && g.sprint_id !== sprint.id && (
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>other sprint</span>
                  )}
                </label>
              );
            })}
          </div>
        </FormField>
      )}
    </CreateSheet>
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
  const [editingStep, setEditingStep] = useState<Sprint | null>(null);
  const [expandedGos, setExpandedGos] = useState<Set<string>>(new Set());
  const [busyGos, setBusyGos] = useState<Set<string>>(new Set());

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
      // Recompute sprint progress locally (mirrors backend _go_completion_ratio)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sStart = new Date(s.start_date); sStart.setHours(0, 0, 0, 0);
      const sEnd = new Date(s.end_date); sEnd.setHours(0, 0, 0, 0);
      let totalRatio = 0;
      for (const g of newGos) {
        if (g.kind === 'boolean' && g.recurrence === 'daily') {
          let start = new Date(g.created_at); start.setHours(0, 0, 0, 0);
          if (sStart > start) start = sStart;
          let end = today;
          if (g.due_date) {
            const d = new Date(g.due_date); d.setHours(0, 0, 0, 0);
            if (d < end) end = d;
          }
          if (sEnd < end) end = sEnd;
          if (end < start) { totalRatio += 0; continue; }
          const possibleDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
          const startMs = start.getTime();
          const endMs = end.getTime();
          const doneDays = g.entries.filter((e) => {
            if (e.value <= 0) return false;
            const d = new Date(e.date); d.setHours(0, 0, 0, 0);
            const ms = d.getTime();
            return ms >= startMs && ms <= endMs;
          }).length;
          totalRatio += possibleDays > 0 ? Math.min(1, doneDays / possibleDays) : 0;
        } else if (g.kind === 'boolean') {
          totalRatio += g.entries.some((e) => e.value > 0) ? 1 : 0;
        } else {
          const total = g.entries.reduce((sum, e) => sum + e.value, 0);
          const target = g.target_value || 0;
          if (target > 0) totalRatio += Math.min(1, total / target);
          else totalRatio += total > 0 ? 1 : 0;
        }
      }
      const progress = newGos.length > 0 ? Math.round(100 * totalRatio / newGos.length) : 0;
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

  const nowMs = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const avgProgress = current.length > 0
    ? Math.round(current.reduce((s, sp) => s + sp.progress, 0) / current.length)
    : 0;
  const dueThisWeek = current.filter((s) => {
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    return end >= nowMs && end <= nowMs + weekMs;
  }).length;
  const doneThisMonth = past.filter((s) => {
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    return end >= nowMs - monthMs;
  }).length;

  const slipping = current.filter((s) => {
    const start = new Date(s.start_date + 'T00:00:00').getTime();
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    const duration = end - start;
    if (duration <= 0) return false;
    const elapsed = Math.max(0, nowMs - start);
    const expectedPct = Math.min(100, Math.round(100 * elapsed / duration));
    return s.progress < expectedPct - 10;
  });

  const renderStepCard = (s: Sprint, isFuture = false) => {
    const endMs = new Date(s.end_date + 'T00:00:00').getTime();
    const startMs = new Date(s.start_date + 'T00:00:00').getTime();
    const daysLeft = Math.ceil((endMs - nowMs) / 86400000);
    const daysUntilStart = Math.ceil((startMs - nowMs) / 86400000);
    const doneGos = s.gos.filter((g) => g.entries.some((e) => e.value > 0)).length;
    const tagBg = s.color ? s.color + '20' : 'var(--accent-notes-bg)';
    const tagFg = s.color || 'var(--accent-notes-fg)';
    const dateRange = `${formatDate(s.start_date) ?? ''} — ${formatDate(s.end_date) ?? ''}`;
    const daysInfo = isFuture
      ? `starts in ${daysUntilStart}d`
      : daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'due today' : `${Math.abs(daysLeft)}d overdue`;

    const today = todayIso();
    const toggleGoInCard = async (g: Go) => {
      if (busyGos.has(g.id)) return;
      setBusyGos((prev) => { const n = new Set(prev); n.add(g.id); return n; });
      try {
        const todayVal = g.entries.find((e) => e.date === today)?.value ?? 0;
        const newVal = todayVal > 0 ? 0 : 1;
        await gosApi.upsertEntry(g.id, today, newVal);
        const otherEntries = g.entries.filter((e) => e.date !== today);
        const newEntries = newVal === 0 ? otherEntries : [...otherEntries, { id: `tmp`, go_id: g.id, date: today, value: newVal }];
        patchGoInSprint({ ...g, entries: newEntries, total_value: newEntries.reduce((s, e) => s + e.value, 0) });
      } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
      finally { setBusyGos((prev) => { const n = new Set(prev); n.delete(g.id); return n; }); }
    };

    const cardContent = (
      <div
        className="step-card"
        style={{ opacity: isFuture ? 0.85 : 1 }}
      >
        <button
          className="step-card-click-target"
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
          onClick={() => setEditingStep(s)}
        >
          <div className="step-card-head">
            <span className="step-card-tag" style={{ background: tagBg, color: tagFg }}>
              {s.task_title || 'Standalone'}
            </span>
            <span className="step-card-dates">{dateRange} · {daysInfo}</span>
          </div>
          <div className="step-card-title">{s.title}</div>
        </button>
        {!isFuture && (
          <>
            <div className="step-card-progress">
              <div className="step-card-bar">
                <div className="step-card-bar-fill" style={{ width: `${s.progress}%`, backgroundColor: s.color || 'var(--success)' }} />
              </div>
              <span className="step-card-pct">{s.progress}%</span>
            </div>
            <div className="step-card-meta">{doneGos} of {s.gos.length} Gos done</div>
            {s.gos.length > 0 && (
              <>
                <div className="step-card-checks">
                  {s.gos.map((g) => (
                    <span key={g.id} className="checkpoint"
                      data-state={g.entries.some((e) => e.value > 0) ? "done" : "pending"} />
                  ))}
                </div>
                <button
                  className="step-card-go-toggle"
                  style={{ width: '100%', background: 'none', border: 0 }}
                  onClick={() => setExpandedGos((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })}
                >
                  <span>{doneGos}/{s.gos.length} items</span>
                  <ChevronDown size={12} style={{ transition: 'transform 150ms', transform: expandedGos.has(s.id) ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {expandedGos.has(s.id) && (
                  <div className="step-card-go-list">
                    {s.gos.map((g) => {
                      const todayVal = g.entries.find((e) => e.date === today)?.value ?? 0;
                      const done = g.kind === 'boolean' && g.recurrence === 'none'
                        ? g.entries.some((e) => e.value > 0)
                        : todayVal > 0;
                      const isBusy = busyGos.has(g.id);
                      return (
                        <div key={g.id} className="step-card-go-item" data-done={done ? 'true' : undefined}>
                          <button
                            className="step-card-go-btn"
                            data-state={done ? 'done' : 'outline'}
                            disabled={isBusy}
                            onClick={() => toggleGoInCard(g)}
                          >
                            {isBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : done ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : null}
                          </button>
                          <span className="step-card-go-name">{g.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {isFuture && (
          <div className="step-card-meta">Will plan Gos when this starts</div>
        )}
      </div>
    );

    return (
      <SwipeRow
        key={s.id}
        onEdit={() => setEditingStep(s)}
        onDelete={async () => {
          if (!confirm(`Delete step "${s.title}"?`)) return;
          try { await sprintsApi.delete(s.id); await reload(); }
          catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
        }}
      >
        {cardContent}
      </SwipeRow>
    );
  };

  return (
    <>
      {/* Edit Step sheet */}
      {editingStep && (
        <EditSprintSheet
          sprint={editingStep}
          tasks={tasks}
          onClose={() => setEditingStep(null)}
          onSaved={async () => { setEditingStep(null); await reload(); }}
        />
      )}

      {/* Add Step button */}
      <AddItemButton label={t('tasks.addSprint')} onClick={() => setAdding(true)} />
      <CreateSprintForm
        open={adding}
        tasks={tasks}
        onCancel={() => setAdding(false)}
        onCreate={async () => { setAdding(false); await reload(); }}
      />

      {/* KPI row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Active steps</div>
          <div className="kpi-value">{current.length}</div>
          <div className="kpi-trend" data-trend="neutral">across {new Set(current.map((s) => s.task_id)).size} goals</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg progress</div>
          <div className="kpi-value">{avgProgress}%</div>
          <div className="kpi-trend" data-trend={avgProgress >= 50 ? undefined : 'negative'}>of completion</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Due this week</div>
          <div className="kpi-value">{dueThisWeek}</div>
          <div className="kpi-trend" data-trend={dueThisWeek > 0 ? 'negative' : 'neutral'}>{dueThisWeek > 0 ? 'tight' : 'clear'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Done this month</div>
          <div className="kpi-value">{doneThisMonth}</div>
          <div className="kpi-trend" data-trend="neutral">steps finished</div>
        </div>
      </div>

      {/* Main + right panel */}
      <div className="section-row">
        <div style={{ minWidth: 0 }}>
          {/* Past (collapsible) */}
          <div style={{ marginBottom: 18 }}>
            <button className="past-bar" onClick={() => setPastOpen(!pastOpen)}>
              {pastOpen
                ? <ChevronDown size={11} strokeWidth={2} />
                : <ChevronRight size={11} strokeWidth={2} />
              }
              <span>Past</span>
              <span className="past-bar-meta">{past.length} finished · {pastDays}d</span>
            </button>

            {pastOpen && (
              <div style={{ marginTop: 8 }}>
                {past.length === 0 ? (
                  <div className="py-4 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>{t('sprint.none_past', { days: pastDays })}</div>
                ) : past.map((s) => {
                  const taskSprints = tasks.find((tk) => tk.id === s.task_id)?.sprints ?? [];
                  return <SprintBlock key={s.id} sprint={s} allSprintsOfTask={taskSprints} onReload={reload} onGoLocalUpdate={patchGoInSprint} />;
                })}
                <button onClick={() => setPastDays(pastDays + 90)} className="btn btn-ghost btn-sm w-full">
                  {t('go.showOlder', { days: pastDays })}
                </button>
              </div>
            )}
          </div>

          {/* Current */}
          <section style={{ marginBottom: 24 }}>
            <div className="day-head">
              <h2 className="day-head-title">Current · {current.length} active</h2>
              <span className="day-head-meta">avg {avgProgress}%</span>
            </div>
            {current.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('sprint.none_current')}</div>
            ) : current.map((s) => renderStepCard(s, false))}
          </section>

          {/* Future */}
          <section>
            <div className="day-head">
              <h2 className="day-head-title">{t('sprint.future')}</h2>
              <span className="day-head-meta">{future.length} scheduled</span>
            </div>
            {future.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('sprint.none_future')}</div>
            ) : future.map((s) => renderStepCard(s, true))}
          </section>
        </div>

        {/* Right panel */}
        <aside className="right-panel">
          <div className="panel-card">
            <div className="panel-head">Step velocity</div>
            <div className="panel-row"><span className="panel-row-title">This month</span><span className="panel-row-meta">{doneThisMonth} finished</span></div>
            <div className="panel-row"><span className="panel-row-title">Active now</span><span className="panel-row-meta">{current.length} steps</span></div>
            <div className="panel-row"><span className="panel-row-title">Future</span><span className="panel-row-meta">{future.length} planned</span></div>
          </div>
          <div className="panel-card">
            <div className="panel-head">Slipping</div>
            {slipping.length === 0 ? (
              <p className="panel-empty">All steps on track</p>
            ) : slipping.map((s) => (
              <div key={s.id} className="panel-row">
                <span className="dot" style={{ background: 'var(--danger)' }} />
                <span className="panel-row-title">{s.title}</span>
                <span className="panel-row-meta" style={{ color: 'var(--danger)' }}>{s.progress}%</span>
              </div>
            ))}
          </div>
          <div className="panel-card">
            <div className="panel-head">Insight</div>
            <p className="panel-prose">Steps finish faster when limited to 5–7 Gos. Smaller scope means clearer focus.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
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
  const [view, setView] = useState<'tasks' | 'go' | 'sprint'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('tasks:view') : null;
    return (saved === 'tasks' || saved === 'go' || saved === 'sprint') ? saved : 'tasks';
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
  // Collapsed columns (mobile mainly — long scrolls)
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const toggleCollapsed = (s: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);
  const [goalCompletion, setGoalCompletion] = useState<{ taskId: string; routines: any[] } | null>(null);

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
    // Map any legacy backend statuses → new ones (defensive; backend normalizes too)
    const remap: Record<string, TaskStatus> = {
      todo: 'backlog',
      in_progress: 'active',
      background: 'active',
      backlog: 'backlog',
      active: 'active',
      paused: 'paused',
      done: 'done',
    };
    for (const t of tasks) {
      const k = remap[t.status as string] ?? 'backlog';
      out[k].push(t);
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
      try { await tagsApi.attachTag(created.id, tagId); } catch { /* ignore individual */ }
    }
    setNewTitle(''); setNewPriority('medium'); setNewStart(''); setNewDue(''); setNewDescription(''); setNewTagIds([]); setNewColor(ENTITY_COLORS[0]);
    setShowCreateForm(false);
    await load();
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    // If marking as done, check for linked routines first
    if (data.status === 'done') {
      try {
        const linked: Routine[] = await routinesApi.byGoal(id);
        const activeLinked = linked.filter((r) => !r.is_paused);
        if (activeLinked.length > 0) {
          // Show dialog
          setGoalCompletion({ taskId: id, routines: activeLinked });
          return;
        }
      } catch { /* ignore — proceed without dialog */ }
    }
    try { await tasksApi.update(id, data as any); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const completeGoalWithChoice = async (taskId: string, choice: 'finish_all' | 'keep_active' | 'unlink') => {
    try {
      // First update the task to done
      await tasksApi.update(taskId, { status: 'done' } as any);
      // Then handle routines
      if (goalCompletion) {
        for (const r of goalCompletion.routines) {
          if (choice === 'finish_all') {
            await routinesApi.update(r.id, { is_paused: true } as any);
          } else if (choice === 'unlink') {
            await routinesApi.update(r.id, { goal_id: null } as any);
          }
          // 'keep_active' — do nothing
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
            /* Mobile header */
            <div>
              <div className="big-title-row">
                <div>
                  <div className="big-title">Goals</div>
                  <div className="big-title-sub">
                    {tasks.filter((tk) => tk.status === 'in_progress').length} active
                    {tasks.filter((tk) => tk.status === 'on_hold').length > 0 && ` · ${tasks.filter((tk) => tk.status === 'on_hold').length} paused`}
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
              {/* Sub-view tabs */}
              <div style={{ padding: '0 16px 10px' }}>
                <div className="segmented" style={{ width: '100%' }}>
                  <button onClick={() => setView('tasks')} className="segmented-item" data-active={view === 'tasks'} style={{ flex: 1 }}>Goals</button>
                  <button onClick={() => setView('go')} className="segmented-item" data-active={view === 'go'} style={{ flex: 1 }}>Go</button>
                  <button onClick={() => setView('sprint')} className="segmented-item" data-active={view === 'sprint'} style={{ flex: 1 }}>Step</button>
                </div>
              </div>
              {/* Status chips for Goals kanban view */}
              {view === 'tasks' && (
                <div className="chips-row">
                  <button className="chip" data-active={mobileStatusFilter === null} onClick={() => setMobileStatusFilter(null)}>
                    All <span className="chip-count">{tasks.length}</span>
                  </button>
                  {STATUSES.map(({ key, labelKey }) => (
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
                <button onClick={() => setView('sprint')} className="subtab" data-active={view === 'sprint'}>Step</button>
              </div>
            </div>
          </div>
          )}

          <div className="mb-5" style={{ display: 'none' }}>
            {/* Old tabs hidden, kept for ref */}
            <div className="hidden md:flex text-sm p-0.5 w-fit" style={{ background: 'var(--bg-hover)', borderRadius: 'var(--r-control)' }}>
              {([
                { v: 'tasks', Icon: TargetIcon, label: t('tasks.tasksTab') },
                { v: 'go', Icon: ListTodo, label: t('tasks.goTab') },
                { v: 'sprint', Icon: Zap, label: t('tasks.sprintTab') },
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

            {/* Mobile: three pill-shaped buttons, Go centered (larger/primary) */}
            <div className="md:hidden grid grid-cols-3 gap-2">
              {([
                { v: 'tasks', Icon: TargetIcon, label: t('tasks.tasksTab') },
                { v: 'go', Icon: ListTodo, label: t('tasks.goTab') },
                { v: 'sprint', Icon: Zap, label: t('tasks.sprintTab') },
              ] as const).map(({ v, Icon, label }) => (
                <button key={v} onClick={() => setView(v)}
                  className="h-11 rounded-full font-medium text-sm flex items-center justify-center gap-1.5 transition-all"
                  style={view === v
                    ? { background: 'var(--accent-primary)', color: '#fff' }
                    : { background: 'var(--bg-card)', boxShadow: '0 0 0 0.5px var(--line)', color: 'var(--fg-muted)' }
                  }
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>
          </div>

          {view === 'go' ? (
            <div className="go-sprint-panel" style={{ padding: '0 12px' }}>
              <GoPanel tasks={tasks} onReload={load} />
            </div>
          ) : view === 'sprint' ? (
            <div className="go-sprint-panel" style={{ padding: '0 12px' }}>
              <SprintPanel tasks={tasks} onReload={load} />
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
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {allTags.map((tag) => {
                      const sel = newTagIds.includes(tag.id);
                      return (
                        <button key={tag.id} type="button"
                          onClick={() => setNewTagIds((s) => sel ? s.filter((id) => id !== tag.id) : [...s, tag.id])}
                          className="tag"
                          style={sel ? { backgroundColor: tag.color, color: '#fff', boxShadow: 'none' } : undefined}>
                          {!sel && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />}
                          {tag.name}
                        </button>
                      );
                    })}
                    <button type="button"
                      onClick={async () => {
                        const name = prompt('Tag name?');
                        if (!name?.trim()) return;
                        try {
                          const created = await tagsApi.create(name.trim(), STANDARD_COLORS[allTags.length % STANDARD_COLORS.length]);
                          setAllTags([...allTags, created]);
                          setNewTagIds([...newTagIds, created.id]);
                        } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
                      }}
                      className="tag" style={{ borderStyle: 'dashed', color: 'var(--fg-muted)' }}>
                      <Plus size={11} /> {allTags.length === 0 ? 'Add first tag' : 'New tag'}
                    </button>
                  </div>
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

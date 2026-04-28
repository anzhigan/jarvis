import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Repeat, Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi, tasksApi } from '../api/client';
import type { Routine, RoutineScheduleType } from '../api/types';
import { useT } from '../store/i18n';

const ROUTINE_COLORS = [
  '#10b981', '#0891b2', '#3b82f6', '#7c3aed', '#ec4899',
  '#e11d48', '#ea580c', '#d97706', '#65a30d', '#64748b',
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat
const WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Is this routine due today based on its schedule? */
function isRoutineDueToday(r: Routine): boolean {
  if (r.is_paused) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (r.start_date) {
    const s = new Date(r.start_date); s.setHours(0, 0, 0, 0);
    if (today < s) return false;
  }
  if (r.end_date) {
    const e = new Date(r.end_date); e.setHours(0, 0, 0, 0);
    if (today > e) return false;
  }
  switch (r.schedule_type) {
    case 'daily':
      return true;
    case 'weekly_on_days': {
      const dow = today.getDay();
      const allowed = (r.schedule_days || '').split(',').filter(Boolean).map((s) => parseInt(s, 10));
      return allowed.includes(dow);
    }
    case 'every_n_days': {
      const created = new Date(r.created_at); created.setHours(0, 0, 0, 0);
      const diff = Math.floor((today.getTime() - created.getTime()) / 86400000);
      return diff >= 0 && diff % Math.max(1, r.schedule_n_days) === 0;
    }
    case 'times_per_week': {
      // Show until weekly quota is met
      const start = new Date(today);
      start.setDate(start.getDate() - today.getDay()); // Sunday
      const startMs = start.getTime();
      const endMs = today.getTime();
      const doneThisWeek = r.entries.filter((e) => {
        if (e.value <= 0) return false;
        const d = new Date(e.date); d.setHours(0, 0, 0, 0);
        const ms = d.getTime();
        return ms >= startMs && ms <= endMs;
      }).length;
      return doneThisWeek < r.schedule_count_per_period;
    }
  }
}

/** Display string for the schedule */
function scheduleLabel(r: Routine, lang: 'en' | 'ru'): string {
  const dayLabels = lang === 'ru' ? WEEKDAY_LABELS_RU : WEEKDAY_LABELS;
  switch (r.schedule_type) {
    case 'daily':
      return lang === 'ru' ? 'Каждый день' : 'Every day';
    case 'weekly_on_days': {
      const days = (r.schedule_days || '').split(',').filter(Boolean).map((s) => parseInt(s, 10));
      if (!days.length) return lang === 'ru' ? 'По расписанию' : 'On schedule';
      return days.map((d) => dayLabels[d]).join(', ');
    }
    case 'every_n_days':
      return lang === 'ru' ? `Раз в ${r.schedule_n_days} дн.` : `Every ${r.schedule_n_days} days`;
    case 'times_per_week':
      return lang === 'ru'
        ? `${r.schedule_count_per_period} раз${r.schedule_count_per_period > 1 ? 'а' : ''} в неделю`
        : `${r.schedule_count_per_period}× per week`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Streak — last 14 days as colored circles (today on the LEFT)
// ═══════════════════════════════════════════════════════════════════════════
function RoutineStreak({ routine }: { routine: Routine }) {
  const days = 14;
  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of routine.entries) m.set(e.date, e.value);
    return m;
  }, [routine.entries]);

  const created = useMemo(() => {
    const d = new Date(routine.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [routine.created_at]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: { date: string; value: number; isToday: boolean; before: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateIso(d);
    cells.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isToday: i === 0,
      before: d < created,
    });
  }
  const ordered = [...cells].reverse(); // today first

  const eligible = cells.filter((c) => !c.before).length;
  const done = cells.filter((c) => !c.before && c.value > 0).length;

  return (
    <div className="mt-2">
      <div className="text-[10px] text-muted-foreground mb-1.5">
        ← today &nbsp;·&nbsp; <span className="font-medium text-foreground">{done}</span>/{eligible}
      </div>
      <div className="flex gap-1 items-end">
        {ordered.map((c) => {
          let cls = 'bg-muted/60';
          let inner: React.ReactNode = null;
          if (c.before) cls = 'bg-muted/30';
          else if (c.value > 0) {
            cls = '';
            inner = <span className="text-white text-[8px]">✓</span>;
          } else if (c.isToday) cls = 'bg-card border-2 border-primary';
          else cls = 'bg-rose-400/40 dark:bg-rose-600/30';
          const style = (!c.before && c.value > 0) ? { backgroundColor: routine.color } : undefined;
          return (
            <div
              key={c.date}
              title={c.date}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${cls} ${c.isToday ? 'scale-110' : ''}`}
              style={style}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RoutineCard
// ═══════════════════════════════════════════════════════════════════════════
function RoutineCard({ routine, onReload }: { routine: Routine; onReload: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const today = todayIso();
  const todayEntry = routine.entries.find((e) => e.date === today);
  const isDoneToday = (todayEntry?.value ?? 0) > 0;
  const dueToday = isRoutineDueToday(routine);

  const toggleToday = async () => {
    if (routine.kind !== 'boolean' || busy) return;
    setBusy(true);
    try {
      const newValue = isDoneToday ? 0 : 1;
      if (newValue === 0) {
        await routinesApi.deleteEntry(routine.id, today);
      } else {
        await routinesApi.upsertEntry(routine.id, today, newValue);
      }
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await routinesApi.update(routine.id, { is_paused: !routine.is_paused } as any);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete routine "${routine.title}"?`)) return;
    setBusy(true);
    try {
      await routinesApi.delete(routine.id);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return <RoutineEditForm routine={routine} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await onReload(); }} />;
  }

  return (
    <div className="flex items-stretch rounded-md bg-card border border-border overflow-hidden">
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: routine.color }} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center gap-2">
          {routine.kind === 'boolean' && (
            <button
              onClick={toggleToday}
              disabled={busy || routine.is_paused}
              className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                isDoneToday
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : dueToday
                    ? 'border-primary hover:bg-primary/10'
                    : 'border-border'
              } ${routine.is_paused ? 'opacity-40' : ''}`}
              title={dueToday ? (isDoneToday ? 'Mark not done' : 'Mark done today') : 'Not due today'}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : isDoneToday ? '✓' : ''}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate ${routine.is_paused ? 'text-muted-foreground' : ''}`}>
              {routine.title}
            </div>
            {routine.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{routine.description}</p>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap mt-0.5">
              <span className="inline-flex items-center gap-0.5">
                <Repeat size={10} /> {scheduleLabel(routine, 'en')}
              </span>
              {routine.is_paused && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <Pause size={10} /> paused
                </span>
              )}
            </div>
          </div>
          <button
            onClick={togglePause}
            className="hidden md:flex w-7 h-7 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title={routine.is_paused ? 'Resume' : 'Pause'}
          >
            {routine.is_paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="hidden md:flex w-7 h-7 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={remove}
            className="hidden md:flex w-7 h-7 rounded-md items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <RoutineStreak routine={routine} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Edit Form
// ═══════════════════════════════════════════════════════════════════════════
function RoutineEditForm({
  routine, onCancel, onSaved,
}: { routine: Routine; onCancel: () => void; onSaved: () => Promise<void> }) {
  const t = useT();
  const [title, setTitle] = useState(routine.title);
  const [description, setDescription] = useState(routine.description);
  const [color, setColor] = useState(routine.color);
  const [scheduleType, setScheduleType] = useState<RoutineScheduleType>(routine.schedule_type);
  const [scheduleDays, setScheduleDays] = useState<string[]>(
    (routine.schedule_days || '').split(',').filter(Boolean)
  );
  const [scheduleNDays, setScheduleNDays] = useState(routine.schedule_n_days);
  const [scheduleCount, setScheduleCount] = useState(routine.schedule_count_per_period);
  const [saving, setSaving] = useState(false);

  const toggleDay = (idx: number) => {
    const s = String(idx);
    setScheduleDays((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await routinesApi.update(routine.id, {
        title: title.trim() || routine.title,
        description,
        color,
        schedule_type: scheduleType,
        schedule_days: scheduleDays.join(','),
        schedule_n_days: scheduleNDays,
        schedule_count_per_period: scheduleCount,
      } as any);
      await onSaved();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-card border border-border rounded-md space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md"
        placeholder="Routine title"
        autoFocus
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description…"
        className="w-full px-2.5 py-2 text-sm bg-input-background border border-border rounded-md resize-none"
      />

      {/* Schedule type */}
      <div>
        <label className="text-[11px] text-muted-foreground">Schedule</label>
        <select
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as RoutineScheduleType)}
          className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        >
          <option value="daily">Every day</option>
          <option value="weekly_on_days">On specific weekdays</option>
          <option value="every_n_days">Every N days</option>
          <option value="times_per_week">X times per week</option>
        </select>
      </div>

      {scheduleType === 'weekly_on_days' && (
        <div className="flex gap-1 flex-wrap">
          {WEEKDAY_LABELS.map((lbl, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`w-9 h-9 rounded-md text-xs font-medium border transition-colors ${
                scheduleDays.includes(String(idx))
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-secondary'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}

      {scheduleType === 'every_n_days' && (
        <div>
          <label className="text-[11px] text-muted-foreground">Every (days)</label>
          <input
            type="number"
            min={1}
            value={scheduleNDays}
            onChange={(e) => setScheduleNDays(parseInt(e.target.value || '1', 10))}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
          />
        </div>
      )}

      {scheduleType === 'times_per_week' && (
        <div>
          <label className="text-[11px] text-muted-foreground">Times per week</label>
          <input
            type="number"
            min={1}
            max={7}
            value={scheduleCount}
            onChange={(e) => setScheduleCount(parseInt(e.target.value || '1', 10))}
            className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
          />
        </div>
      )}

      {/* Color */}
      <div className="flex gap-1.5 flex-wrap">
        {ROUTINE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded transition-all ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="h-8 px-3 text-sm text-muted-foreground rounded-md hover:bg-secondary">
          {t('common.cancel')}
        </button>
        <button onClick={save} disabled={saving || !title.trim()}
          className="h-8 px-3 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1">
          {saving && <Loader2 size={11} className="animate-spin" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Form
// ═══════════════════════════════════════════════════════════════════════════
function CreateRoutineForm({ onCreated, onCancel, goals }: { onCreated: () => Promise<void>; onCancel: () => void; goals: { id: string; title: string }[] }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(ROUTINE_COLORS[0]);
  const [scheduleType, setScheduleType] = useState<RoutineScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleNDays, setScheduleNDays] = useState(2);
  const [scheduleCount, setScheduleCount] = useState(2);
  const [goalId, setGoalId] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleDay = (idx: number) => {
    const s = String(idx);
    setScheduleDays((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s]);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await routinesApi.create({
        title: title.trim(),
        description: description.trim(),
        color,
        schedule_type: scheduleType,
        schedule_days: scheduleDays.join(','),
        schedule_n_days: scheduleNDays,
        schedule_count_per_period: scheduleCount,
        goal_id: goalId || null,
      });
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
        <span className="text-xs font-medium text-muted-foreground">New routine</span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" title="Cancel">
          <X size={14} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Routine title (e.g. Solve 10 algebra problems)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
        className="w-full h-9 px-2.5 text-sm bg-input-background border border-border rounded-md"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description…"
        rows={2}
        className="w-full px-2.5 py-2 text-sm bg-input-background border border-border rounded-md resize-none"
      />

      <select
        value={scheduleType}
        onChange={(e) => setScheduleType(e.target.value as RoutineScheduleType)}
        className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
      >
        <option value="daily">Every day</option>
        <option value="weekly_on_days">On specific weekdays</option>
        <option value="every_n_days">Every N days</option>
        <option value="times_per_week">X times per week</option>
      </select>

      {scheduleType === 'weekly_on_days' && (
        <div className="flex gap-1 flex-wrap">
          {WEEKDAY_LABELS.map((lbl, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`w-9 h-9 rounded-md text-xs font-medium border transition-colors ${
                scheduleDays.includes(String(idx))
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-secondary'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}

      {scheduleType === 'every_n_days' && (
        <input
          type="number"
          min={1}
          value={scheduleNDays}
          onChange={(e) => setScheduleNDays(parseInt(e.target.value || '1', 10))}
          placeholder="Every N days"
          className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        />
      )}

      {scheduleType === 'times_per_week' && (
        <input
          type="number"
          min={1}
          max={7}
          value={scheduleCount}
          onChange={(e) => setScheduleCount(parseInt(e.target.value || '1', 10))}
          placeholder="Times per week"
          className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        />
      )}

      {goals.length > 0 && (
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
        >
          <option value="">No goal (standalone)</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>↳ {g.title}</option>
          ))}
        </select>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-1.5">
          {ROUTINE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded transition-all ${color === c ? 'ring-2 ring-offset-1 ring-ring' : ''}`}
              style={{ backgroundColor: c }}
            />
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
// Main Routines page
// ═══════════════════════════════════════════════════════════════════════════
export default function Routines() {
  const t = useT();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'today' | 'all' | 'paused'>('today');

  const load = async () => {
    setLoading(true);
    try {
      const [list, ts] = await Promise.all([
        routinesApi.list(),
        tasksApi.list(),
      ]);
      setRoutines(list);
      setGoals(ts.filter((t) => t.status !== 'done').map((t) => ({ id: t.id, title: t.title })));
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load routines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredRoutines = useMemo(() => {
    if (filter === 'today') return routines.filter((r) => isRoutineDueToday(r));
    if (filter === 'paused') return routines.filter((r) => r.is_paused);
    return routines.filter((r) => !r.is_paused);
  }, [routines, filter]);

  const counts = useMemo(() => ({
    today: routines.filter((r) => isRoutineDueToday(r)).length,
    all: routines.filter((r) => !r.is_paused).length,
    paused: routines.filter((r) => r.is_paused).length,
  }), [routines]);

  return (
    <div className="size-full flex flex-col">
      <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Routines</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Recurring activities with schedule</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {/* Filter pills */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {(['today', 'all', 'paused'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                  filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                {f === 'today' ? 'Today' : f === 'all' ? 'All active' : 'Paused'}
                <span className="ml-1.5 opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>

          {/* Create button / form */}
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full h-11 mb-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5 font-medium text-sm"
            >
              <Plus size={16} /> New routine
            </button>
          ) : (
            <CreateRoutineForm onCancel={() => setCreating(false)} onCreated={load} goals={goals} />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filteredRoutines.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Repeat size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {filter === 'today' ? 'Nothing scheduled for today.' :
                 filter === 'paused' ? 'No paused routines.' :
                 'No routines yet. Create your first one above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRoutines.map((r) => (
                <RoutineCard key={r.id} routine={r} onReload={load} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

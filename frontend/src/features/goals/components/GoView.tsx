import { Plus, Check, Target, Repeat } from 'lucide-react';
import type { Go } from '../../../api/types';
import type { GoBucket, GroupedGos } from '../hooks/useGos';

interface Props {
  grouped: GroupedGos;
  onToggleDone: (go: Go) => void;
  onSelect: (id: string) => void;
  onAdd: (bucket: GoBucket) => void;
}

const COLS: { key: GoBucket; title: string }[] = [
  { key: 'overdue',  title: 'Overdue'  },
  { key: 'today',    title: 'Today'    },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'done',     title: 'Done'     },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dueText(due: string | null): { text: string; tone?: 'overdue' | 'today' } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (days < 0)   return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, tone: 'overdue' };
  if (days === 0) return { text: 'Today', tone: 'today' };
  if (days === 1) return { text: 'Tomorrow' };
  if (days < 7)   return { text: `${days}d` };
  return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}

/** Last 7 days as boolean[] (oldest → newest). null = scheduled-but-empty miss. */
function last7Days(go: Go): { on: boolean; miss: boolean }[] {
  const map = new Map<string, number>();
  for (const e of go.entries) map.set(e.date, e.value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out: { on: boolean; miss: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = ymd(d);
    const v = map.get(key) ?? 0;
    out.push({ on: v > 0, miss: v === 0 && i > 0 });
  }
  return out;
}

function currentStreak(go: Go): number {
  const map = new Map<string, number>();
  for (const e of go.entries) map.set(e.date, e.value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const v = map.get(ymd(d)) ?? 0;
    if (v > 0) count++;
    else if (i > 0) break;
  }
  return count;
}

function numericFraction(go: Go): string {
  const target = go.target_value ?? 0;
  if (!target) return '';
  const ratio = Math.min(1, go.total_value / target);
  if (ratio <= 0)        return '';
  if (ratio < 0.34)      return '⅓';
  if (ratio < 0.5)       return '';
  if (ratio < 0.67)      return '½';
  if (ratio < 0.85)      return '¾';
  return '';
}

function GoMark({ go, onToggle }: { go: Go; onToggle: () => void }) {
  if (go.kind === 'numeric') {
    const target = go.target_value ?? 0;
    const ratio = target ? go.total_value / target : 0;
    const progress = ratio >= 1 ? 'full' : ratio > 0 ? 'partial' : 'empty';
    return (
      <button
        className="go-mark numeric"
        data-progress={progress}
        onClick={onToggle}
        aria-label="Open log"
      >
        {progress === 'full' ? <Check size={10} /> : numericFraction(go)}
      </button>
    );
  }
  return (
    <button
      className="go-mark"
      data-checked={go.is_done_today || undefined}
      onClick={onToggle}
      aria-label={go.is_done_today ? 'Mark not done' : 'Mark done'}
    >
      {go.is_done_today && <Check size={10} />}
    </button>
  );
}

function GoCard({ go, onToggleDone, onSelect }: { go: Go; onToggleDone: (go: Go) => void; onSelect: (id: string) => void }) {
  const due = dueText(go.due_date);
  const recurring = go.recurrence === 'daily' || go.recurrence === 'weekly';
  return (
    <div
      className="go-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(go.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(go.id); }}
    >
      <div className="go-row1">
        <GoMark go={go} onToggle={() => { onToggleDone(go); }} />
        {go.task_title && (
          <span className="go-parent" onClick={(e) => e.stopPropagation()}>
            <Target />
            <span className="pname">{go.task_title}</span>
          </span>
        )}
        <span className="go-spacer" />
        {recurring ? (
          <span className="go-rec">
            <Repeat />
            {go.recurrence === 'daily' ? 'Daily' : 'Weekly'}
          </span>
        ) : due ? (
          <span className={`go-due${due.tone ? ` ${due.tone}` : ''}`}>{due.text}</span>
        ) : null}
      </div>
      <div className={`go-title${go.is_done_today ? ' go-title-done' : ''}`}>{go.title}</div>
      {go.kind === 'numeric' && go.target_value && (
        <div className="go-numeric">
          <span className="go-numeric-bar">
            <span style={{ width: `${Math.min(100, (go.total_value / go.target_value) * 100)}%` }} />
          </span>
          <span className="go-numeric-text">
            <b>{go.total_value}</b> / {go.target_value}{go.unit && ` ${go.unit}`}
          </span>
        </div>
      )}
      {recurring && (
        <div className="go-streak">
          <div className="go-streak-cells">
            {last7Days(go).map((cell, i) => (
              <span key={i} className="c" data-on={cell.on || undefined} data-miss={cell.miss || undefined} />
            ))}
          </div>
          <span className="go-streak-text">Streak <b>{currentStreak(go)}</b> · last 7d</span>
        </div>
      )}
    </div>
  );
}

export function GoView({ grouped, onToggleDone, onSelect, onAdd }: Props) {
  return (
    <div className="board">
      {COLS.map(({ key, title }) => (
        <div key={key} className="col" data-status={key}>
          <div className="col-head">
            <span className="dot" />
            <span className="col-title">{title}</span>
            <span className="col-count">{grouped[key].length}</span>
            <button className="col-add" onClick={() => onAdd(key)} aria-label={`Add ${title}`}>
              <Plus />
            </button>
          </div>
          <div className="col-body">
            {grouped[key].map((go) => (
              <GoCard key={go.id} go={go} onToggleDone={onToggleDone} onSelect={onSelect} />
            ))}
            <button className="col-add-card" onClick={() => onAdd(key)}>
              <Plus /> Add Go
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

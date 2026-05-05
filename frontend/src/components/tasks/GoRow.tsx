import { useEffect, useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { gosApi } from '../../api/client';
import type { Go, Step } from '../../api/types';
import { useT } from '../../store/i18n';
import ConfirmDialog from '../ConfirmDialog';
import SwipeRow from '../SwipeRow';
import DailyStreak from './DailyStreak';
import EditGoSheet from './EditGoSheet';
import { adaptiveSteps, formatDate, goValueToday, STRIPE_COLOR, todayIso } from './helpers';

export default function GoRow({ go, availableSteps, onReload, onLocalUpdate }: {
  go: Go;
  availableSteps?: Step[];
  onReload: () => Promise<void>;
  onLocalUpdate?: (patched: Go) => void;
  showMeta?: boolean;
}) {
  // useT kept for potential i18n inside this component
  useT();
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
  const stripeColor = go.color || STRIPE_COLOR[go.recurrence];
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
      if (!onLocalUpdate) await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      if (onLocalUpdate) await onReload();
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
        <button aria-label="Edit go" onClick={() => setEditing(true)} className="icon-btn icon-btn-sm" title="Edit">
          <Pencil size={12} />
        </button>
        <button aria-label="Delete go" onClick={() => setConfirmDelete(true)} className="icon-btn icon-btn-sm">
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
          availableSteps={availableSteps}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await onReload(); }}
        />
      )}

      {isMobile
        ? <SwipeRow enabled={!editing} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{goRowEl}</SwipeRow>
        : goRowEl
      }

      {go.kind === 'numeric' && !editing && (
        <div className="go-row-aux">
          {go.target_value && go.target_value > 0 && (
            <div className="go-numeric-track">
              <div className="go-numeric-fill" style={{ width: `${numericPct}%`, backgroundColor: stripeColor }} />
            </div>
          )}
          <div className="go-numeric-row">
            <input type="number" inputMode="decimal" placeholder="+value"
              value={numInput} onChange={(e) => setNumInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logNumeric()}
              className="input go-numeric-input"
            />
            {steps.map((step) => (
              <button key={step} onClick={() => logNumeric(step)} disabled={busy} className="btn btn-secondary btn-sm">+{step}</button>
            ))}
            <button onClick={() => logNumeric()} disabled={busy || !numInput} className="btn btn-primary btn-sm">Log</button>
          </div>
        </div>
      )}

      {go.kind === 'boolean' && go.recurrence === 'daily' && !editing && (
        <div className="go-row-aux">
          <DailyStreak go={go} />
        </div>
      )}
    </>
  );
}

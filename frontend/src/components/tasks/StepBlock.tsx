import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { gosApi, stepsApi } from '../../api/client';
import type { Go, Step } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import ConfirmDialog from '../ConfirmDialog';
import CreateSheet, { FormField } from '../CreateSheet';
import SwipeRow from '../SwipeRow';
import CreateGoForm from './CreateGoForm';
import GoRow from './GoRow';
import { formatDate } from './helpers';

export default function StepBlock({ step, allStepsOfTask, onReload, onGoLocalUpdate, showMeta = true }: {
  step: Step;
  allStepsOfTask?: Step[];
  onReload: () => Promise<void>;
  onGoLocalUpdate?: (go: Go) => void;
  showMeta?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(step.title);
  const [editStart, setEditStart] = useState(step.start_date);
  const [editEnd, setEditEnd] = useState(step.end_date);
  const [editDescription, setEditDescription] = useState(step.description ?? '');
  const [editColor, setEditColor] = useState(step.color);
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
      await stepsApi.update(step.id, {
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
    try { await stepsApi.delete(step.id); await onReload(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  const gosOfStep = step.gos;

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title={t('step.deleteTitle')}
        message={t('step.deleteMsg', { title: step.title })}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={del}
      />

      <CreateSheet
        open={editing}
        onClose={() => setEditing(false)}
        title={t('tasks.editStep')}
        primaryLabel={busy ? 'Saving…' : 'Save'}
        canSubmit={!!editTitle.trim() && !busy}
        onSubmit={save}
      >
        <FormField label="Title">
          <input type="text" className="input w-full" value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description">
          <textarea className="textarea w-full" value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)} placeholder={t('step.notesPh')} rows={3} />
        </FormField>
        <div className="form-row-2col">
          <FormField label="Start date">
            <input type="date" className="input w-full" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
          </FormField>
          <FormField label="End date">
            <input type="date" className="input w-full" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Color">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
            {ENTITY_COLORS.map((c) => (
              <button key={c} type="button"
                onClick={(e) => { e.preventDefault(); setEditColor(c); }}
                className="w-9 h-9 rounded-full transition-all active:scale-90"
                style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
            ))}
          </div>
        </FormField>
      </CreateSheet>

      {(() => {
        const stepCard = (
      <div className="goal-card overflow-hidden">
        <div className="flex items-stretch">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: step.color }} />
          <div className="flex-1 min-w-0">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 flex-1 min-w-0 text-left hover:text-primary"
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="font-medium text-sm truncate">{step.title}</span>
                </button>
                <span className="text-xs font-semibold text-muted-foreground flex-shrink-0">{step.progress}%</span>
                <div className="hidden md:flex items-center gap-0.5 transition-all">
                  <button aria-label="Edit step" onClick={() => setEditing(true)} className="icon-btn icon-btn-sm"><Pencil size={12} /></button>
                  <button aria-label="Delete step" onClick={() => setConfirmDelete(true)} className="icon-btn icon-btn-sm" style={{ '--icon-btn-hover-bg': 'color-mix(in srgb, var(--danger) 10%, transparent)', '--icon-btn-hover-color': 'var(--danger)' } as React.CSSProperties}><Trash2 size={12} /></button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                {formatDate(step.start_date)} — {formatDate(step.end_date)}
                {showMeta && step.task_title && <span> · goal: {step.task_title}</span>}
              </div>
              {step.description && step.description.trim() && (
                <p className="text-[11px] text-muted-foreground mb-2 whitespace-pre-wrap">{step.description}</p>
              )}
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-hover)' }}>
                <div className="h-full transition-all" style={{ width: `${step.progress}%`, backgroundColor: step.color }} />
              </div>
            </div>

            {expanded && (
              <div className="px-3 pb-3 space-y-1.5">
                {gosOfStep.length === 0 && !addingGo && (
                  <div className="py-2 text-center text-xs text-muted-foreground">No go items yet.</div>
                )}
                {gosOfStep.map((go) => (
                  <GoRow
                    key={go.id}
                    go={go}
                    availableSteps={allStepsOfTask}
                    onReload={onReload}
                    onLocalUpdate={onGoLocalUpdate}
                  />
                ))}

                <AddItemButton label={t('tasks.addGo')} onClick={() => setAddingGo(true)} />
                <CreateGoForm
                  open={addingGo}
                  defaultTaskId={step.task_id}
                  defaultStepId={step.id}
                  onCancel={() => setAddingGo(false)}
                  onCreate={async (data) => {
                    await gosApi.create({ ...data, task_id: step.task_id, sprint_id: step.id });
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
          ? <SwipeRow enabled={!editing} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)}>{stepCard}</SwipeRow>
          : stepCard;
      })()}
    </>
  );
}

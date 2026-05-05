import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi } from '../../api/client';
import type { GoalRoutineLink, Routine, Task } from '../../api/types';
import AddItemButton from '../AddItemButton';
import { useT } from '../../store/i18n';

export default function GoalLinkedRoutines({ task, onReload: _onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
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

  const openPicker = async () => {
    try { const all = await routinesApi.list(); setAllRoutines(all); } catch {}
    setShowLinkPicker(true);
  };

  return (
    <div className="task-expanded">
      {linkedRoutines.length > 0 && (
        <div className="task-expanded-section-label">{linkedRoutines.length} linked</div>
      )}

      {linkedRoutines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {routineLinks.length > 0 ? routineLinks.map((link) => {
            const r = link.routine;
            const { done, total, pct } = computeConsistency(link);
            return (
              <div key={link.id} className={`routine-link-card ${r.is_paused ? 'opacity-60' : ''}`}>
                <div className="routine-link-row">
                  <span className="routine-link-stripe" style={{ backgroundColor: r.color }} />
                  <span className="routine-link-title">{r.title}</span>
                  <span className="routine-link-meta">{done}/{total}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Unlink "${r.title}" from this goal?`)) return;
                      try { await routinesApi.deleteLink(link.id); await loadLinks(); }
                      catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
                    }}
                    aria-label="Unlink routine"
                    className="icon-btn icon-btn-sm"
                    title="Unlink"
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="routine-link-progress">
                  <div className="routine-link-progress-fill" style={{ width: `${pct}%`, backgroundColor: r.color }} />
                </div>
              </div>
            );
          }) : linkedRoutines.map((r) => (
            <div key={r.id} className={`routine-link-card ${r.is_paused ? 'opacity-60' : ''}`} style={{ padding: '8px 12px' }}>
              <div className="routine-link-row">
                <span className="routine-link-stripe" style={{ backgroundColor: r.color }} />
                <span className="routine-link-title">{r.title}</span>
                <span className="routine-link-meta" style={{ textTransform: 'capitalize' }}>{r.schedule_type.replace('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="add-row">
        <AddItemButton label={t('tasks.addRoutine')} onClick={openPicker} />
      </div>

      {showLinkPicker && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center" onClick={() => setShowLinkPicker(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel w-full md:max-w-lg rounded-t-[var(--r-shell)] md:rounded-[var(--r-shell)] flex flex-col max-h-[85vh] md:max-h-[80vh]"
            style={{ boxShadow: 'var(--sh-popover)' }}
          >
            <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
              <h3 className="text-base font-semibold">Attach routine</h3>
              <button aria-label="Close" type="button" onClick={() => setShowLinkPicker(false)} className="icon-btn icon-btn-sm"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {allRoutines.filter((r) => !linkedRoutines.find((lr) => lr.id === r.id)).length === 0 ? (
                <p className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No routines to attach.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allRoutines.filter((r) => !linkedRoutines.find((lr) => lr.id === r.id)).map((r) => (
                    <button
                      key={r.id}
                      type="button"
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
                      className="routine-link-card"
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div className="routine-link-row">
                        <span className="routine-link-stripe" style={{ backgroundColor: r.color }} />
                        <span className="routine-link-title">{r.title}</span>
                        <span className="routine-link-meta" style={{ textTransform: 'capitalize' }}>{r.schedule_type.replace('_', ' ')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '10px 12px 12px', boxShadow: 'inset 0 0.5px 0 var(--line)' }}>
              <button
                type="button"
                onClick={() => {
                  setShowLinkPicker(false);
                  window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'routines' }));
                }}
                className="add-item-btn"
                style={{ width: '100%', margin: 0 }}
              >
                <Plus size={14} /> Create new routine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

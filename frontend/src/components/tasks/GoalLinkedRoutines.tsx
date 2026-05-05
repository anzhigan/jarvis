import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi } from '../../api/client';
import type { GoalRoutineLink, Routine, Task } from '../../api/types';

export default function GoalLinkedRoutines({ task, onReload: _onReload }: { task: Task; onReload: () => Promise<void> }) {
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
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <div className="task-expanded-section-label" style={{ marginBottom: 0 }}>
          {linkedRoutines.length > 0 ? `${linkedRoutines.length} linked` : 'No routines linked'}
        </div>
        <button
          type="button"
          onClick={async () => {
            try { const all = await routinesApi.list(); setAllRoutines(all); } catch {}
            setShowLinkPicker(true);
          }}
          className="add-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 500, color: 'var(--accent-goals, var(--primary))', background: 'none', border: 0, cursor: 'pointer', padding: '2px 6px', borderRadius: 'var(--r-control)' }}
        >
          <Plus size={11} /> Link routine
        </button>
      </div>

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

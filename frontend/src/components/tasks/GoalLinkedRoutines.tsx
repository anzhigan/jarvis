import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi } from '../../api/client';
import type { GoalRoutineLink, Routine, Task } from '../../api/types';
import AddItemButton from '../AddItemButton';
import PickerSheet from '../PickerSheet';
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
              <div
                key={link.id}
                className="routine-row"
                style={{ position: 'relative', opacity: r.is_paused ? 0.6 : 1 }}
              >
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: 4, background: r.color,
                    borderRadius: 'var(--r-card) 0 0 var(--r-card)',
                    opacity: r.is_paused ? 0.35 : 0.9,
                  }}
                />
                <div className="routine-info">
                  <div className="routine-title">{r.title}</div>
                  <div className="routine-sub">
                    {done}/{total} · {pct}%
                    {r.is_paused && <> · paused</>}
                  </div>
                  <div
                    style={{
                      height: 4, marginTop: 6,
                      background: 'var(--bg-hover)',
                      borderRadius: 'var(--r-pill)', overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: `${pct}%`, height: '100%', background: r.color }} />
                  </div>
                </div>
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
                  <X size={13} />
                </button>
              </div>
            );
          }) : linkedRoutines.map((r) => (
            <div
              key={r.id}
              className="routine-row"
              style={{ position: 'relative', opacity: r.is_paused ? 0.6 : 1 }}
            >
              <div
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: 4, background: r.color,
                  borderRadius: 'var(--r-card) 0 0 var(--r-card)',
                  opacity: r.is_paused ? 0.35 : 0.9,
                }}
              />
              <div className="routine-info">
                <div className="routine-title">{r.title}</div>
                <div className="routine-sub" style={{ textTransform: 'capitalize' }}>
                  {r.schedule_type.replace('_', ' ')}
                  {r.is_paused && <> · paused</>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="add-row">
        <AddItemButton label={t('tasks.addRoutine')} onClick={openPicker} />
      </div>

      <PickerSheet
        open={showLinkPicker}
        onClose={() => setShowLinkPicker(false)}
        title="Attach routine"
        footer={
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
        }
      >
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
      </PickerSheet>
    </div>
  );
}

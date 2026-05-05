/**
 * GoalLinkedRoutines — list of routines linked to a Goal, rendered with the
 * same `.routine-row` visual the standalone Routines page uses (color stripe,
 * title + sub line, 7-day completion strip).
 *
 * Swipe actions (mobile):
 *   • Edit  — navigates to the Routines tab where full editing happens.
 *   • Unlink — removes the routine ↔ goal link (orange, NOT delete).
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi } from '../../api/client';
import type { GoalRoutineLink, Routine, Task } from '../../api/types';
import AddItemButton from '../AddItemButton';
import PickerSheet from '../PickerSheet';
import SwipeRow from '../SwipeRow';
import { useT } from '../../store/i18n';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StreakStrip({ routine }: { routine: Routine }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const created = new Date(routine.created_at); created.setHours(0, 0, 0, 0);
  const entries = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of routine.entries) m.set(e.date, e.value);
    return m;
  }, [routine.entries]);
  const has = useMemo(() => new Set(routine.entries.map((e) => e.date)), [routine.entries]);

  const cells: { date: string; state: 'done' | 'fail' | 'today' | 'empty'; dayInitial: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = isoDate(d);
    const before = d < created;
    const v = entries.get(key) ?? 0;
    let state: 'done' | 'fail' | 'today' | 'empty';
    if (i === 0) {
      state = v > 0 ? 'done' : has.has(key) ? 'fail' : 'today';
    } else if (before) state = 'empty';
    else if (v > 0) state = 'done';
    else if (has.has(key)) state = 'fail';
    else state = 'empty';
    cells.push({ date: key, state, dayInitial: DAY_INITIALS[d.getDay()] });
  }

  return (
    <div className="streak-strip-row">
      <span className="streak-strip-label">7d</span>
      <div className="streak-strip">
        {cells.map((c) => (
          <span key={c.date} className="streak-dot" data-state={c.state} title={c.date} />
        ))}
      </div>
    </div>
  );
}

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
      try { const r = await routinesApi.byGoal(task.id); setLinkedRoutines(r); } catch { /* */ }
    }
  };

  useEffect(() => { loadLinks(); }, [task.id, task.updated_at]);

  const openPicker = async () => {
    try { const all = await routinesApi.list(); setAllRoutines(all); } catch { /* */ }
    setShowLinkPicker(true);
  };

  const renderRow = (r: Routine, linkId?: string) => {
    const card = (
      <div
        className="routine-row"
        style={{ position: 'relative', opacity: r.is_paused ? 0.6 : 1, paddingLeft: 14 }}
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
          <StreakStrip routine={r} />
        </div>
      </div>
    );

    return (
      <SwipeRow
        key={linkId ?? r.id}
        onEdit={() => {
          // Editing a routine happens on the Routines tab — switch to it.
          window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'routines' }));
        }}
        onDelete={async () => {
          if (!linkId) return;
          try { await routinesApi.deleteLink(linkId); await loadLinks(); }
          catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
        }}
        secondaryAction={{
          icon: <Link2Off size={20} color="#fff" strokeWidth={2} />,
          label: 'Unlink',
          color: 'var(--accent-routines, #d97706)',
        }}
      >
        {card}
      </SwipeRow>
    );
  };

  return (
    <div className="task-expanded">
      {linkedRoutines.length > 0 && (
        <div className="task-expanded-section-label">{linkedRoutines.length} linked</div>
      )}

      {linkedRoutines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {routineLinks.length > 0
            ? routineLinks.map((link) => renderRow(link.routine, link.id))
            : linkedRoutines.map((r) => renderRow(r))}
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
                  const _now = new Date();
                  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
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

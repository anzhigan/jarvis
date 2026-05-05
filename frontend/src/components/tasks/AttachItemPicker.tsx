import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { tasksApi, gosApi } from '../../api/client';
import type { Go, Step, Task } from '../../api/types';
import { formatDate } from './helpers';

/**
 * AttachItemPicker — bottom sheet that lists existing Steps or Gos so the user
 * can pick one to attach to the current Goal. Cards are rendered in the same
 * visual style as on the Step / Go pages. A trailing "Create new" row opens
 * the corresponding create form via onCreateNew.
 */
export default function AttachItemPicker({
  kind, excludeTaskId, onClose, onAttach, onCreateNew,
}: {
  kind: 'step' | 'go';
  /** Hide items already belonging to this task. */
  excludeTaskId?: string;
  onClose: () => void;
  onAttach: (id: string) => Promise<void>;
  onCreateNew: () => void;
}) {
  const [steps, setSteps] = useState<{ step: Step; goalTitle: string | null }[]>([]);
  const [gos, setGos] = useState<Go[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (kind === 'step') {
          const tasks: Task[] = await tasksApi.list();
          const all: { step: Step; goalTitle: string | null }[] = [];
          for (const tk of tasks) {
            for (const sp of tk.sprints || []) {
              all.push({ step: sp, goalTitle: tk.title });
            }
          }
          setSteps(all);
        } else {
          const all = await gosApi.list();
          setGos(all);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [kind]);

  const filteredSteps = useMemo(() => {
    const s = search.trim().toLowerCase();
    return steps
      .filter(({ step }) => !excludeTaskId || step.task_id !== excludeTaskId)
      .filter(({ step }) => !s || step.title.toLowerCase().includes(s));
  }, [steps, search, excludeTaskId]);

  const filteredGos = useMemo(() => {
    const s = search.trim().toLowerCase();
    return gos
      .filter((g) => !excludeTaskId || g.task_id !== excludeTaskId)
      .filter((g) => !s || g.title.toLowerCase().includes(s));
  }, [gos, search, excludeTaskId]);

  const title = kind === 'step' ? 'Attach step' : 'Attach go';
  const createLabel = kind === 'step' ? 'Create new step' : 'Create new go';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel w-full md:max-w-lg rounded-t-[var(--r-shell)] md:rounded-[var(--r-shell)] flex flex-col max-h-[85vh] md:max-h-[80vh]"
        style={{ boxShadow: 'var(--sh-popover)' }}
      >
        <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          <h3 className="text-base font-semibold">{title}</h3>
          <button aria-label="Close" type="button" onClick={onClose} className="icon-btn icon-btn-sm"><X size={18} /></button>
        </div>

        <div className="px-3 pt-3 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input w-full"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8" style={{ color: 'var(--fg-muted)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              {kind === 'step' && (
                filteredSteps.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No steps to attach.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredSteps.map(({ step, goalTitle }) => {
                      const tagBg = step.color ? step.color + '20' : 'var(--accent-notes-bg)';
                      const tagFg = step.color || 'var(--accent-notes-fg)';
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => onAttach(step.id)}
                          className="step-card"
                          style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <div className="step-card-head">
                            <span className="step-card-tag" style={{ background: tagBg, color: tagFg }}>
                              {goalTitle ?? 'Standalone'}
                            </span>
                            <span className="step-card-dates">
                              {formatDate(step.start_date)} — {formatDate(step.end_date)}
                            </span>
                          </div>
                          <div className="step-card-title">{step.title}</div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {kind === 'go' && (
                filteredGos.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No gos to attach.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {filteredGos.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onAttach(g.id)}
                        className="go-row"
                        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg-elevated)' }}
                      >
                        <span
                          className="check-circle"
                          data-state="outline"
                          style={{ pointerEvents: 'none' }}
                        />
                        <div className="go-info">
                          <div className="go-title">{g.title}</div>
                          <div className="go-sub">
                            {g.task_title ?? 'Standalone'}
                            {g.due_date ? ` · ${formatDate(g.due_date)}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>

        <div style={{ padding: '10px 12px 12px', boxShadow: 'inset 0 0.5px 0 var(--line)' }}>
          <button type="button" onClick={onCreateNew} className="add-item-btn" style={{ width: '100%', margin: 0 }}>
            <Plus size={14} /> {createLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

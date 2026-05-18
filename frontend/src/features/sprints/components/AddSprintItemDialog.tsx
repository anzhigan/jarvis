/**
 * "Add item to sprint" picker — a single Dialog with three tabs (Goals /
 * Gos / Routines). Each tab is a searchable list; click an item to add it
 * to the sprint via `sprintsApi.addItem`. Already-added items are shown
 * dim with an "Added" badge instead of being filtered out, so the user
 * sees what's already in the sprint.
 */
import { useMemo, useState } from 'react';
import { Repeat, Search, Target, Zap } from 'lucide-react';
import { Dialog } from '../../../components/ui';
import type { Sprint } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useRoutines } from '../../routines/hooks/useRoutines';
import type { SprintsLibrary } from '../hooks/useSprints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint | null;
  library: SprintsLibrary;
}

type Tab = 'goal' | 'go' | 'routine';

const TAB_LABEL: Record<Tab, string> = { goal: 'Goals', go: 'Gos', routine: 'Routines' };
const TAB_ICON: Record<Tab, React.ElementType> = { goal: Target, go: Zap, routine: Repeat };

export function AddSprintItemDialog({ open, onOpenChange, sprint, library }: Props) {
  const goals = useGoals();
  const gosLib = useGos();
  const routinesLib = useRoutines();

  const [tab, setTab] = useState<Tab>('goal');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // ids of items already in the sprint, grouped by kind
  const existing = useMemo(() => {
    const out = { goal: new Set<string>(), go: new Set<string>(), routine: new Set<string>() };
    if (!sprint) return out;
    for (const it of sprint.items) {
      if (it.item_type === 'goal' && it.goal_id) out.goal.add(it.goal_id);
      if (it.item_type === 'go' && it.go_id) out.go.add(it.go_id);
      if (it.item_type === 'routine' && it.routine_id) out.routine.add(it.routine_id);
    }
    return out;
  }, [sprint]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (tab === 'goal') {
      return goals.tasks
        .filter((t) => !q || t.title.toLowerCase().includes(q))
        .map((t) => ({ id: t.id, title: t.title, sub: `${t.gos?.length ?? 0} gos`, color: t.color }));
    }
    if (tab === 'go') {
      return gosLib.gos
        .filter((g) => !q || g.title.toLowerCase().includes(q))
        .map((g) => ({
          id: g.id,
          title: g.title,
          sub: g.due_date
            ? `due ${new Date(g.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
            : g.kind === 'boolean' ? 'daily check' : 'numeric',
          color: null as string | null,
        }));
    }
    return routinesLib.routines
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .map((r) => ({
        id: r.id,
        title: r.title,
        sub: r.schedule_type ? r.schedule_type.replace(/_/g, ' ') : 'routine',
        color: null as string | null,
      }));
  }, [tab, q, goals.tasks, gosLib.gos, routinesLib.routines]);

  const add = async (kind: Tab, itemId: string) => {
    if (!sprint || busyId) return;
    setBusyId(itemId);
    try {
      const body: Parameters<typeof library.addItem>[1] =
        kind === 'goal'   ? { item_type: 'goal',   goal_id: itemId }
      : kind === 'go'     ? { item_type: 'go',     go_id: itemId }
                          : { item_type: 'routine', routine_id: itemId };
      await library.addItem(sprint.id, body);
    } finally {
      setBusyId(null);
    }
  };

  const loading = goals.loading || gosLib.loading || routinesLib.loading;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={sprint ? `Add to «${sprint.title}»` : 'Add item'}
      description="Pick a goal, go, or routine to attach to this sprint."
    >
      <div className="sp-add">
        <div className="sp-add__tabs" role="tablist">
          {(['goal', 'go', 'routine'] as Tab[]).map((t) => {
            const Icon = TAB_ICON[t];
            const count = t === 'goal' ? existing.goal.size
                       : t === 'go' ? existing.go.size
                       : existing.routine.size;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                className={`sp-add__tab${tab === t ? ' is-on' : ''}`}
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                <Icon size={12} />
                <span>{TAB_LABEL[t]}</span>
                {count > 0 && <span className="sp-add__tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <label className="sp-add__search">
          <Search size={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${TAB_LABEL[tab].toLowerCase()}…`}
            autoFocus
          />
        </label>

        <ul className="sp-add__list">
          {loading ? (
            <li className="sp-add__empty">Loading…</li>
          ) : rows.length === 0 ? (
            <li className="sp-add__empty">
              {q ? 'No matches.' : `No ${TAB_LABEL[tab].toLowerCase()} yet.`}
            </li>
          ) : (
            rows.map((r) => {
              const isExisting =
                tab === 'goal' ? existing.goal.has(r.id)
              : tab === 'go' ? existing.go.has(r.id)
                             : existing.routine.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="sp-add__row"
                    disabled={isExisting || busyId !== null}
                    onClick={() => add(tab, r.id)}
                  >
                    {r.color && (
                      <span
                        className="sp-add__dot"
                        style={{ background: r.color || undefined }}
                        aria-hidden
                      />
                    )}
                    <span className="sp-add__row-text">
                      <span className="sp-add__row-title">{r.title}</span>
                      <span className="sp-add__row-sub">{r.sub}</span>
                    </span>
                    <span className="sp-add__row-badge">
                      {isExisting ? 'Added' : busyId === r.id ? 'Adding…' : '+ Add'}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </Dialog>
  );
}

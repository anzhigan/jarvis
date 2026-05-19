/**
 * "Add item to sprint" picker — a single Dialog with two tabs (Goals /
 * Gos). Each tab is a searchable list; click an item to add it
 * to the sprint via `sprintsApi.addItem`. Already-added items are shown
 * dim with an "Added" badge instead of being filtered out, so the user
 * sees what's already in the sprint.
 *
 * Routines are intentionally excluded — a sprint is a time-bounded
 * commitment to concrete deliverables; recurring habits live in their
 * own surface and don't belong in a finite scope.
 */
import { useMemo, useState } from 'react';
import { Search, Target, Zap } from 'lucide-react';
import { Dialog } from '../../../components/ui';
import type { Sprint } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import type { SprintsLibrary } from '../hooks/useSprints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint | null;
  library: SprintsLibrary;
}

type Tab = 'goal' | 'go';

const TAB_LABEL: Record<Tab, string> = { goal: 'Goals', go: 'Gos' };
const TAB_ICON: Record<Tab, React.ElementType> = { goal: Target, go: Zap };

export function AddSprintItemDialog({ open, onOpenChange, sprint, library }: Props) {
  const goals = useGoals();
  const gosLib = useGos();

  const [tab, setTab] = useState<Tab>('goal');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // ids of items already in the sprint, grouped by kind
  const existing = useMemo(() => {
    const out = { goal: new Set<string>(), go: new Set<string>() };
    if (!sprint) return out;
    for (const it of sprint.items) {
      if (it.item_type === 'goal' && it.goal_id) out.goal.add(it.goal_id);
      if (it.item_type === 'go' && it.go_id) out.go.add(it.go_id);
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
  }, [tab, q, goals.tasks, gosLib.gos]);

  const add = async (kind: Tab, itemId: string) => {
    if (!sprint || busyId) return;
    setBusyId(itemId);
    try {
      const body: Parameters<typeof library.addItem>[1] =
        kind === 'goal' ? { item_type: 'goal', goal_id: itemId }
                        : { item_type: 'go',   go_id:   itemId };
      await library.addItem(sprint.id, body);
    } finally {
      setBusyId(null);
    }
  };

  const loading = goals.loading || gosLib.loading;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={sprint ? `Add to «${sprint.title}»` : 'Add item'}
      description="Pick a goal or go to attach to this sprint."
    >
      <div className="sp-add">
        <div className="sp-add__tabs" role="tablist">
          {(['goal', 'go'] as Tab[]).map((t) => {
            const Icon = TAB_ICON[t];
            const count = t === 'goal' ? existing.goal.size : existing.go.size;
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
                tab === 'goal' ? existing.goal.has(r.id) : existing.go.has(r.id);
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

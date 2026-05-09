import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';

interface PickerProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** "Goal" / "Step" / "Go" / "Routine" — used for empty hints + create CTA. */
  entity: string;
  items: T[];
  /** Initially-selected ids. */
  initialSelected?: Set<string>;
  /** Callback fired with the final selection (set of ids) on Done. */
  onConfirm: (selected: Set<string>) => void;
  /** Open the corresponding "create" form. The picker closes; the parent
   *  is expected to open its create form. */
  onCreate?: () => void;
  /** Search-string predicate. */
  matches: (item: T, q: string) => boolean;
  /** Render the body of the row (right of the checkbox). */
  render: (item: T) => React.ReactNode;
}

/**
 * Reusable picker — opens above another bottom-sheet (form) and lets the
 * user search / multi-select existing entities. A "Create new …" CTA at the
 * top defers to a parent-supplied callback so the host can surface its own
 * Create form (e.g. open `GoForm` over the picker).
 */
export function MobilePickerSheet<T extends { id: string }>({
  open, onOpenChange, title, entity, items, initialSelected,
  onConfirm, onCreate, matches, render,
}: PickerProps<T>) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected ?? []));
      setQ('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => matches(it, needle));
  }, [items, q, matches]);

  const toggle = (id: string) => setSelected((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const submit = () => {
    onConfirm(selected);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" onClick={submit}>
          {selected.size > 0 ? `Add ${selected.size}` : 'Done'}
        </button>
      </>}
    >
      <div className="m-form" style={{ gap: 12 }}>
        <div className="search-pill" style={{ marginBottom: 0 }}>
          <Search />
          <input
            type="search"
            placeholder={`Search ${entity.toLowerCase()}s…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        {onCreate && (
          <button
            type="button"
            className="m-add-btn"
            style={{ margin: 0 }}
            onClick={() => { onOpenChange(false); onCreate(); }}
          >
            <Plus /> Create new {entity.toLowerCase()}
          </button>
        )}

        {filtered.length === 0 ? (
          <div style={{
            padding: '24px 0', textAlign: 'center',
            color: 'var(--ink-4)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            {q ? `No ${entity.toLowerCase()}s match "${q}".` : `No ${entity.toLowerCase()}s yet.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((it) => {
              const on = selected.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggle(it.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', textAlign: 'left',
                    padding: '12px 14px', borderRadius: 10,
                    background: on ? 'var(--indigo-soft)' : 'var(--paper)',
                    border: `1px solid ${on ? 'var(--indigo)' : 'var(--hairline-strong)'}`,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15,24,32,0.04)',
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--ink)',
                    transition: 'background 140ms, border-color 140ms',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: `1.5px solid ${on ? 'var(--indigo)' : 'var(--hairline-strong)'}`,
                      background: on ? 'var(--indigo)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--paper)',
                    }}
                  >{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{render(it)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

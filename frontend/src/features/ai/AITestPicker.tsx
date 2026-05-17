import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button, Dialog } from '../../components/ui';
import type { Note } from '../../api/types';
import './ai.css';

/** Minimum substantive note size we'd quiz on. Mirrors the backend threshold
 *  (see QUIZ_ALL_MIN_NOTE_CHARS) so the picker doesn't show notes the
 *  generator would skip. */
const MIN_CHARS = 200;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: Note[];
  /** Called when user confirms; receives the selected note ids. */
  onConfirm: (ids: string[]) => void;
  /** Optional: pre-selection when reopening. */
  initialSelected?: string[];
}

/**
 * Modal picker for the "AI test" entry point. Lists every substantive note
 * in the user's library with a search box; user ticks the ones they want
 * the model to draw questions from.
 */
export function AITestPicker({
  open, onOpenChange, notes, onConfirm, initialSelected,
}: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected ?? []),
  );

  // Reset selection when dialog reopens so an old pick doesn't leak in.
  useEffect(() => {
    if (open) setSelected(new Set(initialSelected ?? []));
  }, [open, initialSelected]);

  const substantive = useMemo(
    () => notes
      .filter((n) => (n.content?.length ?? 0) >= MIN_CHARS)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return substantive;
    return substantive.filter((n) => (n.name || '').toLowerCase().includes(q));
  }, [substantive, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allSelected = filtered.every((n) => selected.has(n.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of filtered) {
        if (allSelected) next.delete(n.id);
        else next.add(n.id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onConfirm(Array.from(selected));
  };

  const visibleSelected = filtered.filter((n) => selected.has(n.id)).length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="AI test"
      description="Pick the notes the model should draw questions from."
      footer={
        <>
          <span style={{ flex: 1, color: 'var(--ink-4)', fontSize: 'var(--text-xs)' }}>
            {selected.size > 0 ? `${selected.size} selected` : 'select at least one'}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            Generate test
          </Button>
        </>
      }
    >
      <div className="ai-test-picker">
        <div className="ai-test-picker__search">
          <Search size={13} />
          <input
            type="search"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {filtered.length > 0 && (
            <button
              type="button"
              className="ai-test-picker__all"
              onClick={toggleAllVisible}
            >
              {visibleSelected === filtered.length ? 'Unselect all' : 'Select all'}
            </button>
          )}
        </div>

        {substantive.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <p className="ai-test-picker__empty">No notes match «{search}».</p>
        ) : (
          <ul className="ai-test-picker__list">
            {filtered.map((n) => (
              <PickerRow
                key={n.id}
                note={n}
                checked={selected.has(n.id)}
                onToggle={() => toggle(n.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function PickerRow({
  note, checked, onToggle,
}: {
  note: Note;
  checked: boolean;
  onToggle: () => void;
}) {
  const chars = note.content?.length ?? 0;
  // Plain text length is more meaningful than HTML length, but stripping
  // tags client-side is heavy; the raw count is a decent rough signal.
  const sizeLabel =
      chars >= 5000 ? 'long'
    : chars >= 2000 ? 'medium'
                    : 'short';
  return (
    <li>
      <label className="ai-test-picker__row" data-checked={checked || undefined}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="ai-test-picker__row-body">
          <span className="ai-test-picker__row-title">{note.name || 'Untitled'}</span>
          <span className="ai-test-picker__row-meta">{sizeLabel} · {chars} chars</span>
        </span>
      </label>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="ai-test-picker__no-notes">
      <Loader2 size={14} className="animate-spin" />
      <p>No notes with at least {MIN_CHARS} characters of content. Write a few first.</p>
    </div>
  );
}

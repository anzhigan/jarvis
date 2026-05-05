import { useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';

const TAG_PALETTE = [
  '#4f46e5', '#e11d48', '#ea580c', '#d97706',
  '#65a30d', '#059669', '#0891b2', '#7c3aed',
];

// Same visuals as TagSelector but works on local state — used in Add Goal
// form before the goal entity exists, so we can't attach via API yet.
export default function DeferredTagPicker({ allTags, selectedIds, onChange, onCreateTag }: {
  allTags: { id: string; name: string; color: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateTag: (name: string, color: string) => Promise<{ id: string; name: string; color: string }>;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const selectedSet = new Set(selectedIds);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await onCreateTag(name, newColor);
      onChange([...selectedIds, created.id]);
      setNewName(''); setNewColor(TAG_PALETTE[0]); setNewOpen(false);
    } finally { setCreating(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {allTags.map((tag) => {
          const sel = selectedSet.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                borderRadius: 999, fontSize: 13, fontWeight: 500,
                color: sel ? 'white' : tag.color,
                backgroundColor: sel ? tag.color : `${tag.color}15`,
                border: `1px solid ${tag.color}${sel ? '' : '40'}`,
                cursor: 'pointer',
              }}
            >
              {sel && <Check size={11} />}
              {tag.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setNewOpen((v) => !v)}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium border border-dashed text-muted-foreground"
          style={{ borderColor: 'var(--line-strong)' }}
        >
          <Plus size={11} /> New tag
        </button>
      </div>
      {newOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--r-card)', background: 'var(--bg-hover)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Tag name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              className="input"
              style={{ flex: 1 }}
              maxLength={50}
              autoFocus
            />
            <button
              type="button"
              onClick={create}
              disabled={!newName.trim() || creating}
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TAG_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: 999, backgroundColor: c,
                  border: newColor === c ? '3px solid var(--fg-primary)' : '2px solid transparent',
                  outline: newColor === c ? '2px solid var(--bg-card)' : 'none',
                  outlineOffset: -4, cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

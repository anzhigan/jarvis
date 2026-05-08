import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Note, Way, Topic } from '../../../api/types';
import { useNotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileFab } from '../components/MobileFab';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
  /** Open the editor for a specific note (full-screen). */
  onOpenNote?: (id: string) => void;
}

interface NoteWithLocation {
  note: Note;
  way: Way;
  topic: Topic | null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - noteDay.getTime()) / 86_400_000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (diffDays === 0) return `Today · ${hh}:${mm}`;
  if (diffDays === 1) return `Yesterday · ${hh}:${mm}`;
  if (diffDays < 7) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${hh}:${mm}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent ?? '').trim();
}

export function MobileNotesScreen({ tab, onTabChange, onAvatarClick, onOpenNote }: Props) {
  const lib = useNotesLibrary();
  const [search, setSearch] = useState('');
  const [activeWay, setActiveWay] = useState<string | 'all'>('all');

  // Flatten all notes once with their parent way/topic — used to drive the
  // pinned section and the main feed below.
  const allNotes = useMemo<NoteWithLocation[]>(() => {
    const out: NoteWithLocation[] = [];
    for (const w of lib.ways) {
      for (const n of w.notes) out.push({ note: n, way: w, topic: null });
      for (const t of w.topics) for (const n of t.notes) out.push({ note: n, way: w, topic: t });
    }
    return out;
  }, [lib.ways]);

  const wayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allNotes) m.set(r.way.id, (m.get(r.way.id) ?? 0) + 1);
    return m;
  }, [allNotes]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo<NoteWithLocation[]>(() => {
    return allNotes.filter((r) => {
      if (activeWay !== 'all' && r.way.id !== activeWay) return false;
      if (!q) return true;
      const text = `${r.note.name} ${previewText(r.note.content)} ${r.note.tags.map((t) => t.name).join(' ')}`.toLowerCase();
      return text.includes(q);
    });
  }, [allNotes, activeWay, q]);

  const pinned = filtered.filter((r) => r.note.pinned)
    .sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));
  const recent = filtered.filter((r) => !r.note.pinned)
    .sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));

  const handleAdd = async () => {
    const name = window.prompt('Note title')?.trim();
    if (!name) return;
    // Pick a target — current way filter, else first way, else create one.
    let wayId: string | undefined = activeWay !== 'all' ? activeWay : lib.ways[0]?.id;
    if (!wayId) {
      const wayName = window.prompt('No ways yet — name your first way')?.trim();
      if (!wayName) return;
      const created = await lib.createWay(wayName);
      if (!created) return;
      wayId = created.id;
    }
    const note = await lib.createNote({ way_id: wayId }, name);
    if (note && onOpenNote) onOpenNote(note.id);
  };

  const subtitle = `${allNotes.length} across ${lib.ways.length} way${lib.ways.length === 1 ? '' : 's'}`;
  const topBar = (
    <MobileTopBar title="Notes" subtitle={subtitle} onAvatarClick={onAvatarClick} />
  );

  if (lib.loading) {
    return (
      <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
        <div style={{
          display: 'grid', placeItems: 'center', height: '60dvh',
          color: 'var(--ink-4)',
        }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell
      topBar={topBar}
      fab={<MobileFab onClick={handleAdd} ariaLabel="New note" />}
      tab={tab}
      onTabChange={onTabChange}
    >
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder="Search notes, tags, ways..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="ways-pills">
        <button
          type="button"
          className={`wp-pill${activeWay === 'all' ? ' wp-pill-active' : ''}`}
          onClick={() => setActiveWay('all')}
        >All ways · {allNotes.length}</button>
        {lib.ways.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`wp-pill${activeWay === w.id ? ' wp-pill-active' : ''}`}
            onClick={() => setActiveWay(w.id)}
          >{w.name} · {wayCounts.get(w.id) ?? 0}</button>
        ))}
      </div>

      {pinned.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Pinned</span>
            <span className="sec-rule" />
            <span className="sec-meta">{pinned.length}</span>
          </div>
          <div className="notes-list">
            {pinned.map((r) => (
              <NoteCard key={r.note.id} row={r} onClick={() => onOpenNote?.(r.note.id)} />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">{q ? 'Search results' : 'Recent'}</span>
            <span className="sec-rule" />
            <span className="sec-meta">{recent.length}</span>
          </div>
          <div className="notes-list">
            {recent.map((r) => (
              <NoteCard key={r.note.id} row={r} onClick={() => onOpenNote?.(r.note.id)} />
            ))}
          </div>
        </>
      )}

      {pinned.length === 0 && recent.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
        }}>
          {q
            ? 'No notes match your search.'
            : lib.ways.length === 0
              ? 'No notes yet. Tap + to create your first one.'
              : 'No notes in this way yet.'}
        </div>
      )}
    </MobileShell>
  );
}

function NoteCard({ row, onClick }: { row: NoteWithLocation; onClick: () => void }) {
  const { note, way, topic } = row;
  const wayLabel = topic ? `${way.name} · ${topic.name}` : way.name;
  return (
    <article
      className="note-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      style={{ cursor: 'pointer' }}
    >
      <header className="nc-head">
        <div className="nc-way">
          {note.pinned && <span className="note-pin">●</span>}
          {wayLabel}
        </div>
        <span className="nc-time">{formatTimestamp(note.updated_at)}</span>
      </header>
      <h3 className="nc-title">{note.name || 'Untitled'}</h3>
      {note.content && (
        <p className="nc-preview">{previewText(note.content)}</p>
      )}
      {note.tags.length > 0 && (
        <footer className="nc-foot">
          {note.tags.map((t) => (
            <span key={t.id} className="note-tag" style={{ color: t.color }}>
              #{t.name}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

export default MobileNotesScreen;

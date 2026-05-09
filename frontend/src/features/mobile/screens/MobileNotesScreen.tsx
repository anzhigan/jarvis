import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, Plus, Search, StickyNote } from 'lucide-react';
import type { Note, Topic, Way } from '../../../api/types';
import { useNotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

// Full-screen note editor — opened when a card is tapped.
const MobileNoteEditor = lazy(() => import('./MobileNoteEditor'));

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
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
  if (diffDays < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${hh}:${mm}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent ?? '').trim();
}

/** Where in the way → topic → note tree the user currently is. */
type CurrentLevel =
  | { kind: 'root' }
  | { kind: 'way';   wayId: string }
  | { kind: 'topic'; wayId: string; topicId: string };

export default function MobileNotesScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useNotesLibrary();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<CurrentLevel>({ kind: 'root' });
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const allNotes = useMemo(() => {
    let n = 0;
    for (const w of lib.ways) {
      n += w.notes.length;
      for (const t of w.topics) n += t.notes.length;
    }
    return n;
  }, [lib.ways]);

  // ── Resolve the current way / topic ───────────────────────────────────────
  // Computed every render — must run before any early returns so the React
  // hooks order stays stable.
  const currentWay: Way | null = level.kind !== 'root'
    ? lib.ways.find((w) => w.id === level.wayId) ?? null
    : null;
  const currentTopic: Topic | null = level.kind === 'topic' && currentWay
    ? currentWay.topics.find((t) => t.id === level.topicId) ?? null
    : null;

  // If the underlying entity disappeared (rename/delete), step back up.
  useEffect(() => {
    if (level.kind !== 'root' && !lib.loading && !currentWay) {
      setLevel({ kind: 'root' });
    } else if (level.kind === 'topic' && !lib.loading && !currentTopic) {
      setLevel({ kind: 'way', wayId: level.wayId });
    }
  }, [level, currentWay, currentTopic, lib.loading]);

  // ── Note editor (full-screen overlay) ─────────────────────────────────────
  const openedNote = openNoteId ? lib.findNote(openNoteId)?.note ?? null : null;
  if (openedNote) {
    return (
      <Suspense fallback={null}>
        <MobileNoteEditor
          note={openedNote}
          library={lib}
          onBack={() => setOpenNoteId(null)}
        />
      </Suspense>
    );
  }

  if (lib.loading) {
    return (
      <MobileShell
        topBar={<MobileTopBar title="Notes" onAvatarClick={onAvatarClick} />}
        tab={tab}
        onTabChange={onTabChange}
      >
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  // ── Add handlers ──────────────────────────────────────────────────────────
  const handleAddWay = async () => {
    const name = window.prompt('Way name')?.trim();
    if (!name) return;
    const w = await lib.createWay(name);
    if (w) setLevel({ kind: 'way', wayId: w.id });
  };
  const handleAddTopic = async (wayId: string) => {
    const name = window.prompt('Topic name')?.trim();
    if (!name) return;
    const t = await lib.createTopic(wayId, name);
    if (t) setLevel({ kind: 'topic', wayId, topicId: t.id });
  };
  const handleAddNote = async (target: { way_id?: string; topic_id?: string }) => {
    const name = window.prompt('Note title')?.trim();
    if (!name) return;
    const n = await lib.createNote(target, name);
    if (n) setOpenNoteId(n.id);
  };

  // ── Top bar — varies by level ─────────────────────────────────────────────
  let title = 'Notes';
  let subtitle: string | undefined;
  let leftSlot: React.ReactNode | undefined;
  if (level.kind === 'root') {
    subtitle = `${allNotes} note${allNotes === 1 ? '' : 's'} · ${lib.ways.length} way${lib.ways.length === 1 ? '' : 's'}`;
  } else if (level.kind === 'way' && currentWay) {
    title = currentWay.name;
    subtitle = `${currentWay.topics.length} topic${currentWay.topics.length === 1 ? '' : 's'} · ${currentWay.notes.length} direct note${currentWay.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'root' })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  } else if (level.kind === 'topic' && currentTopic && currentWay) {
    title = currentTopic.name;
    subtitle = `${currentWay.name} · ${currentTopic.notes.length} note${currentTopic.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'way', wayId: currentWay.id })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  }
  const topBar = <MobileTopBar title={title} subtitle={subtitle} leftSlot={leftSlot} onAvatarClick={onAvatarClick} />;

  // ── Body ──────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const matchesQuery = (n: Note) => {
    if (!q) return true;
    return `${n.name} ${previewText(n.content)} ${n.tags.map((t) => t.name).join(' ')}`.toLowerCase().includes(q);
  };

  return (
    <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
      {level.kind === 'root' && (
        <RootLevel
          ways={lib.ways}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenWay={(id) => setLevel({ kind: 'way', wayId: id })}
          onOpenNote={setOpenNoteId}
          onAddWay={handleAddWay}
          onAddTopic={handleAddTopic}
          onAddNote={(t) => handleAddNote(t)}
        />
      )}

      {level.kind === 'way' && currentWay && (
        <WayLevel
          way={currentWay}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenTopic={(id) => setLevel({ kind: 'topic', wayId: currentWay.id, topicId: id })}
          onOpenNote={setOpenNoteId}
          onAddTopic={() => handleAddTopic(currentWay.id)}
          onAddNote={() => handleAddNote({ way_id: currentWay.id })}
        />
      )}

      {level.kind === 'topic' && currentTopic && (
        <TopicLevel
          topic={currentTopic}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenNote={setOpenNoteId}
          onAddNote={() => handleAddNote({ topic_id: currentTopic.id })}
        />
      )}
    </MobileShell>
  );
}

// ── Root: list of ways + pinned + add (way / topic / note) ────────────────

function RootLevel({
  ways, search, onSearch, matchesQuery, onOpenWay, onOpenNote,
  onAddWay, onAddTopic, onAddNote,
}: {
  ways: Way[];
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenWay: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddWay: () => void;
  onAddTopic: (wayId: string) => void;
  onAddNote: (target: { way_id?: string; topic_id?: string }) => void;
}) {
  // Pinned across all ways (after search).
  const pinned: { note: Note; way: Way; topic: Topic | null }[] = [];
  for (const w of ways) {
    for (const n of w.notes) if (n.pinned && matchesQuery(n)) pinned.push({ note: n, way: w, topic: null });
    for (const t of w.topics) for (const n of t.notes)
      if (n.pinned && matchesQuery(n)) pinned.push({ note: n, way: w, topic: t });
  }
  pinned.sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));

  // Search results (when q is set, also surface matched non-pinned notes).
  const q = search.trim();
  const searchResults: { note: Note; way: Way; topic: Topic | null }[] = [];
  if (q) {
    for (const w of ways) {
      for (const n of w.notes) if (!n.pinned && matchesQuery(n)) searchResults.push({ note: n, way: w, topic: null });
      for (const t of w.topics) for (const n of t.notes)
        if (!n.pinned && matchesQuery(n)) searchResults.push({ note: n, way: w, topic: t });
    }
    searchResults.sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));
  }

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder="Search notes, tags, ways..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="m-add-row">
        <button type="button" className="m-add-btn" onClick={onAddWay}>
          <Plus /> Way
        </button>
        {ways.length > 0 && (
          <button
            type="button"
            className="m-add-btn"
            onClick={() => {
              if (ways.length === 1) { onAddTopic(ways[0].id); return; }
              const labels = ways.map((w, i) => `${i + 1}. ${w.name}`).join('\n');
              const idx = window.prompt(`Topic in which way?\n\n${labels}\n\nEnter number:`);
              const n = idx ? parseInt(idx, 10) - 1 : -1;
              if (ways[n]) onAddTopic(ways[n].id);
            }}
          >
            <Plus /> Topic
          </button>
        )}
        {ways.length > 0 && (
          <button
            type="button"
            className="m-add-btn"
            onClick={() => {
              if (ways.length === 1) { onAddNote({ way_id: ways[0].id }); return; }
              const labels = ways.map((w, i) => `${i + 1}. ${w.name}`).join('\n');
              const idx = window.prompt(`Note in which way?\n\n${labels}\n\nEnter number:`);
              const n = idx ? parseInt(idx, 10) - 1 : -1;
              if (ways[n]) onAddNote({ way_id: ways[n].id });
            }}
          >
            <Plus /> Note
          </button>
        )}
      </div>

      {pinned.length > 0 && !q && (
        <>
          <div className="section-bar">
            <span className="sec-title">Pinned</span>
            <span className="sec-rule" />
            <span className="sec-meta">{pinned.length}</span>
          </div>
          <div className="notes-list">
            {pinned.map((r) => (
              <NoteCard key={r.note.id} row={r} onClick={() => onOpenNote(r.note.id)} />
            ))}
          </div>
        </>
      )}

      {q && searchResults.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Search results</span>
            <span className="sec-rule" />
            <span className="sec-meta">{searchResults.length}</span>
          </div>
          <div className="notes-list">
            {searchResults.map((r) => (
              <NoteCard key={r.note.id} row={r} onClick={() => onOpenNote(r.note.id)} />
            ))}
          </div>
        </>
      )}

      {!q && (
        <>
          <div className="section-bar">
            <span className="sec-title">Ways</span>
            <span className="sec-rule" />
            <span className="sec-meta">{ways.length}</span>
          </div>
          {ways.length === 0 ? (
            <EmptyHint>Tap “+ Way” to create your first folder.</EmptyHint>
          ) : (
            <div className="notes-list">
              {ways.map((w) => {
                const total = w.notes.length + w.topics.reduce((a, t) => a + t.notes.length, 0);
                return (
                  <FolderRow
                    key={w.id}
                    icon={<FolderOpen size={16} />}
                    name={w.name}
                    meta={`${w.topics.length} topic${w.topics.length === 1 ? '' : 's'} · ${total} note${total === 1 ? '' : 's'}`}
                    onClick={() => onOpenWay(w.id)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Way: topics + standalone notes inside the way ─────────────────────────

function WayLevel({
  way, search, onSearch, matchesQuery, onOpenTopic, onOpenNote, onAddTopic, onAddNote,
}: {
  way: Way;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenTopic: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddTopic: () => void;
  onAddNote: () => void;
}) {
  const directNotes = way.notes.filter(matchesQuery)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${way.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="m-add-row">
        <button type="button" className="m-add-btn" onClick={onAddTopic}>
          <Plus /> Topic
        </button>
        <button type="button" className="m-add-btn" onClick={onAddNote}>
          <Plus /> Note
        </button>
      </div>

      {way.topics.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Topics</span>
            <span className="sec-rule" />
            <span className="sec-meta">{way.topics.length}</span>
          </div>
          <div className="notes-list">
            {way.topics.map((t) => (
              <FolderRow
                key={t.id}
                icon={<FolderOpen size={16} />}
                name={t.name}
                meta={`${t.notes.length} note${t.notes.length === 1 ? '' : 's'}`}
                onClick={() => onOpenTopic(t.id)}
              />
            ))}
          </div>
        </>
      )}

      {(directNotes.length > 0 || way.notes.length > 0) && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes in this way</span>
            <span className="sec-rule" />
            <span className="sec-meta">{directNotes.length}</span>
          </div>
          <div className="notes-list">
            {directNotes.map((n) => (
              <NoteCard key={n.id} row={{ note: n, way, topic: null }} onClick={() => onOpenNote(n.id)} />
            ))}
          </div>
        </>
      )}

      {way.topics.length === 0 && way.notes.length === 0 && (
        <EmptyHint>This way is empty. Use the buttons above to add a topic or a note.</EmptyHint>
      )}
    </>
  );
}

// ── Topic: notes in the topic ─────────────────────────────────────────────

function TopicLevel({
  topic, search, onSearch, matchesQuery, onOpenNote, onAddNote,
}: {
  topic: Topic;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenNote: (id: string) => void;
  onAddNote: () => void;
}) {
  const notes = topic.notes.filter(matchesQuery)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${topic.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>

      {notes.length === 0 ? (
        <EmptyHint>No notes in this topic yet.</EmptyHint>
      ) : (
        <div className="notes-list">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              row={{ note: n, way: { id: '', name: '', topics: [], notes: [], order: 0, created_at: '', updated_at: '' }, topic }}
              hideWayLabel
              onClick={() => onOpenNote(n.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────

function FolderRow({
  icon, name, meta, onClick,
}: { icon: React.ReactNode; name: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="note-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', cursor: 'pointer',
      }}
    >
      <span style={{ color: 'var(--indigo)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
          color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>{name}</div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--ink-5)', marginTop: 2,
        }}>{meta}</div>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--ink-5)', flexShrink: 0 }} />
    </button>
  );
}

function NoteCard({
  row, hideWayLabel, onClick,
}: {
  row: { note: Note; way: Way; topic: Topic | null };
  hideWayLabel?: boolean;
  onClick: () => void;
}) {
  const { note, way, topic } = row;
  const wayLabel = hideWayLabel
    ? null
    : topic ? `${way.name} · ${topic.name}` : way.name;
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
          {wayLabel ?? <StickyNote size={10} />}
        </div>
        <span className="nc-time">{formatTimestamp(note.updated_at)}</span>
      </header>
      <h3 className="nc-title">{note.name || 'Untitled'}</h3>
      {note.content && <p className="nc-preview">{previewText(note.content)}</p>}
      {note.tags.length > 0 && (
        <footer className="nc-foot">
          {note.tags.map((t) => (
            <span key={t.id} className="note-tag" style={{ color: t.color }}>#{t.name}</span>
          ))}
        </footer>
      )}
    </article>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '32px 20px', textAlign: 'center', color: 'var(--ink-4)',
      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
    }}>{children}</div>
  );
}

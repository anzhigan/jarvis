import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, Plus, Search } from 'lucide-react';
import type { Note, Topic, Way } from '../../../api/types';
import { useNotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { WayForm, TopicForm, NoteForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
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

  // Bottom-sheet add forms
  const [wayFormOpen, setWayFormOpen] = useState(false);
  const [topicFormOpen, setTopicFormOpen] = useState<{ wayId: string; wayName: string } | null>(null);
  const [noteFormOpen, setNoteFormOpen] = useState<{ target: { way_id?: string; topic_id?: string }; parentName: string } | null>(null);
  // Edit forms
  const [editWay, setEditWay] = useState<Way | null>(null);
  const [editTopic, setEditTopic] = useState<{ topic: Topic; wayName: string } | null>(null);
  const [editNote, setEditNote] = useState<Note | null>(null);
  // Confirm-delete sheets
  const [confirmWay, setConfirmWay] = useState<Way | null>(null);
  const [confirmTopic, setConfirmTopic] = useState<Topic | null>(null);
  const [confirmNote, setConfirmNote] = useState<Note | null>(null);

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

  // ── Add handlers — open bottom-sheet forms instead of prompts ────────────
  const handleAddWay = () => setWayFormOpen(true);
  const handleAddTopic = (wayId: string) => {
    const w = lib.ways.find((x) => x.id === wayId);
    if (w) setTopicFormOpen({ wayId: w.id, wayName: w.name });
  };
  const handleAddNote = (target: { way_id?: string; topic_id?: string }, parentName: string) => {
    setNoteFormOpen({ target, parentName });
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
          onAddNote={(target, parentName) => handleAddNote(target, parentName)}
          onEditWay={(w) => setEditWay(w)}
          onDeleteWay={(w) => setConfirmWay(w)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
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
          onAddNote={() => handleAddNote({ way_id: currentWay.id }, currentWay.name)}
          onEditTopic={(t) => setEditTopic({ topic: t, wayName: currentWay.name })}
          onDeleteTopic={(t) => setConfirmTopic(t)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      {level.kind === 'topic' && currentTopic && currentWay && (
        <TopicLevel
          topic={currentTopic}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenNote={setOpenNoteId}
          onAddNote={() => handleAddNote({ topic_id: currentTopic.id }, `${currentWay.name} · ${currentTopic.name}`)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      <WayForm
        open={wayFormOpen}
        onOpenChange={setWayFormOpen}
        library={lib}
        onCreated={(id) => setLevel({ kind: 'way', wayId: id })}
      />
      {topicFormOpen && (
        <TopicForm
          open={!!topicFormOpen}
          onOpenChange={(o) => { if (!o) setTopicFormOpen(null); }}
          library={lib}
          wayId={topicFormOpen.wayId}
          wayName={topicFormOpen.wayName}
          onCreated={(tid) => setLevel({ kind: 'topic', wayId: topicFormOpen.wayId, topicId: tid })}
        />
      )}
      {noteFormOpen && (
        <NoteForm
          open={!!noteFormOpen}
          onOpenChange={(o) => { if (!o) setNoteFormOpen(null); }}
          library={lib}
          target={noteFormOpen.target}
          parentName={noteFormOpen.parentName}
          onCreated={(nid) => setOpenNoteId(nid)}
        />
      )}

      {/* Edit forms */}
      {editWay && (
        <WayForm
          open={!!editWay}
          onOpenChange={(o) => { if (!o) setEditWay(null); }}
          library={lib}
          editing={editWay}
        />
      )}
      {editTopic && (
        <TopicForm
          open={!!editTopic}
          onOpenChange={(o) => { if (!o) setEditTopic(null); }}
          library={lib}
          wayId={editTopic.topic.way_id}
          wayName={editTopic.wayName}
          editing={editTopic.topic}
        />
      )}
      {editNote && (
        <NoteForm
          open={!!editNote}
          onOpenChange={(o) => { if (!o) setEditNote(null); }}
          library={lib}
          editing={editNote}
        />
      )}

      <MobileConfirmSheet
        open={!!confirmWay}
        onOpenChange={(o) => { if (!o) setConfirmWay(null); }}
        title={`Delete "${confirmWay?.name ?? ''}"?`}
        description="This way and all its topics & notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmWay) await lib.deleteWay(confirmWay.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmTopic}
        onOpenChange={(o) => { if (!o) setConfirmTopic(null); }}
        title={`Delete topic "${confirmTopic?.name ?? ''}"?`}
        description="The topic and all its notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmTopic) await lib.deleteTopic(confirmTopic.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmNote}
        onOpenChange={(o) => { if (!o) setConfirmNote(null); }}
        title={`Delete "${confirmNote?.name || 'Untitled'}"?`}
        description="This note will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmNote) await lib.deleteNote(confirmNote.id); }}
      />
    </MobileShell>
  );
}

// ── Root: list of ways + add buttons after each section ──────────────────

function RootLevel({
  ways, search, onSearch, matchesQuery, onOpenWay, onOpenNote, onAddWay, onAddNote,
  onEditWay, onDeleteWay, onEditNote, onDeleteNote,
}: {
  ways: Way[];
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenWay: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddWay: () => void;
  onAddNote: (target: { way_id?: string; topic_id?: string }, parentName: string) => void;
  onEditWay: (w: Way) => void;
  onDeleteWay: (w: Way) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  // Search results (when q is set, surface matched notes from any way/topic).
  const q = search.trim();
  const searchResults: { note: Note; way: Way; topic: Topic | null }[] = [];
  if (q) {
    for (const w of ways) {
      for (const n of w.notes) if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: null });
      for (const t of w.topics) for (const n of t.notes)
        if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: t });
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

      {q && searchResults.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Search results</span>
            <span className="sec-rule" />
            <span className="sec-meta">{searchResults.length}</span>
          </div>
          <div className="notes-list">
            {searchResults.map((r) => (
              <SwipeableRow
                key={r.note.id}
                onClick={() => onOpenNote(r.note.id)}
                onEdit={() => onEditNote(r.note)}
                onDelete={() => onDeleteNote(r.note)}
                editLabel="Rename"
              >
                <NoteCard row={r} onClick={() => onOpenNote(r.note.id)} />
              </SwipeableRow>
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
            <EmptyHint>Tap “+ Way” below to create your first folder.</EmptyHint>
          ) : (
            <div className="notes-list">
              {ways.map((w) => {
                const total = w.notes.length + w.topics.reduce((a, t) => a + t.notes.length, 0);
                return (
                  <SwipeableRow
                    key={w.id}
                    onClick={() => onOpenWay(w.id)}
                    onEdit={() => onEditWay(w)}
                    onDelete={() => onDeleteWay(w)}
                    editLabel="Rename"
                  >
                    <FolderRow
                      icon={<FolderOpen size={14} />}
                      name={w.name}
                      meta={`${w.topics.length} topic${w.topics.length === 1 ? '' : 's'} · ${total} note${total === 1 ? '' : 's'}`}
                      onClick={() => onOpenWay(w.id)}
                    />
                  </SwipeableRow>
                );
              })}
            </div>
          )}

          <button type="button" className="m-add-btn" onClick={onAddWay}>
            <Plus /> Way
          </button>

          {ways.length > 0 && (
            <button
              type="button"
              className="m-add-btn"
              onClick={() => {
                if (ways.length === 1) {
                  onAddNote({ way_id: ways[0].id }, ways[0].name);
                  return;
                }
                const labels = ways.map((w, i) => `${i + 1}. ${w.name}`).join('\n');
                const idx = window.prompt(`Note in which way?\n\n${labels}\n\nEnter number:`);
                const n = idx ? parseInt(idx, 10) - 1 : -1;
                if (ways[n]) onAddNote({ way_id: ways[n].id }, ways[n].name);
              }}
            >
              <Plus /> Note
            </button>
          )}
        </>
      )}
    </>
  );
}

// ── Way: topics + standalone notes inside the way ─────────────────────────

function WayLevel({
  way, search, onSearch, matchesQuery, onOpenTopic, onOpenNote, onAddTopic, onAddNote,
  onEditTopic, onDeleteTopic, onEditNote, onDeleteNote,
}: {
  way: Way;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenTopic: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddTopic: () => void;
  onAddNote: () => void;
  onEditTopic: (t: Topic) => void;
  onDeleteTopic: (t: Topic) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const directNotes = way.notes.filter(matchesQuery)
    .sort((a, b) => {
      // Pinned first, then most recently updated.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

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

      {way.topics.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Topics</span>
            <span className="sec-rule" />
            <span className="sec-meta">{way.topics.length}</span>
          </div>
          <div className="notes-list">
            {way.topics.map((t) => (
              <SwipeableRow
                key={t.id}
                onClick={() => onOpenTopic(t.id)}
                onEdit={() => onEditTopic(t)}
                onDelete={() => onDeleteTopic(t)}
                editLabel="Rename"
              >
                <FolderRow
                  icon={<FolderOpen size={14} />}
                  name={t.name}
                  meta={`${t.notes.length} note${t.notes.length === 1 ? '' : 's'}`}
                  onClick={() => onOpenTopic(t.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddTopic}>
        <Plus /> Topic
      </button>

      {directNotes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{directNotes.length}</span>
          </div>
          <div className="notes-list">
            {directNotes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way, topic: null }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>

      {way.topics.length === 0 && directNotes.length === 0 && (
        <EmptyHint>This way is empty. Add a topic or a note below.</EmptyHint>
      )}
    </>
  );
}

// ── Topic: notes in the topic ─────────────────────────────────────────────

function TopicLevel({
  topic, search, onSearch, matchesQuery, onOpenNote, onAddNote, onEditNote, onDeleteNote,
}: {
  topic: Topic;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenNote: (id: string) => void;
  onAddNote: () => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const notes = topic.notes.filter(matchesQuery)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

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

      {notes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{notes.length}</span>
          </div>
          <div className="notes-list">
            {notes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way: { id: '', name: '', topics: [], notes: [], order: 0, created_at: '', updated_at: '' }, topic }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>
    </>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────

function FolderRow({
  icon, name, meta, onClick,
}: { icon: React.ReactNode; name: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="m-folder-row">
      <span className="m-folder-icon">{icon}</span>
      <span className="m-folder-name">{name}</span>
      <span className="m-folder-meta">{meta}</span>
      <span className="m-folder-chev"><ChevronRight size={14} /></span>
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
      {!hideWayLabel && (
        <header className="nc-head">
          <div className="nc-way">
            {note.pinned && <span className="note-pin">●</span>}
            {wayLabel}
          </div>
          <span className="nc-time">{formatTimestamp(note.updated_at)}</span>
        </header>
      )}
      {hideWayLabel && note.pinned && (
        <span className="note-pin" style={{ float: 'right' }}>●</span>
      )}
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

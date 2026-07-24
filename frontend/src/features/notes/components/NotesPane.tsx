import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, FileText, FolderPlus, GripVertical, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import type { NotesLibrary } from '../hooks/useNotesLibrary';
import type { Way } from '../../../api/types';
import { confirmDialog, promptDialog } from '../../../components/ui';
import { notesApi, type NoteParent } from '../../../api/client';

const EXP_WAYS_KEY         = 'jarvnote:notes:expandedWays';
const EXP_TOPICS_KEY       = 'jarvnote:notes:expandedTopics';
const EXP_SUBTOPICS_KEY    = 'jarvnote:notes:expandedSubtopics';
const EXP_SUBSUBTOPICS_KEY = 'jarvnote:notes:expandedSubsubtopics';

/* ── DnD: NoteRow + DropTarget ──────────────────────────────────────────
 *
 * Notes are draggable across containers (way ↔ topic) via @dnd-kit. Each
 * note row hosts a grip handle on the left (mirrors Plan-day's UX) that
 * acts as the drag activator — the rest of the row stays click-to-open.
 * Ways and topics are droppable: dropping a note on their header reparents
 * it via `notesApi.move`. Re-ordering within the same parent is not yet
 * wired up; reparent covers the majority of "I want to reorganise" cases.
 */
interface NoteRowProps {
  noteId: string;
  noteName: string;
  depth: 1 | 2 | 3 | 4;
  selected: boolean;
  onSelect: () => void;
  onRename: (e: React.MouseEvent) => void | Promise<void>;
  onDelete: (e: React.MouseEvent) => void | Promise<void>;
}
function NoteRow({ noteId, noteName, depth, selected, onSelect, onRename, onDelete }: NoteRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `note:${noteId}`,
    data: { kind: 'note', noteId, noteName },
  });
  return (
    <div
      ref={setNodeRef}
      className="lib-row tree-row"
      data-depth={depth}
      data-active={selected || undefined}
      data-dragging={isDragging || undefined}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <button
        type="button"
        className="lib-row-grip"
        aria-label="Drag note"
        title="Drag to move into another way or topic"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={11} />
      </button>
      <FileText size={12} className="tree-leaf-icon" />
      <span className="name">{noteName || 'Untitled'}</span>
      <span
        className="row-action row-action--hover"
        role="button"
        tabIndex={0}
        title="Rename note"
        onClick={onRename}
      ><Pencil size={11} /></span>
      <span
        className="row-action row-action--hover row-action--danger"
        role="button"
        tabIndex={0}
        title="Delete note"
        onClick={onDelete}
      ><Trash2 size={11} /></span>
    </div>
  );
}

/** Drop-target wrapper for way/topic headers. Adds a `data-drop-over`
 *  attribute when a note is being dragged over it so we can highlight via
 *  CSS, and keeps layout neutral via `display: contents`. */
function DropTarget({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-drop-over={isOver || undefined} className="lib-drop-wrap">
      {children}
    </div>
  );
}

/** Aggregated "add" affordance for a tree row. Replaces the pair of always-on
 *  create icons (new sub-container + new note) with a single "+" so the row
 *  name has room. With one item it acts directly; with several it opens a
 *  small popover menu. */
interface RowAddItem { label: string; icon: ReactNode; onClick: () => void }
function RowAddMenu({ items, title }: { items: RowAddItem[]; title: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 1) {
    const only = items[0];
    return (
      <span
        className="row-action row-add"
        role="button"
        tabIndex={0}
        title={only.label}
        onClick={(e) => { e.stopPropagation(); only.onClick(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); only.onClick(); }
        }}
      ><Plus size={12} /></span>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span
          className="row-action row-add"
          role="button"
          tabIndex={0}
          title={title}
          data-open={open || undefined}
          onClick={(e) => e.stopPropagation()}
        ><Plus size={12} /></span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="lib-add-menu"
          sideOffset={4}
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              className="lib-add-menu__item"
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
            >
              <span className="lib-add-menu__icon">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(raw.split(',').filter(Boolean)) : new Set();
  } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  localStorage.setItem(key, Array.from(set).join(','));
}

interface Props {
  library: NotesLibrary;
  selectedNoteId: string | null;
  collapsed: boolean;
  onSelectNote: (id: string) => void;
  /** Triggers an "all-notes" smart-test job; parent owns the resulting drawer. */
  onSmartTestAll?: () => void;
}

export function NotesPane({
  library, selectedNoteId, collapsed, onSelectNote, onSmartTestAll,
}: Props) {
  const {
    ways, createWay, createTopic, createNote,
    renameWay, deleteWay,
    renameTopic, deleteTopic,
    createSubtopic, renameSubtopic, deleteSubtopic,
    createSubsubtopic, renameSubsubtopic, deleteSubsubtopic,
    renameNote, deleteNote,
  } = library;

  const promptRename = async (currentName: string, kind: string): Promise<string | null> => {
    const next = await promptDialog({
      title: `Rename ${kind}`,
      defaultValue: currentName,
      placeholder: `${kind[0].toUpperCase()}${kind.slice(1)} name`,
      confirmLabel: 'Rename',
      withEmoji: true,
    });
    if (next === null) return null;
    return next === currentName ? null : next;
  };
  const confirmDelete = (name: string, kind: string, extra = ''): Promise<boolean> =>
    confirmDialog({
      title: `Delete ${kind}?`,
      body: <>«{name}» {extra ? `${extra} ` : ''}This cannot be undone.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
  const [expandedWays, setExpandedWays]     = useState<Set<string>>(readSet(EXP_WAYS_KEY));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(readSet(EXP_TOPICS_KEY));
  const [expandedSubtopics, setExpandedSubtopics] = useState<Set<string>>(readSet(EXP_SUBTOPICS_KEY));
  const [expandedSubsubtopics, setExpandedSubsubtopics] = useState<Set<string>>(readSet(EXP_SUBSUBTOPICS_KEY));
  const [search, setSearch] = useState('');

  useEffect(() => { writeSet(EXP_WAYS_KEY, expandedWays); },     [expandedWays]);
  useEffect(() => { writeSet(EXP_TOPICS_KEY, expandedTopics); }, [expandedTopics]);
  useEffect(() => { writeSet(EXP_SUBTOPICS_KEY, expandedSubtopics); }, [expandedSubtopics]);
  useEffect(() => { writeSet(EXP_SUBSUBTOPICS_KEY, expandedSubsubtopics); }, [expandedSubsubtopics]);

  // Auto-expand parents of the selected note.
  useEffect(() => {
    if (!selectedNoteId) return;
    const located = library.findNote(selectedNoteId);
    if (!located) return;
    setExpandedWays((p) => p.has(located.way.id) ? p : new Set([...p, located.way.id]));
    if (located.topic) {
      setExpandedTopics((p) =>
        p.has(located.topic!.id) ? p : new Set([...p, located.topic!.id]),
      );
    }
    if (located.subtopic) {
      setExpandedSubtopics((p) =>
        p.has(located.subtopic!.id) ? p : new Set([...p, located.subtopic!.id]),
      );
    }
    if (located.subsubtopic) {
      setExpandedSubsubtopics((p) =>
        p.has(located.subsubtopic!.id) ? p : new Set([...p, located.subsubtopic!.id]),
      );
    }
  }, [selectedNoteId, library]);

  const toggleWay = (id: string) => setExpandedWays((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleTopic = (id: string) => setExpandedTopics((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleSubtopic = (id: string) => setExpandedSubtopics((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleSubsubtopic = (id: string) => setExpandedSubsubtopics((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const q = search.trim().toLowerCase();
  const filteredWays = useMemo<Way[]>(() => {
    if (!q) return ways;
    const out: Way[] = [];
    for (const w of ways) {
      const wayHit = w.name.toLowerCase().includes(q);
      const directNotes = w.notes.filter((n) => n.name.toLowerCase().includes(q));
      const topics = w.topics.map((t) => {
        const topicHit = t.name.toLowerCase().includes(q);
        const matched  = t.notes.filter((n) => n.name.toLowerCase().includes(q));
        const subtopics = t.subtopics.map((s) => {
          const subHit = s.name.toLowerCase().includes(q);
          const subMatched = s.notes.filter((n) => n.name.toLowerCase().includes(q));
          const subsubtopics = s.subsubtopics.map((ss) => {
            const ssHit = ss.name.toLowerCase().includes(q);
            const ssMatched = ss.notes.filter((n) => n.name.toLowerCase().includes(q));
            if (ssHit) return ss;
            if (ssMatched.length) return { ...ss, notes: ssMatched };
            return null;
          }).filter((ss): ss is typeof s.subsubtopics[number] => ss !== null);
          if (subHit) return s;
          if (subMatched.length || subsubtopics.length) return { ...s, notes: subMatched, subsubtopics };
          return null;
        }).filter((s): s is typeof t.subtopics[number] => s !== null);
        if (topicHit) return t;
        if (matched.length || subtopics.length) return { ...t, notes: matched, subtopics };
        return null;
      }).filter((t): t is typeof w.topics[number] => t !== null);
      if (wayHit) out.push(w);
      else if (directNotes.length || topics.length) {
        out.push({ ...w, notes: directNotes, topics });
      }
    }
    return out;
  }, [ways, q]);

  const totalNotes = useMemo(() => {
    let n = 0;
    for (const w of ways) {
      n += w.notes.length;
      for (const t of w.topics) {
        n += t.notes.length;
        for (const s of t.subtopics) {
          n += s.notes.length;
          for (const ss of s.subsubtopics) n += ss.notes.length;
        }
      }
    }
    return n;
  }, [ways]);

  const totalTopics = useMemo(() =>
    ways.reduce((acc, w) => acc + w.topics.length, 0), [ways]);

  // Notes directly under a subtopic + everything nested in its subsubtopics.
  const subtopicNoteCount = (s: Way['topics'][number]['subtopics'][number]): number =>
    s.notes.length + s.subsubtopics.reduce((a, ss) => a + ss.notes.length, 0);

  // Total notes under a topic, including those nested in its subtopics/subsubtopics.
  const topicNoteCount = (t: Way['topics'][number]): number =>
    t.notes.length + t.subtopics.reduce((a, s) => a + subtopicNoteCount(s), 0);

  const handleNewWay = async () => {
    // Was `window.prompt(...)` — native browser dialog clashed with the
    // editorial design system. `promptDialog` is a Radix-backed equivalent
    // styled like the rest of the app.
    const name = (await promptDialog({
      title: 'New way',
      placeholder: 'Way name',
      confirmLabel: 'Create',
      withEmoji: true,
    }))?.trim();
    if (!name) return;
    await createWay(name);
  };

  const handleNewTopic = async (wayId: string) => {
    const name = (await promptDialog({
      title: 'New topic',
      placeholder: 'Topic name',
      confirmLabel: 'Create',
      withEmoji: true,
    }))?.trim();
    if (!name) return;
    await createTopic(wayId, name);
    setExpandedWays((p) => p.has(wayId) ? p : new Set([...p, wayId]));
  };

  const handleNewSubtopic = async (topicId: string) => {
    const name = (await promptDialog({
      title: 'New subtopic',
      placeholder: 'Subtopic name',
      confirmLabel: 'Create',
      withEmoji: true,
    }))?.trim();
    if (!name) return;
    await createSubtopic(topicId, name);
    setExpandedTopics((p) => p.has(topicId) ? p : new Set([...p, topicId]));
  };

  const handleNewSubsubtopic = async (subtopicId: string) => {
    const name = (await promptDialog({
      title: 'New subsubtopic',
      placeholder: 'Subsubtopic name',
      confirmLabel: 'Create',
      withEmoji: true,
    }))?.trim();
    if (!name) return;
    await createSubsubtopic(subtopicId, name);
    setExpandedSubtopics((p) => p.has(subtopicId) ? p : new Set([...p, subtopicId]));
  };

  const handleNewNote = async (target: NoteParent) => {
    const note = await createNote(target, 'Untitled');
    if (!note) return;
    if (target.way_id) {
      setExpandedWays((p) => p.has(target.way_id!) ? p : new Set([...p, target.way_id!]));
    }
    if (target.topic_id) {
      setExpandedTopics((p) => p.has(target.topic_id!) ? p : new Set([...p, target.topic_id!]));
    }
    if (target.subtopic_id) {
      setExpandedSubtopics((p) => p.has(target.subtopic_id!) ? p : new Set([...p, target.subtopic_id!]));
    }
    if (target.subsubtopic_id) {
      setExpandedSubsubtopics((p) => p.has(target.subsubtopic_id!) ? p : new Set([...p, target.subsubtopic_id!]));
    }
    onSelectNote(note.id);
  };

  // ─── DnD ──────────────────────────────────────────────────────────────
  // Activation distance 5px so plain clicks on the grip don't fire a
  // phantom drag-start. Matches Plan-day's setting.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragName, setDragName] = useState<string | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    const name = (e.active.data.current as { noteName?: string } | undefined)?.noteName;
    setDragName(name ?? null);
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setDragName(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith('note:')) return;
    const noteId = activeId.slice(5);
    // Source check: don't fire a no-op move if the user dropped onto the
    // current parent (would be a wasted API call + refresh churn).
    const located = library.findNote(noteId);
    if (!located) return;
    let target: NoteParent | null = null;
    if (overId.startsWith('way:')) {
      const wayId = overId.slice(4);
      if (located.topic === null && located.subtopic === null && located.subsubtopic === null && located.way.id === wayId) return; // already here
      target = { way_id: wayId };
    } else if (overId.startsWith('subsubtopic:')) {
      const subsubtopicId = overId.slice(12);
      if (located.subsubtopic?.id === subsubtopicId) return;
      target = { subsubtopic_id: subsubtopicId };
    } else if (overId.startsWith('subtopic:')) {
      const subtopicId = overId.slice(9);
      if (located.subsubtopic === null && located.subtopic?.id === subtopicId) return;
      target = { subtopic_id: subtopicId };
    } else if (overId.startsWith('topic:')) {
      const topicId = overId.slice(6);
      if (located.subtopic === null && located.subsubtopic === null && located.topic?.id === topicId) return;
      target = { topic_id: topicId };
    } else {
      return;
    }
    try {
      await notesApi.move(noteId, target);
      await library.refresh();
    } catch (err: any) {
      toast.error(err?.detail ?? err?.message ?? 'Failed to move note');
    }
  };

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-title">Notes</div>
        <div className="pane-sub">
          {ways.length} ways · {totalTopics} topics · {totalNotes} notes
        </div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {onSmartTestAll && (
          <button
            type="button"
            className="pane-ai-cta"
            onClick={onSmartTestAll}
            title="Pick notes and generate an AI quiz across them"
          >
            <Sparkles size={12} />
            <span>ai test</span>
          </button>
        )}
      </div>

      <div className="pane-body">
        <div className="pane-section">
          <div className="pane-section-label">
            Ways
            <button
              onClick={handleNewWay}
              title="New way"
              style={{
                float: 'right', background: 'transparent', border: 0,
                color: 'var(--ink-4)', cursor: 'pointer', padding: 0, marginRight: 4,
              }}
            ><Plus size={11} /></button>
          </div>

          {filteredWays.length === 0 && (
            <div style={{ padding: '8px 14px', fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>
              {q ? 'No matches' : 'No ways yet — click + to create one'}
            </div>
          )}

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {filteredWays.map((way) => {
            const wayOpen  = q ? true : expandedWays.has(way.id);
            const wayCount = way.notes.length + way.topics.reduce((a, t) => a + t.notes.length, 0);
            return (
              <div key={way.id}>
                <DropTarget id={`way:${way.id}`}>
                <div
                  className="lib-row tree-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleWay(way.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWay(way.id); } }}
                >
                  <span className={`tree-chev${wayOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                  <span className="name">{way.name}</span>
                  <span className="count">{wayCount}</span>
                  <span
                    className="row-action row-action--hover"
                    role="button"
                    tabIndex={0}
                    title="Rename way"
                    onClick={async (e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).blur();
                      const next = await promptRename(way.name, 'way');
                      if (next) void renameWay(way.id, next);
                    }}
                  ><Pencil size={11} /></span>
                  <span
                    className="row-action row-action--hover row-action--danger"
                    role="button"
                    tabIndex={0}
                    title="Delete way"
                    onClick={async (e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).blur();
                      if (await confirmDelete(way.name, 'way', 'All topics and notes inside it will be removed.')) {
                        void deleteWay(way.id);
                      }
                    }}
                  ><Trash2 size={11} /></span>
                  <RowAddMenu
                    title="Add to way"
                    items={[
                      { label: 'New note', icon: <FileText size={13} />, onClick: () => void handleNewNote({ way_id: way.id }) },
                      { label: 'New topic', icon: <FolderPlus size={13} />, onClick: () => void handleNewTopic(way.id) },
                    ]}
                  />
                </div>
                </DropTarget>

                {wayOpen && (
                  <>
                    {way.notes.map((note) => (
                      <NoteRow
                        key={note.id}
                        noteId={note.id}
                        noteName={note.name}
                        depth={1}
                        selected={selectedNoteId === note.id}
                        onSelect={() => onSelectNote(note.id)}
                        onRename={async (e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).blur();
                          const next = await promptRename(note.name || 'Untitled', 'note');
                          if (next) void renameNote(note.id, next);
                        }}
                        onDelete={async (e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).blur();
                          if (await confirmDelete(note.name || 'Untitled', 'note')) {
                            void deleteNote(note.id);
                          }
                        }}
                      />
                    ))}

                    {way.topics.map((topic) => {
                      const topicOpen = q ? true : expandedTopics.has(topic.id);
                      return (
                        <div key={topic.id}>
                          <DropTarget id={`topic:${topic.id}`}>
                          <div
                            className="lib-row tree-row"
                            data-depth="1"
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleTopic(topic.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTopic(topic.id); } }}
                          >
                            <span className={`tree-chev${topicOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                            <span className="name">{topic.name}</span>
                            <span className="count">{topicNoteCount(topic)}</span>
                            <span
                              className="row-action row-action--hover"
                              role="button"
                              tabIndex={0}
                              title="Rename topic"
                              onClick={async (e) => {
                                e.stopPropagation();
                                (e.currentTarget as HTMLElement).blur();
                                const next = await promptRename(topic.name, 'topic');
                                if (next) void renameTopic(topic.id, next);
                              }}
                            ><Pencil size={11} /></span>
                            <span
                              className="row-action row-action--hover row-action--danger"
                              role="button"
                              tabIndex={0}
                              title="Delete topic"
                              onClick={async (e) => {
                                e.stopPropagation();
                                (e.currentTarget as HTMLElement).blur();
                                if (await confirmDelete(topic.name, 'topic', 'All subtopics and notes inside it will be removed.')) {
                                  void deleteTopic(topic.id);
                                }
                              }}
                            ><Trash2 size={11} /></span>
                            <RowAddMenu
                              title="Add to topic"
                              items={[
                                { label: 'New note', icon: <FileText size={13} />, onClick: () => void handleNewNote({ topic_id: topic.id }) },
                                { label: 'New subtopic', icon: <FolderPlus size={13} />, onClick: () => void handleNewSubtopic(topic.id) },
                              ]}
                            />
                          </div>
                          </DropTarget>
                          {topicOpen && topic.notes.map((note) => (
                            <NoteRow
                              key={note.id}
                              noteId={note.id}
                              noteName={note.name}
                              depth={2}
                              selected={selectedNoteId === note.id}
                              onSelect={() => onSelectNote(note.id)}
                              onRename={async (e) => {
                                e.stopPropagation();
                                (e.currentTarget as HTMLElement).blur();
                                const next = await promptRename(note.name || 'Untitled', 'note');
                                if (next) void renameNote(note.id, next);
                              }}
                              onDelete={async (e) => {
                                e.stopPropagation();
                                (e.currentTarget as HTMLElement).blur();
                                if (await confirmDelete(note.name || 'Untitled', 'note')) {
                                  void deleteNote(note.id);
                                }
                              }}
                            />
                          ))}

                          {topicOpen && topic.subtopics.map((subtopic) => {
                            const subOpen = q ? true : expandedSubtopics.has(subtopic.id);
                            return (
                              <div key={subtopic.id}>
                                <DropTarget id={`subtopic:${subtopic.id}`}>
                                <div
                                  className="lib-row tree-row"
                                  data-depth="2"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => toggleSubtopic(subtopic.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSubtopic(subtopic.id); } }}
                                >
                                  <span className={`tree-chev${subOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                                  <span className="name">{subtopic.name}</span>
                                  <span className="count">{subtopicNoteCount(subtopic)}</span>
                                  <span
                                    className="row-action row-action--hover"
                                    role="button"
                                    tabIndex={0}
                                    title="Rename subtopic"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      (e.currentTarget as HTMLElement).blur();
                                      const next = await promptRename(subtopic.name, 'subtopic');
                                      if (next) void renameSubtopic(subtopic.id, next);
                                    }}
                                  ><Pencil size={11} /></span>
                                  <span
                                    className="row-action row-action--hover row-action--danger"
                                    role="button"
                                    tabIndex={0}
                                    title="Delete subtopic"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      (e.currentTarget as HTMLElement).blur();
                                      if (await confirmDelete(subtopic.name, 'subtopic', 'All subsubtopics and notes inside it will be removed.')) {
                                        void deleteSubtopic(subtopic.id);
                                      }
                                    }}
                                  ><Trash2 size={11} /></span>
                                  <RowAddMenu
                                    title="Add to subtopic"
                                    items={[
                                      { label: 'New note', icon: <FileText size={13} />, onClick: () => void handleNewNote({ subtopic_id: subtopic.id }) },
                                      { label: 'New subsubtopic', icon: <FolderPlus size={13} />, onClick: () => void handleNewSubsubtopic(subtopic.id) },
                                    ]}
                                  />
                                </div>
                                </DropTarget>
                                {subOpen && subtopic.notes.map((note) => (
                                  <NoteRow
                                    key={note.id}
                                    noteId={note.id}
                                    noteName={note.name}
                                    depth={3}
                                    selected={selectedNoteId === note.id}
                                    onSelect={() => onSelectNote(note.id)}
                                    onRename={async (e) => {
                                      e.stopPropagation();
                                      (e.currentTarget as HTMLElement).blur();
                                      const next = await promptRename(note.name || 'Untitled', 'note');
                                      if (next) void renameNote(note.id, next);
                                    }}
                                    onDelete={async (e) => {
                                      e.stopPropagation();
                                      (e.currentTarget as HTMLElement).blur();
                                      if (await confirmDelete(note.name || 'Untitled', 'note')) {
                                        void deleteNote(note.id);
                                      }
                                    }}
                                  />
                                ))}

                                {subOpen && subtopic.subsubtopics.map((subsubtopic) => {
                                  const ssOpen = q ? true : expandedSubsubtopics.has(subsubtopic.id);
                                  return (
                                    <div key={subsubtopic.id}>
                                      <DropTarget id={`subsubtopic:${subsubtopic.id}`}>
                                      <div
                                        className="lib-row tree-row"
                                        data-depth="3"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleSubsubtopic(subsubtopic.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSubsubtopic(subsubtopic.id); } }}
                                      >
                                        <span className={`tree-chev${ssOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                                        <span className="name">{subsubtopic.name}</span>
                                        <span className="count">{subsubtopic.notes.length}</span>
                                        <span
                                          className="row-action row-action--hover"
                                          role="button"
                                          tabIndex={0}
                                          title="Rename subsubtopic"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            (e.currentTarget as HTMLElement).blur();
                                            const next = await promptRename(subsubtopic.name, 'subsubtopic');
                                            if (next) void renameSubsubtopic(subsubtopic.id, next);
                                          }}
                                        ><Pencil size={11} /></span>
                                        <span
                                          className="row-action row-action--hover row-action--danger"
                                          role="button"
                                          tabIndex={0}
                                          title="Delete subsubtopic"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            (e.currentTarget as HTMLElement).blur();
                                            if (await confirmDelete(subsubtopic.name, 'subsubtopic', 'All notes inside it will be removed.')) {
                                              void deleteSubsubtopic(subsubtopic.id);
                                            }
                                          }}
                                        ><Trash2 size={11} /></span>
                                        <RowAddMenu
                                          title="New note"
                                          items={[
                                            { label: 'New note', icon: <FileText size={13} />, onClick: () => void handleNewNote({ subsubtopic_id: subsubtopic.id }) },
                                          ]}
                                        />
                                      </div>
                                      </DropTarget>
                                      {ssOpen && subsubtopic.notes.map((note) => (
                                        <NoteRow
                                          key={note.id}
                                          noteId={note.id}
                                          noteName={note.name}
                                          depth={4}
                                          selected={selectedNoteId === note.id}
                                          onSelect={() => onSelectNote(note.id)}
                                          onRename={async (e) => {
                                            e.stopPropagation();
                                            (e.currentTarget as HTMLElement).blur();
                                            const next = await promptRename(note.name || 'Untitled', 'note');
                                            if (next) void renameNote(note.id, next);
                                          }}
                                          onDelete={async (e) => {
                                            e.stopPropagation();
                                            (e.currentTarget as HTMLElement).blur();
                                            if (await confirmDelete(note.name || 'Untitled', 'note')) {
                                              void deleteNote(note.id);
                                            }
                                          }}
                                        />
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
          <DragOverlay>
            {dragName && (
              <div className="lib-row tree-row lib-row--drag-preview">
                <FileText size={12} className="tree-leaf-icon" />
                <span className="name">{dragName || 'Untitled'}</span>
              </div>
            )}
          </DragOverlay>
          </DndContext>
        </div>
      </div>
    </aside>
  );
}

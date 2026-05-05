import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, FileText, Folder, FolderOpen, Plus, Search,
  MoreHorizontal, Trash2, Edit3, FilePlus, FolderPlus,
} from 'lucide-react';
import type { Note, Topic, Way } from '../../../api/types';
import { Input, IconButton, Dropdown, MenuItem, MenuSeparator, Tooltip } from '../../ui';

interface Props {
  ways: Way[];
  selectedNoteId: string | null;
  onSelectNote: (note: Note, way: Way, topic: Topic | null) => void;
  onCreateWay: () => void;
  onCreateTopic: (wayId: string) => void;
  onCreateNote: (wayId: string, topicId: string | null) => void;
  onRenameWay: (id: string, name: string) => void;
  onRenameTopic: (id: string, name: string) => void;
  onRenameNote: (id: string, name: string) => void;
  onDeleteWay: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

export function Library({
  ways, selectedNoteId, onSelectNote, onCreateWay, onCreateTopic, onCreateNote,
  onRenameWay, onRenameTopic, onRenameNote, onDeleteWay, onDeleteTopic, onDeleteNote,
}: Props) {
  const [expandedWays, setExpandedWays] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('jarvnote:notes:expandedWays:v4');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('jarvnote:notes:expandedTopics:v4');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    localStorage.setItem('jarvnote:notes:expandedWays:v4', JSON.stringify([...expandedWays]));
  }, [expandedWays]);
  useEffect(() => {
    localStorage.setItem('jarvnote:notes:expandedTopics:v4', JSON.stringify([...expandedTopics]));
  }, [expandedTopics]);

  const toggleWay = (id: string) => setExpandedWays((s) => {
    const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleTopic = (id: string) => setExpandedTopics((s) => {
    const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const beginRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };
  const commitRename = (kind: 'way' | 'topic' | 'note', id: string) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    if (kind === 'way') onRenameWay(id, name);
    else if (kind === 'topic') onRenameTopic(id, name);
    else onRenameNote(id, name);
    setRenamingId(null);
  };

  const f = filter.trim().toLowerCase();
  const filteredWays = useMemo(() => {
    if (!f) return ways;
    return ways
      .map((w) => {
        const wayMatch = w.name.toLowerCase().includes(f);
        const topics = w.topics
          .map((t) => {
            const tMatch = t.name.toLowerCase().includes(f);
            const notes = t.notes.filter((n) => n.name.toLowerCase().includes(f));
            return tMatch || notes.length ? { ...t, notes } : null;
          })
          .filter(Boolean) as Topic[];
        const directNotes = w.notes.filter((n) => n.name.toLowerCase().includes(f));
        if (wayMatch || topics.length || directNotes.length) {
          return { ...w, topics, notes: directNotes };
        }
        return null;
      })
      .filter(Boolean) as Way[];
  }, [ways, f]);

  return (
    <aside className="notes-pane" data-side="left">
      <header className="notes-pane-head">
        <span className="notes-pane-title">Library</span>
        <Tooltip content="New way" side="bottom">
          <IconButton size="sm" onClick={onCreateWay} aria-label="New way">
            <Plus size={14} />
          </IconButton>
        </Tooltip>
      </header>
      <div className="notes-pane-search">
        <Input
          inputSize="sm"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          leadingIcon={<Search size={11} className="text-[var(--fg-faint)]" />}
        />
      </div>
      <div className="notes-pane-body">
        {filteredWays.length === 0 ? (
          <div className="lib-empty">{f ? 'Nothing matches' : 'No ways yet'}</div>
        ) : null}

        {filteredWays.map((w) => {
          const wayOpen = expandedWays.has(w.id) || !!f;
          return (
            <div key={w.id} className="lib-section">
              <div
                className="lib-row"
                data-expanded={wayOpen || undefined}
                onClick={() => toggleWay(w.id)}
                onDoubleClick={() => beginRename(w.id, w.name)}
              >
                <span className="lib-twist"><ChevronRight size={12} /></span>
                {wayOpen
                  ? <FolderOpen className="lib-icon" />
                  : <Folder className="lib-icon" />}
                {renamingId === w.id ? (
                  <input
                    autoFocus
                    className="lib-rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename('way', w.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename('way', w.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="lib-label">{w.name}</span>
                )}
                <span className="lib-actions" onClick={(e) => e.stopPropagation()}>
                  <Dropdown
                    trigger={<IconButton size="sm" aria-label="Way actions"><MoreHorizontal size={12} /></IconButton>}
                  >
                    <MenuItem icon={<FolderPlus size={12} />} onSelect={() => onCreateTopic(w.id)}>New topic</MenuItem>
                    <MenuItem icon={<FilePlus size={12} />} onSelect={() => onCreateNote(w.id, null)}>New note</MenuItem>
                    <MenuItem icon={<Edit3 size={12} />} onSelect={() => beginRename(w.id, w.name)}>Rename</MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={() => onDeleteWay(w.id)}>Delete way</MenuItem>
                  </Dropdown>
                </span>
              </div>

              {wayOpen && (
                <div className="lib-children">
                  {w.topics.map((t) => {
                    const tOpen = expandedTopics.has(t.id) || !!f;
                    return (
                      <div key={t.id}>
                        <div
                          className="lib-row"
                          data-expanded={tOpen || undefined}
                          onClick={() => toggleTopic(t.id)}
                          onDoubleClick={() => beginRename(t.id, t.name)}
                        >
                          <span className="lib-twist"><ChevronRight size={12} /></span>
                          <Folder className="lib-icon" />
                          {renamingId === t.id ? (
                            <input
                              autoFocus
                              className="lib-rename"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => commitRename('topic', t.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename('topic', t.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="lib-label">{t.name}</span>
                          )}
                          <span className="lib-count">{t.notes.length}</span>
                          <span className="lib-actions" onClick={(e) => e.stopPropagation()}>
                            <Dropdown trigger={<IconButton size="sm" aria-label="Topic actions"><MoreHorizontal size={12} /></IconButton>}>
                              <MenuItem icon={<FilePlus size={12} />} onSelect={() => onCreateNote(w.id, t.id)}>New note</MenuItem>
                              <MenuItem icon={<Edit3 size={12} />} onSelect={() => beginRename(t.id, t.name)}>Rename</MenuItem>
                              <MenuSeparator />
                              <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={() => onDeleteTopic(t.id)}>Delete topic</MenuItem>
                            </Dropdown>
                          </span>
                        </div>
                        {tOpen && (
                          <div className="lib-children">
                            {t.notes.map((n) => (
                              <NoteRow
                                key={n.id}
                                note={n}
                                active={n.id === selectedNoteId}
                                onSelect={() => onSelectNote(n, w, t)}
                                onRename={() => beginRename(n.id, n.name)}
                                onDelete={() => onDeleteNote(n.id)}
                                renaming={renamingId === n.id}
                                renameValue={renameValue}
                                onRenameChange={setRenameValue}
                                onRenameCommit={() => commitRename('note', n.id)}
                                onRenameCancel={() => setRenamingId(null)}
                              />
                            ))}
                            {t.notes.length === 0 && (
                              <div className="lib-empty" style={{ padding: '6px 8px' }}>Empty</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {w.notes.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      active={n.id === selectedNoteId}
                      onSelect={() => onSelectNote(n, w, null)}
                      onRename={() => beginRename(n.id, n.name)}
                      onDelete={() => onDeleteNote(n.id)}
                      renaming={renamingId === n.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={() => commitRename('note', n.id)}
                      onRenameCancel={() => setRenamingId(null)}
                    />
                  ))}

                  {w.topics.length === 0 && w.notes.length === 0 && (
                    <div className="lib-empty">No content</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

interface NoteRowProps {
  note: Note;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

function NoteRow({
  note, active, onSelect, onRename, onDelete,
  renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel,
}: NoteRowProps) {
  return (
    <div
      className="lib-row"
      data-active={active || undefined}
      onClick={onSelect}
      onDoubleClick={onRename}
    >
      <span className="lib-twist" />
      <FileText className="lib-icon" />
      {renaming ? (
        <input
          autoFocus
          className="lib-rename"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="lib-label">{note.name || 'Untitled'}</span>
      )}
      <span className="lib-actions" onClick={(e) => e.stopPropagation()}>
        <Dropdown trigger={<IconButton size="sm" aria-label="Note actions"><MoreHorizontal size={12} /></IconButton>}>
          <MenuItem icon={<Edit3 size={12} />} onSelect={onRename}>Rename</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={onDelete}>Delete note</MenuItem>
        </Dropdown>
      </span>
    </div>
  );
}

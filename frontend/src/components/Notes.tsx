import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderPlus,
  FilePlus,
  Save,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';

interface NoteFile {
  id: string;
  name: string;
  content: string;
}

interface NoteFolder {
  id: string;
  name: string;
  files: NoteFile[];
  note?: NoteFile;
}

interface NoteArea {
  id: string;
  name: string;
  folders: NoteFolder[];
  note?: NoteFile;
}

type SelectionType =
  | { type: 'file'; areaId: string; folderId: string; fileId: string }
  | { type: 'folder-note'; areaId: string; folderId: string }
  | { type: 'area-note'; areaId: string };

const initialAreas: NoteArea[] = [
  {
    id: 'career',
    name: 'Career',
    folders: [
      {
        id: 'ml',
        name: 'ML',
        files: [
          { id: 'pytorch', name: 'PyTorch', content: '<p>Neural networks and deep learning frameworks...</p>' },
          { id: 'pandas', name: 'Pandas', content: '<p>Data manipulation and analysis with Python...</p>' },
        ],
      },
      {
        id: 'de',
        name: 'DE',
        files: [
          { id: 'postgres', name: 'Postgres', content: '<p>Relational database management and SQL queries...</p>' },
          { id: 'trino', name: 'Trino', content: '<p>Distributed SQL query engine for big data...</p>' },
        ],
      },
    ],
  },
  {
    id: 'science',
    name: 'Science',
    folders: [
      {
        id: 'physics',
        name: 'Physics',
        files: [{ id: 'quantum', name: 'Quantum Mechanics', content: '' }],
      },
      {
        id: 'math',
        name: 'Mathematics',
        files: [
          { id: 'calculus', name: 'Calculus', content: '' },
          { id: 'linear-algebra', name: 'Linear Algebra', content: '' },
        ],
      },
    ],
  },
  {
    id: 'eq',
    name: 'EQ',
    folders: [
      {
        id: 'communication',
        name: 'Communication',
        files: [{ id: 'active-listening', name: 'Active Listening', content: '' }],
      },
      {
        id: 'leadership',
        name: 'Leadership',
        files: [{ id: 'team-management', name: 'Team Management', content: '' }],
      },
    ],
  },
];

type AddingState =
  | { kind: 'way' }
  | { kind: 'folder'; areaId: string }
  | { kind: 'file'; areaId: string; folderId: string }
  | { kind: 'area-note'; areaId: string }
  | { kind: 'folder-note'; areaId: string; folderId: string }
  | null;

type RenamingState =
  | { kind: 'way'; areaId: string }
  | { kind: 'folder'; areaId: string; folderId: string }
  | { kind: 'file'; areaId: string; folderId: string; fileId: string }
  | null;

export default function Notes() {
  const [areas, setAreas] = useState<NoteArea[]>(initialAreas);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set(['career']));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['ml']));
  const [selection, setSelection] = useState<SelectionType | null>({
    type: 'file',
    areaId: 'career',
    folderId: 'ml',
    fileId: 'pytorch',
  });

  const [adding, setAdding] = useState<AddingState>(null);
  const [newItemName, setNewItemName] = useState('');
  const [renaming, setRenaming] = useState<RenamingState>(null);
  const [renameValue, setRenameValue] = useState('');

  const toggleArea = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      next.has(areaId) ? next.delete(areaId) : next.add(areaId);
      return next;
    });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  // ── ADD ──────────────────────────────────────────────────────────────────
  const commitAdd = () => {
    if (!newItemName.trim() || !adding) { cancelAdd(); return; }
    const name = newItemName.trim();
    const id = Date.now().toString();

    if (adding.kind === 'way') {
      setAreas((prev) => [...prev, { id, name, folders: [] }]);
    } else if (adding.kind === 'folder') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === adding.areaId ? { ...a, folders: [...a.folders, { id, name, files: [] }] } : a
        )
      );
      setExpandedAreas((prev) => new Set([...prev, adding.areaId]));
    } else if (adding.kind === 'file') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === adding.areaId
            ? {
                ...a,
                folders: a.folders.map((f) =>
                  f.id === adding.folderId
                    ? { ...f, files: [...f.files, { id, name, content: '' }] }
                    : f
                ),
              }
            : a
        )
      );
      setExpandedFolders((prev) => new Set([...prev, adding.folderId]));
    } else if (adding.kind === 'area-note') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === adding.areaId ? { ...a, note: { id, name, content: '' } } : a
        )
      );
      setSelection({ type: 'area-note', areaId: adding.areaId });
    } else if (adding.kind === 'folder-note') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === adding.areaId
            ? {
                ...a,
                folders: a.folders.map((f) =>
                  f.id === adding.folderId ? { ...f, note: { id, name, content: '' } } : f
                ),
              }
            : a
        )
      );
      setSelection({ type: 'folder-note', areaId: adding.areaId, folderId: adding.folderId });
    }
    cancelAdd();
  };

  const cancelAdd = () => {
    setAdding(null);
    setNewItemName('');
  };

  // ── DELETE ───────────────────────────────────────────────────────────────
  const deleteWay = (areaId: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== areaId));
    if (selection && 'areaId' in selection && selection.areaId === areaId) setSelection(null);
    toast.success('Way deleted');
  };

  const deleteFolder = (areaId: string, folderId: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === areaId ? { ...a, folders: a.folders.filter((f) => f.id !== folderId) } : a))
    );
    if (selection && 'folderId' in selection && selection.areaId === areaId && selection.folderId === folderId)
      setSelection(null);
    toast.success('Topic deleted');
  };

  const deleteFile = (areaId: string, folderId: string, fileId: string) => {
    setAreas((prev) =>
      prev.map((a) =>
        a.id === areaId
          ? {
              ...a,
              folders: a.folders.map((f) =>
                f.id === folderId ? { ...f, files: f.files.filter((fi) => fi.id !== fileId) } : f
              ),
            }
          : a
      )
    );
    if (selection?.type === 'file' && selection.fileId === fileId) setSelection(null);
    toast.success('Note deleted');
  };

  const deleteAreaNote = (areaId: string) => {
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, note: undefined } : a)));
    if (selection?.type === 'area-note' && selection.areaId === areaId) setSelection(null);
    toast.success('Note deleted');
  };

  const deleteFolderNote = (areaId: string, folderId: string) => {
    setAreas((prev) =>
      prev.map((a) =>
        a.id === areaId
          ? { ...a, folders: a.folders.map((f) => (f.id === folderId ? { ...f, note: undefined } : f)) }
          : a
      )
    );
    if (selection?.type === 'folder-note' && selection.folderId === folderId) setSelection(null);
    toast.success('Note deleted');
  };

  // ── RENAME ───────────────────────────────────────────────────────────────
  const startRename = (state: RenamingState, currentName: string) => {
    setRenaming(state);
    setRenameValue(currentName);
  };

  const commitRename = () => {
    if (!renameValue.trim() || !renaming) { cancelRename(); return; }
    const name = renameValue.trim();

    if (renaming.kind === 'way') {
      setAreas((prev) => prev.map((a) => (a.id === renaming.areaId ? { ...a, name } : a)));
    } else if (renaming.kind === 'folder') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === renaming.areaId
            ? { ...a, folders: a.folders.map((f) => (f.id === renaming.folderId ? { ...f, name } : f)) }
            : a
        )
      );
    } else if (renaming.kind === 'file') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === renaming.areaId
            ? {
                ...a,
                folders: a.folders.map((f) =>
                  f.id === renaming.folderId
                    ? { ...f, files: f.files.map((fi) => (fi.id === renaming.fileId ? { ...fi, name } : fi)) }
                    : f
                ),
              }
            : a
        )
      );
    }
    cancelRename();
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue('');
  };

  // ── CONTENT UPDATE ────────────────────────────────────────────────────────
  const updateContent = (content: string) => {
    if (!selection) return;

    if (selection.type === 'file') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === selection.areaId
            ? {
                ...a,
                folders: a.folders.map((f) =>
                  f.id === selection.folderId
                    ? { ...f, files: f.files.map((fi) => (fi.id === selection.fileId ? { ...fi, content } : fi)) }
                    : f
                ),
              }
            : a
        )
      );
    } else if (selection.type === 'area-note') {
      setAreas((prev) =>
        prev.map((a) => (a.id === selection.areaId && a.note ? { ...a, note: { ...a.note, content } } : a))
      );
    } else if (selection.type === 'folder-note') {
      setAreas((prev) =>
        prev.map((a) =>
          a.id === selection.areaId
            ? {
                ...a,
                folders: a.folders.map((f) =>
                  f.id === selection.folderId && f.note ? { ...f, note: { ...f.note, content } } : f
                ),
              }
            : a
        )
      );
    }
  };

  // ── GET CURRENT NOTE ──────────────────────────────────────────────────────
  const getCurrentNote = (): { name: string; content: string } | null => {
    if (!selection) return null;
    if (selection.type === 'file') {
      const area = areas.find((a) => a.id === selection.areaId);
      const folder = area?.folders.find((f) => f.id === selection.folderId);
      const file = folder?.files.find((fi) => fi.id === selection.fileId);
      return file ? { name: file.name, content: file.content } : null;
    }
    if (selection.type === 'area-note') {
      const area = areas.find((a) => a.id === selection.areaId);
      return area?.note ? { name: area.note.name, content: area.note.content } : null;
    }
    if (selection.type === 'folder-note') {
      const area = areas.find((a) => a.id === selection.areaId);
      const folder = area?.folders.find((f) => f.id === selection.folderId);
      return folder?.note ? { name: folder.note.name, content: folder.note.content } : null;
    }
    return null;
  };

  const currentNote = getCurrentNote();

  // ── HELPERS ───────────────────────────────────────────────────────────────
  const InlineInput = ({ placeholder, onCommit, onCancel }: { placeholder: string; onCommit: () => void; onCancel: () => void }) => (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        type="text"
        placeholder={placeholder}
        value={newItemName}
        onChange={(e) => setNewItemName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => { if (newItemName.trim()) onCommit(); else onCancel(); }}
        className="flex-1 px-2 py-1 bg-input-background rounded border-0 focus:outline-none focus:ring-2 focus:ring-sidebar-ring text-sm"
        autoFocus
      />
    </div>
  );

  const RenameInput = ({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) => (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        type="text"
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => { if (renameValue.trim()) onCommit(); else onCancel(); }}
        className="flex-1 px-2 py-1 bg-input-background rounded border-0 focus:outline-none focus:ring-2 focus:ring-sidebar-ring text-sm"
        autoFocus
      />
    </div>
  );

  const IconBtn = ({
    icon: Icon,
    onClick,
    title,
    size = 12,
  }: {
    icon: React.ElementType;
    onClick: (e: React.MouseEvent) => void;
    title: string;
    size?: number;
  }) => (
    <div
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground rounded transition-all cursor-pointer flex-shrink-0"
    >
      <Icon size={size} />
    </div>
  );

  return (
    <div className="size-full flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-border flex flex-col bg-sidebar">
        <div className="px-4 py-4 border-b border-sidebar-border flex items-center justify-between">
          <h3 className="text-sidebar-foreground">Knowledge Base</h3>
          <button
            onClick={() => { setAdding({ kind: 'way' }); setNewItemName(''); }}
            title="Add way"
            className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {adding?.kind === 'way' && (
            <InlineInput placeholder="Way name" onCommit={commitAdd} onCancel={cancelAdd} />
          )}

          {areas.map((area) => (
            <div key={area.id} className="mb-1">
              {renaming?.kind === 'way' && renaming.areaId === area.id ? (
                <RenameInput onCommit={commitRename} onCancel={cancelRename} />
              ) : (
                <button
                  onClick={() => toggleArea(area.id)}
                  className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
                >
                  {expandedAreas.has(area.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 text-left text-sm font-medium">{area.name}</span>
                  <IconBtn icon={FilePlus} size={13} title="Add note to way" onClick={() => {
                    if (!area.note) { setAdding({ kind: 'area-note', areaId: area.id }); setNewItemName(''); }
                    else { setSelection({ type: 'area-note', areaId: area.id }); }
                    setExpandedAreas((p) => new Set([...p, area.id]));
                  }} />
                  <IconBtn icon={FolderPlus} size={13} title="Add topic" onClick={() => {
                    setAdding({ kind: 'folder', areaId: area.id }); setNewItemName('');
                    setExpandedAreas((p) => new Set([...p, area.id]));
                  }} />
                  <IconBtn icon={Pencil} size={13} title="Rename way" onClick={() => startRename({ kind: 'way', areaId: area.id }, area.name)} />
                  <IconBtn icon={Trash2} size={13} title="Delete way" onClick={() => deleteWay(area.id)} />
                </button>
              )}

              <AnimatePresence>
                {expandedAreas.has(area.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="ml-4 overflow-hidden"
                  >
                    {adding?.kind === 'area-note' && adding.areaId === area.id && (
                      <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                    )}
                    {area.note && (
                      <button
                        onClick={() => setSelection({ type: 'area-note', areaId: area.id })}
                        className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                          selection?.type === 'area-note' && selection.areaId === area.id
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'hover:bg-sidebar-accent text-sidebar-accent-foreground'
                        }`}
                      >
                        <File size={13} />
                        <span className="flex-1 text-left truncate text-sm italic">{area.note.name}</span>
                        <IconBtn icon={Trash2} size={11} title="Delete note" onClick={() => deleteAreaNote(area.id)} />
                      </button>
                    )}

                    {area.folders.map((folder) => (
                      <div key={folder.id} className="mb-1">
                        {renaming?.kind === 'folder' && renaming.areaId === area.id && renaming.folderId === folder.id ? (
                          <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <button
                            onClick={() => toggleFolder(folder.id)}
                            className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-accent-foreground transition-colors"
                          >
                            {expandedFolders.has(folder.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Folder size={13} />
                            <span className="flex-1 text-left text-sm">{folder.name}</span>
                            <IconBtn icon={FilePlus} size={12} title="Add note to topic" onClick={() => {
                              if (!folder.note) { setAdding({ kind: 'folder-note', areaId: area.id, folderId: folder.id }); setNewItemName(''); }
                              else setSelection({ type: 'folder-note', areaId: area.id, folderId: folder.id });
                              setExpandedFolders((p) => new Set([...p, folder.id]));
                            }} />
                            <IconBtn icon={Plus} size={12} title="Add note file" onClick={() => {
                              setAdding({ kind: 'file', areaId: area.id, folderId: folder.id }); setNewItemName('');
                              setExpandedFolders((p) => new Set([...p, folder.id]));
                            }} />
                            <IconBtn icon={Pencil} size={12} title="Rename topic" onClick={() => startRename({ kind: 'folder', areaId: area.id, folderId: folder.id }, folder.name)} />
                            <IconBtn icon={Trash2} size={12} title="Delete topic" onClick={() => deleteFolder(area.id, folder.id)} />
                          </button>
                        )}

                        <AnimatePresence>
                          {expandedFolders.has(folder.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="ml-4 overflow-hidden"
                            >
                              {adding?.kind === 'folder-note' && adding.areaId === area.id && adding.folderId === folder.id && (
                                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                              )}
                              {folder.note && (
                                <button
                                  onClick={() => setSelection({ type: 'folder-note', areaId: area.id, folderId: folder.id })}
                                  className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                                    selection?.type === 'folder-note' && selection.areaId === area.id && selection.folderId === folder.id
                                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                      : 'hover:bg-sidebar-accent text-sidebar-accent-foreground'
                                  }`}
                                >
                                  <File size={13} />
                                  <span className="flex-1 text-left truncate text-sm italic">{folder.note.name}</span>
                                  <IconBtn icon={Trash2} size={11} title="Delete note" onClick={() => deleteFolderNote(area.id, folder.id)} />
                                </button>
                              )}

                              {folder.files.map((file) => (
                                <div key={file.id}>
                                  {renaming?.kind === 'file' && renaming.areaId === area.id && renaming.folderId === folder.id && renaming.fileId === file.id ? (
                                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                                  ) : (
                                    <button
                                      onClick={() => setSelection({ type: 'file', areaId: area.id, folderId: folder.id, fileId: file.id })}
                                      className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                                        selection?.type === 'file' && selection.fileId === file.id
                                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                          : 'hover:bg-sidebar-accent text-sidebar-accent-foreground'
                                      }`}
                                    >
                                      <File size={13} />
                                      <span className="flex-1 text-left truncate text-sm">{file.name}</span>
                                      <IconBtn icon={Pencil} size={11} title="Rename note" onClick={() => startRename({ kind: 'file', areaId: area.id, folderId: folder.id, fileId: file.id }, file.name)} />
                                      <IconBtn icon={Trash2} size={11} title="Delete note" onClick={() => deleteFile(area.id, folder.id, file.id)} />
                                    </button>
                                  )}
                                </div>
                              ))}

                              {adding?.kind === 'file' && adding.areaId === area.id && adding.folderId === folder.id && (
                                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}

                    {adding?.kind === 'folder' && adding.areaId === area.id && (
                      <InlineInput placeholder="Topic name" onCommit={commitAdd} onCancel={cancelAdd} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentNote ? (
          <div className="flex-1 flex flex-col">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-background/80 backdrop-blur-sm">
              <h2 className="text-foreground tracking-tight">{currentNote.name}</h2>
              <button
                onClick={() => toast.success('File saved successfully')}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                <Save size={18} />
                Save
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-8 bg-[#fafaf9] dark:bg-[#18181b]">
              <div className="max-w-4xl mx-auto bg-background rounded-2xl shadow-sm border border-border/50 px-12 py-10">
                <RichTextEditor
                  content={currentNote.content}
                  onChange={updateContent}
                  onAddPhoto={() => {}}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a note to start editing
          </div>
        )}
      </div>
    </div>
  );
}

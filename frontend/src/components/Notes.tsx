import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronDown, File, Folder, Image as ImageIcon, FolderPlus, FilePlus, X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface NoteFile {
  id: string;
  name: string;
  content: string;
  images: string[];
}

interface NoteFolder {
  id: string;
  name: string;
  files: NoteFile[];
}

interface NoteArea {
  id: string;
  name: string;
  folders: NoteFolder[];
}

const initialAreas: NoteArea[] = [
  {
    id: 'career',
    name: 'Career',
    folders: [
      {
        id: 'ml',
        name: 'ML',
        files: [
          { id: 'pytorch', name: 'PyTorch', content: 'Neural networks and deep learning frameworks...', images: [] },
          { id: 'pandas', name: 'Pandas', content: 'Data manipulation and analysis with Python...', images: [] },
        ],
      },
      {
        id: 'de',
        name: 'DE',
        files: [
          { id: 'postgres', name: 'Postgres', content: 'Relational database management and SQL queries...', images: [] },
          { id: 'trino', name: 'Trino', content: 'Distributed SQL query engine for big data...', images: [] },
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
        files: [
          { id: 'quantum', name: 'Quantum Mechanics', content: '', images: [] },
        ],
      },
      {
        id: 'math',
        name: 'Mathematics',
        files: [
          { id: 'calculus', name: 'Calculus', content: '', images: [] },
          { id: 'linear-algebra', name: 'Linear Algebra', content: '', images: [] },
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
        files: [
          { id: 'active-listening', name: 'Active Listening', content: '', images: [] },
        ],
      },
      {
        id: 'leadership',
        name: 'Leadership',
        files: [
          { id: 'team-management', name: 'Team Management', content: '', images: [] },
        ],
      },
    ],
  },
];

export default function Notes() {
  const [areas, setAreas] = useState<NoteArea[]>(initialAreas);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set(['career']));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['ml']));
  const [selectedFile, setSelectedFile] = useState<{ areaId: string; folderId: string; fileId: string } | null>({
    areaId: 'career',
    folderId: 'ml',
    fileId: 'pytorch',
  });
  const [isAddingFolder, setIsAddingFolder] = useState<string | null>(null);
  const [isAddingFile, setIsAddingFile] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleArea = (areaId: string) => {
    const newExpanded = new Set(expandedAreas);
    if (newExpanded.has(areaId)) {
      newExpanded.delete(areaId);
    } else {
      newExpanded.add(areaId);
    }
    setExpandedAreas(newExpanded);
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const addFolder = (areaId: string) => {
    if (!newItemName.trim()) return;
    setAreas(
      areas.map((area) =>
        area.id === areaId
          ? {
              ...area,
              folders: [...area.folders, { id: Date.now().toString(), name: newItemName, files: [] }],
            }
          : area
      )
    );
    setNewItemName('');
    setIsAddingFolder(null);
  };

  const addFile = (areaId: string, folderId: string) => {
    if (!newItemName.trim()) return;
    setAreas(
      areas.map((area) =>
        area.id === areaId
          ? {
              ...area,
              folders: area.folders.map((folder) =>
                folder.id === folderId
                  ? {
                      ...folder,
                      files: [...folder.files, { id: Date.now().toString(), name: newItemName, content: '', images: [] }],
                    }
                  : folder
              ),
            }
          : area
      )
    );
    setNewItemName('');
    setIsAddingFile(null);
  };

  const updateFileContent = (content: string) => {
    if (!selectedFile) return;
    setAreas(
      areas.map((area) =>
        area.id === selectedFile.areaId
          ? {
              ...area,
              folders: area.folders.map((folder) =>
                folder.id === selectedFile.folderId
                  ? {
                      ...folder,
                      files: folder.files.map((file) =>
                        file.id === selectedFile.fileId ? { ...file, content } : file
                      ),
                    }
                  : folder
              ),
            }
          : area
      )
    );
  };

  const handleAddPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFile) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setAreas(
        areas.map((area) =>
          area.id === selectedFile.areaId
            ? {
                ...area,
                folders: area.folders.map((folder) =>
                  folder.id === selectedFile.folderId
                    ? {
                        ...folder,
                        files: folder.files.map((file) =>
                          file.id === selectedFile.fileId
                            ? { ...file, images: [...file.images, imageUrl] }
                            : file
                        ),
                      }
                    : folder
                ),
              }
            : area
        )
      );
      toast.success('Photo added');
    };
    reader.readAsDataURL(file);

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    toast.success('File saved successfully');
  };

  const removeImageFromFile = (imageUrl: string) => {
    if (!selectedFile) return;
    setAreas(
      areas.map((area) =>
        area.id === selectedFile.areaId
          ? {
              ...area,
              folders: area.folders.map((folder) =>
                folder.id === selectedFile.folderId
                  ? {
                      ...folder,
                      files: folder.files.map((file) =>
                        file.id === selectedFile.fileId
                          ? { ...file, images: file.images.filter((img) => img !== imageUrl) }
                          : file
                      ),
                    }
                  : folder
              ),
            }
          : area
      )
    );
  };

  const getCurrentFile = (): NoteFile | null => {
    if (!selectedFile) return null;
    const area = areas.find((a) => a.id === selectedFile.areaId);
    if (!area) return null;
    const folder = area.folders.find((f) => f.id === selectedFile.folderId);
    if (!folder) return null;
    return folder.files.find((f) => f.id === selectedFile.fileId) || null;
  };

  const currentFile = getCurrentFile();

  return (
    <div className="size-full flex">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Sidebar */}
      <div className="w-72 border-r border-border flex flex-col bg-sidebar">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <h3 className="text-sidebar-foreground">Knowledge Base</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {areas.map((area) => (
            <div key={area.id} className="mb-1">
              {/* Area */}
              <button
                onClick={() => toggleArea(area.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
              >
                {expandedAreas.has(area.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="flex-1 text-left">{area.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingFolder(area.id);
                  }}
                  className="p-1 opacity-0 hover:opacity-100 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground rounded transition-all"
                >
                  <FolderPlus size={14} />
                </button>
              </button>

              {/* Folders */}
              <AnimatePresence>
                {expandedAreas.has(area.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="ml-4 overflow-hidden"
                  >
                    {area.folders.map((folder) => (
                      <div key={folder.id} className="mb-1">
                        <button
                          onClick={() => toggleFolder(folder.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-accent-foreground transition-colors"
                        >
                          {expandedFolders.has(folder.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Folder size={14} />
                          <span className="flex-1 text-left">{folder.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsAddingFile(`${area.id}-${folder.id}`);
                            }}
                            className="p-1 opacity-0 hover:opacity-100 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground rounded transition-all"
                          >
                            <FilePlus size={12} />
                          </button>
                        </button>

                        {/* Files */}
                        <AnimatePresence>
                          {expandedFolders.has(folder.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="ml-4 overflow-hidden"
                            >
                              {folder.files.map((file) => (
                                <button
                                  key={file.id}
                                  onClick={() => setSelectedFile({ areaId: area.id, folderId: folder.id, fileId: file.id })}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                                    selectedFile?.fileId === file.id
                                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                      : 'hover:bg-sidebar-accent text-sidebar-accent-foreground'
                                  }`}
                                >
                                  <File size={14} />
                                  <span className="flex-1 text-left truncate">{file.name}</span>
                                </button>
                              ))}

                              {/* Add File Input */}
                              {isAddingFile === `${area.id}-${folder.id}` && (
                                <div className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    placeholder="File name"
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') addFile(area.id, folder.id);
                                      if (e.key === 'Escape') setIsAddingFile(null);
                                    }}
                                    onBlur={() => {
                                      if (newItemName.trim()) addFile(area.id, folder.id);
                                      else setIsAddingFile(null);
                                    }}
                                    className="w-full px-2 py-1 bg-input-background rounded border-0 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
                                    autoFocus
                                  />
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}

                    {/* Add Folder Input */}
                    {isAddingFolder === area.id && (
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          placeholder="Folder name"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addFolder(area.id);
                            if (e.key === 'Escape') setIsAddingFolder(null);
                          }}
                          onBlur={() => {
                            if (newItemName.trim()) addFolder(area.id);
                            else setIsAddingFolder(null);
                          }}
                          className="w-full px-2 py-1 bg-input-background rounded border-0 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
                          autoFocus
                        />
                      </div>
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
        {currentFile ? (
          <div className="flex-1 flex flex-col">
            {/* File Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-foreground">{currentFile.name}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddPhoto}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-accent transition-colors"
                >
                  <ImageIcon size={18} />
                  Add Photo
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  <Save size={18} />
                  Save
                </button>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-4xl">
                <textarea
                  value={currentFile.content}
                  onChange={(e) => updateFileContent(e.target.value)}
                  placeholder="Start writing..."
                  className="w-full min-h-64 px-0 py-0 bg-transparent border-0 focus:outline-none resize-none placeholder:text-muted-foreground"
                />

                {/* Images */}
                {currentFile.images.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {currentFile.images.map((imageUrl, index) => (
                      <div key={index} className="relative group rounded-lg overflow-hidden">
                        <img src={imageUrl} alt="" className="w-full h-64 object-cover" />
                        <button
                          onClick={() => removeImageFromFile(imageUrl)}
                          className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a file to start editing
          </div>
        )}
      </div>
    </div>
  );
}

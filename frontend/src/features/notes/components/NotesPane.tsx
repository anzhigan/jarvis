import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Filter, ArrowDownAZ, FolderTree, Folder, FileText, Pin,
  ChevronRight, PanelLeftClose,
} from 'lucide-react';
import type { NotesLibrary } from '../hooks/useNotesLibrary';
import type { Way } from '../../../api/types';

const EXP_WAYS_KEY    = 'jarvnote:notes:expandedWays';
const EXP_TOPICS_KEY  = 'jarvnote:notes:expandedTopics';

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(raw.split(',').filter(Boolean));
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
  onCollapseToggle: () => void;
}

export function NotesPane({ library, selectedNoteId, collapsed, onSelectNote, onCollapseToggle }: Props) {
  const { ways, pinnedNotes, createWay } = library;
  const [expandedWays, setExpandedWays] = useState<Set<string>>(readSet(EXP_WAYS_KEY));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(readSet(EXP_TOPICS_KEY));
  const [search, setSearch] = useState('');

  useEffect(() => { writeSet(EXP_WAYS_KEY, expandedWays); }, [expandedWays]);
  useEffect(() => { writeSet(EXP_TOPICS_KEY, expandedTopics); }, [expandedTopics]);

  // Auto-expand the way/topic that contains the selected note.
  useEffect(() => {
    if (!selectedNoteId) return;
    const located = library.findNote(selectedNoteId);
    if (!located) return;
    setExpandedWays((prev) => prev.has(located.way.id) ? prev : new Set([...prev, located.way.id]));
    if (located.topic) {
      setExpandedTopics((prev) =>
        prev.has(located.topic!.id) ? prev : new Set([...prev, located.topic!.id])
      );
    }
  }, [selectedNoteId, library]);

  const toggleWay = (id: string) => {
    setExpandedWays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleTopic = (id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Search filter — match notes by name. Expands ancestors implicitly
  //    via the `matchesSearch` predicate at render time.
  const q = search.trim().toLowerCase();
  const filteredWays = useMemo<Way[]>(() => {
    if (!q) return ways;
    const out: Way[] = [];
    for (const way of ways) {
      const wayHit = way.name.toLowerCase().includes(q);
      const directNotes = way.notes.filter((n) => n.name.toLowerCase().includes(q));
      const filteredTopics = way.topics
        .map((t) => {
          const topicHit = t.name.toLowerCase().includes(q);
          const matchedNotes = t.notes.filter((n) => n.name.toLowerCase().includes(q));
          if (topicHit) return t;
          if (matchedNotes.length) return { ...t, notes: matchedNotes };
          return null;
        })
        .filter((t): t is typeof way.topics[number] => t !== null);
      if (wayHit) out.push(way);
      else if (directNotes.length || filteredTopics.length) {
        out.push({ ...way, notes: directNotes, topics: filteredTopics });
      }
    }
    return out;
  }, [ways, q]);

  // Counts shown next to "Notes · X notes · Y ways"
  const totalNotes = useMemo(() => {
    let n = 0;
    for (const w of ways) {
      n += w.notes.length;
      for (const t of w.topics) n += t.notes.length;
    }
    return n;
  }, [ways]);

  const handleNewWay = async () => {
    const name = window.prompt('Way name')?.trim();
    if (!name) return;
    await createWay(name);
  };

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-title-block">
          <div className="pane-title">Notes</div>
          <div className="pane-sub">{totalNotes} notes · {ways.length} ways</div>
        </div>
        <button className="icon-btn" title="New way" onClick={handleNewWay} aria-label="New way">
          <Plus />
        </button>
      </header>

      <div className="pane-search">
        <label className="field">
          <Search />
          <input
            placeholder="Search in Notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="collapse-btn" title="Collapse library" onClick={onCollapseToggle} aria-label="Collapse library">
          <PanelLeftClose />
        </button>
      </div>

      <div className="pane-body">
        {pinnedNotes.length > 0 && (
          <div className="lib-section">
            <div className="lib-section-label"><span>Pinned</span></div>
            {pinnedNotes.map(({ note }) => (
              <button
                key={note.id}
                className="tree-row"
                data-active={selectedNoteId === note.id || undefined}
                onClick={() => onSelectNote(note.id)}
              >
                <span style={{ width: 14 }} />
                <span className="tree-icon" style={{ color: 'var(--accent-goals)' }}>
                  <Pin size={11} />
                </span>
                <span className="tree-name">{note.name || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}

        <div className="lib-section">
          <div className="lib-section-label">
            <span>Library</span>
            <button className="add" title="New way" onClick={handleNewWay}><Plus /></button>
          </div>

          {filteredWays.length === 0 && (
            <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>
              {q ? 'No matches' : 'No ways yet — click + to create one'}
            </div>
          )}

          {filteredWays.map((way) => {
            const wayOpen = q ? true : expandedWays.has(way.id);
            const wayCount = way.notes.length + way.topics.reduce((acc, t) => acc + t.notes.length, 0);
            return (
              <div key={way.id}>
                <button className="tree-row" data-depth="0" onClick={() => toggleWay(way.id)}>
                  <span className={`tree-chev${wayOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                  <span className="tree-icon"><FolderTree /></span>
                  <span className="tree-name">{way.name}</span>
                  <span className="tree-count">{wayCount}</span>
                </button>

                {wayOpen && (
                  <>
                    {way.notes.map((note) => (
                      <button
                        key={note.id}
                        className="tree-row"
                        data-depth="1"
                        data-active={selectedNoteId === note.id || undefined}
                        onClick={() => onSelectNote(note.id)}
                      >
                        <span className="tree-icon"><FileText /></span>
                        <span className="tree-name">{note.name || 'Untitled'}</span>
                      </button>
                    ))}

                    {way.topics.map((topic) => {
                      const topicOpen = q ? true : expandedTopics.has(topic.id);
                      return (
                        <div key={topic.id}>
                          <button className="tree-row" data-depth="1" onClick={() => toggleTopic(topic.id)}>
                            <span className={`tree-chev${topicOpen ? ' is-open' : ''}`}><ChevronRight /></span>
                            <span className="tree-icon"><Folder /></span>
                            <span className="tree-name">{topic.name}</span>
                            <span className="tree-count">{topic.notes.length}</span>
                          </button>
                          {topicOpen && topic.notes.map((note) => (
                            <button
                              key={note.id}
                              className="tree-row"
                              data-depth="2"
                              data-active={selectedNoteId === note.id || undefined}
                              onClick={() => onSelectNote(note.id)}
                            >
                              <span className="tree-icon"><FileText /></span>
                              <span className="tree-name">{note.name || 'Untitled'}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pane-foot">
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title="Filter" aria-label="Filter"><Filter /></button>
        <button className="icon-btn" title="Sort" aria-label="Sort"><ArrowDownAZ /></button>
      </div>
    </aside>
  );
}

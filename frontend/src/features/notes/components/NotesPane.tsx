import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, Plus, Search } from 'lucide-react';
import type { NotesLibrary } from '../hooks/useNotesLibrary';
import type { Way } from '../../../api/types';

const EXP_WAYS_KEY   = 'jarvnote:notes:expandedWays';
const EXP_TOPICS_KEY = 'jarvnote:notes:expandedTopics';

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
}

export function NotesPane({
  library, selectedNoteId, collapsed, onSelectNote,
}: Props) {
  const { ways, createWay, createTopic, createNote } = library;
  const [expandedWays, setExpandedWays]     = useState<Set<string>>(readSet(EXP_WAYS_KEY));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(readSet(EXP_TOPICS_KEY));
  const [search, setSearch] = useState('');

  useEffect(() => { writeSet(EXP_WAYS_KEY, expandedWays); },     [expandedWays]);
  useEffect(() => { writeSet(EXP_TOPICS_KEY, expandedTopics); }, [expandedTopics]);

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
        if (topicHit) return t;
        if (matched.length) return { ...t, notes: matched };
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
      for (const t of w.topics) n += t.notes.length;
    }
    return n;
  }, [ways]);

  const totalTopics = useMemo(() =>
    ways.reduce((acc, w) => acc + w.topics.length, 0), [ways]);

  const handleNewWay = async () => {
    const name = window.prompt('Way name')?.trim();
    if (!name) return;
    await createWay(name);
  };

  const handleNewTopic = async (wayId: string) => {
    const name = window.prompt('Topic name')?.trim();
    if (!name) return;
    await createTopic(wayId, name);
    setExpandedWays((p) => p.has(wayId) ? p : new Set([...p, wayId]));
  };

  const handleNewNote = async (target: { way_id?: string; topic_id?: string }) => {
    const note = await createNote(target, 'Untitled');
    if (!note) return;
    if (target.way_id) {
      setExpandedWays((p) => p.has(target.way_id!) ? p : new Set([...p, target.way_id!]));
    }
    if (target.topic_id) {
      setExpandedTopics((p) => p.has(target.topic_id!) ? p : new Set([...p, target.topic_id!]));
    }
    onSelectNote(note.id);
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

          {filteredWays.map((way) => {
            const wayOpen  = q ? true : expandedWays.has(way.id);
            const wayCount = way.notes.length + way.topics.reduce((a, t) => a + t.notes.length, 0);
            return (
              <div key={way.id}>
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
                    className="row-add"
                    role="button"
                    tabIndex={0}
                    title="New topic"
                    onClick={(e) => { e.stopPropagation(); void handleNewTopic(way.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void handleNewTopic(way.id); } }}
                  ><Plus size={11} /></span>
                  <span
                    className="row-add"
                    role="button"
                    tabIndex={0}
                    title="New note in way"
                    onClick={(e) => { e.stopPropagation(); void handleNewNote({ way_id: way.id }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void handleNewNote({ way_id: way.id }); } }}
                  ><FileText size={11} /></span>
                </div>

                {wayOpen && (
                  <>
                    {way.notes.map((note) => (
                      <button
                        key={note.id}
                        className="lib-row tree-row"
                        data-depth="1"
                        data-active={selectedNoteId === note.id || undefined}
                        onClick={() => onSelectNote(note.id)}
                      >
                        <span className="name">{note.name || 'Untitled'}</span>
                      </button>
                    ))}

                    {way.topics.map((topic) => {
                      const topicOpen = q ? true : expandedTopics.has(topic.id);
                      return (
                        <div key={topic.id}>
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
                            <span className="count">{topic.notes.length}</span>
                            <span
                              className="row-add"
                              role="button"
                              tabIndex={0}
                              title="New note in topic"
                              onClick={(e) => { e.stopPropagation(); void handleNewNote({ topic_id: topic.id }); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void handleNewNote({ topic_id: topic.id }); } }}
                            ><Plus size={11} /></span>
                          </div>
                          {topicOpen && topic.notes.map((note) => (
                            <button
                              key={note.id}
                              className="lib-row tree-row"
                              data-depth="2"
                              data-active={selectedNoteId === note.id || undefined}
                              onClick={() => onSelectNote(note.id)}
                            >
                              <span className="name">{note.name || 'Untitled'}</span>
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
    </aside>
  );
}

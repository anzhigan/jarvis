import { useEffect, useState, useMemo } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  Search, BookOpen, Target, Repeat, Zap, BarChart3, Settings,
  Sun, Plus, FileText, ArrowRight,
} from 'lucide-react';
import type { Tab } from '../../app/tabs';
import { tasksApi, waysApi } from '../../api/client';
import type { Note, Task, Way, Topic } from '../../api/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: Tab) => void;
  onToggleTheme: () => void;
  onSelectNote: (note: Note) => void;
}

export function CommandPalette({ open, onOpenChange, onTabChange, onToggleTheme, onSelectNote }: Props) {
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ways, setWays] = useState<Way[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load data the first time the palette opens.
  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      tasksApi.list().catch(() => []),
      waysApi.list().catch(() => []),
    ]).then(([t, w]) => {
      setTasks(t); setWays(w); setLoaded(true);
    });
  }, [open, loaded]);

  // Reset search when re-opening.
  useEffect(() => { if (open) setQuery(''); }, [open]);

  const allNotes = useMemo(() => {
    const out: { note: Note; way: Way; topic: Topic | null }[] = [];
    for (const w of ways) {
      for (const n of w.notes) out.push({ note: n, way: w, topic: null });
      for (const t of w.topics) {
        for (const n of t.notes) out.push({ note: n, way: w, topic: t });
      }
    }
    return out;
  }, [ways]);

  const close = () => onOpenChange(false);
  const navigate = (tab: Tab) => { close(); onTabChange(tab); };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="cmdk-overlay">
          <RadixDialog.Content
            className="cmdk-root"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
            <Command label="Command palette" loop>
              <div className="cmdk-input-row">
                <Search size={14} className="icon" />
                <Command.Input
                  className="cmdk-input"
                  autoFocus
                  placeholder="Search or jump to…"
                  value={query}
                  onValueChange={setQuery}
                />
                <kbd className="ui-kbd">Esc</kbd>
              </div>

              <Command.List className="cmdk-list">
                <Command.Empty className="cmdk-empty">No results for "{query}"</Command.Empty>

                <Command.Group heading="Navigate" className="cmdk-group">
                  <Command.Item className="cmdk-item" onSelect={() => navigate('notes')}>
                    <BookOpen className="icon" /> <span className="cmdk-item-text">Go to Notes</span>
                    <span className="cmdk-shortcut">G then N</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => navigate('tasks')}>
                    <Target className="icon" /> <span className="cmdk-item-text">Go to Goals</span>
                    <span className="cmdk-shortcut">G then G</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => navigate('routines')}>
                    <Repeat className="icon" /> <span className="cmdk-item-text">Go to Routines</span>
                    <span className="cmdk-shortcut">G then R</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => navigate('sprints')}>
                    <Zap className="icon" /> <span className="cmdk-item-text">Go to Sprints</span>
                    <span className="cmdk-shortcut">G then S</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => navigate('analysis')}>
                    <BarChart3 className="icon" /> <span className="cmdk-item-text">Go to Analysis</span>
                    <span className="cmdk-shortcut">G then A</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => navigate('profile')}>
                    <Settings className="icon" /> <span className="cmdk-item-text">Settings & Profile</span>
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Quick actions" className="cmdk-group">
                  <Command.Item className="cmdk-item" onSelect={() => { close(); onToggleTheme(); }}>
                    <Sun className="icon" /><span className="cmdk-item-text">Toggle theme</span>
                    <span className="cmdk-shortcut">⌘ ⇧ L</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => { close(); window.dispatchEvent(new CustomEvent('jarvnote:newGoal')); navigate('tasks'); }}>
                    <Plus className="icon" /><span className="cmdk-item-text">New goal</span>
                    <span className="cmdk-shortcut">N</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => { close(); window.dispatchEvent(new CustomEvent('jarvnote:newRoutine')); navigate('routines'); }}>
                    <Plus className="icon" /><span className="cmdk-item-text">New routine</span>
                  </Command.Item>
                  <Command.Item className="cmdk-item" onSelect={() => { close(); window.dispatchEvent(new CustomEvent('jarvnote:newSprint')); navigate('sprints'); }}>
                    <Plus className="icon" /><span className="cmdk-item-text">New sprint</span>
                  </Command.Item>
                </Command.Group>

                {tasks.length > 0 && (
                  <Command.Group heading="Goals" className="cmdk-group">
                    {tasks.slice(0, 50).map((t) => (
                      <Command.Item
                        key={t.id}
                        value={`goal ${t.title} ${t.description}`}
                        className="cmdk-item"
                        onSelect={() => { close(); onTabChange('tasks'); window.dispatchEvent(new CustomEvent('jarvnote:openGoal', { detail: t.id })); }}
                      >
                        <Target className="icon" />
                        <span className="cmdk-item-text">{t.title}</span>
                        <span className="cmdk-item-meta">{t.status}</span>
                        <ArrowRight size={11} style={{ color: 'var(--fg-faint)' }} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {allNotes.length > 0 && (
                  <Command.Group heading="Notes" className="cmdk-group">
                    {allNotes.slice(0, 50).map((n) => (
                      <Command.Item
                        key={n.note.id}
                        value={`note ${n.note.name} ${n.way.name} ${n.topic?.name ?? ''}`}
                        className="cmdk-item"
                        onSelect={() => { close(); onTabChange('notes'); onSelectNote(n.note); }}
                      >
                        <FileText className="icon" />
                        <span className="cmdk-item-text">{n.note.name || 'Untitled'}</span>
                        <span className="cmdk-item-meta">{n.way.name}{n.topic ? ` · ${n.topic.name}` : ''}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>

              <div className="cmdk-foot">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> select</span>
                <span><kbd>Esc</kbd> close</span>
              </div>
            </Command>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

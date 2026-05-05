import { useMemo } from 'react';
import { Calendar, Clock, FileText, Hash, Pin, PinOff } from 'lucide-react';
import type { Note } from '../../../api/types';
import { Button, Tag } from '../../ui';

interface Props {
  note: Note;
  onTogglePin: () => void;
}

function stripHtml(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? '';
}

export function ContextPanel({ note, onTogglePin }: Props) {
  const stats = useMemo(() => {
    const text = stripHtml(note.content || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const readMin = Math.max(1, Math.round(words / 200));
    return { words, chars, readMin };
  }, [note.content]);

  return (
    <aside className="notes-pane" data-side="right">
      <header className="notes-pane-head">
        <span className="notes-pane-title">Context</span>
      </header>
      <div className="notes-pane-body">
        <section className="notes-ctx-section">
          <div className="notes-ctx-section-title">Stats</div>
          <div className="notes-ctx-stat">
            <span className="notes-ctx-stat-label inline-flex items-center gap-1.5">
              <FileText size={11} /> Words
            </span>
            <span className="notes-ctx-stat-value">{stats.words}</span>
          </div>
          <div className="notes-ctx-stat">
            <span className="notes-ctx-stat-label inline-flex items-center gap-1.5">
              <Hash size={11} /> Characters
            </span>
            <span className="notes-ctx-stat-value">{stats.chars}</span>
          </div>
          <div className="notes-ctx-stat">
            <span className="notes-ctx-stat-label inline-flex items-center gap-1.5">
              <Clock size={11} /> Reading time
            </span>
            <span className="notes-ctx-stat-value">{stats.readMin} min</span>
          </div>
        </section>

        {(note.tags?.length || 0) > 0 && (
          <section className="notes-ctx-section">
            <div className="notes-ctx-section-title">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {note.tags!.map((t) => (
                <Tag key={t.id} color={t.color}>{t.name}</Tag>
              ))}
            </div>
          </section>
        )}

        <section className="notes-ctx-section">
          <div className="notes-ctx-section-title">Meta</div>
          <div className="notes-ctx-stat">
            <span className="notes-ctx-stat-label inline-flex items-center gap-1.5">
              <Calendar size={11} /> Created
            </span>
            <span className="notes-ctx-stat-value">{new Date(note.created_at).toLocaleDateString()}</span>
          </div>
          <div className="notes-ctx-stat">
            <span className="notes-ctx-stat-label inline-flex items-center gap-1.5">
              <Calendar size={11} /> Updated
            </span>
            <span className="notes-ctx-stat-value">{new Date(note.updated_at).toLocaleDateString()}</span>
          </div>
        </section>

        <section className="notes-ctx-section">
          <div className="notes-ctx-section-title">Actions</div>
          <Button variant="ghost" className="w-full justify-start" onClick={onTogglePin}>
            {note.pinned ? <PinOff size={12} className="mr-2" /> : <Pin size={12} className="mr-2" />}
            {note.pinned ? 'Unpin note' : 'Pin note'}
          </Button>
        </section>
      </div>
    </aside>
  );
}

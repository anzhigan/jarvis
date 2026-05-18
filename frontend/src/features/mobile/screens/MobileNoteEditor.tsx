import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronLeft, Loader2, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import type { Note } from '../../../api/types';
import { useNoteAutoSave } from '../../notes/hooks/useNoteAutoSave';
import type { NotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { confirmDialog } from '../../../components/ui';
import '../../../styles/mobile.css';

const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));

interface Props {
  note: Note;
  library: NotesLibrary;
  onBack: () => void;
}

/**
 * Mobile full-screen note editor.
 *
 * Distinct from the rest of the mobile shell: there is no bottom tab bar — the
 * full viewport is dedicated to writing. The top bar is collapsed to back +
 * actions, the title is inline (doc-style), and a meta line under it shows
 * way/topic + tags. Auto-save status sits next to the back button.
 */
export default function MobileNoteEditor({ note, library, onBack }: Props) {
  const save = useNoteAutoSave(() => { void library.refresh(); });
  const [localTitle, setLocalTitle] = useState(note.name);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setLocalTitle(note.name); }, [note.id, note.name]);

  // Resolve parent way / topic for the meta line.
  const located = library.findNote(note.id);
  const wayName   = located?.way.name ?? null;
  const topicName = located?.topic?.name ?? null;
  const breadcrumb = topicName ? `${wayName} · ${topicName}` : wayName;

  const saveLabel = save.saving
    ? 'Saving…'
    : save.savedAt
      ? `Saved ${new Date(save.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
      : 'Auto-save';

  const goBack = async () => { await save.flush(); onBack(); };

  const handleDelete = async () => {
    setMenuOpen(false);
    const ok = await confirmDialog({
      title: 'Delete note?',
      body: <>«{note.name || 'Untitled'}» This cannot be undone.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await save.flush();
    await library.deleteNote(note.id);
    onBack();
  };
  const handleTogglePin = async () => {
    setMenuOpen(false);
    await library.togglePin(note.id);
  };

  return (
    <div
      className="m-shell"
      style={{
        // Editor takes the entire viewport — no tab bar.
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header className="top-bar">
        <div className="tb-side">
          <button
            type="button"
            className="tb-btn"
            onClick={goBack}
            aria-label="Back to notes"
          ><ChevronLeft size={18} /></button>
        </div>
        <div className="tb-center">
          <div className="tb-title" style={{ fontSize: 14 }}>{breadcrumb ?? 'Note'}</div>
          <div className="tb-sub">{saveLabel}</div>
        </div>
        <div className="tb-side tb-side-right" style={{ position: 'relative' }}>
          <button
            type="button"
            className="tb-btn"
            onClick={handleTogglePin}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >{note.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
          <button
            type="button"
            className="tb-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More actions"
          ><MoreHorizontal size={18} /></button>
          {menuOpen && (
            <>
              <div
                onClick={() => setMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 9 }}
              />
              <div
                role="menu"
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                  background: 'var(--paper)',
                  boxShadow: 'var(--sh-popover)',
                  borderRadius: 8,
                  minWidth: 180,
                  padding: 4,
                  zIndex: 10,
                }}
              >
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '10px 12px',
                    border: 0, background: 'transparent',
                    textAlign: 'left',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--rust)',
                    cursor: 'pointer',
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rust-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={14} /> Delete note
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main
        className="screen-content"
        style={{
          // Override default screen-content padding for a roomier doc feel.
          padding: '16px 18px 28px',
        }}
      >
        <input
          className="doc-title-input"
          value={localTitle}
          onChange={(e) => {
            const v = e.target.value;
            setLocalTitle(v);
            save.queueSave(note.id, { name: v });
          }}
          placeholder="Untitled"
          aria-label="Note title"
          style={{
            width: '100%', border: 0, outline: 0, background: 'transparent',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 500,
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--ink)',
            lineHeight: 1.15,
            padding: 0,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            margin: '10px 0 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--ink-4)',
          }}
        >
          <time>{new Date(note.updated_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          })}</time>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span>{wordCount(note.content)} words</span>
          {note.tags.length > 0 && (
            <>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                {note.tags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 10,
                      fontWeight: 500,
                      padding: '1px 6px',
                      borderRadius: 999,
                      color: tag.color,
                      boxShadow: `inset 0 0 0 1px ${tag.color}33`,
                    }}
                  >#{tag.name}</span>
                ))}
              </span>
            </>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--hairline)', margin: '0 0 14px' }} />

        <Suspense fallback={
          <div style={{ display: 'grid', placeItems: 'center', height: '40dvh', color: 'var(--ink-4)' }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        }>
          <RichTextEditor
            key={note.id}
            noteId={note.id}
            content={note.content}
            onChange={(html) => save.queueSave(note.id, { content: html })}
          />
        </Suspense>
      </main>
    </div>
  );
}

function wordCount(html: string): number {
  if (!html) return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent ?? '').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

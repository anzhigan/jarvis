import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchPublicNote, type PublicNote } from '../../../api/client';
// Notes section styles (.doc, .doc-body, code blocks, etc.) — normally loaded
// by NotesView for authenticated users, but the anonymous share page never
// mounts that, so import them here.
import './notes.css';

// Reuse the same RichTextEditor as the main app — in editable=false mode it
// renders identically to the authoring view (NodeViews, lowlight syntax
// highlighting, math) but doesn't take edits.
const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));

interface Props {
  token: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === today.getTime()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' today';
  }
  return fmtDate(iso);
}
function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}
function readMinutes(html: string): number {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

/** Anonymous reader for a shared note. Layout mirrors NoteEditor 1:1 (kicker,
 *  title, meta, body) — only the breadcrumb / Saved / Share row is omitted
 *  since it isn't meaningful to an anonymous viewer. */
export default function PublicNoteView({ token }: Props) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ok'; note: PublicNote }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchPublicNote(token).then(
      (note) => { if (!cancelled) setState({ kind: 'ok', note }); },
      (err: { status?: number; detail?: string }) => {
        if (cancelled) return;
        const message = err.status === 404
          ? 'Ссылка недействительна или была отозвана.'
          : 'Не удалось загрузить заметку.';
        setState({ kind: 'error', message });
      },
    );
    return () => { cancelled = true; };
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <div className="public-note-shell">
        <div className="public-note-status">
          <Loader2 size={18} className="animate-spin" />
          <span>Загрузка…</span>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="public-note-shell">
        <div className="public-note-status">{state.message}</div>
      </div>
    );
  }

  const { note } = state;
  const minutes = readMinutes(note.content || '');

  return (
    <div className="public-note-shell">
      <article className="doc">
        <div className="doc-kicker">
          Notes · {minutes} minute{minutes === 1 ? '' : 's'} read
        </div>
        {/* Render the title as a static h1 styled identically to the editable
            input — no input element, no editing affordance. */}
        <h1 className="doc-title-input doc-title-static">{note.name || 'Untitled'}</h1>
        <p className="doc-meta">
          <span className="doc-meta-item">Started <time>{fmtDate(note.created_at)}</time></span>
          <span className="doc-meta-sep">·</span>
          <span className="doc-meta-item">Updated <time>{fmtRelative(note.updated_at)}</time></span>
          {note.tags.length > 0 && (
            <>
              <span className="doc-meta-sep">·</span>
              <span className="doc-meta-tags">
                {note.tags.map((t) => (
                  <span key={t.id} className="doc-tag">{t.name}</span>
                ))}
              </span>
            </>
          )}
        </p>

        <div className="doc-body">
          <Suspense fallback={
            <div style={{ padding: 24, color: 'var(--ink-4)', fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          }>
            <RichTextEditor
              noteId=""
              content={note.content}
              editable={false}
              onChange={() => { /* read-only */ }}
            />
          </Suspense>
        </div>
      </article>
    </div>
  );
}

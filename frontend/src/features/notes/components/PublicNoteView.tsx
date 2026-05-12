import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchPublicNote, type PublicNote } from '../../../api/client';

interface Props {
  token: string;
}

/** Anonymous reader for a shared note. No auth, no sidebar, no tabs — just the
 *  rendered HTML body inside the same `.doc` layout as the editor. The HTML is
 *  trusted (it's already in the user's own note) and image URLs were rewritten
 *  by the backend to the matching /public/notes/{token}/images/ endpoint. */
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
  return (
    <div className="public-note-shell">
      <article className="doc">
        {/* No header / kicker / meta — the user wanted just the note body
            occupying the full width of the doc, matching the editor surface. */}
        <div
          className="doc-body"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      </article>
    </div>
  );
}

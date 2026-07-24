/**
 * LinkInsertSheet — bottom sheet for inserting/editing a link.
 * Two tabs:
 *   • External — plain URL input (https://…)
 *   • Note — search across user's notes; pick a note → then optionally a
 *     specific h1/h2/h3 inside it. Produces `#note:<uuid>` (whole note) or
 *     `#note:<uuid>#<encoded heading text>` (deep link to that heading).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Search, FileText, Loader2, Trash2, Hash, ChevronLeft } from 'lucide-react';
import { waysApi } from '../../api/client';
import type { Note, Way } from '../../api/types';

interface HeadingHit {
  level: 1 | 2 | 3;
  text: string;
}

/** Extract h1/h2/h3 headings (in document order) from a note's stored HTML. */
function parseHeadings(html: string): HeadingHit[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: HeadingHit[] = [];
  doc.querySelectorAll('h1, h2, h3').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    const level = el.tagName === 'H1' ? 1 : el.tagName === 'H2' ? 2 : 3;
    out.push({ level, text });
  });
  return out;
}

/** Build the internal link href for a note, optionally anchored to a heading. */
function noteHref(id: string, heading?: string): string {
  return heading ? `#note:${id}#${encodeURIComponent(heading)}` : `#note:${id}`;
}

interface Props {
  open: boolean;
  initialUrl?: string;
  /** Whether there's an existing link mark — show "Remove link" action. */
  isEditingExisting?: boolean;
  onCancel: () => void;
  onInsert: (url: string) => void;
  onRemove?: () => void;
}

interface NoteHit {
  id: string;
  name: string;
  parentLabel: string;
  content: string;
}

export default function LinkInsertSheet({ open, initialUrl = '', isEditingExisting, onCancel, onInsert, onRemove }: Props) {
  const [tab, setTab] = useState<'url' | 'note'>(initialUrl.startsWith('#note:') ? 'note' : 'url');
  const [url, setUrl] = useState(initialUrl);
  const [search, setSearch] = useState('');
  const [allNotes, setAllNotes] = useState<NoteHit[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  // Second step of the Note tab: once a note is picked, choose the whole note
  // or one of its headings. null = still on the note-search step.
  const [pickedNote, setPickedNote] = useState<NoteHit | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setTab(initialUrl.startsWith('#note:') ? 'note' : 'url');
    setSearch('');
    setPickedNote(null);
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // Lazy-load notes list when the Note tab is opened.
  useEffect(() => {
    if (!open || tab !== 'note' || allNotes.length > 0) return;
    setLoadingNotes(true);
    waysApi.list()
      .then((ways: Way[]) => {
        const flat: NoteHit[] = [];
        for (const w of ways) {
          for (const n of w.notes ?? []) {
            flat.push({ id: n.id, name: n.name || 'Untitled', parentLabel: w.name, content: n.content ?? '' });
          }
          for (const t of w.topics ?? []) {
            for (const n of (t.notes ?? []) as Note[]) {
              flat.push({ id: n.id, name: n.name || 'Untitled', parentLabel: `${w.name} / ${t.name}`, content: n.content ?? '' });
            }
            for (const s of t.subtopics ?? []) {
              for (const n of (s.notes ?? []) as Note[]) {
                flat.push({ id: n.id, name: n.name || 'Untitled', parentLabel: `${w.name} / ${t.name} / ${s.name}`, content: n.content ?? '' });
              }
              for (const ss of s.subsubtopics ?? []) {
                for (const n of (ss.notes ?? []) as Note[]) {
                  flat.push({ id: n.id, name: n.name || 'Untitled', parentLabel: `${w.name} / ${t.name} / ${s.name} / ${ss.name}`, content: n.content ?? '' });
                }
              }
            }
          }
        }
        setAllNotes(flat);
      })
      .catch(() => setAllNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [open, tab, allNotes.length]);

  // Focus the right field after slide-up.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (tab === 'url') urlRef.current?.focus();
      else searchRef.current?.focus();
    }, 320);
    return () => window.clearTimeout(t);
  }, [open, tab]);

  // Parse each note's headings once when the list loads, not per render/keystroke.
  const headingsByNote = useMemo(() => {
    const m = new Map<string, HeadingHit[]>();
    for (const n of allNotes) m.set(n.id, parseHeadings(n.content));
    return m;
  }, [allNotes]);

  const filteredNotes = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allNotes.slice(0, 50);
    return allNotes
      .filter((n) => n.name.toLowerCase().includes(s) || n.parentLabel.toLowerCase().includes(s))
      .slice(0, 50);
  }, [search, allNotes]);

  const sheetMotion = isMobile
    ? {
        initial: { y: '100%' } as const,
        animate: { y: 0 } as const,
        exit: { y: '100%' } as const,
        transition: { type: 'tween' as const, duration: 0.28, ease: 'easeOut' as const },
      }
    : {
        initial: { opacity: 0, scale: 0.96 } as const,
        animate: { opacity: 1, scale: 1 } as const,
        exit: { opacity: 0, scale: 0.96 } as const,
        transition: { duration: 0.2 },
      };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="create-sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div className="create-sheet" {...sheetMotion} onClick={(e) => e.stopPropagation()}>
            <div className="create-sheet-header">
              <div className="create-sheet-drag-handle" />
              <div className="create-sheet-header-row">
                <span className="create-sheet-title">Insert link</span>
                <button aria-label="Close" type="button" className="icon-btn" onClick={onCancel}>
                  <X size={16} />
                </button>
              </div>
              <div className="link-tabs" role="tablist" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'url'}
                  className="link-tab"
                  data-active={tab === 'url' ? 'true' : undefined}
                  onClick={() => setTab('url')}
                >
                  External URL
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'note'}
                  className="link-tab"
                  data-active={tab === 'note' ? 'true' : undefined}
                  onClick={() => setTab('note')}
                >
                  Note
                </button>
              </div>
            </div>

            <div className="create-sheet-body">
              {tab === 'url' && (
                <div className="form-fields">
                  <div className="form-field">
                    <label className="form-field-label">URL</label>
                    <input
                      ref={urlRef}
                      type="url"
                      value={url.startsWith('#note:') ? '' : url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); if (url.trim()) onInsert(url.trim()); }
                      }}
                      placeholder="https://example.com"
                      className="input w-full"
                    />
                  </div>
                </div>
              )}

              {tab === 'note' && !pickedNote && (
                <div className="form-fields">
                  <div className="form-field">
                    <label className="form-field-label">Search notes</label>
                    <div className="search-field">
                      <Search size={14} />
                      <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Type to filter…"
                      />
                    </div>
                  </div>

                  <div className="link-note-list">
                    {loadingNotes ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : filteredNotes.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--ink-4)' }}>
                        {search ? 'No notes match' : 'No notes yet'}
                      </div>
                    ) : (
                      filteredNotes.map((n) => {
                        const headingCount = (headingsByNote.get(n.id) ?? []).length;
                        return (
                          <button
                            key={n.id}
                            type="button"
                            className="link-note-row"
                            // Notes with headings open a second step to pick the
                            // exact section; note-only links insert immediately.
                            onClick={() => (headingCount > 0 ? setPickedNote(n) : onInsert(noteHref(n.id)))}
                          >
                            <FileText size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="link-note-title">{n.name}</span>
                              <span className="link-note-sub">{n.parentLabel}</span>
                            </span>
                            {headingCount > 0 && (
                              <span className="link-note-headcount" title={`${headingCount} heading${headingCount === 1 ? '' : 's'}`}>
                                <Hash size={11} />{headingCount}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {tab === 'note' && pickedNote && (
                <div className="form-fields">
                  <button
                    type="button"
                    className="link-back-row"
                    onClick={() => setPickedNote(null)}
                  >
                    <ChevronLeft size={14} />
                    <span className="link-note-title" style={{ minWidth: 0 }}>{pickedNote.name}</span>
                  </button>

                  <div className="link-note-list">
                    <button
                      type="button"
                      className="link-note-row"
                      onClick={() => onInsert(noteHref(pickedNote.id))}
                    >
                      <FileText size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="link-note-title">Whole note</span>
                        <span className="link-note-sub">Link to the top of the note</span>
                      </span>
                    </button>

                    {(headingsByNote.get(pickedNote.id) ?? parseHeadings(pickedNote.content)).map((h, i) => (
                      <button
                        key={`${i}-${h.text}`}
                        type="button"
                        className="link-note-row link-heading-row"
                        data-level={h.level}
                        onClick={() => onInsert(noteHref(pickedNote.id, h.text))}
                      >
                        <Hash size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                        <span className="link-note-title" style={{ minWidth: 0 }}>{h.text}</span>
                        <span className="link-heading-badge">H{h.level}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="create-sheet-footer">
              <div className="create-sheet-footer-row">
                {isEditingExisting && onRemove && (
                  <button
                    type="button"
                    className="btn"
                    style={{ color: 'var(--rust)' }}
                    onClick={onRemove}
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                {tab === 'url' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!url.trim() || url.startsWith('#note:')}
                    onClick={() => onInsert(url.trim())}
                  >
                    <Check size={14} /> Insert
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

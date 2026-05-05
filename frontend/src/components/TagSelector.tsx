import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag as TagIcon, Plus, X, Loader2, Check, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { notesApi, tagsApi, tasksApi } from '../api/client';
import { useT } from '../store/i18n';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import type { Tag } from '../api/types';

const PALETTE = [
  '#4f46e5', '#e11d48', '#ea580c', '#d97706',
  '#65a30d', '#059669', '#0891b2', '#7c3aed',
];

interface Props {
  targetId: string;
  targetKind?: 'note' | 'task';
  tags: Tag[];
  onChange: () => void | Promise<void>;
  compact?: boolean;
}

// ─── Mobile sheet ─────────────────────────────────────────────────────────────
function MobileSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const kbHeight = useKeyboardHeight();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="create-sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ paddingBottom: kbHeight, transition: 'padding-bottom 0.2s ease' }}
          onClick={onClose}
        >
          <motion.div
            className="create-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default function TagSelector({ targetId, targetKind = 'note', tags, onChange, compact }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'pick' | 'new'>('pick');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open || isMobile) { setPopupPos(null); return; }
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popupWidth = 288;
      const viewportWidth = window.innerWidth;
      let left = rect.left;
      if (left + popupWidth > viewportWidth - 8) left = viewportWidth - popupWidth - 8;
      if (left < 8) left = 8;
      setPopupPos({ top: rect.bottom + 4, left });
    }
  }, [open, isMobile]);

  // Focus new-name input when switching to 'new' view on mobile
  useEffect(() => {
    if (open && isMobile && mobileView === 'new') {
      const timer = setTimeout(() => newNameRef.current?.focus(), 320);
      return () => clearTimeout(timer);
    }
  }, [open, isMobile, mobileView]);

  const attachApi = targetKind === 'task' ? tasksApi.attachTag : notesApi.attachTag;
  const detachApi = targetKind === 'task' ? tasksApi.detachTag : notesApi.detachTag;

  const loadAllTags = async () => {
    setLoading(true);
    try {
      const data = await tagsApi.list();
      setAllTags(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileView('pick');
    setNewName('');
    setNewColor(PALETTE[0]);
    setOpen(true);
  };

  useEffect(() => { if (open) loadAllTags(); }, [open]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, isMobile]);

  const attachedIds = new Set(tags.map((tag) => tag.id));

  const toggleTag = async (tag: Tag) => {
    try {
      if (attachedIds.has(tag.id)) await detachApi(targetId, tag.id);
      else await attachApi(targetId, tag.id);
      await onChange();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to update tag');
    }
  };

  const createTag = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await tagsApi.create(name, newColor);
      await attachApi(targetId, created.id);
      setNewName('');
      setNewColor(PALETTE[0]);
      await loadAllTags();
      await onChange();
      if (isMobile) setMobileView('pick');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const removeAttached = async (tag: Tag) => {
    try {
      await detachApi(targetId, tag.id);
      await onChange();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to remove tag');
    }
  };

  const deleteTag = async (tag: Tag) => {
    if (!window.confirm(t('tags.deleteConfirm', { name: tag.name }))) return;
    try {
      await tagsApi.delete(tag.id);
      await loadAllTags();
      await onChange();
    } catch {
      // ignore
    }
  };

  const iconSize = compact ? 10 : 13;

  // ─── Shared tag list ───────────────────────────────────────────────────────
  const TagList = (
    <>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
        </div>
      ) : allTags.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>{t('tags.none')}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allTags.map((tag) => {
            const attached = attachedIds.has(tag.id);
            return (
              <div
                key={tag.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 0,
                  borderRadius: 999,
                  backgroundColor: attached ? tag.color : `${tag.color}15`,
                  border: `1px solid ${tag.color}${attached ? '' : '40'}`,
                }}
              >
                <button
                  onClick={() => toggleTag(tag)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, paddingLeft: 12, paddingRight: 8, fontSize: 13, fontWeight: 500, color: attached ? 'white' : tag.color, background: 'none', border: 0, cursor: 'pointer' }}
                >
                  {attached && <Check size={11} />}
                  {tag.name}
                </button>
                <button
                  onClick={() => deleteTag(tag)}
                  style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, marginRight: 4, background: 'none', border: 0, cursor: 'pointer', color: attached ? 'white' : tag.color }}
                  title="Delete tag permanently"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // ─── Shared new-tag form ───────────────────────────────────────────────────
  const NewTagForm = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={newNameRef}
          type="text"
          placeholder="Tag name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTag()}
          className="input"
          style={{ flex: 1 }}
          maxLength={50}
        />
        <button
          onClick={createTag}
          disabled={!newName.trim() || creating}
          className="btn btn-primary"
          style={{ flexShrink: 0 }}
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setNewColor(c)}
            style={{
              width: 28, height: 28, borderRadius: 999, backgroundColor: c,
              border: newColor === c ? '3px solid var(--fg-primary)' : '2px solid transparent',
              outline: newColor === c ? '2px solid var(--bg-card)' : 'none',
              outlineOffset: -4, cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="tag-chip removable"
          style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
        >
          {tag.name}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeAttached(tag); }}
            className="x"
            title="Remove tag"
          >
            <X size={10} />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          ref={buttonRef}
          onClick={openSheet}
          className={`inline-flex items-center gap-1 ${compact ? 'h-7' : 'h-8'} px-3 rounded-full ${compact ? 'text-[10px]' : 'text-xs'} font-medium border border-dashed border-border hover:border-border-strong hover:bg-secondary/40 text-muted-foreground transition-colors`}
          title={t('tags.addTag')}
        >
          <TagIcon size={iconSize} />
          {tags.length === 0 ? t('tags.addTag') : '+'}
        </button>

        {/* Desktop popup */}
        {!isMobile && open && (
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={popupPos ? { top: popupPos.top, left: popupPos.left } : undefined}
            className="fixed z-[101] w-72 bg-card border border-border rounded-lg shadow-2xl p-3"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t('tags.yourTags')}
            </div>
            <div className="mb-3 max-h-48 overflow-y-auto">{TagList}</div>
            <div className="border-t border-border pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Create new
              </div>
              {NewTagForm}
            </div>
          </div>
        )}
      </div>

      {/* Mobile: "Pick tags" sheet */}
      {isMobile && (
        <MobileSheet open={open && mobileView === 'pick'} onClose={() => setOpen(false)}>
          <div className="create-sheet-header">
            <div className="create-sheet-drag-handle" />
            <div className="create-sheet-header-row">
              <span className="create-sheet-title">{t('tags.yourTags')}</span>
              <button className="icon-btn" type="button" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="create-sheet-body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
            {TagList}
          </div>
          <div className="create-sheet-footer">
            <div className="create-sheet-footer-row">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
                Done
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setMobileView('new')}>
                <Plus size={14} /> New tag
              </button>
            </div>
          </div>
        </MobileSheet>
      )}

      {/* Mobile: "New tag" sheet */}
      {isMobile && (
        <MobileSheet open={open && mobileView === 'new'} onClose={() => setMobileView('pick')}>
          <div className="create-sheet-header">
            <div className="create-sheet-drag-handle" />
            <div className="create-sheet-header-row">
              <button className="icon-btn" type="button" onClick={() => setMobileView('pick')}>
                <ChevronLeft size={16} />
              </button>
              <span className="create-sheet-title">New tag</span>
              <button className="icon-btn" type="button" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="create-sheet-body">
            {NewTagForm}
          </div>
        </MobileSheet>
      )}
    </div>
  );
}

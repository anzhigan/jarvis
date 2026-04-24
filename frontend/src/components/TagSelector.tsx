import { useEffect, useRef, useState } from 'react';
import { Tag as TagIcon, Plus, X, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { notesApi, tagsApi, tasksApi } from '../api/client';
import { useT } from '../store/i18n';
import type { Tag } from '../api/types';

const PALETTE = [
  '#4f46e5', '#e11d48', '#ea580c', '#d97706',
  '#65a30d', '#059669', '#0891b2', '#0ea5e9',
  '#7c3aed', '#db2777', '#78716c', '#1c1917',
];

interface Props {
  targetId: string;
  targetKind?: 'note' | 'task';          // Default: note
  tags: Tag[];
  onChange: () => void | Promise<void>;
  compact?: boolean;                      // Smaller chips
}

export default function TagSelector({ targetId, targetKind = 'note', tags, onChange, compact }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { if (open) loadAllTags(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const attachedIds = new Set(tags.map((t) => t.id));

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

  const chipHeight = compact ? 'h-6' : 'h-7';
  const chipText = compact ? 'text-[10px]' : 'text-xs';
  const iconSize = compact ? 9 : 11;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className={`inline-flex items-center gap-1 ${chipHeight} pl-2 pr-1 rounded-full ${chipText} font-medium`}
          style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
        >
          {tag.name}
          <button
            onClick={(e) => { e.stopPropagation(); removeAttached(tag); }}
            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-current/10"
            title="Remove tag"
          >
            <X size={iconSize} />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className={`inline-flex items-center gap-1 ${chipHeight} px-2 rounded-full ${chipText} font-medium border border-dashed border-border hover:border-border-strong hover:bg-secondary/40 text-muted-foreground transition-colors`}
          title={t("tags.addTag")}
        >
          <TagIcon size={iconSize} />
          {tags.length === 0 ? t('tags.addTag') : '+'}
        </button>

        {open && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              onClick={(e) => e.stopPropagation()}
              className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-50 max-h-[80vh] overflow-y-auto md:absolute md:inset-auto md:left-0 md:top-9 md:translate-y-0 md:w-72 md:max-h-none md:overflow-visible bg-popover border border-border rounded-lg shadow-lg p-3"
            >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t('tags.yourTags')}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : allTags.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">{t('tags.none')}</div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-3 max-h-48 overflow-y-auto">
                {allTags.map((tag) => {
                  const attached = attachedIds.has(tag.id);
                  return (
                    <div
                      key={tag.id}
                      className="group inline-flex items-center gap-0.5 rounded-full transition-all"
                      style={{
                        backgroundColor: attached ? tag.color : `${tag.color}15`,
                        border: `1px solid ${tag.color}${attached ? '' : '40'}`,
                      }}
                    >
                      <button
                        onClick={() => toggleTag(tag)}
                        className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 text-xs font-medium"
                        style={{ color: attached ? 'white' : tag.color }}
                      >
                        {attached && <Check size={11} />}
                        {tag.name}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(t('tags.deleteConfirm', { name: tag.name }))) return;
                          try {
                            await tagsApi.delete(tag.id);
                            await loadAllTags();
                            await onChange();
                          } catch (err: any) {
                            // fallback
                          }
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/15 mr-0.5"
                        style={{ color: attached ? 'white' : tag.color }}
                        title="Delete tag permanently"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Create new
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createTag()}
                  className="flex-1 h-8 px-2.5 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  maxLength={50}
                />
                <button
                  onClick={createTag}
                  disabled={!newName.trim() || creating}
                  className="h-8 w-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center disabled:opacity-40"
                  title="Create and add"
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                      newColor === c ? 'ring-2 ring-offset-1 ring-ring' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

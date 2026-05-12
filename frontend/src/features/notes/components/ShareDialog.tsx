import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../../../components/ui/Dialog';
import { notesApi, type ShareInfo } from '../../../api/client';

interface Props {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Build a fully-qualified URL the user can copy/paste. */
function publicUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

export default function ShareDialog({ noteId, open, onOpenChange }: Props) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load current share state every time the dialog opens. Cheap (one GET) and
  // keeps the UI in sync if the user revoked from another tab.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notesApi.getShare(noteId)
      .then((s) => setShare(s))
      .catch((e: { detail?: string } | Error) => {
        toast.error(('detail' in e && e.detail) || 'Не удалось загрузить ссылку');
      })
      .finally(() => setLoading(false));
  }, [open, noteId]);

  const onCreate = async () => {
    setWorking(true);
    try {
      const s = await notesApi.createShare(noteId);
      setShare(s);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Не удалось создать ссылку');
    } finally {
      setWorking(false);
    }
  };

  const onRevoke = async () => {
    if (!confirm('Отозвать ссылку? Доступ по ней пропадёт.')) return;
    setWorking(true);
    try {
      await notesApi.revokeShare(noteId);
      setShare(null);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Не удалось отозвать ссылку');
    } finally {
      setWorking(false);
    }
  };

  const onCopy = async () => {
    if (!share) return;
    const url = publicUrl(share.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Поделиться заметкой"
      description="По ссылке смогут читать любые пользователи. Доступа к другим вашим данным у них не будет."
      size="md"
    >
      {loading ? (
        <div className="share-loading">
          <Loader2 size={16} className="animate-spin" />
          <span>Загрузка…</span>
        </div>
      ) : share ? (
        <div className="share-active">
          <div className="share-url-row">
            <input
              type="text"
              readOnly
              value={publicUrl(share.token)}
              className="share-url"
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Public link"
            />
            <button
              type="button"
              className="share-copy"
              onClick={onCopy}
              disabled={working}
              aria-label="Copy link"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>
          <button
            type="button"
            className="share-revoke"
            onClick={onRevoke}
            disabled={working}
          >
            <Trash2 size={14} />
            <span>Отозвать ссылку</span>
          </button>
        </div>
      ) : (
        <div className="share-empty">
          <p>Ссылка ещё не создана.</p>
          <button
            type="button"
            className="share-create"
            onClick={onCreate}
            disabled={working}
          >
            {working ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            <span>Создать публичную ссылку</span>
          </button>
        </div>
      )}
    </Dialog>
  );
}

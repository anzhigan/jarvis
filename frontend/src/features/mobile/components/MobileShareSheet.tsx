import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { notesApi, type ShareInfo } from '../../../api/client';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';
import { MobileListGroup, MobileListCell } from './MobileList';

interface Props {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function publicUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * Mobile-native equivalent of desktop ShareDialog. Same backend calls,
 * presented as a MobileBottomSheet with design-system tokens (`m-bs-*`,
 * `m-form-*`, `m-list-*`). Two states: empty (offer to create link),
 * active (show url + copy + revoke).
 */
export function MobileShareSheet({ noteId, open, onOpenChange }: Props) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notesApi.getShare(noteId)
      .then((s) => setShare(s))
      .catch((e: any) => {
        toast.error(e?.detail ?? 'Failed to load share link');
      })
      .finally(() => setLoading(false));
  }, [open, noteId]);

  const onCreate = async () => {
    setWorking(true);
    try {
      const s = await notesApi.createShare(noteId);
      setShare(s);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create share link');
    } finally {
      setWorking(false);
    }
  };

  const onRevoke = async () => {
    // Plain `confirm` is in-line with native UX on iOS; replaceable with
    // MobileConfirmSheet later if we want stricter design-system fidelity.
    if (!confirm('Revoke this link? Anyone holding it will lose access.')) return;
    setWorking(true);
    try {
      await notesApi.revokeShare(noteId);
      setShare(null);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to revoke link');
    } finally {
      setWorking(false);
    }
  };

  const onCopy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(publicUrl(share.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share note"
      description="A read-only public link. No other data is exposed."
    >
      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 28, color: 'var(--ink-4)',
        }}>
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>Loading…</span>
        </div>
      ) : share ? (
        <div className="m-share">
          <div className="m-share-url-row">
            <input
              type="text"
              readOnly
              value={publicUrl(share.token)}
              className="m-share-url"
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Public link"
            />
            <button
              type="button"
              className="m-share-copy"
              onClick={onCopy}
              disabled={working}
              aria-label="Copy link"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div style={{ marginTop: 18 }}>
            <MobileListGroup>
              <MobileListCell
                icon={<Trash2 size={15} />}
                iconColor="rust"
                title="Revoke link"
                destructive
                chevron
                onClick={onRevoke}
              />
            </MobileListGroup>
          </div>
        </div>
      ) : (
        <div className="m-share-empty">
          <p>No public link yet.</p>
          <MobileButton
            variant="filled"
            block
            icon={working ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            disabled={working}
            onClick={onCreate}
          >Create public link</MobileButton>
        </div>
      )}
    </MobileBottomSheet>
  );
}

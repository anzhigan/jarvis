import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Cross-platform confirmation modal. Replaces `confirm()` which doesn't
 * behave reliably on mobile browsers, inside swipe actions, etc.
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', danger = true, onCancel, onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          {danger && (
            <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-1">{title}</h3>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="h-10 px-4 text-sm rounded-md hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`h-10 px-5 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90 ${
              danger ? 'bg-destructive' : 'bg-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

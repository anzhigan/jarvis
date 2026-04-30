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

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', danger = true, onCancel, onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop flex items-center justify-center p-4"
      style={{ zIndex: 200 }}
      onClick={onCancel}
    >
      <div
        className="modal-panel max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          {danger && (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--destructive-soft)',
                color: 'var(--destructive)',
              }}
            >
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-1 tracking-tight">{title}</h3>
            {message && (
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{message}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="btn-icon btn-icon-sm flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 pb-5 pt-2 flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-md btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`btn btn-md ${danger ? 'btn-destructive' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

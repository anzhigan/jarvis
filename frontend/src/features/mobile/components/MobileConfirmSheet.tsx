import { MobileBottomSheet } from './MobileBottomSheet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Confirm-button label. */
  confirmLabel?: string;
  /** Apply danger styling (rust) to confirm button. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Bottom-sheet confirmation dialog. Used instead of `window.confirm` so
 * destructive flows match the rest of the mobile add/edit forms in look,
 * tap-target size, and animation.
 */
export function MobileConfirmSheet({
  open, onOpenChange, title, description, confirmLabel = 'Confirm',
  destructive, onConfirm,
}: Props) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={<>
        <button
          type="button"
          className="m-bs-btn m-bs-btn-ghost"
          onClick={() => onOpenChange(false)}
        >Cancel</button>
        <button
          type="button"
          className={`m-bs-btn ${destructive ? 'm-bs-btn-danger' : 'm-bs-btn-primary'}`}
          onClick={handleConfirm}
        >{confirmLabel}</button>
      </>}
    >
      {/* Empty body — title + description carry the message. */}
      <div style={{ height: 8 }} />
    </MobileBottomSheet>
  );
}

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Footer rendered outside the scrollable body (sticky). */
  footer?: React.ReactNode;
}

/**
 * Slide-up bottom sheet — used for all "Add …" forms on mobile (Way, Topic,
 * Note, Goal, Step, Go, Routine, Sprint). Backed by Radix Dialog so it gets
 * focus trap, body scroll lock, escape-to-close, and click-on-overlay-to-close
 * for free.
 */
export function MobileBottomSheet({
  open, onOpenChange, title, description, children, footer,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="m-bs-overlay" />
        <Dialog.Content className="m-bs-content">
          <header className="m-bs-head">
            <div>
              <Dialog.Title className="m-bs-title">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="m-bs-sub">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="m-bs-close" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>
          <div className="m-bs-body">{children}</div>
          {footer && <footer className="m-bs-foot">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

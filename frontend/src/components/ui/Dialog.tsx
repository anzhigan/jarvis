import * as RadixDialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideTitle?: boolean;
  className?: string;
}

const SIZE_WIDTH: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'min(420px, calc(100vw - 32px))',
  md: 'min(560px, calc(100vw - 32px))',
  lg: 'min(720px, calc(100vw - 32px))',
  xl: 'min(960px, calc(100vw - 32px))',
};

export function Dialog({
  open, onOpenChange, title, description, children, footer, size = 'md', hideTitle, className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ui-overlay" />
        <RadixDialog.Content
          className={cn('ui-dialog', className)}
          style={{ maxWidth: SIZE_WIDTH[size] }}
        >
          <div className="ui-dialog-header">
            {hideTitle ? (
              <VisuallyHidden><RadixDialog.Title>{title}</RadixDialog.Title></VisuallyHidden>
            ) : (
              <RadixDialog.Title className="ui-dialog-title">{title}</RadixDialog.Title>
            )}
            {description && (
              <RadixDialog.Description className="ui-dialog-desc">
                {description}
              </RadixDialog.Description>
            )}
            <RadixDialog.Close asChild>
              <IconButton
                size="sm"
                aria-label="Close"
                className="absolute top-3 right-3"
              >
                <X size={14} />
              </IconButton>
            </RadixDialog.Close>
          </div>
          <div className="ui-dialog-body">{children}</div>
          {footer && <div className="ui-dialog-footer">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;

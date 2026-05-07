import * as RadixDialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Content under the header. The drawer body scrolls. */
  children?: React.ReactNode;
  /** Pinned at the bottom (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Visual accent — colours the title border. */
  accent?: 'notes' | 'goals' | 'routines' | 'sprints' | 'analysis';
  hideTitle?: boolean;
  className?: string;
}

/**
 * Right-side slide-over panel for entity detail views.
 *
 * Built on Radix Dialog (modal=true so backdrop captures focus and click-out
 * dismisses), but styled as a 420px-wide drawer that animates in from the
 * right edge. Use cases: goal detail, routine detail, sprint detail.
 */
export function Drawer({
  open, onOpenChange, title, description, children, footer, accent, hideTitle, className,
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ui-overlay" />
        <RadixDialog.Content
          className={cn('ui-drawer', className)}
          data-accent={accent}
        >
          <header className="ui-drawer-head">
            {hideTitle ? (
              <VisuallyHidden><RadixDialog.Title>{title}</RadixDialog.Title></VisuallyHidden>
            ) : (
              <RadixDialog.Title className="ui-drawer-title">{title}</RadixDialog.Title>
            )}
            {description && (
              <RadixDialog.Description className="ui-drawer-desc">
                {description}
              </RadixDialog.Description>
            )}
            <RadixDialog.Close asChild>
              <IconButton size="sm" aria-label="Close" className="ui-drawer-close">
                <X size={14} />
              </IconButton>
            </RadixDialog.Close>
          </header>
          <div className="ui-drawer-body">{children}</div>
          {footer && <div className="ui-drawer-foot">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DrawerClose = RadixDialog.Close;

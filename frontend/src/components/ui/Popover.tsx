import * as RadixPopover from '@radix-ui/react-popover';
import { cn } from '../../lib/cn';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode | ((args: { close: () => void }) => React.ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Popover({ trigger, children, open, onOpenChange, side = 'bottom', align = 'start', className }: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className={cn('ui-popover', className)}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
        >
          {typeof children === 'function'
            ? children({ close: () => onOpenChange?.(false) })
            : children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export const PopoverClose = RadixPopover.Close;

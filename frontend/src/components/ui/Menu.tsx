import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

/* ───────── Dropdown ───────── */

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function Dropdown({ trigger, children, align = 'end', side = 'bottom', className }: DropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn('ui-menu', className)}
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface MenuItemProps {
  onSelect?: (e: Event) => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  shortcut?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function MenuItem({ onSelect, disabled, tone = 'default', shortcut, icon, children }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className="ui-menu-item"
      data-tone={tone === 'default' ? undefined : tone}
      disabled={disabled}
      onSelect={onSelect}
    >
      {icon && <span className="flex items-center justify-center w-4 h-4 text-[var(--fg-tertiary)]">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="ui-menu-shortcut">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenu.Label className="ui-menu-label">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="ui-menu-separator" />;
}

interface MenuCheckProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}

export function MenuCheck({ checked, onChange, children }: MenuCheckProps) {
  return (
    <DropdownMenu.CheckboxItem
      className="ui-menu-item"
      checked={checked}
      onCheckedChange={onChange}
    >
      <span className="flex items-center justify-center w-4 h-4">
        {checked && <Check size={12} />}
      </span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

interface MenuSubProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function MenuSub({ trigger, children }: MenuSubProps) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="ui-menu-item">
        <span className="flex-1">{trigger}</span>
        <ChevronRight size={12} className="text-[var(--fg-faint)]" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="ui-menu" sideOffset={4}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/* ───────── Context (right-click) ───────── */

interface ContextProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function Context({ trigger, children }: ContextProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{trigger}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="ui-menu">{children}</ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface ContextItemProps {
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  shortcut?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function ContextItem({ onSelect, disabled, tone = 'default', shortcut, icon, children }: ContextItemProps) {
  return (
    <ContextMenu.Item
      className="ui-menu-item"
      data-tone={tone === 'default' ? undefined : tone}
      disabled={disabled}
      onSelect={onSelect}
    >
      {icon && <span className="flex items-center justify-center w-4 h-4 text-[var(--fg-tertiary)]">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="ui-menu-shortcut">{shortcut}</span>}
    </ContextMenu.Item>
  );
}

export function ContextSeparator() {
  return <ContextMenu.Separator className="ui-menu-separator" />;
}

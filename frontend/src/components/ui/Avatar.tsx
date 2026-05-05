import * as RadixAvatar from '@radix-ui/react-avatar';
import { cn } from '../../lib/cn';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name?.charAt(0).toUpperCase() ?? '?';
  return (
    <RadixAvatar.Root
      className={cn('ui-avatar', className)}
      data-size={size === 'md' ? undefined : size}
    >
      {src && <RadixAvatar.Image src={src} alt={name ?? 'avatar'} />}
      <RadixAvatar.Fallback>{initials}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}

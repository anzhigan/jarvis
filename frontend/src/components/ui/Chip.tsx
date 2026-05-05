import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: 'default' | 'muted';
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { className, active, tone = 'default', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ui-chip', className)}
      data-active={active || undefined}
      data-tone={tone === 'default' ? undefined : tone}
      {...rest}
    />
  );
});

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export function Tag({ className, color, style, ...rest }: TagProps) {
  return (
    <span
      className={cn('ui-tag', className)}
      style={color ? { color, background: `${color}1F`, ...style } : style}
      {...rest}
    />
  );
}

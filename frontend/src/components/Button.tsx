/**
 * Button — single primitive used across the entire app.
 *
 * Usage:
 *   <Button>Default</Button>
 *   <Button variant="primary">Save</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 *   <Button variant="destructive" loading>Delete</Button>
 *   <Button variant="ghost" size="icon"><Pencil size={14} /></Button>
 */
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'secondary', size = 'md', loading, fullWidth, className = '', children, disabled, ...rest }, ref) => {
    const isIcon = size.startsWith('icon');
    const baseClass = isIcon
      ? `btn-icon ${size === 'icon-sm' ? 'btn-icon-sm' : size === 'icon-lg' ? 'btn-icon-lg' : ''}`
      : `btn btn-${size} btn-${variant}`;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClass} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...rest}
      >
        {loading ? <Loader2 size={isIcon ? 14 : 14} className="animate-spin" /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

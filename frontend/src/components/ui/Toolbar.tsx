import { cn } from '../../lib/cn';

interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Toolbar({ className, ...rest }: ToolbarProps) {
  return <div className={cn('ui-toolbar', className)} {...rest} />;
}

export function ToolbarDivider() {
  return <span className="ui-toolbar-divider" aria-hidden />;
}

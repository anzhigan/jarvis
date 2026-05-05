import { cn } from '../../lib/cn';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  keys?: string[];
}

const keyDisplay: Record<string, string> = {
  cmd: '⌘', meta: '⌘', mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧',
  enter: '↵', up: '↑', down: '↓', left: '←', right: '→',
  esc: 'Esc', escape: 'Esc', tab: 'Tab', space: 'Space',
};

export function Kbd({ keys, children, className, ...rest }: KbdProps) {
  if (keys && keys.length) {
    return (
      <span className={cn('inline-flex items-center gap-0.5', className)} {...rest}>
        {keys.map((k, i) => (
          <kbd key={i} className="ui-kbd">{keyDisplay[k.toLowerCase()] ?? k.toUpperCase()}</kbd>
        ))}
      </span>
    );
  }
  return <kbd className={cn('ui-kbd', className)} {...rest}>{children}</kbd>;
}

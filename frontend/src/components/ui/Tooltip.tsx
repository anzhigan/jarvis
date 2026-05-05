import * as RadixTooltip from '@radix-ui/react-tooltip';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delay?: number;
  shortcut?: string[];
}

export function Tooltip({ content, children, side = 'top', align = 'center', delay = 200, shortcut }: TooltipProps) {
  if (!content && !shortcut) return <>{children}</>;
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="ui-tooltip" side={side} align={align} sideOffset={6}>
          <span className="inline-flex items-center gap-1.5">
            {content}
            {shortcut && shortcut.length > 0 && (
              <span className="ml-1 inline-flex gap-0.5 opacity-70">
                {shortcut.map((k, i) => (
                  <span key={i} className="text-[10px] font-mono">{k}</span>
                ))}
              </span>
            )}
          </span>
          <RadixTooltip.Arrow className="ui-tooltip-arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;

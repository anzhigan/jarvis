import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import './ai.css';

type ActionKey = 'quiz' | 'tasks_extract' | 'summarize';

interface MenuItem {
  key: ActionKey;
  title: string;
  sub: string;
  Icon: typeof Sparkles;
  available: boolean;  // false = greyed-out, "coming soon"
}

interface Props {
  /** Short label for the "Context: ..." footer at the bottom of the menu. */
  contextLabel?: string;
  onSelect: (action: ActionKey) => void;
  /**
   * Which actions are wired up. Items not in this set are rendered but
   * disabled, so users see them coming. Defaults to ['quiz'] for Phase 3.
   */
  enabledActions?: ActionKey[];
}

const ALL_ITEMS: MenuItem[] = [
  {
    key: 'quiz',
    title: 'Quiz',
    sub: 'проверь знания по этой заметке',
    Icon: Sparkles,
    available: true,
  },
];

export function AIMenuTrigger({
  contextLabel,
  onSelect,
  enabledActions = ['quiz'],
}: Props) {
  const [open, setOpen] = useState(false);

  const handleClick = (key: ActionKey) => {
    setOpen(false);
    onSelect(key);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="ai-trigger"
          data-open={open || undefined}
          aria-label="AI actions"
        >
          <Sparkles size={13} className="ai-trigger__spk" />
          <span className="ai-trigger__label">AI</span>
          <ChevronDown size={11} className="ai-trigger__chev" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="ai-menu"
          align="end"
          sideOffset={6}
        >
          {ALL_ITEMS.map((item) => {
            const enabled = item.available && enabledActions.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                className="ai-menu__item"
                disabled={!enabled}
                onClick={() => enabled && handleClick(item.key)}
              >
                <span className="ai-menu__item-icon" data-tone={item.key}>
                  <item.Icon size={13} />
                </span>
                <span className="ai-menu__item-text">
                  <span className="ai-menu__item-title">
                    {item.title}
                    {!enabled && <span className="ai-menu__soon">coming soon</span>}
                  </span>
                  <span className="ai-menu__item-sub">{item.sub}</span>
                </span>
              </button>
            );
          })}
          {contextLabel && (
            <>
              <div className="ai-menu__divider" />
              <div className="ai-menu__context">
                <span className="ai-menu__context-label">Context</span>
                <span className="ai-menu__context-value">{contextLabel}</span>
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

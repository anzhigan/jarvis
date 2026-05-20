import * as Dialog from '@radix-ui/react-dialog';

export interface ActionSheetItem {
  /** Visible label. */
  label: string;
  /** Marks the row as destructive — rust color + weight 500. */
  destructive?: boolean;
  /** Disable the row (greyed, no-op on tap). */
  disabled?: boolean;
  /** Called when the user picks this item. The sheet auto-closes
   *  afterwards — you don't have to do `onOpenChange(false)`. */
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional eyebrow above the items (small, semibold, centered). */
  title?: string;
  /** Optional explanatory message between the title and the first item —
   *  use for destructive warnings ("This can't be undone"). */
  message?: string;
  /** Array of choices. Order matters; destructive usually goes first. */
  actions: ActionSheetItem[];
  /** Label for the bottom Cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
}

/**
 * iOS-native action sheet. Used for:
 *   - long-press / "•••" context menus on cards (Edit / Duplicate / Delete)
 *   - destructive confirmation with multiple severity levels
 *   - AI plan menu (Full plan / Fill dates / Rebalance dates)
 *
 * For a single yes/no destructive confirm, prefer MobileConfirmSheet —
 * it's friendlier when there is only one path forward. Use this when
 * there are 2+ choices.
 */
export function MobileActionSheet({
  open, onOpenChange, title, message, actions, cancelLabel = 'Cancel',
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="m-as-overlay" />
        <Dialog.Content className="m-as-content" aria-describedby={undefined}>
          {/* Hidden title for a11y — UI shows it inside m-as-head when present.
              Radix requires DialogTitle even when visually we customise. */}
          <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            {title ?? 'Choose an action'}
          </Dialog.Title>
          <div className="m-as-group">
            {(title || message) && (
              <div className="m-as-head">
                {title && <div className="m-as-head__title">{title}</div>}
                {message && <div className="m-as-head__msg">{message}</div>}
              </div>
            )}
            {actions.map((a, i) => (
              <button
                key={i}
                type="button"
                className="m-as-item"
                data-destructive={a.destructive || undefined}
                disabled={a.disabled}
                onClick={() => {
                  if (a.disabled) return;
                  a.onSelect();
                  onOpenChange(false);
                }}
              >{a.label}</button>
            ))}
          </div>
          <Dialog.Close asChild>
            <button type="button" className="m-as-cancel">{cancelLabel}</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

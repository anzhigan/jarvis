import type { ButtonHTMLAttributes } from 'react';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}

/**
 * iOS-style toggle. 51×31pt pill, moss-on. Use inside list cells via
 * `<MobileListCell trailing={<MobileSwitch ...>} ...>`. Click is committal —
 * there's no separate "save" step.
 */
export function MobileSwitch({
  checked, onCheckedChange, disabled, 'aria-label': ariaLabel, ...rest
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="m-switch"
      data-on={checked || undefined}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onCheckedChange(!checked);
      }}
      {...rest}
    />
  );
}

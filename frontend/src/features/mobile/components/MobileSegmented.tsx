interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** 2-5 mutually-exclusive options. Single source of truth for both the
   *  labels and the order. */
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional accessible label — falls back to "segmented control". */
  ariaLabel?: string;
}

/**
 * iOS-native segmented control. Cream track with a white sliding indicator
 * behind the active option. Use for mutually-exclusive, single-screen mode
 * switches (Kanban / Go view, time-period 7d/30d/90d, etc.) — for
 * permanent route switching prefer the bottom tab bar.
 */
export function MobileSegmented<T extends string>({
  options, value, onChange, ariaLabel = 'segmented control',
}: Props<T>) {
  return (
    <div className="m-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="m-seg__btn"
          role="radio"
          aria-checked={value === o.value}
          data-on={value === o.value || undefined}
          onClick={() => onChange(o.value)}
        >{o.label}</button>
      ))}
    </div>
  );
}

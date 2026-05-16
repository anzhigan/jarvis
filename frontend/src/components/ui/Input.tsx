import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = 'md', leadingIcon, trailingIcon, containerClassName, ...rest },
  ref,
) {
  return (
    <label
      className={cn('ui-input', containerClassName)}
      data-size={inputSize === 'md' ? undefined : inputSize}
    >
      {leadingIcon}
      <input ref={ref} className={cn('flex-1 min-w-0', className)} {...rest} />
      {trailingIcon}
    </label>
  );
});

/** Date input with an inline "clear" affordance. The `<input type=date>` UA
 *  chrome already varies between browsers; this wrapper gives one canonical
 *  way to reset start/due/etc. back to `null` without removing the field. */
interface DateInputProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  /** Optional minimum / maximum constraints (e.g. due ≥ start). */
  min?: string;
  max?: string;
  disabled?: boolean;
}

export function DateInput({ value, onChange, ariaLabel, min, max, disabled }: DateInputProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        min={min}
        max={max}
        disabled={disabled}
        containerClassName="flex-1"
      />
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Clear date"
        title="Clear date"
        disabled={disabled || !value}
        style={{
          flexShrink: 0,
          width: 24, height: 24,
          padding: 0,
          background: 'transparent',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--r-control)',
          color: 'var(--ink-4)',
          cursor: value ? 'pointer' : 'default',
          opacity: value ? 1 : 0.35,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, containerClassName, ...rest },
  ref,
) {
  return (
    <label className={cn('ui-input', containerClassName)} data-size="textarea">
      <textarea ref={ref} className={cn('flex-1 min-w-0 resize-none', className)} {...rest} />
    </label>
  );
});

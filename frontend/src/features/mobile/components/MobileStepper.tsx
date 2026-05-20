import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  /** Inclusive floor. */
  min?: number;
  /** Inclusive ceiling. */
  max?: number;
  /** Increment / decrement size. */
  step?: number;
  onChange: (next: number) => void;
  /** Optional custom display formatter — e.g. `(v) => \`${v} km\``. Default
   *  prints the raw number. */
  format?: (value: number) => string;
  disabled?: boolean;
}

/**
 * Integer stepper with − / value / + tappable buttons. Used for routine
 * targets, sprint duration, count fields — anywhere the value is a small
 * positive integer the user nudges rather than types.
 */
export function MobileStepper({
  value, min, max, step = 1, onChange, format, disabled,
}: Props) {
  const atMin = typeof min === 'number' && value <= min;
  const atMax = typeof max === 'number' && value >= max;
  return (
    <div className="m-stepper" role="group">
      <button
        type="button"
        className="m-stepper__btn"
        disabled={disabled || atMin}
        onClick={() => onChange(value - step)}
        aria-label="Decrement"
      ><Minus size={14} /></button>
      <span className="m-stepper__sep" aria-hidden />
      <span className="m-stepper__val">{format ? format(value) : value}</span>
      <span className="m-stepper__sep" aria-hidden />
      <button
        type="button"
        className="m-stepper__btn"
        disabled={disabled || atMax}
        onClick={() => onChange(value + step)}
        aria-label="Increment"
      ><Plus size={14} /></button>
    </div>
  );
}

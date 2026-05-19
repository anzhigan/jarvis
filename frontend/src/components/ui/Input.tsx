import { forwardRef, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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

/** Custom date input with a popover calendar styled to the design system —
 *  replaces the browser's native `<input type=date>` UA chrome (which differs
 *  across platforms and is hard to mask). Empty state shows an italic "нет
 *  даты" trigger; filled state shows the formatted date. X clears to null. */
interface DateInputProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  /** Optional minimum / maximum constraints (e.g. due ≥ start). */
  min?: string;
  max?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function ymdStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateDisplay(s: string): string {
  const d = parseYmd(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DateInput({ value, onChange, ariaLabel, min, max, disabled }: DateInputProps) {
  const empty = !value;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="ui-date-trigger"
            data-empty={empty || undefined}
            disabled={disabled}
            aria-label={ariaLabel ?? (empty ? 'Pick date' : 'Change date')}
          >
            {empty ? 'нет даты' : fmtDateDisplay(value)}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="ui-cal-pop"
            sideOffset={6}
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <CalendarMonth
              value={value}
              min={min}
              max={max}
              onPick={(s) => { onChange(s); setOpen(false); }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Clear date"
        title="Clear date"
        disabled={disabled || empty}
        className="ui-date-clear"
      >
        <X size={11} />
      </button>
    </div>
  );
}

/** Single-month calendar grid. Weeks Mon-first; today gets a dot, selected
 *  date gets the indigo fill. Out-of-month days are dimmed for orientation. */
function CalendarMonth({
  value, min, max, onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (ymdString: string) => void;
}) {
  const selected = parseYmd(value);
  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const minD = parseYmd(min ?? '');
  const maxD = parseYmd(max ?? '');

  // When the field is empty AND has a `min` constraint, open the calendar
  // on `min`'s month so the user lands directly on the first allowed day
  // (typical case: end-date picker for a goal/step/go whose start is set —
  // we don't want to scroll back through months that are all disabled).
  const [view, setView] = useState(() => {
    const anchor = selected ?? minD ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // Build the 6-row grid starting from the Monday on/before the 1st of the month.
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    // JS getDay: 0=Sun..6=Sat → shift so Mon=0..Sun=6
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [view]);

  const prevMonth = () => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  const nextMonth = () => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  const goToday = () => {
    setView(new Date(today.getFullYear(), today.getMonth(), 1));
    onPick(ymdStr(today));
  };

  return (
    <div className="ui-cal">
      <header className="ui-cal-head">
        <button type="button" className="ui-cal-nav" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <div className="ui-cal-title">
          {MONTH_NAMES[view.getMonth()]} {view.getFullYear()}
        </div>
        <button type="button" className="ui-cal-nav" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={14} />
        </button>
      </header>
      <div className="ui-cal-weekdays">
        {WEEKDAY_NAMES.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="ui-cal-grid">
        {cells.map((d) => {
          const outside = d.getMonth() !== view.getMonth();
          const isToday = d.getTime() === today.getTime();
          const isSelected = selected != null
            && d.getFullYear() === selected.getFullYear()
            && d.getMonth() === selected.getMonth()
            && d.getDate() === selected.getDate();
          const disabled = (minD && d < minD) || (maxD && d > maxD);
          return (
            <button
              key={ymdStr(d)}
              type="button"
              className="ui-cal-cell"
              data-outside={outside || undefined}
              data-today={isToday || undefined}
              data-selected={isSelected || undefined}
              disabled={!!disabled}
              onClick={() => onPick(ymdStr(d))}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <footer className="ui-cal-foot">
        <button type="button" className="ui-cal-link" onClick={goToday}>Today</button>
      </footer>
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

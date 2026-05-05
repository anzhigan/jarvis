import { forwardRef } from 'react';
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

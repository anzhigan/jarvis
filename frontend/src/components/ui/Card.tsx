import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('ui-card', className)}
      data-interactive={interactive || undefined}
      {...rest}
    />
  );
});

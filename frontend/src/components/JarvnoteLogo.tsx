/**
 * Jarvnote logo — minimal, geometric, recognizable at small sizes.
 * Concept: stacked horizontal lines suggesting a notebook + an arrow indicating action.
 */
type Variant = 'white' | 'mono' | 'brand';

interface Props {
  size?: number;
  variant?: Variant;
  className?: string;
}

export default function JarvnoteLogo({ size = 24, variant = 'brand', className = '' }: Props) {
  const fg = variant === 'white' ? '#FFFFFF' :
             variant === 'mono' ? 'currentColor' :
             'var(--primary)';

  const stroke = 8.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Three notebook lines, decreasing */}
      <line x1="20" y1="32" x2="80" y2="32" stroke={fg} strokeWidth={stroke} strokeLinecap="round" />
      <line x1="20" y1="50" x2="68" y2="50" stroke={fg} strokeWidth={stroke} strokeLinecap="round" />
      <line x1="20" y1="68" x2="50" y2="68" stroke={fg} strokeWidth={stroke} strokeLinecap="round" />
      {/* Arrow tail — direction & action */}
      <path
        d="M 60 64 L 80 78 L 72 88"
        stroke={fg}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

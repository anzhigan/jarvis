/**
 * Jarvnote logo — Concept A (Mark with lines + arrow tail)
 *
 * Use as React component anywhere:
 *   <JarvnoteLogo size={40} />
 *   <JarvnoteLogo size={40} variant="dark" />  // for light backgrounds
 *
 * Same SVG is used to generate App Store icon (1024×1024) and home screen icons.
 */
type Variant = 'filled' | 'outline' | 'mono';

interface Props {
  size?: number;
  variant?: Variant;
  className?: string;
}

export default function JarvnoteLogo({ size = 32, variant = 'filled', className = '' }: Props) {
  const radius = size * 0.22;          // 22% rounded corner (iOS app icon style)
  const stroke = size * 0.085;         // line thickness scales with size

  const bgFill = variant === 'filled' ? '#5B5BD6' : variant === 'outline' ? 'none' : 'currentColor';
  const bgStroke = variant === 'outline' ? 'currentColor' : 'none';
  const fgColor = variant === 'filled' ? '#FFFFFF' : variant === 'outline' ? 'currentColor' : '#FFFFFF';

  // Three lines of decreasing length + a small arrow in the bottom-right.
  // Coordinates are in a 100×100 viewBox so the rendering is crisp at any size.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Jarvnote"
    >
      <rect
        x="0" y="0" width="100" height="100"
        rx={Math.round(radius / size * 100)}
        fill={bgFill}
        stroke={bgStroke}
        strokeWidth={variant === 'outline' ? 4 : 0}
      />
      {/* Three notes lines */}
      <path
        d="M 28 38 H 72 M 28 50 H 62 M 28 62 H 50"
        stroke={fgColor}
        strokeWidth={stroke / size * 100}
        strokeLinecap="round"
      />
      {/* Arrow tail (action) — small kick in bottom-right */}
      <path
        d="M 56 62 L 72 70 L 68 80"
        stroke={fgColor}
        strokeWidth={stroke / size * 100}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

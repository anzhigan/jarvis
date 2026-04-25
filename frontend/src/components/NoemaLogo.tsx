interface Props {
  size?: number;
  className?: string;
}

export default function NoemaLogo({ size = 32, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Noema"
    >
      {/* Outer spiral */}
      <path
        d="M76 25C53 17 28 29 20 52c-8 24 5 49 29 57 24 8 49-5 57-29 7-22-3-46-24-56"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Inner spiral */}
      <path
        d="M74 31c-17-5-34 5-39 21-5 17 5 34 21 39 17 5 34-5 39-21 4-14-2-29-14-36"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Arrow tip — represents loop of learning */}
      <path
        d="M88 24l18 7-13 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

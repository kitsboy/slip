/**
 * The slip mark, drawn not typed, so it does not change with the operating system's font.
 * Colour is currentColor. Never place it on an accent fill — the ink is the point.
 * P-1: used in the header only when ?skin=v2. The favicon stays as it is this pass.
 */

type BrandProps = {
  variant: 'wordmark' | 'mark';
  height: number;
  title?: string;
};

export default function Brand({ variant, height, title = 'slip' }: BrandProps) {
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 32 32"
        height={height}
        width={height}
        role="img"
        aria-label={title}
        fill="none"
      >
        <path
          d="M6 3H26V25A2.5 2.5 0 0 0 21 25A2.5 2.5 0 0 0 16 25A2.5 2.5 0 0 0 11 25A2.5 2.5 0 0 0 6 25Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M10 10H22M10 15H17"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const width = Math.round((height * 64) / 38);
  return (
    <svg
      viewBox="0 0 64 38"
      height={height}
      width={width}
      role="img"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 12H10a3.5 3.5 0 0 0 0 7a3.5 3.5 0 0 1 0 7H6.5" />
      <path d="M24 4V26" />
      <path d="M34 12V26" />
      <circle cx="34" cy="5.5" r="2.4" fill="currentColor" stroke="none" />
      <path d="M44 12V34" />
      <path d="M44 12H51a7 7 0 0 1 0 14H44" />
    </svg>
  );
}

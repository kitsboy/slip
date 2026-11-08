/** C-19. Ink on a sunk track. Never the accent. */
export default function Progress({ value }: { value?: number }) {
  const known = typeof value === 'number';
  return (
    <div
      className={known ? 'v2-progress' : 'v2-progress v2-progress-busy'}
      role="progressbar"
      aria-valuenow={known ? value : undefined}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-label={known ? undefined : 'Working'}
    >
      <span style={known ? { width: `${Math.min(100, Math.max(0, value))}%` } : undefined} />
    </div>
  );
}

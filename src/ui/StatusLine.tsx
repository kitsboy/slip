export type StatusKind = 'waiting' | 'seen' | 'confirmed' | 'failed' | 'manual' | 'simulated';

/**
 * C-13. The word is passed in from the till. This line never decides that a
 * sale was paid.
 */
export default function StatusLine({
  state,
  word,
  detail,
}: {
  state: StatusKind;
  word: string;
  detail?: string;
}) {
  return (
    <p className={`v2-status v2-status-${state}`} role="status" aria-live="polite">
      <span className="v2-badge-dot" aria-hidden />
      <span className="v2-status-word">{word}</span>
      {detail ? <span className="v2-status-detail">{detail}</span> : null}
    </p>
  );
}

export type BadgeKind = 'good' | 'warn' | 'bad' | 'manual' | 'simulated';

/**
 * C-08. Dot plus a word. Manual is dashed, simulated is hatched — the shape
 * survives a black-and-white print. The word is passed in; this component
 * does not invent a status.
 */
export default function Badge({ kind, word }: { kind: BadgeKind; word: string }) {
  return (
    <span className={`v2-badge v2-badge-${kind}`}>
      <span className="v2-badge-dot" aria-hidden />
      {word}
    </span>
  );
}

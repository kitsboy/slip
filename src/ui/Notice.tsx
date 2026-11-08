import type { ReactNode } from 'react';

type Tone = 'info' | 'good' | 'warn' | 'bad';

/** C-16. A word, then a sentence. Bad is only for danger. */
export default function Notice({
  tone,
  word,
  children,
  action,
}: {
  tone: Tone;
  word: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`v2-notice v2-notice-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <strong>{word}</strong>
      <p>{children}</p>
      {action}
    </div>
  );
}

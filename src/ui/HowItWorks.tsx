/**
 * Three steps, for a person who has never used Bitcoin.
 *
 * The app used to open with a paragraph about custody, xpubs and API keys — accurate, and useless
 * to someone deciding whether they can use this at all. This answers the only three questions a
 * stranger has: what do I put in, what do I do at the counter, and where does the money go.
 */

interface Props {
  readonly onStart?: () => void;
  readonly onboarded: boolean;
}

const STEPS: ReadonlyArray<{ n: number; title: string; line: string }> = [
  {
    n: 1,
    title: 'Add your wallet',
    line: 'Copy one code from your wallet app. slip can see money arrive — it can never move it.',
  },
  {
    n: 2,
    title: 'Ring up the sale',
    line: 'What they bought and how much. Two taps, or scan the barcode.',
  },
  {
    n: 3,
    title: 'They pay you',
    line: 'They scan the code. The money lands in your wallet, not ours — and we take no cut.',
  },
];

export default function HowItWorks({ onStart, onboarded }: Props) {
  return (
    <div className="mt-6">
      <ol className="grid gap-2 sm:grid-cols-3" data-how-it-works>
        {STEPS.map((step) => (
          <li key={step.n} className="panel flex gap-3 p-3">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent text-xs font-semibold text-accent"
            >
              {step.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">{step.line}</p>
            </div>
          </li>
        ))}
      </ol>

      {onStart && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {onboarded ? 'Go to the till' : 'Set up my shop'}
          </button>
          <a className="btn btn-secondary" href="?demo=1" target="_blank" rel="noreferrer noopener">
            See it with pretend sales
          </a>
          <span className="text-xs text-secondary">
            {onboarded ? 'you are ready — go and sell something' : 'three short screens · about a minute'}
          </span>
        </div>
      )}
    </div>
  );
}

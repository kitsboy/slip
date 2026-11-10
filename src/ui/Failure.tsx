/**
 * A failure, said in full.
 *
 * slip has four ways to fail that a shopkeeper can actually meet: no rate, no network, the wrong
 * chain, and a wallet slip cannot read. Each of them used to arrive as one line of red text — the
 * message from whatever threw. A message is not an explanation: it does not say whether money moved,
 * and it does not say what to do next.
 *
 * So every failure here answers the same three questions in the same order:
 *   what happened   — the thing, in plain words, with no error code
 *   what is safe    — the state of the money, always the honest answer, even when it is "unknown"
 *   what to do      — one action, phrased as something a person can do in the shop
 *
 * `role="status"` and not `alert`: a shopkeeper mid-sale should be told, not shouted at. The block
 * never traps focus and never covers the till.
 */
export type FailureKind = 'rate' | 'network' | 'chain' | 'wallet';

const KINDS: Record<FailureKind, { title: (coin: string) => string; tone: string }> = {
  rate: { title: (coin) => `slip does not know what a ${coin} is worth`, tone: 'warn' },
  network: { title: () => 'slip cannot reach the network', tone: 'warn' },
  chain: { title: () => 'This wallet is on a different chain', tone: 'bad' },
  wallet: { title: () => 'slip cannot read this wallet', tone: 'bad' },
};

export default function Failure({
  kind,
  what,
  safe,
  next,
  detail,
  coin = 'Bitcoin',
}: {
  kind: FailureKind;
  /** The chain in the shop's own words. A Litecoin till must not be told about Bitcoin. */
  coin?: string;
  /** One plain sentence about what happened. */
  what: string;
  /** One plain sentence about the money. Never softened, never guessed. */
  safe: string;
  /** One thing the person can do now. */
  next: string;
  /** The raw message, small, for whoever is helping — never the headline. */
  detail?: string;
}) {
  const meta = KINDS[kind];
  return (
    <div className={`v2-failure v2-failure-${meta.tone}`} data-failure={kind} role="status">
      <p className="v2-failure-title">{meta.title(coin)}</p>
      <dl className="v2-failure-body">
        <div>
          <dt>What happened</dt>
          <dd>{what}</dd>
        </div>
        <div>
          <dt>What is safe</dt>
          <dd>{safe}</dd>
        </div>
        <div>
          <dt>What to do</dt>
          <dd>{next}</dd>
        </div>
      </dl>
      {detail ? <p className="v2-failure-detail">{detail}</p> : null}
    </div>
  );
}

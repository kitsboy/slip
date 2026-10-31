/**
 * Silent Payments (BIP-352): what slip can honestly do with an `sp1…` address.
 *
 * The hard truth, stated once and enforced everywhere: detecting a Silent Payment requires the
 * wallet's *scan key*, a private key. slip refuses private material by design, so it can never
 * watch an sp1 address. Any product claiming otherwise is holding your key.
 *
 * So slip treats an sp1 address as what it is: a receive destination. It validates it, shows it,
 * puts it in a BIP-21 QR and records the sale as a manual confirmation — because the merchant's
 * own wallet is the only thing that can say "that paid".
 */

export type SpNetwork = 'btc-mainnet' | 'btc-testnet';

export interface SpCheck {
  readonly ok: boolean;
  readonly network: SpNetwork | null;
  readonly reason: string | null;
}

/** sp1 = mainnet, tsp1 = testnet/signet family. Anything else is not a Silent Payment address. */
export function checkSilentPaymentAddress(raw: string): SpCheck {
  const text = (raw ?? '').trim();
  if (text === '') return { ok: false, network: null, reason: 'that is empty' };

  if (/^sp1[02-9ac-hj-np-z]{20,120}$/i.test(text)) {
    return { ok: true, network: 'btc-mainnet', reason: null };
  }
  if (/^tsp1[02-9ac-hj-np-z]{20,120}$/i.test(text)) {
    return { ok: true, network: 'btc-testnet', reason: null };
  }
  if (/^(bc1|tb1|bcrt1)/i.test(text)) {
    return { ok: false, network: null, reason: 'that is an ordinary on-chain address, not a Silent Payments one' };
  }
  // Bech32 uses a restricted alphabet; a stray 'b', 'i' or 'o' means a typo, not a network.
  if (/^[st]?sp1/i.test(text)) {
    return { ok: false, network: null, reason: 'a Silent Payments address contains no b, i or o — check for a typo' };
  }
  return { ok: false, network: null, reason: 'that does not look like a Silent Payments address (sp1… or tsp1…)' };
}

export interface SpCapability {
  /** Always false today, and not for want of effort: without a scan key there is nothing to scan. */
  readonly canWatch: false;
  readonly explanation: string;
  readonly confirmation: 'manual';
}

export function silentPaymentCapability(): SpCapability {
  return {
    canWatch: false,
    explanation:
      'Silent Payments can only be detected with your wallet\'s scan key, which slip will never hold. ' +
      'Every sp1 sale is therefore recorded as a manual confirmation: your wallet says it paid, not slip.',
    confirmation: 'manual',
  };
}

/** BIP-21 for a silent payment destination — the QR a customer actually scans. */
export function silentPaymentUri(address: string, atoms: bigint | null): string {
  const check = checkSilentPaymentAddress(address);
  if (!check.ok) throw new Error(check.reason ?? 'not a Silent Payments address');
  if (atoms === null) return `bitcoin:${address}`;
  if (atoms <= 0n) throw new Error('a payment request needs a positive amount');
  const whole = atoms / 100_000_000n;
  const frac = (atoms % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `bitcoin:${address}?amount=${whole}${frac ? `.${frac}` : ''}`;
}

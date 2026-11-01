/**
 * Esplora chain-data provider — public by default, swappable later.
 *
 * What this is for: answering "has this address been paid?" and "is this address already
 * used?" without a server of our own. What it costs: the provider learns which addresses
 * we ask about, and our IP. That trade is stated in the UI, and the endpoint is a setting,
 * so pointing slip at your own Esplora/electrs is a paste, not a rebuild.
 *
 * Deliberate limits:
 *  - read-only GETs, nothing else;
 *  - a hard timeout, so a dead provider cannot hang a till;
 *  - every answer carries its source and the moment it was fetched. A cached number with no
 *    age is how a merchant sells against a stale price.
 */

import type { NetworkId } from '../network';

export interface ExplorerTarget {
  readonly baseUrl: string;
  /** 'public' = a third party we do not control; 'custom' = the merchant's own node. */
  readonly kind: 'public' | 'custom';
}

/** Public defaults. `null` means "no public provider known — you must supply one". */
export const PUBLIC_ESPLORA: Readonly<Record<NetworkId, string | null>> = {
  'btc-mainnet': 'https://mempool.space/api',
  'btc-signet': 'https://mempool.space/signet/api',
  'btc-testnet4': 'https://mempool.space/testnet4/api',
  'btc-testnet3': 'https://mempool.space/testnet/api',
  'ltc-mainnet': 'https://litecoinspace.org/api',
  // Verified: this endpoint's genesis hash is 4966625a…e3e29a0 — Litecoin testnet4, the only live
  // Litecoin testnet. (Its /testnet4 alias answers too; /testnet is the documented path.)
  'ltc-testnet': 'https://litecoinspace.org/testnet/api',
};

export function defaultTarget(networkId: NetworkId): ExplorerTarget | null {
  const baseUrl = PUBLIC_ESPLORA[networkId];
  return baseUrl ? { baseUrl, kind: 'public' } : null;
}

export function targetFor(networkId: NetworkId, customUrl?: string): ExplorerTarget | null {
  const custom = (customUrl ?? '').trim();
  if (custom) return { baseUrl: custom.replace(/\/+$/, ''), kind: 'custom' };
  return defaultTarget(networkId);
}

export interface AddressActivity {
  readonly address: string;
  /** Total ever received, in atoms (chain + mempool). */
  readonly receivedAtoms: bigint;
  /** Confirmed on-chain receipts only — what "confirmed" is allowed to mean. */
  readonly chainReceivedAtoms: bigint;
  /** Receipts still in the mempool — a 0-conf promise, never a confirmation. */
  readonly mempoolReceivedAtoms: bigint;
  /** Total ever spent, in atoms (chain + mempool). */
  readonly spentAtoms: bigint;
  readonly txCount: number;
  /** True when anything has ever touched this address. */
  readonly used: boolean;
  /** Confirmed balance = received - spent on chain only. */
  readonly confirmedBalanceAtoms: bigint;
  readonly source: ExplorerTarget;
  readonly fetchedAt: string;
}

export class ExplorerError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ExplorerError';
    if (status !== undefined) this.status = status;
  }
}

export interface FetchLike {
  (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

interface EsploraAddressStats {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number; tx_count?: number };
  mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number; tx_count?: number };
}

/** Reads one address's totals. Throws ExplorerError with a sentence a human can act on. */
export async function fetchAddressActivity(
  target: ExplorerTarget,
  address: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; signal?: AbortSignal; now?: () => Date } = {},
): Promise<AddressActivity> {
  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = opts.signal ?? controller.signal;

  try {
    const url = `${target.baseUrl}/address/${encodeURIComponent(address)}`;
    const res = await doFetch(url, { signal, headers: { accept: 'application/json' } });

    if (!res.ok) {
      throw new ExplorerError(
        res.status === 400
          ? 'the explorer rejected that address'
          : `the explorer answered ${res.status}`,
        res.status,
      );
    }

    let body: EsploraAddressStats;
    try {
      body = (await res.json()) as EsploraAddressStats;
    } catch {
      throw new ExplorerError('the explorer sent something that is not JSON — is that URL an Esplora API?');
    }

    const chain = body.chain_stats ?? {};
    const mempool = body.mempool_stats ?? {};
    const chainReceived = BigInt(chain.funded_txo_sum ?? 0);
    const mempoolReceived = BigInt(mempool.funded_txo_sum ?? 0);
    const funded = chainReceived + mempoolReceived;
    const spent = BigInt(chain.spent_txo_sum ?? 0) + BigInt(mempool.spent_txo_sum ?? 0);
    const txCount = (chain.tx_count ?? 0) + (mempool.tx_count ?? 0);
    const confirmed = BigInt(chain.funded_txo_sum ?? 0) - BigInt(chain.spent_txo_sum ?? 0);

    return {
      address,
      receivedAtoms: funded,
      chainReceivedAtoms: chainReceived,
      mempoolReceivedAtoms: mempoolReceived,
      spentAtoms: spent,
      txCount,
      used: txCount > 0 || funded > 0n,
      confirmedBalanceAtoms: confirmed > 0n ? confirmed : 0n,
      source: target,
      fetchedAt: (opts.now ?? (() => new Date()))().toISOString(),
    };
  } catch (e) {
    if (e instanceof ExplorerError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ExplorerError(`the explorer did not answer within ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new ExplorerError(e instanceof Error ? e.message : 'could not reach the explorer');
  } finally {
    clearTimeout(timer);
  }
}

/** Formats an atom amount for the UI without touching floats. */
export function formatAtoms(atoms: bigint, coin: 'btc' | 'ltc' = 'btc'): string {
  const unit = BigInt(100_000_000);
  const whole = atoms / unit;
  const frac = (atoms % unit).toString().padStart(8, '0').replace(/0+$/, '');
  const name = coin === 'btc' ? 'BTC' : 'LTC';
  return frac.length > 0 ? `${whole}.${frac} ${name}` : `${whole} ${name}`;
}

/**
 * A simulated explorer, so the demo never touches the network.
 *
 * It answers like Esplora and "confirms" a sale a few seconds after the address is first looked at,
 * which is what makes the demo watchable inside a minute. Every response is generated locally:
 * nothing leaves the device, and the demo banner says so.
 *
 * Installed only on `?demo=1`, by wrapping `window.fetch` — so no panel, provider or future feature
 * can accidentally reach the internet from a demo.
 */

const PAID_AFTER_MS = 4_000;
const DEMO_TILL_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

interface Sale {
  readonly firstAsked: number;
  readonly atoms: bigint;
}

const sales = new Map<string, Sale>();
const pending = new Map<string, { atoms: bigint; createdAt: number }>();

/** Called when the demo till creates an invoice, so the simulator knows what was asked for. */
export function registerDemoSale(address: string, atoms: bigint): void {
  pending.set(address, { atoms, createdAt: Date.now() });
}

function stats(funded: bigint): unknown {
  return {
    chain_stats: { funded_txo_sum: Number(funded), spent_txo_sum: 0, tx_count: funded > 0n ? 1 : 0 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
  };
}

export function installFakeExplorer(): () => void {
  const original = window.fetch.bind(window);

  const fake = (url: string): Response => {
    const address = decodeURIComponent(url.split('/address/')[1]?.split('/')[0] ?? '');
    const now = Date.now();

    if (address === DEMO_TILL_ADDRESS) {
      return new Response(JSON.stringify(stats(1_250_000n)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    let sale = sales.get(address);
    if (!sale) {
      const asked = pending.get(address);
      sale = { firstAsked: now, atoms: asked?.atoms ?? 100_000n };
      sales.set(address, sale);
    }

    const settled = now - sale.firstAsked > PAID_AFTER_MS;
    return new Response(JSON.stringify(stats(settled ? sale.atoms : 0n)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/mempool\.space|litecoinspace|rates\.example/.test(url)) {
      return Promise.resolve(fake(url));
    }
    return original(input, init);
  }) as typeof window.fetch;

  window.fetch = wrapped;
  return () => {
    window.fetch = original;
  };
}

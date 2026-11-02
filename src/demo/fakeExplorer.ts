/**
 * A simulated internet, so the demo never touches the network.
 *
 * The banner promises that nothing leaves the device. That promise has to hold for every request the
 * app can make — not only the explorer: a Lightning address typed into the till, a price lookup, a
 * day stamp to a public calendar. So in demo mode this wrapper intercepts *all* off-origin requests
 * and answers them locally. Anything it does not recognise gets a clean 404 rather than a silent
 * trip to the real internet.
 *
 * Every response is generated here. The shop is pretend, and it says so.
 */

const PAID_AFTER_MS = 4_000;
const DEMO_TILL_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const DEMO_LNURL_HOST = 'https://demo.lnurl.local';

interface Sale {
  readonly firstAsked: number;
  readonly atoms: bigint;
}

const sales = new Map<string, Sale>();
const pending = new Map<string, { atoms: bigint; createdAt: number }>();
const lightning = new Map<string, number>();

/** Called when the demo till creates an invoice, so the simulator knows what was asked for. */
export function registerDemoSale(address: string, atoms: bigint): void {
  pending.set(address, { atoms, createdAt: Date.now() });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stats(funded: bigint): unknown {
  return {
    chain_stats: { funded_txo_sum: Number(funded), spent_txo_sum: 0, tx_count: funded > 0n ? 1 : 0 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
  };
}

/** A price that drifts slowly, so the demo looks alive without ever being a real quote. */
function prices(): unknown {
  const hour = Math.floor(Date.now() / 3_600_000);
  const usd = 94_000 + ((hour * 137) % 2_400);
  return {
    time: Math.floor(Date.now() / 1000),
    USD: usd,
    EUR: Math.round(usd * 0.92),
    GBP: Math.round(usd * 0.79),
  };
}

/**
 * The LUD-06 payRequest a Lightning address answers with, and the LUD-21 verify that follows.
 * Any address works in the demo: that is the point of a pretend shop, and the alternative — a real
 * lookup — would break the one promise the banner makes.
 */
function payRequest(): unknown {
  return {
    tag: 'payRequest',
    callback: `${DEMO_LNURL_HOST}/lnurlp/callback`,
    minSendable: 1_000,
    maxSendable: 100_000_000_000,
    metadata: JSON.stringify([['text/plain', 'a pretend shop']]),
    commentAllowed: 0,
  };
}

function invoice(url: URL): Response {
  const msat = Number(url.searchParams.get('amount') ?? '0');
  if (!Number.isFinite(msat) || msat <= 0) {
    return json({ status: 'ERROR', reason: 'no amount was asked for' }, 400);
  }
  const id = Math.random().toString(36).slice(2, 10);
  lightning.set(id, Date.now());
  return json({
    pr: `lnbc${Math.round(msat / 1000)}n1demopretendshop${id}`,
    verify: `${DEMO_LNURL_HOST}/lnurlp/verify/${id}`,
    routes: [],
  });
}

function verify(url: URL): Response {
  const id = url.pathname.split('/').pop() ?? '';
  const started = lightning.get(id);
  if (started === undefined) return json({ status: 'ERROR', reason: 'unknown invoice' }, 404);
  const settled = Date.now() - started > PAID_AFTER_MS;
  return json({
    status: 'OK',
    settled,
    preimage: settled ? '00'.repeat(32) : null,
    pr: `lnbc1demopretendshop${id}`,
  });
}

function explorer(url: string): Response {
  const address = decodeURIComponent(url.split('/address/')[1]?.split('/')[0] ?? '');
  const now = Date.now();

  if (address === DEMO_TILL_ADDRESS) return json(stats(1_250_000n));

  let sale = sales.get(address);
  if (!sale) {
    const asked = pending.get(address);
    // An address the shop never asked to be paid at has not been paid. The old default invented
    // 100,000 sats for every stranger typed into the watchlist — a lie the demo told in its sleep.
    if (!asked) return json(stats(0n));
    sale = { firstAsked: now, atoms: asked.atoms };
    sales.set(address, sale);
  }

  const settled = now - sale.firstAsked > PAID_AFTER_MS;
  return json(stats(settled ? sale.atoms : 0n));
}

/** The day stamp: a public calendar would take a 32-byte digest and hand back a pending proof. */
function calendar(): Response {
  return new Response(Uint8Array.from([0x44, 0x45, 0x4d, 0x4f]).buffer, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

export function installFakeExplorer(): () => void {
  const original = window.fetch.bind(window);

  const answer = (url: string, init?: RequestInit): Response => {
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname;

    if (path.includes('/api/v1/prices') || path.endsWith('/prices')) return json(prices());
    if (path.includes('/.well-known/lnurlp/')) return json(payRequest());
    if (path.startsWith('/lnurlp/callback')) return invoice(parsed);
    if (path.startsWith('/lnurlp/verify/')) return verify(parsed);
    if (path.includes('/address/')) return explorer(url);
    if (init?.method === 'POST' && /ots|opentimestamps|calendar/i.test(parsed.hostname)) {
      return calendar();
    }

    // Unknown and off-device: refuse locally. A demo must never quietly reach the internet.
    return json({ error: 'the demo answers everything itself' }, 404);
  };

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
    if (sameOrigin && !url.includes('/api/')) return original(input, init);
    return Promise.resolve(answer(url, init));
  }) as typeof window.fetch;

  window.fetch = wrapped;
  return () => {
    window.fetch = original;
  };
}

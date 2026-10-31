/**
 * The tamper-evident footer: today's digest, live.
 *
 * Everyone can see an address on chain; only the merchant can prove what they rang up. This shows
 * the hash of today's completed sales in the footer, and it changes as sales land — so the number
 * under the page is doing real work rather than decorating it.
 *
 * It is deliberately short and quiet: four hex groups, a label, and a full value in the tooltip.
 */

import { useEffect, useState } from 'react';
import { dayDigest } from '../core/anchor';
import { createLedger } from '../core/ledger';
import { shortDigest } from '../core/freshness';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

export default function BookSeal() {
  const [digest, setDigest] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  // A quiet counter can switch this off; the digest stays available in the Day book panel.
  const [enabled] = useState(() => loadSettings(appStore()).settings.assist.bookSeal);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      try {
        const invoices = createLedger(appStore()).load().invoices;
        const today = new Date().toISOString().slice(0, 10);
        const book = await dayDigest(invoices, today);
        if (cancelled) return;
        setDigest(book.digestHex);
        setCount(book.count);
      } catch {
        if (!cancelled) setDigest(null);
      }
    };
    void compute();
    const onChange = () => void compute();
    window.addEventListener('slip:data-changed', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('slip:data-changed', onChange);
    };
  }, []);

  if (!enabled || !digest) return null;

  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] text-muted"
      title={`Today's book: ${digest} (${count} completed sale${count === 1 ? '' : 's'})`}
      data-book-seal={digest.slice(0, 8)}
    >
      <span aria-hidden>◈</span>
      <span>{shortDigest(digest, 2)}</span>
      <span className="text-muted/70">today&apos;s book</span>
    </span>
  );
}

/**
 * Checking a receipt someone hands you.
 *
 * Two questions a receipt has to answer, and slip keeps them apart:
 *   1. is this proof internally well-formed and does it name a sale this device recorded?
 *   2. does it belong to a day whose digest we anchored?
 *
 * The first is a local comparison against the books. The second is the only one that reaches
 * Bitcoin, and it only says "this digest existed at that time" — never "this receipt was
 * signed by the merchant", because slip cannot sign anything.
 */

import { useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { formatProof, parseProof, proofMatchesInvoice, type ReceiptProof } from '../core/proof';
import { renderQrSvg } from '../core/qr';
import { formatSats } from '../core/money';
import { ScanField } from './Scan';
import { store as appStore } from '../core/storage';

export default function Verify() {
  const ledger = useMemo(() => createLedger(appStore()), []);
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<ReceiptProof | null>(null);
  const [result, setResult] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  const invoices = useMemo(() => ledger.load().invoices.filter((i) => i.status === 'complete'), [ledger]);

  function check() {
    const parsed = parseProof(text);
    if (!parsed.ok || !parsed.proof) {
      setResult({ kind: 'bad', text: parsed.reason ?? 'that is not a slip receipt' });
      return;
    }
    const proof = parsed.proof;
    const match = invoices.find((i) => proofMatchesInvoice(proof, i));
    if (!match) {
      setResult({
        kind: 'warn',
        text:
          'The receipt is well formed, but no sale on THIS device matches its address and amount. ' +
          'That can be right — it may have been taken on another till — but do not treat it as checked.',
      });
      return;
    }
    setResult({
      kind: 'ok',
      text: `Matches ${match.id} on this device: ${formatSats(proof.amountAtoms)} to ${proof.address.slice(0, 12)}… recorded ${match.createdAt.slice(0, 16).replace('T', ' ')}.`,
    });
  }

  function toCode(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    setChosen({
      id: inv.id,
      address: inv.address,
      amountAtoms: inv.amountAtoms,
      createdAt: inv.createdAt,
      dayDigestHex: null,
    });
    setResult(null);
  }

  return (
    <section className="mt-6 panel" data-panel="verify">
      <p className="eyebrow">Receipts</p>
      <h2 className="panel-title mt-1">Check a receipt</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Paste the text under a receipt&apos;s QR (or scan it and paste what your phone shows). slip
        compares it against the books on this device. Nothing is sent anywhere.
      </p>

      <label className="mt-3 block" htmlFor="vf-in">
        <span className="eyebrow">Receipt text</span>
        <textarea
          id="vf-in"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="SLIP1|inv_…|bc1q…|17084|2026-10-31T13:43:00.000Z|-"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-[11px] outline-none focus:border-accent"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={check}
          className="rounded-lg border border-accent px-3 py-2 text-[11px] uppercase tracking-wider text-accent"
        >
          check receipt
        </button>
      </div>
      <ScanField
        label="Scan the receipt"
        placeholder="point the camera at the proof QR"
        onScan={(text) => {
          setText(text);
          // A scan is a paste with a camera: run the same comparison immediately.
          window.setTimeout(check, 0);
        }}
      />

      {result && (
        <p className={`mt-2 text-[11px] ${result.kind === 'bad' ? 'text-bad' : result.kind === 'warn' ? 'text-warn' : 'text-muted'}`}>
          {result.text}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <label className="block" htmlFor="vf-pick">
          <span className="eyebrow">Or show the proof for a sale on this device</span>
          <select
            id="vf-pick"
            value={chosen?.id ?? ''}
            onChange={(e) => toCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-xs outline-none focus:border-accent"
          >
            <option value="">— choose a completed sale —</option>
            {invoices.slice(0, 50).map((i) => (
              <option key={i.id} value={i.id}>
                {i.createdAt.slice(0, 16).replace('T', ' ')} · {formatSats(i.amountAtoms)} ·{' '}
                {i.manual ? 'manual' : 'observed'}
              </option>
            ))}
          </select>
        </label>

        {chosen && (
          <div className="mt-2 flex items-start gap-2">
            <div
              className="h-36 w-36 shrink-0 rounded-lg bg-white p-1"
              dangerouslySetInnerHTML={{ __html: renderQrSvg(formatProof(chosen), { scale: 4, margin: 2 }) }}
            />
            <div className="min-w-0 flex-1 text-[11px] text-muted">
              <p className="break-all font-mono" data-proof>
                {formatProof(chosen)}
              </p>
              <p className="mt-1">
                {formatSats(chosen.amountAtoms)} · {chosen.createdAt.slice(0, 10)}
              </p>
              <p className="mt-1 text-warn">
                An unanchored day carries a dash where the digest would be. That is the honest
                record, not a failure.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

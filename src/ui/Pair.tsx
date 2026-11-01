/**
 * Pairing a wallet with a second device — by QR, with no server.
 *
 * The QR carries public material only (an xpub, a descriptor, a single key or an address),
 * so there is nothing here to keep secret. The important part is what the import does NOT do:
 * it never marks the wallet checked. The new device has not compared address 0/0 against the
 * owner's wallet, and the screen keeps saying "unchecked" until a human looks.
 */

import { useMemo, useState } from 'react';
import { createRepository, statusOf, validateAccountInput, type CounterAccount, type AccountDraft } from '../core/accounts';
import { pairCode, readPairCode, type PairedWallet } from '../core/pair';
import { renderQrSvg } from '../core/qr';
import { ScanField } from './Scan';
import { store as appStore } from '../core/storage';

export default function Pair() {
  const [accounts, setAccounts] = useState<CounterAccount[]>(
    () => createRepository(appStore()).load().accounts,
  );
  const [showing, setShowing] = useState<CounterAccount | null>(null);
  const [incoming, setIncoming] = useState('');
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [preview, setPreview] = useState<PairedWallet | null>(null);

  const code = useMemo(() => {
    if (!showing) return null;
    try {
      return pairCode({
        label: showing.label,
        material: showing.xpub,
        coin: showing.coin,
        networkId: showing.networkId,
        source: showing.source,
        scriptType: showing.scriptType === 'wsh-sortedmulti' ? 'p2wpkh' : showing.scriptType,
      });
    } catch (e) {
      return e instanceof Error ? e.message : 'could not build a code';
    }
  }, [showing]);

  function read() {
    const r = readPairCode(incoming);
    if (!r.ok) {
      setPreview(null);
      setNote({ kind: 'bad', text: r.error });
      return;
    }
    setPreview(r.wallet);
    setNote({ kind: 'ok', text: 'code read — check the details, then import' });
  }

  function importWallet() {
    if (!preview) return;
    const draft: AccountDraft = {
      label: preview.label,
      xpub: preview.material,
      coin: preview.coin,
      networkId: preview.networkId,
      scriptType: preview.scriptType,
      note: 'imported by pairing code',
    };
    const validation = validateAccountInput(draft);
    if (!validation.ok) {
      setNote({ kind: 'bad', text: validation.error });
      return;
    }
    const repo = createRepository(appStore());
    const account = repo.addAccount(validation);
    setAccounts(repo.load().accounts);
    setPreview(null);
    setIncoming('');
    setNote({
      kind: 'warn',
      text: `${account.label} imported — UNCHECKED. Open your wallet, compare address ${account.firstAddress}, and confirm it before taking money on this device.`,
    });
    window.dispatchEvent(new Event('slip:data-changed'));
  }

  return (
    <section className="mt-6 panel" data-panel="pair">
      <p className="eyebrow">Pairing</p>
      <h2 className="panel-title mt-1">Move a wallet to another device</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        A pairing code is public wallet material — the same thing you would write on a card for a
        colleague. Nothing secret travels, and nothing arrives checked: the receiving device must
        still confirm address 0/0 before it takes money.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="eyebrow">Show a code for</span>
          <select
            aria-label="Wallet to share"
            value={showing?.id ?? ''}
            onChange={(e) => {
              setShowing(accounts.find((a) => a.id === e.target.value) ?? null);
              setNote(null);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            <option value="">— choose a wallet —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.networkId}
                {statusOf(a) === 'ready' ? '' : ' (unchecked)'}
              </option>
            ))}
          </select>

          {showing && code && (
            <div className="mt-2 flex items-start gap-2">
              {code.startsWith('SLIP-WALLET-1|') ? (
                <div
                  className="h-40 w-40 shrink-0 rounded-lg bg-white p-1"
                  dangerouslySetInnerHTML={{ __html: renderQrSvg(code, { scale: 4, margin: 2 }) }}
                />
              ) : null}
              <div className="min-w-0 flex-1 text-[11px] text-warn">{code}</div>
            </div>
          )}
          {showing && code?.startsWith('SLIP-WALLET-1|') && (
            <p className="mt-1 text-[11px] text-warn">
              This code contains a public xpub: anyone who scans it can see every address of this
              wallet. That is what makes it useful — and why you only show it to yourself.
            </p>
          )}
        </div>

        <div>
          <label className="block" htmlFor="pr-in">
            <span className="eyebrow">Paste a code to import</span>
            <textarea
              id="pr-in"
              value={incoming}
              onChange={(e) => setIncoming(e.target.value)}
              rows={4}
              placeholder="SLIP-WALLET-1|Shop till|btc|btc-mainnet|xpub|p2wpkh|zpub…"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-[11px] outline-none focus:border-accent"
            />
          </label>
          <ScanField
            label="Or scan it"
            placeholder="point the camera at a pairing code"
            onScan={(text) => {
              setIncoming(text);
              const r = readPairCode(text);
              if (!r.ok) {
                setPreview(null);
                setNote({ kind: 'bad', text: r.error });
                return;
              }
              setPreview(r.wallet);
              setNote({ kind: 'ok', text: 'code read — check the details, then import' });
            }}
          />
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={read}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              read code
            </button>
            <button
              type="button"
              onClick={importWallet}
              disabled={!preview}
              className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent disabled:border-line disabled:text-muted"
            >
              import (unchecked)
            </button>
          </div>

          {preview && (
            <dl className="mt-2 space-y-0.5 text-[11px] text-muted">
              <div>
                <dt className="inline">wallet: </dt>
                <dd className="inline text-ink">{preview.label}</dd>
              </div>
              <div>
                <dt className="inline">network: </dt>
                <dd className="inline text-ink">
                  {preview.networkId} · {preview.scriptType}
                </dd>
              </div>
              <div>
                <dt className="inline">type: </dt>
                <dd className="inline text-ink">{preview.source}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {note && (
        <p className={`mt-2 text-[11px] ${note.kind === 'bad' ? 'text-bad' : note.kind === 'warn' ? 'text-warn' : 'text-muted'}`}>
          {note.text}
        </p>
      )}
    </section>
  );
}

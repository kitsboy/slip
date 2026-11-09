/**
 * The customer's screen — a second window showing only the QR and the amount.
 *
 * It exists so the payer is not reading a merchant's till over their shoulder: no takings, no
 * wallet names, no staff. The two windows talk over BroadcastChannel, which never leaves the
 * device and needs no server. If the channel is unavailable (older WebView), the display still
 * says clearly that it is not connected rather than showing a stale total as if it were live.
 */

import { useEffect, useState } from 'react';
import { renderQrSvg } from '../core/qr';
import { formatSats } from '../core/money';

export interface DisplayMessage {
  readonly kind: 'pay' | 'status' | 'clear';
  readonly uri?: string;
  readonly sats?: string;
  readonly label?: string;
  readonly status?: string;
  readonly shop?: string;
  readonly at: string;
}

const CHANNEL = 'slip-display';

export function openCustomerDisplay(): boolean {
  const url = new URL(window.location.href);
  // Keep ?demo=1: a display opened from the pretend shop is still the pretend shop, and must not
  // reach into the real drawer. `search` takes no leading '?', which used to produce '??display=1'.
  const demo = new URLSearchParams(window.location.search).get('demo');
  url.search = demo === '1' ? 'display=1&demo=1' : 'display=1';
  const win = window.open(url.toString(), 'slip-customer-display', 'width=520,height=780');
  return Boolean(win);
}

export function publishToDisplay(message: Omit<DisplayMessage, 'at'>): void {
  const payload: DisplayMessage = { ...message, at: new Date().toISOString() };
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // No channel on this device: the display window will say it is not connected, which is
    // the honest outcome rather than a silent stale total.
  }
}

export default function CustomerDisplay() {
  const [message, setMessage] = useState<DisplayMessage | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
        setConnected(true);
        setMessage(e.data);
      };
    } catch {
      setConnected(false);
    }
    return () => {
      channel?.close();
    };
  }, []);

  if (!message || message.kind === 'clear') {
    return (
      <main className="v2-display flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="v2-display-idle">slip</p>
        <p className="v2-display-idle-line">
          {connected ? 'Ready — the till has not rung anything up yet.' : 'This screen is not connected to a till.'}
        </p>
      </main>
    );
  }

  return (
    <main className="v2-display flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="v2-pay-word">Pay exactly</p>
      {message.shop ? <p className="v2-display-shop">{message.shop}</p> : null}
      <p className="figure">{message.sats ? formatSats(BigInt(message.sats)) : ''}</p>
      {message.uri && (
        <div
          className="v2-qr-box rounded-xl bg-white p-3"
          dangerouslySetInnerHTML={{ __html: renderQrSvg(message.uri, { scale: 8, margin: 4 }) }}
        />
      )}
      <p className={`text-sm ${message.status === 'paid' ? 'text-ok' : 'text-warn'}`}>
        {message.status === 'paid'
          ? 'Paid — thank you'
          : message.status === 'seen'
            ? 'Seen — waiting for a block'
            : 'Waiting for payment'}
      </p>
    </main>
  );
}

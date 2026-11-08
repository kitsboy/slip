import { useState } from 'react';

import { renderQrSvg } from '../core/qr';

/** Spaces are display-only. The string a wallet scans never includes them. */
export function ungrouped(value: string): string {
  return value.replace(/\s+/g, '');
}

function chunked(address: string): { text: string; head: string; tail: string; mid: string } {
  const raw = ungrouped(address);
  const groups = raw.match(/.{1,4}/g) ?? [];
  const shown = groups.join(' ');
  return {
    text: shown,
    head: shown.slice(0, 7),
    mid: shown.slice(7, Math.max(7, shown.length - 7)),
    tail: shown.slice(-7),
  };
}

/**
 * C-12. If the words on the card are not the string inside the QR, the QR is
 * not drawn. Copy always copies the ungrouped string.
 */
export default function QRCard({
  payload,
  displayed,
  amountLabel,
}: {
  payload: string;
  displayed: string;
  amountLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const match = ungrouped(displayed) === ungrouped(payload) && payload.length > 0;
  const parts = chunked(displayed);

  if (!match) {
    return (
      <div className="v2-qr v2-qr-bad" role="alert">
        <p>Do not accept payment. The words and the code do not match.</p>
      </div>
    );
  }

  const svg = renderQrSvg(payload, { scale: 8, margin: 4, dark: '#000000', light: '#ffffff' });
  return (
    <div className="v2-qr">
      <div
        className="v2-qr-plate"
        role="img"
        aria-label={`Payment QR for ${amountLabel}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="v2-qr-addr">
        <b>{parts.head}</b>
        <span>{parts.mid}</span>
        <b>{parts.tail}</b>
      </p>
      <button
        type="button"
        className="v2-btn btn-secondary v2-btn-m"
        onClick={() => {
          void navigator.clipboard?.writeText(ungrouped(displayed));
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

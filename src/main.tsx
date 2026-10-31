import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CustomerDisplay from './ui/CustomerDisplay';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('slip: #root missing');

/**
 * Register the offline shell only where a service worker is possible: https or
 * localhost. On `file://` (the single-file build a merchant may keep on disk) or inside
 * a WebView without SW support, registration is skipped silently — the app works either
 * way, and a missing worker must never break the local build.
 */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell unavailable; the app still runs from the network or disk */
    });
  });
}

/**
 * Agent-ready, read-only surface.
 *
 * A shop's own automation (a bot, a script, a tiny dashboard) can ask slip what it knows
 * without slip ever gaining a way to spend. There is no network here and no mutation: the
 * objects returned are copies, and the only events are notifications that something a human
 * did has happened.
 */
declare global {
  interface Window {
    slip?: {
      readonly version: string;
      readonly readOnly: true;
      wallets: () => unknown[];
      invoices: () => unknown[];
      requests: () => unknown[];
      today: (walletId: string) => string;
      on: (event: 'slip:paid' | 'slip:data-changed', handler: (detail: unknown) => void) => () => void;
    };
  }
}

window.slip = {
  version: (() => {
    const meta = document.querySelector('meta[name="slip-version"]');
    return meta?.getAttribute('content') ?? 'unknown';
  })(),
  readOnly: true,
  wallets: () => {
    try {
      const raw = window.localStorage.getItem('slip.accounts.v1');
      return raw ? (JSON.parse(raw).accounts ?? []) : [];
    } catch {
      return [];
    }
  },
  invoices: () => {
    try {
      const raw = window.localStorage.getItem('slip.ledger.v1');
      return raw ? (JSON.parse(raw).invoices ?? []) : [];
    } catch {
      return [];
    }
  },
  requests: () => {
    try {
      const raw = window.localStorage.getItem('slip.ledger.v1');
      return raw ? (JSON.parse(raw).requests ?? []) : [];
    } catch {
      return [];
    }
  },
  today: (walletId: string) => {
    try {
      const raw = window.localStorage.getItem('slip.ledger.v1');
      const invoices = raw ? (JSON.parse(raw).invoices ?? []) : [];
      const day = new Date().toISOString().slice(0, 10);
      return invoices
        .filter((i: { walletId: string; status: string; createdAt: string }) =>
          i.walletId === walletId && i.status === 'complete' && i.createdAt.slice(0, 10) === day)
        .reduce((sum: bigint, i: { amountAtoms: string }) => sum + BigInt(i.amountAtoms), 0n)
        .toString();
    } catch {
      return '0';
    }
  },
  on: (event, handler) => {
    const listener = (e: Event) => handler((e as CustomEvent).detail);
    window.addEventListener(event, listener);
    return () => window.removeEventListener(event, listener);
  },
};

/**
 * The customer display is the same single file opened with `?display=1`: it shows a QR and an
 * amount and nothing else. Same origin, same bundle, no second deploy — and it never reads the
 * merchant's books, so a customer cannot see the day's takings by tapping the screen.
 */
const isDisplay = new URLSearchParams(window.location.search).get('display') === '1';

createRoot(el).render(
  <React.StrictMode>{isDisplay ? <CustomerDisplay /> : <App />}</React.StrictMode>,
);

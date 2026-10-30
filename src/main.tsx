import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/*
 * slip service worker — offline shell only, and never a pinned till.
 *
 * Two rules, learned the hard way:
 *
 *  1. THE SHELL IS NETWORK-FIRST. A cache-first app shell means a device that installed
 *     slip once keeps that build forever: `install` only fires when this file's bytes
 *     change, and this file used to never change. A merchant then reads v0.8 in the header
 *     while v0.25 is live, and nothing on their device will ever fix it.
 *
 *  2. THE CACHE IS NAMED FOR THE BUILD. `__BUILD__` is replaced at build time with
 *     `<version>-<commit>`, so every release changes this file's bytes, the browser
 *     installs a fresh worker, and the old cache is deleted on activate.
 *
 * A till must not reload itself mid-sale, so updates are never applied underneath a live
 * page: the new worker activates (safe — the running page keeps the bundle it loaded) and
 * the page tells the merchant a newer slip is live. Only a human presses reload.
 */

const CACHE = 'slip-__BUILD__';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      // Take over as soon as the browser will let us. This changes which bytes the NEXT
      // navigation loads; it never touches the page that is already running.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Put a copy in the cache, but only a real, complete response. */
function remember(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigating to the app: ask the network first, so a merchant always gets the newest
  // build when they are online, and fall back to the cached shell when they are not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => remember(req, res))
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit ?? caches.match('./index.html'))
            .then((shell) => shell ?? Response.error()),
        ),
    );
    return;
  }

  // Everything else (manifest, icons) is cache-first: the shell only changes at build time
  // and these are not the thing that goes stale in a dangerous way.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req)
          .then((res) => remember(req, res))
          .catch(() => Response.error()),
    ),
  );
});

// The page decides when to reload. A waiting worker only activates when the merchant
// presses "new version ready — reload", never underneath a live sale.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

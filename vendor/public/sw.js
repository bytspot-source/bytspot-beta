// Bytspot Vendor service worker.
//
// This is NOT the retired consumer kill-switch in public/sw.js. The vendor
// console is a separate origin, so nothing here can register against
// bytspot.app or resurrect the old consumer shell. A fetch handler is
// required for the install prompt, and vendors work in garages and
// driveways, so navigations must survive a dead network.

const VERSION = 'vendor-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.add(new Request(SHELL_URL, { cache: 'reload' }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve a stale answer for an API call: a vendor reading yesterday's
  // inventory as if it were live is worse than an honest failure.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          const cached = await cache.match(SHELL_URL);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

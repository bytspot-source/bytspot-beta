// Retired PWA kill-switch. Bytspot is native iOS + App Clip only.
// Existing browsers that already cached the old app shell must pick this up,
// drop every cache, and unregister so /party/* can never boot the
// old React shell again.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(
        windows.map((client) => {
          if ('navigate' in client) return client.navigate(client.url);
          return undefined;
        }),
      );
    })(),
  );
});

const CACHE_NAME = 'bytspot-v2';
const API_CACHE_NAME = 'bytspot-api-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — stale-while-revalidate for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Stale-while-revalidate for API calls — serve cached then update in background
  if (url.hostname.includes('bytspot-api') || url.pathname.includes('/trpc/')) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Offline: return cached response if available
              if (cached) return cached;
              return new Response(
                JSON.stringify({ error: 'offline', cached: false }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            });
          // Return cached immediately if available, otherwise wait for network
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Cache-first for app shell + static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Bytspot Alert';
  const options = {
    body: data.body || "Something's happening in Midtown right now",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'bytspot-crowd-alert',
    renotify: true,
    data: data,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — open venue deep-link or app root
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // If it's a packed-alert with a venueId, deep-link to that venue
  const url = data.venueId ? `/v/${data.venueId}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url, data });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});


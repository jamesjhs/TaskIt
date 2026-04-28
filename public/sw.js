/* ============================================================
   TaskIt! — Service Worker
   Cache-first for static assets, network-first for /api/
   ============================================================ */

const CACHE_NAME = 'taskit-__APP_VERSION__'; // replaced with the real version by the server at runtime

const STATIC_ASSETS = [
  '/',
  '/app.css',
  '/tailwind.css',
  '/manifest.json',
  '/js/version.js',
  '/js/qrcode.js',
  '/privacy-policy.html',
  '/user-guide.html',
  '/howto.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('SW: Failed to cache', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for API and calendar feeds
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/calendar/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — no network connection.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // For SPA navigation requests, always serve the precached root shell ('/').
  // Static info pages are excluded so they can be served directly from cache.
  const STANDALONE_PAGES = ['/privacy-policy.html', '/user-guide.html', '/howto.html'];
  if (event.request.mode === 'navigate' && !STANDALONE_PAGES.includes(url.pathname)) {
    event.respondWith(
      caches.match('/').then(cached => cached || fetch('/'))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ============================================================
// Push Notifications
// ============================================================

self.addEventListener('push', event => {
  let data = { title: 'TaskIt!', body: 'You have a new notification.', icon: '/icons/icon-192x192.png', badge: '/icons/icon-96x96.png', url: '/' };
  if (event.data) {
    try { data = { ...data, ...JSON.parse(event.data.text()) }; } catch { /* use defaults */ }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url },
      // Tag groups notifications by URL so repeated reminders for the same
      // task replace the previous one rather than stacking in the tray.
      tag: data.url,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus an existing app tab if one is already open.
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetUrlParsed = new URL(targetUrl, self.location.origin);
        if (clientUrl.origin === targetUrlParsed.origin && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

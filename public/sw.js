const CACHE_NAME = 'remember-v15';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: always try fresh, fall back to cache
self.addEventListener('fetch', (event) => {
  // Skip API calls and Supabase requests
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  // Use unique tag based on content to avoid collapsing different notifications
  const tag = data.title?.includes('check-in') ? 'new-checkin-' + Date.now()
    : data.title?.includes('Reply') ? 'client-reply-' + Date.now()
    : 'coach-response-' + Date.now();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Remember', {
        body: data.body || 'You have a new notification',
        icon: '/app-icon-192.png',
        badge: '/app-icon-192.png',
        tag,
        data: { url: data.url || '/dashboard' },
      }),
      // Notify open app windows to refresh their badge/data
      (async () => {
        try {
          const allClients = await clients.matchAll({ type: 'window' });
          for (const client of allClients) {
            client.postMessage({ type: 'PUSH_RECEIVED', title: data.title, badge: data.badge });
          }
          // Set app badge from push payload.
          // ✅ Works on: Chrome (desktop/Android), Samsung Internet, Edge
          // ❌ Known Limitation — iOS/Safari: setAppBadge() is NOT supported in the
          //    Service Worker context. iOS automatically uses the notification count
          //    as the homescreen badge. Since we use unique tags (with Date.now()),
          //    notifications don't collapse and iOS counts them correctly.
          //    The badge resets when the user opens the app (via clearAppBadge() in the app).
          if ('setAppBadge' in navigator && data.badge !== undefined) {
            await navigator.setAppBadge(data.badge);
          } else if ('setAppBadge' in navigator) {
            // Fallback: count currently active notifications
            const notifications = await self.registration.getNotifications();
            await navigator.setAppBadge(notifications.length + 1);
          }
        } catch (e) {
          // Badge API may not be available — non-critical, ignore silently
        }
      })(),
    ])
  );
});

// Handle notification click — navigate to the correct page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;
  event.waitUntil(
    Promise.all([
      // Clear badge when user taps notification
      (async () => {
        try {
          const remaining = await self.registration.getNotifications();
          if (remaining.length === 0 && 'clearAppBadge' in navigator) {
            await navigator.clearAppBadge();
          } else if ('setAppBadge' in navigator) {
            await navigator.setAppBadge(remaining.length);
          }
        } catch {}
      })(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      }),
    ])
  );
});

// Message handler for badge updates from main app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if (count > 0 && 'setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
});

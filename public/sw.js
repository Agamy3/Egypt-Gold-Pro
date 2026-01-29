// PWA Service Worker for EgyptGold Pro
// Caches static assets but NEVER caches realtime APIs

const CACHE_NAME = 'egyptgold-pro-v1';
const OFFLINE_PAGE = '/offline.html';

// Static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/apple-touch-icon.png',
];

// API endpoints that should NEVER be cached (always network-only)
const NO_CACHE_PATTERNS = [
  /\/api\/forecast/,
  /\/api\/forecast\/series/,
  /\/api\/news/,
  /\/api\/admin/,
  /\/api\/cron/,
  /\/api\/notifications/,
  /\/api\/push/,
];

// Navigation routes that should use network-first (no cache write for auth pages)
const AUTH_NAV_PATTERNS = [
  /^\/admin/,
  /^\/account/,
];

// Check if URL matches a no-cache pattern
function shouldBypassCache(url) {
  return NO_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

// Check if navigation is to an auth-protected page
function isAuthNavigation(url) {
  return AUTH_NAV_PATTERNS.some(pattern => pattern.test(new URL(url).pathname));
}

// Install event: precache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Precaching failed:', error);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event: implement caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // NEVER cache realtime API endpoints - always fetch from network
  if (shouldBypassCache(url.pathname)) {
    event.respondWith(
      fetch(request).catch((error) => {
        console.error('[SW] Network-only fetch failed:', error);
        // Return a minimal error response for API calls
        return new Response(
          JSON.stringify({ error: 'Network unavailable' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // For auth pages, don't cache the response
          if (isAuthNavigation(url.pathname)) {
            return response;
          }
          // For other pages, cache the response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Network failed - try cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // No cache - return offline page
            return caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        // Only cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() || 'You have a new notification' };
    }
  }
  
  const title = data.title || 'EgyptGold Pro';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.data || { url: '/' },
    tag: data.tag || 'default',
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(url, self.location.origin);
        if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab (or navigate in PWA)
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

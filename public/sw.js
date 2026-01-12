// Service Worker for Web Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'EgyptGold Pro';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/brand/logo.png',
    badge: '/brand/logo.png',
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.openWindow(url)
  );
});


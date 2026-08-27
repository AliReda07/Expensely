/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// injectManifest requires this exact expression to appear somewhere in the
// built service worker -- vite-plugin-pwa replaces it with the real asset list.
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
self.addEventListener('activate', () => {
  void self.clients.claim();
});

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

// Sent by the sms-webhook edge function right after it logs a transaction from
// an incoming bank SMS -- that happens via a phone-side automation, not while
// this app is necessarily open, so a real push (not an in-app toast) is what
// actually reaches the user.
self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Expensely' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

// Focus an already-open tab rather than always spawning a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => 'focus' in c);
      if (existing) {
        await (existing as WindowClient).focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

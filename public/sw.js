// Service worker for "your turn" notifications.
//
// Phase 1 uses it purely to *display* notifications: mobile browsers (Android
// Chrome and friends) forbid the `new Notification()` constructor — it throws
// "Illegal constructor" — and only allow notifications via
// ServiceWorkerRegistration.showNotification(). The page calls that on this
// registration; nothing here is push-related yet.
//
// Phase 2 will add a `push` handler (FCM) so the same notification can fire when
// the tab is fully closed. Deliberately no `fetch` handler — this SW must not
// intercept requests or cache anything, so it can't interfere with the app's
// existing offline/reconnect behaviour.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Focus an existing game tab if one is open, otherwise open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url || "/");
      return undefined;
    }),
  );
});

// sw.js — the service worker. Receives pushes and shows them.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Console", body: "" };
  try { data = event.data.json(); } catch { if (event.data) data.body = event.data.text(); }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "console",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      renotify: true,
    })
  );
});

// Tapping a notification focuses the app (or opens it).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

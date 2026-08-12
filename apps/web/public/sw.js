/** Solo Web Push — sin cache de fetch (evita chrome-extension / HMR en dev) */
const CACHE = "inretrans-shell-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** No interceptamos fetch: evita Cache.put con chrome-extension: y no rompe Next/HMR */
self.addEventListener("fetch", () => undefined);

self.addEventListener("push", (event) => {
  let data = {
    title: "INRETRANS OS",
    body: "Nueva alerta operativa",
    href: "/",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { href: data.href || "/" },
      tag: "inretrans-push",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ("focus" in c) {
            c.navigate?.(href);
            return c.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(href);
      }),
  );
});

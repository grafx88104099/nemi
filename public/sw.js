/* Nemi CRM service worker (R4): Web Push мэдэгдэл, мэдэгдэл дарахад апп нээх,
 * сүлжээгүй үед энгийн мэдэгдлийн хуудас. Хувийн өгөгдлийг кэшлэхгүй. */

const OFFLINE_CACHE = "nemi-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Зөвхөн хуудасны навигацид: сүлжээ алга бол offline хуудас. Бусад хүсэлтэд оролцохгүй.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || new Response("Сүлжээ алга", { status: 503 })))
  );
});

function safeUrl(u) {
  // Зөвхөн өөрийн домэйны зам (гадаад холбоос нээхгүй).
  return typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : "/agent/crm";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nemi CRM", body: event.data ? event.data.text() : "" };
  }
  const title = (data.title || "Nemi CRM").slice(0, 80);
  const options = {
    body: (data.body || "").slice(0, 160),
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: safeUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(target).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

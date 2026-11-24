/* Nemi CRM service worker (R4): Web Push мэдэгдэл, мэдэгдэл дарахад апп нээх,
 * сүлжээгүй үед энгийн мэдэгдлийн хуудас (Staff «шинэ хөрөнгө» дээр утсан дээрх
 * товч бүртгэл), Web Share Target-ийн хүлээн авалт. Хувийн өгөгдлийг кэшлэхгүй:
 * зөвхөн статик offline хуудас, crm2-vault.js, дүрс тэмдэг кэшлэгдэнэ. Хуваалцсан
 * бичвэрийг төхөөрөмжийн түлхүүрээр битүүмжилж IndexedDB «nemi-share»-д хадгална. */

// Шифрлэлтийн ихэр (lib/crm2/device/vault.ts-тэй ижил формат). Ачаалагдахгүй бол
// push/offline ажилласаар байна, share нь «?share=error» руу шилжинэ.
try {
  importScripts("/crm2-vault.js");
} catch {
  // үргэлжлүүлнэ
}

const OFFLINE_CACHE = "nemi-offline-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/crm2-vault.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/badge-96.png",
];

const SHARE_PATH = "/agent/crm/staff/share";
const SHARE_TARGET = "/agent/crm/staff/new";
const SHARE_MAX_TEXT = 10000;
const SHARE_MAX_FILES = 20;
const SHARE_MAX_FILE_BYTES = 30 * 1024 * 1024;
const SHARE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((c) => c.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: "reload" }))))
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

/** Хуваалцсан бичвэр: гарчиг, бичвэр, холбоос (давхардуулахгүй), ≤10000 тэмдэгт. */
function shareText(form) {
  const parts = [];
  for (const name of ["title", "text", "url"]) {
    const v = form.get(name);
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && !parts.some((p) => p.includes(t))) parts.push(t);
  }
  return parts.join("\n").slice(0, SHARE_MAX_TEXT);
}

/** Зөвхөн image/* файл, ≤20 ширхэг, тус бүр ≤30 MB, нийт ≤100 MB. */
function shareFiles(form) {
  const out = [];
  let total = 0;
  for (const f of form.getAll("media")) {
    if (out.length >= SHARE_MAX_FILES) break;
    if (!f || typeof f === "string" || typeof f.size !== "number") continue;
    if (!String(f.type || "").startsWith("image/") || f.size <= 0 || f.size > SHARE_MAX_FILE_BYTES) continue;
    if (total + f.size > SHARE_MAX_TOTAL_BYTES) break;
    total += f.size;
    out.push({ name: String(f.name || "zurag").slice(0, 120), type: f.type, blob: f });
  }
  return out;
}

function shareRedirect(id) {
  const url = new URL(SHARE_TARGET, self.location.origin);
  url.searchParams.set("share", id);
  return Response.redirect(url.href, 303);
}

/**
 * Жинхэнэ Web Share Target нээлтэд баримтын referrer байдаггүй. Өөр сайтын хуудаснаас илгээсэн
 * форм (referrer-тэй) бол хүлээж авахгүй. (referrer-гүй хүсэлтийг апп дотор агент шалгаж зөвшөөрнө.)
 */
function crossSite(req) {
  const ref = req.referrer;
  if (!ref || ref === "about:client" || ref === "no-referrer") return false;
  try {
    return new URL(ref).origin !== self.location.origin;
  } catch {
    return true;
  }
}

async function handleShare(req) {
  try {
    if (crossSite(req)) return shareRedirect("error");
    const vault = self.Crm2Vault;
    if (!vault) return shareRedirect("error");
    const form = await req.formData();
    const text = shareText(form);
    const files = shareFiles(form);
    if (!text && !files.length) return shareRedirect("error");
    const id = await vault.storeInboxItem({ kind: "share", profileId: null, text, files });
    return shareRedirect(id);
  } catch {
    // Бичвэрийг логд бичихгүй.
    return shareRedirect("error");
  }
}

// Web Share Target (manifest share_target): навигацийн хариунаас ӨМНӨ барина.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "POST") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname !== SHARE_PATH) return;
  event.respondWith(handleShare(req));
});

// Offline хуудасны статик файлууд (скрипт, дүрс): эхлээд сүлжээ, алга бол precache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode === "navigate") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === OFFLINE_URL || !PRECACHE_URLS.includes(url.pathname)) return;
  event.respondWith(fetch(req).catch(() => caches.match(url.pathname).then((r) => r || Response.error())));
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

/**
 * PWA: суулгасан агентын апп (manifest id/start_url) хэвээр, share_target нэмэгдсэн;
 * service worker-ийн share target, offline кэш, push/notificationclick; SW-гүй үеийн
 * share/route.ts нөөц; offline.html-ийн товч бүртгэл.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import manifest from "@/app/manifest";
import { GET as shareGet, POST as sharePost } from "@/app/(agent)/agent/(panel)/crm/staff/share/route";
import { STAFF_SHARE_PATH } from "@/lib/crm2/paths";

const ORIGIN = "https://nemi.test";
const SW_SRC = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const OFFLINE_SRC = readFileSync(join(process.cwd(), "public", "offline.html"), "utf8");

describe("app/manifest.ts", () => {
  const m = manifest();

  it("keeps the installed app identity unchanged", () => {
    expect(m.id).toBe("/agent/crm");
    expect(m.start_url).toBe("/agent/crm");
    expect(m.scope).toBe("/");
    expect(m.name).toBe("Nemi CRM");
    expect(m.short_name).toBe("Nemi CRM");
    expect(m.display).toBe("standalone");
    expect(m.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    expect(m.shortcuts).toEqual([
      { name: "Шинэ хөрөнгө", url: "/agent/crm/staff/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Харилцагчид", url: "/agent/crm/contacts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Staff", url: "/agent/crm/staff", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ]);
  });

  it("declares the share target (POST multipart, images as 'media')", () => {
    expect(m.share_target).toEqual({
      action: "/agent/crm/staff/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: ["image/*"] }] },
    });
    expect(m.share_target?.action).toBe(STAFF_SHARE_PATH);
  });
});

// ── Service worker (хуурмаг self/caches/fetch орчинд) ──────────

type Listener = (event: FakeEvent) => void;
type FakeEvent = {
  request?: unknown;
  data?: { json(): unknown; text(): string } | null;
  notification?: { close(): void; data: unknown };
  responded?: Promise<Response>;
  waited?: Promise<unknown>;
  respondWith?(p: Promise<Response>): void;
  waitUntil?(p: Promise<unknown>): void;
};

function loadSw(opts: { vault?: unknown; fetchImpl?: (req: unknown) => Promise<Response> } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const imported: string[] = [];
  const cacheStore = new Map<string, Response>();
  const opened: string[] = [];
  const added: string[] = [];
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]), openWindow: vi.fn(() => Promise.resolve(null)) },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
  };
  if (opts.vault) self.Crm2Vault = opts.vault;
  const caches = {
    open: (name: string) => {
      opened.push(name);
      return Promise.resolve({
        addAll: (reqs: Request[]) => {
          for (const r of reqs) {
            const p = new URL(r.url, ORIGIN).pathname;
            added.push(p);
            cacheStore.set(p, new Response("cached:" + p));
          }
          return Promise.resolve();
        },
      });
    },
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    match: (u: string) => Promise.resolve(cacheStore.get(u)),
  };
  const fetchImpl = opts.fetchImpl ?? (() => Promise.reject(new TypeError("offline")));
  const importScripts = (u: string) => imported.push(u);
  // SW-д харьцангуй URL нь origin-оос шийдэгдэнэ; node-ийн Request бүтэн URL шаардана.
  class SwRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN), init);
    }
  }
  new Function("self", "importScripts", "caches", "fetch", "Request", SW_SRC)(
    self,
    importScripts,
    caches,
    fetchImpl,
    SwRequest
  );

  /** Бүх fetch сонсогчийг ажиллуулна; хариулсан тоог буцаана (бодит SW-д ганц л байх ёстой). */
  function dispatchFetch(request: unknown) {
    let count = 0;
    const ev: FakeEvent = {
      request,
      respondWith(p) {
        count++;
        ev.responded = p;
      },
    };
    for (const fn of listeners.fetch ?? []) fn(ev);
    return { ev, count };
  }
  async function install() {
    const ev: FakeEvent = { waitUntil: (p) => (ev.waited = p) };
    for (const fn of listeners.install ?? []) fn(ev);
    await ev.waited;
  }
  return { listeners, imported, opened, added, shown, self, dispatchFetch, install };
}

function shareRequest(form: FormData, referrer = "") {
  const real = new Request(`${ORIGIN}/agent/crm/staff/share`, { method: "POST", body: form });
  // Бодит share нь навигаци (mode 'navigate'); node-ийн Request үүнийг зөвшөөрдөггүй.
  return { url: real.url, method: "POST", mode: "navigate", referrer, formData: () => real.formData() };
}

describe("public/sw.js", () => {
  it("imports crm2-vault.js and precaches the offline page, vault script and icons in nemi-offline-v2", async () => {
    const sw = loadSw();
    expect(sw.imported).toEqual(["/crm2-vault.js"]);
    await sw.install();
    expect(sw.opened).toEqual(["nemi-offline-v2"]);
    expect(sw.added).toEqual(
      expect.arrayContaining(["/offline.html", "/crm2-vault.js", "/icons/icon-192.png", "/icons/badge-96.png"])
    );
    // Зөвхөн статик файл — хувийн/динамик зам кэшлэхгүй.
    for (const p of sw.added) expect(p === "/offline.html" || p === "/crm2-vault.js" || p.startsWith("/icons/")).toBe(true);
  });

  it("share POST: stores sealed-text item via the vault and 303-redirects to quick add", async () => {
    const storeInboxItem = vi.fn(async () => "abc-123");
    const sw = loadSw({ vault: { storeInboxItem } });
    const form = new FormData();
    form.set("title", "Зар");
    form.set("text", "Зайсан 3 өрөө 120 сая " + "x".repeat(12_000));
    form.set("url", "https://example.test/p/1");
    form.append("media", new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }));
    form.append("media", new File(["%PDF"], "b.pdf", { type: "application/pdf" }));
    form.append("media", new File([new Uint8Array(30 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }));
    for (let i = 0; i < 25; i++) form.append("media", new File([new Uint8Array([i + 1])], `p${i}.png`, { type: "image/png" }));

    const { ev, count } = sw.dispatchFetch(shareRequest(form));
    expect(count).toBe(1);
    const res = await ev.responded!;
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=abc-123`);

    expect(storeInboxItem).toHaveBeenCalledTimes(1);
    const input = (storeInboxItem.mock.calls[0] as unknown[])[0] as {
      kind: string;
      profileId: null;
      text: string;
      files: { name: string; type: string; blob: Blob }[];
    };
    expect(input.kind).toBe("share");
    expect(input.profileId).toBeNull();
    expect(input.text.length).toBe(10_000);
    expect(input.text.startsWith("Зар\nЗайсан 3 өрөө")).toBe(true);
    expect(input.files).toHaveLength(20);
    expect(input.files.every((f) => f.type.startsWith("image/") && f.blob.size <= 30 * 1024 * 1024)).toBe(true);
    expect(input.files[0].name).toBe("a.jpg");
  });

  it("share POST: url already inside the text is not repeated", async () => {
    const storeInboxItem = vi.fn(async () => "id1");
    const sw = loadSw({ vault: { storeInboxItem } });
    const form = new FormData();
    form.set("text", "Байр https://example.test/p/1");
    form.set("url", "https://example.test/p/1");
    await sw.dispatchFetch(shareRequest(form)).ev.responded;
    expect((storeInboxItem.mock.calls[0] as unknown[])[0]).toMatchObject({ text: "Байр https://example.test/p/1" });
  });

  it("share POST errors → ?share=error (empty share, store failure, vault missing)", async () => {
    const failing = loadSw({ vault: { storeInboxItem: async () => Promise.reject(new Error("quota")) } });
    const f1 = new FormData();
    f1.set("text", "x");
    expect((await failing.dispatchFetch(shareRequest(f1)).ev.responded!).headers.get("location")).toBe(
      `${ORIGIN}/agent/crm/staff/new?share=error`
    );

    const storeInboxItem = vi.fn(async () => "never");
    const empty = loadSw({ vault: { storeInboxItem } });
    const res = await empty.dispatchFetch(shareRequest(new FormData())).ev.responded!;
    expect(res.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=error`);
    expect(storeInboxItem).not.toHaveBeenCalled();

    const noVault = loadSw();
    const f2 = new FormData();
    f2.set("text", "x");
    expect((await noVault.dispatchFetch(shareRequest(f2)).ev.responded!).headers.get("location")).toBe(
      `${ORIGIN}/agent/crm/staff/new?share=error`
    );
  });

  it("share POST from another site (referrer) is refused; total size is capped", async () => {
    const storeInboxItem = vi.fn(async () => "id2");
    const sw = loadSw({ vault: { storeInboxItem } });
    const f = new FormData();
    f.set("text", "x");
    const evil = await sw.dispatchFetch(shareRequest(f, "https://evil.test/page")).ev.responded!;
    expect(evil.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=error`);
    expect(storeInboxItem).not.toHaveBeenCalled();
    const own = await sw.dispatchFetch(shareRequest(f, `${ORIGIN}/agent/crm`)).ev.responded!;
    expect(own.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=id2`);

    const big = new FormData();
    for (let i = 0; i < 5; i++) big.append("media", new File([new Uint8Array(25 * 1024 * 1024)], `b${i}.jpg`, { type: "image/jpeg" }));
    await sw.dispatchFetch(shareRequest(big)).ev.responded;
    const files = ((storeInboxItem.mock.calls[1] as unknown[])[0] as { files: unknown[] }).files;
    expect(files).toHaveLength(4);
  });

  it("ignores other POSTs and cross-origin share URLs", () => {
    const sw = loadSw({ vault: { storeInboxItem: vi.fn() } });
    expect(sw.dispatchFetch({ url: `${ORIGIN}/api/crm2/quick-create`, method: "POST", mode: "cors" }).count).toBe(0);
    expect(sw.dispatchFetch({ url: `https://evil.test/agent/crm/staff/share`, method: "POST", mode: "navigate" }).count).toBe(0);
  });

  it("navigation fallback still serves offline.html when the network fails", async () => {
    const sw = loadSw();
    await sw.install();
    const { ev, count } = sw.dispatchFetch({ url: `${ORIGIN}/agent/crm/staff/new`, method: "GET", mode: "navigate" });
    expect(count).toBe(1);
    expect(await (await ev.responded!).text()).toBe("cached:/offline.html");
  });

  it("navigation goes to the network when online; API GETs are not intercepted", async () => {
    const sw = loadSw({ fetchImpl: () => Promise.resolve(new Response("live")) });
    const nav = sw.dispatchFetch({ url: `${ORIGIN}/agent/crm`, method: "GET", mode: "navigate" });
    expect(await (await nav.ev.responded!).text()).toBe("live");
    expect(sw.dispatchFetch({ url: `${ORIGIN}/api/crm2/events`, method: "GET", mode: "cors" }).count).toBe(0);
    expect(sw.dispatchFetch({ url: `${ORIGIN}/_next/static/x.js`, method: "GET", mode: "no-cors" }).count).toBe(0);
  });

  it("offline page assets (vault script, icons) come from the precache when offline", async () => {
    const sw = loadSw();
    await sw.install();
    const js = sw.dispatchFetch({ url: `${ORIGIN}/crm2-vault.js`, method: "GET", mode: "no-cors" });
    expect(js.count).toBe(1);
    expect(await (await js.ev.responded!).text()).toBe("cached:/crm2-vault.js");
    const icon = sw.dispatchFetch({ url: `${ORIGIN}/icons/icon-192.png`, method: "GET", mode: "no-cors" });
    expect(await (await icon.ev.responded!).text()).toBe("cached:/icons/icon-192.png");
  });

  it("push and notificationclick behave as before", async () => {
    const sw = loadSw();
    const ev: FakeEvent = {
      data: { json: () => ({ title: "Өнөөдрийн дутуу бүртгэл", body: "3 хөрөнгө", url: "//evil.test", tag: "crm2-digest" }), text: () => "" },
      waitUntil: (p) => (ev.waited = p),
    };
    for (const fn of sw.listeners.push) fn(ev);
    await ev.waited;
    expect(sw.shown).toEqual([
      {
        title: "Өнөөдрийн дутуу бүртгэл",
        options: {
          body: "3 хөрөнгө",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: "crm2-digest",
          renotify: true,
          data: { url: "/agent/crm" },
        },
      },
    ]);
    const close = vi.fn();
    const click: FakeEvent = {
      notification: { close, data: { url: "/agent/crm/staff/incomplete" } },
      waitUntil: (p) => (click.waited = p),
    };
    for (const fn of sw.listeners.notificationclick) fn(click);
    await click.waited;
    expect(close).toHaveBeenCalled();
    const clients = sw.self.clients as { openWindow: ReturnType<typeof vi.fn> };
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/agent/crm/staff/incomplete`);
  });

  it("never logs shared text", () => {
    expect(SW_SRC).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

// ── share/route.ts (SW удирдаагүй үеийн нөөц) ────────────────

describe("share route fallback", () => {
  it("POST → 303 ?share=nosw without echoing the shared text", async () => {
    const form = new FormData();
    form.set("text", "НУУЦ-БИЧВЭР 99112233");
    const res = await sharePost(new NextRequest(`${ORIGIN}/agent/crm/staff/share`, { method: "POST", body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=nosw`);
    expect(res.headers.get("location")).not.toContain("99112233");
    expect(await res.text()).not.toContain("НУУЦ");
  });

  it("GET → 303 ?share=nosw (query is dropped)", async () => {
    const res = await shareGet(new NextRequest(`${ORIGIN}/agent/crm/staff/share?text=secret`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/agent/crm/staff/new?share=nosw`);
  });
});

// ── offline.html ─────────────────────────────────────────────

describe("public/offline.html", () => {
  it("loads the vault twin and keeps the plain offline message", () => {
    expect(OFFLINE_SRC).toContain('<script src="/crm2-vault.js"></script>');
    expect(OFFLINE_SRC).toContain("Сүлжээ алга байна");
    expect(OFFLINE_SRC).toContain("Дахин оролдох");
  });

  it("offers the capture only on staff/new with a last profile, and stores an offline item", () => {
    expect(OFFLINE_SRC).toContain('"/agent/crm/staff/new"');
    expect(OFFLINE_SRC).toContain('"crm2:last-profile"');
    expect(OFFLINE_SRC).toMatch(/storeInboxItem\(\{ kind: "offline", profileId: profileId/);
    expect(OFFLINE_SRC).toContain('type="file" accept="image/*" multiple');
    expect(OFFLINE_SRC).toContain("<textarea");
    expect(OFFLINE_SRC).toContain("Утсан дээр хадгалах");
    expect(OFFLINE_SRC).toContain("Хадгалагдлаа — сүлжээ орвол CRM-ээ нээнэ үү");
  });

  it("is phone-friendly: 16px textarea, ≥48px save button, live status", () => {
    expect(OFFLINE_SRC).toMatch(/textarea \{[^}]*font-size: 16px/);
    expect(OFFLINE_SRC).toMatch(/\.bar button \{[^}]*height: 3rem/);
    expect(OFFLINE_SRC).toContain('role="status" aria-live="polite"');
  });

  it("does not persist the note in plaintext storage", () => {
    expect(OFFLINE_SRC).not.toMatch(/localStorage\.setItem|sessionStorage/);
  });
});

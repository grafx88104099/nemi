/**
 * public/crm2-vault.js (SW / offline.html) ба lib/crm2/device/vault.ts нэг формат,
 * нэг түлхүүрээр харилцан ажилладаг эсэх. Node webcrypto түлхүүр; IndexedDB-ийн
 * оронд санах ойн жижиг хуурмаг (энд хэрэглэгдэх API-ууд л).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  base64ToBytes,
  bytesToBase64,
  CRM2_DB_NAME,
  CRM2_DB_STORES,
  CRM2_DB_VERSION,
  DEVICE_KEY_ID,
  generateDeviceKey,
  openWithKey,
  sealWithKey,
  setCrm2KvFactoryForTests,
  VAULT_AAD_PREFIX,
  type SealedRecord,
} from "@/lib/crm2/device/vault";
import {
  listOfflineCaptures,
  OFFLINE_TTL_MS,
  readShared,
  SHARE_DB_NAME,
  SHARE_STORE,
  SHARE_TTL_MS,
} from "@/lib/crm2/device/share-inbox";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

type InboxInput = { kind: "share" | "offline"; profileId: string | null; text: string; files: unknown[] };
type JsVault = {
  DB_NAME: string;
  DB_VERSION: number;
  DB_STORES: string[];
  KEY_ID: string;
  AAD_PREFIX: string;
  SHARE_DB_NAME: string;
  SHARE_STORE: string;
  SHARE_TTL_MS: number;
  OFFLINE_TTL_MS: number;
  bytesToBase64(b: Uint8Array): string;
  base64ToBytes(s: string): Uint8Array;
  sealWithKey(key: CryptoKey, obj: unknown, opts: { profileId: string; ttlMs: number; now?: number }): Promise<SealedRecord>;
  openWithKey(key: CryptoKey, rec: unknown, opts?: { profileId?: string | null; now?: number }): Promise<unknown>;
  deviceKey(): Promise<CryptoKey>;
  seal(obj: unknown, opts: { profileId: string; ttlMs: number }): Promise<SealedRecord>;
  open(rec: unknown, opts?: { profileId?: string | null }): Promise<unknown>;
  newId(): string;
  storeInboxItem(input: InboxInput): Promise<string>;
};

const VAULT_SRC = readFileSync(join(process.cwd(), "public", "crm2-vault.js"), "utf8");

function loadJsVault(root: Record<string, unknown>): JsVault {
  new Function("self", VAULT_SRC)(root);
  return root.Crm2Vault as JsVault;
}

// ── Санах ойн IndexedDB хуурмаг ─────────────────────────────

type Handler = ((this: FakeRequest, ev: unknown) => void) | null;
class FakeRequest {
  result: unknown = undefined;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  oncomplete: Handler = null;
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
  onabort: Handler = null;
}

type StoreData = { keyPath: string | null; data: Map<string, unknown> };
type DbData = { version: number; stores: Map<string, StoreData> };

class FakeTx {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
  private pending = 0;
  private done = false;
  constructor(
    private db: DbData,
    private names: string[]
  ) {
    setTimeout(() => this.check(), 0);
  }
  objectStore(name: string) {
    if (!this.names.includes(name) || !this.db.stores.has(name)) throw new Error("NotFoundError: " + name);
    const s = this.db.stores.get(name)!;
    const run = (fn: () => unknown) => {
      const req = new FakeRequest();
      this.pending++;
      setTimeout(() => {
        req.result = fn();
        req.onsuccess?.call(req, { target: req });
        this.pending--;
        setTimeout(() => this.check(), 0);
      }, 0);
      return req;
    };
    const keyOf = (value: unknown, key?: string) =>
      key ?? (s.keyPath ? String((value as Record<string, unknown>)[s.keyPath]) : undefined);
    return {
      transaction: this,
      get: (key: string) => run(() => s.data.get(key)),
      getAll: () => run(() => [...s.data.values()]),
      put: (value: unknown, key?: string) =>
        run(() => {
          const k = keyOf(value, key);
          if (k === undefined) throw new Error("DataError");
          s.data.set(k, value);
          return k;
        }),
      delete: (key: string) => run(() => void s.data.delete(key)),
      clear: () => run(() => void s.data.clear()),
    };
  }
  private check() {
    if (this.done || this.pending > 0) return;
    this.done = true;
    this.oncomplete?.call(this);
  }
}

function fakeIndexedDb() {
  const dbs = new Map<string, DbData>();
  const connection = (d: DbData) => ({
    get version() {
      return d.version;
    },
    objectStoreNames: { contains: (n: string) => d.stores.has(n) },
    createObjectStore: (n: string, opts?: { keyPath?: string }) => {
      d.stores.set(n, { keyPath: opts?.keyPath ?? null, data: new Map() });
    },
    transaction: (names: string | string[]) => new FakeTx(d, Array.isArray(names) ? names : [names]),
    close: () => undefined,
    onversionchange: null as unknown,
    onclose: null as unknown,
  });
  return {
    dbs,
    open(name: string, version?: number) {
      const req = new FakeRequest();
      setTimeout(() => {
        let d = dbs.get(name);
        const want = version ?? d?.version ?? 1;
        if (d && want < d.version) {
          req.error = Object.assign(new Error("VersionError"), { name: "VersionError" });
          req.onerror?.call(req, {});
          return;
        }
        const upgrade = !d || want > d.version;
        if (!d) {
          d = { version: want, stores: new Map() };
          dbs.set(name, d);
        }
        d.version = want;
        req.result = connection(d);
        if (upgrade) req.onupgradeneeded?.call(req, {});
        req.onsuccess?.call(req, {});
      }, 0);
      return req;
    },
  };
}

// ── Тестүүд ──────────────────────────────────────────────────

describe("crm2-vault.js constants match vault.ts / share-inbox.ts", () => {
  const js = loadJsVault({ crypto: globalThis.crypto });
  it("same DB, key id, AAD and share inbox", () => {
    expect(js.DB_NAME).toBe(CRM2_DB_NAME);
    expect(js.DB_VERSION).toBe(CRM2_DB_VERSION);
    expect(js.DB_STORES).toEqual([...CRM2_DB_STORES]);
    expect(js.KEY_ID).toBe(DEVICE_KEY_ID);
    expect(js.AAD_PREFIX).toBe(VAULT_AAD_PREFIX);
    expect(js.SHARE_DB_NAME).toBe(SHARE_DB_NAME);
    expect(js.SHARE_STORE).toBe(SHARE_STORE);
    expect(js.SHARE_TTL_MS).toBe(SHARE_TTL_MS);
    expect(js.OFFLINE_TTL_MS).toBe(OFFLINE_TTL_MS);
  });

  it("same base64 encoding", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    expect(js.bytesToBase64(bytes)).toBe(bytesToBase64(bytes));
    expect([...js.base64ToBytes(bytesToBase64(bytes))]).toEqual([...base64ToBytes(js.bytesToBase64(bytes))]);
  });

  it("is plain browser JS (no import/export, no TS syntax) and exposes self.Crm2Vault", () => {
    expect(VAULT_SRC).not.toMatch(/^\s*(import|export)\s/m);
    expect(VAULT_SRC).toContain("root.Crm2Vault = api");
  });
});

describe("crm2-vault.js ↔ vault.ts round trip (node webcrypto key)", () => {
  const js = loadJsVault({ crypto: globalThis.crypto });
  const obj = { text: "Зайсан 3 өрөө 120 сая, 9911 2233", n: 1, ok: true };

  it("js seal → ts open", async () => {
    const key = await generateDeviceKey();
    const rec = await js.sealWithKey(key, obj, { profileId: P1, ttlMs: 60_000 });
    expect(Object.keys(rec).sort()).toEqual(["ct", "expiresAt", "iv", "profileId", "v"]);
    expect(rec.v).toBe(1);
    expect(base64ToBytes(rec.iv)).toHaveLength(12);
    expect(JSON.stringify(rec)).not.toContain("9911");
    expect(await openWithKey(key, rec, { profileId: P1 })).toEqual(obj);
  });

  it("ts seal → js open", async () => {
    const key = await generateDeviceKey();
    const rec = await sealWithKey(key, obj, { profileId: P1, ttlMs: 60_000 });
    expect(await js.openWithKey(key, rec, { profileId: P1 })).toEqual(obj);
  });

  it("expiry, other profile, unbound share and AAD tampering behave the same", async () => {
    const key = await generateDeviceKey();
    const jsRec = await js.sealWithKey(key, "x", { profileId: P1, ttlMs: 1000, now: 1_000 });
    const tsRec = await sealWithKey(key, "x", { profileId: P1, ttlMs: 1000, now: 1_000 });
    for (const rec of [jsRec, tsRec]) {
      expect(await openWithKey(key, rec, { now: 1_500 })).toBe("x");
      expect(await js.openWithKey(key, rec, { now: 1_500 })).toBe("x");
      expect(await openWithKey(key, rec, { now: 2_000 })).toBeNull();
      expect(await js.openWithKey(key, rec, { now: 2_000 })).toBeNull();
      expect(await js.openWithKey(key, rec, { profileId: P2, now: 1_500 })).toBeNull();
      const tampered = { ...rec, profileId: P2 };
      expect(await openWithKey(key, tampered, { now: 1_500 })).toBeNull();
      expect(await js.openWithKey(key, tampered, { now: 1_500 })).toBeNull();
      expect(await js.openWithKey(key, { ...rec, expiresAt: rec.expiresAt + 1 }, { now: 1_500 })).toBeNull();
    }
    const unbound = await js.sealWithKey(key, "share", { profileId: "", ttlMs: 60_000 });
    expect(await openWithKey(key, unbound, { profileId: P2 })).toBe("share");
  });

  it("a different key cannot open", async () => {
    const rec = await js.sealWithKey(await generateDeviceKey(), obj, { profileId: P1, ttlMs: 60_000 });
    expect(await openWithKey(await generateDeviceKey(), rec, { profileId: P1 })).toBeNull();
  });
});

describe("shared IndexedDB key and share inbox (fake IDB)", () => {
  const g = globalThis as { indexedDB?: unknown };
  const before = g.indexedDB;
  let idb: ReturnType<typeof fakeIndexedDb>;
  let js: JsVault;

  // vault.ts DB холболтоо модульд кэшилдэг тул нэг хуурмаг DB-г бүх тестэд хуваалцана.
  beforeAll(() => {
    idb = fakeIndexedDb();
    g.indexedDB = idb;
    setCrm2KvFactoryForTests(null); // vault.ts-ийн түлхүүрийн кэшийг цэвэрлэнэ
    js = loadJsVault({ crypto: globalThis.crypto, indexedDB: idb });
  });
  afterAll(() => {
    g.indexedDB = before;
    setCrm2KvFactoryForTests(null);
  });

  it("js creates the non-extractable device key in nemi-crm2/keys/device-v1 with all stores, once", async () => {
    const k1 = await js.deviceKey();
    const k2 = await js.deviceKey();
    expect(k1).toBe(k2);
    expect(k1.extractable).toBe(false);
    const db = idb.dbs.get(CRM2_DB_NAME)!;
    expect(db.version).toBe(CRM2_DB_VERSION);
    expect([...db.stores.keys()].sort()).toEqual([...CRM2_DB_STORES].sort());
    expect(db.stores.get("keys")!.data.get(DEVICE_KEY_ID)).toBe(k1);
  });

  it("js seal with the stored key → vault.ts open (same device key)", async () => {
    const { open } = await import("@/lib/crm2/device/vault");
    const rec = await js.seal({ a: 1 }, { profileId: P1, ttlMs: 60_000 });
    expect(await open(rec, { profileId: P1 })).toEqual({ a: 1 });
  });

  it("vault.ts-created key is reused by js", async () => {
    const { seal } = await import("@/lib/crm2/device/vault");
    const rec = await seal("from-ts", { profileId: P1, ttlMs: 60_000 });
    expect(await js.open(rec, { profileId: P1 })).toBe("from-ts");
  });

  it("opens an app DB that was bumped to a newer version", async () => {
    const other = fakeIndexedDb();
    other.dbs.set(CRM2_DB_NAME, {
      version: CRM2_DB_VERSION + 1,
      stores: new Map(CRM2_DB_STORES.map((s) => [s, { keyPath: null, data: new Map() }])),
    });
    const k = await loadJsVault({ crypto: globalThis.crypto, indexedDB: other }).deviceKey();
    expect(other.dbs.get(CRM2_DB_NAME)!.version).toBe(CRM2_DB_VERSION + 1);
    expect(other.dbs.get(CRM2_DB_NAME)!.stores.get("keys")!.data.get(DEVICE_KEY_ID)).toBe(k);
  });

  it("share item (SW) → readShared opens it for any profile; record shape matches share-inbox", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" });
    const id = await js.storeInboxItem({
      kind: "share",
      profileId: null,
      text: "2 өрөө байр",
      files: [{ name: "a.jpg", type: "image/jpeg", blob: file }],
    });
    const raw = idb.dbs.get(SHARE_DB_NAME)!.stores.get(SHARE_STORE)!.data.get(id) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(["at", "files", "id", "kind", "profileId", "sealedText"]);
    expect(raw.kind).toBe("share");
    expect(raw.profileId).toBeNull();
    expect((raw.sealedText as SealedRecord).profileId).toBe("");
    expect(JSON.stringify(raw)).not.toContain("өрөө");
    const item = await readShared(id, P2);
    expect(item?.text).toBe("2 өрөө байр");
    expect(item?.kind).toBe("share");
    expect(item?.files).toHaveLength(1);
    expect(item?.files[0].blob).toBe(file);
  });

  it("offline capture is bound to its profile, listed for it and hidden from others", async () => {
    const id = await js.storeInboxItem({ kind: "offline", profileId: P1, text: "тэмдэглэл", files: [] });
    const raw = idb.dbs.get(SHARE_DB_NAME)!.stores.get(SHARE_STORE)!.data.get(id) as Record<string, unknown>;
    expect(raw.profileId).toBe(P1);
    const sealed = raw.sealedText as SealedRecord;
    expect(sealed.profileId).toBe(P1);
    expect(sealed.expiresAt - (raw.at as number)).toBeGreaterThan(OFFLINE_TTL_MS - 5_000);
    expect(await listOfflineCaptures(P1)).toEqual([{ id, at: raw.at, fileCount: 0, hasText: true }]);
    expect(await listOfflineCaptures(P2)).toEqual([]);
    expect((await readShared(id, P1))?.text).toBe("тэмдэглэл");
    expect(await readShared(id, P2)).toBeNull();
  });

  it("offline capture without a profile is refused; photo-only share has no sealed text", async () => {
    await expect(js.storeInboxItem({ kind: "offline", profileId: null, text: "x", files: [] })).rejects.toThrow();
    const id = await js.storeInboxItem({ kind: "share", profileId: null, text: "", files: [] });
    const item = await readShared(id, P1);
    expect(item?.text).toBeNull();
  });
});

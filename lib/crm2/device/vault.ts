/**
 * Төхөөрөмжийн шифрлэсэн сан (vault) ба CRM2-ийн IndexedDB давхарга.
 *
 * ── IndexedDB ───────────────────────────────────────────────
 * DB «nemi-crm2», хувилбар CRM2_DB_VERSION (=1). Store-ууд (бүгд out-of-line түлхүүртэй,
 * keyPath-гүй): keys, drafts, blobs, sealed, queue, pending, outbox.
 * public/crm2-vault.js (service worker / offline.html) ижил нэр, хувилбар, store-ын
 * жагсаалтаар нээж, onupgradeneeded дээр дутуу store-ыг үүсгэнэ. Store нэмэх бол
 * хоёр талд хувилбарыг зэрэг ахиулна.
 *
 * ── Төхөөрөмжийн түлхүүр ────────────────────────────────────
 * AES-GCM 256, `extractable: false`, usages ["encrypt","decrypt"]. CryptoKey объектыг
 * өөрийг нь (structured clone) store «keys», түлхүүр «device-v1»-д хадгална.
 * Байхгүй бол аль ч тал (энэ модуль эсвэл crm2-vault.js) үүсгэнэ; уралдаанаас
 * сэргийлж «байхгүй бол л бич» гэж нэг гүйлгээнд бичээд дахин уншина.
 *
 * ── Битүүмжилсэн бичлэгийн формат (v1) ─────────────────────
 *   { v: 1, iv: base64(12 байт), ct: base64(AES-GCM шифр + 16 байт tag),
 *     profileId: string, expiresAt: number (unix ms) }
 * - Нээлттэй текст = UTF-8(JSON.stringify(obj)).
 * - additionalData (AAD) = UTF-8(`nemi-crm2-vault:v1:${profileId}:${expiresAt}`) —
 *   profileId/expiresAt-ыг өөрчилбөл тайлагдахгүй.
 * - base64 нь стандарт (btoa, «+/» ба «=» дүүргэлттэй).
 * - profileId = "" бол хэрэглэгчид холбогдоогүй (жишээ нь SW-ийн share) — аль ч
 *   профайл нээж болно.
 * Хоёртын хувилбар (sealBytes): ct нь base64 биш ArrayBuffer, нээлттэй текст нь
 * түүхий байт; бусад талбар, AAD ижил.
 *
 * Хамгаалалт: дискэн дээрх/нөөц хуулбарт ил текст үлдэхгүй, түлхүүрийг экспортлох
 * боломжгүй. Нэг origin дээр ажиллаж буй кодоос хамгаалахгүй. Гарахад wipeVault().
 */

import {
  clear as idbClear,
  del as idbDel,
  delMany as idbDelMany,
  entries as idbEntries,
  get as idbGet,
  set as idbSet,
  update as idbUpdate,
  type UseStore,
} from "idb-keyval";

export const CRM2_DB_NAME = "nemi-crm2";
export const CRM2_DB_VERSION = 1;
export const CRM2_DB_STORES = ["keys", "drafts", "blobs", "sealed", "queue", "pending", "outbox"] as const;
export type Crm2StoreName = (typeof CRM2_DB_STORES)[number];

export const DEVICE_KEY_ID = "device-v1";
export const VAULT_AAD_PREFIX = "nemi-crm2-vault:v1:";

export type SealedRecord = {
  v: 1;
  iv: string;
  ct: string;
  profileId: string;
  expiresAt: number;
};

export type SealedBytesRecord = {
  v: 1;
  iv: string;
  ct: ArrayBuffer;
  profileId: string;
  expiresAt: number;
};

// ── IndexedDB (idb-keyval-д зориулсан нэг DB, олон store) ────

let dbPromise: Promise<IDBDatabase> | null = null;

function openCrm2Db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("no_indexeddb"));
        return;
      }
      const req = indexedDB.open(CRM2_DB_NAME, CRM2_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of CRM2_DB_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
      req.onblocked = () => reject(new Error("idb_blocked"));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** idb-keyval-ийн UseStore — «nemi-crm2» DB-ийн нэг store. */
export function crm2Store(name: Crm2StoreName): UseStore {
  return (mode, callback) => openCrm2Db().then((db) => callback(db.transaction(name, mode).objectStore(name)));
}

/** Энгийн key-value интерфейс (тестэд санах ойн хувилбараар солино). */
export type Kv = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** Атомаар шинэчилнэ (нэг гүйлгээнд). updater синхрон байна. */
  update<T>(key: string, updater: (old: T | undefined) => T): Promise<void>;
  del(key: string): Promise<void>;
  delMany(keys: string[]): Promise<void>;
  entries<T>(): Promise<[string, T][]>;
  clear(): Promise<void>;
};

function idbKv(name: Crm2StoreName): Kv {
  const store = crm2Store(name);
  return {
    get: <T,>(key: string) => idbGet<T>(key, store),
    set: (key, value) => idbSet(key, value, store),
    update: <T,>(key: string, updater: (old: T | undefined) => T) => idbUpdate<T>(key, updater, store),
    del: (key) => idbDel(key, store),
    delMany: (keys) => (keys.length ? idbDelMany(keys, store) : Promise.resolve()),
    entries: <T,>() => idbEntries<string, T>(store),
    clear: () => idbClear(store),
  };
}

/** Санах ойн Kv (тест, IndexedDB-гүй орчин). Утгыг хуулахгүй — дуудагч өөрчлөхгүй байх ёстой. */
export function memoryKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => m.get(key) as T | undefined,
    set: async (key, value) => {
      m.set(key, value);
    },
    update: async <T,>(key: string, updater: (old: T | undefined) => T) => {
      m.set(key, updater(m.get(key) as T | undefined));
    },
    del: async (key) => {
      m.delete(key);
    },
    delMany: async (keys) => {
      for (const k of keys) m.delete(k);
    },
    entries: async <T,>() => [...m.entries()] as [string, T][],
    clear: async () => {
      m.clear();
    },
  };
}

type KvFactory = (name: Crm2StoreName) => Kv;
let kvFactory: KvFactory = idbKv;
const kvCache = new Map<Crm2StoreName, Kv>();

/** CRM2 store-ын Kv. */
export function crm2Kv(name: Crm2StoreName): Kv {
  let kv = kvCache.get(name);
  if (!kv) {
    kv = kvFactory(name);
    kvCache.set(name, kv);
  }
  return kv;
}

/** Зөвхөн тестэд: бүх store-ыг санах ойн (эсвэл өгсөн) Kv-ээр солино. */
export function setCrm2KvFactoryForTests(factory: KvFactory | null): void {
  kvFactory = factory ?? idbKv;
  kvCache.clear();
  keyPromise = null;
}

// ── base64 / AAD ─────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function aad(profileId: string, expiresAt: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${VAULT_AAD_PREFIX}${profileId}:${expiresAt}`);
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("no_webcrypto");
  return s;
}

export function vaultAvailable(): boolean {
  return typeof indexedDB !== "undefined" && !!globalThis.crypto?.subtle;
}

// ── Түлхүүр ──────────────────────────────────────────────────

let keyPromise: Promise<CryptoKey> | null = null;

export function generateDeviceKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
}

/** Төхөөрөмжийн түлхүүр (нэг удаа үүсгэж IDB-д хадгална). */
export function deviceKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const kv = crm2Kv("keys");
      const existing = await kv.get<CryptoKey>(DEVICE_KEY_ID);
      if (existing) return existing;
      const fresh = await generateDeviceKey();
      // Өөр таб/SW зэрэг үүсгэсэн бол түүнийхийг үлдээнэ.
      await kv.update<CryptoKey>(DEVICE_KEY_ID, (old) => old ?? fresh);
      const stored = await kv.get<CryptoKey>(DEVICE_KEY_ID);
      return stored ?? fresh;
    })();
    keyPromise.catch(() => {
      keyPromise = null;
    });
  }
  return keyPromise;
}

// ── Цэвэр (түлхүүр өгөгдсөн) битүүмжлэл ─────────────────────

export type SealOptions = { profileId: string; ttlMs: number; now?: number };
export type OpenOptions = { profileId?: string | null; now?: number };

function expiresAtOf(opts: SealOptions): number {
  return Math.round((opts.now ?? Date.now()) + Math.max(0, opts.ttlMs));
}

export async function sealBytesWithKey(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>, opts: SealOptions): Promise<SealedBytesRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const expiresAt = expiresAtOf(opts);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(opts.profileId, expiresAt) }, key, bytes);
  return { v: 1, iv: bytesToBase64(iv), ct, profileId: opts.profileId, expiresAt };
}

export async function sealWithKey(key: CryptoKey, obj: unknown, opts: SealOptions): Promise<SealedRecord> {
  const plain = new TextEncoder().encode(JSON.stringify(obj ?? null));
  const r = await sealBytesWithKey(key, plain, opts);
  return { ...r, ct: bytesToBase64(new Uint8Array(r.ct)) };
}

/** Бичлэг энэ профайл нээх эрхтэй, хугацаа дуусаагүй эсэх (тайлахгүйгээр). */
export function canOpenRecord(
  record: { v?: unknown; profileId?: unknown; expiresAt?: unknown } | null | undefined,
  opts: OpenOptions = {}
): boolean {
  if (!record || record.v !== 1) return false;
  if (typeof record.expiresAt !== "number" || typeof record.profileId !== "string") return false;
  if (record.expiresAt <= (opts.now ?? Date.now())) return false;
  if (opts.profileId != null && record.profileId !== "" && record.profileId !== opts.profileId) return false;
  return true;
}

export async function openBytesWithKey(
  key: CryptoKey,
  record: SealedBytesRecord | null | undefined,
  opts: OpenOptions = {}
): Promise<Uint8Array | null> {
  if (!record || !canOpenRecord(record, opts) || !(record.ct instanceof ArrayBuffer)) return null;
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv), additionalData: aad(record.profileId, record.expiresAt) },
      key,
      record.ct
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

export async function openWithKey<T = unknown>(
  key: CryptoKey,
  record: SealedRecord | null | undefined,
  opts: OpenOptions = {}
): Promise<T | null> {
  if (!record || !canOpenRecord(record, opts) || typeof record.ct !== "string") return null;
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv), additionalData: aad(record.profileId, record.expiresAt) },
      key,
      base64ToBytes(record.ct)
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ── Төхөөрөмжийн түлхүүрээр ──────────────────────────────────

export async function seal(obj: unknown, opts: SealOptions): Promise<SealedRecord> {
  return sealWithKey(await deviceKey(), obj, opts);
}

/**
 * Битүүмжилсэн бичлэгийг нээнэ. Хугацаа дууссан, өөр профайлынх (profileId өгсөн бол),
 * эвдэрсэн эсвэл түлхүүр солигдсон бол null.
 */
export async function open<T = unknown>(record: SealedRecord | null | undefined, opts: OpenOptions = {}): Promise<T | null> {
  if (!record || !canOpenRecord(record, opts)) return null;
  try {
    return await openWithKey<T>(await deviceKey(), record, opts);
  } catch {
    return null;
  }
}

export async function sealBytes(bytes: Uint8Array<ArrayBuffer>, opts: SealOptions): Promise<SealedBytesRecord> {
  return sealBytesWithKey(await deviceKey(), bytes, opts);
}

export async function openBytes(record: SealedBytesRecord | null | undefined, opts: OpenOptions = {}): Promise<Uint8Array | null> {
  if (!record || !canOpenRecord(record, opts)) return null;
  try {
    return await openBytesWithKey(await deviceKey(), record, opts);
  } catch {
    return null;
  }
}

/** Store «sealed»-д нэрлэсэн битүүмжилсэн бичлэг хадгалах/унших/устгах. */
export async function putSealed(id: string, obj: unknown, opts: SealOptions): Promise<void> {
  await crm2Kv("sealed").set(id, await seal(obj, opts));
}

export async function getSealed<T = unknown>(id: string, opts: OpenOptions = {}): Promise<T | null> {
  const rec = await crm2Kv("sealed").get<SealedRecord>(id);
  return rec ? open<T>(rec, opts) : null;
}

export async function hasSealed(id: string): Promise<boolean> {
  return (await crm2Kv("sealed").get(id)) !== undefined;
}

export async function deleteSealed(id: string): Promise<void> {
  await crm2Kv("sealed").del(id);
}

/** Хугацаа дууссан «sealed» бичлэгүүдийг устгана (тайлахгүйгээр). */
export async function purgeExpiredSealed(now = Date.now()): Promise<number> {
  const kv = crm2Kv("sealed");
  const dead = (await kv.entries<SealedRecord>()).filter(([, r]) => !r || typeof r.expiresAt !== "number" || r.expiresAt <= now);
  await kv.delMany(dead.map(([k]) => k));
  return dead.length;
}

/** Өөр профайлын «sealed» бичлэгүүдийг устгана. */
export async function purgeSealedForOthers(profileId: string): Promise<number> {
  const kv = crm2Kv("sealed");
  const dead = (await kv.entries<SealedRecord>()).filter(([, r]) => !r || (r.profileId !== "" && r.profileId !== profileId));
  await kv.delMany(dead.map(([k]) => k));
  return dead.length;
}

/** Түлхүүр болон бүх битүүмжилсэн бичлэгийг (sealed, pending) устгана. */
export async function wipeVault(): Promise<void> {
  keyPromise = null;
  await Promise.allSettled([crm2Kv("keys").del(DEVICE_KEY_ID), crm2Kv("sealed").clear(), crm2Kv("pending").clear()]);
  keyPromise = null;
}

/**
 * Хуваалцсан бичвэр/зураг ба сүлжээгүй үеийн бүртгэлийн хайрцаг (R7/R9).
 *
 * Түүхий IndexedDB: DB «nemi-share», хувилбар 1, store «items» (keyPath «id»).
 * public/sw.js (share target) ба public/offline.html ижил DB/store-д бичнэ.
 * Бичлэг:
 *   { id: string, at: number (unix ms), kind: 'share' | 'offline',
 *     profileId: string | null, sealedText: SealedRecord | null (vault v1 формат),
 *     files: [{ name: string, type: string, blob: Blob }] }
 * share-д profileId = null, sealedText-ийн profileId = "" (хэрэглэгчид холбогдоогүй).
 * Хугацаа: share 1 цаг, offline 24 цаг; өөр профайлын бичлэгийг шууд устгана.
 */

import { open, type SealedRecord } from "@/lib/crm2/device/vault";

export const SHARE_DB_NAME = "nemi-share";
export const SHARE_DB_VERSION = 1;
export const SHARE_STORE = "items";
export const SHARE_TTL_MS = 60 * 60 * 1000;
export const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;

export type ShareFile = { name: string; type: string; blob: Blob };

export type ShareRecord = {
  id: string;
  at: number;
  kind: "share" | "offline";
  profileId: string | null;
  sealedText: SealedRecord | null;
  files: ShareFile[];
};

export type SharedItem = {
  id: string;
  at: number;
  kind: "share" | "offline";
  text: string | null;
  files: ShareFile[];
};

export type OfflineCaptureSummary = { id: string; at: number; fileCount: number; hasText: boolean };

/** Цэвэр: бичлэг устгагдах ёстой эсэх. */
export function shouldPurgeShare(
  rec: Pick<ShareRecord, "at" | "kind" | "profileId"> | null | undefined,
  now: number,
  currentProfileId: string | null
): boolean {
  if (!rec || typeof rec.at !== "number") return true;
  if (rec.profileId && currentProfileId && rec.profileId !== currentProfileId) return true;
  const ttl = rec.kind === "offline" ? OFFLINE_TTL_MS : SHARE_TTL_MS;
  return now - rec.at > ttl || rec.at - now > ttl;
}

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no_indexeddb"));
      return;
    }
    const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) db.createObjectStore(SHARE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
    req.onblocked = () => reject(new Error("idb_blocked"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openShareDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, mode);
      const req = fn(tx.objectStore(SHARE_STORE));
      let result: T | undefined;
      if (req) req.onsuccess = () => (result = req.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("tx_abort"));
    });
  } finally {
    db.close();
  }
}

async function allRecords(): Promise<ShareRecord[]> {
  try {
    return ((await withStore<ShareRecord[]>("readonly", (s) => s.getAll() as IDBRequest<ShareRecord[]>)) ?? []).filter(Boolean);
  } catch {
    return [];
  }
}

/** Хуваалцсан бичлэгийг нээнэ (өөр профайлынх бол null). Бичвэр нээгдэхгүй бол text = null. */
export async function readShared(id: string, profileId: string): Promise<SharedItem | null> {
  let rec: ShareRecord | undefined;
  try {
    rec = await withStore<ShareRecord>("readonly", (s) => s.get(id) as IDBRequest<ShareRecord>);
  } catch {
    return null;
  }
  if (!rec || shouldPurgeShare(rec, Date.now(), profileId)) return null;
  const text = rec.sealedText ? await open<string>(rec.sealedText, { profileId }) : null;
  return {
    id: rec.id,
    at: rec.at,
    kind: rec.kind,
    text: typeof text === "string" ? text : null,
    files: Array.isArray(rec.files) ? rec.files.filter((f) => f && f.blob instanceof Blob) : [],
  };
}

/** Нэг бичлэг эсвэл бүгдийг ('all') устгана. */
export async function deleteShared(id: string | "all"): Promise<void> {
  try {
    if (id === "all") await withStore("readwrite", (s) => void s.clear());
    else await withStore("readwrite", (s) => void s.delete(id));
  } catch {
    // DB байхгүй — устгах юм алга.
  }
}

/** share > 1 цаг, offline > 24 цаг, өөр профайлын бичлэгүүдийг устгана. */
export async function purgeShared(currentProfileId: string | null = null, now = Date.now()): Promise<number> {
  const dead = (await allRecords()).filter((r) => shouldPurgeShare(r, now, currentProfileId)).map((r) => r.id);
  if (!dead.length) return 0;
  try {
    await withStore("readwrite", (s) => {
      for (const id of dead) s.delete(id);
    });
  } catch {
    return 0;
  }
  return dead.length;
}

/** Энэ хэрэглэгчийн сүлжээгүй үед хадгалсан бүртгэлүүд (шинэ нь эхэнд). */
export async function listOfflineCaptures(profileId: string): Promise<OfflineCaptureSummary[]> {
  const now = Date.now();
  return (await allRecords())
    .filter((r) => r.kind === "offline" && r.profileId === profileId && !shouldPurgeShare(r, now, profileId))
    .sort((a, b) => b.at - a.at)
    .map((r) => ({ id: r.id, at: r.at, fileCount: Array.isArray(r.files) ? r.files.length : 0, hasText: !!r.sealedText }));
}

/**
 * Upload дараалал (R8/R12): зураг, гэрээ/өмчлөлийн PDF-ийг сүлжээ тасарсан ч алдахгүй.
 *
 * - Модулийн нэг singleton; IndexedDB «nemi-crm2»: «queue» (мөрүүд) + «blobs» (файл).
 * - enqueue() мөрийг IDB-д бичсэний ДАРАА буцна — дуудагч ноорогоо устгахаас өмнө
 *   blob-ын эзэмшлийг авна (ноорог устгах/цэвэрлэх нь дараалалд заагдсан blob-д хүрэхгүй).
 * - Хөрөнгө хараахан үүсээгүй бол «waiting_property»; bindProperty(clientKey, id) суллана.
 * - Нэг удаад нэг файл; бичлэг Wi-Fi хүлээнэ; backoff 2/5/15/60 с; offline үед зогсоно.
 * - Гэрээний баримтыг vault-аар битүүмжилж хадгална, амжилттай хуулсны дараа шууд устгана.
 * - Алдаатай мөрийг хэзээ ч автоматаар хаяхгүй (retry / remove).
 */

import { useMemo, useSyncExternalStore } from "react";
import { crm2Kv, openBytes, sealBytes } from "@/lib/crm2/device/vault";
import {
  draftReferencedBlobKeys,
  getBlobRecord,
  newId,
  putBlob,
  putSealedBlob,
  type BlobRecord,
} from "@/lib/crm2/device/draft-store";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import type { Crm2Result } from "@/lib/crm2/types";

export type BrokerageFileKind = "contract" | "ownership" | "id" | "other";

export type QueueTarget =
  | {
      kind: "media";
      propertyId: string | null;
      clientKey: string;
      officeId: string;
      limits: Pick<Crm2FileLimits, "maxImageMb" | "maxVideoMb" | "maxImages" | "maxVideos">;
      sortOrder?: number;
      isCover?: boolean;
    }
  | {
      kind: "brokerage";
      contractId: string;
      fileKind: BrokerageFileKind;
      officeId: string;
      limits: Pick<Crm2FileLimits, "maxDocMb" | "maxDocsPerContract">;
    };

export type QueueStatus = "queued" | "waiting_property" | "waiting_wifi" | "uploading" | "done" | "failed";

export type QueueItem = {
  id: string;
  blobKey: string;
  profileId: string;
  target: QueueTarget;
  status: QueueStatus;
  attempts: number;
  error: string | null;
  name: string;
  type: string;
  bytes: number;
  isVideo: boolean;
  /** Брокерийн баримт битүүмжлэгдсэн эсэх. */
  sealed: boolean;
  createdAt: number;
  updatedAt: number;
  /** Дараагийн оролдлогын хугацаа (backoff). */
  nextAt: number;
  /** Хэрэглэгч мобайл дата дээр ч бичлэг илгээхийг зөвшөөрсөн. */
  allowCellular?: boolean;
};

export const BACKOFF_MS = [2000, 5000, 15000, 60000] as const;
/** Автомат оролдлогын дээд тоо — дараа нь «failed» (хаяхгүй). */
export const MAX_AUTO_ATTEMPTS = 6;
/** Дууссан мөрийг жагсаалтаас хасах хугацаа. */
export const DONE_KEEP_MS = 10 * 60 * 1000;
/** Битүүмжилсэн гэрээний баримтын хугацаа. */
export const SEALED_DOC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const UPLOAD_FAILED_TEXT = "Файл хуулагдсангүй. «Дахин оролдох» дарна уу.";

// ── Цэвэр туслахууд ──────────────────────────────────────────

export function backoffDelay(attempts: number): number {
  if (attempts <= 0) return 0;
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1];
}

export function initialStatus(target: QueueTarget, isVideo: boolean, wifi: boolean): QueueStatus {
  if (target.kind === "media" && !target.propertyId) return "waiting_property";
  if (isVideo && !wifi) return "waiting_wifi";
  return "queued";
}

/** Дараагийн хуулах мөр (хуучин нь эхэнд). */
export function pickNext(
  items: QueueItem[],
  ctx: { now: number; wifi: boolean; profileId: string | null }
): QueueItem | null {
  const ready = items
    .filter((i) => !ctx.profileId || i.profileId === ctx.profileId)
    .filter(
      (i) =>
        (i.status === "queued" && i.nextAt <= ctx.now && (!i.isVideo || ctx.wifi || i.allowCellular)) ||
        (i.status === "waiting_wifi" && (ctx.wifi || i.allowCellular))
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  return ready[0] ?? null;
}

/** Хуулах оролдлого бүтэлгүйтсэний дараах төлөв. */
export function afterFailure(item: QueueItem, error: string, now: number): QueueItem {
  const attempts = item.attempts + 1;
  if (attempts >= MAX_AUTO_ATTEMPTS) {
    return { ...item, attempts, status: "failed", error, updatedAt: now };
  }
  return { ...item, attempts, status: "queued", error, nextAt: now + backoffDelay(attempts), updatedAt: now };
}

export function bindItems(items: QueueItem[], clientKey: string, propertyId: string, wifi: boolean, now: number): QueueItem[] {
  return items.map((i) => {
    if (i.target.kind !== "media" || i.target.clientKey !== clientKey || i.status !== "waiting_property") return i;
    const target = { ...i.target, propertyId };
    return { ...i, target, status: initialStatus(target, i.isVideo, wifi), nextAt: now, updatedAt: now };
  });
}

export function summarize(items: QueueItem[], profileId?: string | null): { pending: number; failed: number } {
  let pending = 0;
  let failed = 0;
  for (const i of items) {
    if (profileId && i.profileId !== profileId) continue;
    if (i.status === "failed") failed++;
    else if (i.status !== "done") pending++;
  }
  return { pending, failed };
}

// ── Орчин (тестэд солигдоно) ─────────────────────────────────

export type Uploaders = {
  media: (file: File, target: Extract<QueueTarget, { kind: "media" }> & { propertyId: string }) => Promise<Crm2Result<unknown>>;
  brokerage: (file: File, target: Extract<QueueTarget, { kind: "brokerage" }>) => Promise<Crm2Result<unknown>>;
};

const defaultUploaders: Uploaders = {
  media: async (file, t) => {
    const { uploadPropertyMedia } = await import("@/lib/crm2/storage");
    return uploadPropertyMedia({
      file,
      officeId: t.officeId,
      propertyId: t.propertyId,
      limits: t.limits,
      sortOrder: t.sortOrder,
      isCover: t.isCover,
    });
  },
  brokerage: async (file, t) => {
    const { uploadBrokerageFile } = await import("@/lib/crm2/storage");
    // kind: storage давхарга (Batch 2) өмчлөл/иргэний үнэмлэхийг «restricted» замд хадгална.
    const opts: Parameters<typeof uploadBrokerageFile>[0] & { kind: BrokerageFileKind } = {
      file,
      officeId: t.officeId,
      contractId: t.contractId,
      limits: t.limits,
      kind: t.fileKind,
    };
    return uploadBrokerageFile(opts);
  },
};

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/** Wi-Fi (эсвэл тодорхойгүй үед мобайл биш төхөөрөмж) эсэх. */
export function isWifiLike(): boolean {
  if (typeof navigator === "undefined") return true;
  const n = navigator as Navigator & {
    connection?: { type?: string; saveData?: boolean };
    userAgentData?: { mobile?: boolean };
  };
  const type = n.connection?.type;
  if (type === "wifi" || type === "ethernet") return true;
  if (type === "cellular" || type === "bluetooth" || type === "wimax") return false;
  if (n.connection?.saveData) return false;
  const mobile = n.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(n.userAgent ?? "");
  return !mobile;
}

type Env = {
  uploaders: Uploaders;
  now: () => number;
  online: () => boolean;
  wifi: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
};

const defaultEnv: Env = {
  uploaders: defaultUploaders,
  now: () => Date.now(),
  online: isOnline,
  wifi: isWifiLike,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

let env: Env = defaultEnv;

// ── Singleton төлөв ──────────────────────────────────────────

let items: QueueItem[] = [];
let loaded: Promise<void> | null = null;
let running: Promise<void> | null = null;
let timer: unknown = null;
let started = false;
let currentProfile: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setItems(next: QueueItem[]) {
  items = next;
  emit();
}

/** Зөвхөн тестэд: орчин ба санах ойн төлвийг шинэчилнэ. */
export function configureQueueForTests(patch: Partial<Env> | null): void {
  env = patch ? { ...defaultEnv, ...patch } : defaultEnv;
  if (timer) defaultEnv.clearTimer(timer);
  items = [];
  loaded = null;
  running = null;
  timer = null;
  started = false;
  currentProfile = null;
}

const queueKv = () => crm2Kv("queue");

async function persist(item: QueueItem): Promise<void> {
  await queueKv().set(item.id, item);
}

function ensureLoaded(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      const rows = (await queueKv().entries<QueueItem>()).map(([, v]) => v).filter(Boolean);
      const now = env.now();
      const fixed: QueueItem[] = [];
      for (const r of rows) {
        // Хуудас хаагдах үед «uploading» байсан мөр → дахин дараалалд.
        if (r.status === "uploading") {
          const f = { ...r, status: "queued" as const, nextAt: now, updatedAt: now };
          await persist(f);
          fixed.push(f);
        } else fixed.push(r);
      }
      const known = new Set(items.map((i) => i.id));
      setItems([...items, ...fixed.filter((f) => !known.has(f.id))].sort((a, b) => a.createdAt - b.createdAt));
    })();
    loaded.catch(() => {
      loaded = null;
    });
  }
  return loaded;
}

async function replace(item: QueueItem): Promise<void> {
  await persist(item);
  setItems(items.map((i) => (i.id === item.id ? item : i)));
}

async function deleteBlobIfFree(blobKey: string, exceptItemId: string): Promise<void> {
  if (items.some((i) => i.id !== exceptItemId && i.blobKey === blobKey && i.status !== "done")) return;
  const drafts = await draftReferencedBlobKeys();
  if (drafts.has(blobKey)) return;
  await crm2Kv("blobs").del(blobKey);
}

export type EnqueueInput = {
  profileId: string;
  target: QueueTarget;
  /** Ноорогт байгаа blob-ын эзэмшлийг авах … */
  blobKey?: string;
  /** … эсвэл шинэ файл (гэрээний PDF г.м.). */
  blob?: Blob;
  name?: string;
};

/** Дараалалд нэмнэ. IDB-д бичигдсэний дараа буцна (эзэмшил шилжсэн). */
export async function enqueue(input: EnqueueInput): Promise<QueueItem> {
  await ensureLoaded();
  const now = env.now();
  let blobKey = input.blobKey ?? null;
  let name = input.name ?? "file";
  let type = input.blob?.type ?? "";
  let bytes = input.blob?.size ?? 0;
  let sealed = false;

  if (input.target.kind === "brokerage") {
    // Гэрээний баримт зөвхөн битүүмжлэгдсэн хэлбэрээр хадгалагдана.
    let source: Blob | null = input.blob ?? null;
    if (!source && blobKey) {
      const rec = await getBlobRecord(blobKey);
      source = rec?.blob ?? null;
      name = input.name ?? rec?.name ?? name;
      if (rec?.sealed) {
        source = null;
        sealed = true;
        type = rec.type;
      }
    }
    if (source) {
      const sb = await sealBytes(new Uint8Array(await source.arrayBuffer()), {
        profileId: input.profileId,
        ttlMs: SEALED_DOC_TTL_MS,
      });
      const oldKey = input.blob ? null : blobKey;
      blobKey = await putSealedBlob(input.profileId, sb, { name, type: source.type });
      type = source.type;
      bytes = source.size;
      sealed = true;
      if (oldKey) await crm2Kv("blobs").del(oldKey);
    }
  } else if (input.blob) {
    blobKey = await putBlob(input.profileId, input.blob, name);
  } else if (blobKey) {
    const rec = await getBlobRecord(blobKey);
    if (rec?.blob) {
      type = rec.blob.type || rec.type;
      bytes = rec.blob.size;
      name = input.name ?? rec.name;
    }
  }
  if (!blobKey) throw new Error("no_blob");

  const isVideo = type.startsWith("video/");
  const item: QueueItem = {
    id: newId(),
    blobKey,
    profileId: input.profileId,
    target: input.target,
    status: initialStatus(input.target, isVideo, env.wifi()),
    attempts: 0,
    error: null,
    name,
    type,
    bytes,
    isVideo,
    sealed,
    createdAt: now,
    updatedAt: now,
    nextAt: now,
  };
  await persist(item);
  setItems([...items, item]);
  kick();
  return item;
}

/** Хөрөнгө үүссэний дараа «waiting_property» мөрүүдийг суллана. */
export async function bindProperty(clientKey: string, propertyId: string): Promise<number> {
  await ensureLoaded();
  const next = bindItems(items, clientKey, propertyId, env.wifi(), env.now());
  const changed = next.filter((n, i) => n !== items[i]);
  for (const c of changed) await persist(c);
  setItems(next);
  kick();
  return changed.length;
}

/**
 * Нооргийн өмнөх (буцаагдсан/алдагдсан илгээлтийн) «waiting_property» мөрүүдийг хасна — дахин
 * хадгалахад зураг давхар хуулагдахгүй. blob-ыг устгахгүй (ноорог хэвээр заасан байна).
 */
export async function dropWaitingFor(clientKey: string): Promise<number> {
  await ensureLoaded();
  const dead = items.filter((i) => i.target.kind === "media" && i.target.clientKey === clientKey && i.status === "waiting_property");
  if (!dead.length) return 0;
  await queueKv().delMany(dead.map((i) => i.id));
  setItems(items.filter((i) => !dead.includes(i)));
  return dead.length;
}

/** Алдаатай/хүлээгдэж буй мөрийг шууд дахин оролдоно (бичлэгийг мобайл датагаар ч). */
export async function retry(id: string): Promise<void> {
  await ensureLoaded();
  const it = items.find((i) => i.id === id);
  if (!it || it.status === "done" || it.status === "uploading" || it.status === "waiting_property") return;
  await replace({ ...it, status: "queued", attempts: 0, error: null, nextAt: env.now(), allowCellular: true, updatedAt: env.now() });
  kick();
}

/** Мөрийг устгана (blob-ыг ноорог ашиглаагүй бол мөн). */
export async function remove(id: string): Promise<void> {
  await ensureLoaded();
  const it = items.find((i) => i.id === id);
  if (!it || it.status === "uploading") return;
  await queueKv().del(id);
  setItems(items.filter((i) => i.id !== id));
  await deleteBlobIfFree(it.blobKey, id);
}

async function fileOf(item: QueueItem): Promise<File | null> {
  const rec: BlobRecord | null = await getBlobRecord(item.blobKey);
  if (!rec) return null;
  if (rec.sealed) {
    const bytes = await openBytes(rec.sealed, { profileId: item.profileId });
    if (!bytes) return null;
    return new File([new Uint8Array(bytes)], item.name, { type: rec.type || item.type });
  }
  if (!rec.blob) return null;
  return rec.blob instanceof File ? rec.blob : new File([rec.blob], item.name, { type: rec.blob.type || item.type });
}

async function uploadOne(item: QueueItem): Promise<void> {
  const start = { ...item, status: "uploading" as const, updatedAt: env.now() };
  await replace(start);
  let res: Crm2Result<unknown>;
  try {
    const file = await fileOf(item);
    if (!file) {
      // Файл төхөөрөмжөөс алга (цэвэрлэгдсэн/түлхүүр солигдсон) — дахин оролдох утгагүй.
      await replace({ ...start, status: "failed", attempts: item.attempts + 1, error: "Файл утсан дээрээс олдсонгүй.", updatedAt: env.now() });
      return;
    }
    const t = item.target;
    if (t.kind === "media") {
      if (!t.propertyId) {
        await replace({ ...start, status: "waiting_property" });
        return;
      }
      res = await env.uploaders.media(file, { ...t, propertyId: t.propertyId });
    } else {
      res = await env.uploaders.brokerage(file, t);
    }
  } catch {
    res = { ok: false, error: UPLOAD_FAILED_TEXT };
  }
  if (res.ok) {
    const done = { ...start, status: "done" as const, error: null, updatedAt: env.now() };
    await replace(done);
    await deleteBlobIfFree(item.blobKey, item.id);
    return;
  }
  if (!env.online()) {
    // Сүлжээ тасарсан — оролдлогыг тоолохгүй.
    await replace({ ...start, status: "queued", nextAt: env.now(), updatedAt: env.now() });
    return;
  }
  await replace(afterFailure(start, res.error || UPLOAD_FAILED_TEXT, env.now()));
}

function schedule() {
  if (timer) env.clearTimer(timer);
  timer = null;
  const now = env.now();
  const next = items
    .filter((i) => (!currentProfile || i.profileId === currentProfile) && i.status === "queued" && i.nextAt > now)
    .reduce((m, i) => Math.min(m, i.nextAt), Infinity);
  if (Number.isFinite(next)) {
    timer = env.setTimer(() => {
      timer = null;
      kick();
    }, Math.max(50, next - now));
  }
}

async function loop(): Promise<void> {
  await ensureLoaded();
  for (;;) {
    if (!env.online()) return;
    const next = pickNext(items, { now: env.now(), wifi: env.wifi(), profileId: currentProfile });
    if (!next) break;
    await uploadOne(next);
  }
  // Хуучин «done» мөрүүдийг цэвэрлэнэ.
  const cutoff = env.now() - DONE_KEEP_MS;
  const old = items.filter((i) => i.status === "done" && i.updatedAt < cutoff);
  if (old.length) {
    await queueKv().delMany(old.map((i) => i.id));
    setItems(items.filter((i) => !old.includes(i)));
  }
  schedule();
}

function kick(): void {
  if (!started) return;
  if (running) return;
  running = loop()
    .catch(() => undefined)
    .finally(() => {
      running = null;
    });
}

let onlineHandler: (() => void) | null = null;

/**
 * Дарааллыг эхлүүлнэ (давтан дуудахад аюулгүй). Shell mount бүрт ба 'online' үед.
 * profileId өгвөл зөвхөн тэр хэрэглэгчийн мөрийг хуулна.
 */
export function startQueue(profileId?: string | null): Promise<void> {
  if (profileId !== undefined) currentProfile = profileId;
  started = true;
  if (typeof window !== "undefined" && !onlineHandler) {
    onlineHandler = () => kick();
    window.addEventListener("online", onlineHandler);
  }
  kick();
  return running ?? Promise.resolve();
}

/** Тест/shell: одоогийн гүйлт дуустал хүлээнэ. */
export function whenIdle(): Promise<void> {
  return running ?? Promise.resolve();
}

export async function listQueue(profileId?: string | null): Promise<QueueItem[]> {
  await ensureLoaded();
  return items.filter((i) => !profileId || i.profileId === profileId);
}

/** Гарах/хэрэглэгч солигдоход: тухайн (эсвэл бусад) хэрэглэгчийн мөр ба blob-ыг устгана. */
async function dropWhere(match: (i: QueueItem) => boolean): Promise<number> {
  await ensureLoaded();
  const dead = items.filter(match);
  if (!dead.length) return 0;
  await queueKv().delMany(dead.map((i) => i.id));
  setItems(items.filter((i) => !dead.includes(i)));
  await crm2Kv("blobs").delMany(dead.map((i) => i.blobKey));
  return dead.length;
}

export function clearQueueForUser(profileId: string): Promise<number> {
  return dropWhere((i) => i.profileId === profileId);
}

export function purgeQueueForOthers(profileId: string): Promise<number> {
  return dropWhere((i) => i.profileId !== profileId);
}

// ── React ────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb);
  void ensureLoaded();
  return () => {
    listeners.delete(cb);
  };
}
const getSnapshot = () => items;
const EMPTY: QueueItem[] = [];
const getServerSnapshot = () => EMPTY;

/** propertyId өгвөл тэр хөрөнгийн (эсвэл түүний гэрээний) мөрүүд. */
export function useUploadQueue(propertyId?: string | null): {
  items: QueueItem[];
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const filtered = useMemo(
    () =>
      all.filter(
        (i) =>
          (!currentProfile || i.profileId === currentProfile) &&
          (!propertyId || (i.target.kind === "media" && i.target.propertyId === propertyId))
      ),
    [all, propertyId]
  );
  return { items: filtered, retry, remove };
}

/** Глобал тэмдэгт: хүлээгдэж буй ба алдаатай мөрийн тоо. */
export function useQueueSummary(): { pending: number; failed: number } {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => summarize(all, currentProfile), [all]);
}

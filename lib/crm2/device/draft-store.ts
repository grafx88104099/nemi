/**
 * Утсан дээрх ноорог (P5, R2/R5/R8): юу ч алдагдахгүй.
 *
 * Байршил (IndexedDB «nemi-crm2», idb-keyval):
 * - «drafts»: ноорог `crm2:draft:{profileId}:{scope}` ба профайлын индекс
 *   `crm2:draft-index:{profileId}` (staff-new ноорог ≤ 10).
 * - «blobs»: зураг/файл `blob:{uuid}` → { blob, profileId, createdAt, name, type }.
 * - «sealed»: хувийн хэсэг `{draftKey}:private` (vault, 24 цаг).
 * scope: `staff-new:{clientKey}` | `sheet:{propertyId}:{sheet}`.
 *
 * Ноорогт зөвхөн нийтийн талбар орно; эзний утас/нэр/эх сурвалжийн тэмдэглэл,
 * owner_note, showing_instructions, address_detail нь ЗӨВХӨН битүүмжилсэн бичлэгт.
 * Upload дараалалд (queue) заагдсан blob-ыг ноорог устгах/цэвэрлэх үед хэзээ ч устгахгүй.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  crm2Kv,
  deleteSealed,
  getSealed,
  hasSealed,
  purgeExpiredSealed,
  purgeSealedForOthers,
  putSealed,
  type SealedBytesRecord,
  type SealedRecord,
} from "@/lib/crm2/device/vault";

export const DRAFT_VERSION = 2;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PRIVATE_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTO_RESTORE_MS = 12 * 60 * 60 * 1000;
export const MAX_STAFF_DRAFTS = 10;
export const DEFAULT_UNDO_MS = 8000;
export const AUTOSAVE_DEBOUNCE_MS = 1000;
/** Ямар ч ноорог/дараалалд заагдаагүй blob-ыг энэ хугацааны дараа устгана. */
export const ORPHAN_BLOB_MS = 24 * 60 * 60 * 1000;
export const TITLE_HINT_MAX = 60;

/** «Эзний утас сэргээгдсэнгүй» мэдэгдлийн текст (privateLost). */
export const PRIVATE_LOST_TEXT = "Эзний утас сэргээгдсэнгүй — дахин оруулна уу";

export type DraftScope = `staff-new:${string}` | `sheet:${string}:${string}`;
export type DraftSource = "manual" | "paste" | "share" | "listing";
export type DraftStatus = "editing" | "queued";

export type DraftMedia = {
  id: string;
  blobKey: string;
  name: string;
  kind: "image" | "video";
  bytes: number;
  w: number;
  h: number;
};

export type DraftRecord<F = Record<string, unknown>> = {
  v: 2;
  savedAt: number;
  expiresAt: number;
  clientKey: string;
  profileId: string;
  scope: DraftScope;
  form: F;
  media: DraftMedia[];
  coverId: string | null;
  source: DraftSource;
  sharedId?: string | null;
  /** Хувийн хэсэг битүүмжлэгдсэн эсэх (privateLost-ыг тооцоход). */
  hasPrivate: boolean;
  /** Зөөлөн устгал (undo цонх). */
  deletedAt?: number | null;
  purgeAt?: number | null;
};

export type DraftIndexEntry = {
  clientKey: string;
  savedAt: number;
  /** Зөвхөн төсөл/дүүрэг — эзний мэдээлэл хэзээ ч орохгүй. */
  titleHint: string;
  photoCount: number;
  status: DraftStatus;
  deletedAt?: number | null;
};

export type BlobRecord = {
  blob?: Blob;
  /** Гэрээ/өмчлөлийн баримт — vault-аар битүүмжилсэн байт (blob-ын оронд). */
  sealed?: SealedBytesRecord;
  profileId: string;
  createdAt: number;
  name: string;
  type: string;
};

/** Ноорогт хэзээ ч ил хадгалахгүй талбарууд. */
export const PRIVATE_DRAFT_KEYS = [
  "owner",
  "owner_phone",
  "owner_name",
  "owner_source_note",
  "owner_note",
  "showing_instructions",
  "address_detail",
  "private",
] as const;

// ── Түлхүүрүүд ───────────────────────────────────────────────

const DRAFT_PREFIX = "crm2:draft:";
const INDEX_PREFIX = "crm2:draft-index:";

export function staffNewScope(clientKey: string): DraftScope {
  return `staff-new:${clientKey}`;
}

export function sheetScope(propertyId: string, sheet: string): DraftScope {
  return `sheet:${propertyId}:${sheet}`;
}

export function draftKey(profileId: string, scope: DraftScope): string {
  return `${DRAFT_PREFIX}${profileId}:${scope}`;
}

export function parseDraftKey(key: string): { profileId: string; scope: DraftScope } | null {
  if (!key.startsWith(DRAFT_PREFIX)) return null;
  const rest = key.slice(DRAFT_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) return null;
  const scope = rest.slice(i + 1);
  if (!/^(staff-new:[^:]+|sheet:[^:]+:[^:]+)$/.test(scope)) return null;
  return { profileId: rest.slice(0, i), scope: scope as DraftScope };
}

export function indexKey(profileId: string): string {
  return `${INDEX_PREFIX}${profileId}`;
}

export function privateKey(key: string): string {
  return `${key}:private`;
}

function clientKeyOfScope(scope: DraftScope): string | null {
  return scope.startsWith("staff-new:") ? scope.slice("staff-new:".length) : null;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** «+ Хөрөнгө» бүрт шинэ ноорог: clientKey (uuid) үүсгэнэ. Бичлэг анхны хадгалалтаар үүснэ. */
export function newDraft(): string {
  return newId();
}

// ── Цэвэр туслахууд ──────────────────────────────────────────

export function isExpired(rec: { expiresAt?: number | null } | null | undefined, now = Date.now()): boolean {
  return !rec || typeof rec.expiresAt !== "number" || rec.expiresAt <= now;
}

/** 12 цагаас бага хугацааны ноорог асуухгүйгээр сэргээгдэнэ. */
export function shouldAutoRestore(savedAt: number | null | undefined, now = Date.now()): boolean {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return false;
  const age = now - savedAt;
  return age >= 0 && age < AUTO_RESTORE_MS;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Хадгалсан маягтыг одоогийн анхны утгууд дээр давхарлана (кодын хувилбар солигдоход
 * аюулгүй): мэдэгдэхгүй түлхүүр, төрөл таарахгүй утгыг хаяна; null нь утга зөвшөөрнө.
 */
export function mergeSnapshot<F extends Record<string, unknown>>(defaults: F, stored: unknown): F {
  if (!isPlainObject(stored)) return { ...defaults };
  const out: Record<string, unknown> = { ...defaults };
  for (const k of Object.keys(defaults)) {
    if (!(k in stored)) continue;
    const d = defaults[k];
    const s = stored[k];
    if (s === undefined) continue;
    if (s === null) {
      // null зөвхөн null/тоон анхны утгатай талбарт (хоосон тоо); бусад нь анхны утгаа үлдээнэ.
      if (d === null || typeof d === "number") out[k] = null;
      continue;
    }
    if (d === null || d === undefined) {
      out[k] = s;
    } else if (Array.isArray(d)) {
      if (Array.isArray(s)) out[k] = s;
    } else if (isPlainObject(d)) {
      if (isPlainObject(s)) out[k] = { ...d, ...s };
    } else if (typeof d === typeof s) {
      out[k] = s;
    }
  }
  return out as F;
}

/** Маягтаас хувийн талбаруудыг хасна (шууд утгаар). */
export function stripPrivate<F>(form: F): F {
  if (!isPlainObject(form)) return form;
  const out: Record<string, unknown> = { ...form };
  for (const k of PRIVATE_DRAFT_KEYS) delete out[k];
  return out as F;
}

export function isEmptyPrivate(p: unknown): boolean {
  if (p == null) return true;
  if (typeof p === "string") return p.trim() === "";
  if (Array.isArray(p)) return p.every(isEmptyPrivate);
  if (isPlainObject(p)) return Object.values(p).every(isEmptyPrivate);
  return false;
}

export function makeTitleHint(parts: { project?: string | null; district?: string | null }): string {
  const s = [parts.project, parts.district]
    .map((x) => (x ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
  return s.length > TITLE_HINT_MAX ? `${s.slice(0, TITLE_HINT_MAX - 1)}…` : s;
}

export type DraftSaveState<F> = {
  form: F;
  media?: DraftMedia[];
  coverId?: string | null;
  source?: DraftSource;
  sharedId?: string | null;
  /** Индексэд харагдах төсөл/дүүрэг (makeTitleHint). */
  titleHint?: string;
  status?: DraftStatus;
};

export function buildDraftRecord<F>(
  profileId: string,
  scope: DraftScope,
  state: DraftSaveState<F>,
  opts: { now?: number; hasPrivate: boolean; prev?: DraftRecord<F> | null }
): DraftRecord<F> {
  const now = opts.now ?? Date.now();
  const media = (state.media ?? []).map((m) => ({
    id: m.id,
    blobKey: m.blobKey,
    name: m.name,
    kind: m.kind,
    bytes: m.bytes,
    w: m.w,
    h: m.h,
  }));
  const coverId = state.coverId && media.some((m) => m.id === state.coverId) ? state.coverId : (media[0]?.id ?? null);
  return {
    v: DRAFT_VERSION,
    savedAt: now,
    expiresAt: now + DRAFT_TTL_MS,
    clientKey: clientKeyOfScope(scope) ?? opts.prev?.clientKey ?? "",
    profileId,
    scope,
    form: stripPrivate(state.form),
    media,
    coverId,
    source: state.source ?? opts.prev?.source ?? "manual",
    sharedId: state.sharedId ?? opts.prev?.sharedId ?? null,
    hasPrivate: opts.hasPrivate,
    deletedAt: null,
    purgeAt: null,
  };
}

/**
 * Индекст оруулах/шинэчлэх. MAX-аас хэтэрвэл хамгийн хуучин «editing» (илгээгдэхийг
 * хүлээж буй «queued» биш) нооргийг шахаж гаргана → evicted.
 */
export function upsertIndexEntry(
  index: DraftIndexEntry[] | undefined,
  entry: DraftIndexEntry,
  max = MAX_STAFF_DRAFTS
): { index: DraftIndexEntry[]; evicted: string[] } {
  const list = (index ?? []).filter((e) => e.clientKey !== entry.clientKey);
  list.push(entry);
  list.sort((a, b) => b.savedAt - a.savedAt);
  const evicted: string[] = [];
  // Зөөлөн устгагдсаныг эхэлж, дараа нь хуучин editing-ийг.
  while (list.length > max) {
    let victim = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].clientKey === entry.clientKey) continue;
      if (list[i].deletedAt) {
        victim = i;
        break;
      }
    }
    if (victim < 0) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].clientKey !== entry.clientKey && list[i].status === "editing") {
          victim = i;
          break;
        }
      }
    }
    if (victim < 0) break;
    evicted.push(list[victim].clientKey);
    list.splice(victim, 1);
  }
  return { index: list, evicted };
}

// ── Blob ─────────────────────────────────────────────────────

export async function putBlob(profileId: string, blob: Blob, name = "file"): Promise<string> {
  const key = `blob:${newId()}`;
  const rec: BlobRecord = { blob, profileId, createdAt: Date.now(), name: name.slice(0, 200), type: blob.type };
  await crm2Kv("blobs").set(key, rec);
  return key;
}

export async function putSealedBlob(
  profileId: string,
  sealed: SealedBytesRecord,
  meta: { name: string; type: string }
): Promise<string> {
  const key = `blob:${newId()}`;
  const rec: BlobRecord = { sealed, profileId, createdAt: Date.now(), name: meta.name.slice(0, 200), type: meta.type };
  await crm2Kv("blobs").set(key, rec);
  return key;
}

export async function getBlobRecord(blobKey: string): Promise<BlobRecord | null> {
  return (await crm2Kv("blobs").get<BlobRecord>(blobKey)) ?? null;
}

export async function getBlob(blobKey: string): Promise<Blob | null> {
  return (await getBlobRecord(blobKey))?.blob ?? null;
}

/** Upload дараалалд заагдсан blob-ууд (дуусаагүй, алдаатай бүгд). */
export async function queueReferencedBlobKeys(): Promise<Set<string>> {
  const items = await crm2Kv("queue").entries<{ blobKey?: string }>();
  return new Set(items.map(([, v]) => v?.blobKey).filter((k): k is string => typeof k === "string"));
}

/** Амьд (устгагдаагүй, хугацаа нь дуусаагүй) ноорогт заагдсан blob-ууд. */
export async function draftReferencedBlobKeys(now = Date.now()): Promise<Set<string>> {
  const out = new Set<string>();
  for (const [k, v] of await crm2Kv("drafts").entries<DraftRecord>()) {
    if (!k.startsWith(DRAFT_PREFIX) || !v || v.deletedAt || isExpired(v, now)) continue;
    for (const m of v.media ?? []) out.add(m.blobKey);
  }
  return out;
}

/** blob-уудыг устгана — дараалалд заагдсаныг (ба keep-д байгааг) алгасна. */
export async function deleteBlobs(keys: string[], keep?: Set<string>): Promise<number> {
  if (!keys.length) return 0;
  const queued = await queueReferencedBlobKeys();
  const dead = keys.filter((k) => !queued.has(k) && !keep?.has(k));
  await crm2Kv("blobs").delMany(dead);
  return dead.length;
}

// ── Хадгалах/унших ───────────────────────────────────────────

/** Энэ хуудсанд устгагдсан ноорог хожуу autosave-аар сэргэхээс сэргийлнэ. */
const discardedKeys = new Set<string>();

async function readRecord<F>(key: string): Promise<DraftRecord<F> | null> {
  return (await crm2Kv("drafts").get<DraftRecord<F>>(key)) ?? null;
}

async function updateIndex(profileId: string, entry: DraftIndexEntry): Promise<string[]> {
  let evicted: string[] = [];
  await crm2Kv("drafts").update<DraftIndexEntry[]>(indexKey(profileId), (old) => {
    const r = upsertIndexEntry(old, entry);
    evicted = r.evicted;
    return r.index;
  });
  return evicted;
}

async function patchIndex(profileId: string, clientKey: string, patch: Partial<DraftIndexEntry> | null): Promise<void> {
  await crm2Kv("drafts").update<DraftIndexEntry[]>(indexKey(profileId), (old) => {
    const list = old ?? [];
    if (patch === null) return list.filter((e) => e.clientKey !== clientKey);
    return list.map((e) => (e.clientKey === clientKey ? { ...e, ...patch } : e));
  });
}

export type SaveDraftOptions = { now?: number; hasPrivate?: boolean };

/** Нооргийн нийтийн хэсгийг хадгална (хувийн талбарыг хасна). */
export async function saveDraft<F>(
  profileId: string,
  scope: DraftScope,
  state: DraftSaveState<F>,
  opts: SaveDraftOptions = {}
): Promise<DraftRecord<F> | null> {
  const key = draftKey(profileId, scope);
  if (discardedKeys.has(key)) return null;
  const prev = await readRecord<F>(key);
  if (prev?.deletedAt) return null;
  const hasPrivate = opts.hasPrivate ?? (await hasSealed(privateKey(key)));
  const rec = buildDraftRecord(profileId, scope, state, { now: opts.now, hasPrivate, prev });
  await crm2Kv("drafts").set(key, rec);
  const clientKey = clientKeyOfScope(scope);
  if (clientKey) {
    const evicted = await updateIndex(profileId, {
      clientKey,
      savedAt: rec.savedAt,
      titleHint: (state.titleHint ?? "").slice(0, TITLE_HINT_MAX),
      photoCount: rec.media.filter((m) => m.kind === "image").length,
      status: state.status ?? "editing",
      deletedAt: null,
    });
    for (const ck of evicted) await hardDeleteDraft(draftKey(profileId, staffNewScope(ck)));
  }
  return rec;
}

/**
 * Нээлттэй маягтгүй үед (бүрэлдэхүүн хаагдсаны дараа боловсруулж дууссан зураг) нооргийн
 * хадгалсан бичлэгт медиа нэмнэ: маягт, эх сурвалж, индексийн гарчиг/төлвийг хэвээр үлдээнэ.
 * Устгагдсан ноорогт нэмэхгүй → false.
 */
export async function appendDraftMedia(profileId: string, scope: DraftScope, add: DraftMedia[]): Promise<boolean> {
  const key = draftKey(profileId, scope);
  if (!add.length || discardedKeys.has(key)) return false;
  const prev = await readRecord<Record<string, unknown>>(key);
  if (prev?.deletedAt) return false;
  const have = new Set((prev?.media ?? []).map((m) => m.id));
  const media = [...(prev?.media ?? []), ...add.filter((m) => !have.has(m.id))];
  const ck = clientKeyOfScope(scope);
  const entry = ck ? (await listDrafts(profileId).catch(() => [] as DraftIndexEntry[])).find((e) => e.clientKey === ck) : undefined;
  const rec = await saveDraft(
    profileId,
    scope,
    {
      form: prev?.form ?? {},
      media,
      coverId: prev?.coverId ?? null,
      source: prev?.source,
      sharedId: prev?.sharedId ?? null,
      titleHint: entry?.titleHint ?? "",
      status: entry?.status ?? "editing",
    },
    { hasPrivate: prev?.hasPrivate }
  );
  return !!rec;
}

/** Хувийн хэсгийг битүүмжилнэ (24 цаг). Хоосон бол устгана. → битүүмжилсэн эсэх. */
export async function savePrivate(key: string, priv: unknown, opts: { profileId: string; now?: number }): Promise<boolean> {
  if (discardedKeys.has(key)) return false;
  if (isEmptyPrivate(priv)) {
    await deleteSealed(privateKey(key));
    return false;
  }
  await putSealed(privateKey(key), priv, { profileId: opts.profileId, ttlMs: PRIVATE_TTL_MS, now: opts.now });
  return true;
}

export async function loadPrivate<P>(key: string, profileId: string): Promise<P | null> {
  return getSealed<P>(privateKey(key), { profileId });
}

export async function deletePrivate(key: string): Promise<void> {
  await deleteSealed(privateKey(key));
}

export type LoadedDraft<F, P> = {
  key: string;
  record: DraftRecord<F>;
  form: F;
  media: DraftMedia[];
  coverId: string | null;
  source: DraftSource;
  sharedId: string | null;
  private: P | null;
  /** Хувийн өгөгдөлтэй байсан ч нээгдсэнгүй → PRIVATE_LOST_TEXT мэдэгдэл. */
  privateLost: boolean;
};

export async function loadDraft<F = Record<string, unknown>, P = Record<string, unknown>>(
  profileId: string,
  scope: DraftScope,
  opts: { now?: number } = {}
): Promise<LoadedDraft<F, P> | null> {
  const key = draftKey(profileId, scope);
  const rec = await readRecord<F>(key);
  if (!rec || rec.deletedAt || rec.profileId !== profileId || isExpired(rec, opts.now)) return null;
  let priv: P | null = null;
  const sealedExists = await hasSealed(privateKey(key));
  if (rec.hasPrivate || sealedExists) {
    priv = await getSealed<P>(privateKey(key), { profileId, now: opts.now });
  }
  return {
    key,
    record: rec,
    form: rec.form,
    media: rec.media ?? [],
    coverId: rec.coverId ?? null,
    source: rec.source ?? "manual",
    sharedId: rec.sharedId ?? null,
    private: priv,
    privateLost: (rec.hasPrivate || sealedExists) && priv === null,
  };
}

/** Харагдах staff-new ноорогууд (шинэ нь эхэнд). */
export async function listDrafts(profileId: string, opts: { now?: number } = {}): Promise<DraftIndexEntry[]> {
  const now = opts.now ?? Date.now();
  const index = (await crm2Kv("drafts").get<DraftIndexEntry[]>(indexKey(profileId))) ?? [];
  return index
    .filter((e) => !e.deletedAt && now - e.savedAt < DRAFT_TTL_MS)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function setDraftStatus(profileId: string, clientKey: string, status: DraftStatus): Promise<void> {
  await patchIndex(profileId, clientKey, { status });
}

/** Ноорог, хувийн хэсэг ба (дараалалд заагдаагүй) blob-уудыг шууд устгана. */
export async function hardDeleteDraft(key: string, opts: { keepPrivate?: boolean } = {}): Promise<void> {
  const parsed = parseDraftKey(key);
  const rec = await readRecord(key);
  await crm2Kv("drafts").del(key);
  if (!opts.keepPrivate) await deleteSealed(privateKey(key));
  if (parsed) {
    const ck = clientKeyOfScope(parsed.scope);
    if (ck) await patchIndex(parsed.profileId, ck, null);
  }
  if (rec?.media?.length) {
    const keep = await draftReferencedBlobKeys();
    await deleteBlobs(
      rec.media.map((m) => m.blobKey),
      keep
    );
  }
}

export type DiscardHandle = {
  /** Undo цонхонд дуудвал ноорог буцаж харагдана → true. */
  undo: () => Promise<boolean>;
  /** Бүрэн устгал дууссаны дараа шийдэгдэнэ (undo хийсэн бол false). */
  done: Promise<boolean>;
};

/**
 * Зөөлөн устгал: шууд нуугдана, undoMs-ийн дараа ноорог/хувийн хэсэг/blob устна
 * (дараалалд заагдсан blob үлдэнэ). keepPrivate: эзний статус эцсийн биш үед хувийн хэсгийг үлдээх.
 */
export async function discardDraft(
  key: string,
  opts: { undoMs?: number; keepPrivate?: boolean; now?: number } = {}
): Promise<DiscardHandle> {
  const undoMs = Math.max(0, opts.undoMs ?? DEFAULT_UNDO_MS);
  const now = opts.now ?? Date.now();
  const parsed = parseDraftKey(key);
  discardedKeys.add(key);
  const rec = await readRecord(key);
  if (rec) await crm2Kv("drafts").set(key, { ...rec, deletedAt: now, purgeAt: now + undoMs });
  const ck = parsed ? clientKeyOfScope(parsed.scope) : null;
  if (parsed && ck) await patchIndex(parsed.profileId, ck, { deletedAt: now });

  let undone = false;
  let finished = false;
  let resolveDone: (v: boolean) => void = () => undefined;
  const done = new Promise<boolean>((r) => {
    resolveDone = r;
  });
  const finish = async () => {
    if (undone || finished) return;
    finished = true;
    try {
      await hardDeleteDraft(key, { keepPrivate: opts.keepPrivate });
    } finally {
      resolveDone(true);
    }
  };
  const timer = undoMs > 0 ? setTimeout(() => void finish(), undoMs) : null;
  if (!timer) await finish();

  return {
    done,
    undo: async () => {
      if (finished || undone) return false;
      undone = true;
      if (timer) clearTimeout(timer);
      discardedKeys.delete(key);
      const cur = await readRecord(key);
      if (cur) await crm2Kv("drafts").set(key, { ...cur, deletedAt: null, purgeAt: null });
      if (parsed && ck) await patchIndex(parsed.profileId, ck, { deletedAt: null });
      resolveDone(false);
      return true;
    },
  };
}

// ── Цэвэрлэгээ ───────────────────────────────────────────────

export type PurgeReport = { drafts: number; blobs: number; sealed: number };

/**
 * Хугацаа дууссан ба undo цонх нь өнгөрсөн ноорог, хугацаа дууссан битүүмжлэл,
 * ямар ч ноорог/дараалалд заагдаагүй хуучин blob-уудыг устгана.
 */
export async function purgeExpired(opts: { now?: number } = {}): Promise<PurgeReport> {
  const now = opts.now ?? Date.now();
  const drafts = crm2Kv("drafts");
  let nDrafts = 0;
  for (const [k, v] of await drafts.entries<DraftRecord | DraftIndexEntry[]>()) {
    if (k.startsWith(INDEX_PREFIX)) {
      const list = (v as DraftIndexEntry[]) ?? [];
      const live = list.filter((e) => now - e.savedAt < DRAFT_TTL_MS);
      if (live.length !== list.length) await drafts.set(k, live);
      continue;
    }
    const rec = v as DraftRecord;
    const softGone = !!rec?.deletedAt && (rec.purgeAt ?? 0) <= now;
    if (!rec || isExpired(rec, now) || softGone) {
      await hardDeleteDraft(k);
      nDrafts++;
    }
  }
  const sealed = await purgeExpiredSealed(now);
  const refs = await draftReferencedBlobKeys(now);
  const queued = await queueReferencedBlobKeys();
  const blobs = crm2Kv("blobs");
  const orphans = (await blobs.entries<BlobRecord>())
    .filter(([k, r]) => !refs.has(k) && !queued.has(k) && (!r || now - (r.createdAt ?? 0) > ORPHAN_BLOB_MS))
    .map(([k]) => k);
  await blobs.delMany(orphans);
  return { drafts: nDrafts, blobs: orphans.length, sealed };
}

async function clearDraftsWhere(match: (profileId: string) => boolean): Promise<PurgeReport> {
  const drafts = crm2Kv("drafts");
  const deadDrafts: string[] = [];
  for (const [k] of await drafts.entries()) {
    if (k.startsWith(INDEX_PREFIX)) {
      if (match(k.slice(INDEX_PREFIX.length))) deadDrafts.push(k);
      continue;
    }
    const p = parseDraftKey(k);
    if (!p || match(p.profileId)) deadDrafts.push(k);
  }
  await drafts.delMany(deadDrafts);
  const sealedKv = crm2Kv("sealed");
  const deadSealed: string[] = [];
  for (const [k, r] of await sealedKv.entries<SealedRecord>()) {
    if (!k.startsWith(DRAFT_PREFIX)) continue;
    const p = parseDraftKey(k.replace(/:private$/, ""));
    if (!p || match(p.profileId) || (r?.profileId && match(r.profileId))) deadSealed.push(k);
  }
  await sealedKv.delMany(deadSealed);
  const queued = await queueReferencedBlobKeys();
  const blobs = crm2Kv("blobs");
  const deadBlobs = (await blobs.entries<BlobRecord>())
    .filter(([k, r]) => !queued.has(k) && (!r || match(r.profileId)))
    .map(([k]) => k);
  await blobs.delMany(deadBlobs);
  return { drafts: deadDrafts.length, blobs: deadBlobs.length, sealed: deadSealed.length };
}

/** Өөр хэрэглэгчийн ноорог, битүүмжлэл, blob-ыг устгана (дараалалд заагдсанаас бусад). */
export async function purgeOtherUsers(currentProfileId: string): Promise<PurgeReport> {
  for (const k of [...discardedKeys]) if (!k.startsWith(`${DRAFT_PREFIX}${currentProfileId}:`)) discardedKeys.delete(k);
  const r = await clearDraftsWhere((p) => p !== currentProfileId);
  await purgeSealedForOthers(currentProfileId);
  return r;
}

export type UnsentDraftSummary = { drafts: number; photos: number };

/**
 * Гарахын анхааруулгад: илгээгдээгүй (засварлаж буй) ноорогууд ба тэдгээрийн дараалалд ороогүй зураг.
 * «queued» staff-new ноорог хүлээгдэж буй бүртгэлд аль хэдийн тоологдоно → энд орохгүй.
 */
export async function unsentDraftSummary(profileId: string, now = Date.now()): Promise<UnsentDraftSummary> {
  const queued = new Set(
    ((await crm2Kv("drafts").get<DraftIndexEntry[]>(indexKey(profileId))) ?? []).filter((e) => e.status === "queued").map((e) => e.clientKey)
  );
  const inQueue = await queueReferencedBlobKeys();
  let drafts = 0;
  let photos = 0;
  for (const [k, v] of await crm2Kv("drafts").entries<DraftRecord>()) {
    const p = parseDraftKey(k);
    if (!p || p.profileId !== profileId || !v || v.deletedAt || isExpired(v, now)) continue;
    const ck = clientKeyOfScope(p.scope);
    if (ck && queued.has(ck)) continue;
    drafts++;
    photos += (v.media ?? []).filter((m) => m.kind === "image" && !inQueue.has(m.blobKey)).length;
  }
  return { drafts, photos };
}

/** Гарах үед: энэ хэрэглэгчийн бүх ноорог, хувийн хэсэг, blob (дараалалд заагдсанаас бусад). */
export async function clearAllForUser(profileId: string): Promise<PurgeReport> {
  return clearDraftsWhere((p) => p === profileId);
}

// ── React hook ───────────────────────────────────────────────

export type DraftAutosaveState<F, P> = DraftSaveState<F> & { private?: P | null };

export type DraftAutosaveOptions = {
  profileId: string | null;
  scope: DraftScope | null;
  enabled?: boolean;
  debounceMs?: number;
  onSaved?: (savedAt: number) => void;
};

export type DraftAutosave = {
  savedAt: number | null;
  error: boolean;
  /** Хүлээгдэж буй бүх өөрчлөлтийг шууд бичнэ. */
  flush: () => Promise<void>;
  /** Хүлээгдэж буй бичилтийг цуцална (ноорог устгахын өмнө). */
  cancel: () => void;
};

/**
 * Нооргийг автоматаар хадгална:
 * - маягт 1 секундийн debounce-оор;
 * - хувийн хэсэг (эзний утас/нэр …) өөрчлөгдөх бүрт шууд (debounce-гүй) битүүмжлэгдэж,
 *   ноорог мөн тэр даруй бичигдэнэ;
 * - pagehide ба visibilitychange «hidden» үед шууд flush (beforeunload-д найдахгүй).
 */
export function useDraftAutosave<F, P = Record<string, unknown>>(
  state: DraftAutosaveState<F, P>,
  opts: DraftAutosaveOptions
): DraftAutosave {
  const { profileId, scope, enabled = true, debounceMs = AUTOSAVE_DEBOUNCE_MS, onSaved } = opts;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const publicJson = useMemo(
    () =>
      JSON.stringify([
        stripPrivate(state.form),
        state.media ?? [],
        state.coverId ?? null,
        state.source ?? null,
        state.sharedId ?? null,
        state.titleHint ?? "",
        state.status ?? "editing",
      ]),
    [state.form, state.media, state.coverId, state.source, state.sharedId, state.titleHint, state.status]
  );
  const privateJson = useMemo(() => JSON.stringify(state.private ?? null), [state.private]);

  const stateRef = useRef(state);
  const optsRef = useRef({ profileId, scope, enabled, onSaved });
  const lastPublic = useRef<string | null>(null);
  const lastPrivate = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const cancelled = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    optsRef.current = { profileId, scope, enabled, onSaved };
  });

  const write = useCallback((): Promise<void> => {
    const run = async () => {
      const o = optsRef.current;
      if (!o.enabled || !o.profileId || !o.scope || cancelled.current) return;
      const s = stateRef.current;
      const pubJson = JSON.stringify([
        stripPrivate(s.form),
        s.media ?? [],
        s.coverId ?? null,
        s.source ?? null,
        s.sharedId ?? null,
        s.titleHint ?? "",
        s.status ?? "editing",
      ]);
      const privJson = JSON.stringify(s.private ?? null);
      if (pubJson === lastPublic.current && privJson === lastPrivate.current) return;
      const key = draftKey(o.profileId, o.scope);
      try {
        let hasPrivate: boolean | undefined;
        if (privJson !== lastPrivate.current) {
          hasPrivate = await savePrivate(key, s.private ?? null, { profileId: o.profileId });
        }
        const rec = await saveDraft(o.profileId, o.scope, s, { hasPrivate });
        lastPublic.current = pubJson;
        lastPrivate.current = privJson;
        if (rec) {
          setSavedAt(rec.savedAt);
          setError(false);
          o.onSaved?.(rec.savedAt);
        }
      } catch {
        setError(true);
      }
    };
    chain.current = chain.current.then(run, run);
    return chain.current;
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await write();
  }, [write]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Анхны (сэргээсэн) төлвийг «хадгалагдсан» гэж үзнэ — нээхэд savedAt шинэчлэгдэхгүй.
  useEffect(() => {
    if (lastPublic.current === null) lastPublic.current = publicJson;
    if (lastPrivate.current === null) lastPrivate.current = privateJson;
    // зөвхөн анх
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scope солигдвол (шинэ ноорог) цуцлалтыг сэргээнэ.
  useEffect(() => {
    cancelled.current = false;
  }, [profileId, scope]);

  // Маягт: debounce.
  useEffect(() => {
    if (!enabled || publicJson === lastPublic.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void write();
    }, debounceMs);
  }, [publicJson, enabled, debounceMs, write]);

  // Хувийн хэсэг: шууд.
  useEffect(() => {
    if (!enabled || privateJson === lastPrivate.current) return;
    void flush();
  }, [privateJson, enabled, flush]);

  // App солих / таб хаах үед шууд.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHide = () => void flush();
    const onVis = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) void flush();
    };
  }, [flush]);

  return { savedAt, error, flush, cancel };
}

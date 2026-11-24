/**
 * Тогтворгүй сүлжээнд шуурхай бүртгэл илгээх (R6).
 *
 * submitQuickCreate → POST /api/crm2/quick-create (15 с хугацаатай):
 * - 2xx → { ok, status:'sent', result }
 * - 401 → { status:'auth' } («нэвтэрсний дараа илгээнэ»), хүлээлгэнд хадгална
 * - сүлжээний алдаа, хугацаа хэтрэх, 5xx → { status:'queued' }, хүлээлгэнд хадгална
 * - бусад 4xx → { status:'invalid', error, field }
 * Хүлээлгийн бичлэг (payload-д p_owner / p_private орно) vault-аар битүүмжлэгдэж
 * «nemi-crm2»/«pending»-д clientKey-ээр хадгалагдана. resumePendingSubmits() нь shell
 * нээгдэх ба 'online' үед дахин илгээж, амжилттай бол bindProperty → ноорог хаах →
 * (анхаарах зүйл байвал) outbox. Сервер client_key-ээр давтан илгээлтийг танина.
 */

import { useSyncExternalStore } from "react";
import { crm2Kv, open, seal, type SealedRecord } from "@/lib/crm2/device/vault";
import { discardDraft, setDraftStatus, parseDraftKey } from "@/lib/crm2/device/draft-store";
import { bindProperty } from "@/lib/crm2/device/upload-queue";
import { addOutbox, needsAttention } from "@/lib/crm2/device/outbox";

export const QUICK_CREATE_URL = "/api/crm2/quick-create";
export const SUBMIT_TIMEOUT_MS = 15_000;
/** Хүлээлгийн илгээлт (эзний утастай) төхөөрөмж дээр хадгалагдах хугацаа. */
export const PENDING_TTL_MS = 72 * 60 * 60 * 1000;
export const LAST_PROFILE_KEY = "crm2:last-profile";

/** lib/crm2/types.ts OWNER_FINAL_STATUSES-тай ижил. */
export const OWNER_FINAL = ["none", "linked", "matched", "created"] as const;

export const NETWORK_ERROR_TEXT = "Сүлжээ удаан — утсан дээр хадгалсан, өөрөө илгээнэ";
export const AUTH_QUEUED_TEXT = "Нэвтэрсний дараа илгээнэ";
const GENERIC_ERROR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

export type QuickCreatePayload = Record<string, unknown>;

export type QuickCreateResultLike = {
  property_id: string;
  code: string;
  replayed?: boolean;
  owner?: { status: string } | null;
  duplicates?: unknown[] | null;
};

export type QuickSendOutcome<R extends QuickCreateResultLike = QuickCreateResultLike> =
  | { ok: true; status: "sent"; result: R }
  | { ok: false; status: "queued"; reason: "offline" | "timeout" | "network" | "server"; saved: boolean }
  | { ok: false; status: "auth"; saved: boolean }
  | { ok: false; status: "invalid"; error: string; field: string | null };

// ── Цэвэр: хариу ангилах ─────────────────────────────────────

function isResult(x: unknown): x is QuickCreateResultLike {
  return !!x && typeof x === "object" && typeof (x as { property_id?: unknown }).property_id === "string";
}

export type RawOutcome<R extends QuickCreateResultLike> =
  | { ok: true; status: "sent"; result: R }
  | { ok: false; status: "queued"; reason: "offline" | "timeout" | "network" | "server" }
  | { ok: false; status: "auth" }
  | { ok: false; status: "invalid"; error: string; field: string | null };

export function classifyResponse<R extends QuickCreateResultLike>(httpStatus: number, body: unknown): RawOutcome<R> {
  if (httpStatus >= 200 && httpStatus < 300) {
    if (isResult(body)) return { ok: true, status: "sent", result: body as R };
    return { ok: false, status: "queued", reason: "server" };
  }
  if (httpStatus === 401) return { ok: false, status: "auth" };
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return { ok: false, status: "queued", reason: "server" };
  const b = (body ?? {}) as { error?: unknown; field?: unknown };
  return {
    ok: false,
    status: "invalid",
    error: typeof b.error === "string" && b.error ? b.error.slice(0, 300) : GENERIC_ERROR,
    field: typeof b.field === "string" && b.field ? b.field : null,
  };
}

export type PostOptions = { fetchImpl?: typeof fetch; timeoutMs?: number; online?: boolean };

/** Нэг удаа POST хийж ангилна (хадгалахгүй). */
export async function postQuickCreate<R extends QuickCreateResultLike = QuickCreateResultLike>(
  payload: QuickCreatePayload,
  opts: PostOptions = {}
): Promise<RawOutcome<R>> {
  const online = opts.online ?? (typeof navigator === "undefined" ? true : navigator.onLine !== false);
  if (!online) return { ok: false, status: "queued", reason: "offline" };
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? SUBMIT_TIMEOUT_MS);
  try {
    const res = await f(QUICK_CREATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return classifyResponse<R>(res.status, body);
  } catch {
    return { ok: false, status: "queued", reason: timedOut ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

// ── Хүлээлгийн бичлэг ────────────────────────────────────────

export type PendingSubmit = {
  clientKey: string;
  profileId: string;
  draftKey: string | null;
  sealed: SealedRecord;
  createdAt: number;
  attempts: number;
  lastTryAt: number | null;
  status: "queued" | "auth";
};

const pendingKv = () => crm2Kv("pending");

export function readLastProfile(): string | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_PROFILE_KEY) : null;
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

async function savePending(
  payload: QuickCreatePayload,
  info: { clientKey: string; profileId: string; draftKey: string | null; status: "queued" | "auth" }
): Promise<boolean> {
  try {
    const prev = await pendingKv().get<PendingSubmit>(info.clientKey);
    const rec: PendingSubmit = {
      clientKey: info.clientKey,
      profileId: info.profileId,
      draftKey: info.draftKey ?? prev?.draftKey ?? null,
      sealed: await seal(payload, { profileId: info.profileId, ttlMs: PENDING_TTL_MS }),
      createdAt: prev?.createdAt ?? Date.now(),
      attempts: (prev?.attempts ?? 0) + 1,
      lastTryAt: Date.now(),
      status: info.status,
    };
    await pendingKv().set(info.clientKey, rec);
    emitPending();
    return true;
  } catch {
    return false;
  }
}

export type SubmitOptions = {
  clientKey: string;
  /** Битүүмжлэхэд; өгөхгүй бол localStorage 'crm2:last-profile'. */
  profileId?: string | null;
  /** Ард амжилттай илгээгдвэл хаах ноорог (draftKey). */
  draftKey?: string | null;
} & PostOptions;

/** Шуурхай бүртгэл илгээнэ; амжилтгүй (сүлжээ/нэвтрэлт) бол утсан дээр битүүмжилж хадгална. */
export async function submitQuickCreate<R extends QuickCreateResultLike = QuickCreateResultLike>(
  payload: QuickCreatePayload,
  opts: SubmitOptions
): Promise<QuickSendOutcome<R>> {
  const raw = await postQuickCreate<R>(payload, opts);
  if (raw.status === "sent" || raw.status === "invalid") {
    if (raw.status === "sent") {
      await pendingKv().del(opts.clientKey).catch(() => undefined);
      emitPending();
    }
    return raw;
  }
  const profileId = opts.profileId ?? readLastProfile();
  const saved = profileId
    ? await savePending(payload, {
        clientKey: opts.clientKey,
        profileId,
        draftKey: opts.draftKey ?? null,
        status: raw.status === "auth" ? "auth" : "queued",
      })
    : false;
  return { ...raw, saved };
}

export async function listPending(profileId: string): Promise<PendingSubmit[]> {
  const rows = (await pendingKv().entries<PendingSubmit>()).map(([, v]) => v).filter(Boolean);
  return rows.filter((r) => r.profileId === profileId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPending(profileId: string): Promise<number> {
  return (await listPending(profileId)).length;
}

export async function clearPendingForUser(profileId: string): Promise<void> {
  const rows = await pendingKv().entries<PendingSubmit>();
  await pendingKv().delMany(rows.filter(([, r]) => !r || r.profileId === profileId).map(([k]) => k));
  emitPending();
}

export async function purgePendingForOthers(profileId: string): Promise<void> {
  const rows = await pendingKv().entries<PendingSubmit>();
  await pendingKv().delMany(rows.filter(([, r]) => !r || r.profileId !== profileId).map(([k]) => k));
  emitPending();
}

export type ResumeReport = { sent: number; remaining: number; auth: boolean; invalid: number; lost: number };

let resuming: Promise<ResumeReport> | null = null;

function ownerStatusOf(r: QuickCreateResultLike): string | null {
  return r.owner && typeof r.owner.status === "string" ? r.owner.status : null;
}

async function resumeOnce(profileId: string, post: PostOptions): Promise<ResumeReport> {
  const report: ResumeReport = { sent: 0, remaining: 0, auth: false, invalid: 0, lost: 0 };
  const list = await listPending(profileId);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const payload = await open<QuickCreatePayload>(p.sealed, { profileId });
    const ck = p.draftKey ? parseDraftKey(p.draftKey) : null;
    if (!payload) {
      // Хугацаа дууссан/түлхүүр солигдсон — ноорог дахин засварлах төлөвт.
      await pendingKv().del(p.clientKey);
      if (ck) await setDraftStatus(ck.profileId, p.clientKey, "editing").catch(() => undefined);
      report.lost++;
      continue;
    }
    const raw = await postQuickCreate(payload, post);
    if (raw.status === "sent") {
      await pendingKv().del(p.clientKey);
      report.sent++;
      const r = raw.result;
      const ownerStatus = ownerStatusOf(r);
      const ownerFinal = !ownerStatus || (OWNER_FINAL as readonly string[]).includes(ownerStatus);
      await bindProperty(p.clientKey, r.property_id).catch(() => undefined);
      if (p.draftKey) await discardDraft(p.draftKey, { undoMs: 0, keepPrivate: !ownerFinal }).catch(() => undefined);
      const duplicateCount = Array.isArray(r.duplicates) ? r.duplicates.length : 0;
      if (needsAttention({ ownerStatus, duplicateCount }, OWNER_FINAL)) {
        await addOutbox({
          clientKey: p.clientKey,
          profileId,
          propertyId: r.property_id,
          code: r.code ?? null,
          ownerStatus,
          duplicateCount,
        });
      }
      continue;
    }
    if (raw.status === "invalid") {
      await pendingKv().del(p.clientKey);
      if (ck) await setDraftStatus(ck.profileId, p.clientKey, "editing").catch(() => undefined);
      await addOutbox({
        clientKey: p.clientKey,
        profileId,
        propertyId: null,
        code: null,
        ownerStatus: null,
        duplicateCount: 0,
        error: raw.error,
        field: raw.field,
      });
      report.invalid++;
      continue;
    }
    // auth эсвэл сүлжээ — үлдсэнийг дараа.
    await pendingKv().set(p.clientKey, {
      ...p,
      attempts: p.attempts + 1,
      lastTryAt: Date.now(),
      status: raw.status === "auth" ? "auth" : "queued",
    } satisfies PendingSubmit);
    report.auth = raw.status === "auth";
    report.remaining = list.length - i;
    break;
  }
  emitPending();
  return report;
}

/** Хүлээлгийн илгээлтүүдийг дахин илгээнэ (давхар дуудахад нэг гүйлт). */
export function resumePendingSubmits(profileId?: string | null, post: PostOptions = {}): Promise<ResumeReport> {
  const pid = profileId ?? readLastProfile();
  if (!pid) return Promise.resolve({ sent: 0, remaining: 0, auth: false, invalid: 0, lost: 0 });
  if (!resuming) {
    resuming = resumeOnce(pid, post).finally(() => {
      resuming = null;
    });
  }
  return resuming;
}

// ── React ────────────────────────────────────────────────────

const pendingListeners = new Set<() => void>();
let pendingVersion = 0;
function emitPending() {
  pendingVersion++;
  for (const l of pendingListeners) l();
}
/** Хүлээлгийн жагсаалт өөрчлөгдөхөд нэмэгдэх тоолуур (useSyncExternalStore-д). */
export function subscribePending(cb: () => void): () => void {
  pendingListeners.add(cb);
  return () => {
    pendingListeners.delete(cb);
  };
}
export const pendingSnapshot = () => pendingVersion;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true
  );
}

/**
 * Сесс эхлэх / гарах үеийн төхөөрөмжийн цэвэрлэгээ (R8/R20).
 *
 * - onSessionStart(profileId): өөр хэрэглэгчийн ноорог/дараалал/хүлээлэг/outbox,
 *   хугацаа дууссан бүх зүйл, хуучин share-ийг устгаж, localStorage 'crm2:last-profile'
 *   (зөвхөн uuid; offline.html ашиглана) бичнэ.
 * - pendingLossSummary(profileId): гарахаас өмнөх анхааруулгад илгээгдээгүй зураг/бүртгэл,
 *   дуусаагүй ноорог (зурагтай нь) ба утсан дээрх гэрээний хуудасны тоо.
 * - logoutCleanup(profileId): энэ хэрэглэгчийн бүх төхөөрөмжийн өгөгдөл, vault-ын түлхүүр,
 *   share хайрцгийг устгана.
 */

import { clearAllForUser, parseDraftKey, purgeExpired, purgeOtherUsers, unsentDraftSummary } from "@/lib/crm2/device/draft-store";
import { clearQueueForUser, listQueue, purgeQueueForOthers } from "@/lib/crm2/device/upload-queue";
import { clearPendingForUser, countPending, LAST_PROFILE_KEY, purgePendingForOthers } from "@/lib/crm2/device/network";
import { clearOutboxForUser, purgeOutboxForOthers } from "@/lib/crm2/device/outbox";
import { deleteShared, purgeShared } from "@/lib/crm2/device/share-inbox";
import { crm2Kv, getSealed, wipeVault } from "@/lib/crm2/device/vault";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let startedFor: string | null = null;
let startPromise: Promise<void> | null = null;

async function settle(tasks: (() => Promise<unknown>)[]): Promise<void> {
  // Дараалан: нэг нь унасан ч бусад нь ажиллана.
  for (const t of tasks) {
    try {
      await t();
    } catch {
      // үргэлжлүүлнэ
    }
  }
}

/** Сесс эхлэхэд (shell mount). Нэг хэрэглэгчид нэг хуудсанд нэг удаа ажиллана. */
export function onSessionStart(profileId: string): Promise<void> {
  if (!UUID_RE.test(profileId)) return Promise.resolve();
  if (startedFor === profileId && startPromise) return startPromise;
  startedFor = profileId;
  try {
    localStorage.setItem(LAST_PROFILE_KEY, profileId);
  } catch {
    // хувийн горим г.м.
  }
  startPromise = settle([
    // Дарааллыг эхэлж: бусдын blob-ыг дараалал өөрөө устгана.
    () => purgeQueueForOthers(profileId),
    () => purgeOtherUsers(profileId),
    () => purgePendingForOthers(profileId),
    () => purgeOutboxForOthers(profileId),
    () => purgeExpired(),
    () => purgeShared(profileId),
  ]);
  return startPromise;
}

export type LossSummary = { photos: number; submits: number; drafts: number; draftPhotos: number; pages: number };

/** Утсан дээр авсан, PDF болж дараалалд ороогүй гэрээний хуудас (битүүмжилсэн бичлэг). */
async function unsentContractPages(profileId: string): Promise<number> {
  let n = 0;
  for (const [k] of await crm2Kv("sealed").entries()) {
    const p = parseDraftKey(k);
    if (!p || p.profileId !== profileId || !p.scope.endsWith(":contract-pages")) continue;
    const rec = await getSealed<{ pages?: unknown[]; queuedIds?: unknown[] }>(k, { profileId }).catch(() => null);
    if (rec && Array.isArray(rec.pages) && !(Array.isArray(rec.queuedIds) && rec.queuedIds.length)) n += rec.pages.length;
  }
  return n;
}

/** Гарахаас өмнө: илгээгдээгүй зураг/файл, бүртгэл, дуусаагүй ноорог ба гэрээний хуудасны тоо. */
export async function pendingLossSummary(profileId: string): Promise<LossSummary> {
  const safe = async <T,>(f: () => Promise<T>, d: T): Promise<T> => {
    try {
      return await f();
    } catch {
      return d;
    }
  };
  const photos = await safe(async () => (await listQueue(profileId)).filter((i) => i.status !== "done").length, 0);
  const submits = await safe(() => countPending(profileId), 0);
  const drafts = await safe(() => unsentDraftSummary(profileId), { drafts: 0, photos: 0 });
  const pages = await safe(() => unsentContractPages(profileId), 0);
  return { photos, submits, drafts: drafts.drafts, draftPhotos: drafts.photos, pages };
}

/** Гарах үед (signOut-оос өмнө). */
export async function logoutCleanup(profileId: string): Promise<void> {
  await settle([
    () => clearQueueForUser(profileId),
    () => clearPendingForUser(profileId),
    () => clearOutboxForUser(profileId),
    () => clearAllForUser(profileId),
    () => wipeVault(),
    () => deleteShared("all"),
  ]);
  try {
    // CRM2-ийн бүх локал түлхүүр (сүүлийн профайл, сүүлд ашигласан дүүрэг/төсөл г.м.).
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("crm2:")) dead.push(k);
    }
    for (const k of dead) localStorage.removeItem(k);
  } catch {
    // ignore
  }
  startedFor = null;
  startPromise = null;
}

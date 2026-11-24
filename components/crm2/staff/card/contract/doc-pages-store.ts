import { draftKey, getBlobRecord, newId, putSealedBlob, sheetScope } from "@/lib/crm2/device/draft-store";
import type { CropRect } from "@/lib/crm2/device/image-prep";
import { crm2Kv, deleteSealed, getSealed, openBytes, putSealed, sealBytes } from "@/lib/crm2/device/vault";

/**
 * Гэрээний хуудасны зураг утсан дээр (R12): хуудас бүр авсны дараа ШУУД vault-аар битүүмжлэгдэнэ
 * (24 цаг), картаас гарч ороход сэргэнэ, амжилттай хуулагдсаны дараа устгагдана.
 * Хадгалалт: хуудасны жагсаалт `sheet:{propertyId}:contract-pages` түлхүүрээр битүүмжилсэн бичлэг,
 * байт нь 'blobs' дотор битүүмжилсэн (ил blob хэзээ ч бичихгүй).
 */

export const DOC_PAGES_TTL_MS = 24 * 60 * 60 * 1000;
export const DOC_PAGES_MAX = 30;

export type DocRotate = 0 | 90 | 180 | 270;

export type DocPageMeta = {
  id: string;
  blobKey: string;
  w: number;
  h: number;
  rotate: DocRotate;
  enhance: boolean;
  crop: CropRect | null;
};

export type DocPagesRecord = {
  v: 1;
  contractId: string;
  pages: DocPageMeta[];
  /** PDF болгон дараалалд оруулсан мөрүүд (хуулагдтал хуудсыг хадгална). */
  queuedIds: string[];
};

export function docPagesKey(profileId: string, propertyId: string): string {
  return draftKey(profileId, sheetScope(propertyId, "contract-pages"));
}

// ── Цэвэр туслах ───────────────────────────────────────────────────────────

export function rotateNext(r: DocRotate): DocRotate {
  return ((r + 90) % 360) as DocRotate;
}

export function movePage<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

/** Хуудсыг дахин боловсруулах шаардлагатай эсэх (эргүүлсэн, тайрсан, контраст). */
export function needsRender(p: Pick<DocPageMeta, "rotate" | "enhance" | "crop">): boolean {
  return p.rotate !== 0 || p.enhance || !!p.crop;
}

/** Хуудсын бичлэг энэ гэрээнийх биш бол хоосон гэж үзнэ (өөр гэрээний хуудас холилдохгүй). */
export function pagesFor(rec: DocPagesRecord | null, contractId: string): DocPagesRecord {
  if (!rec || rec.v !== 1 || rec.contractId !== contractId) return { v: 1, contractId, pages: [], queuedIds: [] };
  return { ...rec, pages: rec.pages.slice(0, DOC_PAGES_MAX), queuedIds: rec.queuedIds ?? [] };
}

/** Дарааллын мөрүүдийн төлөвөөр хуудсыг устгах эсэх: бүгд хуулагдсан (эсвэл дараалалд алга). */
export function uploadsFinished(
  queuedIds: readonly string[],
  items: readonly { id: string; status: string }[]
): "none" | "pending" | "failed" | "done" {
  if (!queuedIds.length) return "none";
  const mine = queuedIds.map((id) => items.find((i) => i.id === id));
  if (mine.some((i) => i && i.status === "failed")) return "failed";
  if (mine.some((i) => i && i.status !== "done")) return "pending";
  return "done";
}

// ── IndexedDB (браузерт) ───────────────────────────────────────────────────

export async function loadPages(profileId: string, propertyId: string, contractId: string): Promise<DocPagesRecord> {
  const rec = await getSealed<DocPagesRecord>(docPagesKey(profileId, propertyId), { profileId });
  return pagesFor(rec, contractId);
}

export async function savePages(profileId: string, propertyId: string, rec: DocPagesRecord): Promise<void> {
  const key = docPagesKey(profileId, propertyId);
  if (!rec.pages.length && !rec.queuedIds.length) {
    await deleteSealed(key);
    return;
  }
  await putSealed(key, rec, { profileId, ttlMs: DOC_PAGES_TTL_MS });
}

/** Боловсруулсан хуудсыг (JPEG) битүүмжилж хадгална → мета. */
export async function storePage(profileId: string, file: File, size: { w: number; h: number }): Promise<DocPageMeta> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sealed = await sealBytes(bytes, { profileId, ttlMs: DOC_PAGES_TTL_MS });
  const blobKey = await putSealedBlob(profileId, sealed, { name: file.name || "page.jpg", type: "image/jpeg" });
  return { id: newId(), blobKey, w: size.w, h: size.h, rotate: 0, enhance: false, crop: null };
}

/** Хуудсын байт (хугацаа дууссан/өөр хэрэглэгчийнх бол null). */
export async function readPage(profileId: string, blobKey: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const rec = await getBlobRecord(blobKey);
  if (!rec?.sealed) return null;
  const bytes = await openBytes(rec.sealed, { profileId });
  return bytes ? new Uint8Array(bytes) : null;
}

export async function deletePageBlobs(keys: readonly string[]): Promise<void> {
  if (keys.length) await crm2Kv("blobs").delMany([...keys]);
}

/** Бүх хуудас ба жагсаалтыг устгана (амжилттай хуулсны дараа эсвэл «Устгах»). */
export async function clearPages(profileId: string, propertyId: string, rec: DocPagesRecord): Promise<void> {
  await deletePageBlobs(rec.pages.map((p) => p.blobKey));
  await deleteSealed(docPagesKey(profileId, propertyId));
}

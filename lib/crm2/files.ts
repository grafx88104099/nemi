import type { Crm2FileLimits } from "@/lib/crm2/settings";

/**
 * Медиа ба гэрээний файлын дүрэм (цэвэр модуль — клиент шалгалт, тест).
 * Bucket-ийн зөвшөөрөгдсөн төрөл миграцийнхтай ижил. HEIC/HEIF хүлээж авахгүй
 * (Chrome/Edge харуулдаггүй) — хэрэглэгч JPEG болгож хуулна. Гэрээ (kind='contract') зөвхөн PDF;
 * зураг зөвхөн өмчлөлийн/бусад баримтад.
 */

export const CRM2_MEDIA_BUCKET = "crm2-media";
export const CRM2_DOCS_BUCKET = "crm2-docs";

export const MEDIA_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MEDIA_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
/** Өмчлөлийн баримт, иргэний үнэмлэх, бусад баримт (kind ≠ 'contract'). */
export const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
/**
 * Зуучлалын гэрээ (kind='contract') — зөвхөн PDF (20261125000100 crm2_brokerage_files_guard). Камераар скан
 * хийсэн хуудсуудыг нэг PDF болгож хуулна; зураг гэрээ гэж тооцогдохгүй.
 */
export const CONTRACT_PDF_TYPES = ["application/pdf"] as const;

/** <input accept="..."> утга. */
export const MEDIA_ACCEPT = [...MEDIA_IMAGE_TYPES, ...MEDIA_VIDEO_TYPES, ".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"].join(",");
export const DOC_ACCEPT = [...DOC_TYPES, ".pdf", ".jpg", ".jpeg", ".png", ".webp"].join(",");
export const CONTRACT_PDF_ACCEPT = "application/pdf,.pdf";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
};

export const HEIC_ERROR =
  "HEIC/HEIF зургийг хүлээж авахгүй. Утасныхаа камерын тохиргоог «Most Compatible» (JPEG) болгох эсвэл зургийг JPEG болгож хөрвүүлээд дахин оруулна уу.";

export type FileLike = { name: string; type: string; size: number };

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

export function isHeic(file: FileLike): boolean {
  const t = (file.type || "").toLowerCase();
  const ext = extOf(file.name);
  return t === "image/heic" || t === "image/heif" || t === "image/heic-sequence" || ext === "heic" || ext === "heif";
}

/** Файлын MIME (хөтөч хоосон өгвөл өргөтгөлөөр). */
export function fileMime(file: FileLike): string {
  const t = (file.type || "").toLowerCase();
  if (t && t !== "application/octet-stream") return t;
  return TYPE_BY_EXT[extOf(file.name)] ?? t;
}

/** Storage-ийн нэрэнд хэрэглэх өргөтгөл. */
export function fileExt(file: FileLike): string {
  return EXT_BY_TYPE[fileMime(file)] ?? "bin";
}

const MB = 1024 * 1024;
const fmtMb = (n: number) => `${n} МБ`;

/** Медиа файлын шалгалт → алдааны текст эсвэл null. existing — одоо байгаа зураг/бичлэгийн тоо. */
export function validateMediaFile(
  file: FileLike,
  limits: Pick<Crm2FileLimits, "maxImageMb" | "maxVideoMb" | "maxImages" | "maxVideos">,
  existing?: { images?: number; videos?: number }
): string | null {
  if (isHeic(file)) return HEIC_ERROR;
  const mime = fileMime(file);
  const isImage = (MEDIA_IMAGE_TYPES as readonly string[]).includes(mime);
  const isVideo = (MEDIA_VIDEO_TYPES as readonly string[]).includes(mime);
  if (!isImage && !isVideo) return `«${file.name}» — зөвхөн JPEG, PNG, WebP зураг эсвэл MP4, MOV, WebM бичлэг оруулна.`;
  if (file.size <= 0) return `«${file.name}» — файл хоосон байна.`;
  const maxMb = isImage ? limits.maxImageMb : limits.maxVideoMb;
  if (file.size > maxMb * MB) {
    return isImage
      ? `«${file.name}» — зураг ${fmtMb(maxMb)}-аас ихгүй байна.`
      : `«${file.name}» — бичлэг ${fmtMb(maxMb)}-аас ихгүй байна. Урт бичлэгийг холбоосоор (https) нэмнэ үү.`;
  }
  if (isImage && existing?.images !== undefined && existing.images >= limits.maxImages) {
    return `Нэг хөрөнгөд ${limits.maxImages} хүртэл зураг хадгална.`;
  }
  if (isVideo && existing?.videos !== undefined && existing.videos >= limits.maxVideos) {
    return `Нэг хөрөнгөд ${limits.maxVideos} хүртэл бичлэг хадгална.`;
  }
  return null;
}

/** «{name}» — гэрээ зөвхөн PDF (зураг сонгосон, эсвэл PDF толгойгүй файл). */
export function contractPdfOnlyText(name: string): string {
  return `«${name}» — гэрээг зөвхөн PDF хэлбэрээр оруулна. Зураг гэрээ гэж тооцогдохгүй — камераар скан хийвэл PDF болно.`;
}

/** Скан хийсэн гэрээ хязгаараас том (нэг PDF-д багтсангүй). */
export function contractPdfTooLargeText(bytes: number): string {
  const mb = Math.max(0.1, Math.round((bytes / MB) * 10) / 10);
  return `Гэрээ хэт том (${mb} МБ) — хуудсын тоог багасгана уу.`;
}

/**
 * Гэрээний PDF-ийн шалгалт → алдааны текст эсвэл null. Төрөл нь application/pdf (хөтөч хоосон өгвөл
 * .pdf өргөтгөлөөр) байх ба хэмжээ docs.max_file_mb-аас ихгүй. Байтын шалгалтыг isPdfHeader хийнэ.
 */
export function validateContractPdf(file: FileLike, limits: Pick<Crm2FileLimits, "maxDocMb">): string | null {
  if (fileMime(file) !== "application/pdf") return contractPdfOnlyText(file.name);
  if (file.size <= 0) return `«${file.name}» — файл хоосон байна.`;
  if (file.size > limits.maxDocMb * MB) return `«${file.name}» — файл ${fmtMb(limits.maxDocMb)}-аас ихгүй байна.`;
  return null;
}

/** PDF-ийн эхний 5 байт «%PDF-» эсэх (нэрийг нь .pdf болгосон зургийг танина). */
export function isPdfHeader(bytes: ArrayLike<number> | null | undefined): boolean {
  if (!bytes || bytes.length < 5) return false;
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
  for (let i = 0; i < 5; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/** Өмчлөлийн/бусад баримтын шалгалт → алдааны текст эсвэл null. existing — гэрээнд байгаа файлын тоо. */
export function validateDocFile(
  file: FileLike,
  limits: Pick<Crm2FileLimits, "maxDocMb" | "maxDocsPerContract">,
  existing?: number
): string | null {
  if (isHeic(file)) return HEIC_ERROR;
  const mime = fileMime(file);
  if (!(DOC_TYPES as readonly string[]).includes(mime)) return `«${file.name}» — зөвхөн PDF, JPEG, PNG, WebP файл оруулна.`;
  if (file.size <= 0) return `«${file.name}» — файл хоосон байна.`;
  if (file.size > limits.maxDocMb * MB) return `«${file.name}» — файл ${fmtMb(limits.maxDocMb)}-аас ихгүй байна.`;
  if (existing !== undefined && existing >= limits.maxDocsPerContract) {
    return `Нэг гэрээнд ${limits.maxDocsPerContract} хүртэл файл хадгална.`;
  }
  return null;
}

/** crm2-media: {office}/{property}/{uuid}.{ext} */
export function mediaPath(officeId: string, propertyId: string, fileId: string, ext: string): string {
  return `${officeId}/${propertyId}/${fileId}.${ext}`;
}

/**
 * crm2-docs: {office}/brokerage/{contract}/{uuid}.{ext}; өмчлөлийн баримт / иргэний үнэмлэх (restricted) —
 * {office}/brokerage/{contract}/restricted/{uuid}.{ext} (crm2_brokerage_files_kind_guard, storage policy).
 */
export function docPath(officeId: string, contractId: string, fileId: string, ext: string, restricted = false): string {
  return `${officeId}/brokerage/${contractId}/${restricted ? "restricted/" : ""}${fileId}.${ext}`;
}

/** Хязгаарлагдмал (restricted) хавтаст хадгалах гэрээний файлын төрөл. */
export function isRestrictedDocKind(kind: string | null | undefined): boolean {
  return kind === "ownership" || kind === "id";
}

/** Хэмжээг уншихуйц: «2.4 МБ», «820 КБ». */
export function fmtFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "";
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** Хөтөч .mov (HEVC)-ийг тоглуулж чадахгүй байж болзошгүй — татах холбоос санал болгох. */
export function mayNotPlay(mime: string | null | undefined): boolean {
  return (mime ?? "").toLowerCase() === "video/quicktime";
}

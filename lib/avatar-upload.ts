/**
 * Бүртгэлийн зураг (profiles.avatar_url) — цэвэр туслах функцүүд (клиент, сервер хоёуланд).
 * Файл: avatars/<хэрэглэгчийн id>/<санамсаргүй нэр>.<webp|jpg>. Хөтөч 512px дөрвөлжин болгож
 * шахаад байршуулна (утасны 5–10MB зураг → ~50KB).
 */

export const AVATAR_BUCKET = "avatars";
/** Bucket-ийн хязгаар (migration 20261124006000). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** Шахахаас өмнө хүлээн авах эх файлын дээд хэмжээ — түүнээс том бол хөтөч гацаж болно. */
export const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const AVATAR_SIZE = 512;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME = /^[A-Za-z0-9_-]{8,64}\.(webp|jpg)$/;

export function avatarExtension(mime: string): "webp" | "jpg" | null {
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return null;
}

export function avatarObjectPath(userId: string, nonce: string, ext: "webp" | "jpg"): string {
  return `${userId}/${nonce}.${ext}`;
}

/**
 * Файлын санамсаргүй нэр (32 hex). crypto.randomUUID нь хуучин iOS Safari (15.4-өөс өмнөх) болон
 * https-гүй хаягт байхгүй тул getRandomValues ашиглана.
 */
export function randomAvatarNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Холбоос тухайн хэрэглэгчийн avatars хавтас дахь файлыг заадаг бол файлын нэр, эс бөгөөс null.
 * Жишээ нь агентын картын зураг (agents.avatar_url) бүртгэлийн зургаас хуулагдсан бол тэр файлыг
 * бүртгэлийн зураг солиход устгахгүй байхад хэрэглэнэ.
 */
export function avatarFileNameFromUrl(userId: string, url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/${userId}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let name: string;
  try {
    name = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  return FILE_NAME.test(name) ? name : null;
}

/** Зөвхөн өөрийн хавтсанд, бидний үүсгэдэг хэлбэрийн нэртэй файл (зам дамжуулалт, дэд хавтас үгүй). */
export function isOwnAvatarPath(userId: string, path: string): boolean {
  if (!UUID.test(userId)) return false;
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === userId && FILE_NAME.test(parts[1]);
}

/** Төвөөс дөрвөлжин тайралт: эх зургийн аль хэсгийг авах. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.max(1, Math.min(width, height));
  return { sx: Math.max(0, Math.round((width - side) / 2)), sy: Math.max(0, Math.round((height - side) / 2)), side };
}

/** Нэр/и-мэйлээс 1–2 үсэг; хоосон бол «Х» (Хэрэглэгч). */
export function accountInitials(base: string): string {
  return (
    base
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "Х"
  );
}

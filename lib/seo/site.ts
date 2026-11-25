/**
 * Сайтын URL, SEO-ийн цэвэр туслахууд — НЭГ эх сурвалж (share-seo, fb-utm,
 * otp-hearts, mobile-hub бүгд эндээс импортлоно; siteUrl/UUID_RE-г дахин бүү тодорхойл).
 * "server-only" импортгүй: клиент компонент болон vitest-ээс ч ашиглана.
 * "use server" файлаас UUID_RE-г бүү re-export хий (use-server-exports тест).
 */

export const SITE_NAME = "Нэми";
const DEFAULT_SITE = "https://www.nemi.mn";

let warnedBadSiteUrl = false;

/**
 * Каноник origin (төгсгөлийн «/» ба замгүй). NEXT_PUBLIC_SITE_URL хоосон бол
 * https://www.nemi.mn; протоколгүй бол https:// нэмнэ; буруу утга build-ийг унагахгүй.
 * process.env.NEXT_PUBLIC_SITE_URL-г шууд уншина (build үед inline хийгдэнэ).
 */
export function siteUrl(): string {
  let raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    return new URL(raw).origin;
  } catch {
    if (!warnedBadSiteUrl) {
      warnedBadSiteUrl = true;
      console.error(`NEXT_PUBLIC_SITE_URL буруу байна; ${DEFAULT_SITE}-г ашиглана.`);
    }
    return DEFAULT_SITE;
  }
}

/** Сайтын үнэмлэхүй URL: absUrl("/listings/1") → "https://www.nemi.mn/listings/1". */
export function absUrl(path: string): string {
  return siteUrl() + (path.startsWith("/") ? path : `/${path}`);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID_RE.test(s);

/** <script type="application/ld+json"> дотор аюулгүй JSON («</script>» таслахгүй). */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Хоосон зайг нэг зай болгож, max-аас урт бол сүүлийн зай дээр (≤ max-1) тасалж «…» залгана.
 * null/undefined → "".
 */
export function clip(text: string | null | undefined, max: number): string {
  if (text == null) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max - 1);
  const head = cut > 0 ? s.slice(0, cut) : s.slice(0, max - 1);
  return `${head.trimEnd()}…`;
}

/** «— Нэми» уламжлал; гарчиг аль хэдийн « — » агуулбал давхар зураас гаргахгүй. */
export function withBrand(title: string): string {
  return title.includes(" — ") ? `${title} | ${SITE_NAME}` : `${title} — ${SITE_NAME}`;
}

/**
 * openGraph-ийн суурь. Хүүхэд хуудасны openGraph нь эцгийнхийг бүхэлд нь
 * сольдог тул openGraph тохируулдаг хуудас бүр үүнийг spread хийж, images-ээ тавина.
 */
export function ogBase() {
  return { type: "website" as const, siteName: SITE_NAME, locale: "mn_MN" };
}

/** Анхдагч OG зураг 1200×630 (1.91:1 — FB/Viber-ийн том preview). Дахин үүсгэх: node scripts/gen-og-image.mjs */
export const ROOT_OG_IMAGE = { url: "/brand/og-default.png", width: 1200, height: 630, alt: SITE_NAME };

/** NEXT_PUBLIC_SUPABASE_URL-ийн host (буруу/хоосон бол null). */
export function supabaseHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
  } catch {
    return null;
  }
}

/**
 * og:image-ийн зураг. Зөвхөн https URL. next.config remotePatterns-д буй host
 * (Supabase, images.unsplash.com) бол /_next/image-ээр жижигрүүлнэ (харьцангуй —
 * metadataBase шийднэ; w/q нь Next 16-ийн анхдагч deviceSizes/qualities-д багтана).
 * Бусад host-ийг оптимизатор татгалзах тул өөрчлөхгүй буцаана.
 */
export function ogPhotoUrl(src: string | null | undefined, w: 640 | 1200 = 1200): string | null {
  if (!src) return null;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.host === supabaseHost() || u.host === "images.unsplash.com") {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
  }
  return src;
}

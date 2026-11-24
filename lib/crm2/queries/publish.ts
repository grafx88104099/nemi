import { crm2Client, type Crm2Supabase } from "@/lib/crm2/server";
import { MAX_LISTING_PHOTOS } from "@/lib/crm2/schemas";
import { watermarkFromOffice, type WatermarkConfig } from "@/lib/watermark";

/**
 * Хөрөнгийн картын «Зар» табын цорын ганц уншилт. Хэрэглэгчийн client —
 * RLS ба crm2_publish_state() доторх эрхийн шалгалт хэрэгжинэ (харах эрхгүй бол null).
 *
 * Энд НУУЦЛАЛТАЙ талбар огт уншигдахгүй: зөвхөн зарын төлөв, тоо, анхдагч текст,
 * зургийн storage зам ба оффисын тамганы тохиргоо.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Crm2PublishMedia = {
  id: string;
  storagePath: string;
  sortOrder: number;
  isCover: boolean;
  /**
   * «Миний зараас үүсгэх»-ээр хуулсан зургийн эх зарын хаяг (гарал үүсэл; хэзээ ч URL-аар татахгүй).
   * Тамгагүй байж болзошгүй тул шинэ зар / зураг солих үед бусадтай адил тамга дарна.
   */
  sourcePublicUrl: string | null;
};

export type Crm2PublishState = {
  /** Нийтлэх/буцаах эрхтэй (үүрэгт агент, багийн ахлагч, менежер). */
  canPublish: boolean;
  /** Нийтлэхэд саад болох шалтгаанууд (монголоор, DB-ээс). Хоосон бол бэлэн. */
  blockers: string[];
  /** Нийтлэхийг хаахгүй сануулга (картын бичвэрт утас г.м.). */
  warnings: string[];
  listingId: string | null;
  published: boolean;
  publishedAt: string | null;
  /** Нийтэлсэн хүний нэр. */
  publishedBy: string | null;
  title: string | null;
  description: string | null;
  listingStatus: string | null;
  /** Зард одоо байгаа (тамгатай) зургийн тоо. */
  photoCount: number;
  /** CRM-д байгаа зургийн тоо. */
  imageCount: number;
  /** Сүүлийн шинэчлэлээс хойш CRM-д зураг нэмэгдсэн — зард дутуу. */
  mediaStale: boolean;
  defaultTitle: string;
  defaultDescription: string;
  officeId: string;
  /** Оффисын тамганы тохиргоо; унтраалттай бол null (зураг нийтлэх боломжгүй). */
  watermark: WatermarkConfig | null;
  /** Тамга дарж зард хуулах зургууд: нүүр эхэнд, дараа нь дарааллаар. */
  media: Crm2PublishMedia[];
};

/** crm2_publish_state() RPC-ийн jsonb (миграцийн түлхүүртэй ижил). */
type PublishStateRaw = {
  can_publish?: boolean | null;
  blockers?: unknown;
  warnings?: unknown;
  listing_id?: string | null;
  published?: boolean | null;
  published_at?: string | null;
  published_by?: string | null;
  title?: string | null;
  description?: string | null;
  listing_status?: string | null;
  photo_count?: number | null;
  image_count?: number | null;
  media_stale?: boolean | null;
  default_title?: string | null;
  default_description?: string | null;
};

/** Зард орох зургууд (зөвхөн kind='image', storage-д байгаа нь). */
async function loadPublishMedia(supabase: Crm2Supabase, propertyId: string): Promise<Crm2PublishMedia[]> {
  const { data, error } = await supabase
    .from("crm2_property_media")
    .select("id, storage_path, sort_order, is_cover, source_public_url")
    .eq("property_id", propertyId)
    .eq("kind", "image")
    .not("storage_path", "is", null)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    // DB хязгаараас (30) хэтрэхгүй — илүү зураг байвал эхний 30 нь зард гарна.
    .limit(MAX_LISTING_PHOTOS);
  if (error) {
    console.error("crm2 publish media:", error.message);
    return [];
  }
  const out: Crm2PublishMedia[] = [];
  for (const m of data ?? []) {
    if (!m.storage_path) continue;
    out.push({
      id: m.id,
      storagePath: m.storage_path,
      sortOrder: m.sort_order,
      isCover: m.is_cover,
      sourcePublicUrl: m.source_public_url ?? null,
    });
  }
  return out;
}

/** Оффисын усан тэмдгийн тохиргоо (offices — бүгдэд уншигдана). */
async function loadWatermark(supabase: Crm2Supabase, officeId: string): Promise<WatermarkConfig | null> {
  if (!UUID_RE.test(officeId)) return null;
  const { data, error } = await supabase
    .from("offices")
    .select("name, logo_url, watermark_logo_url, watermark_enabled")
    .eq("id", officeId)
    .maybeSingle();
  if (error) console.error("crm2 publish watermark:", error.message);
  return watermarkFromOffice(data);
}

/** Картын «Зар» табын төлөв. Харах эрхгүй / олдохгүй бол null. */
export async function getPublishState(propertyId: string): Promise<Crm2PublishState | null> {
  if (!UUID_RE.test(propertyId)) return null;
  const supabase = await crm2Client();

  const { data, error } = await supabase.rpc("crm2_publish_state", { p_property: propertyId });
  if (error) {
    console.error("crm2 publish_state:", error.message);
    return null;
  }
  const raw = (data ?? null) as unknown as PublishStateRaw | null;
  if (!raw) return null;

  // Тамганы тохиргоонд хөрөнгийн оффис хэрэгтэй (өөр ямар ч талбар уншихгүй).
  const prop = await supabase.from("crm2_properties").select("office_id").eq("id", propertyId).maybeSingle();
  if (prop.error) console.error("crm2 publish office:", prop.error.message);
  const officeId = prop.data?.office_id ?? "";

  const [media, watermark] = await Promise.all([
    loadPublishMedia(supabase, propertyId),
    loadWatermark(supabase, officeId),
  ]);

  const blockers = Array.isArray(raw.blockers) ? raw.blockers.filter((b): b is string => typeof b === "string") : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string") : [];

  return {
    canPublish: !!raw.can_publish,
    blockers,
    warnings,
    listingId: raw.listing_id ?? null,
    published: !!raw.published,
    publishedAt: raw.published_at ?? null,
    publishedBy: raw.published_by ?? null,
    title: raw.title ?? null,
    description: raw.description ?? null,
    listingStatus: raw.listing_status ?? null,
    photoCount: Number(raw.photo_count ?? 0),
    imageCount: Number(raw.image_count ?? 0),
    mediaStale: !!raw.media_stale,
    defaultTitle: raw.default_title ?? "",
    defaultDescription: raw.default_description ?? "",
    officeId,
    watermark,
    media,
  };
}

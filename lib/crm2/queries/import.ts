import { crm2Client } from "@/lib/crm2/server";
import { getCrm2Context } from "@/lib/crm2/context";

/**
 * «Миний зараас үүсгэх» (P12): импортлох боломжтой зар, ба зарын зургийн замын ЦЭВЭР шалгалт (R25).
 * Зарын зургийг URL-аар ХЭЗЭЭ Ч fetch хийхгүй — зөвхөн манай Supabase-ийн нийтийн `listings` bucket-ийн
 * объектын замыг гаргаж Storage API-аар (download(path)) татна. Хост, «..», кодлосон тэмдэгтэд итгэхгүй.
 */

export const LISTINGS_BUCKET = "listings";
/** Нэг зургийн татах/хуулах хугацаа (мс). */
export const IMPORT_PHOTO_TIMEOUT_MS = 15_000;

/** DB crm2_listing_photo_path-ийн цагаан жагсаалттай ижил: сегмент бүр [A-Za-z0-9_-]-ээр эхэлж, [A-Za-z0-9._-]. */
const SAFE_PATH_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

/** `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listings/` (төгсгөлийн «/»-гүй суурь URL-аас). */
export function listingsPublicPrefix(supabaseUrl: string | null | undefined): string | null {
  const base = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/?#\s]+$/.test(base)) return null;
  return `${base}/storage/v1/object/public/${LISTINGS_BUCKET}/`;
}

/**
 * Зарын зургийн url → listings bucket доторх объектын зам; манай төслийн нийтийн хаяг биш эсвэл зам аюултай
 * бол null. `expectedPath` (RPC-ийн буцаасан path) өгвөл яг таарах ёстой.
 */
export function listingObjectPath(
  url: string | null | undefined,
  supabaseUrl: string | null | undefined,
  expectedPath?: string | null
): string | null {
  const prefix = listingsPublicPrefix(supabaseUrl);
  if (!prefix || typeof url !== "string" || !url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  if (!path || path.length > 500 || !SAFE_PATH_RE.test(path)) return null;
  if (expectedPath != null && expectedPath !== path) return null;
  return path;
}

export type SniffedImage = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** Файлын эхний байтаар (magic bytes) JPEG / PNG / WebP эсэхийг тогтооно; бусад бол null. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return { mime: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export type ImportableListing = {
  id: string;
  title: string;
  status: string;
  dealType: string;
  type: string | null;
  district: string | null;
  rooms: number | null;
  area: number | null;
  price: number | null;
  /** Нүүр зургийн нийтийн хаяг (зөвхөн <img>-д; сервер татахгүй). */
  photo: string | null;
  createdAt: string;
  agentName: string | null;
};

/**
 * Импортлох боломжтой зарууд: миний (менежер — оффисын агентуудын) зар, CRM-ийн хөрөнгөтэй холбогдоогүй
 * (listing_id) ба өмнө нь хуулагдаагүй (source_listing_id). Хаагдсан (зарагдсан/түрээслэгдсэн) зарыг харуулахгүй.
 * ≤ 3 уншилт. RLS-ээр харагдахгүй холбоосыг RPC өөрөө илрүүлнэ (existing).
 */
export async function listImportableListings(limit = 100): Promise<ImportableListing[]> {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !ctx.canWork || !ctx.officeId) return [];
  const supabase = await crm2Client();

  let agentsQ = supabase.from("agents").select("id, display_name").limit(500);
  agentsQ = ctx.isManager ? agentsQ.eq("office_id", ctx.officeId) : agentsQ.eq("profile_id", ctx.profileId);
  const agents = await agentsQ;
  if (agents.error) {
    console.error("crm2 importable agents:", agents.error.message);
    return [];
  }
  const agentName = new Map((agents.data ?? []).map((a) => [a.id, a.display_name]));
  const agentIds = [...agentName.keys()];
  if (agentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("listings")
    .select("id, title, status, deal_type, type, district, rooms, area, price, photo, created_at, agent_id")
    .in("agent_id", agentIds)
    .not("status", "in", "(sold,rented)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(1, limit), 200));
  if (error) {
    console.error("crm2 importable listings:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const list = `(${ids.join(",")})`;
  const linked = await supabase
    .from("crm2_properties")
    .select("listing_id, source_listing_id")
    .or(`listing_id.in.${list},source_listing_id.in.${list}`);
  if (linked.error) console.error("crm2 importable linked:", linked.error.message);
  const taken = new Set<string>();
  for (const r of linked.data ?? []) {
    if (r.listing_id) taken.add(r.listing_id);
    if (r.source_listing_id) taken.add(r.source_listing_id);
  }
  return rows
    .filter((r) => !taken.has(r.id))
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      dealType: r.deal_type,
      type: r.type,
      district: r.district,
      rooms: r.rooms ?? null,
      area: r.area,
      price: r.price ?? null,
      photo: r.photo,
      createdAt: r.created_at,
      agentName: r.agent_id ? (agentName.get(r.agent_id) ?? null) : null,
    }));
}

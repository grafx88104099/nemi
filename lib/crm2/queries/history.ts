import { crm2Client } from "@/lib/crm2/server";
import type { Crm2HistoryRow } from "@/lib/crm2/types";

/**
 * Өөрчлөлтийн түүх (crm2_history). RLS нь объект бүрийн харах эрхээр шүүнэ
 * (хувийн талбар, гэрээний түүх зөвхөн эрхтэнд). Агентын нэр actor FK-ээр.
 */

const HISTORY_SELECT =
  "id, office_id, entity, entity_id, property_id, contact_id, deal_id, action, field, old_value, new_value, " +
  "reason, actor_id, created_at, actor:profiles!crm2_history_actor_fk(full_name)";

export type HistoryEntity =
  | "property"
  | "property_private"
  | "media"
  | "brokerage"
  | "brokerage_file"
  | "contact"
  | "phone"
  | "requirement"
  | "deal"
  | "activity"
  | "task"
  | "project"
  | "settings";

export type HistoryItem = Crm2HistoryRow & { actor: { full_name: string | null } | null };

export type HistoryFilter = {
  /** Нэг объектын түүх: entity + entityId. */
  entity?: HistoryEntity | null;
  entityId?: string | null;
  /** Хөрөнгө/харилцагч/хэлцэлтэй холбоотой бүх мөр. */
  propertyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  /** Зөвхөн эдгээр entity (жишээ: хөрөнгийн табд ['property','property_private','media','brokerage','brokerage_file']). */
  entities?: HistoryEntity[] | null;
  /** Хуудаслалт: энэ id-аас өмнөх (id буурахаар). */
  beforeId?: number | null;
  limit?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Түүх ба ачаалах алдааны тэмдэг — шинэ нь эхэнд. Шүүлтүүргүй дуудвал хоосон (бүх оффисын
 * түүхийг уншихгүй). error=true бол UI «түүх алга» биш, алдааны төлөв харуулна.
 */
export async function loadHistory(filter: HistoryFilter): Promise<{ rows: HistoryItem[]; error: boolean }> {
  const ids = [filter.entityId, filter.propertyId, filter.contactId, filter.dealId].filter(Boolean) as string[];
  if (ids.some((x) => !UUID_RE.test(x))) return { rows: [], error: false };
  if (ids.length === 0 && filter.entity !== "settings") return { rows: [], error: false };

  const supabase = await crm2Client();
  let query = supabase.from("crm2_history").select(HISTORY_SELECT);
  if (filter.entity) query = query.eq("entity", filter.entity);
  if (filter.entityId) query = query.eq("entity_id", filter.entityId);
  if (filter.propertyId) query = query.eq("property_id", filter.propertyId);
  if (filter.contactId) query = query.eq("contact_id", filter.contactId);
  if (filter.dealId) query = query.eq("deal_id", filter.dealId);
  if (filter.entities?.length) query = query.in("entity", filter.entities);
  if (filter.beforeId) query = query.lt("id", filter.beforeId);
  const limit = Math.min(Math.max(1, filter.limit ?? 100), 500);

  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) {
    console.error("crm2 listHistory:", error.message);
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as unknown as HistoryItem[], error: false };
}

/** Түүх — шинэ нь эхэнд (алдаа гарвал хоосон; алдааг ялгах бол loadHistory). */
export async function listHistory(filter: HistoryFilter): Promise<HistoryItem[]> {
  return (await loadHistory(filter)).rows;
}

/** Хөрөнгийн картын «Өөрчлөлтийн түүх» таб (хөрөнгө, хувийн талбар, медиа, гэрээ) — алдааны тэмдэгтэй. */
export function loadPropertyHistory(propertyId: string, opts: { beforeId?: number | null; limit?: number } = {}) {
  return loadHistory({
    propertyId,
    entities: ["property", "property_private", "media", "brokerage", "brokerage_file"],
    ...opts,
  });
}

/** Тохиргооны өөрчлөлтийн түүх (S11; тохиргоо удирдах эрхтэнд л харагдана). */
export function listSettingsHistory(opts: { beforeId?: number | null; limit?: number } = {}) {
  return listHistory({ entity: "settings", ...opts });
}

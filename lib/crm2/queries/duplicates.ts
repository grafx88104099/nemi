import { crm2Client, type Crm2Supabase } from "@/lib/crm2/server";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import type { Crm2PropertyDuplicate, Crm2PropertyStatus } from "@/lib/crm2/types";

/**
 * Давхардлын уншилт (P11). Хэрэглэгчийн client — RLS ба definer RPC шийднэ:
 *  - crm2_property_duplicates(p_property): засах эрхтэй хөрөнгийн ХАДГАЛСАН өгөгдлөөр, харах эрхгүй илэрцэд
 *    зөвхөн далд токен (id/код/төлөв/агент null). Эзний нэр, утас хэзээ ч ирэхгүй.
 *  - crm2_duplicate_flags: менежер, тэмдэглэсэн агентын ахлагч бүх мөрийг; агент өөрийн харах эрхтэй мөрийг.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RPC-ийн мөрийг (харах эрхгүй бол null талбартай) хэвээр нь буцаана; алдаа гарвал null. */
export async function propertyDuplicates(
  supabase: Crm2Supabase,
  propertyId: string
): Promise<{ rows: Crm2PropertyDuplicate[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await supabase.rpc("crm2_property_duplicates", { p_property: propertyId });
  if (error) return { rows: [], error };
  return { rows: (data ?? []) as Crm2PropertyDuplicate[], error: null };
}

/**
 * Хадгалсны дараах давхардлын шалгалт (бүрэн форм, R15). Шалгалт унтраастай бол [] (RPC ч хоосон буцаана).
 * Хэзээ ч шидэхгүй — давхардал хадгалалтыг зогсоохгүй.
 */
export async function duplicatesAfterSave(supabase: Crm2Supabase, propertyId: string): Promise<Crm2PropertyDuplicate[]> {
  const settings = await getCrm2Settings();
  if (!settings["property.duplicate_check"]) return [];
  const res = await propertyDuplicates(supabase, propertyId);
  if (res.error) {
    console.error("crm2 duplicatesAfterSave:", res.error.message);
    return [];
  }
  return res.rows;
}

export type DuplicateFlagListItem = {
  id: string;
  kind: "distinct" | "access";
  status: string;
  reasons: string[];
  agentNote: string | null;
  flaggedAt: string;
  flaggedBy: string;
  flaggedByName: string | null;
  property: { id: string; code: string | null; status: Crm2PropertyStatus | null };
  /** Харах эрхгүй бол id/код null (шийдвэрлэгч — менежер/ахлагч — ихэвчлэн хардаг). */
  match: { id: string | null; code: string | null; status: Crm2PropertyStatus | null };
};

/**
 * Нээлттэй давхардлын тэмдэглэлүүд (ахлагч, менежерийн дараалал). Агентад ердийн RLS-ээр зөвхөн өөрийн,
 * харах эрхтэй мөр гарна. Хөрөнгийн код зөвхөн RLS-ээр харагдах хөрөнгөнд.
 */
export async function listOpenDuplicateFlags(limit = 100): Promise<DuplicateFlagListItem[]> {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !(ctx.isManager || ctx.isTeamLead)) return [];
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_duplicate_flags")
    .select("id, property_id, match_property_id, reasons, kind, agent_note, status, flagged_by, flagged_at")
    .eq("status", "open")
    .order("flagged_at", { ascending: true })
    .limit(Math.min(Math.max(1, limit), 200));
  if (error) {
    console.error("crm2 listOpenDuplicateFlags:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.property_id, r.match_property_id]).filter((x) => UUID_RE.test(x)))];
  const [props, names] = await Promise.all([
    supabase.from("crm2_properties").select("id, code, status").in("id", ids),
    getStaffNameMap(),
  ]);
  if (props.error) console.error("crm2 listOpenDuplicateFlags props:", props.error.message);
  const byId = new Map((props.data ?? []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.property_id);
    const m = byId.get(r.match_property_id);
    return {
      id: r.id,
      kind: r.kind === "access" ? "access" : "distinct",
      status: r.status,
      reasons: r.reasons ?? [],
      agentNote: r.agent_note ?? null,
      flaggedAt: r.flagged_at,
      flaggedBy: r.flagged_by,
      flaggedByName: names[r.flagged_by] ?? null,
      property: { id: r.property_id, code: p?.code ?? null, status: p?.status ?? null },
      match: { id: m ? r.match_property_id : null, code: m?.code ?? null, status: m?.status ?? null },
    };
  });
}

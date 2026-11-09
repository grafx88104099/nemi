"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  fetchListingForLead,
  LEAD_LISTING_SEARCH_LIMIT,
  LEAD_LISTING_SELECT,
  listingSearchTerms,
  LISTING_UNAVAILABLE_ERR,
  parseListingSnapshot,
  toListingOption,
  toListingSnapshot,
  type LeadListingOption,
  type LeadListingRow,
  type LeadListingSnapshot,
} from "@/lib/crm/lead-listing";
import { validateSetLeadListing } from "@/lib/validation/crm";

/**
 * Сэжмийн зар сонгох, солих. Бүх уншилт, бичилт хэрэглэгчийн client-ээр —
 * харах, засах эрхийг RLS шийднэ.
 */

function revalidateLeadPaths(leadId: string) {
  for (const base of ["/office/crm", "/agent/crm"]) {
    revalidatePath(base);
    revalidatePath(`${base}/leads`);
    revalidatePath(`${base}/listings`);
    revalidatePath(`${base}/leads/${leadId}`);
  }
}

/** nemi.mn-ийн идэвхтэй зарууд — хоосон хайлтад хамгийн сүүлийнх. */
export async function searchListingsForLead(query: string): Promise<LeadListingOption[]> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return [];

  const supabase = await createClient();
  let request = supabase.from("listings").select(LEAD_LISTING_SELECT).eq("status", "active");
  for (const term of listingSearchTerms(typeof query === "string" ? query : "")) {
    request = request.or(`title.ilike.%${term}%,district.ilike.%${term}%,type.ilike.%${term}%`);
  }
  const { data, error } = await request.order("created_at", { ascending: false }).limit(LEAD_LISTING_SEARCH_LIMIT);
  if (error) {
    console.error("searchListingsForLead:", error.message);
    // Хоосон жагсаалт буцаавал агент «зар алга» гэж ойлгоод зар холбохгүй бүртгэнэ.
    throw new Error("Зар хайхад алдаа гарлаа.");
  }
  return ((data ?? []) as unknown as LeadListingRow[]).map(toListingOption);
}

/** Сэжмийн зарыг холбох, солих, эсвэл (null) салгах. */
export async function setLeadListing(
  leadId: string,
  listingId: string | null
): Promise<{ ok: boolean; error?: string; snapshot?: LeadListingSnapshot | null }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: "Та CRM-д бүртгэгдээгүй байна." };

  const parsed = validateSetLeadListing({ leadId, listingId });
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, listing_id, listing_snapshot")
    .eq("id", input.leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
  // Ижил зарыг дахин сонгоход хуулбарыг дарахгүй, зар идэвхгүй болсон ч алдаа заахгүй.
  // Устсан зарын сэжимд listing_id аль хэдийн null тул салгахад хуулбарыг шалгана.
  const unchanged = input.listingId
    ? input.listingId === lead.listing_id
    : !lead.listing_id && !lead.listing_snapshot;
  if (unchanged) return { ok: true, snapshot: parseListingSnapshot(lead.listing_snapshot) };

  let snapshot: LeadListingSnapshot | null = null;
  if (input.listingId) {
    const listing = await fetchListingForLead(supabase, input.listingId, { activeOnly: true });
    if (!listing) return { ok: false, error: LISTING_UNAVAILABLE_ERR };
    snapshot = toListingSnapshot(listing);
  }

  const { error, count } = await supabase
    .from("crm_leads")
    .update({ listing_id: input.listingId, listing_snapshot: snapshot }, { count: "exact" })
    .eq("id", input.leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setLeadListing:", error.message);
    return { ok: false, error: "Хадгалахад алдаа гарлаа. Дахин оролдоно уу." };
  }
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд засах эрх алга." };

  // crm_lead_field_audit trigger энэ талбарыг бүртгэдэггүй.
  const { error: auditError } = await supabase.rpc("crm_write_audit", {
    p_office: ctx.officeId,
    p_entity: "crm_leads",
    p_entity_id: input.leadId,
    p_action: "update",
    p_field: "listing_id",
    p_old: lead.listing_id,
    p_new: input.listingId,
    p_reason: null,
  });
  if (auditError) console.error("setLeadListing audit:", auditError.message);

  revalidateLeadPaths(input.leadId);
  return { ok: true, snapshot };
}

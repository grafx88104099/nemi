import { createClient } from "@/lib/supabase/server";
import {
  groupLeadsByListing,
  LEAD_LIVE_LISTING_FIELDS,
  listingSearchTerms,
  type LeadListingGroup,
  type LeadListingInfo,
  type LeadListingSourceRow,
} from "@/lib/crm/lead-listing";
import type { CrmLifecycle } from "@/lib/constants-crm";

/**
 * Сэжмийг зараар нь харах. RLS = эрхийн давхарга: агент зөвхөн өөрийн
 * сэжимтэй зарыг, удирдлага компанийн бүх сэжимтэй зарыг харна.
 */

const LEAD_LISTINGS_SELECT =
  "id, status, created_at, listing_id, listing_snapshot, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name), " +
  `live:listings!crm_leads_listing_id_fkey(${LEAD_LIVE_LISTING_FIELDS})`;

const LEAD_LISTINGS_LIMIT = 1000;

type RawLeadListing = Omit<LeadListingSourceRow, "live_status" | "live_listing" | "contact_name" | "owner_name"> & {
  owner: { full_name: string | null } | null;
  contact: { display_name: string } | null;
  live: (LeadListingInfo & { status: string }) | null;
};

export type LeadListingFilters = {
  /** Зарын гарчиг, дүүрэг, төрлөөр хайх. */
  q?: string;
  ownerId?: string;
  status?: CrmLifecycle;
  /** Зөвхөн нээлттэй (шинэ, идэвхтэй) сэжимтэй зарууд. */
  openOnly?: boolean;
};

export async function getLeadListings(filters: LeadListingFilters = {}): Promise<LeadListingGroup[]> {
  const supabase = await createClient();
  // Зар устахад listing_id null болдог ч хуулбар үлддэг — тэдгээрийг мөн харуулна.
  let query = supabase
    .from("crm_leads")
    .select(LEAD_LISTINGS_SELECT)
    .or("listing_id.not.is.null,listing_snapshot.not.is.null");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(LEAD_LISTINGS_LIMIT);
  if (error) {
    console.error("getLeadListings:", error.message);
    return [];
  }

  let groups = groupLeadsByListing(
    ((data ?? []) as unknown as RawLeadListing[]).map(({ owner, contact, live, ...rest }) => ({
      ...rest,
      live_status: live?.status ?? null,
      live_listing: live,
      contact_name: contact?.display_name ?? "?",
      owner_name: owner?.full_name ?? null,
    }))
  );

  if (filters.openOnly) groups = groups.filter((g) => g.open_lead_count > 0);
  const terms = listingSearchTerms(filters.q ?? "").map((t) => t.toLowerCase());
  if (terms.length > 0) {
    groups = groups.filter((g) => {
      const haystack = [g.listing?.title, g.listing?.district, g.listing?.type].join(" ").toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }
  return groups;
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ListingStatus, DealType } from "@/lib/constants";
import { validateListingInput } from "@/lib/validation/listing";

const SAVE_ERR = "Зар хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

export type ListingInput = {
  title: string;
  type: string;
  district: string;
  rooms: number;
  area: number;
  floor: string;
  price: number;
  year: number;
  parking: number;
  description: string;
  amenities: string[];
  photos: string[];
  status: ListingStatus;
  deal_type: DealType;
  rent_advance_months: number | null;
  rent_deposit_months: number | null;
  lat: number | null;
  lng: number | null;
};

/**
 * lat/lng → PostGIS geography (EWKT). Хоёул тоо байгаа үед л утга буцаана.
 * (validateListingInput аль хэдийн тоо гэдгийг баталгаажуулсан ч давхар хамгаална.)
 */
function pointEWKT(lat: number | null, lng: number | null): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180) return null;
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/** Зарын зургийг атомик RPC-ээр сольж, алдааг буцаана. */
async function savePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  photos: string[]
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("replace_listing_photos", {
    p_listing_id: listingId,
    p_urls: photos,
  });
  if (error) {
    console.error("savePhotos:", error.message);
    return { error: SAVE_ERR };
  }
  return {};
}

async function myAgentId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, agentId: null as string | null, status: null as string | null };
  const { data } = await supabase
    .from("agents")
    .select("id, status")
    .eq("profile_id", user.id)
    .maybeSingle();
  return { supabase, agentId: (data?.id as string) ?? null, status: (data?.status as string) ?? null };
}

export async function createListing(raw: ListingInput): Promise<{ id?: string; error?: string }> {
  const { supabase, agentId, status } = await myAgentId();
  if (!agentId) return { error: "Зөвхөн агент зар оруулна." };
  if (status !== "active") return { error: "Таны бүртгэл оффисын баталгаажуулалт хүлээж байна. Батлагдсаны дараа зар оруулах боломжтой." };

  const parsed = validateListingInput(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;

  const { data, error } = await supabase
    .from("listings")
    .insert({
      agent_id: agentId,
      title: input.title,
      type: input.type,
      district: input.district,
      rooms: input.rooms,
      area: input.area,
      floor: input.floor || "-",
      price: input.price,
      price_per_m2: input.area ? Math.round(input.price / input.area) : null,
      year: input.year || null,
      parking: input.parking,
      description: input.description,
      amenities: input.amenities,
      photo: input.photos[0] || null,
      status: input.status,
      deal_type: input.deal_type,
      rent_advance_months: input.deal_type === "rent" ? input.rent_advance_months : null,
      rent_deposit_months: input.deal_type === "rent" ? input.rent_deposit_months : null,
      location: pointEWKT(input.lat, input.lng),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createListing:", error?.message);
    return { error: SAVE_ERR };
  }

  const photoRes = await savePhotos(supabase, data.id, input.photos);
  if (photoRes.error) return { error: photoRes.error };
  revalidatePath("/agent/listings");
  return { id: data.id };
}

export async function updateListing(id: string, raw: ListingInput): Promise<{ ok: boolean; error?: string }> {
  const { supabase, agentId, status } = await myAgentId();
  if (!agentId) return { ok: false, error: "Зөвхөн агент зар засна." };
  if (status !== "active") return { ok: false, error: "Таны бүртгэл баталгаажаагүй байна." };

  const parsed = validateListingInput(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  // Эзэмшлийг код түвшинд баталгаажуулна (agent_id шүүлт) — RLS дээр дан тулгуурлахгүй.
  const { data, error } = await supabase
    .from("listings")
    .update({
      title: input.title,
      type: input.type,
      district: input.district,
      rooms: input.rooms,
      area: input.area,
      floor: input.floor || "-",
      price: input.price,
      price_per_m2: input.area ? Math.round(input.price / input.area) : null,
      year: input.year || null,
      parking: input.parking,
      description: input.description,
      amenities: input.amenities,
      photo: input.photos[0] || null,
      status: input.status,
      deal_type: input.deal_type,
      rent_advance_months: input.deal_type === "rent" ? input.rent_advance_months : null,
      rent_deposit_months: input.deal_type === "rent" ? input.rent_deposit_months : null,
      location: pointEWKT(input.lat, input.lng),
    })
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  if (error) {
    console.error("updateListing:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!data || data.length === 0) return { ok: false, error: "Зар олдсонгүй эсвэл танд засах эрхгүй." };
  const photoRes = await savePhotos(supabase, id, input.photos);
  if (photoRes.error) return { ok: false, error: photoRes.error };
  revalidatePath("/agent/listings");
  revalidatePath(`/listings/${id}`);
  return { ok: true };
}

export async function deleteListing(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, agentId } = await myAgentId();
  if (!agentId) return { ok: false, error: "Зөвхөн агент зар устгана." };
  const { data, error } = await supabase
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  if (error) {
    console.error("deleteListing:", error.message);
    return { ok: false, error: "Зар устгахад алдаа гарлаа." };
  }
  if (!data || data.length === 0) return { ok: false, error: "Зар олдсонгүй эсвэл танд устгах эрхгүй." };
  revalidatePath("/agent/listings");
  return { ok: true };
}

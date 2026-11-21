"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateListingInput } from "@/lib/validation/listing";
import { validateOwnerContact, validateOwnerRequest, type OwnerRequestInput } from "@/lib/validation/owner";
import type { ListingInput } from "@/lib/actions/listings";

/**
 * Эзэн (энгийн хэрэглэгч) өөрөө зар оруулах ба оффист зуучлуулах хүсэлт.
 * Эзэний зар ХЯНАЛТТАЙ: «Идэвхтэй» болгож чадахгүй — DB-ийн listings_owner_guard
 * хяналтад («review») оруулж, админ баталсны дараа нийтэд гарна.
 */

export type OwnerListingInput = ListingInput & { owner_name: string; owner_phone: string };

const SAVE_ERR = "Зар хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

function pointEWKT(lat: number | null, lng: number | null): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180) return null;
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/** Зөвхөн өөрийн хавтаст (owners/<uid>/) хуулсан зургийг хүлээж авна. */
function ownPhotos(photos: string[], uid: string): string | null {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listings/owners/${uid}/`;
  return photos.every((p) => p.startsWith(base)) ? null : "Зургийг энэ маягтаар хуулна уу.";
}

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, uid: null as string | null, isAgent: false };
  const { data: agent } = await supabase.from("agents").select("id").eq("profile_id", user.id).maybeSingle();
  return { supabase, uid: user.id, isAgent: !!agent };
}

function parse(raw: OwnerListingInput, uid: string) {
  const { owner_name, owner_phone, ...listing } = raw;
  const contact = validateOwnerContact({ owner_name, owner_phone });
  if ("error" in contact) return contact;
  const parsed = validateListingInput(listing);
  if ("error" in parsed) return parsed;
  const photoErr = ownPhotos(parsed.data.photos, uid);
  if (photoErr) return { error: photoErr };
  if (parsed.data.photos.length === 0) return { error: "Дор хаяж нэг зураг оруулна уу." };
  const input = parsed.data;
  return {
    row: {
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
      // Эзэн «ноорог»-оос бусдыг сонговол хяналтад илгээнэ (DB мөн хүчлэнэ).
      status: (input.status === "draft" ? "draft" : input.status === "sold" ? "sold" : "review") as ListingInput["status"],
      deal_type: input.deal_type,
      rent_advance_months: input.deal_type === "rent" ? input.rent_advance_months : null,
      rent_deposit_months: input.deal_type === "rent" ? input.rent_deposit_months : null,
      location: pointEWKT(input.lat, input.lng),
      owner_name: contact.data.owner_name,
      owner_phone: contact.data.owner_phone,
    },
    photos: input.photos,
  };
}

export async function createOwnerListing(raw: OwnerListingInput): Promise<{ id?: string; error?: string }> {
  const { supabase, uid, isAgent } = await me();
  if (!uid) return { error: "Зар оруулахын тулд нэвтэрнэ үү." };
  if (isAgent) return { error: "Агент зараа агентын самбараас оруулна." };
  const p = parse(raw, uid);
  if ("error" in p) return { error: p.error };

  const { data, error } = await supabase
    .from("listings")
    .insert({ ...p.row, owner_id: uid, agent_id: null })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createOwnerListing:", error?.message);
    return { error: SAVE_ERR };
  }
  const { error: phErr } = await supabase.rpc("replace_listing_photos", { p_listing_id: data.id, p_urls: p.photos });
  if (phErr) {
    console.error("createOwnerListing photos:", phErr.message);
    return { error: SAVE_ERR };
  }
  revalidatePath("/my-listings");
  return { id: data.id };
}

export async function updateOwnerListing(id: string, raw: OwnerListingInput): Promise<{ ok: boolean; error?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, error: "Нэвтэрнэ үү." };
  const p = parse(raw, uid);
  if ("error" in p) return { ok: false, error: p.error };

  const { data, error } = await supabase
    .from("listings")
    .update(p.row)
    .eq("id", id)
    .eq("owner_id", uid)
    .is("agent_id", null)
    .select("id");
  if (error) {
    console.error("updateOwnerListing:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!data?.length) return { ok: false, error: "Зар олдсонгүй эсвэл танд засах эрхгүй." };
  const { error: phErr } = await supabase.rpc("replace_listing_photos", { p_listing_id: id, p_urls: p.photos });
  if (phErr) return { ok: false, error: SAVE_ERR };
  revalidatePath("/my-listings");
  revalidatePath(`/listings/${id}`);
  return { ok: true };
}

export async function deleteOwnerListing(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, error: "Нэвтэрнэ үү." };
  const { data, error } = await supabase
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("owner_id", uid)
    .is("agent_id", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Устгаж чадсангүй." };
  revalidatePath("/my-listings");
  return { ok: true };
}

/**
 * Оффист зуучлуулах хүсэлт. Нэвтрэхгүйгээр ч илгээж болно (эзэнд саад
 * багатай) — тиймээс серверээс (service role) оруулж, нэг утаснаас 24 цагт
 * 3-аас олон хүсэлт хүлээж авахгүй.
 */
export async function submitOwnerRequest(raw: OwnerRequestInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = validateOwnerRequest(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: office } = await admin
    .from("offices")
    .select("id")
    .eq("id", input.office_id)
    .is("suspended_at", null)
    .gt("listings_count", 0)
    .maybeSingle();
  if (!office) return { ok: false, error: "Оффис олдсонгүй." };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from("owner_requests")
    .select("id", { count: "exact", head: true })
    .eq("contact_phone", input.contact_phone)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    return { ok: false, error: "Энэ дугаараас өнөөдөр хангалттай хүсэлт ирсэн байна. Оффис тантай удахгүй холбогдоно." };
  }

  const { error } = await admin.from("owner_requests").insert({ ...input, user_id: user?.id ?? null });
  if (error) {
    console.error("submitOwnerRequest:", error.message);
    return { ok: false, error: "Хүсэлт илгээхэд алдаа гарлаа. Дахин оролдоно уу." };
  }
  return { ok: true };
}

/** Оффисын админ: хүсэлтийн төлөв (DB зөвхөн өөрийн оффисынхыг зөвшөөрнө). */
export async function setOwnerRequestStatus(
  id: string,
  status: "new" | "contacted" | "closed"
): Promise<{ ok: boolean; error?: string }> {
  if (!["new", "contacted", "closed"].includes(status)) return { ok: false, error: "Төлөв буруу." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("owner_requests").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Шинэчилж чадсангүй." };
  revalidatePath("/office/owner-requests");
  return { ok: true };
}

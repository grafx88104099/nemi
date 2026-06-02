"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

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
  status: "active" | "draft" | "review";
};

async function savePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  photos: string[]
) {
  await supabase.from("listing_photos").delete().eq("listing_id", listingId);
  if (photos.length) {
    await supabase.from("listing_photos").insert(
      photos.map((url, i) => ({ listing_id: listingId, url, sort_order: i, is_primary: i === 0 }))
    );
  }
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

export async function createListing(input: ListingInput): Promise<{ id?: string; error?: string }> {
  const { supabase, agentId, status } = await myAgentId();
  if (!agentId) return { error: "Зөвхөн агент зар оруулна." };
  if (status !== "active") return { error: "Таны бүртгэл оффисын баталгаажуулалт хүлээж байна. Батлагдсаны дараа зар оруулах боломжтой." };

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
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await savePhotos(supabase, data.id, input.photos);
  revalidatePath("/agent/listings");
  return { id: data.id };
}

export async function updateListing(id: string, input: ListingInput): Promise<{ ok: boolean; error?: string }> {
  const { supabase, agentId, status } = await myAgentId();
  if (!agentId) return { ok: false, error: "auth" };
  if (status !== "active") return { ok: false, error: "Таны бүртгэл баталгаажаагүй байна." };
  const { error } = await supabase
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
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await savePhotos(supabase, id, input.photos);
  revalidatePath("/agent/listings");
  revalidatePath(`/listings/${id}`);
  return { ok: true };
}

export async function deleteListing(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/agent/listings");
  return { ok: true };
}

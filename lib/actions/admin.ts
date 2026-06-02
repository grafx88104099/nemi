"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "forbidden" as const };
  return { supabase };
}

export async function setUserRole(
  userId: string,
  role: "buyer" | "agent" | "office_admin" | "admin"
) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { error } = await ctx.supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setListingStatus(
  id: string,
  status: "active" | "draft" | "review" | "sold"
) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { error } = await ctx.supabase.from("listings").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/listings");
  return { ok: true };
}

export async function deleteListingAdmin(id: string) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { error } = await ctx.supabase.from("listings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/listings");
  return { ok: true };
}

// setVerified нэгтгэгдсэн — lib/actions/offices.ts-ийн setVerified ашиглана (RLS-д тулгуурласан).

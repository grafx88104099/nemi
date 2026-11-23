"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/crm2/phone";
import { isMnPhoneDigits, phoneVerifyPatch } from "@/lib/auth/phone-login";

/**
 * R09 Stage 2 — утсаар (verifyOtp) амжилттай нэвтэрсний дараа дуудна.
 * GoTrue-гийн баталгаажуулсан auth утсыг (клиентийн оролт БИШ) зөвхөн өөрийн
 * профайлд бичнэ — миграцын backfill-тэй ижил нөхцөлөөр (phoneVerifyPatch):
 * профайлын утас хоосон → phone + phone_verified_at; ижил дугаар → зөвхөн
 * phone_verified_at; ӨӨР дугаар → юу ч бичихгүй (хэрэглэгчийн хадгалсан холбоо
 * барих дугаарыг дарж бичихгүй, баталгаажуулалт NULL хэвээр).
 *
 * Service role-оор бичнэ: trg_guard_profile_phone_verified нь хэрэглэгч/админы
 * бичилтийг phone_verified_at-аас хамгаалдаг, service role-д bypass өгнө.
 *
 * Update нь уншсан утсаар нөхцөлтэй (дунд нь профайлаа засвал юу ч бичихгүй).
 */
export async function markPhoneVerified(): Promise<{ ok: boolean }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.phone || !user.phone_confirmed_at) return { ok: false };

  const digits = normalizePhone(user.phone);
  if (!isMnPhoneDigits(digits)) return { ok: false };

  const admin = createAdminClient();
  const { data: profile, error: readErr } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();
  if (readErr || !profile) return { ok: false };

  const patch = phoneVerifyPatch(profile.phone, digits, new Date().toISOString());
  if (!patch) return { ok: false };

  let q = admin.from("profiles").update(patch).eq("id", user.id);
  q = profile.phone == null ? q.is("phone", null) : q.eq("phone", profile.phone);
  const { error } = await q;

  revalidatePath("/account");
  return { ok: !error };
}

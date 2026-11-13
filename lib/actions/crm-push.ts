"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { isPushConfigured, parsePushSubscription, sendPushToProfiles, upsertPushSubscription } from "@/lib/crm/push";

/**
 * Web Push захиалга (R4 клиент): төхөөрөмж бүрийн захиалгыг хадгалж,
 * CRM-ийн гол мэдэгдлүүдэд хувийн сонголтод «push» сувгийг
 * нэмнэ (тохиргоо 'push_defaults'). Заавал ангиллын мэдэгдэл матрицаар
 * аль хэдийн push-аар очдог.
 */

const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const SAVE_ERR = "Мэдэгдлийг асаахад алдаа гарлаа. Дахин оролдоно уу.";

const FALLBACK_EVENTS = [
  "lead_assigned",
  "lead_sla_breach",
  "lead_retry_due",
  "lead_no_contact_48h",
  "hot_lead_inactive",
  "showing_feedback_due",
  "offer_expiring",
  "match_found",
];

async function pushEvents(): Promise<string[]> {
  const raw = await getSettingValue<{ events?: unknown }>("push_defaults");
  const list = Array.isArray(raw?.events)
    ? raw.events.filter((e): e is string => typeof e === "string" && /^[a-z0-9_]{2,60}$/.test(e))
    : [];
  return list.length ? list.slice(0, 40) : FALLBACK_EVENTS;
}

export async function getPushServerStatus(): Promise<{ configured: boolean; publicKey: string | null }> {
  const key = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "").trim();
  return { configured: isPushConfigured() && !!key, publicKey: key || null };
}

export async function savePushSubscription(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!isPushConfigured()) return { ok: false, error: "Мэдэгдлийн сервер тохируулагдаагүй байна. Системийн админд хандана уу." };
  const sub = parsePushSubscription(raw);
  if (!sub) return { ok: false, error: "Төхөөрөмжийн захиалга буруу байна. Хуудсыг дахин ачаалж оролдоно уу." };
  const ua = (await headers()).get("user-agent");
  const admin = createAdminClient();
  const res = await upsertPushSubscription(admin, ctx.profileId, sub, ua);
  if (!res.ok) return { ok: false, error: SAVE_ERR };

  // Хувийн сонголтод «push» нэмнэ (апп доторх мэдэгдлийг хаасан сонголтыг хадгална).
  const supabase = await createClient();
  const events = await pushEvents();
  const { data: prefs, error } = await supabase
    .from("crm_notification_prefs")
    .select("event_code, channels")
    .eq("profile_id", ctx.profileId)
    .in("event_code", events);
  if (error) {
    console.error("savePushSubscription prefs:", error.message);
    return { ok: true };
  }
  const existing = new Map((prefs ?? []).map((p) => [p.event_code, (p.channels as string[]) ?? []]));
  const rows = events
    .map((event_code) => {
      const cur = existing.get(event_code);
      const channels = cur ? [...new Set([...cur, "push"])] : ["app", "push"];
      return { profile_id: ctx.profileId, office_id: ctx.officeId, event_code, channels };
    })
    .filter((r) => !(existing.get(r.event_code) ?? []).includes("push"));
  if (rows.length) {
    const { error: upErr } = await supabase
      .from("crm_notification_prefs")
      .upsert(rows, { onConflict: "profile_id,event_code" });
    if (upErr) console.error("savePushSubscription upsert prefs:", upErr.message);
  }
  return { ok: true };
}

/** Энэ төхөөрөмжийн захиалгыг идэвхгүй болгоно (бусад төхөөрөмж хэвээр). */
export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return { ok: false, error: "Захиалга олдсонгүй." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("crm_push_subscriptions")
    .delete()
    .eq("profile_id", ctx.profileId)
    .eq("endpoint", endpoint);
  if (error) {
    console.error("removePushSubscription:", error.message);
    return { ok: false, error: "Мэдэгдлийг унтраахад алдаа гарлаа." };
  }
  return { ok: true };
}

/** Өөрийн төхөөрөмж рүү туршилтын мэдэгдэл (зөвхөн дуудагчид). */
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!isPushConfigured()) return { ok: false, error: "Мэдэгдлийн сервер тохируулагдаагүй байна." };
  const sent = await sendPushToProfiles(createAdminClient(), [ctx.profileId], {
    title: "Nemi CRM",
    body: "Туршилтын мэдэгдэл — дэлгэц хаалттай үед ч шинэ сэжмийн мэдэгдэл ирнэ.",
    url: "/agent/crm",
    tag: "push_test",
  });
  return sent > 0 ? { ok: true } : { ok: false, error: "Идэвхтэй төхөөрөмж олдсонгүй. Мэдэгдлийг дахин асаана уу." };
}

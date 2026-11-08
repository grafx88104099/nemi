"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { setTaskStatus } from "@/lib/actions/tasks";
import { normalizeTodaySettings, snoozeError, snoozeUntil, ubDayBounds, ubIso, type TodayKind } from "@/lib/crm/today";

/**
 * Өнөөдрийн дараалал (R16), ажлын цуваа (R13), нэгдсэн хайлт (R29).
 * Бүх бичилт RLS/RPC-ээр — дуудагчийн эрхээс хэтрэхгүй.
 */

const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TODAY_KINDS: TodayKind[] = ["sla", "accept", "lead_step", "opp_step", "feedback", "task", "showing", "meeting"];

function revalidateToday() {
  revalidatePath("/agent/crm");
  revalidatePath("/agent/crm/worklists");
}

function dbMessage(message: string): string {
  const idx = message.indexOf("CRM:");
  if (idx !== -1) return message.slice(idx).replace(/^CRM:\s*/, "").trim() || SAVE_ERR;
  if (message.includes("row-level security")) return "Танд энэ үйлдлийг хийх эрх алга.";
  if (message.includes("does not exist")) return "Энэ боломж идэвхжээгүй байна (өгөгдлийн сангийн шинэчлэл хүлээгдэж байна).";
  return SAVE_ERR;
}

// ── Хойшлуулах ─────────────────────────────────────────────

export async function snoozeTodayItem(input: {
  kind: TodayKind;
  id: string;
  hours: number;
  reason?: string | null;
}): Promise<{ ok: boolean; error?: string; until?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!TODAY_KINDS.includes(input.kind) || !UUID.test(input.id)) return { ok: false, error: "Мөр олдсонгүй." };
  const settings = normalizeTodaySettings(await getSettingValue("today_queue"));
  const supabase = await createClient();
  const now = new Date();
  const { start } = ubDayBounds(ubIso(now));
  const { count } = await supabase
    .from("crm_today_snoozes")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", ctx.profileId)
    .gte("created_at", start);
  const err = snoozeError(input.kind, Number(input.hours), settings, count ?? 0);
  if (err) return { ok: false, error: err };
  const until = snoozeUntil(now, Number(input.hours)).toISOString();
  const { error } = await supabase.from("crm_today_snoozes").insert({
    office_id: ctx.officeId,
    profile_id: ctx.profileId,
    item_kind: input.kind,
    item_id: input.id,
    until,
    reason: input.reason?.trim().slice(0, 200) || null,
  });
  if (error) {
    console.error("snoozeTodayItem:", error.message);
    return { ok: false, error: dbMessage(error.message) };
  }
  revalidateToday();
  return { ok: true, until };
}

/** Энгийн даалгаврыг «Хийсэн» болгоно. */
export async function completeTodayTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!UUID.test(taskId)) return { ok: false, error: "Даалгавар олдсонгүй." };
  const supabase = await createClient();
  const { data: link } = await supabase
    .from("crm_task_links")
    .select("rule_code")
    .eq("task_id", taskId)
    .in("rule_code", ["D-01", "D-03", "D-04"])
    .maybeSingle();
  if (link) return { ok: false, error: "Эхний холболтын даалгавар нь холболтын бүртгэлээр хаагдана — «Үр дүн бүртгэх»-ийг ашиглана уу." };
  const res = await setTaskStatus(taskId, "completed");
  if (res.ok) revalidateToday();
  return res;
}

// ── Ажлын цуваа (R13) ──────────────────────────────────────

export async function enrollTrack(input: {
  templateId: string;
  leadId?: string | null;
  opportunityId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  const leadId = input.leadId && UUID.test(input.leadId) ? input.leadId : null;
  const oppId = input.opportunityId && UUID.test(input.opportunityId) ? input.opportunityId : null;
  if (!UUID.test(input.templateId) || (!leadId && !oppId)) return { error: "Загвар болон сэжим/боломжийг сонгоно уу." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_track_enroll", {
    p_template: input.templateId,
    p_lead: leadId,
    p_opportunity: leadId ? null : oppId,
  });
  if (error) {
    console.error("enrollTrack:", error.message);
    return { error: dbMessage(error.message) };
  }
  revalidateToday();
  revalidatePath("/agent/crm/worklists/tracks");
  if (leadId) revalidatePath(`/agent/crm/leads/${leadId}`);
  if (oppId) revalidatePath(`/agent/crm/pipeline/${oppId}`);
  return { id: data as string };
}

export async function stopTrack(enrollmentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!UUID.test(enrollmentId)) return { ok: false, error: "Ажлын цуваа олдсонгүй." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_track_stop", { p_enrollment: enrollmentId });
  if (error) {
    console.error("stopTrack:", error.message);
    return { ok: false, error: dbMessage(error.message) };
  }
  revalidateToday();
  revalidatePath("/agent/crm/worklists/tracks");
  return { ok: true };
}

// ── Нэгдсэн хайлт (R29) ────────────────────────────────────

export type SearchHit = {
  kind: "contact" | "lead" | "property" | "transaction";
  id: string;
  label: string;
  sub: string | null;
  href: string;
};

function term(q: string): string {
  return q.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Утас, нэр, дугаараар — RLS-ийн хүрээнд (харах эрхгүй бүртгэл гарахгүй). */
export async function searchCrm(q: string, basePath: string = "/agent/crm"): Promise<SearchHit[]> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return [];
  const base = basePath === "/office/crm" ? "/office/crm" : "/agent/crm";
  const t = term(typeof q === "string" ? q : "");
  if (t.length < 2) return [];
  const digits = t.replace(/\D/g, "");
  const supabase = await createClient();

  const [phoneRes, contactRes, propRes, txnRes] = await Promise.all([
    digits.length >= 4
      ? supabase
          .from("crm_contact_phones")
          .select("contact_id, raw, contact:crm_contacts!inner(id, display_name, number, merged_into_id)")
          .ilike("normalized", `%${digits}%`)
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("crm_contacts")
      .select("id, display_name, number")
      .is("merged_into_id", null)
      .or(`display_name.ilike.%${t}%,number.ilike.%${t}%`)
      .limit(8),
    supabase.from("crm_properties").select("id, number, name").or(`number.ilike.%${t}%,name.ilike.%${t}%`).limit(6),
    supabase.from("crm_transactions").select("id, number, status").ilike("number", `%${t}%`).limit(5),
  ]);
  for (const r of [phoneRes, contactRes, propRes, txnRes]) if (r.error) console.error("searchCrm:", r.error.message);

  const contacts = new Map<string, { label: string; sub: string | null }>();
  for (const p of (phoneRes.data ?? []) as unknown as {
    contact_id: string;
    raw: string;
    contact: { display_name: string; number: string; merged_into_id: string | null } | null;
  }[]) {
    if (!p.contact || p.contact.merged_into_id) continue;
    contacts.set(p.contact_id, { label: p.contact.display_name, sub: `${p.contact.number} · ${p.raw}` });
  }
  for (const c of contactRes.data ?? []) {
    if (!contacts.has(c.id)) contacts.set(c.id, { label: c.display_name, sub: c.number });
  }

  const hits: SearchHit[] = [];
  const ids = [...contacts.keys()];
  if (ids.length) {
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, contact_id, status")
      .in("contact_id", ids)
      .in("status", ["new", "active"])
      .limit(20);
    const leadOf = new Map((leads ?? []).map((l) => [l.contact_id, l.id]));
    for (const [id, c] of contacts) {
      const leadId = leadOf.get(id);
      if (leadId) hits.push({ kind: "lead", id: leadId, label: c.label, sub: `Нээлттэй сэжим · ${c.sub ?? ""}`, href: `${base}/leads/${leadId}` });
      hits.push({ kind: "contact", id, label: c.label, sub: c.sub, href: `${base}/contacts/${id}` });
    }
  }
  for (const p of propRes.data ?? []) {
    hits.push({ kind: "property", id: p.id, label: p.name || p.number, sub: p.number, href: `${base}/properties/${p.id}` });
  }
  for (const x of txnRes.data ?? []) {
    hits.push({ kind: "transaction", id: x.id, label: x.number, sub: "Хэлцлийн хавтас", href: `${base}/transactions/${x.id}` });
  }
  return hits.slice(0, 20);
}

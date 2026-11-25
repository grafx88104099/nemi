"use server";

import { revalidatePath } from "next/cache";
import { expirePublicListings } from "@/lib/listings-cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOfficeApproved } from "@/lib/email/resend";
import { getOffboardingBlockers, offboardingBlockMessage } from "@/lib/crm2/offboarding";
import {
  agentStatusToast,
  isMissingRpc,
  legacyStatusNotice,
  mapAgentStatusError,
  parseCrmChange,
  type AgentCrmChange,
} from "@/lib/office/agent-status";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireRole(role: "admin" | "office_admin" | "any") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .single();
  if (role !== "any" && profile?.role !== role && profile?.role !== "admin") {
    return { error: "forbidden" as const };
  }
  return { user, profile, supabase };
}

/** Хэрэглэгч оффис нээх хүсэлт гаргана. */
export async function requestOffice(input: { name: string; phone: string; note: string }) {
  const ctx = await requireRole("any");
  if ("error" in ctx) return ctx;
  // Аль хэдийн оффисын админ/админ бол давхар оффис нээхийг хориглоно
  if (ctx.profile?.role === "office_admin" || ctx.profile?.role === "admin") {
    return { error: "Та аль хэдийн оффисын удирдлагатай байна." };
  }
  // Хүлээгдэж буй хүсэлт давхар гаргахыг хориглоно
  const { data: existing } = await ctx.supabase
    .from("office_requests")
    .select("id")
    .eq("requester_id", ctx.user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return { error: "Танд хүлээгдэж буй хүсэлт байна." };

  const { error } = await ctx.supabase.from("office_requests").insert({
    requester_id: ctx.user.id,
    name: input.name,
    phone: input.phone || null,
    note: input.note || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/office-signup");
  return { ok: true };
}

/** Админ оффис нээх хүсэлтийг батална → оффис үүсч, хүсэгч office_admin болно. */
export async function approveOfficeRequest(requestId: string) {
  const ctx = await requireRole("admin");
  if ("error" in ctx) return ctx;
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("office_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!req || req.status !== "pending") return { error: "not_found" };

  const initials = req.name.trim().slice(0, 2).toUpperCase();
  const { data: office, error: oErr } = await admin
    .from("offices")
    .insert({ name: req.name, logo: initials, color: "#C2410C", verified: true })
    .select("id")
    .single();
  if (oErr) return { error: oErr.message };

  // Хүсэгч өөр оффисын идэвхтэй агент байсан бол тэр гишүүнчлэлийг идэвхгүй болгож
  // profile/agent зөрүүг арилгана (одоо тэр оффисын админ болж байгаа).
  await admin.from("agents").update({ status: "rejected" }).eq("profile_id", req.requester_id);

  await admin.from("profiles").update({ role: "office_admin", office_id: office.id }).eq("id", req.requester_id);
  await admin
    .from("office_requests")
    .update({ status: "approved", office_id: office.id, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  await admin.from("notifications").insert({
    user_id: req.requester_id,
    type: "office",
    title: "Оффис баталгаажлаа",
    body: `«${req.name}» оффис нээгдлээ. Та одоо агентуудаа бүртгэх боломжтой.`,
    link: "/office",
  });

  // Хүсэгчийн и-мэйл рүү оффисоор нэвтрэх линктэй имэйл илгээх
  let emailed = false;
  const { data: requester } = await admin.auth.admin.getUserById(req.requester_id);
  const to = requester?.user?.email;
  if (to) {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nemi.mn";
    const res = await sendOfficeApproved({
      to,
      officeName: req.name,
      loginUrl: `${site}/office/login`,
    });
    emailed = res.sent;
  }

  revalidatePath("/admin");
  return { ok: true, emailed };
}

export async function rejectOfficeRequest(requestId: string) {
  const ctx = await requireRole("admin");
  if ("error" in ctx) return ctx;
  const admin = createAdminClient();
  await admin
    .from("office_requests")
    .update({ status: "rejected", reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  revalidatePath("/admin");
  return { ok: true };
}

/** Оффисын тохиргоо: нэр, лого, өнгө, холбоо барих. */
export async function updateMyOffice(input: {
  name: string;
  logo: string;
  color: string;
  phone: string;
  email: string;
  address: string;
}) {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return ctx;
  const officeId = ctx.profile?.office_id;
  if (!officeId) return { error: "no_office" };
  const { error } = await ctx.supabase
    .from("offices")
    .update({
      name: input.name,
      logo: input.logo.slice(0, 3).toUpperCase(),
      color: input.color,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
    })
    .eq("id", officeId);
  if (error) return { error: error.message };
  revalidatePath("/office");
  revalidatePath("/office/settings");
  return { ok: true };
}

/** Оффисын агентуудын зарын зурагт лого тамга дарах эсэхийг асаах/унтраах. */
export async function updateMyOfficeWatermark(enabled: boolean) {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return ctx;
  const officeId = ctx.profile?.office_id;
  if (!officeId) return { error: "no_office" };
  const { error } = await ctx.supabase
    .from("offices")
    .update({ watermark_enabled: enabled })
    .eq("id", officeId);
  if (error) {
    console.error("updateMyOfficeWatermark:", error.message);
    return { error: "Тохиргоо хадгалахад алдаа гарлаа. Дахин оролдоно уу." };
  }
  revalidatePath("/office/settings");
  revalidatePath("/agent/listings", "layout");
  return { ok: true };
}

/** Тамганы тусгай лого (хоосон бол оффисын үндсэн лого хэрэглэгдэнэ). */
export async function updateMyOfficeWatermarkLogo(url: string) {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return ctx;
  const officeId = ctx.profile?.office_id;
  if (!officeId) return { error: "no_office" };
  const value = url.trim();
  if (value && !/^https:\/\/[^\s]+$/.test(value)) return { error: "Логоны холбоос буруу байна." };
  const { error } = await ctx.supabase
    .from("offices")
    .update({ watermark_logo_url: value || null })
    .eq("id", officeId);
  if (error) {
    console.error("updateMyOfficeWatermarkLogo:", error.message);
    return { error: "Тохиргоо хадгалахад алдаа гарлаа. Дахин оролдоно уу." };
  }
  revalidatePath("/office/settings");
  revalidatePath("/agent/listings", "layout");
  return { ok: true };
}

/** Оффисын баялаг танилцуулга — лого/ковер, сошл, тусгай чиглэл, бүс г.м. */
export async function updateMyOfficeAbout(input: {
  description: string;
  about: string;
  website: string;
  founded_year: string;
  license_no: string;
  facebook: string;
  instagram: string;
  logo_url: string;
  cover_url: string;
  specialties: string[];
  service_areas: string[];
}) {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return ctx;
  const officeId = ctx.profile?.office_id;
  if (!officeId) return { error: "no_office" };
  const year = parseInt(input.founded_year, 10);
  const { error } = await ctx.supabase
    .from("offices")
    .update({
      description: input.description || null,
      about: input.about || null,
      website: input.website || null,
      founded_year: Number.isFinite(year) ? year : null,
      license_no: input.license_no || null,
      facebook: input.facebook || null,
      instagram: input.instagram || null,
      logo_url: input.logo_url || null,
      cover_url: input.cover_url || null,
      specialties: input.specialties.map((s) => s.trim()).filter(Boolean),
      service_areas: input.service_areas.map((s) => s.trim()).filter(Boolean),
    })
    .eq("id", officeId);
  if (error) return { error: error.message };
  revalidatePath("/office");
  revalidatePath("/office/about");
  return { ok: true };
}

/** Оффисын админ агентын урилгын линк (token) үүсгэнэ — 14 хоног хүчинтэй. */
export async function createOfficeInvite(): Promise<{ token?: string; error?: string }> {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return ctx;
  const officeId = ctx.profile?.office_id;
  if (!officeId) return { error: "no_office" };
  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await ctx.supabase
    .from("office_invites")
    .insert({ token, office_id: officeId, created_by: ctx.user.id, expires_at: expires });
  if (error) return { error: error.message };
  revalidatePath("/office/agents");
  return { token };
}

/** Нэгдсэн verified toggle — RLS-ээр хамгаалагдсан (office_admin өөрийн оффист, admin бүгдэд). */
export async function setVerified(
  table: "agents" | "listings" | "offices",
  id: string,
  verified: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const { error } = await supabase.from(table).update({ verified }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/office");
  revalidatePath("/office/agents");
  revalidatePath("/office/listings");
  revalidatePath("/admin");
  expirePublicListings();
  return { ok: true };
}

/**
 * Оффисын админ (эсвэл админ) агентыг батална / татгалзана / идэвхгүй болгоно / дахин идэвхжүүлнэ.
 *
 * CRM-ийн эрх агентын төлөвтэй НЭГ транзакцид таарна (office_set_agent_status RPC):
 * «Идэвхгүй» → crm_staff.is_active=false (CRM-д нэвтрэхгүй, ахлагч/багийн чат цэвэрлэгдэнэ,
 * мэдэгдэл/сануулга ирэхгүй); «Дахин идэвхжүүлэх» → өмнөх crm_staff мөрийг сэргээнэ; CRM
 * ашигладаг оффист «Батлах» → crm_staff (agent) нэмнэ. Эрх (панелийн админ, өөрийн оффис),
 * аудит, агентад очих мэдэгдэл — DB талд.
 */
export async function setAgentStatus(
  agentId: string,
  status: "active" | "rejected"
): Promise<{ ok: true; crm: AgentCrmChange; message: string } | { error: string }> {
  const ctx = await requireRole("office_admin");
  if ("error" in ctx) return { error: ctx.error === "auth" ? "Нэвтэрнэ үү." : "Танд энэ агентыг удирдах эрх алга." };
  if (!UUID_RE.test(agentId) || (status !== "active" && status !== "rejected")) return { error: "Мэдээлэл буруу байна." };
  // CRM-ийн хүлээлцэх шалгалт (дэлгэрэнгүй мессеж): нээлттэй Staff хэлцэл эсвэл Staff хөрөнгийн
  // үүрэгтэй ажилтныг идэвхгүй болгохгүй. DB (crm_staff_deactivate_guard) ч мөн хориглоно.
  if (status === "rejected") {
    const { data: target } = await ctx.supabase.from("agents").select("profile_id").eq("id", agentId).maybeSingle();
    if (target?.profile_id) {
      const b = await getOffboardingBlockers(createAdminClient(), target.profile_id);
      const blocked = "error" in b ? b.error : offboardingBlockMessage(b, "disable");
      if (blocked) return { error: blocked };
    }
  }
  const { data, error } = await ctx.supabase.rpc("office_set_agent_status", { p_agent: agentId, p_status: status });
  let crm: AgentCrmChange;
  if (error && isMissingRpc(error)) {
    // Миграц 20261125000200 тавигдаагүй (код түрүүлж deploy хийгдсэн) — хуучин зам (CRM-ийн эрхийг
    // хөндөхгүй), оффисын админыг хориглохгүй. Миграцыг тавьсны дараа энэ салаа ажиллахгүй.
    console.warn("office_set_agent_status алга — хуучин замаар (migration 20261125000200 тавигдаагүй)");
    const legacy = await legacySetAgentStatus(ctx.supabase, agentId, status);
    if ("error" in legacy) return legacy;
    crm = "none";
  } else if (error) {
    console.error("office_set_agent_status:", error.message);
    return { error: mapAgentStatusError(error.message) };
  } else {
    crm = parseCrmChange(data);
  }

  revalidatePath("/office");
  revalidatePath("/office/agents");
  revalidatePath(`/office/agents/${agentId}`);
  revalidatePath("/office/crm/settings/staff");
  revalidatePath("/admin");
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  expirePublicListings(); // идэвхгүй агентын зар нүүрний «Онцлох»-оос гарна (RLS)
  return { ok: true, crm, message: agentStatusToast(status, crm) };
}

/** RPC-гүй (миграцаас өмнөх) зам: can_manage_agent RLS-ээр төлөв + агентад мэдэгдэл. */
async function legacySetAgentStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  status: "active" | "rejected"
): Promise<{ ok: true } | { error: string }> {
  const { data: before } = await supabase.from("agents").select("profile_id, status").eq("id", agentId).maybeSingle();
  if (!before) return { error: "Агент олдсонгүй." };
  const { data: rows, error } = await supabase.from("agents").update({ status }).eq("id", agentId).select("id");
  if (error) {
    console.error("setAgentStatus (legacy):", error.message);
    return { error: mapAgentStatusError(error.message) };
  }
  if (!rows?.length) return { error: "Танд энэ агентыг удирдах эрх алга." };
  if (before.profile_id && before.status !== status) {
    const n = legacyStatusNotice(before.status as string | null, status);
    const { error: nErr } = await createAdminClient()
      .from("notifications")
      .insert({ user_id: before.profile_id, type: "agent", title: n.title, body: n.body, link: "/agent" });
    if (nErr) console.error("setAgentStatus (legacy) notify:", nErr.message);
  }
  return { ok: true };
}

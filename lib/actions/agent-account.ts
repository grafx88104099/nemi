"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAgentInvite } from "@/lib/email/resend";

/** Office_admin (эсвэл admin) эсэхийг шалгаж office_id буцаана. */
async function requireOffice() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" as const };
  const { data: profile } = await supabase.from("profiles").select("role, office_id").eq("id", user.id).single();
  if ((profile?.role !== "office_admin" && profile?.role !== "admin") || !profile?.office_id) {
    return { error: "forbidden" as const };
  }
  return { officeId: profile.office_id as string };
}

/** Дуудагч нь тухайн агентыг удирдах эрхтэй эсэхийг шалгаад admin client + agent буцаана. */
async function guard(agentId: string) {
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
  if (profile?.role !== "office_admin" && profile?.role !== "admin") return { error: "forbidden" as const };

  const admin = createAdminClient();
  const { data: agent } = await admin
    .from("agents")
    .select("id, profile_id, office_id, display_name")
    .eq("id", agentId)
    .single();
  if (!agent) return { error: "not_found" as const };
  // office_admin зөвхөн өөрийн оффист; admin бүгдэд
  if (profile.role !== "admin" && agent.office_id !== profile.office_id) return { error: "forbidden" as const };
  return { admin, agent };
}

function tempPassword() {
  return "Nemi-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** Агентын нэвтрэлтийн төлөв (display). */
export async function getAgentAccount(agentId: string): Promise<{
  hasLogin: boolean;
  email: string | null;
  banned: boolean;
} | null> {
  const ctx = await guard(agentId);
  if ("error" in ctx) return null;
  if (!ctx.agent.profile_id) return { hasLogin: false, email: null, banned: false };
  const { data } = await ctx.admin.auth.admin.getUserById(ctx.agent.profile_id);
  const u = data?.user;
  const banned = !!(u as { banned_until?: string } | undefined)?.banned_until;
  return { hasLogin: true, email: u?.email ?? null, banned };
}

/** Түр нууц үг үүсгэх — нэг удаа харуулна (агент дараа нь солино). */
export async function setAgentTempPassword(agentId: string): Promise<{ password?: string; error?: string }> {
  const ctx = await guard(agentId);
  if ("error" in ctx) return ctx;
  if (!ctx.agent.profile_id) return { error: "no_account" };
  const password = tempPassword();
  const { error } = await ctx.admin.auth.admin.updateUserById(ctx.agent.profile_id, { password });
  if (error) return { error: error.message };
  return { password };
}

/** Нэвтрэлтгүй агентад нэвтрэх бүртгэл үүсгэх (имэйл + түр нууц үг). */
export async function provisionAgentLogin(
  agentId: string,
  email: string
): Promise<{ email?: string; password?: string; error?: string }> {
  const ctx = await guard(agentId);
  if ("error" in ctx) return ctx;
  if (ctx.agent.profile_id) return { error: "has_account" };
  if (!email) return { error: "no_email" };

  const password = tempPassword();
  // role metadata оруулахгүй → trigger profile-г buyer-ээр үүсгэнэ, давхар agent үүсгэхгүй.
  const { data, error } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: ctx.agent.display_name },
  });
  if (error || !data.user) return { error: error?.message ?? "create_failed" };
  const uid = data.user.id;
  // Шинэ профайлыг агент болгож, оффист холбоно
  await ctx.admin.from("profiles").update({ role: "agent", office_id: ctx.agent.office_id }).eq("id", uid);
  // Байгаа agent мөрийг шинэ бүртгэлд холбож, идэвхжүүлнэ
  await ctx.admin.from("agents").update({ profile_id: uid, status: "active" }).eq("id", agentId);

  revalidatePath(`/office/agents/${agentId}`);
  return { email, password };
}

/** Нэвтрэлтийг идэвхгүй болгох/сэргээх (ban). */
export async function setAgentLoginEnabled(agentId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(agentId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!ctx.agent.profile_id) return { ok: false, error: "no_account" };
  const { error } = await ctx.admin.auth.admin.updateUserById(ctx.agent.profile_id, {
    ban_duration: enabled ? "none" : "876000h",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/office/agents/${agentId}`);
  return { ok: true };
}

/**
 * Агентыг БҮРЭН устгана — зар (+зураг/лид/сэтгэгдэл cascade), agent мөр, мөн
 * нэвтрэлтийн auth.users бүртгэл + profile хүртэл. ЭРГЭШГҮЙ. office_admin
 * зөвхөн өөрийн оффист; өөрийгөө болон админ бүртгэлийг устгахыг хориглоно.
 * confirmName нь агентын нэртэй яг таарах ёстой (санамсаргүй устгалаас сэргийлэх).
 */
export async function deleteAgentFully(
  agentId: string,
  confirmName: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(agentId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, agent } = ctx;

  if (confirmName.trim() !== (agent.display_name ?? "").trim()) {
    return { ok: false, error: "Баталгаажуулах нэр таарсангүй." };
  }

  // Өөрийгөө устгахаас сэргийлэх (оффис админ өөрийн agent профайлтай байж болно)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && agent.profile_id === user.id) {
    return { ok: false, error: "Та өөрийгөө устгаж болохгүй." };
  }

  // Өөр админ бүртгэлийг устгахыг хориглох
  if (agent.profile_id) {
    const { data: target } = await admin.from("profiles").select("role").eq("id", agent.profile_id).single();
    if (target?.role === "admin") return { ok: false, error: "Админ бүртгэлийг устгаж болохгүй." };
  }

  // 1) Агентын зарууд (cascade: listing_photos, ai_valuations, favorites, recently_viewed)
  await admin.from("listings").delete().eq("agent_id", agentId);
  // 2) Agent мөр (cascade: leads, conversations, reviews, subscriptions)
  const { error: agErr } = await admin.from("agents").delete().eq("id", agentId);
  if (agErr) return { ok: false, error: agErr.message };
  // 3) Нэвтрэлт + профайл (profiles → auth.users on delete cascade)
  if (agent.profile_id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(agent.profile_id);
    if (delErr) return { ok: false, error: delErr.message };
  }

  revalidatePath("/office/agents");
  revalidatePath("/office");
  revalidatePath("/agents");
  return { ok: true };
}

/**
 * Оффис админ ШИНЭ агент үүсгэнэ — auth invite + agent мөр + Resend урилга.
 * Агент и-мэйлийн линкээр нууц үгээ тохируулж нэвтэрнэ.
 */
export async function createAgentByOffice(input: {
  name: string;
  email: string;
  phone: string;
  specialty: string;
}): Promise<{ ok?: boolean; emailed?: boolean; actionLink?: string; reason?: string; error?: string }> {
  const ctx = await requireOffice();
  if ("error" in ctx) return { error: ctx.error };
  if (!input.name.trim() || !input.email.trim()) return { error: "Нэр болон и-мэйл шаардлагатай." };

  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // 1) Invite линк үүсгэх (хэрэглэгчийг үүсгэнэ, нууц үггүй).
  // generateLink нь implicit-flow (#access_token hash) линк үүсгэдэг тул CLIENT
  // боловсруулагч /auth/confirm руу чиглүүлнэ → setSession → /reset-password
  // (нууц үг үүсгэх) → role-ийн дагуу /agent самбар.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email.trim(),
    options: {
      data: { full_name: input.name.trim() },
      redirectTo: `${site}/auth/confirm?next=/reset-password`,
    },
  });
  if (linkErr || !linkData.user) {
    return { error: /already|registered|exist/i.test(linkErr?.message ?? "") ? "Энэ и-мэйл аль хэдийн бүртгэлтэй байна." : (linkErr?.message ?? "Үүсгэж чадсангүй.") };
  }
  const uid = linkData.user.id;
  const actionLink = linkData.properties.action_link;

  // 2) Профайлыг агент болгож оффист холбоно
  await admin.from("profiles").update({ role: "agent", office_id: ctx.officeId, full_name: input.name.trim() }).eq("id", uid);

  // 3) Agent мөр (нэр/утас/мэргэшил) — шууд идэвхтэй
  const { error: agErr } = await admin.from("agents").insert({
    profile_id: uid,
    display_name: input.name.trim(),
    phone: input.phone || null,
    specialty: input.specialty || null,
    office_id: ctx.officeId,
    status: "active",
  });
  if (agErr) return { error: agErr.message };

  // 4) Оффисын нэр + Resend имэйл
  const { data: office } = await admin.from("offices").select("name").eq("id", ctx.officeId).single();
  const res = await sendAgentInvite({
    to: input.email.trim(),
    agentName: input.name.trim(),
    officeName: office?.name ?? "Таны оффис",
    actionLink,
  });

  revalidatePath("/office/agents");
  // Линкийг үргэлж буцаана: и-мэйл очоогүй бол гол сувгаар, очсон ч нөөц болгон.
  return { ok: true, emailed: res.sent, actionLink, reason: res.sent ? undefined : mapEmailReason(res.reason) };
}

/** Resend-ийн алдааг оффис админд ойлгомжтой богино тайлбар болгоно. */
function mapEmailReason(reason?: string): string {
  if (!reason) return "тодорхойгүй шалтгаан";
  if (reason === "no_api_key") return "и-мэйл API тохируулаагүй";
  if (/verify a domain|testing emails|own email address/i.test(reason)) return "илгээгчийн домэйн баталгаажаагүй";
  return reason;
}

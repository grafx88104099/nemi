"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expirePublicListings } from "@/lib/listings-cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAgentInvite } from "@/lib/email/resend";
import { getOffboardingBlockers, offboardingBlockMessage } from "@/lib/crm2/offboarding";
import {
  confirmNameMatches,
  decideExistingAccount,
  isAlreadyRegisteredError,
  mapRemovalError,
  parseRemovalCheck,
  type ExistingAccount,
  type RemovalCheck,
  type TransferTarget,
} from "@/lib/office/agent-removal";

/**
 * CRM-ийн хүлээлцэх шалгалт: нээлттэй Staff хэлцэл эсвэл Staff хөрөнгийн үүрэгтэй
 * ажилтны нэвтрэлтийг хаахгүй. (Бүрэн хасалтыг office_remove_agent RPC шалгана.)
 */
async function crmOffboardingGuard(profileId: string): Promise<string | null> {
  const b = await getOffboardingBlockers(createAdminClient(), profileId);
  if ("error" in b) return b.error;
  return offboardingBlockMessage(b, "disable");
}

const GUARD_ERR: Record<string, string> = {
  auth: "Нэвтэрнэ үү.",
  forbidden: "Танд энэ агентыг удирдах эрх алга.",
  not_found: "Агент олдсонгүй.",
};

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
  if (!enabled) {
    const blocked = await crmOffboardingGuard(ctx.agent.profile_id);
    if (blocked) return { ok: false, error: blocked };
  }
  const { error } = await ctx.admin.auth.admin.updateUserById(ctx.agent.profile_id, {
    ban_duration: enabled ? "none" : "876000h",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/office/agents/${agentId}`);
  return { ok: true };
}

/**
 * «Хасах»-ын өмнөх шалгалт (баталгаажуулах цонх нээгдэхэд): хориг + засах
 * холбоос, CRM түүх, зарын тоо, хүлээн авах боломжтой агентууд. Эрх, оффисын
 * хязгаарыг DB (office_agent_removal_check) шалгана — хэрэглэгчийн эрхээр дуудна.
 */
export async function getAgentRemovalCheck(
  agentId: string
): Promise<{ check: RemovalCheck; targets: TransferTarget[] } | { error: string }> {
  if (!z.string().uuid().safeParse(agentId).success) return { error: GUARD_ERR.not_found };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("office_agent_removal_check", { p_agent: agentId });
  if (error) {
    console.error("office_agent_removal_check:", error.message);
    return { error: mapRemovalError(error.message) };
  }
  const check = parseRemovalCheck(data);
  if (!check) return { error: "Шалгалтын хариу буруу байна. Дахин оролдоно уу." };

  let targets: TransferTarget[] = [];
  if (check.agent.office_id) {
    const { data: rows } = await supabase
      .from("agents")
      .select("id, display_name")
      .eq("office_id", check.agent.office_id)
      .eq("status", "active")
      .neq("id", agentId)
      .order("display_name");
    targets = (rows ?? []).map((r) => ({ id: r.id as string, name: (r.display_name as string) ?? "Агент" }));
  }
  return { check, targets };
}

const removeSchema = z
  .object({
    agentId: z.string().uuid(),
    confirmName: z.string().max(200),
    listings: z.enum(["transfer", "delete"]).nullable(),
    targetId: z.string().uuid().nullable(),
  })
  .strict();

/**
 * Агентыг оффисоос «Хасах» — ЭРГЭШГҮЙ. Бүх алхам нэг DB транзакцид
 * (office_remove_agent): хориг дахин шалгана; CRM түүхгүй бол CRM бүртгэл +
 * нэвтрэлтийг бүрэн устгана, түүхтэй бол түүхийг үлдээж нэрийг «(хасагдсан)»
 * болгон нэвтрэлтийг хааж и-мэйл/утсыг чөлөөлнө. Зарыг сонголтоор шилжүүлэх
 * эсвэл устгана. Өөрийгөө, админыг хасахгүй; office_admin зөвхөн өөрийн оффист.
 */
export async function removeAgentFromOffice(
  raw: z.input<typeof removeSchema>
): Promise<
  | {
      ok: true;
      mode: "deleted" | "archived";
      moved: number;
      deleted: number;
      targetName: string | null;
      /** Бүрэн устгах байсан ч хуучин бүртгэл саад болж архивласан бол. */
      fellBack: boolean;
    }
  | { ok: false; error: string }
> {
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Мэдээлэл буруу байна." };
  const input = parsed.data;

  const ctx = await guard(input.agentId);
  if ("error" in ctx) return { ok: false, error: GUARD_ERR[String(ctx.error)] ?? GUARD_ERR.forbidden };
  if (!confirmNameMatches(input.confirmName, ctx.agent.display_name)) {
    return { ok: false, error: "Баталгаажуулах нэр таарсангүй." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("office_remove_agent", {
    p_agent: input.agentId,
    p_listings: input.listings,
    p_target: input.listings === "transfer" ? input.targetId : null,
    p_confirm: input.confirmName,
  });
  if (error) {
    console.error("office_remove_agent:", error.message);
    return { ok: false, error: mapRemovalError(error.message) };
  }
  const res = (data ?? {}) as {
    mode?: string;
    listings_moved?: number;
    listings_deleted?: number;
    target_name?: string | null;
    fallback_reason?: string | null;
  };
  if (res.fallback_reason) console.warn("office_remove_agent archived instead of delete:", res.fallback_reason);

  // Зар шилжсэн/устсан, агент нийтээс алга — нүүр, жагсаалтын кэшийг цэвэрлэнэ.
  expirePublicListings();
  revalidatePath("/office/agents");
  revalidatePath("/office");
  revalidatePath("/agents");
  revalidatePath(`/agents/${input.agentId}`);
  if (input.listings === "transfer" && input.targetId) revalidatePath(`/agents/${input.targetId}`);
  revalidatePath("/office/crm/settings/staff");
  return {
    ok: true,
    mode: res.mode === "archived" ? "archived" : "deleted",
    moved: res.listings_moved ?? 0,
    deleted: res.listings_deleted ?? 0,
    targetName: res.target_name ?? null,
    fellBack: !!res.fallback_reason,
  };
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
}): Promise<{
  ok?: boolean;
  emailed?: boolean;
  actionLink?: string;
  reason?: string;
  error?: string;
  /** CRM-д автоматаар бүртгэж чадаагүй бол — агент үүссэн, зөвхөн сануулга. */
  crmWarning?: string;
  /** И-мэйл аль хэдийн бүртгэлтэй байсан: энгийн хэрэглэгчийг агент болгосон / идэвхгүй агентыг сэргээсэн. */
  existing?: "converted" | "reactivated";
}> {
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
    // И-мэйл аль хэдийн бүртгэлтэй (жишээ нь худалдан авагчийн данс) — данс
    // устгалгүйгээр энэ оффисын агент болгоно (эсвэл идэвхгүй агентыг сэргээнэ).
    if (isAlreadyRegisteredError(linkErr?.message)) {
      return convertExistingAccount(admin, ctx.officeId, input, site);
    }
    return { error: linkErr?.message ?? "Үүсгэж чадсангүй." };
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

  // 3.1) CRM ашигладаг оффис бол шинэ агентыг CRM-д давхар бүртгэнэ.
  //
  // ЯАГААД: CRM цэс нь crm_staff мөрөөр нээгддэг. Өмнө нь агент үүсгэхэд энэ
  // мөр үүсдэггүй байсан тул шинэ агент нэвтрээд «CRM алга» гэж гомдоллодог
  // байв (2026-11-16-нд бүртгүүлсэн агент). CRM огт ашигладаггүй оффист
  // хүчээр нээхгүйн тулд оффис аль хэдийн CRM ажилтантай эсэхийг шалгана.
  const crmWarning = await addToCrmStaff(admin, ctx.officeId, uid);

  // 4) Оффисын нэр + Resend имэйл
  const { data: office } = await admin.from("offices").select("name").eq("id", ctx.officeId).single();
  const res = await sendAgentInvite({
    to: input.email.trim(),
    agentName: input.name.trim(),
    officeName: office?.name ?? "Таны оффис",
    actionLink,
  });

  revalidatePath("/office/agents");
  revalidatePath("/office/crm/settings/staff");
  // Линкийг үргэлж буцаана: и-мэйл очоогүй бол гол сувгаар, очсон ч нөөц болгон.
  return {
    ok: true,
    emailed: res.sent,
    actionLink,
    reason: res.sent ? undefined : mapEmailReason(res.reason),
    crmWarning,
  };
}

/**
 * Бүртгэлтэй и-мэйлийг энэ оффисын агент болгоно (createAgentByOffice-ийн салаа).
 *
 * ЯАГААД: худалдан авагчаар бүртгүүлсэн хүнийг агентаар нэмэхэд урилга
 * «аль хэдийн бүртгэлтэй» алдаа өгч, дансыг гараар устгах шаардлагатай болдог
 * байв (2026-11-24). Одоо: энгийн хэрэглэгч → агент + crm_staff; энэ оффисын
 * идэвхгүй/хүлээгдэж буй агент → сэргээнэ; админ, өөр оффисынх → татгалзана.
 * Нэвтрэх линк (magic link) и-мэйлээр явна — данс нууц үгтэй байж болно.
 */
async function convertExistingAccount(
  admin: ReturnType<typeof createAdminClient>,
  officeId: string,
  input: { name: string; email: string; phone: string; specialty: string },
  site: string
): Promise<Awaited<ReturnType<typeof createAgentByOffice>>> {
  const email = input.email.trim();
  const name = input.name.trim();

  // magiclink нь байгаа хэрэглэгчийг (id) + нэвтрэх линкийг нэг дор буцаана.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${site}/auth/confirm?next=/agent` },
  });
  if (linkErr || !link.user) {
    console.error("convertExistingAccount link:", linkErr?.message);
    return { error: "Энэ и-мэйлтэй бүртгэлийг олж чадсангүй." };
  }
  const uid = link.user.id;

  const [{ data: profile }, { data: agent }, { data: staff }] = await Promise.all([
    admin.from("profiles").select("role, office_id, full_name").eq("id", uid).maybeSingle(),
    admin.from("agents").select("id, office_id, status").eq("profile_id", uid).maybeSingle(),
    admin.from("crm_staff").select("id, is_active").eq("profile_id", uid).eq("office_id", officeId).maybeSingle(),
  ]);
  if (!profile) return { error: "Энэ и-мэйлтэй бүртгэлийг олж чадсангүй." };
  let staffRemoved = false;
  if (staff) {
    const { data: removed } = await admin.from("crm_staff_removals").select("staff_id").eq("staff_id", staff.id).maybeSingle();
    staffRemoved = !!removed;
  }

  const account: ExistingAccount = {
    role: profile.role as ExistingAccount["role"],
    officeId: (profile.office_id as string | null) ?? null,
    agent: agent
      ? {
          id: agent.id as string,
          officeId: (agent.office_id as string | null) ?? null,
          status: agent.status as "pending" | "active" | "rejected",
        }
      : null,
    staffRemoved,
  };
  const decision = decideExistingAccount(account, officeId);
  if (decision.kind === "refuse") return { error: decision.error };

  // Профайлыг агент болгож оффист холбоно (нэр хоосон бол оффисын оруулсан нэр).
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role: "agent", office_id: officeId, ...(profile.full_name ? {} : { full_name: name }) })
    .eq("id", uid);
  if (pErr) return { error: pErr.message };

  if (decision.kind === "convert") {
    const { error: agErr } = await admin.from("agents").insert({
      profile_id: uid,
      display_name: name,
      phone: input.phone || null,
      specialty: input.specialty || null,
      office_id: officeId,
      status: "active",
    });
    if (agErr) return { error: agErr.message };
  } else {
    const { error: agErr } = await admin
      .from("agents")
      .update({
        status: "active",
        display_name: name,
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.specialty ? { specialty: input.specialty } : {}),
      })
      .eq("id", decision.agentId);
    if (agErr) return { error: agErr.message };
  }

  // CRM: идэвхгүй болсон мөрийг сэргээнэ, эс бөгөөс шинээр (CRM ашигладаг оффист).
  let crmWarning: string | undefined;
  if (staff && !staff.is_active) {
    const { error: sErr } = await admin.from("crm_staff").update({ is_active: true, offboarding: false }).eq("id", staff.id);
    if (sErr) {
      console.error("convertExistingAccount crm_staff:", sErr.message);
      crmWarning = "CRM-ийн бүртгэлийг сэргээж чадсангүй — CRM → Тохиргоо → Ажилтан хэсгээс сэргээнэ үү.";
    }
  } else if (!staff) {
    crmWarning = await addToCrmStaff(admin, officeId, uid);
  }

  const { data: office } = await admin.from("offices").select("name").eq("id", officeId).single();
  const actionLink = link.properties.action_link;
  const res = await sendAgentInvite({
    to: email,
    agentName: name,
    officeName: office?.name ?? "Таны оффис",
    actionLink,
    existingAccount: true,
  });

  revalidatePath("/office/agents");
  revalidatePath("/office/crm/settings/staff");
  return {
    ok: true,
    emailed: res.sent,
    actionLink,
    reason: res.sent ? undefined : mapEmailReason(res.reason),
    crmWarning,
    existing: decision.kind === "convert" ? "converted" : "reactivated",
  };
}

/**
 * Шинэ агентыг CRM-ийн ажилтны бүртгэлд (crm_staff) нэмнэ — зөвхөн тухайн
 * оффис CRM ашигладаг бол. Алдаа гарвал агент үүсгэх үйлдлийг унагаахгүй,
 * анхааруулга болгон буцаана (оффис админ CRM → Тохиргоо → Ажилтан хэсгээс
 * гараар нэмж болно).
 */
async function addToCrmStaff(
  admin: ReturnType<typeof createAdminClient>,
  officeId: string,
  profileId: string
): Promise<string | undefined> {
  const { data: uses, error: readErr } = await admin
    .from("crm_staff")
    .select("id")
    .eq("office_id", officeId)
    .limit(1);
  if (readErr) {
    console.error("addToCrmStaff read:", readErr.message);
    return "CRM-ийн ажилтны бүртгэлийг шалгаж чадсангүй.";
  }
  if (!uses?.length) return undefined; // Энэ оффис CRM ашиглахгүй байна.

  const { error } = await admin
    .from("crm_staff")
    .insert({ office_id: officeId, profile_id: profileId, roles: ["agent"], panel_admin: false });
  // 23505 — аль хэдийн бүртгэлтэй (давхар дуудлага), алдаа биш.
  if (error && error.code !== "23505") {
    console.error("addToCrmStaff insert:", error.message);
    return "CRM-д автоматаар бүртгэж чадсангүй — CRM → Тохиргоо → Ажилтан хэсгээс нэмнэ үү.";
  }
  return undefined;
}

/** Resend-ийн алдааг оффис админд ойлгомжтой богино тайлбар болгоно. */
function mapEmailReason(reason?: string): string {
  if (!reason) return "тодорхойгүй шалтгаан";
  if (reason === "no_api_key") return "и-мэйл API тохируулаагүй";
  if (/verify a domain|testing emails|own email address/i.test(reason)) return "илгээгчийн домэйн баталгаажаагүй";
  return reason;
}

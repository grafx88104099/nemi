"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Багийн удирдлага. Эрх, оффисын хил, ахлагчийн дүрийг definer RPC шийднэ;
 * энд оролт шалгаж, мэдэгдэл илгээнэ.
 */

const SAVE_ERR = "Багийн мэдээлэл хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const INPUT_ERR = "Оролт буруу байна.";
const RPC_PREFIX = "Баг: ";

const uuid = z.string().uuid();

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Recipient = { id: string; userRole: string | undefined };

function revalidateTeamPaths() {
  revalidatePath("/office/crm");
  revalidatePath("/office/crm/teams");
  revalidatePath("/office/crm/leads");
  revalidatePath("/office/crm/vitals");
  revalidatePath("/office/crm/settings/staff");
  revalidatePath("/office/crm/settings/zones");
  revalidatePath("/agent/crm");
  revalidatePath("/agent/crm/team");
  revalidatePath("/agent/crm/leads");
}

function firstIssue(err: z.ZodError): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : INPUT_ERR;
}

function rpcError(fn: string, message: string): string {
  console.error(`${fn}:`, message);
  if (!message.startsWith(RPC_PREFIX)) return SAVE_ERR;
  const text = message.slice(RPC_PREFIX.length).trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : SAVE_ERR;
}

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadRoster(supabase: Supabase) {
  const { data, error } = await supabase.rpc("crm_team_roster");
  if (error) console.error("crm-teams roster:", error.message);
  return new Map((data ?? []).map((r) => [r.profile_id, r]));
}

async function loadTeam(supabase: Supabase, teamId: string) {
  const { data, error } = await supabase.from("crm_teams").select("name, lead_profile_id").eq("id", teamId).maybeSingle();
  if (error) console.error("crm-teams team:", error.message);
  return data;
}

/** Мэдэгдэл — admin client (notifications-д клиентийн insert эрх алга), алдаа үндсэн үйлдлийг унагахгүй. */
async function notify(recipients: Recipient[], type: string, title: string, body: string, agentLink = "/agent/crm") {
  try {
    if (!recipients.length) return;
    const rows = recipients.map((r) => ({
      user_id: r.id,
      type,
      title,
      body: body.slice(0, 120),
      link: r.userRole === "office_admin" || r.userRole === "admin" ? "/office/crm" : agentLink,
    }));
    const { error } = await createAdminClient().from("notifications").insert(rows);
    if (error) console.error("crm-teams notify:", error.message);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

const saveTeamSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1, "Багийн нэр оруулна уу").max(80, "Багийн нэр 80 тэмдэгтээс хэтрэхгүй"),
    branchId: z.string().uuid("Салбар сонгоно уу"),
  })
  .strict();

/** Баг үүсгэх (id-гүй) эсвэл нэр, салбарыг засах. */
export async function saveCrmTeam(raw: {
  id?: string;
  name: string;
  branchId: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const parsed = saveTeamSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_team_save", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_branch: input.branchId,
  });
  if (error) return { ok: false, error: rpcError("saveCrmTeam", error.message) };
  revalidateTeamPaths();
  return { ok: true, id: data };
}

const assignSchema = z
  .object({
    teamId: uuid,
    profileIds: z.array(uuid).min(1, "Агент сонгоно уу").max(100, "Нэг удаад 100 хүртэл агент сонгоно уу"),
  })
  .strict();

/**
 * Нэг эсвэл хэд хэдэн агентыг багт нэмнэ, өөр багаас шилжүүлнэ. Нэгнийх нь алдаа
 * бусдыг зогсоохгүй: assigned нь бодитоор багаа сольсон агентын тоо.
 */
export async function assignTeamMember(raw: {
  teamId: string;
  profileIds: string[];
}): Promise<{ ok: boolean; error?: string; assigned?: number; addedToCrm?: number }> {
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { teamId, profileIds } = parsed.data;

  const supabase = await createClient();
  const me = await currentUserId(supabase);
  if (!me) return { ok: false, error: "Нэвтэрнэ үү." };
  const [roster, team] = await Promise.all([loadRoster(supabase), loadTeam(supabase, teamId)]);

  const moved: Recipient[] = [];
  const registered: Recipient[] = [];
  let failed = 0;
  let firstError: string | null = null;

  for (const profileId of new Set(profileIds)) {
    const { data: isNew, error } = await supabase.rpc("crm_team_assign_member", { p_team: teamId, p_profile: profileId });
    if (error) {
      failed += 1;
      firstError ??= rpcError("assignTeamMember", error.message);
      continue;
    }
    const before = roster.get(profileId);
    if (before?.team_id === teamId) continue;
    (isNew ? registered : moved).push({ id: profileId, userRole: before?.user_role });
  }

  const assigned = moved.length + registered.length;
  if (assigned > 0) {
    revalidateTeamPaths();
    const teamLabel = team ? `«${team.name}» багт` : "багт";
    const others = (list: Recipient[]) => list.filter((r) => r.id !== me);
    await notify(others(moved), "crm_team_added", "Баг", `Таныг ${teamLabel} нэмлээ.`);
    await notify(others(registered), "crm_team_added", "Баг", `Таныг CRM-д бүртгэж, ${teamLabel} нэмлээ.`);
  }

  const result = { assigned, addedToCrm: registered.length };
  if (failed === 0) return { ok: true, ...result };
  return { ok: false, ...result, error: assigned > 0 ? `${failed} агент нэмэгдсэнгүй: ${firstError}` : (firstError ?? SAVE_ERR) };
}

/** Багаас гаргах. Ахлагч байсан бол DB trigger ахлагчаас чөлөөлж, дүрийг нь хасна. */
export async function removeTeamMember(profileId: string): Promise<{ ok: boolean; error?: string }> {
  if (!uuid.safeParse(profileId).success) return { ok: false, error: INPUT_ERR };

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_team_assign_member", { p_team: null, p_profile: profileId });
  if (error) return { ok: false, error: rpcError("removeTeamMember", error.message) };
  revalidateTeamPaths();
  return { ok: true };
}

const setLeadSchema = z.object({ teamId: uuid, profileId: uuid.nullable() }).strict();

/** Багийн ахлагч томилох; profileId = null бол чөлөөлнө. */
export async function setTeamLead(raw: {
  teamId: string;
  profileId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = setLeadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { teamId, profileId } = parsed.data;

  const supabase = await createClient();
  const me = await currentUserId(supabase);
  if (!me) return { ok: false, error: "Нэвтэрнэ үү." };
  const [roster, team] = await Promise.all([loadRoster(supabase), loadTeam(supabase, teamId)]);

  const { error } = await supabase.rpc("crm_team_set_lead", { p_team: teamId, p_profile: profileId });
  if (error) return { ok: false, error: rpcError("setTeamLead", error.message) };
  revalidateTeamPaths();

  if (profileId && profileId !== me) {
    const person = roster.get(profileId);
    const alreadyLead = team?.lead_profile_id === profileId && person?.roles?.includes("team_lead");
    if (!alreadyLead) {
      await notify(
        [{ id: profileId, userRole: person?.user_role }],
        "crm_team_lead",
        "Багийн ахлагч",
        `Таныг ${team ? `«${team.name}» багийн` : "багийн"} ахлагчаар томиллоо. Гишүүдийнхээ сэжим, явцыг хянах боломжтой боллоо.`,
        "/agent/crm/team"
      );
    }
  }
  return { ok: true };
}

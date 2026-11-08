import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { CrmRole } from "@/lib/constants-crm";
import type { AdminClient } from "@/lib/crm/rules";

/**
 * CRM мэдэгдлийн нэг зам (F-650–658, §7): notifyCrm(event, ...) —
 * матриц (F-651) + хувийн сонголт (F-652) + заавал ангилал + чимээгүй цаг
 * (F-653 — хойшлуулж crm_rule_runs 'pending' дараалалд, cron дараагийн
 * ажлын цагт хүргэнэ) + dedupe (F-658 — 24ц дотор ижил type+link давхардлыг
 * алгасна) шийдээд notifications хүснэгтэд бичнэ (admin client).
 *
 * Хүлээн авагчийг матрицын recipient_roles-оор шийднэ (resolveMatrixRecipients):
 * 'agent' = дуудагчийн өгсөн хариуцагч, 'team_lead' = тэдгээрийн багийн ахлагч,
 * бусад дүр = оффисын тухайн дүртэй бүх идэвхтэй ажилтан.
 *
 * Push суваг (lib/crm/push.ts): заавал ангилал, матрицад 'push', эсвэл
 * хэрэглэгчийн сонголтод 'push' байвал апп доторх мэдэгдлийн хамт илгээнэ;
 * VAPID тохиргоогүй бол чимээгүй алгасна. email/sms — интеграцгүй
 * (rule_runs-д 'skipped:no_integration' лог).
 */

export type QuietHours = { start: string; end: string };

/** Улаанбаатарын цагийн бүс — репогийн UTC+8 конвенц (crm-leads assignNewLead). */
export const UB_UTC_OFFSET_HOURS = 8;

/** 'HH:MM' → минут (0–1439); буруу бол null. */
export function parseHm(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Чимээгүй цагт байна уу (F-653). Мужийг локал цагаар (UTC+8) үнэлнэ;
 * start > end бол шөнө дамнасан муж (21:00–09:00).
 */
export function isQuietHours(
  now: Date,
  quiet: QuietHours | null | undefined,
  utcOffsetHours: number = UB_UTC_OFFSET_HOURS
): boolean {
  const start = parseHm(quiet?.start);
  const end = parseHm(quiet?.end);
  if (start == null || end == null || start === end) return false;
  const local = (now.getUTCHours() * 60 + now.getUTCMinutes() + utcOffsetHours * 60) % (24 * 60);
  if (start < end) return local >= start && local < end;
  return local >= start || local < end; // шөнө дамнасан
}

/** F-658 dedupe цонхны зүсэлт. */
export function dedupeCutoffIso(now: Date = new Date(), hours = 24): string {
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

/** Оффисын идэвхтэй ажилтнуудаас өгөгдсөн дүрүүдийн profile_id-ууд. */
export async function resolveRoleProfiles(
  admin: AdminClient,
  officeId: string,
  roles: CrmRole[]
): Promise<string[]> {
  if (!roles.length) return [];
  const { data, error } = await admin
    .from("crm_staff")
    .select("profile_id, roles")
    .eq("office_id", officeId)
    .eq("is_active", true);
  if (error) {
    console.error("resolveRoleProfiles:", error.message);
    return [];
  }
  return (data ?? [])
    .filter((s) => (s.roles as string[]).some((r) => (roles as string[]).includes(r)))
    .map((s) => s.profile_id);
}

/** Хүлээн авагч тодорхойлоход хэрэгтэй ажилтны мөр. */
export type StaffLite = { profile_id: string; roles: string[]; team_id: string | null };

/** Матрицын харьцангуй дүрүүд — оффисын бүх ажилтан биш, тухайн хэрэгт хамаарах хүн. */
const RELATIVE_ROLES = ["agent", "team_lead"];

/**
 * Матрицын recipient_roles-оор эцсийн хүлээн авагчид (цэвэр функц).
 *  • matrixRoles = null (мөр байхгүй) → шууд хүлээн авагч + includeRoles.
 *  • 'agent' матрицад байвал шууд хүлээн авагч бүгд үлдэнэ; үгүй бол матрицын
 *    аль нэг дүртэй шууд хүлээн авагч л үлдэнэ (жишээ нь МУТСТ-д агент очихгүй).
 *  • 'team_lead' → шууд хүлээн авагчийн багийн ахлагч(ид).
 *  • Бусад дүр → оффисын тухайн дүртэй бүх ажилтан.
 *  • includeRoles — дуудагчийн журмын шаардлага, матрицаас үл хамаарна.
 */
export function resolveMatrixRecipients(input: {
  direct: (string | null | undefined)[];
  matrixRoles: string[] | null;
  includeRoles?: string[];
  staff: StaffLite[];
}): string[] {
  const direct = [...new Set(input.direct.filter((x): x is string => !!x))];
  const staffById = new Map(input.staff.map((s) => [s.profile_id, s]));
  const withRoles = (roles: string[]) =>
    roles.length ? input.staff.filter((s) => s.roles.some((r) => roles.includes(r))).map((s) => s.profile_id) : [];
  const extra = withRoles(input.includeRoles ?? []);
  if (input.matrixRoles == null) return [...new Set([...direct, ...extra])];

  const m = input.matrixRoles;
  const kept = m.includes("agent")
    ? direct
    : direct.filter((id) => (staffById.get(id)?.roles ?? []).some((r) => m.includes(r)));

  const leads: string[] = [];
  if (m.includes("team_lead")) {
    const teams = new Set(direct.map((id) => staffById.get(id)?.team_id).filter((t): t is string => !!t));
    for (const s of input.staff) {
      if (s.team_id && teams.has(s.team_id) && s.roles.includes("team_lead")) leads.push(s.profile_id);
    }
  }
  const office = withRoles(m.filter((r) => !RELATIVE_ROLES.includes(r)));
  return [...new Set([...kept, ...leads, ...office, ...extra])];
}

async function loadOfficeStaff(admin: AdminClient, officeId: string): Promise<StaffLite[]> {
  const { data, error } = await admin
    .from("crm_staff")
    .select("profile_id, roles, team_id")
    .eq("office_id", officeId)
    .eq("is_active", true);
  if (error) {
    console.error("notifyCrm staff:", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ profile_id: s.profile_id, roles: (s.roles as string[]) ?? [], team_id: s.team_id }));
}

type MatrixRow = {
  event_code: string;
  recipient_roles: CrmRole[];
  channels: string[];
  mandatory: boolean;
  quiet_hours_exempt: boolean;
  escalation: Json | null;
};

async function currentSetting<T>(admin: AdminClient, officeId: string, key: string): Promise<T | null> {
  const { data } = await admin
    .from("crm_settings")
    .select("value")
    .eq("office_id", officeId)
    .eq("key", key)
    .is("valid_to", null)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.value ?? null) as T | null;
}

export type NotifyInput = {
  officeId: string;
  /** Матрицын event_code ('lead_assigned', 'arrears_step', …). */
  event: string;
  /** Шууд хамааралтай хүлээн авагчид (profile id). */
  recipients: (string | null | undefined)[];
  title: string;
  body: string;
  /** Мэдэгдлийн холбоос; заагаагүй бол хүлээн авагчийн панелиар default. */
  link?: string;
  /** Матрицын дүрд суурилсан нэмэлт хүлээн авагчид (жишээ нь ops_qc, finance). */
  includeRoles?: CrmRole[];
  /** Хойшлуулсан илгээлтийн rule_runs-д хамаатуулах entity. */
  entity?: string;
  entityId?: string;
  admin?: AdminClient;
  now?: Date;
};

export type NotifyResult = { delivered: number; deferred: number; skipped: number };

/** Агентын панелд байдаг CRM хэсгүүд (бусад нь зөвхөн оффисын панелд). */
const AGENT_CRM_SECTIONS = ["leads", "contacts", "pipeline", "properties", "commissions", "transactions", "pool", "week"];

function isOfficeRole(role: string | null | undefined): boolean {
  return role === "office_admin" || role === "admin";
}

/**
 * Холбоосыг хүлээн авагчийн панельд тааруулна: оффисын хэрэглэгчид
 * /agent/crm/… → /office/crm/…; агентад /office/crm/<агентад байдаг хэсэг> →
 * /agent/crm/…. Бусад холбоос хэвээр.
 */
export function panelLink(link: string, profileRole: string | null | undefined): string {
  if (isOfficeRole(profileRole)) {
    // Боломжийн карт: агентад /pipeline/<id>, оффист /deals/<id>.
    const opp = /^\/agent\/crm\/pipeline\/([^/?#]+)(.*)$/.exec(link);
    if (opp) return `/office/crm/deals/${opp[1]}${opp[2]}`;
    return link === "/agent/crm" || link.startsWith("/agent/crm/") ? `/office/crm${link.slice("/agent/crm".length)}` : link;
  }
  if (link === "/office/crm") return "/agent/crm";
  const deal = /^\/office\/crm\/deals\/([^/?#]+)(.*)$/.exec(link);
  if (deal) return `/agent/crm/pipeline/${deal[1]}${deal[2]}`;
  // Маргааны дэлгэц агентын панельд «Эзэмшил, сан»-ын таб.
  const disp = /^\/office\/crm\/disputes(?:\?(.*))?$/.exec(link);
  // Экспорт, хувийн мэдээллийн хүсэлтийн таб (tab=…) зөвхөн оффист байдаг тул хэвээр үлдээнэ.
  if (disp && !/(^|&)tab=/.test(disp[1] ?? "")) {
    return `/agent/crm/pool?tab=disputes${disp[1] ? `&${disp[1]}` : ""}`;
  }
  const m = /^\/office\/crm\/([^/?#]+)(.*)$/.exec(link);
  if (m && AGENT_CRM_SECTIONS.includes(m[1])) return `/agent/crm/${m[1]}${m[2]}`;
  return link;
}

/** Хоёр панелийн хувилбар (dedupe-д). */
function linkVariants(link: string): string[] {
  return [...new Set([link, panelLink(link, "office_admin"), panelLink(link, "agent")])];
}

/** Хүлээн авагч бүрд төрөл/холбоосоор notifications мөр (dedupe-тэй). */
async function insertNotifications(
  admin: AdminClient,
  targets: string[],
  type: string,
  title: string,
  body: string,
  link: string | undefined,
  now: Date
): Promise<{ delivered: number; skipped: number; deliveredIds: string[] }> {
  if (!targets.length) return { delivered: 0, skipped: 0, deliveredIds: [] };

  // F-658: 24ц дотор ижил type + link авсан хэрэглэгчийг алгасна.
  const cutoff = dedupeCutoffIso(now);
  let dupQ = admin
    .from("notifications")
    .select("user_id")
    .in("user_id", targets)
    .eq("type", type)
    .gte("created_at", cutoff);
  if (link) dupQ = dupQ.in("link", linkVariants(link));
  const { data: dups } = await dupQ;
  const already = new Set((dups ?? []).map((d) => d.user_id));
  const fresh = targets.filter((t) => !already.has(t));
  if (!fresh.length) return { delivered: 0, skipped: targets.length, deliveredIds: [] };

  // Default холбоос — хүлээн авагчийн панелиар (crm-staff notify загвар).
  const { data: profiles } = await admin.from("profiles").select("id, role").in("id", fresh);
  const roleOf = new Map((profiles ?? []).map((p) => [p.id, p.role as string]));
  const rows = fresh.map((id) => ({
    user_id: id,
    type,
    title,
    body: body.slice(0, 120),
    link: link ? panelLink(link, roleOf.get(id)) : isOfficeRole(roleOf.get(id)) ? "/office/crm" : "/agent/crm",
  }));
  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    console.error("notifyCrm insert:", error.message);
    return { delivered: 0, skipped: targets.length, deliveredIds: [] };
  }
  return { delivered: rows.length, skipped: already.size, deliveredIds: fresh };
}

/**
 * Мэдэгдлийн нэг зам. ХЭЗЭЭ Ч шидэхгүй — мэдэгдэл унасан ч үндсэн
 * бизнес-үйлдэл амжилттай хэвээр (админ конвенц, try/catch).
 */
export async function notifyCrm(input: NotifyInput): Promise<NotifyResult> {
  const empty: NotifyResult = { delivered: 0, deferred: 0, skipped: 0 };
  try {
    const admin = input.admin ?? createAdminClient();
    const now = input.now ?? new Date();
    const type = `crm_${input.event}`;

    // Матрицын мөр (байхгүй бол default: app суваг, mandatory биш).
    const { data: matrixRaw } = await admin
      .from("crm_notification_matrix")
      .select("event_code, recipient_roles, channels, mandatory, quiet_hours_exempt, escalation")
      .eq("office_id", input.officeId)
      .eq("event_code", input.event)
      .maybeSingle();
    const matrix = (matrixRaw as MatrixRow | null) ?? null;

    // Хүлээн авагчид: матрицын дүрүүд + шууд + дуудагчийн нэмэлт дүр.
    const staff = await loadOfficeStaff(admin, input.officeId);
    let targets = resolveMatrixRecipients({
      direct: input.recipients,
      matrixRoles: matrix ? ((matrix.recipient_roles as string[]) ?? []) : null,
      includeRoles: input.includeRoles,
      staff,
    });
    if (!targets.length) return empty;
    const pushOptIn = new Set<string>();

    // F-652: mandatory биш үед хувийн сонголтоор 'app' сувгийг хаасан хэрэглэгчийг алгасна.
    if (!(matrix?.mandatory ?? false)) {
      const { data: prefs } = await admin
        .from("crm_notification_prefs")
        .select("profile_id, channels")
        .eq("office_id", input.officeId)
        .eq("event_code", input.event)
        .in("profile_id", targets);
      const optedOut = new Set(
        (prefs ?? [])
          .filter((p) => !((p.channels as string[]) ?? []).includes("app"))
          .map((p) => p.profile_id)
      );
      for (const p of prefs ?? []) {
        if (((p.channels as string[]) ?? []).includes("push")) pushOptIn.add(p.profile_id);
      }
      targets = targets.filter((t) => !optedOut.has(t));
      if (!targets.length) return { ...empty, skipped: optedOut.size };
    }

    // F-653: чимээгүй цаг — mandatory/exempt биш бол хойшлуулж дараалалд.
    const quiet = await currentSetting<QuietHours>(admin, input.officeId, "quiet_hours");
    const exempt = (matrix?.mandatory ?? false) || (matrix?.quiet_hours_exempt ?? false);
    if (!exempt && isQuietHours(now, quiet)) {
      await admin.from("crm_rule_runs").insert({
        office_id: input.officeId,
        rule_code: `notify:${input.event}`,
        entity: input.entity ?? null,
        entity_id: input.entityId ?? null,
        status: "pending",
        result: {
          targets,
          type,
          title: input.title,
          body: input.body.slice(0, 120),
          link: input.link ?? null,
        } as unknown as Json,
      });
      return { ...empty, deferred: targets.length };
    }

    const { delivered, skipped, deliveredIds } = await insertNotifications(
      admin,
      targets,
      type,
      input.title,
      input.body,
      input.link,
      now
    );

    // Push: заавал ангилал / матрицад push / хэрэглэгч push сонгосон.
    if (deliveredIds.length) {
      const pushAll = (matrix?.mandatory ?? false) || (matrix?.channels ?? []).includes("push");
      const pushTargets = pushAll ? deliveredIds : deliveredIds.filter((id) => pushOptIn.has(id));
      if (pushTargets.length) {
        const { sendPushToProfiles } = await import("@/lib/crm/push");
        await sendPushToProfiles(admin, pushTargets, {
          title: input.title,
          body: input.body,
          url: input.link,
          tag: input.entityId ? `${input.event}:${input.entityId}` : input.event,
        });
      }
    }

    // email/sms — интеграцгүй (F-650/656): матрицад байвал логлоно.
    const external = (matrix?.channels ?? []).filter((c) => c !== "app" && c !== "push");
    if (external.length && delivered > 0) {
      await admin.from("crm_rule_runs").insert({
        office_id: input.officeId,
        rule_code: `notify:${input.event}`,
        entity: input.entity ?? null,
        entity_id: input.entityId ?? null,
        status: "skipped",
        result: { channels: external } as unknown as Json,
        error: "no_integration",
      });
    }
    return { delivered, deferred: 0, skipped };
  } catch (e) {
    console.error("notifyCrm:", e instanceof Error ? e.message : e);
    return empty;
  }
}

/**
 * Чимээгүй цагт хойшлогдсон мэдэгдлүүдийг хүргэнэ (F-653 «дараагийн ажлын
 * цагт нэгтгэгдэн ирнэ») — crm-sla/crm-daily cron ажлын цагт дуудна.
 */
export async function deliverDeferredNotifications(
  admin: AdminClient,
  now: Date = new Date(),
  /** Зөвхөн эдгээр оффисынхыг (ажлын цагтай оффис) — заагаагүй бол бүгд. */
  officeIds?: string[]
): Promise<number> {
  let delivered = 0;
  if (officeIds && officeIds.length === 0) return 0;
  try {
    let q = admin
      .from("crm_rule_runs")
      .select("id, office_id, result")
      .eq("status", "pending")
      .like("rule_code", "notify:%")
      .limit(500);
    if (officeIds) q = q.in("office_id", officeIds);
    const { data: pending } = await q;
    for (const row of pending ?? []) {
      const payload = (row.result ?? {}) as {
        targets?: string[];
        type?: string;
        title?: string;
        body?: string;
        link?: string | null;
      };
      if (!payload.targets?.length || !payload.type) {
        await admin.from("crm_rule_runs").update({ status: "error", error: "bad_payload" }).eq("id", row.id);
        continue;
      }
      const res = await insertNotifications(
        admin,
        payload.targets,
        payload.type,
        payload.title ?? "CRM мэдэгдэл",
        payload.body ?? "",
        payload.link ?? undefined,
        now
      );
      delivered += res.delivered;
      await admin
        .from("crm_rule_runs")
        .update({ status: "ok", result: { ...payload, delivered_at: now.toISOString() } as unknown as Json })
        .eq("id", row.id);
    }
  } catch (e) {
    console.error("deliverDeferredNotifications:", e instanceof Error ? e.message : e);
  }
  return delivered;
}

/**
 * F-655 шилжих гинж: матрицад escalation={after_hours, to_roles[]} тохируулсан
 * event-ийн уншигдаагүй мэдэгдэл цонхноос хэтэрвэл дараагийн түвшинд илгээнэ.
 * Давхардлаас notifyCrm-ийн 24ц dedupe (type='crm_<event>_esc') хамгаална.
 */
export async function escalateUnreadNotifications(
  admin: AdminClient,
  officeId: string,
  now: Date = new Date()
): Promise<number> {
  let escalated = 0;
  try {
    const { data: matrix } = await admin
      .from("crm_notification_matrix")
      .select("event_code, escalation")
      .eq("office_id", officeId)
      .not("escalation", "is", null);
    if (!matrix?.length) return 0;

    // notifications хүснэгтэд office_id байхгүй — оффисын ажилтнуудаар хатуу scope-лоно.
    const { data: staff } = await admin
      .from("crm_staff")
      .select("profile_id")
      .eq("office_id", officeId)
      .eq("is_active", true);
    const officeProfiles = (staff ?? []).map((s) => s.profile_id);
    if (!officeProfiles.length) return 0;

    for (const m of matrix) {
      const esc = (m.escalation ?? {}) as { after_hours?: number; to_roles?: CrmRole[] };
      const afterHours = typeof esc.after_hours === "number" ? esc.after_hours : null;
      if (!afterHours || !esc.to_roles?.length) continue;

      const cutoff = new Date(now.getTime() - afterHours * 3600 * 1000).toISOString();
      const { data: unread } = await admin
        .from("notifications")
        .select("id, title, body, link")
        .eq("type", `crm_${m.event_code}`)
        .in("user_id", officeProfiles)
        .is("read_at", null)
        .lt("created_at", cutoff)
        .limit(50);
      if (!unread?.length) continue;

      const res = await notifyCrm({
        officeId,
        event: `${m.event_code}_esc`,
        recipients: [],
        includeRoles: esc.to_roles,
        title: `Эскалаци: ${unread[0].title ?? m.event_code}`,
        body: `${unread.length} мэдэгдэл ${afterHours} цагийн турш уншигдаагүй байна.`,
        link: unread[0].link ?? undefined,
        admin,
        now,
      });
      escalated += res.delivered;
    }
  } catch (e) {
    console.error("escalateUnreadNotifications:", e instanceof Error ? e.message : e);
  }
  return escalated;
}

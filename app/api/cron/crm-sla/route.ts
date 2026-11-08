import { fmtDateTime, fmtTime } from "@/lib/format";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/crm/cron-auth";
import {
  getRuleMap,
  ruleGate,
  conditionParam,
  logRuleRun,
  hasRuleRun,
  listCrmOffices,
  leadSlaSteps,
  queueDrainDeadline,
  type AdminClient,
  type AutomationRule,
} from "@/lib/crm/rules";
import { notifyCrm, deliverDeferredNotifications } from "@/lib/crm/notify";
import { assignLead, type AssignMode, type AssignRule } from "@/lib/crm/scoring";
import {
  calendarExceptionsFromRows,
  isWithinWorkHours,
  slaClockStart,
  toIsoDate,
  workHoursFromPolicy,
  type CalendarExceptions,
  type SlaPolicy,
} from "@/lib/crm/calendar";
import type { Json } from "@/types/database";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * CRM SLA cron (§6.4, §6.27, §6.28.1-2) — Supabase pg_cron 5 минут тутам
 * дуудна (migration 20261107000600, Vault 'crm_cron_secret'); vercel.json-ийн
 * өдрийн 1 дуудлага нөөц. Оффис бүрийн ажлын цаг = crm_settings.sla_policy +
 * crm_calendar_days (УБ цагаар):
 *  • Д-01 үргэлжлэл: ажлын бус цагт дараалалд орсон сэжимийг ажлын цаг
 *    эхлэхэд хуваарилж, эхний холболтын даалгавар үүсгэнэ;
 *  • Д-02: эхний холболтын хугацаа хэтэрвэл эзэмшигч (+матрицаар ахлагч);
 *  • Д-03: холбогдож чадаагүй/хэтэрсэн бол сэжим ирснээс 24ц дотор хоёр дахь
 *    оролдлогын даалгавар;
 *  • Д-04: сэжим ирснээс 48ц-т утга бүхий холболтгүй бол ахлагчид харагдуулна;
 *  • Д-20 засварын SLA; Д-25/26 МУТСТ тоолуур (зөвхөн aml_officer/ceo);
 *  • чимээгүй цагт хойшлогдсон мэдэгдлийн хүргэлт.
 * Утга бүхий холболт = crm_leads.first_contact_at (үйл ажиллагааны trigger).
 */

export const maxDuration = 120;

const HOUR_MS = 3600 * 1000;
const MIN_MS = 60 * 1000;

type StaffRow = { profile_id: string; roles: string[]; team_id: string | null; offboarding: boolean };
type StaffIndex = Map<string, StaffRow[]>;

async function loadStaffIndex(admin: AdminClient): Promise<StaffIndex> {
  const idx: StaffIndex = new Map();
  const { data } = await admin
    .from("crm_staff")
    .select("office_id, profile_id, roles, team_id, offboarding")
    .eq("is_active", true);
  for (const s of data ?? []) {
    const arr = idx.get(s.office_id) ?? [];
    arr.push({
      profile_id: s.profile_id,
      roles: (s.roles as string[]) ?? [],
      team_id: s.team_id,
      offboarding: Boolean(s.offboarding),
    });
    idx.set(s.office_id, arr);
  }
  return idx;
}

function roleProfiles(idx: StaffIndex, officeId: string, roles: CrmRole[]): string[] {
  return (idx.get(officeId) ?? [])
    .filter((s) => s.roles.some((r) => (roles as string[]).includes(r)))
    .map((s) => s.profile_id);
}

function teamLeadsOf(idx: StaffIndex, officeId: string, profileId: string | null): string[] {
  const staff = idx.get(officeId) ?? [];
  const team = staff.find((s) => s.profile_id === profileId)?.team_id;
  if (!team) return [];
  return staff.filter((s) => s.team_id === team && s.roles.includes("team_lead")).map((s) => s.profile_id);
}

/** Тухайн оффисын тохиргооны одоогийн утга (кэштэй). */
function makeSettingReader(admin: AdminClient) {
  const cache = new Map<string, unknown>();
  return async function officeSetting<T>(officeId: string, key: string): Promise<T | null> {
    const ck = `${officeId}:${key}`;
    if (cache.has(ck)) return cache.get(ck) as T | null;
    const { data } = await admin
      .from("crm_settings")
      .select("value")
      .eq("office_id", officeId)
      .eq("key", key)
      .is("valid_to", null)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = (data?.value ?? null) as T | null;
    cache.set(ck, v);
    return v;
  };
}

async function createTask(
  admin: AdminClient,
  input: {
    officeId: string;
    responsibleId: string;
    title: string;
    description: string;
    priority?: "low" | "normal" | "high" | "urgent";
    deadline: Date;
    entity: string;
    entityId: string;
    ruleCode: string;
  }
): Promise<string | null> {
  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      office_id: input.officeId,
      created_by: input.responsibleId,
      responsible_id: input.responsibleId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "high",
      deadline: input.deadline.toISOString(),
    })
    .select("id")
    .single();
  if (error || !task) {
    console.error("crm-sla createTask:", error?.message);
    return null;
  }
  await admin.from("crm_task_links").insert({
    task_id: task.id,
    entity: input.entity,
    entity_id: input.entityId,
    rule_code: input.ruleCode,
  });
  return task.id;
}

/** Оффис бүрийн SLA орчин: ажлын цаг, хуанлийн онцгой өдөр, эх сурвалжийн бодлого. */
type OfficeSla = {
  policy: SlaPolicy | null;
  exceptions: CalendarExceptions;
  fallbackMinutes: number;
  working: boolean;
};

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const ruleMap = await getRuleMap(admin);
  const staffIdx = await loadStaffIndex(admin);
  const offices = await listCrmOffices(admin);
  const officeSetting = makeSettingReader(admin);

  const gate = (officeId: string, code: string): { run: boolean; dryRun: boolean; rule: AutomationRule | null } => {
    const rule = ruleMap.get(`${officeId}:${code}`) ?? null;
    const g = ruleGate(rule);
    return { run: g.run, dryRun: g.dryRun, rule };
  };

  // ── Оффис бүрийн ажлын цаг (УБ) ──
  const todayIso = toIsoDate(now);
  const fromIso = toIsoDate(new Date(now.getTime() - 7 * 24 * HOUR_MS));
  const toIso = toIsoDate(new Date(now.getTime() + 45 * 24 * HOUR_MS));
  const { data: calRows } = await admin
    .from("crm_calendar_days")
    .select("office_id, day, is_workday")
    .gte("day", fromIso)
    .lte("day", toIso);
  const slaEnv = new Map<string, OfficeSla>();
  const officeIds = [...new Set([...offices, ...(calRows ?? []).map((r) => r.office_id)])];
  for (const officeId of officeIds) {
    const policy = await officeSetting<SlaPolicy>(officeId, "sla_policy");
    const exceptions = calendarExceptionsFromRows((calRows ?? []).filter((r) => r.office_id === officeId));
    const fallbackMinutes = (await officeSetting<number>(officeId, "sla_first_contact_min")) ?? 15;
    slaEnv.set(officeId, {
      policy,
      exceptions,
      fallbackMinutes,
      working: isWithinWorkHours(now, workHoursFromPolicy(policy), exceptions),
    });
  }
  const envOf = (officeId: string): OfficeSla =>
    slaEnv.get(officeId) ?? {
      policy: null,
      exceptions: {},
      fallbackMinutes: 15,
      working: isWithinWorkHours(now),
    };
  const workingOffices = officeIds.filter((o) => envOf(o).working);

  // Эх сурвалжийн id → код (эх сурвалжаар ялгаатай SLA).
  const { data: sourceRows } = await admin.from("crm_lookups").select("id, code").eq("kind", "lead_source");
  const sourceCodes = new Map((sourceRows ?? []).map((r) => [r.id, r.code]));

  const summary = {
    today: todayIso,
    workingOffices: workingOffices.length,
    deferredDelivered: 0,
    queueAssigned: 0,
    queueWaiting: 0,
    unassignedAlerts: 0,
    d02Breaches: 0,
    d03Tasks: 0,
    d04Escalations: 0,
    d20Respond: 0,
    d20Resolve: 0,
    d25Alerts: 0,
    d26Alerts: 0,
    errors: [] as string[],
  };

  // ── 0. Чимээгүй цагт хойшлогдсон мэдэгдэл — ажлын цагтай оффист хүргэнэ ──
  try {
    summary.deferredDelivered = await deliverDeferredNotifications(admin, now, workingOffices);
  } catch (e) {
    summary.errors.push(`deferred: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 1. Д-01 үргэлжлэл: ажлын бус цагийн дарааллын хуваарилалт ──
  try {
    const { data: states } = await admin
      .from("crm_assignment_state")
      .select("office_id, scope, last_assigned_profile_id, queue");
    for (const state of states ?? []) {
      const queue = Array.isArray(state.queue) ? ([...state.queue] as string[]) : [];
      if (!queue.length) continue;
      const env = envOf(state.office_id);
      if (!env.working) {
        summary.queueWaiting += queue.length;
        continue;
      }
      const g = gate(state.office_id, "D-01");
      if (!g.run) continue;

      const setting =
        (await officeSetting<{ mode?: AssignMode; load_cap?: number; rules?: AssignRule[] }>(
          state.office_id,
          "lead_assignment"
        )) ?? {};
      // Ажлаа хүлээлгэж буй (offboarding) ажилтанд хуваарилахгүй (§6.27).
      const candidates = (staffIdx.get(state.office_id) ?? [])
        .filter((s) => s.roles.includes("agent") && !s.offboarding)
        .map((s) => s.profile_id);

      const loads: Record<string, number> = {};
      const { data: openLeads } = await admin
        .from("crm_leads")
        .select("owner_id")
        .eq("office_id", state.office_id)
        .in("status", ["new", "active"])
        .not("owner_id", "is", null);
      for (const l of openLeads ?? []) if (l.owner_id) loads[l.owner_id] = (loads[l.owner_id] ?? 0) + 1;
      const { data: duty } = await admin
        .from("crm_duty_shifts")
        .select("profile_id")
        .eq("office_id", state.office_id)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso);
      const dutyNow = (duty ?? []).map((d) => d.profile_id);

      let cursor = state.last_assigned_profile_id as string | null;
      const remaining: string[] = [];

      for (const leadId of queue) {
        const { data: lead } = await admin
          .from("crm_leads")
          .select("id, owner_id, status, branch_id, grade, received_at, created_at, source_id")
          .eq("id", leadId)
          .maybeSingle();
        if (!lead || lead.owner_id || !["new", "active"].includes(lead.status)) continue; // хоцрогдсон мөр — хасна
        const sourceCode = lead.source_id ? (sourceCodes.get(lead.source_id) ?? null) : null;

        const decision = candidates.length
          ? assignLead({
              mode: setting.mode ?? "round_robin",
              candidates,
              dutyNow,
              cursor,
              loads,
              loadCap: setting.load_cap,
              rules: setting.rules ?? [],
              lead: { sourceCode, branchId: lead.branch_id, grade: lead.grade },
              isWorkHours: true,
              afterHours: "assign",
            })
          : ({ ownerId: null, queued: false } as const);
        if (!decision.ownerId) {
          remaining.push(leadId);
          continue;
        }

        // Хугацаа: мэдээлэл ирсэн мөчөөс эх сурвалжийн бодлогоор; хэрэв систем
        // хоцорч хуваарилсан бол (ачааллын дээд хязгаар г.м.) одооноос тоолно.
        const due = queueDrainDeadline(new Date(lead.received_at ?? lead.created_at), now, sourceCode, {
          policy: env.policy,
          fallbackMinutes: env.fallbackMinutes,
          exceptions: env.exceptions,
        });

        const { error: upErr } = await admin
          .from("crm_leads")
          .update({ owner_id: decision.ownerId, first_contact_due_at: due.toISOString() })
          .eq("id", leadId)
          .is("owner_id", null);
        if (upErr) {
          summary.errors.push(`D-01 drain ${leadId}: ${upErr.message}`);
          remaining.push(leadId);
          continue;
        }
        cursor = decision.ownerId;
        loads[decision.ownerId] = (loads[decision.ownerId] ?? 0) + 1;

        const taskId = await createTask(admin, {
          officeId: state.office_id,
          responsibleId: decision.ownerId,
          title: "Шинэ сэжимтэй эхний холболт хийх",
          description: "Ажлын бус цагт ирсэн сэжим танд хуваарилагдлаа. Холбогдож, үр дүн болон дараагийн үйлдлээ бүртгэнэ үү.",
          deadline: due,
          entity: "lead",
          entityId: leadId,
          ruleCode: "D-01",
        });
        if (taskId) {
          await admin.from("crm_leads").update({ next_step_task_id: taskId }).eq("id", leadId);
        }
        await notifyCrm({
          officeId: state.office_id,
          event: "lead_assigned",
          recipients: [decision.ownerId],
          title: "Шинэ сэжим оноогдлоо",
          body: `Ажлын бус цагт ирсэн сэжим. Эхний холболтын хугацаа: ${fmtTime(due)}.`,
          link: `/agent/crm/leads/${leadId}`,
          entity: "crm_leads",
          entityId: leadId,
          admin,
          now,
        });
        await logRuleRun(admin, {
          officeId: state.office_id,
          ruleCode: "D-01",
          entity: "crm_leads",
          entityId: leadId,
          status: "ok",
          result: { owner_id: decision.ownerId, queued_drain: true, due: due.toISOString(), task_id: taskId },
        });
        summary.queueAssigned += 1;
      }

      await admin
        .from("crm_assignment_state")
        .update({
          last_assigned_profile_id: cursor,
          queue: remaining as unknown as Json,
          updated_at: nowIso,
        })
        .eq("office_id", state.office_id)
        .eq("scope", state.scope);

      // Хуваарилагдаж чадаагүй (агентгүй / бүгд дүүрсэн) сэжим SLA-аас гадуур
      // үлдэхгүй — хугацаа өнгөрвөл Борлуулалт хариуцсан захиралд нэг удаа.
      for (const leadId of remaining) {
        const { data: lead } = await admin
          .from("crm_leads")
          .select("id, received_at, created_at")
          .eq("id", leadId)
          .maybeSingle();
        if (!lead) continue;
        const startedAt = slaClockStart(
          new Date(lead.received_at ?? lead.created_at),
          workHoursFromPolicy(env.policy),
          env.exceptions
        );
        if (now.getTime() - startedAt.getTime() < env.fallbackMinutes * MIN_MS) continue;
        if (await hasRuleRun(admin, { officeId: state.office_id, ruleCode: "D-01-unassigned", entity: "crm_leads", entityId: leadId })) {
          continue;
        }
        await notifyCrm({
          officeId: state.office_id,
          event: "lead_sla_breach",
          recipients: [],
          includeRoles: ["sales_director"],
          title: "Эзэмшигчгүй сэжим хүлээгдэж байна",
          body: "Хуваарилах боломжтой агент олдсонгүй (ачаалал дүүрсэн эсвэл агентгүй). Гараар хуваарилна уу.",
          link: `/office/crm/leads/${leadId}`,
          entity: "crm_leads",
          entityId: leadId,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: state.office_id, ruleCode: "D-01-unassigned", entity: "crm_leads", entityId: leadId, status: "ok" });
        summary.unassignedAlerts += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-01: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Д-02/03/04: эхний утга бүхий холболтын гинж ──
  try {
    type SlaLead = {
      id: string;
      office_id: string;
      owner_id: string | null;
      first_contact_due_at: string | null;
      first_contact_at: string | null;
      received_at: string | null;
      created_at: string;
      /** Дахин хуваарилсан / сангаас авсан мөч — SLA гинж шинэ эзэмшигчээр дахин ажиллана. */
      owner_assigned_at: string | null;
      status: string;
    };
    const { data: leadsRaw } = await admin
      .from("crm_leads")
      .select("id, office_id, owner_id, first_contact_due_at, first_contact_at, received_at, created_at, status, owner_assigned_at")
      .in("status", ["new", "active"])
      .is("first_contact_at", null)
      .not("owner_id", "is", null)
      .limit(2000);
    const leads = (leadsRaw ?? []) as unknown as SlaLead[];

    // «Холбогдож чадаагүй» оролдлогын тоо.
    const failed = new Map<string, number>();
    for (let i = 0; i < leads.length; i += 200) {
      const ids = leads.slice(i, i + 200).map((l) => l.id);
      const { data: acts } = await admin
        .from("crm_activities")
        .select("lead_id")
        .in("lead_id", ids)
        .eq("reached", false);
      for (const a of acts ?? []) if (a.lead_id) failed.set(a.lead_id, (failed.get(a.lead_id) ?? 0) + 1);
    }

    for (const lead of leads) {
      if (!lead.owner_id) continue;
      const g03 = gate(lead.office_id, "D-03");
      const g04 = gate(lead.office_id, "D-04");
      const retryHours = conditionParam<number>(g03.rule?.condition, "hours", 24);
      const escalateHours = conditionParam<number>(g04.rule?.condition, "hours", 48);
      const steps = leadSlaSteps(
        {
          startedAt: new Date(lead.received_at ?? lead.created_at),
          dueAt: lead.first_contact_due_at ? new Date(lead.first_contact_due_at) : null,
          firstContactAt: null,
          failedAttempts: failed.get(lead.id) ?? 0,
        },
        now,
        { retryHours, escalateHours }
      );

      // Д-02: хугацаа хэтэрсэн (нэг удаа) — эзэмшигч, матрицаар ахлагч.
      const g02 = gate(lead.office_id, "D-02");
      if (
        steps.breach &&
        g02.run &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-02", entity: "crm_leads", entityId: lead.id, sinceIso: lead.owner_assigned_at ?? undefined }))
      ) {
        const overdueMin = Math.round((now.getTime() - new Date(lead.first_contact_due_at!).getTime()) / MIN_MS);
        await notifyCrm({
          officeId: lead.office_id,
          event: "lead_sla_breach",
          recipients: [lead.owner_id],
          title: "Эхний холболтын хугацаа хэтэрлээ",
          body: `Шинэ сэжимтэй холбогдоогүй байна — хугацаа ${overdueMin} минут хэтэрсэн.`,
          link: `/agent/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-02", entity: "crm_leads", entityId: lead.id, status: "ok", result: { overdue_min: overdueMin } });
        summary.d02Breaches += 1;
      }

      // Д-03: хоёр дахь оролдлого — сэжим ирснээс retryHours дотор.
      if (
        steps.retry &&
        g03.run &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-03", entity: "crm_leads", entityId: lead.id, sinceIso: lead.owner_assigned_at ?? undefined }))
      ) {
        const taskId = await createTask(admin, {
          officeId: lead.office_id,
          responsibleId: lead.owner_id,
          title: "Сэжимтэй дахин холбогдох (хоёр дахь оролдлого)",
          description: `Эхний холболт амжилтгүй эсвэл хугацаа хэтэрсэн. Сэжим ирснээс ${retryHours} цагийн дотор өөр суваг, цагаар дахин оролдож, дараагийн үйлдлээ товлоно уу.`,
          deadline: steps.retryDeadline,
          entity: "lead",
          entityId: lead.id,
          ruleCode: "D-03",
        });
        await notifyCrm({
          officeId: lead.office_id,
          event: "lead_retry_due",
          recipients: [lead.owner_id],
          title: "Дахин холбогдох оролдлого хийнэ үү",
          body: `Сэжимтэй утга бүхий холболт болоогүй байна. ${retryHours} цагийн дотор хоёр дахь оролдлогоо хийнэ үү.`,
          link: `/agent/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-03", entity: "crm_leads", entityId: lead.id, status: "ok", result: { task_id: taskId, deadline: steps.retryDeadline.toISOString() } });
        summary.d03Tasks += 1;
      }

      // Д-04: 48ц-т утга бүхий холболтгүй — сануулга + ахлагчид харагдуулах.
      if (
        steps.noContact &&
        g04.run &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-04", entity: "crm_leads", entityId: lead.id, sinceIso: lead.owner_assigned_at ?? undefined }))
      ) {
        const leads4 = teamLeadsOf(staffIdx, lead.office_id, lead.owner_id);
        const reviewer = leads4[0] ?? roleProfiles(staffIdx, lead.office_id, ["sales_director"])[0];
        if (reviewer) {
          await createTask(admin, {
            officeId: lead.office_id,
            responsibleId: reviewer,
            title: "Холбогдоогүй сэжимийг хянах",
            description: `Сэжим ирснээс ${escalateHours} цагт утга бүхий холболт болоогүй. Агенттай ярилцаж, шаардлагатай бол нотолгоонд үндэслэн дахин хуваарилах эсэхийг шийднэ үү.`,
            deadline: new Date(now.getTime() + 24 * HOUR_MS),
            entity: "lead",
            entityId: lead.id,
            ruleCode: "D-04",
          });
        }
        await notifyCrm({
          officeId: lead.office_id,
          event: "lead_no_contact_48h",
          recipients: [lead.owner_id],
          includeRoles: leads4.length ? [] : ["sales_director"],
          title: `${escalateHours} цагт холбогдоогүй сэжим`,
          body: "Утга бүхий холболт болоогүй сэжим Багийн ахлагчид харагдаж байна.",
          link: `/agent/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-04", entity: "crm_leads", entityId: lead.id, status: "ok", result: { reviewer: reviewer ?? null } });
        summary.d04Escalations += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-02/03/04: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Д-20: засварын SLA хэтрэлт ──
  try {
    const { data: reqs } = await admin
      .from("crm_maintenance_requests")
      .select("id, office_id, urgency, status, sla_respond_by, sla_resolve_by, assigned_to, description")
      .not("status", "in", "(closed,rejected)");
    for (const r of reqs ?? []) {
      const g = gate(r.office_id, "D-20");
      if (!g.run) continue;

      const phases: { code: string; due: string | null; label: string; active: boolean }[] = [
        {
          code: "D-20",
          due: r.sla_respond_by,
          label: "хариу өгөх",
          active: ["new", "pending_approval"].includes(r.status),
        },
        { code: "D-20-resolve", due: r.sla_resolve_by, label: "шийдвэрлэх", active: true },
      ];
      for (const phase of phases) {
        if (!phase.active || !phase.due || phase.due > nowIso) continue;
        if (await hasRuleRun(admin, { officeId: r.office_id, ruleCode: phase.code, entity: "crm_maintenance_requests", entityId: r.id })) continue;

        const opsQc = roleProfiles(staffIdx, r.office_id, ["ops_qc"]);
        const responsible = opsQc[0] ?? roleProfiles(staffIdx, r.office_id, ["property_manager"])[0];
        if (responsible) {
          await createTask(admin, {
            officeId: r.office_id,
            responsibleId: responsible,
            title: `Засварын хүсэлтийн ${phase.label} хугацаа хэтэрлээ`,
            description: `«${r.description.slice(0, 120)}» хүсэлтийн ${phase.label} хугацаа өнгөрсөн — Үйл ажиллагаа-ЧМТ зохицуулна.`,
            priority: r.urgency === "urgent" ? "urgent" : "high",
            deadline: new Date(now.getTime() + 24 * HOUR_MS),
            entity: "maintenance_request",
            entityId: r.id,
            ruleCode: phase.code,
          });
        }
        await notifyCrm({
          officeId: r.office_id,
          event: "maintenance_sla",
          recipients: [r.assigned_to],
          includeRoles: ["property_manager", "ops_qc"],
          title: `Засварын хүсэлтийн ${phase.label} хугацаа хэтэрлээ`,
          body: r.description,
          link: "/office/crm/rentals/maintenance",
          entity: "crm_maintenance_requests",
          entityId: r.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: r.office_id, ruleCode: phase.code, entity: "crm_maintenance_requests", entityId: r.id, status: "ok", result: { due: phase.due } });
        if (phase.code === "D-20") summary.d20Respond += 1;
        else summary.d20Resolve += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-20: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Д-25/Д-26: МУТСТ тоолуурууд (зөвхөн aml_officer/ceo) ──
  try {
    const { data: cases } = await admin
      .from("crm_aml_cases")
      .select("id, office_id, status, decision, str_due_at, threshold_due_on")
      .in("status", ["open", "investigating"]);
    for (const c of cases ?? []) {
      const officers = roleProfiles(staffIdx, c.office_id, ["aml_officer"]);
      if (!officers.length) continue;

      // Д-25: СМА-д мэдээлэх хугацаа (маргааш эсвэл өнгөрсөн).
      const g25 = gate(c.office_id, "D-25");
      if (g25.run && c.threshold_due_on && c.threshold_due_on <= addDaysIso(todayIso, 1)) {
        const past = c.threshold_due_on < todayIso;
        await notifyCrm({
          officeId: c.office_id,
          event: "aml_threshold_due",
          recipients: past ? [...officers, ...roleProfiles(staffIdx, c.office_id, ["ceo"])] : officers,
          title: past ? "СМА-д мэдээлэх хугацаа ХЭТЭРЛЭЭ" : "СМА-д мэдээлэх хугацаа дөхөж байна",
          body: `Босго давсан гүйлгээний мэдээллийн хугацаа: ${c.threshold_due_on}.`,
          link: `/office/crm/aml/${c.id}`,
          entity: "crm_aml_cases",
          entityId: c.id,
          admin,
          now,
        });
        summary.d25Alerts += 1;
      }

      // Д-26: СГТ 24 цагийн тоолуур (6 цагийн өмнөх дохио + хэтрэлтэд дээд шат).
      const g26 = gate(c.office_id, "D-26");
      if (g26.run && c.decision === "str" && c.str_due_at) {
        const msLeft = new Date(c.str_due_at).getTime() - now.getTime();
        if (msLeft <= 6 * HOUR_MS) {
          const past = msLeft < 0;
          await notifyCrm({
            officeId: c.office_id,
            event: "aml_str_due",
            recipients: past ? [...officers, ...roleProfiles(staffIdx, c.office_id, ["ceo"])] : officers,
            title: past ? "СГТ илгээх 24ц хугацаа ХЭТЭРЛЭЭ" : "СГТ илгээх хугацаа дөхөж байна",
            body: past
              ? "СГТ илгээгдээгүй — 24 цагийн хугацаа өнгөрсөн, яаралтай арга хэмжээ авна уу."
              : `СГТ-ийн хугацаа: ${fmtDateTime(c.str_due_at)}.`,
            link: `/office/crm/aml/${c.id}`,
            entity: "crm_aml_cases",
            entityId: c.id,
            admin,
            now,
          });
          summary.d26Alerts += 1;
        }
      }
    }
  } catch (e) {
    summary.errors.push(`D-25/26: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Алдаа → сисадминд.
  if (summary.errors.length) {
    for (const officeId of offices) {
      await notifyCrm({
        officeId,
        event: "rule_error",
        recipients: [],
        includeRoles: ["sysadmin"],
        title: "SLA-ийн автомат шалгалт алдаатай дууслаа",
        body: `${summary.errors.length} алдаа гарсан — автомат дүрмийн гүйцэтгэлийн логоос харна уу.`,
        link: "/office/crm/settings/rules",
        admin,
        now,
      });
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

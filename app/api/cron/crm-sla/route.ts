import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRuleMap, ruleGate, conditionParam, logRuleRun, hasRuleRun, listCrmOffices, type AdminClient, type AutomationRule } from "@/lib/crm/rules";
import { notifyCrm, deliverDeferredNotifications } from "@/lib/crm/notify";
import { assignLead, type AssignMode, type AssignRule } from "@/lib/crm/scoring";
import { isWorkday, slaDeadline, DEFAULT_WORK_HOURS } from "@/lib/crm/calendar";
import type { Json } from "@/types/database";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * CRM SLA cron (D8, §4.4) — 10 мин тутам (vercel.json; Vercel Pro шаардана,
 * Hobby бол гадаад scheduler-ээс CRON_SECRET-тэй дуудна):
 *  • Д-01 (үргэлжлэл): ажлын бус цагт дараалалд орсон сэжимийг дараагийн
 *    ажлын цагт хуваарилна (crm_assignment_state.queue drain);
 *  • Д-02: эхний холболтын SLA (15 мин, ажлын цагаар) хэтрэлт → агент+ахлагчид;
 *  • Д-03: 24 цагт дахин оролдлогын даалгавар;
 *  • Д-04: 48 цагт багийн ахлагч/захиралд эскалаци;
 *  • Д-20: засварын sla_respond_by/sla_resolve_by хэтрэлт → мэдэгдэл +
 *    Үйл ажиллагаа-ЧМТ-д шилжүүлэлтийн даалгавар;
 *  • Д-25 (үргэлжлэл): СМА-д мэдээлэх ажлын 5 өдрийн хугацаа дөхөлт/хэтрэлт;
 *  • Д-26: СГТ 24 цагийн тоолуур дөхөлт/хэтрэлтийн эскалаци (зөвхөн
 *    aml_officer/ceo — ACC-25: агент/харилцагчид дохио ХЭЗЭЭ Ч очихгүй);
 *  • чимээгүй цагт хойшлогдсон мэдэгдлийн хүргэлт (ажлын цагт).
 */

export const maxDuration = 120;

const HOUR_MS = 3600 * 1000;

function ubLocalHour(now: Date): number {
  return (now.getUTCHours() + 8) % 24; // Улаанбаатар UTC+8 (репогийн конвенц)
}

function inWorkHours(now: Date): boolean {
  const h = ubLocalHour(now);
  return isWorkday(now) && h >= DEFAULT_WORK_HOURS.startHour && h < DEFAULT_WORK_HOURS.endHour;
}

type StaffRow = { profile_id: string; roles: string[]; team_id: string | null };
type StaffIndex = Map<string, StaffRow[]>;

async function loadStaffIndex(admin: AdminClient): Promise<StaffIndex> {
  const idx: StaffIndex = new Map();
  const { data } = await admin
    .from("crm_staff")
    .select("office_id, profile_id, roles, team_id, offboarding")
    .eq("is_active", true);
  for (const s of data ?? []) {
    const arr = idx.get(s.office_id) ?? [];
    arr.push({ profile_id: s.profile_id, roles: (s.roles as string[]) ?? [], team_id: s.team_id });
    idx.set(s.office_id, arr);
  }
  return idx;
}

function roleProfiles(idx: StaffIndex, officeId: string, roles: CrmRole[]): string[] {
  return (idx.get(officeId) ?? [])
    .filter((s) => s.roles.some((r) => (roles as string[]).includes(r)))
    .map((s) => s.profile_id);
}

async function officeSettingRaw<T>(admin: AdminClient, officeId: string, key: string): Promise<T | null> {
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

async function createTask(
  admin: AdminClient,
  input: {
    officeId: string;
    responsibleId: string;
    title: string;
    description: string;
    priority?: "low" | "normal" | "high" | "urgent";
    deadlineMs?: number;
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
      deadline: new Date(Date.now() + (input.deadlineMs ?? 24 * HOUR_MS)).toISOString(),
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

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}` && searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const working = inWorkHours(now);

  const ruleMap = await getRuleMap(admin);
  const staffIdx = await loadStaffIndex(admin);
  const offices = await listCrmOffices(admin);

  const gate = (officeId: string, code: string): { run: boolean; dryRun: boolean; rule: AutomationRule | null } => {
    const rule = ruleMap.get(`${officeId}:${code}`) ?? null;
    const g = ruleGate(rule);
    return { run: g.run, dryRun: g.dryRun, rule };
  };

  const summary = {
    working,
    deferredDelivered: 0,
    queueAssigned: 0,
    d02Breaches: 0,
    d03Tasks: 0,
    d04Escalations: 0,
    d20Respond: 0,
    d20Resolve: 0,
    d25Alerts: 0,
    d26Alerts: 0,
    errors: [] as string[],
  };

  // ── 0. Чимээгүй цагт хойшлогдсон мэдэгдэл — ажлын цагт хүргэнэ (F-653) ──
  if (working) {
    try {
      summary.deferredDelivered = await deliverDeferredNotifications(admin, now);
    } catch (e) {
      summary.errors.push(`deferred: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 1. Д-01 үргэлжлэл: ажлын бус цагийн дарааллын хуваарилалт ──
  if (working) {
    try {
      const { data: states } = await admin
        .from("crm_assignment_state")
        .select("office_id, scope, last_assigned_profile_id, queue");
      for (const state of states ?? []) {
        const queue = Array.isArray(state.queue) ? ([...state.queue] as string[]) : [];
        if (!queue.length) continue;
        const g = gate(state.office_id, "D-01");
        if (!g.run) continue;

        const setting =
          (await officeSettingRaw<{ mode?: AssignMode; load_cap?: number; rules?: AssignRule[] }>(
            admin,
            state.office_id,
            "lead_assignment"
          )) ?? {};
        const candidates = (staffIdx.get(state.office_id) ?? [])
          .filter((s) => s.roles.includes("agent"))
          .map((s) => s.profile_id);
        if (!candidates.length) continue;

        // Ачаалал + жижүүр.
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
        const slaMin = (await officeSettingRaw<number>(admin, state.office_id, "sla_first_contact_min")) ?? 15;

        for (const leadId of queue) {
          const { data: lead } = await admin
            .from("crm_leads")
            .select("id, owner_id, status")
            .eq("id", leadId)
            .maybeSingle();
          if (!lead || lead.owner_id || !["new", "active"].includes(lead.status)) continue; // хоцрогдсон мөр — дарааллаас хасна

          const decision = assignLead({
            mode: setting.mode ?? "round_robin",
            candidates,
            dutyNow,
            cursor,
            loads,
            loadCap: setting.load_cap,
            rules: setting.rules ?? [],
            lead: {},
            isWorkHours: true,
            afterHours: "assign",
          });
          if (!decision.ownerId) {
            remaining.push(leadId);
            continue;
          }
          const due = slaDeadline(now, slaMin);
          const { error: upErr } = await admin
            .from("crm_leads")
            .update({ owner_id: decision.ownerId, first_contact_due_at: due.toISOString() })
            .eq("id", leadId);
          if (upErr) {
            summary.errors.push(`D-01 drain ${leadId}: ${upErr.message}`);
            remaining.push(leadId);
            continue;
          }
          cursor = decision.ownerId;
          loads[decision.ownerId] = (loads[decision.ownerId] ?? 0) + 1;

          await createTask(admin, {
            officeId: state.office_id,
            responsibleId: decision.ownerId,
            title: "Шинэ сэжимтэй эхний холболт хийх (Д-01)",
            description: `Ажлын бус цагт ирсэн сэжим — эхний холболтын SLA ${slaMin} мин одооноос тоологдоно.`,
            deadlineMs: due.getTime() - now.getTime(),
            entity: "lead",
            entityId: leadId,
            ruleCode: "D-01",
          });
          await notifyCrm({
            officeId: state.office_id,
            event: "lead_assigned",
            recipients: [decision.ownerId],
            title: "Шинэ сэжим оноогдлоо",
            body: "Ажлын бус цагийн дарааллаас танд сэжим хуваарилагдлаа — SLA тоолол эхэллээ.",
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
            result: { owner_id: decision.ownerId, queued_drain: true },
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
      }
    } catch (e) {
      summary.errors.push(`D-01: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 2. Д-02/03/04: эхний холболтын SLA гинж ──
  try {
    type SlaLead = {
      id: string;
      office_id: string;
      owner_id: string | null;
      first_contact_due_at: string | null;
      last_contact_at: string | null;
      status: string;
    };
    const { data: leadsRaw } = await admin
      .from("crm_leads")
      .select("id, office_id, owner_id, first_contact_due_at, last_contact_at, status")
      .in("status", ["new", "active"])
      .is("last_contact_at", null)
      .not("owner_id", "is", null)
      .not("first_contact_due_at", "is", null)
      .lt("first_contact_due_at", nowIso);
    const leads = (leadsRaw ?? []) as unknown as SlaLead[];

    for (const lead of leads) {
      const overdueMs = now.getTime() - new Date(lead.first_contact_due_at!).getTime();
      const staff = staffIdx.get(lead.office_id) ?? [];
      const ownerRow = staff.find((s) => s.profile_id === lead.owner_id);
      const teamLeads = staff
        .filter((s) => s.roles.includes("team_lead") && ownerRow?.team_id && s.team_id === ownerRow.team_id)
        .map((s) => s.profile_id);

      // Д-02: хэтрэлтийн дохио (нэг л удаа).
      const g02 = gate(lead.office_id, "D-02");
      if (
        g02.run &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-02", entity: "crm_leads", entityId: lead.id }))
      ) {
        await notifyCrm({
          officeId: lead.office_id,
          event: "lead_sla_breach",
          recipients: [lead.owner_id, ...teamLeads],
          title: "Эхний холболтын SLA хэтэрлээ",
          body: "Шинэ сэжимд эхний холболт хийгдээгүй — SLA хугацаа өнгөрсөн (Д-02).",
          link: `/agent/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-02", entity: "crm_leads", entityId: lead.id, status: "ok", result: { overdue_min: Math.round(overdueMs / 60000) } });
        summary.d02Breaches += 1;
      }

      // Д-03: 24 цагт дахин оролдлогын даалгавар.
      const g03 = gate(lead.office_id, "D-03");
      const h03 = conditionParam<number>(g03.rule?.condition, "hours", 24);
      if (
        g03.run &&
        overdueMs >= h03 * HOUR_MS &&
        lead.owner_id &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-03", entity: "crm_leads", entityId: lead.id }))
      ) {
        await createTask(admin, {
          officeId: lead.office_id,
          responsibleId: lead.owner_id,
          title: "Сэжимтэй дахин холбогдох оролдлого (Д-03)",
          description: `Эхний холболт ${h03} цагт хийгдээгүй — өөр суваг/цагаар дахин оролдоно.`,
          entity: "lead",
          entityId: lead.id,
          ruleCode: "D-03",
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-03", entity: "crm_leads", entityId: lead.id, status: "ok" });
        summary.d03Tasks += 1;
      }

      // Д-04: 48 цагт багийн ахлагч/захиралд эскалаци (шилжүүлэлтийн санал).
      const g04 = gate(lead.office_id, "D-04");
      const h04 = conditionParam<number>(g04.rule?.condition, "hours", 48);
      if (
        g04.run &&
        overdueMs >= h04 * HOUR_MS &&
        !(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-04", entity: "crm_leads", entityId: lead.id }))
      ) {
        const escalateTo = teamLeads.length ? teamLeads : roleProfiles(staffIdx, lead.office_id, ["sales_director"]);
        const responsible = escalateTo[0];
        if (responsible) {
          await createTask(admin, {
            officeId: lead.office_id,
            responsibleId: responsible,
            title: "Холбогдоогүй сэжимийг шилжүүлэх шийдвэр (Д-04)",
            description: `Эхний холболт ${h04} цагт хийгдээгүй — дахин хуваарилах/эргэлтэд оруулах шийдвэр гаргана (P-10 үндэслэлтэй).`,
            entity: "lead",
            entityId: lead.id,
            ruleCode: "D-04",
          });
        }
        await notifyCrm({
          officeId: lead.office_id,
          event: "lead_sla_breach",
          recipients: escalateTo,
          includeRoles: ["sales_director"],
          title: "Сэжимийн эскалаци (48ц)",
          body: "Эхний холболт удаашралтай — шилжүүлэлтийн шийдвэр шаардлагатай (Д-04).",
          link: `/office/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "D-04", entity: "crm_leads", entityId: lead.id, status: "ok" });
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
            title: `Засварын SLA хэтэрлээ — ${phase.label} (Д-20)`,
            description: `«${r.description.slice(0, 120)}» хүсэлтийн ${phase.label} SLA (${phase.due.slice(0, 16)}) хэтэрсэн — Үйл ажиллагаа-ЧМТ зохицуулна.`,
            priority: r.urgency === "urgent" ? "urgent" : "high",
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
          title: `Засварын SLA хэтэрлээ (${phase.label})`,
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

  // ── 4. Д-25/Д-26: МУТСТ тоолуурууд (зөвхөн aml_officer/ceo — ACC-25) ──
  try {
    const today = nowIso.slice(0, 10);
    const { data: cases } = await admin
      .from("crm_aml_cases")
      .select("id, office_id, status, decision, str_due_at, threshold_due_on")
      .in("status", ["open", "investigating"]);
    for (const c of cases ?? []) {
      const officers = roleProfiles(staffIdx, c.office_id, ["aml_officer"]);
      if (!officers.length) continue;

      // Д-25: СМА-д мэдээлэх ажлын 5 өдрийн хугацаа (маргааш эсвэл өнгөрсөн).
      const g25 = gate(c.office_id, "D-25");
      if (g25.run && c.threshold_due_on && c.threshold_due_on <= addDaysIsoLocal(today, 1)) {
        const past = c.threshold_due_on < today;
        await notifyCrm({
          officeId: c.office_id,
          event: "aml_threshold_due",
          recipients: past ? [...officers, ...roleProfiles(staffIdx, c.office_id, ["ceo"])] : officers,
          title: past ? "СМА-д мэдээлэх хугацаа ХЭТЭРЛЭЭ" : "СМА-д мэдээлэх хугацаа дөхөж байна",
          body: `Босго давсан гүйлгээний мэдээллийн хугацаа: ${c.threshold_due_on} (Д-25).`,
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
              ? "СГТ илгээгдээгүй — 24 цагийн хугацаа өнгөрсөн, яаралтай арга хэмжээ (Д-26)."
              : `СГТ-ийн хугацаа: ${new Date(c.str_due_at).toLocaleString("mn-MN")} (Д-26).`,
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

  // Алдаа → сисадминд (F-602).
  if (summary.errors.length) {
    for (const officeId of offices) {
      await notifyCrm({
        officeId,
        event: "rule_error",
        recipients: [],
        includeRoles: ["sysadmin"],
        title: "SLA cron алдаатай дууслаа",
        body: `crm-sla: ${summary.errors.length} алдаа — rule_runs логоос харна уу (F-602).`,
        link: "/office/crm/settings/rules",
        admin,
        now,
      });
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}

function addDaysIsoLocal(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

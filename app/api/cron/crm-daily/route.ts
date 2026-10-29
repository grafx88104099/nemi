import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/crm/cron-auth";
import {
  getRuleMap,
  listCrmOffices,
  ruleGate,
  conditionParam,
  logRuleRun,
  hasRuleRun,
  type AdminClient,
  type AutomationRule,
} from "@/lib/crm/rules";
import { notifyCrm, deliverDeferredNotifications, escalateUnreadNotifications } from "@/lib/crm/notify";
import { arrearsStepFor, missingEscalationSteps, isPreReminderDue, type ArrearsLadder } from "@/lib/crm/arrears";
import type { Json } from "@/types/database";
import type { CrmRole, LeadGrade } from "@/lib/constants-crm";

/**
 * CRM өдрийн cron (D8, §4.4) — өдөр бүр 01:30 UTC (= 09:30 УБ, vercel.json):
 *  • чимээгүй цагт хойшлогдсон мэдэгдлийн хүргэлт (F-653);
 *  • Д-15/16 — нэхэмжлэхийн урьдчилсан сануулга + хоцролтын шатлал (F-535/536);
 *  • Д-17/18 — гэрээний 60/30 хоногийн сунгалтын урсгал;
 *  • Д-21 — сарын менежментийн бүртгэл дутуугийн сануулга/эскалаци;
 *  • Д-23 — барьцааны тооцоо хийгдээгүй дуусгавар гэрээ;
 *  • Д-27 — идэвхгүйн тоолуурын өдөр тутмын refresh (P-10/F-128 суурь);
 *  • Д-28/29 — ангиллын давтамжийн эргэн холбогдолт + хэтрэлтийн эскалаци;
 *  • F-127/128 — хамгаалалтгүй тэмдэглэгээ, эргэлтэд оруулах санал;
 *  • F-105/125 — алтан дүрмийн өдөр тутмын integrity шалгалт;
 *  • F-205 / F-512 — листингийн болон менежментийн гэрээний дуусах сануулга;
 *  • F-454 — тооцоо үүсээгүй хаагдсан хэлцлийн гээгдэл скан (U7 уншина);
 *  • F-751 — NPS автомат илгээлт; F-754 — давтан харилцагчийн тэмдэглэгээ;
 *  • F-655 — уншигдаагүй мэдэгдлийн шилжих гинж.
 *
 * Дүрэм бүр crm_automation_rules мөрөөрөө хаагдана/dry_run болно (F-601);
 * үр дүн crm_rule_runs-д (F-602); алдаа сисадминд мэдэгдэнэ.
 */

export const maxDuration = 300;

const DAY_MS = 86400000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function daysSince(iso: string | null, today: string): number {
  if (!iso) return 0;
  return Math.max(
    0,
    Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(iso).setUTCHours(0, 0, 0, 0)) / DAY_MS)
  );
}

/** Идэвхтэй ажилтнуудын дүрийн толь (оффис → profile_id[]). */
type StaffIndex = Map<string, { profile_id: string; roles: string[]; team_id: string | null }[]>;

async function loadStaffIndex(admin: AdminClient): Promise<StaffIndex> {
  const idx: StaffIndex = new Map();
  const { data } = await admin
    .from("crm_staff")
    .select("office_id, profile_id, roles, team_id")
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

/** Тохиргооны одоогийн утга — оффис бүрд кэштэй. */
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

/** Даалгавар + crm_task_links (created_by = хариуцагч — §4.4 конвенц). */
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
      priority: input.priority ?? "normal",
      deadline: new Date(Date.now() + (input.deadlineMs ?? 2 * DAY_MS)).toISOString(),
    })
    .select("id")
    .single();
  if (error || !task) {
    console.error("crm-daily createTask:", error?.message);
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

type Gate = (officeId: string, code: string) => { run: boolean; dryRun: boolean; rule: AutomationRule | null };

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
  const { searchParams } = new URL(request.url);

  const admin = createAdminClient();
  const today = searchParams.get("date") ?? todayIso(); // ?date= — дахин гүйлгэлтэд
  const now = new Date();

  const ruleMap = await getRuleMap(admin);
  const offices = await listCrmOffices(admin);
  const staffIdx = await loadStaffIndex(admin);
  const officeSetting = makeSettingReader(admin);

  const gate: Gate = (officeId, code) => {
    const rule = ruleMap.get(`${officeId}:${code}`) ?? null;
    const g = ruleGate(rule);
    return { run: g.run, dryRun: g.dryRun, rule };
  };

  const summary = {
    deferredDelivered: 0,
    d15Reminders: 0,
    d16Escalations: 0,
    d17Tasks: 0,
    d18Tasks: 0,
    d21Notices: 0,
    d23Tasks: 0,
    d27Refreshed: 0,
    d28Suggested: 0,
    d29Alerts: 0,
    unprotectedMarked: 0,
    goldenRuleViolations: 0,
    f205Tasks: 0,
    f512Tasks: 0,
    f454Pending: 0,
    npsSent: 0,
    repeatMarked: 0,
    escalated: 0,
    errors: [] as string[],
  };

  // ── 0. Чимээгүй цагт хойшлогдсон мэдэгдлийн хүргэлт (F-653) ──
  try {
    summary.deferredDelivered = await deliverDeferredNotifications(admin, now);
  } catch (e) {
    summary.errors.push(`deferred: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 1. Д-15: нэхэмжлэхийн урьдчилсан сануулга ──
  try {
    const { data: upcoming } = await admin
      .from("crm_invoices")
      .select("id, office_id, number, due_on, amount, status, lease_id")
      .in("status", ["sent", "partially_paid"])
      .gte("due_on", today)
      .lte("due_on", addDaysIso(today, 14))
      .not("lease_id", "is", null);
    for (const inv of upcoming ?? []) {
      const g = gate(inv.office_id, "D-15");
      if (!g.run) {
        if (g.dryRun) await logRuleRun(admin, { officeId: inv.office_id, ruleCode: "D-15", entity: "crm_invoices", entityId: inv.id, status: "dry_run" });
        continue;
      }
      const beforeDays =
        (await officeSetting<number>(inv.office_id, "invoice_reminder_days")) ??
        conditionParam<number>(g.rule?.condition, "before_days", 3);
      if (!isPreReminderDue(inv.due_on, today, beforeDays)) continue;
      if (await hasRuleRun(admin, { officeId: inv.office_id, ruleCode: "D-15", entity: "crm_invoices", entityId: inv.id })) continue;

      const pms = roleProfiles(staffIdx, inv.office_id, ["property_manager"]);
      const responsible = pms[0] ?? roleProfiles(staffIdx, inv.office_id, ["finance", "sysadmin"])[0];
      if (responsible) {
        await createTask(admin, {
          officeId: inv.office_id,
          responsibleId: responsible,
          title: `Төлбөрийн урьдчилсан сануулга — ${inv.number} (Д-15)`,
          description: `Нэхэмжлэх ${inv.number} (${Number(inv.amount).toLocaleString()}₮) ${inv.due_on}-нд төлөгдөнө — түрээслэгчид сануулна уу. Гадаад SMS/и-мэйл: INT- интеграцгүй тул дотоод даалгавар (F-654).`,
          entity: "invoice",
          entityId: inv.id,
          ruleCode: "D-15",
        });
      }
      await notifyCrm({
        officeId: inv.office_id,
        event: "invoice_due",
        recipients: [responsible],
        includeRoles: ["property_manager"],
        title: "Төлбөрийн хугацаа дөхөж байна",
        body: `${inv.number}: ${inv.due_on}-нд ${Number(inv.amount).toLocaleString()}₮.`,
        link: "/office/crm/rentals/invoices",
        entity: "crm_invoices",
        entityId: inv.id,
        admin,
        now,
      });
      await logRuleRun(admin, { officeId: inv.office_id, ruleCode: "D-15", entity: "crm_invoices", entityId: inv.id, status: "ok", result: { due_on: inv.due_on } });
      summary.d15Reminders += 1;
    }
  } catch (e) {
    summary.errors.push(`D-15: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Д-16: хоцролтын шатлалын эскалаци (F-535/536/538) ──
  try {
    type OverdueInv = {
      id: string;
      office_id: string;
      number: string;
      due_on: string;
      amount: number;
      lease_id: string;
      lease: { id: string; grace_days: number; created_by: string; is_managed: boolean } | null;
    };
    const { data: overdue } = await admin
      .from("crm_invoices")
      .select(
        "id, office_id, number, due_on, amount, lease_id, " +
          "lease:crm_leases!crm_invoices_lease_id_fkey(id, grace_days, created_by, is_managed)"
      )
      .in("status", ["sent", "partially_paid"])
      .lt("due_on", today)
      .not("lease_id", "is", null);
    const rows = (overdue ?? []) as unknown as OverdueInv[];

    // Гэрээ бүрийн өмнөх хоцролттой нэхэмжлэхийн тоо (F-538 давтагдсан хоцролт).
    const leaseIds = [...new Set(rows.map((r) => r.lease_id))];
    const priorLate = new Map<string, Set<string>>();
    if (leaseIds.length) {
      const { data: escs } = await admin
        .from("crm_arrears_escalations")
        .select("lease_id, invoice_id")
        .in("lease_id", leaseIds);
      for (const e of escs ?? []) {
        const set = priorLate.get(e.lease_id) ?? new Set<string>();
        set.add(e.invoice_id);
        priorLate.set(e.lease_id, set);
      }
    }

    for (const inv of rows) {
      const g = gate(inv.office_id, "D-16");
      if (!g.run) continue;
      const ladder = (await officeSetting<ArrearsLadder>(inv.office_id, "arrears_ladder")) ?? { steps: [] };
      const { data: recorded } = await admin
        .from("crm_arrears_escalations")
        .select("step")
        .eq("invoice_id", inv.id);
      const recordedSteps = (recorded ?? []).map((r) => r.step);
      const priorSet = priorLate.get(inv.lease_id) ?? new Set<string>();
      const priorLateCount = [...priorSet].filter((x) => x !== inv.id).length;
      const target = arrearsStepFor({
        dueOn: inv.due_on,
        graceDays: inv.lease?.grace_days ?? 0,
        today,
        ladder,
        priorLateCount,
      });
      const missing = missingEscalationSteps(target, recordedSteps, ladder);
      for (const step of missing) {
        const stepProfiles = roleProfiles(staffIdx, inv.office_id, [step.role]);
        const responsible = stepProfiles[0] ?? inv.lease?.created_by ?? null;
        let taskId: string | null = null;
        if (responsible) {
          taskId = await createTask(admin, {
            officeId: inv.office_id,
            responsibleId: responsible,
            title: `Хоцролт — ${step.step}-р шат: ${inv.number} (Д-16)`,
            description: `Нэхэмжлэх ${inv.number} (${Number(inv.amount).toLocaleString()}₮, төлөх өдөр ${inv.due_on}) хоцорсон — шатлалын ${step.step}-р шатны арга хэмжээ (F-535).`,
            priority: "high",
            deadlineMs: DAY_MS,
            entity: "invoice",
            entityId: inv.id,
            ruleCode: "D-16",
          });
        }
        const { error: escErr } = await admin.from("crm_arrears_escalations").insert({
          office_id: inv.office_id,
          invoice_id: inv.id,
          lease_id: inv.lease_id,
          step: step.step,
          assigned_role: step.role,
          task_id: taskId,
        });
        if (escErr) {
          summary.errors.push(`D-16 ${inv.id}/${step.step}: ${escErr.message}`);
          continue;
        }
        await notifyCrm({
          officeId: inv.office_id,
          event: "arrears_step",
          recipients: [inv.lease?.created_by, ...stepProfiles],
          title: `Хоцролтын ${step.step}-р шат`,
          body: `${inv.number}: төлөгдөөгүй ${Number(inv.amount).toLocaleString()}₮ — шат ${step.step} (${step.role}).`,
          link: "/office/crm/rentals/invoices",
          entity: "crm_invoices",
          entityId: inv.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: inv.office_id, ruleCode: "D-16", entity: "crm_invoices", entityId: inv.id, status: "ok", result: { step: step.step, role: step.role } });
        summary.d16Escalations += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-16: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Д-17/18: гэрээ дуусах 60/30 хоногийн урсгал ──
  try {
    const { data: expiring } = await admin
      .from("crm_leases")
      .select("id, office_id, number, end_on, is_managed, created_by, tenant_contact_id")
      .eq("status", "active")
      .gte("end_on", today)
      .lte("end_on", addDaysIso(today, 90));
    for (const lease of expiring ?? []) {
      const renewal = (await officeSetting<{ lease?: [number, number] }>(lease.office_id, "renewal_days"))?.lease ?? [60, 30];
      const [d60, d30] = [renewal[0] ?? 60, renewal[1] ?? 30];
      const daysLeft = Math.round((new Date(`${lease.end_on}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY_MS);

      // Д-17: эхний босго — ҮХХ багт түүх бэлтгэх даалгавар.
      if (daysLeft <= d60) {
        const g = gate(lease.office_id, "D-17");
        if (g.run && !(await hasRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-17", entity: "crm_leases", entityId: lease.id }))) {
          const pm = roleProfiles(staffIdx, lease.office_id, ["property_manager"])[0] ?? lease.created_by;
          await createTask(admin, {
            officeId: lease.office_id,
            responsibleId: pm,
            title: `Сунгалтын бэлтгэл — ${lease.number} (Д-17)`,
            description: `Гэрээ ${lease.end_on}-нд дуусна (${daysLeft} хоног). Түрээсийн түүх, төлбөрийн байдал, шинэ нөхцөлийн санал бэлтгэнэ.`,
            deadlineMs: 7 * DAY_MS,
            entity: "lease",
            entityId: lease.id,
            ruleCode: "D-17",
          });
          await logRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-17", entity: "crm_leases", entityId: lease.id, status: "ok", result: { days_left: daysLeft } });
          summary.d17Tasks += 1;
        }
      }

      // Д-18: хоёр дахь босго — сунгалт шийдэгдээгүй бол хэлэлцээрийн даалгавар + мэдэгдэл.
      if (daysLeft <= d30) {
        const g = gate(lease.office_id, "D-18");
        if (!g.run) continue;
        const { data: renewed } = await admin
          .from("crm_leases")
          .select("id")
          .eq("previous_lease_id", lease.id)
          .limit(1);
        if (renewed?.length) continue; // сунгалт аль хэдийн бүртгэгдсэн
        if (await hasRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-18", entity: "crm_leases", entityId: lease.id })) continue;

        await createTask(admin, {
          officeId: lease.office_id,
          responsibleId: lease.created_by,
          title: `Сунгалтын хэлэлцээр — ${lease.number} (Д-18)`,
          description: `Гэрээ ${lease.end_on}-нд дуусна (${daysLeft} хоног) — сунгалт шийдэгдээгүй. Түрээслэгч/өмчлөгчтэй хэлэлцээр хийнэ (өмчлөгчид мэдэгдэх гадаад суваг INT- заглушка).`,
          priority: "high",
          deadlineMs: 5 * DAY_MS,
          entity: "lease",
          entityId: lease.id,
          ruleCode: "D-18",
        });
        await notifyCrm({
          officeId: lease.office_id,
          event: "lease_renewal_due",
          recipients: [lease.created_by],
          includeRoles: ["property_manager"],
          title: "Гэрээ дуусах дөхлөө",
          body: `${lease.number}: ${lease.end_on} (${daysLeft} хоног) — сунгалт шийдэгдээгүй.`,
          link: `/office/crm/rentals/leases/${lease.id}`,
          entity: "crm_leases",
          entityId: lease.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-18", entity: "crm_leases", entityId: lease.id, status: "ok", result: { days_left: daysLeft } });
        summary.d18Tasks += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-17/18: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Д-21: сарын бүртгэл дутуугийн сануулга ──
  try {
    const month = `${today.slice(0, 7)}-01`;
    const prevMonth = addDaysIso(month, -1).slice(0, 7) + "-01";
    const { data: incomplete } = await admin
      .from("crm_monthly_records")
      .select("id, office_id, month, completeness_pct")
      .in("month", [month, prevMonth])
      .lt("completeness_pct", 100);
    const byOffice = new Map<string, { cur: number; prev: number }>();
    for (const r of incomplete ?? []) {
      const agg = byOffice.get(r.office_id) ?? { cur: 0, prev: 0 };
      if (r.month === month) agg.cur += 1;
      else agg.prev += 1;
      byOffice.set(r.office_id, agg);
    }
    const dayOfMonth = Number(today.slice(8, 10));
    for (const [officeId, agg] of byOffice) {
      const g = gate(officeId, "D-21");
      if (!g.run) continue;
      const reminderDay = (await officeSetting<number>(officeId, "monthly_record_reminder_day")) ?? 25;
      if (agg.cur > 0 && dayOfMonth >= reminderDay) {
        await notifyCrm({
          officeId,
          event: "monthly_record_due",
          recipients: [],
          includeRoles: ["property_manager"],
          title: "Сарын бүртгэл дутуу",
          body: `Энэ сард ${agg.cur} объектын сарын менежментийн бүртгэл дутуу байна (Д-21).`,
          link: "/office/crm/rentals/monthly",
          admin,
          now,
        });
        summary.d21Notices += 1;
      }
      if (agg.prev > 0) {
        // Сар дууссан — Үйл ажиллагаа-ЧМТ-д эскалаци.
        await notifyCrm({
          officeId,
          event: "monthly_record_due",
          recipients: [],
          includeRoles: ["property_manager", "ops_qc"],
          title: "Өнгөрсөн сарын бүртгэл дутуу",
          body: `Өнгөрсөн сарын ${agg.prev} бүртгэл 100% болоогүй — PM тооцоо хойшилно (F-559).`,
          link: `/office/crm/rentals/monthly?month=${prevMonth.slice(0, 7)}`,
          admin,
          now,
        });
        summary.d21Notices += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`D-21: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 5. Д-23: барьцааны тооцоо хийгдээгүй дуусгавар гэрээ ──
  try {
    const { data: ended } = await admin
      .from("crm_leases")
      .select("id, office_id, number, deposit_amount, deposit_returned_on, created_by, status")
      .in("status", ["terminated", "expired"])
      .gt("deposit_amount", 0)
      .is("deposit_returned_on", null);
    for (const lease of ended ?? []) {
      const g = gate(lease.office_id, "D-23");
      if (!g.run) continue;
      if (await hasRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-23", entity: "crm_leases", entityId: lease.id })) continue;
      const pm = roleProfiles(staffIdx, lease.office_id, ["property_manager"])[0] ?? lease.created_by;
      await createTask(admin, {
        officeId: lease.office_id,
        responsibleId: pm,
        title: `Гарах үзлэг + барьцааны тооцоо — ${lease.number} (Д-23)`,
        description: `Гэрээ дуусгавар болсон — move-out үзлэг, суутгалын задаргаа (F-541–544), барьцаа буцаалт хийнэ (${Number(lease.deposit_amount).toLocaleString()}₮).`,
        priority: "high",
        deadlineMs: 3 * DAY_MS,
        entity: "lease",
        entityId: lease.id,
        ruleCode: "D-23",
      });
      await notifyCrm({
        officeId: lease.office_id,
        event: "deposit_return_due",
        recipients: [pm],
        includeRoles: ["property_manager"],
        title: "Барьцаа буцаалтын хугацаа",
        body: `${lease.number}: барьцааны тооцоо хийгдээгүй (${Number(lease.deposit_amount).toLocaleString()}₮).`,
        link: `/office/crm/rentals/leases/${lease.id}`,
        entity: "crm_leases",
        entityId: lease.id,
        admin,
        now,
      });
      await logRuleRun(admin, { officeId: lease.office_id, ruleCode: "D-23", entity: "crm_leases", entityId: lease.id, status: "ok" });
      summary.d23Tasks += 1;
    }
  } catch (e) {
    summary.errors.push(`D-23: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 6. Д-27: идэвхгүйн тоолуурын refresh + Д-28/29 + F-127/128 ──
  try {
    type LeadRow = {
      id: string;
      office_id: string;
      owner_id: string | null;
      grade: LeadGrade | null;
      status: string;
      last_contact_at: string | null;
      created_at: string;
      next_step_date: string | null;
      inactivity_days: number;
      unprotected: boolean;
    };
    const { data: leadsRaw } = await admin
      .from("crm_leads")
      .select("id, office_id, owner_id, grade, status, last_contact_at, created_at, next_step_date, inactivity_days, unprotected")
      .in("status", ["new", "active"]);
    const leads = (leadsRaw ?? []) as unknown as LeadRow[];

    const DEFAULT_FREQ: Record<LeadGrade, number> = { a: 3, b: 7, c: 21, d: 60 };
    const DEFAULT_INACTIVITY: Record<LeadGrade, number> = { a: 14, b: 30, c: 60, d: 90 };

    for (const lead of leads) {
      const inact = daysSince(lead.last_contact_at ?? lead.created_at, today);

      // Д-27: тоолуур шинэчлэх (өөрчлөгдсөн үед л бичнэ).
      const g27 = gate(lead.office_id, "D-27");
      if (g27.run && inact !== lead.inactivity_days) {
        const { error } = await admin.from("crm_leads").update({ inactivity_days: inact }).eq("id", lead.id);
        if (!error) summary.d27Refreshed += 1;
      }

      const freq =
        (await officeSetting<Record<LeadGrade, number>>(lead.office_id, "recontact_frequency")) ?? DEFAULT_FREQ;

      // Д-28: ангилалтай, дараагийн алхмын огноогүй (шинэ) сэжимд саналын огноо.
      if (lead.status === "new" && lead.grade && !lead.next_step_date) {
        const g28 = gate(lead.office_id, "D-28");
        if (g28.run) {
          const suggest = addDaysIso(today, freq[lead.grade] ?? 7);
          const { error } = await admin
            .from("crm_leads")
            .update({ next_step_date: suggest, next_step: "Эргэн холбогдох (Д-28)" })
            .eq("id", lead.id)
            .is("next_step_date", null);
          if (!error) summary.d28Suggested += 1;
        }
      }

      // Д-29: давтамж хэтэрсэн — агентад сануулга, 2× хэтрэлтэд багийн ахлагчид.
      if (lead.status === "active" && lead.grade && lead.owner_id) {
        const g29 = gate(lead.office_id, "D-29");
        const limit = freq[lead.grade] ?? 7;
        if (g29.run && inact >= limit) {
          const doubled = inact >= limit * 2;
          const staff = staffIdx.get(lead.office_id) ?? [];
          const ownerRow = staff.find((s) => s.profile_id === lead.owner_id);
          const teamLeads = doubled
            ? staff
                .filter((s) => s.roles.includes("team_lead") && ownerRow?.team_id && s.team_id === ownerRow.team_id)
                .map((s) => s.profile_id)
            : [];
          const res = await notifyCrm({
            officeId: lead.office_id,
            event: "next_step_overdue",
            recipients: [lead.owner_id, ...teamLeads],
            title: doubled ? "Эргэн холбогдолт ноцтой хэтэрлээ" : "Эргэн холбогдох давтамж хэтэрлээ",
            body: `${lead.grade.toUpperCase()} ангиллын сэжим ${inact} хоног идэвхгүй (босго ${limit} — Д-29).`,
            link: `/agent/crm/leads/${lead.id}`,
            entity: "crm_leads",
            entityId: lead.id,
            admin,
            now,
          });
          if (res.delivered > 0) summary.d29Alerts += 1;
        }

        // F-127/128: идэвхгүйн босго давбал хамгаалалтгүй тэмдэглэгээ + эргэлтийн санал.
        const inactivityCfg =
          (await officeSetting<Record<LeadGrade, number>>(lead.office_id, "inactivity_thresholds")) ??
          DEFAULT_INACTIVITY;
        const threshold = inactivityCfg[lead.grade] ?? 90;
        if (inact >= threshold && !lead.unprotected) {
          const { error } = await admin.from("crm_leads").update({ unprotected: true }).eq("id", lead.id);
          if (!error) {
            summary.unprotectedMarked += 1;
            await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "F-128", entity: "crm_leads", entityId: lead.id, status: "ok", result: { inactivity_days: inact, threshold } });
            await notifyCrm({
              officeId: lead.office_id,
              event: "next_step_overdue",
              recipients: [lead.owner_id],
              includeRoles: ["sales_director"],
              title: "Сэжим хамгаалалтгүй боллоо",
              body: `Идэвхгүй ${inact} хоног (босго ${threshold}) — эргэлтэд оруулах/дахин хуваарилах саналыг хянана уу (F-128).`,
              link: `/office/crm/leads/${lead.id}`,
              entity: "crm_leads",
              entityId: lead.id,
              admin,
              now,
            });
          }
        }
      }
    }
  } catch (e) {
    summary.errors.push(`D-27/28/29: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 7. F-105/125: алтан дүрмийн өдөр тутмын integrity шалгалт ──
  try {
    const { data: violations } = await admin
      .from("crm_leads")
      .select("id, office_id, owner_id, grade, last_contact_at, next_step, next_step_date")
      .eq("status", "active")
      .or("owner_id.is.null,grade.is.null,last_contact_at.is.null,next_step.is.null,next_step_date.is.null");
    const byOffice = new Map<string, string[]>();
    for (const v of violations ?? []) {
      const arr = byOffice.get(v.office_id) ?? [];
      arr.push(v.id);
      byOffice.set(v.office_id, arr);
    }
    summary.goldenRuleViolations = (violations ?? []).length;
    for (const [officeId, ids] of byOffice) {
      await logRuleRun(admin, {
        officeId,
        ruleCode: "F-125",
        entity: "crm_leads",
        entityId: null,
        status: "error",
        result: { violation_ids: ids.slice(0, 50), count: ids.length },
        error: "golden_rule_violations",
      });
      await notifyCrm({
        officeId,
        event: "rule_error",
        recipients: [],
        includeRoles: ["sales_director", "ops_qc"],
        title: "Алтан дүрмийн зөрчил илэрлээ",
        body: `${ids.length} идэвхтэй сэжимд 5 бүрдлийн аль нэг дутуу (F-125) — самбараас шалгана уу.`,
        link: "/office/crm/leads",
        admin,
        now,
      });
    }
  } catch (e) {
    summary.errors.push(`F-125: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 8. F-205: листингийн гэрээний дуусах сануулга ──
  try {
    type ListingAgr = {
      id: string;
      office_id: string;
      number: string;
      expires_on: string;
      property_id: string;
      property: { status: string; number: string; name: string } | null;
    };
    const { data: agrsRaw } = await admin
      .from("crm_listing_agreements")
      .select("id, office_id, number, expires_on, property_id, property:crm_properties!crm_listing_agreements_property_id_fkey(status, number, name)")
      .lte("expires_on", addDaysIso(today, 30));
    const agrs = (agrsRaw ?? []) as unknown as ListingAgr[];
    for (const agr of agrs) {
      if (!agr.property || !["active", "reserved"].includes(agr.property.status)) continue;
      if (await hasRuleRun(admin, { officeId: agr.office_id, ruleCode: "F-205", entity: "crm_listing_agreements", entityId: agr.id })) continue;
      const { data: roles } = await admin
        .from("crm_property_roles")
        .select("agent_profile_id, role")
        .eq("property_id", agr.property_id);
      const agent =
        (roles ?? []).find((r) => r.role === "sourcing")?.agent_profile_id ??
        (roles ?? [])[0]?.agent_profile_id ??
        roleProfiles(staffIdx, agr.office_id, ["sales_director"])[0];
      if (agent) {
        await createTask(admin, {
          officeId: agr.office_id,
          responsibleId: agent,
          title: `Листингийн гэрээ дуусах дөхлөө — ${agr.property.number} (F-205)`,
          description: `Гэрээ №${agr.number} ${agr.expires_on}-нд дуусна. Сунгах эсвэл листингийг идэвхгүй болгоно.`,
          deadlineMs: 5 * DAY_MS,
          entity: "listing_agreement",
          entityId: agr.id,
          ruleCode: "F-205",
        });
        await logRuleRun(admin, { officeId: agr.office_id, ruleCode: "F-205", entity: "crm_listing_agreements", entityId: agr.id, status: "ok", result: { expires_on: agr.expires_on } });
        summary.f205Tasks += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`F-205: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 9. F-512: менежментийн гэрээний сунгалтын сануулга ──
  try {
    const { data: mgmt } = await admin
      .from("crm_management_agreements")
      .select("id, office_id, number, end_on, renewal_reminder_days")
      .eq("status", "active")
      .not("end_on", "is", null);
    for (const agr of mgmt ?? []) {
      const remind = agr.renewal_reminder_days ?? 60;
      if (!agr.end_on || agr.end_on > addDaysIso(today, remind)) continue;
      if (await hasRuleRun(admin, { officeId: agr.office_id, ruleCode: "F-512", entity: "crm_management_agreements", entityId: agr.id })) continue;
      const pm = roleProfiles(staffIdx, agr.office_id, ["property_manager"])[0];
      if (!pm) continue;
      await createTask(admin, {
        officeId: agr.office_id,
        responsibleId: pm,
        title: `Менежментийн гэрээний сунгалт — ${agr.number} (F-512)`,
        description: `Гэрээ ${agr.end_on}-нд дуусна — өмчлөгчтэй сунгалтын хэлэлцээр эхлүүлнэ.`,
        deadlineMs: 7 * DAY_MS,
        entity: "management_agreement",
        entityId: agr.id,
        ruleCode: "F-512",
      });
      await logRuleRun(admin, { officeId: agr.office_id, ruleCode: "F-512", entity: "crm_management_agreements", entityId: agr.id, status: "ok", result: { end_on: agr.end_on } });
      summary.f512Tasks += 1;
    }
  } catch (e) {
    summary.errors.push(`F-512: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 10. F-454: тооцоо үүсээгүй хаагдсан хэлцлийн гээгдэл ──
  try {
    const { data: closed } = await admin
      .from("crm_transactions")
      .select("id, office_id, number, closed_on")
      .eq("status", "closed")
      .not("closed_on", "is", null)
      .lt("closed_on", today); // өчигдрөөс өмнө хаагдсан (өнөөдрийнх action-аараа үүсгэнэ)
    const txnIds = (closed ?? []).map((t) => t.id);
    const withCommission = new Set<string>();
    if (txnIds.length) {
      const { data: comms } = await admin
        .from("crm_commission_records")
        .select("transaction_id")
        .in("transaction_id", txnIds);
      for (const c of comms ?? []) if (c.transaction_id) withCommission.add(c.transaction_id);
    }
    for (const txn of closed ?? []) {
      if (withCommission.has(txn.id)) continue;
      if (await hasRuleRun(admin, { officeId: txn.office_id, ruleCode: "F-454", entity: "crm_transactions", entityId: txn.id })) continue;
      await logRuleRun(admin, {
        officeId: txn.office_id,
        ruleCode: "F-454",
        entity: "crm_transactions",
        entityId: txn.id,
        status: "pending",
        result: { number: txn.number, closed_on: txn.closed_on },
      });
      await notifyCrm({
        officeId: txn.office_id,
        event: "commission_status",
        recipients: [],
        includeRoles: ["finance", "sales_director"],
        title: "Тооцоо үүсээгүй хаагдсан хэлцэл",
        body: `${txn.number} (${txn.closed_on}) — шимтгэлийн тооцоо үүсээгүй байна (F-454).`,
        link: "/office/crm/commissions",
        entity: "crm_transactions",
        entityId: txn.id,
        admin,
        now,
      });
      summary.f454Pending += 1;
    }
  } catch (e) {
    summary.errors.push(`F-454: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 11. F-751: NPS автомат илгээлт (хаалтын дараах тохиргоот хугацаанд) ──
  try {
    const { data: closed } = await admin
      .from("crm_transactions")
      .select("id, office_id, number, closed_on")
      .eq("status", "closed")
      .not("closed_on", "is", null);
    for (const txn of closed ?? []) {
      const g = gate(txn.office_id, "D-09"); // NPS = post-sale багцын нэг хэсэг
      if (!g.run) continue;
      const delay = (await officeSetting<number>(txn.office_id, "nps_send_delay_days")) ?? 3;
      if (!txn.closed_on || addDaysIso(txn.closed_on, delay) > today) continue;
      const { data: existing } = await admin
        .from("crm_nps_surveys")
        .select("id")
        .eq("transaction_id", txn.id)
        .limit(1);
      if (existing?.length) continue;

      const { data: parties } = await admin
        .from("crm_transaction_parties")
        .select("contact_id, role")
        .eq("transaction_id", txn.id)
        .in("role", ["buyer", "lessee"]);
      const contactIds = [...new Set((parties ?? []).map((p) => p.contact_id))];
      if (!contactIds.length) {
        await logRuleRun(admin, { officeId: txn.office_id, ruleCode: "F-751", entity: "crm_transactions", entityId: txn.id, status: "skipped", result: { reason: "no_customer_party" } });
        continue;
      }
      let created = 0;
      for (const contactId of contactIds) {
        const { error } = await admin.from("crm_nps_surveys").insert({
          office_id: txn.office_id,
          transaction_id: txn.id,
          contact_id: contactId,
          sent_at: new Date().toISOString(),
        });
        if (!error) created += 1;
        else if (error.code !== "23505") summary.errors.push(`F-751 ${txn.id}: ${error.message}`);
      }
      if (created > 0) {
        await logRuleRun(admin, {
          officeId: txn.office_id,
          ruleCode: "F-751",
          entity: "crm_transactions",
          entityId: txn.id,
          status: "ok",
          result: { created, external_send: "no_integration" },
        });
        summary.npsSent += created;
      }
    }
  } catch (e) {
    summary.errors.push(`F-751: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 12. F-754: давтан харилцагчийн автомат тэмдэглэгээ (≥2 хаагдсан хэлцэл) ──
  try {
    const { data: closedParties } = await admin
      .from("crm_transaction_parties")
      .select("contact_id, transaction_id, txn:crm_transactions!crm_transaction_parties_transaction_id_fkey(status)")
      .in("role", ["buyer", "lessee", "seller", "lessor"]);
    const closedCount = new Map<string, Set<string>>();
    for (const p of (closedParties ?? []) as unknown as { contact_id: string; transaction_id: string; txn: { status: string } | null }[]) {
      if (p.txn?.status !== "closed") continue;
      const set = closedCount.get(p.contact_id) ?? new Set<string>();
      set.add(p.transaction_id);
      closedCount.set(p.contact_id, set);
    }
    const repeatIds = [...closedCount.entries()].filter(([, s]) => s.size >= 2).map(([c]) => c);
    if (repeatIds.length) {
      const { data: contacts } = await admin
        .from("crm_contacts")
        .select("id, office_id")
        .in("id", repeatIds)
        .eq("is_repeat", false);
      for (const c of contacts ?? []) {
        const { error } = await admin.from("crm_contacts").update({ is_repeat: true }).eq("id", c.id);
        if (!error) {
          summary.repeatMarked += 1;
          await admin.from("crm_audit_log").insert({
            office_id: c.office_id,
            actor_id: null,
            entity: "crm_contacts",
            entity_id: c.id,
            action: "update",
            field: "is_repeat",
            new_value: true as unknown as Json,
            reason: "F-754: ≥2 хаагдсан хэлцэл — давтан харилцагч",
          });
        }
      }
    }
  } catch (e) {
    summary.errors.push(`F-754: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 13. F-655: уншигдаагүй мэдэгдлийн шилжих гинж ──
  try {
    for (const officeId of offices) {
      summary.escalated += await escalateUnreadNotifications(admin, officeId, now);
    }
  } catch (e) {
    summary.errors.push(`F-655: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Алдааны мэдэгдэл сисадминд (F-602) ──
  if (summary.errors.length) {
    for (const officeId of offices) {
      await notifyCrm({
        officeId,
        event: "rule_error",
        recipients: [],
        includeRoles: ["sysadmin"],
        title: "Өдрийн cron алдаатай дууслаа",
        body: `crm-daily: ${summary.errors.length} алдаа — rule_runs логоос харна уу (F-602).`,
        link: "/office/crm/settings/rules",
        admin,
        now,
      });
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, date: today, ...summary });
}

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
  normalizeAutomationThresholds,
  leadProtectionState,
  isHotLeadInactive,
  showingFeedbackState,
  isOfferExpiring,
  isOfferFollowupDue,
  isoDaysBetween,
  type AdminClient,
  type AutomationRule,
  type AutomationThresholds,
} from "@/lib/crm/rules";
import {
  computeLeadScore,
  normalizeScoreFactors,
  normalizeScoreWeights,
  recontactDays,
  DEFAULT_RECONTACT_RANGES,
  type NeedProfileSnapshot,
  type RecontactRanges,
} from "@/lib/crm/scoring";
import { toIsoDate } from "@/lib/crm/calendar";
import { notifyCrm, deliverDeferredNotifications, escalateUnreadNotifications } from "@/lib/crm/notify";
import { arrearsStepFor, missingEscalationSteps, isPreReminderDue, type ArrearsLadder } from "@/lib/crm/arrears";
import type { Database, Json } from "@/types/database";
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

/** Өнөөдөр — Улаанбаатарын огноогоор. */
function todayIso(): string {
  return toIsoDate(new Date());
}

/** Үнийн санал, хэлэлцээрийн шатны кодууд (§6.13/§6.14, U1 шатны буулгалт). */
const OFFER_STAGE_CODES = ["offer", "negotiation"];

type NeedProfileRow = Database["public"]["Tables"]["crm_need_profiles"]["Row"];

function jsonArr(v: Json | null | undefined): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

/** crm_need_profiles мөр → онооны профайлын агшин зураг (§6.6/§6.7). */
function profileSnapshot(p: NeedProfileRow): NeedProfileSnapshot {
  return {
    goalId: p.goal_id,
    locations: jsonArr(p.locations),
    propertyTypes: p.property_types,
    budgetMin: p.budget_min,
    budgetMax: p.budget_max,
    budgetTarget: p.budget_target,
    financing: p.financing,
    roomsMin: p.rooms_min,
    areaMin: p.area_min,
    timeline: p.timeline,
    moveInDate: p.move_in_date,
    profileType: p.profile_type,
    mustHaves: jsonArr(p.must_haves),
    niceToHaves: jsonArr(p.nice_to_haves),
    dealBreakers: jsonArr(p.deal_breakers),
    decisionMaker: p.decision_maker,
    decisionMakerId: p.decision_maker_id,
    decisionMakerInvolved: p.decision_maker_involved,
    blocker: p.blocker,
    blockerId: p.blocker_id,
  };
}

/** crm_settings 'recontact_ranges' → ангилал бүрд бүрэн муж (дутуу бол анхдагч). */
function recontactRangesOf(raw: unknown): RecontactRanges {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RecontactRanges>;
  const out = { ...DEFAULT_RECONTACT_RANGES };
  for (const g of ["a", "b", "c", "d"] as const) {
    const v = r[g];
    if (v && typeof v.min_days === "number" && typeof v.max_days === "number" && typeof v.default_days === "number") {
      out[g] = v;
    }
  }
  return out;
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

function teamLeadsOf(idx: StaffIndex, officeId: string, profileId: string | null): string[] {
  const staff = idx.get(officeId) ?? [];
  const team = staff.find((s) => s.profile_id === profileId)?.team_id;
  if (!team) return [];
  return staff.filter((s) => s.team_id === team && s.roles.includes("team_lead")).map((s) => s.profile_id);
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
  const thresholdCache = new Map<string, AutomationThresholds>();
  const thresholdsOf = async (officeId: string): Promise<AutomationThresholds> => {
    const hit = thresholdCache.get(officeId);
    if (hit) return hit;
    const th = normalizeAutomationThresholds(await officeSetting<unknown>(officeId, "automation_thresholds"));
    thresholdCache.set(officeId, th);
    return th;
  };

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
    protectionWarned: 0,
    hotLeadInactive: 0,
    nextStepOverdue: 0,
    offerFollowups: 0,
    offersExpiring: 0,
    showingFeedbackOverdue: 0,
    showingFeedbackEscalated: 0,
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
          title: `Төлбөрийн урьдчилсан сануулга — ${inv.number}`,
          description: `Нэхэмжлэх ${inv.number} (${Number(inv.amount).toLocaleString()}₮) ${inv.due_on}-нд төлөгдөнө — түрээслэгчид сануулна уу.`,
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
            title: `Хоцролт — ${step.step}-р шат: ${inv.number}`,
            description: `Нэхэмжлэх ${inv.number} (${Number(inv.amount).toLocaleString()}₮, төлөх өдөр ${inv.due_on}) хоцорсон — шатлалын ${step.step}-р шатны арга хэмжээ.`,
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
            title: `Сунгалтын бэлтгэл — ${lease.number}`,
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
          title: `Сунгалтын хэлэлцээр — ${lease.number}`,
          description: `Гэрээ ${lease.end_on}-нд дуусна (${daysLeft} хоног) — сунгалт шийдэгдээгүй. Түрээслэгч/өмчлөгчтэй хэлэлцээр хийнэ.`,
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
          body: `Энэ сард ${agg.cur} объектын сарын менежментийн бүртгэл дутуу байна.`,
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
          body: `Өнгөрсөн сарын ${agg.prev} бүртгэл 100% болоогүй — PM тооцоо хойшилно.`,
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
        title: `Гарах үзлэг + барьцааны тооцоо — ${lease.number}`,
        description: `Гэрээ дуусгавар болсон — move-out үзлэг, суутгалын задаргаа, барьцаа буцаалт хийнэ (${Number(lease.deposit_amount).toLocaleString()}₮).`,
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

  // ── 6. Сэжим: Д-27 оноо + идэвхгүйн тоолуур, Д-28/29 давтамж, §6.26
  //    эзэмшлийн хамгаалалт, §6.28.6 халуун сэжим, §6.4 дараагийн үйлдэл ──
  try {
    type LeadRow = {
      id: string;
      office_id: string;
      owner_id: string | null;
      contact_id: string;
      grade: LeadGrade | null;
      status: string;
      last_contact_at: string | null;
      first_contact_at: string | null;
      created_at: string;
      next_step: string | null;
      next_step_date: string | null;
      inactivity_days: number;
      unprotected: boolean;
      score: number | null;
    };
    const { data: leadsRaw } = await admin
      .from("crm_leads")
      .select(
        "id, office_id, owner_id, contact_id, grade, status, last_contact_at, first_contact_at, created_at, " +
          "next_step, next_step_date, inactivity_days, unprotected, score"
      )
      .in("status", ["new", "active"])
      .limit(5000);
    const leads = (leadsRaw ?? []) as unknown as LeadRow[];

    // Оноонд хэрэгтэй профайл ба 30 хоногийн идэвх (багцаар).
    const profileByContact = new Map<string, NeedProfileRow>();
    const acts30 = new Map<string, number>();
    const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    for (let i = 0; i < leads.length; i += 200) {
      const chunk = leads.slice(i, i + 200);
      const [{ data: profs }, { data: acts }] = await Promise.all([
        admin
          .from("crm_need_profiles")
          .select("*")
          .in("contact_id", [...new Set(chunk.map((l) => l.contact_id))])
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        admin
          .from("crm_activities")
          .select("lead_id")
          .in("lead_id", chunk.map((l) => l.id))
          .gte("created_at", since30),
      ]);
      for (const p of (profs ?? []) as unknown as NeedProfileRow[]) {
        if (!profileByContact.has(p.contact_id)) profileByContact.set(p.contact_id, p);
      }
      for (const a of acts ?? []) if (a.lead_id) acts30.set(a.lead_id, (acts30.get(a.lead_id) ?? 0) + 1);
    }

    for (const lead of leads) {
      const inact = daysSince(lead.last_contact_at ?? lead.created_at, today);
      const th = await thresholdsOf(lead.office_id);
      const teamLeads = teamLeadsOf(staffIdx, lead.office_id, lead.owner_id);

      // Д-27: оноо (§6.6) + идэвхгүйн тоолуурын өдөр тутмын шинэчлэл.
      const g27 = gate(lead.office_id, "D-27");
      if (g27.run) {
        const [weightsRaw, factorsRaw] = await Promise.all([
          officeSetting<unknown>(lead.office_id, "lead_score_weights"),
          officeSetting<unknown>(lead.office_id, "lead_score_factors"),
        ]);
        const prof = profileByContact.get(lead.contact_id) ?? null;
        const result = computeLeadScore(
          {
            profile: prof ? profileSnapshot(prof) : null,
            completenessPct: prof?.completeness_pct ?? null,
            activityCount30d: acts30.get(lead.id) ?? 0,
            lastContactDays: lead.last_contact_at ? daysSince(lead.last_contact_at, today) : null,
          },
          normalizeScoreWeights(weightsRaw),
          normalizeScoreFactors(factorsRaw)
        );
        const patch: { inactivity_days?: number; score?: number; score_breakdown?: Json } = {};
        if (inact !== lead.inactivity_days) patch.inactivity_days = inact;
        if (lead.score == null || Math.abs(Number(lead.score) - result.score) >= 0.1) {
          patch.score = result.score;
          patch.score_breakdown = result.breakdown as unknown as Json;
        }
        if (Object.keys(patch).length) {
          const { error } = await admin.from("crm_leads").update(patch).eq("id", lead.id);
          if (!error) summary.d27Refreshed += 1;
        }
      }

      const ranges = recontactRangesOf(await officeSetting<unknown>(lead.office_id, "recontact_ranges"));

      // Д-28: ангилалтай, дараагийн үйлдлийн огноогүй шинэ сэжимд саналын огноо (§6.5).
      if (lead.status === "new" && lead.grade && !lead.next_step_date) {
        const g28 = gate(lead.office_id, "D-28");
        if (g28.run) {
          const suggest = addDaysIso(today, recontactDays(lead.grade, null, ranges));
          const { error } = await admin
            .from("crm_leads")
            .update({ next_step_date: suggest, next_step: lead.next_step ?? "Эргэн холбогдох" })
            .eq("id", lead.id)
            .is("next_step_date", null);
          if (!error) summary.d28Suggested += 1;
        }
      }

      // §6.4: дараагийн үйлдлийн хугацаа хэтэрсэн — өдөр бүр сануулга, долоо
      // хоногийн дүн шинжилгээнд зориулж өдөр бүр лог.
      let nextStepAlerted = false;
      if (lead.owner_id && lead.next_step_date && lead.next_step_date < today) {
        const overdueDays = isoDaysBetween(lead.next_step_date, today);
        const res = await notifyCrm({
          officeId: lead.office_id,
          event: "next_step_overdue",
          recipients: [lead.owner_id, ...(overdueDays >= th.next_step_overdue_escalate_days ? teamLeads : [])],
          title: "Дараагийн үйлдлийн хугацаа хэтэрлээ",
          body: `Сэжимийн «${lead.next_step ?? "дараагийн үйлдэл"}» ${overdueDays} хоног хэтэрсэн. Холбогдож, шинэ огноо товлоно уу.`,
          link: `/agent/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        nextStepAlerted = res.delivered > 0 || res.deferred > 0;
        await logRuleRun(admin, {
          officeId: lead.office_id,
          ruleCode: "next_step_overdue",
          entity: "crm_leads",
          entityId: lead.id,
          status: "ok",
          result: { date: today, next_step_date: lead.next_step_date, overdue_days: overdueDays, owner_id: lead.owner_id },
        });
        summary.nextStepOverdue += 1;
      }

      // Д-29: ангиллын давтамж хэтэрсэн идэвхтэй сэжим (§6.5).
      if (lead.status === "active" && lead.grade && lead.owner_id && !nextStepAlerted) {
        const g29 = gate(lead.office_id, "D-29");
        const limit = recontactDays(lead.grade, null, ranges);
        if (g29.run && inact >= limit) {
          const res = await notifyCrm({
            officeId: lead.office_id,
            event: "next_step_overdue",
            recipients: [lead.owner_id],
            title: inact >= limit * 2 ? "Эргэн холбогдолт ноцтой хэтэрлээ" : "Эргэн холбогдох давтамж хэтэрлээ",
            body: `${lead.grade.toUpperCase()} ангиллын сэжимтэй ${inact} хоног холбогдоогүй (давтамж ${limit} хоног).`,
            link: `/agent/crm/leads/${lead.id}`,
            entity: "crm_leads",
            entityId: lead.id,
            admin,
            now,
          });
          if (res.delivered > 0) summary.d29Alerts += 1;
        }
      }

      // §6.28.6: халуун сэжим идэвхгүй — Багийн ахлагчид (баггүй бол БХЗ).
      if (lead.owner_id && isHotLeadInactive({ grade: lead.grade, status: lead.status, inactivityDays: inact }, th)) {
        const res = await notifyCrm({
          officeId: lead.office_id,
          event: "hot_lead_inactive",
          recipients: [lead.owner_id, ...teamLeads],
          includeRoles: teamLeads.length ? [] : ["sales_director"],
          title: "Халуун сэжим идэвхгүй байна",
          body: `A ангиллын сэжимтэй ${inact} хоног холбогдоогүй. Агент өнөөдөр холбогдох шаардлагатай.`,
          link: `/office/crm/leads/${lead.id}`,
          entity: "crm_leads",
          entityId: lead.id,
          admin,
          now,
        });
        if (res.delivered > 0) summary.hotLeadInactive += 1;
      }

      // §6.26: зөвхөн нэр, утастай (утга бүхий холболтгүй) шинэ сэжим.
      const protection = leadProtectionState(
        {
          status: lead.status,
          createdAt: new Date(lead.created_at),
          firstContactAt: lead.first_contact_at ? new Date(lead.first_contact_at) : null,
          unprotected: lead.unprotected,
        },
        now,
        th.lead_protection
      );
      if (protection === "warn" && lead.owner_id) {
        if (!(await hasRuleRun(admin, { officeId: lead.office_id, ruleCode: "lead_protection_warn", entity: "crm_leads", entityId: lead.id }))) {
          await notifyCrm({
            officeId: lead.office_id,
            event: "lead_unprotected",
            recipients: [lead.owner_id],
            title: "Сэжимийн эзэмшлийн хамгаалалт дуусах гэж байна",
            body: `Утга бүхий холболт бүртгэгдээгүй. ${th.lead_protection.warn_before_days} хоногийн дотор холбогдож бүртгэхгүй бол эзэмшил хамгаалагдахгүй.`,
            link: `/agent/crm/leads/${lead.id}`,
            entity: "crm_leads",
            entityId: lead.id,
            admin,
            now,
          });
          await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "lead_protection_warn", entity: "crm_leads", entityId: lead.id, status: "ok" });
          summary.protectionWarned += 1;
        }
      } else if (protection === "expire") {
        const { error } = await admin
          .from("crm_leads")
          .update({ unprotected: true })
          .eq("id", lead.id)
          .is("first_contact_at", null);
        if (!error) {
          summary.unprotectedMarked += 1;
          await logRuleRun(admin, {
            officeId: lead.office_id,
            ruleCode: "F-127",
            entity: "crm_leads",
            entityId: lead.id,
            status: "ok",
            result: { reason: "no_meaningful_contact", days: th.lead_protection.new_no_contact_days },
          });
          await notifyCrm({
            officeId: lead.office_id,
            event: "lead_unprotected",
            recipients: [lead.owner_id, ...teamLeads],
            includeRoles: ["sales_director"],
            title: "Сэжим хамгаалалтгүй боллоо",
            body: `${th.lead_protection.new_no_contact_days} хоногт утга бүхий холболт бүртгэгдээгүй — эргэлтэд оруулах эсэхийг хянана уу.`,
            link: `/office/crm/leads/${lead.id}`,
            entity: "crm_leads",
            entityId: lead.id,
            admin,
            now,
          });
        }
      }

      // F-127/128: идэвхтэй сэжимийн идэвхгүйн босго (БХЗ тогтооно — §6.26).
      if (lead.status === "active" && lead.grade && lead.owner_id && !lead.unprotected) {
        const inactivityCfg = await officeSetting<Record<LeadGrade, number>>(lead.office_id, "inactivity_thresholds");
        const threshold = inactivityCfg?.[lead.grade];
        if (typeof threshold === "number" && threshold > 0 && inact >= threshold) {
          const { error } = await admin.from("crm_leads").update({ unprotected: true }).eq("id", lead.id);
          if (!error) {
            summary.unprotectedMarked += 1;
            await logRuleRun(admin, { officeId: lead.office_id, ruleCode: "F-128", entity: "crm_leads", entityId: lead.id, status: "ok", result: { inactivity_days: inact, threshold } });
            await notifyCrm({
              officeId: lead.office_id,
              event: "lead_unprotected",
              recipients: [lead.owner_id],
              includeRoles: ["sales_director"],
              title: "Сэжим хамгаалалтгүй боллоо",
              body: `Идэвхгүй ${inact} хоног (босго ${threshold}) — эргэлтэд оруулах эсвэл дахин хуваарилах эсэхийг хянана уу.`,
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

  // ── 6б. Боломж: дараагийн үйлдэл (§6.4), үнийн саналын давтамж ба хүчинтэй
  //    хугацаа (§6.16, §6.28.4), үзлэгийн эргэх холбоо (§6.15, §6.28.3) ──
  try {
    const { data: oppsRaw } = await admin
      .from("crm_opportunities")
      .select("id, office_id, owner_id, stage_id, contact_id")
      .eq("state", "open")
      .limit(5000);
    const opps = (oppsRaw ?? []) as unknown as {
      id: string;
      office_id: string;
      owner_id: string;
      stage_id: string;
      contact_id: string;
    }[];
    const contactName = new Map<string, string>();
    for (let i = 0; i < opps.length; i += 200) {
      const ids = [...new Set(opps.slice(i, i + 200).map((o) => o.contact_id))];
      const { data: cs } = await admin.from("crm_contacts").select("id, display_name").in("id", ids);
      for (const c of cs ?? []) contactName.set(c.id, c.display_name);
    }
    const oppLabel = (o: { contact_id: string }) => contactName.get(o.contact_id) ?? "Харилцагч";
    const stageIds = [...new Set(opps.map((o) => o.stage_id))];
    const stageOf = new Map<string, { code: string; name: string }>();
    if (stageIds.length) {
      const { data: stages } = await admin.from("crm_stages").select("id, code, name").in("id", stageIds);
      for (const s of stages ?? []) stageOf.set(s.id, { code: s.code, name: s.name });
    }

    // Боломж бүрийн сүүлийн бүртгэл.
    const lastAct = new Map<string, { next_step: string | null; next_step_date: string | null; occurred_at: string }>();
    for (let i = 0; i < opps.length; i += 200) {
      const ids = opps.slice(i, i + 200).map((o) => o.id);
      const { data: acts } = await admin
        .from("crm_activities")
        .select("opportunity_id, next_step, next_step_date, occurred_at")
        .in("opportunity_id", ids)
        .order("occurred_at", { ascending: false })
        .limit(5000);
      for (const a of acts ?? []) {
        if (a.opportunity_id && !lastAct.has(a.opportunity_id)) lastAct.set(a.opportunity_id, a);
      }
    }

    for (const o of opps) {
      const th = await thresholdsOf(o.office_id);
      const last = lastAct.get(o.id) ?? null;
      const stage = stageOf.get(o.stage_id);
      const label = oppLabel(o);
      let alerted = false;

      if (last?.next_step_date && last.next_step_date < today) {
        const overdueDays = isoDaysBetween(last.next_step_date, today);
        const res = await notifyCrm({
          officeId: o.office_id,
          event: "next_step_overdue",
          recipients: [
            o.owner_id,
            ...(overdueDays >= th.next_step_overdue_escalate_days ? teamLeadsOf(staffIdx, o.office_id, o.owner_id) : []),
          ],
          title: "Дараагийн үйлдлийн хугацаа хэтэрлээ",
          body: `«${label}»: «${last.next_step ?? "дараагийн үйлдэл"}» ${overdueDays} хоног хэтэрсэн.`,
          link: `/agent/crm/pipeline/${o.id}`,
          entity: "crm_opportunities",
          entityId: o.id,
          admin,
          now,
        });
        alerted = res.delivered > 0 || res.deferred > 0;
        await logRuleRun(admin, {
          officeId: o.office_id,
          ruleCode: "next_step_overdue",
          entity: "crm_opportunities",
          entityId: o.id,
          status: "ok",
          result: { date: today, next_step_date: last.next_step_date, overdue_days: overdueDays, owner_id: o.owner_id },
        });
        summary.nextStepOverdue += 1;
      }

      // §6.28.4: үнийн санал, хэлэлцээрийн шатанд тогтоосон давтамжаар сануулга.
      if (!alerted && stage && OFFER_STAGE_CODES.includes(stage.code)) {
        const lastTouch = last ? toIsoDate(new Date(last.occurred_at)) : null;
        if (isOfferFollowupDue(lastTouch, today, th.offer_followup_days)) {
          const res = await notifyCrm({
            officeId: o.office_id,
            event: "offer_followup_due",
            recipients: [o.owner_id],
            title: "Үнийн саналын эргэн холбогдолт",
            body: `«${label}» «${stage.name}» шатанд байна — талуудтай холбогдож, явцыг бүртгэнэ үү.`,
            link: `/agent/crm/pipeline/${o.id}`,
            entity: "crm_opportunities",
            entityId: o.id,
            admin,
            now,
          });
          if (res.delivered > 0) summary.offerFollowups += 1;
        }
      }
    }

    // §6.16: саналын хүчинтэй хугацаа дуусах гэж буй (санал бүрд нэг удаа).
    const oppById = new Map(opps.map((o) => [o.id, o]));
    if (opps.length) {
      const { data: offers } = await admin
        .from("crm_offers")
        .select("id, office_id, opportunity_id, valid_until, direction")
        .gte("valid_until", today)
        .lte("valid_until", addDaysIso(today, 31))
        .limit(2000);
      for (const offer of offers ?? []) {
        const opp = oppById.get(offer.opportunity_id);
        if (!opp) continue;
        const th = await thresholdsOf(offer.office_id);
        if (!isOfferExpiring(offer.valid_until, today, th.offer_expiring_days)) continue;
        if (await hasRuleRun(admin, { officeId: offer.office_id, ruleCode: "offer_expiring", entity: "crm_offers", entityId: offer.id })) {
          continue;
        }
        await notifyCrm({
          officeId: offer.office_id,
          event: "offer_expiring",
          recipients: [opp.owner_id],
          title: "Үнийн саналын хүчинтэй хугацаа дуусах гэж байна",
          body: `«${oppLabel(opp)}»: ${offer.direction === "counter" ? "сөрөг санал" : "санал"} ${offer.valid_until}-нд дуусна.`,
          link: `/agent/crm/pipeline/${opp.id}`,
          entity: "crm_offers",
          entityId: offer.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: offer.office_id, ruleCode: "offer_expiring", entity: "crm_offers", entityId: offer.id, status: "ok", result: { valid_until: offer.valid_until } });
        summary.offersExpiring += 1;
      }
    }

    // §6.15/§6.28.3: үзлэгийн дараах эргэх холбоо — хугацаа хэтэрвэл агентад,
    // дараагийн шатанд ахлагчид (баггүй бол БХЗ).
    const { data: showings } = await admin
      .from("crm_activities")
      .select("id, office_id, owner_id, opportunity_id, lead_id, occurred_at")
      .eq("channel", "showing")
      .is("feedback_category", null)
      .gte("occurred_at", new Date(now.getTime() - 14 * DAY_MS).toISOString())
      .lte("occurred_at", now.toISOString())
      .limit(2000);
    for (const sh of showings ?? []) {
      const th = await thresholdsOf(sh.office_id);
      const state = showingFeedbackState(new Date(sh.occurred_at), false, now, th);
      if (state === "none") continue;
      const link = sh.opportunity_id
        ? `/agent/crm/pipeline/${sh.opportunity_id}`
        : sh.lead_id
          ? `/agent/crm/leads/${sh.lead_id}`
          : "/agent/crm";
      if (!(await hasRuleRun(admin, { officeId: sh.office_id, ruleCode: "showing_feedback_overdue", entity: "crm_activities", entityId: sh.id }))) {
        await notifyCrm({
          officeId: sh.office_id,
          event: "showing_feedback_overdue",
          recipients: [sh.owner_id],
          title: "Үзлэгийн эргэх холбоо хугацаа хэтэрлээ",
          body: `Үзлэгээс хойш ${th.showing_feedback_hours} цаг өнгөрсөн — харилцагчийн саналыг авч бүртгэнэ үү.`,
          link,
          entity: "crm_activities",
          entityId: sh.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: sh.office_id, ruleCode: "showing_feedback_overdue", entity: "crm_activities", entityId: sh.id, status: "ok" });
        summary.showingFeedbackOverdue += 1;
      }
      if (
        state === "escalate" &&
        !(await hasRuleRun(admin, { officeId: sh.office_id, ruleCode: "showing_feedback_escalate", entity: "crm_activities", entityId: sh.id }))
      ) {
        const leadsTl = teamLeadsOf(staffIdx, sh.office_id, sh.owner_id);
        await notifyCrm({
          officeId: sh.office_id,
          event: "showing_feedback_overdue",
          recipients: leadsTl,
          includeRoles: leadsTl.length ? [] : ["sales_director"],
          title: "Үзлэгийн санал бүртгэгдээгүй байна",
          body: `Үзлэгээс хойш ${th.showing_feedback_escalate_hours} цаг өнгөрсөн ч харилцагчийн санал бүртгэгдээгүй — агенттай хамт шийднэ үү.`,
          link,
          entity: "crm_activities",
          entityId: sh.id,
          admin,
          now,
        });
        await logRuleRun(admin, { officeId: sh.office_id, ruleCode: "showing_feedback_escalate", entity: "crm_activities", entityId: sh.id, status: "ok" });
        summary.showingFeedbackEscalated += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`opportunities: ${e instanceof Error ? e.message : String(e)}`);
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
        body: `${ids.length} идэвхтэй сэжимд 5 бүрдлийн аль нэг дутуу — самбараас шалгана уу.`,
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
          title: `Листингийн гэрээ дуусах дөхлөө — ${agr.property.number}`,
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
        title: `Менежментийн гэрээний сунгалт — ${agr.number}`,
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
        body: `${txn.number} (${txn.closed_on}) — шимтгэлийн тооцоо үүсээгүй байна.`,
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
        body: `crm-daily: ${summary.errors.length} алдаа — автомат дүрмийн гүйцэтгэлийн логоос харна уу.`,
        link: "/office/crm/settings/rules",
        admin,
        now,
      });
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, date: today, ...summary });
}

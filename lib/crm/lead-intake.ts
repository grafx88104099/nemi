import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignLead,
  type AssignMode,
  type AssignRule,
} from "@/lib/crm/scoring";
import {
  calendarExceptionsFromRows,
  isWithinWorkHours,
  leadSlaDeadline,
  toIsoDate,
  workHoursFromPolicy,
  type CalendarExceptions,
  type SlaPolicy,
} from "@/lib/crm/calendar";
import { normalizeEmail, normalizePhone } from "@/lib/crm/normalize";
import { fetchListingForLead, parseListingRef, toListingSnapshot } from "@/lib/crm/lead-listing";
import { isOnLeave } from "@/lib/validation/crm-ownership";
import { notifyCrm } from "@/lib/crm/notify";
import type { Json } from "@/types/database";

/**
 * Сэжим хүлээн авах серверийн цөм (PRO-001 v2.1 §6.1, §6.4, §6.28.1):
 * гараар бүртгэх (createLead), сайтын суваг (үзлэг товлох, чат) болон
 * гадны маягтын intake нэг логикоор — давхардал, эзэмшигч оноох (Д-01),
 * эхний холболтын хугацаа (ажлын цаг, эх сурвалжаар), эхний холболтын
 * даалгавар, мэдэгдэл. Service-role client ашигладаг тул ЗӨВХӨН серверээс
 * (server action-ийн дотор эрх шалгасны дараа, cron/route) дуудна —
 * "use server" файлаас экспортлохгүй.
 */

export type AdminClient = ReturnType<typeof createAdminClient>;

/** Тухайн оффисын хүчинтэй тохиргоо (definer RPC). */
export async function officeSetting<T>(admin: AdminClient, officeId: string, key: string): Promise<T | null> {
  const { data, error } = await admin.rpc("crm_setting_at", { p_office: officeId, p_key: key });
  if (error) {
    console.error("officeSetting:", key, error.message);
    return null;
  }
  return (data ?? null) as T | null;
}

export type OfficeSlaEnv = {
  policy: SlaPolicy | null;
  fallbackMinutes: number;
  exceptions: CalendarExceptions;
};

/** SLA бодлого + хуанлийн онцгой өдрүүд (өнөөдрөөс 45 хоног). */
export async function officeSlaEnv(admin: AdminClient, officeId: string, now: Date = new Date()): Promise<OfficeSlaEnv> {
  const fromIso = toIsoDate(new Date(now.getTime() - 3 * 86400000));
  const toIso = toIsoDate(new Date(now.getTime() + 45 * 86400000));
  const [policy, fallback, cal] = await Promise.all([
    officeSetting<SlaPolicy>(admin, officeId, "sla_policy"),
    officeSetting<number>(admin, officeId, "sla_first_contact_min"),
    admin.from("crm_calendar_days").select("day, is_workday").eq("office_id", officeId).gte("day", fromIso).lte("day", toIso),
  ]);
  return {
    policy,
    fallbackMinutes: typeof fallback === "number" && fallback > 0 ? fallback : 15,
    exceptions: calendarExceptionsFromRows(cal.data ?? []),
  };
}

export function firstContactDue(env: OfficeSlaEnv, receivedAt: Date, sourceCode: string | null): Date {
  return leadSlaDeadline(receivedAt, sourceCode, {
    policy: env.policy,
    fallbackMinutes: env.fallbackMinutes,
    exceptions: env.exceptions,
  });
}

// ── Лавлах ────────────────────────────────────────────────

export async function lookupIdByCode(
  admin: AdminClient,
  officeId: string,
  kind: string,
  code: string
): Promise<string | null> {
  const { data } = await admin
    .from("crm_lookups")
    .select("id")
    .eq("office_id", officeId)
    .eq("kind", kind)
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function lookupById(
  admin: AdminClient,
  id: string | null | undefined
): Promise<{ code: string; requires_note: boolean; kind: string } | null> {
  if (!id) return null;
  const { data } = await admin.from("crm_lookups").select("code, requires_note, kind").eq("id", id).maybeSingle();
  return data ?? null;
}

// ── Д-01 хуваарилалт ──────────────────────────────────────

type LeadAssignmentSetting = {
  mode?: AssignMode;
  load_cap?: number;
  rules?: AssignRule[];
  after_hours?: "queue" | "assign";
  registrar_sources?: string[];
};

export async function leadAssignmentSetting(admin: AdminClient, officeId: string): Promise<LeadAssignmentSetting> {
  return (await officeSetting<LeadAssignmentSetting>(admin, officeId, "lead_assignment")) ?? {};
}

/** Хуваарилах боломжтой эсэх: идэвхтэй, гарах урсгалгүй, чөлөөгүй agent дүртэй ажилтан. */
export async function eligibleAgents(admin: AdminClient, officeId: string, now: Date = new Date()): Promise<string[]> {
  const today = toIsoDate(now);
  const { data } = await admin
    .from("crm_staff")
    .select("profile_id, on_leave_from, on_leave_to")
    .eq("office_id", officeId)
    .eq("is_active", true)
    .eq("offboarding", false)
    .contains("roles", ["agent"])
    .order("created_at");
  return (data ?? []).filter((s) => !isOnLeave(s.on_leave_from, s.on_leave_to, today)).map((s) => s.profile_id);
}

export type AssignmentPlan = {
  ownerId: string | null;
  queued: boolean;
  dryRun: boolean;
  skipped: string | null;
  cursor: string | null;
  queue: string[];
  wouldAssign: string | null;
};

export async function planLeadAssignment(
  admin: AdminClient,
  officeId: string,
  lead: { sourceCode?: string | null; branchId?: string | null; grade?: string | null },
  now: Date = new Date()
): Promise<AssignmentPlan> {
  const empty: AssignmentPlan = {
    ownerId: null,
    queued: false,
    dryRun: false,
    skipped: null,
    cursor: null,
    queue: [],
    wouldAssign: null,
  };
  const { data: rule } = await admin
    .from("crm_automation_rules")
    .select("is_active, dry_run")
    .eq("office_id", officeId)
    .eq("code", "D-01")
    .maybeSingle();
  if (rule && !rule.is_active) return { ...empty, skipped: "inactive" };

  const setting = await leadAssignmentSetting(admin, officeId);
  const candidates = await eligibleAgents(admin, officeId, now);
  if (candidates.length === 0) return { ...empty, skipped: "no_candidates" };

  const loads: Record<string, number> = {};
  const { data: openLeads } = await admin
    .from("crm_leads")
    .select("owner_id")
    .eq("office_id", officeId)
    .in("status", ["new", "active"])
    .not("owner_id", "is", null);
  for (const l of openLeads ?? []) if (l.owner_id) loads[l.owner_id] = (loads[l.owner_id] ?? 0) + 1;

  const nowIso = now.toISOString();
  const { data: duty } = await admin
    .from("crm_duty_shifts")
    .select("profile_id")
    .eq("office_id", officeId)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);

  const { data: state } = await admin
    .from("crm_assignment_state")
    .select("last_assigned_profile_id, queue")
    .eq("office_id", officeId)
    .eq("scope", "default")
    .maybeSingle();

  const env = await officeSlaEnv(admin, officeId, now);
  const isWorkHours = isWithinWorkHours(now, workHoursFromPolicy(env.policy), env.exceptions);

  const decision = assignLead({
    mode: setting.mode ?? "round_robin",
    candidates,
    dutyNow: (duty ?? []).map((d) => d.profile_id),
    cursor: state?.last_assigned_profile_id ?? null,
    loads,
    loadCap: setting.load_cap,
    rules: setting.rules ?? [],
    lead,
    isWorkHours,
    afterHours: setting.after_hours ?? "queue",
  });
  const base = {
    ...empty,
    cursor: state?.last_assigned_profile_id ?? null,
    queue: Array.isArray(state?.queue) ? (state.queue as string[]) : [],
  };
  if (rule?.dry_run) return { ...base, dryRun: true, wouldAssign: decision.ownerId, queued: false };
  if (decision.queued) return { ...base, queued: true };
  if (decision.ownerId) return { ...base, ownerId: decision.ownerId };
  return { ...base, skipped: "no_pick" };
}

async function logD01(
  admin: AdminClient,
  officeId: string,
  leadId: string,
  status: "ok" | "skipped" | "dry_run",
  result: Record<string, unknown>
) {
  try {
    await admin.from("crm_rule_runs").insert({
      office_id: officeId,
      rule_code: "D-01",
      entity: "crm_leads",
      entity_id: leadId,
      status,
      result: result as Json,
    });
  } catch (e) {
    console.error("logD01:", e instanceof Error ? e.message : e);
  }
}

/** Хуваарилалтын төлөвийг (cursor, ажлын бус цагийн дараалал) хадгалж, логлоно. */
export async function commitLeadAssignment(
  admin: AdminClient,
  officeId: string,
  leadId: string,
  plan: AssignmentPlan,
  registrarOwned = false
): Promise<void> {
  if (registrarOwned) {
    await logD01(admin, officeId, leadId, "skipped", { reason: "registrar_owner" });
    return;
  }
  if (plan.dryRun) {
    await logD01(admin, officeId, leadId, "dry_run", { would_assign: plan.wouldAssign });
    return;
  }
  if (plan.skipped) {
    await logD01(admin, officeId, leadId, "skipped", { reason: plan.skipped });
    return;
  }
  const now = new Date().toISOString();
  if (plan.queued) {
    await admin.from("crm_assignment_state").upsert(
      {
        office_id: officeId,
        scope: "default",
        last_assigned_profile_id: plan.cursor,
        queue: [...plan.queue.filter((id) => id !== leadId), leadId] as unknown as Json,
        updated_at: now,
      },
      { onConflict: "office_id,scope" }
    );
    await logD01(admin, officeId, leadId, "ok", { queued: true });
    return;
  }
  if (plan.ownerId) {
    await admin.from("crm_assignment_state").upsert(
      {
        office_id: officeId,
        scope: "default",
        last_assigned_profile_id: plan.ownerId,
        queue: plan.queue as unknown as Json,
        updated_at: now,
      },
      { onConflict: "office_id,scope" }
    );
    await logD01(admin, officeId, leadId, "ok", { owner_id: plan.ownerId });
  }
}

/**
 * Эхний холболтын даалгавар (§6.28.1) — эзэмшигчид, сэжимийн
 * next_step_task_id + crm_task_links (Д-01), утга бүхий холболтоор
 * DB trigger хаана.
 */
export async function createFirstContactTask(
  admin: AdminClient,
  input: {
    officeId: string;
    createdBy: string;
    ownerId: string;
    leadId: string;
    dueAt: Date;
    nextStep?: string | null;
    nextStepDate?: string | null;
  }
): Promise<string | null> {
  try {
    const { data: task, error } = await admin
      .from("tasks")
      .insert({
        office_id: input.officeId,
        created_by: input.createdBy,
        responsible_id: input.ownerId,
        title: "Шинэ сэжимтэй эхний холболт хийх",
        description: "Эхний холболтын хугацаанд утга бүхий холболт хийж, үр дүн ба дараагийн үйлдлээ CRM-д бүртгэнэ үү.",
        priority: "high",
        deadline: input.dueAt.toISOString(),
      })
      .select("id")
      .single();
    if (error || !task) {
      console.error("createFirstContactTask:", error?.message);
      return null;
    }
    await admin.from("crm_task_links").insert({
      task_id: task.id,
      entity: "lead",
      entity_id: input.leadId,
      rule_code: "D-01",
    });
    const { error: upErr } = await admin
      .from("crm_leads")
      .update({
        next_step_task_id: task.id,
        next_step: input.nextStep?.trim() || "Эхний холболт",
        next_step_date: input.nextStepDate?.slice(0, 10) || toIsoDate(input.dueAt),
      })
      .eq("id", input.leadId)
      .eq("office_id", input.officeId);
    if (upErr) console.error("createFirstContactTask lead:", upErr.message);
    return task.id;
  } catch (e) {
    console.error("createFirstContactTask:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Сайтын суваг / гадны маягт (§6.1, §6.4) ───────────────

export type IngestLeadInput = {
  officeId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  sourceCode: string;
  sourceDetail: string | null;
  channelRef?: string | null;
  campaignCode?: string | null;
  /** Эзэмшигчээр оноох боломжтой бол энэ агент (листингийн агент). */
  preferredOwnerId?: string | null;
  /** Бүртгэгч (created_by) — листингийн агент эсвэл оффисын системийн бүртгэгч. */
  registrarId: string;
  contactType?: "buyer" | "tenant" | "seller" | "landlord";
  receivedAt?: Date;
};

export type IngestLeadResult = { leadId?: string; contactId?: string; existing?: boolean; error?: string };

function splitName(full: string | null): { last: string | null; first: string } {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return { last: words[0], first: words.slice(1).join(" ") };
  return { last: null, first: words[0] ?? "Сайтын харилцагч" };
}

/** Оффисын системийн бүртгэгч: Борлуулалт хариуцсан захирал, эсвэл идэвхтэй эхний ажилтан. */
export async function officeRegistrar(admin: AdminClient, officeId: string): Promise<string | null> {
  const { data } = await admin
    .from("crm_staff")
    .select("profile_id, roles")
    .eq("office_id", officeId)
    .eq("is_active", true)
    .order("created_at");
  const rows = data ?? [];
  const sd = rows.find((r) => (r.roles as string[]).includes("sales_director"));
  return sd?.profile_id ?? rows[0]?.profile_id ?? null;
}

/**
 * Сайтаас / гадны маягтаас ирсэн хандалтыг албан бүртгэлд оруулна.
 * Нэг харилцагчид нээлттэй сэжим байвал шинээр үүсгэхгүй (эзэмшигчид
 * мэдэгдэнэ) — давхардал, эзэмшлийн маргаанаас сэргийлнэ.
 */
export async function ingestLead(input: IngestLeadInput): Promise<IngestLeadResult> {
  const admin = createAdminClient();
  const now = new Date();
  const receivedAt = input.receivedAt ?? now;
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const email = input.email ? normalizeEmail(input.email) : "";
  if (!phone && !email) return { error: "Холбоо барих утас эсвэл и-мэйл алга." };

  const sourceId = await lookupIdByCode(admin, input.officeId, "lead_source", input.sourceCode);
  if (!sourceId) return { error: "Эх сурвалжийн лавлах олдсонгүй." };

  // Давхардал: нормалчилсан утас, и-мэйл (оффисын хүрээнд, нэгтгэгдээгүй).
  let contactId: string | null = null;
  if (phone) {
    const { data } = await admin
      .from("crm_contact_phones")
      .select("contact_id, contact:crm_contacts!inner(id, merged_into_id)")
      .eq("office_id", input.officeId)
      .eq("normalized", phone)
      .limit(5);
    const hit = ((data ?? []) as unknown as { contact_id: string; contact: { merged_into_id: string | null } }[]).find(
      (r) => !r.contact.merged_into_id
    );
    contactId = hit?.contact_id ?? null;
  }
  if (!contactId && email) {
    const { data } = await admin
      .from("crm_contact_emails")
      .select("contact_id, contact:crm_contacts!inner(id, merged_into_id)")
      .eq("office_id", input.officeId)
      .eq("email", email)
      .limit(5);
    const hit = ((data ?? []) as unknown as { contact_id: string; contact: { merged_into_id: string | null } }[]).find(
      (r) => !r.contact.merged_into_id
    );
    contactId = hit?.contact_id ?? null;
  }

  if (contactId) {
    const { data: open } = await admin
      .from("crm_leads")
      .select("id, owner_id, listing_id, listing_snapshot")
      .eq("contact_id", contactId)
      .in("status", ["new", "active"])
      .limit(1)
      .maybeSingle();
    if (open) {
      // Нэг сэжим нэг зартай тул зар холбогдоогүй нээлттэй сэжимд л энэ хандалтын зарыг холбоно.
      const openListingRef = open.listing_id || open.listing_snapshot ? null : parseListingRef(input.channelRef);
      const openListing = openListingRef ? await fetchListingForLead(admin, openListingRef) : null;
      if (openListing) {
        const { error: listingErr } = await admin
          .from("crm_leads")
          .update({ listing_id: openListing.id, listing_snapshot: toListingSnapshot(openListing, now) })
          .eq("id", open.id)
          .is("listing_id", null)
          .is("listing_snapshot", null);
        if (listingErr) console.error("ingestLead listing:", listingErr.message);
      }
      if (open.owner_id) {
        await notifyCrm({
          officeId: input.officeId,
          event: "lead_assigned",
          recipients: [open.owner_id],
          title: "Таны харилцагч дахин хандлаа",
          body: (input.sourceDetail ?? "Сайтаар дахин хандсан.").slice(0, 120),
          link: `/agent/crm/leads/${open.id}`,
          admin,
        });
      }
      return { leadId: open.id, contactId, existing: true };
    }
  } else {
    const { data: number, error: numErr } = await admin.rpc("crm_next_number", {
      p_office: input.officeId,
      p_kind: "contact",
    });
    if (numErr || !number) {
      console.error("ingestLead number:", numErr?.message);
      return { error: "Харилцагчийн дугаар олгож чадсангүй." };
    }
    const { last, first } = splitName(input.fullName);
    const { data: contact, error } = await admin
      .from("crm_contacts")
      .insert({
        office_id: input.officeId,
        number,
        kind: "person",
        last_name: last,
        first_name: first,
        display_name: [last, first].filter(Boolean).join(" "),
        contact_types: [input.contactType ?? "buyer"],
        source_id: sourceId,
        source_detail: input.sourceDetail,
        consent: "not_asked",
        created_by: input.registrarId,
      })
      .select("id")
      .single();
    if (error || !contact) {
      console.error("ingestLead contact:", error?.message);
      return { error: "Харилцагч бүртгэж чадсангүй." };
    }
    contactId = contact.id;
    if (phone) {
      await admin
        .from("crm_contact_phones")
        .insert({ office_id: input.officeId, contact_id: contact.id, raw: input.phone!.trim(), normalized: phone, is_primary: true });
    }
    if (email) {
      await admin
        .from("crm_contact_emails")
        .insert({ office_id: input.officeId, contact_id: contact.id, email, is_primary: true });
    }
  }

  // Эзэмшигч: листингийн агент хуваарилах боломжтой бол түүнд, үгүй бол Д-01.
  const eligible = await eligibleAgents(admin, input.officeId, now);
  const preferred = input.preferredOwnerId && eligible.includes(input.preferredOwnerId) ? input.preferredOwnerId : null;
  const plan = preferred
    ? null
    : await planLeadAssignment(admin, input.officeId, { sourceCode: input.sourceCode }, now);
  const ownerId = preferred ?? plan?.ownerId ?? null;

  const env = await officeSlaEnv(admin, input.officeId, now);
  const due = firstContactDue(env, receivedAt, input.sourceCode);

  // Зар олдохгүй бол (устсан, буруу лавлагаа) сэжмийг зарын холбоосгүй бүртгэнэ.
  const listingRef = parseListingRef(input.channelRef);
  const listing = listingRef ? await fetchListingForLead(admin, listingRef) : null;

  const { data: lead, error: leadErr } = await admin
    .from("crm_leads")
    .insert({
      office_id: input.officeId,
      contact_id: contactId,
      owner_id: ownerId,
      source_id: sourceId,
      source_detail: input.sourceDetail,
      campaign_code: input.campaignCode ?? null,
      channel_ref: input.channelRef ?? null,
      listing_id: listing?.id ?? null,
      listing_snapshot: listing ? toListingSnapshot(listing, now) : null,
      status: "new",
      received_at: receivedAt.toISOString(),
      first_contact_due_at: due.toISOString(),
      created_by: input.registrarId,
    })
    .select("id")
    .single();
  if (leadErr || !lead) {
    console.error("ingestLead lead:", leadErr?.message);
    return { error: "Сэжим бүртгэж чадсангүй.", contactId };
  }

  if (plan) await commitLeadAssignment(admin, input.officeId, lead.id, plan);
  if (ownerId) {
    await createFirstContactTask(admin, {
      officeId: input.officeId,
      createdBy: input.registrarId,
      ownerId,
      leadId: lead.id,
      dueAt: due,
    });
    await notifyCrm({
      officeId: input.officeId,
      event: "lead_assigned",
      recipients: [ownerId],
      title: "Шинэ сэжим ирлээ",
      body: `${input.sourceDetail ?? "Сайтаас ирсэн сэжим"} — эхний холболтын хугацаа эхэлсэн.`.slice(0, 120),
      link: `/agent/crm/leads/${lead.id}`,
      entity: "crm_leads",
      entityId: lead.id,
      admin,
    });
  }
  return { leadId: lead.id, contactId };
}

/**
 * Сайтын хандалт (үзлэг товлох, чат) → CRM сэжим. Листингийн агентын
 * оффис CRM ашигладаггүй, эсвэл хэрэглэгч өөрөө агент бол алгасна.
 * Алдаа үндсэн үйлдлийг (үзлэг, чат) хэзээ ч унагахгүй.
 */
export async function ingestSiteInquiry(input: {
  buyerProfileId: string;
  agentId: string | null;
  listingId: string | null;
  channel: "viewing" | "chat";
  scheduledAt?: string | null;
}): Promise<IngestLeadResult | null> {
  try {
    const admin = createAdminClient();
    let agentId = input.agentId;
    let listing: { id: string; title: string; deal_type: string | null; agent_id: string | null } | null = null;
    if (input.listingId) {
      const { data } = await admin
        .from("listings")
        .select("id, title, deal_type, agent_id")
        .eq("id", input.listingId)
        .maybeSingle();
      listing = data ?? null;
      agentId = agentId ?? listing?.agent_id ?? null;
    }
    if (!agentId) return null;
    const { data: agent } = await admin.from("agents").select("profile_id, office_id").eq("id", agentId).maybeSingle();
    if (!agent?.office_id || !agent.profile_id) return null;
    if (agent.profile_id === input.buyerProfileId) return null;

    // Оффис CRM ашигладаг эсэх (идэвхтэй ажилтантай).
    const { count } = await admin
      .from("crm_staff")
      .select("id", { count: "exact", head: true })
      .eq("office_id", agent.office_id)
      .eq("is_active", true);
    if (!count) return null;

    // Хэрэглэгч өөрөө тухайн оффисын CRM ажилтан бол сэжим биш.
    const { data: selfStaff } = await admin
      .from("crm_staff")
      .select("id")
      .eq("office_id", agent.office_id)
      .eq("profile_id", input.buyerProfileId)
      .maybeSingle();
    if (selfStaff) return null;

    const { data: buyer } = await admin
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", input.buyerProfileId)
      .maybeSingle();
    if (!buyer) return null;

    const { data: agentStaff } = await admin
      .from("crm_staff")
      .select("profile_id")
      .eq("office_id", agent.office_id)
      .eq("profile_id", agent.profile_id)
      .eq("is_active", true)
      .maybeSingle();
    const registrar = agentStaff?.profile_id ?? (await officeRegistrar(admin, agent.office_id));
    if (!registrar) return null;

    const what =
      input.channel === "viewing"
        ? `Сайтаар үзлэг товлосон${input.scheduledAt ? ` (${input.scheduledAt.slice(0, 16).replace("T", " ")})` : ""}`
        : "Сайтаар чат эхлүүлсэн";
    const detail = listing ? `${what}: ${listing.title}` : what;
    const rental = listing?.deal_type === "rent";

    return await ingestLead({
      officeId: agent.office_id,
      fullName: buyer.full_name,
      phone: buyer.phone,
      email: buyer.email,
      sourceCode: listing ? "listing_inquiry" : "digital",
      sourceDetail: detail.slice(0, 500),
      channelRef: listing ? `listing:${listing.id}` : `agent:${agentId}`,
      preferredOwnerId: agentStaff?.profile_id ?? null,
      registrarId: registrar,
      contactType: rental ? "tenant" : "buyer",
    });
  } catch (e) {
    console.error("ingestSiteInquiry:", e instanceof Error ? e.message : e);
    return null;
  }
}

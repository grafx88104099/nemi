import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { daysInMonth, monthStart, nextMonthStart, prorate } from "@/lib/crm/proration";
import type { Json } from "@/types/database";

/**
 * CRM сарын cron (D8, §4.4) — сар бүрийн 1-нд (vercel.json):
 *  • Гэрээний хугацааны шүүрдэлт: end_on өнгөрсөн идэвхтэй lease → «Дууссан»
 *    (F-501 — систем автомат; trigger зөвхөн service role-д зөвшөөрнө);
 *  • Д-13: идэвхтэй МЕНЕЖМЕНТТЭЙ lease бүрд сарын үйлчилгээний нэхэмжлэх
 *    (proration F-585 — дундуур эхэлсэн/дуусах сард хувь тэнцүүлнэ);
 *  • Д-14/F-520: сул объектод үүсгэхгүй (алгасалт нь rule_runs-д);
 *  • Д-14 (бүртгэл): идэвхтэй менежментийн гэрээний объект бүрд сарын
 *    менежментийн бүртгэл (журмын 9.2, autofill талбартай) — сар бүр НЭГ;
 *  • Д-22: өмчлөгчийн тайлангийн даалгавар (өмнөх тайлант үе) ҮХХ багт;
 *  • F-466: өмнөх сарын бүрэн (100%, hold-гүй) бүртгэлүүдээс PM тооцооны
 *    гээгдэл скан → rule_runs 'pending' (U7 commission engine уншина).
 *
 * Хамгаалалт: Authorization: Bearer CRON_SECRET эсвэл ?key=.
 * Идемпотент: unique(lease,type,period) + unique(agreement,property,month) +
 * rule_runs дээрх сарын тэмдэглэгээгээр давхардахгүй.
 */

export const maxDuration = 300;

type Admin = ReturnType<typeof createAdminClient>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Сарын payment_day-д таарах огноо (сарын хоногоос хэтэрвэл сүүлийн өдөр). */
function dueDateFor(month: string, paymentDay: number): string {
  const total = daysInMonth(month);
  const day = Math.min(Math.max(1, paymentDay), total);
  return `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

async function logRun(
  admin: Admin,
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: string,
  result?: Record<string, unknown>,
  error?: string
) {
  await admin.from("crm_rule_runs").insert({
    office_id: officeId,
    rule_code: ruleCode,
    entity,
    entity_id: entityId,
    status,
    result: (result ?? null) as Json,
    error: error ?? null,
  });
}

/** Идэвхтэй property_manager ажилтнууд (Д-22 даалгаврын хариуцагч). */
async function pmProfiles(admin: Admin, officeId: string): Promise<string[]> {
  const { data } = await admin
    .from("crm_staff")
    .select("profile_id, roles")
    .eq("office_id", officeId)
    .eq("is_active", true);
  return (data ?? [])
    .filter((s) => (s.roles as string[]).includes("property_manager"))
    .map((s) => s.profile_id);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}` && searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const monthParam = searchParams.get("month"); // 'YYYY-MM' — дахин гүйлгэлтэд
  const month = monthStart(monthParam ? `${monthParam}-01` : todayIso());
  const monthEndExclusive = nextMonthStart(month);
  const today = todayIso();

  const summary = {
    month,
    expired: 0,
    invoicesCreated: 0,
    invoicesSkippedVacant: 0,
    invoicesExisting: 0,
    recordsCreated: 0,
    statementTasks: 0,
    pmCommissionScans: 0,
    errors: [] as string[],
  };

  // ── 1. Хугацаа дууссан гэрээний шүүрдэлт (F-501 — систем) ──
  try {
    const { data: expiring } = await admin
      .from("crm_leases")
      .select("id, office_id")
      .eq("status", "active")
      .lte("end_on", today);
    for (const l of expiring ?? []) {
      const { error } = await admin.from("crm_leases").update({ status: "expired" }).eq("id", l.id);
      if (error) {
        summary.errors.push(`expire ${l.id}: ${error.message}`);
      } else {
        summary.expired += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`expire sweep: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Д-13/Д-14: сарын нэхэмжлэх (менежменттэй идэвхтэй lease) ──
  type ManagedLease = {
    id: string;
    office_id: string;
    property_id: string;
    monthly_rent: number;
    start_on: string;
    end_on: string;
    payment_day: number;
    landlord_contact_id: string;
    management_agreement_id: string | null;
    agreement: { fee_pct: number; status: string } | null;
    property: { occupancy: string | null; number: string; name: string } | null;
  };

  let managedLeases: ManagedLease[] = [];
  try {
    const { data, error } = await admin
      .from("crm_leases")
      .select(
        "id, office_id, property_id, monthly_rent, start_on, end_on, payment_day, landlord_contact_id, management_agreement_id, " +
          "agreement:crm_management_agreements!crm_leases_management_agreement_id_fkey(fee_pct, status), " +
          "property:crm_properties!crm_leases_property_id_fkey(occupancy, number, name)"
      )
      .eq("status", "active")
      .eq("is_managed", true)
      .lt("start_on", monthEndExclusive)
      .gt("end_on", month);
    if (error) throw new Error(error.message);
    managedLeases = (data ?? []) as unknown as ManagedLease[];
  } catch (e) {
    summary.errors.push(`lease query: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Байгаа сарын нэхэмжлэхүүд (идемпотент).
  const existingInvoiceLeases = new Set<string>();
  if (managedLeases.length) {
    const { data: existing } = await admin
      .from("crm_invoices")
      .select("lease_id")
      .eq("type", "mgmt_fee")
      .eq("period_month", month)
      .in(
        "lease_id",
        managedLeases.map((l) => l.id)
      );
    for (const inv of existing ?? []) if (inv.lease_id) existingInvoiceLeases.add(inv.lease_id);
  }

  for (const lease of managedLeases) {
    try {
      if (existingInvoiceLeases.has(lease.id)) {
        summary.invoicesExisting += 1;
        continue;
      }
      if (lease.agreement && lease.agreement.status !== "active") {
        await logRun(admin, lease.office_id, "D-13", "crm_leases", lease.id, "skipped", {
          reason: "agreement_inactive",
          month,
        });
        continue;
      }
      // Д-14/F-520/569: ашиглалтын статус «Сул» бол үүсгэхгүй.
      if (lease.property?.occupancy === "vacant") {
        summary.invoicesSkippedVacant += 1;
        await logRun(admin, lease.office_id, "D-14", "crm_leases", lease.id, "ok", {
          reason: "vacant_skip",
          month,
        });
        continue;
      }

      const feePct = Number(lease.agreement?.fee_pct ?? 0);
      const rentPortion = prorate(Number(lease.monthly_rent), lease.start_on, lease.end_on, month);
      const amount = Math.round(rentPortion * (feePct / 100) * 100) / 100;
      if (!(amount > 0)) {
        await logRun(admin, lease.office_id, "D-13", "crm_leases", lease.id, "skipped", {
          reason: "zero_amount",
          month,
          feePct,
        });
        continue;
      }

      const { error } = await admin.from("crm_invoices").insert({
        office_id: lease.office_id,
        type: "mgmt_fee",
        lease_id: lease.id,
        recipient_contact_id: lease.landlord_contact_id,
        period_month: month,
        issued_on: today,
        due_on: dueDateFor(month, lease.payment_day),
        amount,
      });
      if (error) {
        // unique давхардал = өөр гүйлт аль хэдийн үүсгэсэн (идемпотент).
        if (error.message.includes("duplicate") || error.code === "23505") {
          summary.invoicesExisting += 1;
        } else {
          throw new Error(error.message);
        }
      } else {
        summary.invoicesCreated += 1;
        await logRun(admin, lease.office_id, "D-13", "crm_leases", lease.id, "ok", {
          month,
          amount,
          prorated: rentPortion !== Number(lease.monthly_rent),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push(`D-13 ${lease.id}: ${msg}`);
      await logRun(admin, lease.office_id, "D-13", "crm_leases", lease.id, "error", { month }, msg.slice(0, 400));
    }
  }

  // ── 3. Д-14: сарын менежментийн бүртгэл (гэрээний объект бүрд) ──
  type AgreementRow = {
    id: string;
    office_id: string;
    owner_contact_id: string;
    fee_pct: number;
    reporting_frequency: string;
    props: { property_id: string }[];
  };
  let agreements: AgreementRow[] = [];
  try {
    const { data, error } = await admin
      .from("crm_management_agreements")
      .select("id, office_id, owner_contact_id, fee_pct, reporting_frequency, props:crm_management_agreement_properties(property_id)")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    agreements = (data ?? []) as unknown as AgreementRow[];
  } catch (e) {
    summary.errors.push(`agreement query: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Нэрсийн толь (autofill — F-556).
  const contactIds = new Set<string>();
  const propertyIds = new Set<string>();
  for (const a of agreements) {
    contactIds.add(a.owner_contact_id);
    for (const p of a.props ?? []) propertyIds.add(p.property_id);
  }
  for (const l of managedLeases) contactIds.add(l.landlord_contact_id);

  const contactName = new Map<string, string>();
  if (contactIds.size) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, display_name")
      .in("id", [...contactIds]);
    for (const c of contacts ?? []) contactName.set(c.id, c.display_name);
  }
  const propertyInfo = new Map<string, { number: string; name: string; payment_day: number | null }>();
  if (propertyIds.size) {
    const { data: props } = await admin
      .from("crm_properties")
      .select("id, number, name, payment_day")
      .in("id", [...propertyIds]);
    for (const p of props ?? []) propertyInfo.set(p.id, { number: p.number, name: p.name, payment_day: p.payment_day });
  }
  // Объект бүрийн идэвхтэй lease (+түрээслэгчийн нэр).
  const leaseByProperty = new Map<string, ManagedLease>();
  for (const l of managedLeases) leaseByProperty.set(l.property_id, l);
  const tenantNameByLease = new Map<string, string>();
  if (managedLeases.length) {
    const { data: leaseTenants } = await admin
      .from("crm_leases")
      .select("id, tenant:crm_contacts!crm_leases_tenant_contact_id_fkey(display_name)")
      .in(
        "id",
        managedLeases.map((l) => l.id)
      );
    for (const lt of (leaseTenants ?? []) as unknown as { id: string; tenant: { display_name: string } | null }[]) {
      if (lt.tenant) tenantNameByLease.set(lt.id, lt.tenant.display_name);
    }
  }

  for (const agr of agreements) {
    for (const link of agr.props ?? []) {
      try {
        const prop = propertyInfo.get(link.property_id);
        const lease = leaseByProperty.get(link.property_id);
        const rentPortion = lease
          ? prorate(Number(lease.monthly_rent), lease.start_on, lease.end_on, month)
          : null;
        const data: Record<string, unknown> = {
          unit: prop ? `${prop.number} — ${prop.name}` : link.property_id,
          owner_name: contactName.get(agr.owner_contact_id) ?? null,
          tenant_name: lease ? (tenantNameByLease.get(lease.id) ?? null) : "Сул (түрээслэгчгүй)",
          monthly_rent: lease ? Number(lease.monthly_rent) : 0,
          service_fee:
            rentPortion != null ? Math.round(rentPortion * (Number(agr.fee_pct) / 100) * 100) / 100 : 0,
          payment_day: lease?.payment_day ?? prop?.payment_day ?? null,
        };
        const { error } = await admin
          .from("crm_monthly_records")
          .upsert(
            {
              office_id: agr.office_id,
              agreement_id: agr.id,
              property_id: link.property_id,
              lease_id: lease?.id ?? null,
              month,
              data: data as Json,
            },
            { onConflict: "agreement_id,property_id,month", ignoreDuplicates: true }
          );
        if (error) throw new Error(error.message);
        summary.recordsCreated += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        summary.errors.push(`D-14 ${agr.id}/${link.property_id}: ${msg}`);
        await logRun(admin, agr.office_id, "D-14", "crm_management_agreements", agr.id, "error", { month }, msg.slice(0, 400));
      }
    }
  }

  // ── 4. Д-22: өмчлөгчийн тайлангийн даалгавар (сар бүрийн давтамжтайд) ──
  for (const agr of agreements) {
    if (agr.reporting_frequency !== "monthly") continue;
    try {
      // Идемпотент: энэ сард аль хэдийн D-22 гүйлт хийгдсэн бол алгасна.
      const { data: prior } = await admin
        .from("crm_rule_runs")
        .select("id, result")
        .eq("office_id", agr.office_id)
        .eq("rule_code", "D-22")
        .eq("entity", "crm_management_agreements")
        .eq("entity_id", agr.id)
        .order("ran_at", { ascending: false })
        .limit(1);
      const last = prior?.[0]?.result as { month?: string } | null;
      if (last?.month === month) continue;

      const pms = await pmProfiles(admin, agr.office_id);
      if (!pms.length) {
        await logRun(admin, agr.office_id, "D-22", "crm_management_agreements", agr.id, "skipped", {
          month,
          reason: "no_property_manager",
        });
        continue;
      }
      const ownerName = contactName.get(agr.owner_contact_id) ?? "";
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: agr.office_id,
          created_by: pms[0],
          responsible_id: pms[0],
          title: `Өмчлөгчийн тайлан бэлтгэх — ${ownerName || "гэрээ"} (Д-22)`,
          description: `Өмнөх тайлант үеийн Owner Statement угсарч (орлого − зардал − хөлс = цэвэр олголт, F-561) илгээнэ (F-562).`,
          priority: "high",
          deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
        })
        .select("id")
        .single();
      if (task?.id) {
        await admin.from("crm_task_links").insert({
          task_id: task.id,
          entity: "management_agreement",
          entity_id: agr.id,
          rule_code: "D-22",
        });
      }
      // Мэдэгдэл ҮХХ багт (matrix 'owner_statement_due').
      await admin.from("notifications").insert(
        pms.map((id) => ({
          user_id: id,
          type: "crm_owner_statement_due",
          title: "Өмчлөгчийн тайлангийн хугацаа",
          body: `${ownerName || "Менежментийн гэрээ"} — тайлант үеийн тайлан бэлтгэнэ үү.`.slice(0, 120),
          link: "/office/crm/rentals/statements",
        }))
      );
      await logRun(admin, agr.office_id, "D-22", "crm_management_agreements", agr.id, "ok", { month });
      summary.statementTasks += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push(`D-22 ${agr.id}: ${msg}`);
      await logRun(admin, agr.office_id, "D-22", "crm_management_agreements", agr.id, "error", { month }, msg.slice(0, 400));
    }
  }

  // ── 5. F-466: өмнөх сарын PM тооцооны гээгдэл скан ──
  try {
    const prevMonth = monthStart(
      new Date(new Date(`${month}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
    );
    const { data: completeRecords } = await admin
      .from("crm_monthly_records")
      .select("id, office_id, lease_id, net_income, completeness_pct, commission_hold")
      .eq("month", prevMonth)
      .eq("commission_hold", false)
      .gte("completeness_pct", 100)
      .gt("net_income", 0)
      .not("lease_id", "is", null);
    for (const rec of completeRecords ?? []) {
      // Давхардал: энэ бүртгэлд F-466 гүйлт бүртгэгдсэн үү (pending/ok аль нь ч).
      const { data: existing } = await admin
        .from("crm_rule_runs")
        .select("id")
        .eq("rule_code", "F-466")
        .eq("entity", "crm_monthly_records")
        .eq("entity_id", rec.id)
        .limit(1);
      if (existing?.length) continue;
      await logRun(admin, rec.office_id, "F-466", "crm_monthly_records", rec.id, "pending", {
        month: prevMonth,
        lease_id: rec.lease_id,
        net_income: rec.net_income,
      });
      summary.pmCommissionScans += 1;
    }
  } catch (e) {
    summary.errors.push(`F-466 scan: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Алдаа гарвал сисадминд мэдэгдэнэ (F-602).
  if (summary.errors.length) {
    try {
      const { data: sysadmins } = await admin
        .from("crm_staff")
        .select("profile_id, roles, office_id")
        .eq("is_active", true);
      const targets = (sysadmins ?? [])
        .filter((s) => (s.roles as string[]).includes("sysadmin"))
        .map((s) => s.profile_id);
      if (targets.length) {
        await admin.from("notifications").insert(
          targets.map((id) => ({
            user_id: id,
            type: "crm_rule_error",
            title: "Сарын cron алдаатай дууслаа",
            body: `crm-monthly: ${summary.errors.length} алдаа — rule_runs логоос харна уу (F-602).`.slice(0, 120),
            link: "/office/crm/settings/rules",
          }))
        );
      }
    } catch {
      /* мэдэгдэл best-effort */
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeMatchesCore, type StrongMatchInfo } from "@/lib/queries-crm-matching";
import { deliveryTier, DELIVERY_TIER_LABEL } from "@/lib/crm/matching";

/**
 * CRM тохируулгын арын тооцоолол (D8, F-259) — 10 мин тутам (vercel.json).
 * Дараалал = crm_rule_runs-ийн status='pending' мөрүүд (D-07 идэвхжүүлэлтийн
 * урвуу тохируулга, F-255 өөрчлөлтийн дахин тооцоолол). Үр дүн мөр бүрд
 * шинэчлэгдэнэ; хүчтэй тохироонд ангиллаар ялгасан хүргэлтийн мэдэгдэл (F-254).
 *
 * Хамгаалалт: Authorization: Bearer CRON_SECRET (Vercel) эсвэл ?key=.
 */

export const maxDuration = 300;

type Admin = ReturnType<typeof createAdminClient>;

type PendingRun = {
  id: number;
  office_id: string;
  rule_code: string;
  entity: string | null;
  entity_id: string | null;
};

/** Хүчтэй тохироонд эзэмшигч агентад ангиллаар ялгасан мэдэгдэл (F-254 алхам 4–6). */
async function notifyStrongMatches(admin: Admin, officeId: string, propertyId: string, strong: StrongMatchInfo[]) {
  if (strong.length === 0) return 0;

  const contactIds = [...new Set(strong.map((s) => s.contactId))];
  const { data: leads } = await admin
    .from("crm_leads")
    .select("contact_id, owner_id, grade, created_at")
    .eq("office_id", officeId)
    .in("contact_id", contactIds)
    .in("status", ["new", "active"])
    .not("owner_id", "is", null)
    .order("created_at", { ascending: false });

  const leadByContact = new Map<string, { owner_id: string; grade: string | null }>();
  for (const l of leads ?? []) {
    if (l.owner_id && !leadByContact.has(l.contact_id)) {
      leadByContact.set(l.contact_id, { owner_id: l.owner_id, grade: l.grade });
    }
  }

  const { data: property } = await admin
    .from("crm_properties")
    .select("name, number")
    .eq("id", propertyId)
    .maybeSingle();
  const propertyLabel = property ? `${property.name} (${property.number})` : "Шинэ листинг";

  let sent = 0;
  const perOwner = new Map<string, { count: number; tierLabel: string }>();
  for (const s of strong) {
    const lead = leadByContact.get(s.contactId);
    if (!lead) continue;
    const tier = deliveryTier(lead.grade, "strong");
    if (tier === "none") continue;
    const cur = perOwner.get(lead.owner_id);
    perOwner.set(lead.owner_id, {
      count: (cur?.count ?? 0) + 1,
      tierLabel: DELIVERY_TIER_LABEL[tier],
    });
  }

  for (const [ownerId, info] of perOwner) {
    const { data: profile } = await admin.from("profiles").select("role").eq("id", ownerId).maybeSingle();
    const base = profile?.role === "office_admin" || profile?.role === "admin" ? "/office/crm" : "/agent/crm";
    const { error } = await admin.from("notifications").insert({
      user_id: ownerId,
      type: "crm_match_found",
      title: "Хүчтэй тохироо олдлоо",
      body: `${propertyLabel}: таны ${info.count} харилцагчид хүчтэй тохирч байна. ${info.tierLabel}.`.slice(0, 120),
      link: `${base}/properties/${propertyId}`,
    });
    if (!error) sent += 1;
  }
  return sent;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}` && searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("crm_rule_runs")
    .select("id, office_id, rule_code, entity, entity_id")
    .eq("status", "pending")
    .in("rule_code", ["D-07", "F-255"])
    .order("ran_at", { ascending: true })
    .limit(40);
  if (error) {
    console.error("crm-matching cron:", error.message);
    return NextResponse.json({ ok: false, error: "queue read failed" }, { status: 500 });
  }

  const runs = (pending ?? []) as PendingRun[];
  // Нэг объект/профайлын давхардсан хүсэлтийг нэг л удаа тооцно (сүүлийнх нь).
  const seen = new Set<string>();
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let notified = 0;

  for (const run of [...runs].reverse()) {
    const key = `${run.entity}:${run.entity_id}`;
    if (!run.entity || !run.entity_id) {
      await admin.from("crm_rule_runs").update({ status: "skipped", error: "entity дутуу" }).eq("id", run.id);
      skipped += 1;
      continue;
    }
    if (seen.has(key)) {
      await admin
        .from("crm_rule_runs")
        .update({ status: "skipped", result: { reason: "superseded" } })
        .eq("id", run.id);
      skipped += 1;
      continue;
    }
    seen.add(key);

    try {
      if (run.entity === "crm_properties") {
        // Объект идэвхтэй хэвээр үү (queue-д хоцорсон байж болно).
        const { data: prop } = await admin
          .from("crm_properties")
          .select("id, status")
          .eq("id", run.entity_id)
          .eq("office_id", run.office_id)
          .maybeSingle();
        if (!prop || prop.status !== "active") {
          await admin
            .from("crm_rule_runs")
            .update({ status: "skipped", result: { reason: "not_active" } })
            .eq("id", run.id);
          skipped += 1;
          continue;
        }
        const summary = await recomputeMatchesCore(
          admin,
          run.office_id,
          { propertyId: run.entity_id },
          "property_to_profile"
        );
        if (run.rule_code === "D-07") {
          notified += await notifyStrongMatches(admin, run.office_id, run.entity_id, summary.strongMatches);
        }
        await admin
          .from("crm_rule_runs")
          .update({
            status: "ok",
            result: { written: summary.written, strong: summary.strongMatches.length },
          })
          .eq("id", run.id);
      } else if (run.entity === "crm_need_profiles") {
        const summary = await recomputeMatchesCore(admin, run.office_id, { profileId: run.entity_id });
        await admin
          .from("crm_rule_runs")
          .update({
            status: "ok",
            result: { written: summary.written, strong: summary.strongMatches.length },
          })
          .eq("id", run.id);
      } else {
        await admin
          .from("crm_rule_runs")
          .update({ status: "skipped", error: `үл мэдэх entity: ${run.entity}` })
          .eq("id", run.id);
        skipped += 1;
        continue;
      }
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("crm-matching cron run:", run.id, msg);
      await admin.from("crm_rule_runs").update({ status: "error", error: msg.slice(0, 500) }).eq("id", run.id);
      errors += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, skipped, errors, notified });
}

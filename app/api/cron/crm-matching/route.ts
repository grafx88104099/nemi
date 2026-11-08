import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/crm/cron-auth";
import { recomputeMatchesCore, notifyMatchSignals } from "@/lib/queries-crm-matching";

/**
 * Тохируулгын арын тооцоолол (§6.10.3, §6.28.9) — Supabase pg_cron 10 минут
 * тутам дуудна (migration 20261107000600); vercel.json-ийн өдрийн 1 дуудлага
 * нөөц. Листинг идэвхжихэд тооцоолол шууд хийгддэг (setPropertyStatus) —
 * энэ дараалал нь алдаа гарсан, эсвэл үнэ/шошго/профайл өөрчлөгдсөн мөрийг
 * гүйцээнэ (crm_rule_runs status='pending'). Хүчтэй, боломжит тохироонд
 * ангиллаар ялгасан нэгдсэн дохио (§6.10.4–6).
 *
 * Хамгаалалт: cronAuthError (Authorization: Bearer CRON_SECRET эсвэл ?key=).
 */

export const maxDuration = 300;

type PendingRun = {
  id: number;
  office_id: string;
  rule_code: string;
  entity: string | null;
  entity_id: string | null;
};

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("crm_rule_runs")
    .select("id, office_id, rule_code, entity, entity_id")
    .eq("status", "pending")
    .in("rule_code", ["D-07", "F-255"])
    .order("ran_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("crm-matching cron:", error.message);
    return NextResponse.json({ ok: false, error: "queue read failed" }, { status: 500 });
  }

  const runs = (pending ?? []) as PendingRun[];
  // Нэг үл хөдлөх/профайлын давхардсан хүсэлтийг нэг л удаа тооцно (сүүлийнх нь).
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
        // Шинэ листинг (Д-07) болон үнэ/шошгоны өөрчлөлтөд сегментийн дохио.
        notified += await notifyMatchSignals(admin, run.office_id, run.entity_id, summary.signalMatches);
        await admin
          .from("crm_rule_runs")
          .update({
            status: "ok",
            result: {
              written: summary.written,
              strong: summary.strongMatches.length,
              possible: summary.signalMatches.length - summary.strongMatches.length,
            },
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

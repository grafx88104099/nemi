import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToProfiles } from "@/lib/crm/push";
import { ubToday } from "@/lib/crm2/datetime";
import { ubParts } from "@/lib/format";
import { digestPushAllowed, digestPushBody, digestPushTarget } from "@/lib/crm2/queries/incomplete";

/**
 * CRM-ийн өдрийн нэгтгэсэн сануулгын push (P10). crm2_daily_digest (pg_cron, 19:00 УБ) апп доторх
 * мэдэгдлийг үүсгэж crm2_digest_log-д бичнэ; энэ route (Vercel Cron, 19:15 УБ) тухайн өдрийн push хийгээгүй
 * мөрийг төхөөрөмж рүү ганц push болгож илгээгээд pushed_at тавина.
 *
 * Зөвхөн crm2_digest_log-оос — бусад crm2_* мэдэгдлийг push хийхгүй. crm2_incomplete_digest-ийн сувагт «push»
 * байгаа хэрэглэгчид л (хувийн сонголт, эс бөгөөс оффисын матриц). Холбоос нь апп доторх мэдэгдэлтэй ижил. Бичвэрт зөвхөн тоо (код, нэр, утас огт
 * орохгүй). Шөнө push хийхгүй: УБ-ын 09:00–20:59-ээс гадуур юу ч илгээхгүй (cron хоцорсон/дахин ажилласан ч).
 *
 * Хамгаалалт (search-alerts-тэй ижил): CRON_SECRET тохируулсан бол ?key=<secret> эсвэл
 * `Authorization: Bearer <secret>` таарах ёстой.
 */

const BATCH = 200;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  if (secret && searchParams.get("key") !== secret && bearer !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const hour = ubParts(Date.now()).h;
  if (hour < 9 || hour >= 21) return NextResponse.json({ ok: true, skipped: "quiet_hours" });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const admin = createAdminClient();
  const today = ubToday();
  const { data, error } = await admin
    .from("crm2_digest_log")
    .select("profile_id, office_id, digest_date, counts")
    .eq("digest_date", today)
    .is("pushed_at", null)
    .order("notified_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("crm2 digest push:", error.message);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const rows = data ?? [];
  const EVENT = "crm2_incomplete_digest";
  const prefs = new Map<string, string[]>();
  const matrix = new Map<string, string[]>();
  if (rows.length) {
    const [p, m] = await Promise.all([
      admin
        .from("crm_notification_prefs")
        .select("profile_id, channels")
        .eq("event_code", EVENT)
        .in("profile_id", [...new Set(rows.map((r) => r.profile_id))]),
      admin
        .from("crm_notification_matrix")
        .select("office_id, channels")
        .eq("event_code", EVENT)
        .in("office_id", [...new Set(rows.map((r) => r.office_id))]),
    ]);
    if (p.error || m.error) {
      console.error("crm2 digest push prefs:", p.error?.message ?? m.error?.message);
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }
    for (const r of p.data ?? []) prefs.set(r.profile_id, (r.channels as string[] | null) ?? []);
    // Оффисын матрицад нэг үйл явдлын хэд хэдэн мөр (үүргээр) байж болно — сувгуудыг нэгтгэнэ.
    for (const r of m.data ?? []) matrix.set(r.office_id, [...(matrix.get(r.office_id) ?? []), ...((r.channels as string[] | null) ?? [])]);
  }

  let pushed = 0;
  let devices = 0;
  for (const row of rows) {
    if (digestPushAllowed(prefs.get(row.profile_id), matrix.get(row.office_id))) {
      const target = digestPushTarget(row.counts);
      devices += await sendPushToProfiles(admin, [row.profile_id], {
        title: target.title,
        body: digestPushBody(row.counts),
        url: target.url,
        tag: "crm2-digest",
      });
    }
    // Төхөөрөмжгүй / push сувгийг хаасан ч тэмдэглэнэ — дахин ажиллахад давтахгүй (апп доторх мэдэгдэл аль хэдийн бий).
    const upd = await admin
      .from("crm2_digest_log")
      .update({ pushed_at: new Date().toISOString() })
      .eq("profile_id", row.profile_id)
      .eq("digest_date", row.digest_date);
    if (upd.error) console.error("crm2 digest push mark:", upd.error.message);
    else pushed++;
  }

  return NextResponse.json({ ok: true, rows: data?.length ?? 0, marked: pushed, devices });
}

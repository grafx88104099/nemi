import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { applyListingFilters, filtersHref, parseListingFilters } from "@/lib/listing-filters";
import { applySmartQuery } from "@/lib/search/parse-query";
import { withSavedSearchParam } from "@/lib/hub";
import { cronAuthError } from "@/lib/crm/cron-auth";
import { claimSearchAlert } from "@/lib/search/alert-guard";

/**
 * Хадгалсан хайлтын сэрэмжлүүлэг (cron).
 * Сүүлийн 24 цагт нийтлэгдсэн, тохирох идэвхтэй зар олдвол
 * хэрэглэгчид апп доторх мэдэгдэл үүсгэнэ.
 *
 * Хамгаалалт: cronAuthError — зөвхөн `Authorization: Bearer <CRON_SECRET>` (Vercel Cron),
 * deploy орчинд нууц тохируулаагүй бол хаалттай. Vercel Cron-оор өдөрт нэг удаа (vercel.json);
 * route-ыг дахин дуудсан ч нэг хайлтад UTC өдөрт нэг л мэдэгдэл (claimSearchAlert).
 */
export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: searches } = await admin
    .from("saved_searches")
    .select("id, user_id, name, filters")
    .eq("alert_enabled", true);

  let created = 0;
  let skipped = 0;

  for (const s of searches ?? []) {
    // Жагсаалттай НЭГ шүүлт (Түрээс/Худалдах, талбай орно). Хугацааг энд
    // «сүүлийн 24 цаг»-аар шүүдэг тул хадгалсан «posted»-ийг алгасна.
    // Хуучин хадгалсан чөлөөт текстийг («2 өрөө түрээс») /listings-ийн каноник
    // холбоостой ЯГ ижлээр задална — мэдэгдэл ба жагсаалтын үр дүн зөрөхгүй.
    const f = applySmartQuery(parseListingFilters((s.filters ?? {}) as Record<string, string>)).filters;
    const q = applyListingFilters(
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", since),
      f,
      { ignorePosted: true }
    );

    const { count } = await q;
    if (count && count > 0) {
      // Өнөөдөр энэ хайлтад мэдэгдэл аль хэдийн илгээсэн бол давтахгүй.
      if (!(await claimSearchAlert((fn, args) => admin.rpc(fn, args), s.id))) {
        skipped++;
        continue;
      }
      await admin.from("notifications").insert({
        user_id: s.user_id,
        type: "alert",
        title: "Шинэ зар таны хайлтад",
        body: `«${s.name ?? "Хайлт"}» — ${count} шинэ зар нэмэгдлээ.`,
        // ?ss=<id> — нээхэд /listings-ийн SavedSearchSeen хаб дээрх «N шинэ»-г цэвэрлэнэ.
        link: withSavedSearchParam(filtersHref("/listings", f, { withSort: true }), s.id),
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, searches: searches?.length ?? 0, notified: created, skipped });
}

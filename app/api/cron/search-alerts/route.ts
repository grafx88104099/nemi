import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { applyListingFilters, filtersHref, parseListingFilters } from "@/lib/listing-filters";

/**
 * Хадгалсан хайлтын сэрэмжлүүлэг (cron).
 * Сүүлийн 24 цагт нийтлэгдсэн, тохирох идэвхтэй зар олдвол
 * хэрэглэгчид апп доторх мэдэгдэл үүсгэнэ.
 *
 * Хамгаалалт: CRON_SECRET тохируулсан бол ?key=<secret> таарах ёстой.
 * Vercel Cron-оор өдөрт нэг удаа дуудна (vercel.json).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  // Vercel Cron нь CRON_SECRET-ийг `Authorization: Bearer` толгойгоор илгээдэг —
  // өмнө нь зөвхөн ?key-г шалгадаг тул нууц тохируулбал cron өөрөө 401 авдаг байв.
  const bearer = request.headers.get("authorization");
  if (secret && searchParams.get("key") !== secret && bearer !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: searches } = await admin
    .from("saved_searches")
    .select("id, user_id, name, filters")
    .eq("alert_enabled", true);

  let created = 0;

  for (const s of searches ?? []) {
    // Жагсаалттай НЭГ шүүлт (Түрээс/Худалдах, талбай орно). Хугацааг энд
    // «сүүлийн 24 цаг»-аар шүүдэг тул хадгалсан «posted»-ийг алгасна.
    const f = parseListingFilters((s.filters ?? {}) as Record<string, string>);
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
      await admin.from("notifications").insert({
        user_id: s.user_id,
        type: "alert",
        title: "Шинэ зар таны хайлтад",
        body: `«${s.name ?? "Хайлт"}» — ${count} шинэ зар нэмэгдлээ.`,
        link: filtersHref("/listings", f, { withSort: true }),
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, searches: searches?.length ?? 0, notified: created });
}

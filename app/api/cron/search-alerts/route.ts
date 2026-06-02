import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

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
  if (secret && searchParams.get("key") !== secret) {
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
    const f = (s.filters ?? {}) as Record<string, string>;
    let q = admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("created_at", since);

    if (f.q) q = q.ilike("title", `%${f.q}%`);
    if (f.district) q = q.eq("district", f.district);
    if (f.type) q = q.eq("type", f.type);
    if (f.rooms) q = q.gte("rooms", Number(f.rooms));
    if (f.minPrice) q = q.gte("price", Number(f.minPrice));
    if (f.maxPrice) q = q.lte("price", Number(f.maxPrice));

    const { count } = await q;
    if (count && count > 0) {
      const qs = new URLSearchParams(f).toString();
      await admin.from("notifications").insert({
        user_id: s.user_id,
        type: "alert",
        title: "Шинэ зар таны хайлтад",
        body: `«${s.name ?? "Хайлт"}» — ${count} шинэ зар нэмэгдлээ.`,
        link: `/listings?${qs}`,
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, searches: searches?.length ?? 0, notified: created });
}

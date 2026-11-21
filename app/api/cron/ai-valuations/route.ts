import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { aiValuationEnabled, valuateAndStore } from "@/lib/ai/valuate-listing";

/**
 * AI үнэлгээгүй идэвхтэй заруудыг нөхөн үнэлнэ (cron, өдөрт нэг).
 * Зардал хянах үүднээс нэг удаад AI_VALUATION_DAILY_LIMIT (анхдагч 20) зар.
 * Шинэ/засварласан зарыг хадгалах үед аль хэдийн үнэлдэг тул энэ нь зөвхөн
 * хуучин заруудыг гүйцээх ба түлхүүр шинээр тохируулсны дараа хэрэгтэй.
 *
 * Хамгаалалт: CRON_SECRET тохируулсан бол Vercel Cron-ийн
 * `Authorization: Bearer <CRON_SECRET>` эсвэл ?key=<CRON_SECRET> шаардана.
 */
// Hobby багцын хязгаарт багтаана: 4 зэрэг × богино хүсэлт.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(request.url).searchParams.get("key");
    const bearer = request.headers.get("authorization");
    if (key !== secret && bearer !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  if (!aiValuationEnabled()) {
    return NextResponse.json({ ok: true, skipped: "ANTHROPIC_API_KEY тохируулаагүй" });
  }

  const limit = Math.min(200, Math.max(1, Number(process.env.AI_VALUATION_DAILY_LIMIT) || 20));
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("listings")
    .select("id")
    .eq("status", "active")
    .is("ai_score", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  let done = 0;
  const errors: Record<string, number> = {};
  const queue = [...(rows ?? [])];
  let stop = false;
  // 4 зэрэг ажиллана; хурдны хязгаар/түлхүүрийн алдаа гарвал зогсоод маргааш үргэлжилнэ.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let r = queue.shift(); r && !stop; r = queue.shift()) {
        const res = await valuateAndStore(r.id);
        if (res.result) done++;
        else errors[res.error ?? "unknown"] = (errors[res.error ?? "unknown"] ?? 0) + 1;
        if (res.error === "rate_limited" || res.error === "auth") stop = true;
      }
    })
  );

  return NextResponse.json({ ok: true, candidates: rows?.length ?? 0, valuated: done, errors });
}

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/crm/cron-auth";
import { aiValuationEnabled, valuateAndStore } from "@/lib/ai/valuate-listing";

/**
 * AI үнэлгээгүй идэвхтэй заруудыг нөхөн үнэлнэ (cron, өдөрт нэг).
 * Зардал хянах үүднээс нэг удаад AI_VALUATION_DAILY_LIMIT (анхдагч 20) зар.
 * Шинэ/засварласан зарыг хадгалах үед аль хэдийн үнэлдэг тул энэ нь зөвхөн
 * хуучин заруудыг гүйцээх ба түлхүүр шинээр тохируулсны дараа хэрэгтэй.
 *
 * Хамгаалалт: cronAuthError — зөвхөн Vercel Cron-ийн `Authorization: Bearer <CRON_SECRET>`,
 * deploy орчинд нууц тохируулаагүй бол хаалттай (AI зардал).
 */
// Hobby багцын хязгаарт багтаана: 4 зэрэг × богино хүсэлт.
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
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

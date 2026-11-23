"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { aiSearchEnabled } from "@/lib/ai/search-intent";
import { cachedInterpret, parseAiSearchForm, resolveAiSearch, ruleHref, type RateLimitRpc } from "@/lib/search/ai-search";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientKey } from "@/lib/window-limiter";

/**
 * «AI-аар ойлгуулах» (R08c, Stage 3) — /listings дээрх сонголттой маягт.
 * AI унтраастай/алдаатай/хязгаар хэтэрсэн бол дүрмийн задлагчийн үр дүн рүү
 * шилжинэ. IP-г зөвхөн давстай sha256 болгож rate_limit_hit-д дамжуулна
 * (түүхий IP, хайлтын бичвэрийг хадгалах/логлохгүй).
 * redirect() нь try-ийн ГАДНА (Server Action-д 303 + push).
 */
export async function aiSearchAction(formData: FormData): Promise<void> {
  const { base, params } = parseAiSearchForm(formData.entries());
  let href = ruleHref(base, params);

  if (aiSearchEnabled()) {
    const h = await headers();
    const ip = clientKey((name) => h.get(name));
    const admin = createAdminClient();
    const rpc: RateLimitRpc = async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args);
      return { data: typeof data === "boolean" ? data : null, error };
    };
    const fallback = href;
    href = await resolveAiSearch(base, params, {
      ip,
      salt: process.env.RATE_LIMIT_SALT ?? "",
      rpc,
      interpret: (q) => cachedInterpret(q, rpc),
    }).catch(() => fallback);
  }

  redirect(href);
}

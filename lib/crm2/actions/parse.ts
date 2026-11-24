"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import { aiListingParseEnabled, interpretListingText } from "@/lib/ai/parse-listing";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { aiParseAllowed } from "@/lib/crm2/feature-flags";
import { sanitizeParsedFields, type PropertyParseFields } from "@/lib/crm2/listing-text/schema";
import { AUTH_ERROR, NO_ACCESS_ERROR } from "@/lib/crm2/result";
import { crm2Session } from "@/lib/crm2/server";
import { maskPrivate } from "@/lib/crm2/text-privacy";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * «AI-аар задлах» (P9) — Staff шуурхай бүртгэлийн «Зарын текст наах» хэсэгт.
 * УНТРААСТАЙ: орчны хаалга (lib/ai/parse-listing aiListingParseEnabled) БА оффисын
 * ai.listing_parse зөвшөөрөл хоёул шаардлагатай; CRM-д ажиллах эрхтэй (canWork)
 * нэвтэрсэн хэрэглэгч л.
 *
 * Хязгаар (rate_limit_hit, service_role): хэрэглэгч бүр цагт 30, нийт өдөрт
 * AI_LISTING_DAILY_CAP (анхдагч 300). Хэрэглэгчийн түлхүүр нь давстай sha256 —
 * profile id ч, бичвэр ч хадгалагдахгүй. Бичвэрийг серверт ДАХИН далдална
 * (клиентэд найдахгүй) ба хэзээ ч логлохгүй.
 */

const USER_WINDOW_SECONDS = 3600;
const USER_MAX = 30;
const DAILY_CAP_DEFAULT = 300;
const TEXT_MAX = 10_000;

const UNAVAILABLE = "AI задлалт одоогоор боломжгүй. Текстийг дүрмээр задалсан утгыг шалгана уу.";
const LIMITED = "AI задлалтын хязгаарт хүрлээ. Дараа дахин оролдоно уу.";
const FAILED = "AI задалж чадсангүй. Утгуудыг гараар бөглөнө үү.";

const textSchema = z.string().trim().min(1, "Текст хоосон байна.").max(TEXT_MAX, `Текст ${TEXT_MAX} тэмдэгтээс ихгүй.`);

function dailyCap(): number {
  const n = Number(process.env.AI_LISTING_DAILY_CAP);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DAILY_CAP_DEFAULT;
}

async function hit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** «AI-аар задлах» товчийг харуулах эсэх. */
export async function aiListingParseAvailable(): Promise<boolean> {
  if (!aiListingParseEnabled()) return false;
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !ctx.canWork) return false;
  return aiParseAllowed(await getCrm2Settings(), true);
}

export async function parseListingTextAi(
  text: string
): Promise<{ fields: Partial<PropertyParseFields>; method: "ai" } | { error: string }> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? FAILED };

  const session = await crm2Session();
  if (!session) return { error: AUTH_ERROR };
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !ctx.canWork) return { error: NO_ACCESS_ERROR };
  const envEnabled = aiListingParseEnabled();
  const settings = await getCrm2Settings();
  if (!aiParseAllowed(settings, envEnabled)) return { error: UNAVAILABLE };

  const salt = process.env.RATE_LIMIT_SALT ?? "";
  const userKey = `crm2-ai-parse:user:${createHash("sha256").update(`${salt}:${session.userId}`).digest("hex")}`;
  if (!(await hit(userKey, USER_WINDOW_SECONDS, USER_MAX))) return { error: LIMITED };
  if (!(await hit("crm2-ai-parse:global", 86_400, dailyCap()))) return { error: LIMITED };

  const masked = maskPrivate(parsed.data);
  const ai = await interpretListingText(masked, {
    districts: settings["property.districts"],
    featureKeys: Object.keys(settings["property.features"]),
  });
  if (!ai) return { error: FAILED };
  return { fields: sanitizeParsedFields(ai), method: "ai" };
}

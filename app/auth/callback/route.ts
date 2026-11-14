import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/nav";

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * OAuth / имэйл баталгаажуулалтын callback.
 *
 * `?code=` (PKCE) эсвэл `?token_hash=&type=` (имэйл загвар)-ийг session болгоно.
 * Аль нь ч бүтэхгүй бол токен URL hash-д (#access_token=…) ирсэн байж магадгүй
 * — серверт hash харагддаггүй тул /auth/confirm (client) руу шилжүүлнэ.
 * Хөтөч шилжихдээ fragment-ийг хадгалдаг.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Зөвхөн дотоод зам (open redirect-ээс сэргийлнэ).
  const next = safeNext(searchParams.get("next") ?? undefined, "/", "/");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const fallback = new URL("/auth/confirm", origin);
  fallback.searchParams.set("next", next);
  // PKCE солилт бүтсэнгүй — code verifier cookie байхгүй (линкийг өөр хөтөч
  // дээр нээсэн). Client дээр hash үлдсэн эсэхийг шалгаад тодорхой мессеж өгнө.
  if (code) fallback.searchParams.set("error", "pkce");
  return NextResponse.redirect(fallback);
}

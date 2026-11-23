import { createHmac } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/crm2/phone";
import { isMnPhoneDigits, maskPhone, otpSmsText } from "@/lib/auth/phone-login";
import { secretKeyBytes, verifyStandardWebhook } from "@/lib/auth/standard-webhooks";
import { getSmsProvider } from "@/lib/sms/provider";
import { readTextCapped } from "@/lib/http/read-capped";

/**
 * R09 Stage 2 — Supabase Auth «Send SMS» hook (HTTPS). Supabase нь OTP-г энд
 * илгээж, бид өөрийн SMS gateway-ээр хэрэглэгчид хүргэнэ.
 *
 * Унтраастай (500 «not configured»): SUPABASE_SMS_HOOK_SECRET, SMS provider
 * (SMS_API_URL + SMS_API_TOKEN) эсвэл service role тохируулаагүй бол.
 *
 * Статусын бодлого: 401 = гарын үсэг буруу; 400 = бизнесийн татгалзал (+976 биш,
 * дугаар солих, өдрийн хязгаар); 500 = унтраастай эсвэл provider-ийн алдаа.
 * 429/503-ийг САНААТАЙ хэрэглэхгүй — GoTrue тэдгээрийг дахин оролдох ёстой гэж үзэж магадгүй.
 *
 * Хариуны мессеж клиентэд хүрнэ гэж UI найддаггүй (GoTrue ерөнхий мессежээр
 * сольж болно). TODO(e2e): end-to-end тестээр аль хэлбэр нь хувийн мессежийг
 * дамжуулдгийг шалгаж, үр дүнг энд тэмдэглэ.
 *
 * Хэзээ ч бүү логло: OTP, бүтэн дугаар, hash, түүхий body.
 */
export const runtime = "nodejs";

const MAX_BODY = 32_768;

const PayloadSchema = z.object({
  user: z
    .object({
      id: z.string(),
      phone: z.string().optional().default(""),
      new_phone: z.string().optional().nullable(),
    })
    .loose(),
  sms: z.object({ otp: z.string().regex(/^\d{4,10}$/) }).loose(),
});

function hookError(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: Request) {
  // (1) Унтраастай эсэх
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET?.trim();
  const provider = getSmsProvider();
  const serviceOk = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !provider || !serviceOk) return hookError(500, "Phone login is not configured");

  // (2) Түүхий body (гарын үсгийг parse хийхээс ӨМНӨ шалгана)
  //     Хэмжээг уншиж байхдаа шалгана (chunked хүсэлтийг бүтнээр нь буферлэхгүй).
  const raw = await readTextCapped(request, MAX_BODY);
  if (raw == null) return hookError(400, "Payload too large");

  // (3) Standard Webhooks гарын үсэг
  const ok = verifyStandardWebhook({
    payload: raw,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    secret,
  });
  if (!ok) return hookError(401, "Invalid signature");

  // (4) Бүтэц
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return hookError(400, "Invalid payload");
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) return hookError(400, "Invalid payload");
  const { user, sms } = parsed.data;

  // (5) Дугаар солих (phone_change) — хамрах хүрээнээс гадуур; код ХУУЧИН дугаарт очих байсан.
  if (user.new_phone && user.new_phone.trim()) return hookError(400, "Дугаар солих боломжгүй");

  // (6) Зөвхөн Монгол гар утас
  const digits = normalizePhone(user.phone);
  if (!isMnPhoneDigits(digits)) return hookError(400, "Зөвхөн Монгол (+976) утасны дугаар дэмжинэ");

  // (7) Дугаар тутмын хязгаар. Fail closed — SMS мөнгө зарцуулна.
  //     (а) phone_otp_sends-ээр гулсах 24 цаг — хурдан татгалзал (атомар биш);
  //     (б) rate_limit_hit — тоолох+нэмэх НЭГ атомар алхам (UTC өдрийн тогтмол цонх),
  //         зэрэгцээ хүсэлтүүд (а)-г давсан ч өдөрт max-аас илүү SMS гарахгүй.
  const phoneHash = createHmac("sha256", secretKeyBytes(secret)).update(digits).digest("hex");
  const admin = createAdminClient();
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count, error: countErr } = await admin
    .from("phone_otp_sends")
    .select("id", { count: "exact", head: true })
    .eq("phone_hash", phoneHash)
    .gte("sent_at", since);
  if (countErr) {
    console.error("[sms-hook] counter unavailable");
    return hookError(500, "SMS илгээж чадсангүй");
  }
  const envMax = Math.floor(Number(process.env.PHONE_OTP_MAX_PER_DAY));
  const max = Number.isFinite(envMax) && envMax >= 1 ? envMax : 5;
  if ((count ?? 0) >= max) {
    console.warn("[sms-hook] cap", maskPhone(digits));
    return hookError(400, "Хэт олон код хүслээ. Маргааш дахин оролдоно уу.");
  }
  const { data: allowed, error: rlErr } = await admin.rpc("rate_limit_hit", {
    p_key: `otp:${phoneHash}`,
    p_window_seconds: 86_400,
    p_max: max,
  });
  if (rlErr) {
    console.error("[sms-hook] limiter unavailable");
    return hookError(500, "SMS илгээж чадсангүй");
  }
  if (allowed !== true) {
    console.warn("[sms-hook] cap", maskPhone(digits));
    return hookError(400, "Хэт олон код хүслээ. Маргааш дахин оролдоно уу.");
  }
  const { error: insErr } = await admin.from("phone_otp_sends").insert({ phone_hash: phoneHash });
  if (insErr) {
    console.error("[sms-hook] counter insert failed");
    return hookError(500, "SMS илгээж чадсангүй");
  }

  // (8) Илгээх
  const r = await provider.send({ to: `+${digits}`, text: otpSmsText(sms.otp) });
  if (!r.ok) {
    console.error("[sms-hook] send failed", provider.name, maskPhone(digits), r.error);
    return hookError(500, "SMS илгээж чадсангүй");
  }

  // (9) Амжилт
  return Response.json({}, { status: 200 });
}

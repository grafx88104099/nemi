/**
 * SMS илгээгчийн adapter-ууд (R09 Stage 2, Send SMS hook). ЗӨВХӨН сервер дээр —
 * SMS_API_TOKEN нууц тул клиент компонентоос бүү импортло.
 *
 * Env тохируулаагүй бол getSmsProvider() → null (hook унтраастай, 500).
 * Бодит Монгол gateway-ууд GET/query эсвэл өөр талбарын нэр шаардах, UCS-2
 * (кирилл) дэмжихгүй байж болно — тэр үед энд шинэ adapter case нэм, эсвэл
 * латин SMS_OTP_TEMPLATE тавь.
 */
import { maskPhone } from "@/lib/auth/phone-login";

export type SmsSendResult = { ok: true } | { ok: false; error: string; retryable?: boolean };

export interface SmsProvider {
  name: string;
  send(msg: { to: string; text: string }): Promise<SmsSendResult>;
}

type Env = Record<string, string | undefined>;

function httpProvider(env: Env): SmsProvider | null {
  const url = env.SMS_API_URL?.trim();
  const token = env.SMS_API_TOKEN?.trim();
  if (!url || !token) return null;
  if (env.NODE_ENV === "production" && !url.startsWith("https://")) return null;
  const from = env.SMS_SENDER?.trim() || "Nemi";

  return {
    name: "http",
    async send(msg) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ from, to: msg.to, text: msg.text }),
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        });
        if (res.ok) return { ok: true };
        // Токен, бичвэрийг алдаанд хэзээ ч бүү оруул.
        return { ok: false, error: `http_${res.status}`, retryable: res.status >= 500 };
      } catch {
        return { ok: false, error: "network", retryable: true };
      }
    },
  };
}

function consoleProvider(env: Env): SmsProvider | null {
  // Зөвхөн локал (tunnel) тест — production-д хэзээ ч асахгүй.
  if (env.NODE_ENV === "production") return null;
  return {
    name: "console",
    async send(msg) {
      console.log(`[sms:console] to=${maskPhone(msg.to)} text=${msg.text}`);
      return { ok: true };
    },
  };
}

export function getSmsProvider(env: Env = process.env): SmsProvider | null {
  const name = (env.SMS_PROVIDER?.trim() || "http").toLowerCase();
  if (name === "http") return httpProvider(env);
  if (name === "console") return consoleProvider(env);
  return null;
}

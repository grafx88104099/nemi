"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/crm2/phone";
import { localDigitsInput, toMnE164 } from "@/lib/auth/phone-login";
import { markPhoneVerified } from "@/lib/actions/phone-auth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

const RESEND_COOLDOWN_SEC = 60;

type AuthErr = { code?: string; status?: number } | null;

/**
 * Hook-ийн өөрийн мессежид найдахгүй (GoTrue сольж болно) — зөвхөн code/status-аар
 * ерөнхий Монгол мессеж сонгоно.
 */
function sendErrorMessage(error: AuthErr): string {
  if (
    error?.code === "over_sms_send_rate_limit" ||
    error?.code === "over_request_rate_limit" ||
    error?.status === 429
  ) {
    return "Хэт олон оролдлого. Хэсэг хүлээгээд дахин оролдоно уу.";
  }
  if (error?.code === "phone_provider_disabled") return "Утсаар нэвтрэх түр боломжгүй байна.";
  // sms_send_failed, hook_timeout*, unexpected_failure, үл мэдэгдэх — бүгд нэг мессеж.
  return "SMS илгээж чадсангүй. Дугаараа шалгаад дахин оролдоно уу.";
}

/** R09 Stage 2 — утасны дугаар + SMS кодоор нэвтрэх (Supabase phone OTP). */
export function PhoneOtpForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [digits, setDigits] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // «Дугаар солих»-ын дараа фокусыг дугаарын талбарт буцаана.
  const [backToPhone, setBackToPhone] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function sendCode(phone: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await createClient().auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true, channel: "sms" },
      });
      if (err) {
        setError(sendErrorMessage(err));
        return false;
      }
      setCooldown(RESEND_COOLDOWN_SEC);
      return true;
    } catch {
      setError(sendErrorMessage(null));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitPhone(e: React.FormEvent) {
    e.preventDefault();
    const phone = toMnE164(digits);
    if (!phone) {
      setError("Монгол утасны 8 оронтой дугаар оруулна уу.");
      return;
    }
    if (await sendCode(phone)) {
      setE164(phone);
      setCode("");
      setStep("code");
    }
  }

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!e164 || !code) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await createClient().auth.verifyOtp({ phone: e164, token: code, type: "sms" });
      if (err || !data.session) {
        setError("Код буруу эсвэл хугацаа нь дууссан байна.");
        setLoading(false);
        return;
      }
      await markPhoneVerified().catch(() => undefined);
      router.push(next);
      router.refresh();
    } catch {
      setError("Код буруу эсвэл хугацаа нь дууссан байна.");
      setLoading(false);
    }
  }

  if (step === "code" && e164) {
    return (
      <form onSubmit={onSubmitCode} className="space-y-4">
        <p className="text-sm text-muted">
          Таны <b className="text-ink">{formatPhone(e164)}</b> дугаарт код илгээлээ.
        </p>
        <Field label="Баталгаажуулах код" htmlFor="otp-code">
          <Input
            id="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="123456"
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading || !code} className="w-full">
          {loading ? "Шалгаж байна..." : "Нэвтрэх"}
        </Button>
        <div className="-mx-2 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={loading || cooldown > 0}
            onClick={() => void sendCode(e164)}
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-brand-600 hover:underline disabled:text-subtle disabled:no-underline"
          >
            {cooldown > 0 ? `Дахин илгээх (${cooldown}с)` : "Дахин илгээх"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setBackToPhone(true);
              setStep("phone");
              setError(null);
              setCode("");
            }}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-muted hover:underline"
          >
            Дугаар солих
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitPhone} className="space-y-4">
      <Field label="Утасны дугаар" htmlFor="phone">
        <div className="flex items-stretch gap-2">
          <span className="inline-flex h-11 shrink-0 items-center rounded-xl border border-line bg-surface-2 px-3 text-sm font-semibold text-muted">
            +976
          </span>
          <Input
            id="phone"
            autoFocus={backToPhone}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            value={digits.length === 8 ? formatPhone(digits) : digits}
            onChange={(e) => setDigits(localDigitsInput(e.target.value))}
            placeholder="9911 2233"
          />
        </div>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Илгээж байна..." : "Код авах"}
      </Button>
    </form>
  );
}

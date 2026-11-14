"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/nav";
import { ButtonLink } from "@/components/ui/button";

/**
 * И-мэйлийн холбоосыг session болгож хувиргах CLIENT хуудас.
 *
 * Supabase гурван янзаар буцаадаг тул гурвууланг нь энд барина:
 *  1. `#access_token=…&refresh_token=…` (implicit — урилга, нууц үг сэргээх)
 *     → серверийн route hash-ийг уншиж чаддаггүй тул ЗААВАЛ client дээр.
 *  2. `?token_hash=…&type=…` (имэйл загварт `{{ .TokenHash }}` хэрэглэсэн бол)
 *  3. `?code=…` (PKCE — нөөц болгон)
 * Алдаатай/хугацаа дууссан бол `#error_code=…` ирнэ.
 */

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export default function AuthConfirmPage() {
  const router = useRouter();
  const [failed, setFailed] = useState<null | "expired" | "pkce" | "generic">(null);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const qs = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      // Зөвхөн дотоод зам (open redirect-ээс сэргийлнэ).
      const next = safeNext(qs.get("next") ?? undefined, "/", "/");
      setIsRecovery(next.startsWith("/reset-password"));

      // Supabase-аас ирсэн алдаа (хугацаа дууссан, аль хэдийн хэрэглэсэн г.м.).
      const errCode = hash.get("error_code") || qs.get("error_code");
      const err = hash.get("error") || qs.get("error");
      if (errCode || err) {
        setFailed(
          /expired/i.test(errCode ?? "") ? "expired" : err === "pkce" ? "pkce" : "generic"
        );
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = qs.get("token_hash");
      const type = qs.get("type");
      const code = qs.get("code");

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && type && OTP_TYPES.has(type)) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as EmailOtpType,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("no_session");
        // Сервер шинэ cookie-г уншихын тулд refresh хийнэ.
        router.replace(next);
        router.refresh();
      } catch {
        setFailed("generic");
      }
    };
    run();
  }, [router]);

  if (failed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-bold text-ink">Холбоос ажиллахгүй байна</h1>
        <p className="max-w-sm text-sm text-muted">
          {failed === "expired"
            ? "Энэ холбоосын хугацаа дууссан эсвэл аль хэдийн ашиглагдсан байна."
            : failed === "pkce"
              ? "Холбоосыг эхэлж хүсэлт илгээсэн хөтчөөс өөр газар нээсэн байна."
              : "Холбоос хүчингүй эсвэл хугацаа нь дууссан байна."}{" "}
          Шинэ холбоос аваад дахин оролдоно уу.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <ButtonLink href={isRecovery ? "/forgot-password" : "/login"} size="md">
            {isRecovery ? "Шинэ холбоос авах" : "Нэвтрэх"}
          </ButtonLink>
          {isRecovery && (
            <ButtonLink href="/login" variant="outline" size="md">
              Нэвтрэх хуудас
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="size-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <p className="text-sm text-muted">Баталгаажуулж байна...</p>
    </div>
  );
}

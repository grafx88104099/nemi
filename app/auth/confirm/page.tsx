"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Implicit-flow callback (admin generateLink урилга/сэргээх линк).
 * Supabase токеныг URL hash-аар (#access_token=...&refresh_token=...) буцаадаг —
 * server route уншиж чаддаггүй тул энэ CLIENT хуудас setSession-оор cookie-д
 * бичээд (server дараа нь role уншина) `next` руу шилжүүлнэ. PKCE `?code=`-ийг
 * мөн нөөц болгон зохицуулна.
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const qs = new URLSearchParams(window.location.search);
      const next = qs.get("next") || "/";
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = qs.get("code");

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
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
        router.replace(next);
      } catch {
        setError(true);
        setTimeout(() => router.replace("/login?error=auth"), 2500);
      }
    };
    run();
  }, [router]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      {error ? (
        <p className="text-sm text-danger">
          Холбоос хүчингүй эсвэл хугацаа дууссан байна. Нэвтрэх хуудас руу шилжиж байна...
        </p>
      ) : (
        <>
          <div className="size-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-muted">Баталгаажуулж байна...</p>
        </>
      )}
    </div>
  );
}

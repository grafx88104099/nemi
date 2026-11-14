"use client";

import { useState } from "react";

import { createImplicitClient } from "@/lib/supabase/implicit";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // PKCE-гүй client — холбоосыг ямар ч хөтөч/утаснаас нээж болохын тулд
    // (lib/supabase/implicit.ts-ийн тайлбарыг үз). Токен hash-аар ирнэ.
    const supabase = createImplicitClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
    });
    // Аюулгүйн үүднээс и-мэйл бүртгэлтэй эсэхийг илчлэхгүй — зөвхөн
    // илгээлтийн хязгаар/сүлжээний алдааг харуулна.
    if (error && (error.status === 429 || /rate limit|too many/i.test(error.message))) {
      setError("Хэт олон хүсэлт илгээлээ. Хэдэн минутын дараа дахин оролдоно уу.");
      setLoading(false);
      return;
    }
    if (error && !error.status) {
      setError("Сүлжээний алдаа. Дахин оролдоно уу.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="space-y-2 text-center">
        <div className="text-4xl">📩</div>
        <h2 className="text-lg font-bold text-ink">И-мэйлээ шалгана уу</h2>
        <p className="text-sm text-muted">
          Хэрэв <b>{email}</b> бүртгэлтэй бол нууц үг сэргээх холбоос илгээгдсэн.
        </p>
        <p className="text-xs text-subtle">
          Холбоос 1 цагийн дотор хүчинтэй. Ирээгүй бол спам хавтсаа шалгана уу.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Бүртгэлтэй и-мэйл" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ta@example.com" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Илгээж байна..." : "Сэргээх холбоос илгээх"}
      </Button>
    </form>
  );
}

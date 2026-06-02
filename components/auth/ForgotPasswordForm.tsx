"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Аюулгүйн үүднээс үргэлж амжилттай мессеж харуулна (имэйл байгаа эсэхийг илчлэхгүй)
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
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Бүртгэлтэй и-мэйл" htmlFor="email">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ta@example.com" />
      </Field>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Илгээж байна..." : "Сэргээх холбоос илгээх"}
      </Button>
    </form>
  );
}

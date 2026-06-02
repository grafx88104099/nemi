"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Нууц үг хамгийн багадаа 6 тэмдэгт.");
    if (password !== confirm) return setError("Нууц үг таарахгүй байна.");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError("Холбоос хүчингүй эсвэл хугацаа дууссан байж магадгүй. Дахин оролдоно уу.");
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="space-y-2 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-ink">Нууц үг шинэчлэгдлээ</h2>
        <p className="text-sm text-muted">Нэвтрэх хуудас руу шилжиж байна...</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Шинэ нууц үг" htmlFor="pw" hint="Хамгийн багадаа 6 тэмдэгт">
        <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Нууц үг давтах" htmlFor="cf">
        <Input id="cf" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Хадгалж байна..." : "Нууц үг шинэчлэх"}
      </Button>
    </form>
  );
}

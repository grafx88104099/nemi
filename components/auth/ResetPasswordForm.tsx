"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ResetPasswordForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Session хөтөч дээр байгаа эсэх — сервер cookie-г арай хожуу уншиж
  // магадгүй тул энд (client дээр) шалгана.
  const [ready, setReady] = useState<null | boolean>(null);

  const dest = next || "/login";
  const destLabel = dest.startsWith("/agent")
    ? "Агентын самбар"
    : dest.startsWith("/office")
      ? "Оффисын самбар"
      : dest.startsWith("/admin")
        ? "Удирдлагын самбар"
        : "Нэвтрэх хуудас";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Нууц үг хамгийн багадаа 6 тэмдэгт.");
    if (password !== confirm) return setError("Нууц үг таарахгүй байна.");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(
        /different from the old|same.*password/i.test(error.message)
          ? "Шинэ нууц үг хуучнаасаа өөр байх ёстой."
          : /weak|short|least/i.test(error.message)
            ? "Нууц үг хэт энгийн байна. Урт болон тэмдэгт нэмнэ үү."
            : "Хадгалж чадсангүй. Холбоосын хугацаа дууссан байж магадгүй — шинэ холбоос аваад дахин оролдоно уу."
      );
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    // Урилгаар орсон агент session-тэй тул шууд самбартаа шилжинэ.
    setTimeout(() => {
      router.push(dest);
      router.refresh();
    }, 1500);
  }

  if (done) {
    return (
      <div className="space-y-2 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-ink">Нууц үг тохирлоо</h2>
        <p className="text-sm text-muted">{destLabel} руу шилжиж байна...</p>
      </div>
    );
  }

  if (ready === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm text-muted">Шалгаж байна...</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-bold text-ink">Холбоос хүчингүй байна</h2>
        <p className="text-sm text-muted">
          Нууц үг солих холбоосын хугацаа дууссан эсвэл аль хэдийн ашиглагдсан байна.
          Шинэ холбоос аваад дахин оролдоно уу.
        </p>
        <ButtonLink href="/forgot-password" className="w-full">
          Шинэ холбоос авах
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Шинэ нууц үг" htmlFor="pw" hint="Хамгийн багадаа 6 тэмдэгт">
        <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Нууц үг давтах" htmlFor="cf">
        <Input id="cf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Хадгалж байна..." : "Нууц үг шинэчлэх"}
      </Button>
    </form>
  );
}

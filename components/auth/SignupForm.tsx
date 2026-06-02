"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function SignupForm({
  role = "buyer",
  next = "/",
  offices = [],
  inviteToken,
  lockedOffice,
}: {
  role?: "buyer" | "agent";
  next?: string;
  offices?: { id: string; name: string }[];
  inviteToken?: string;
  lockedOffice?: { id: string; name: string };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [officeId, setOfficeId] = useState(lockedOffice?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "agent" && !officeId) {
      setError("Харьяалагдах оффисоо сонгоно уу.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          ...(role === "agent" ? { office_id: officeId } : {}),
          ...(inviteToken ? { invite: inviteToken } : {}),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message.includes("registered") ? "Энэ и-мэйл бүртгэлтэй байна." : error.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setDone(true);
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">📩</div>
        <h2 className="text-lg font-bold text-ink">И-мэйлээ шалгана уу</h2>
        <p className="text-sm text-muted">
          <b>{email}</b> хаягт баталгаажуулах холбоос илгээлээ. Холбоосыг дарж
          бүртгэлээ идэвхжүүлнэ үү.
        </p>
        <Link href="/login" className="block text-sm font-semibold text-brand-600 hover:underline">
          Нэвтрэх хуудас руу
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Бүтэн нэр" htmlFor="full_name">
        <Input
          id="full_name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Б. Болд"
        />
      </Field>
      <Field label="И-мэйл" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ta@example.com"
        />
      </Field>
      <Field label="Нууц үг" htmlFor="password" hint="Хамгийн багадаа 6 тэмдэгт">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      {role === "agent" && lockedOffice && (
        <Field label="Урьсан оффис" htmlFor="office" hint="Та энэ оффисын урилгаар бүртгүүлж байна — батлагдсан агент болно.">
          <div className="flex h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800">
            {lockedOffice.name}
          </div>
        </Field>
      )}
      {role === "agent" && !lockedOffice && (
        <Field
          label="Харьяалагдах оффис"
          htmlFor="office"
          hint="Агент болохын тулд оффист харьяалагдах шаардлагатай. Оффис нь таныг баталгаажуулна."
        >
          <select
            id="office"
            required
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">— Оффис сонгох —</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Бүртгэж байна..." : role === "agent" ? "Агентаар бүртгүүлэх" : "Бүртгүүлэх"}
      </Button>
      <p className="text-center text-sm text-muted">
        Бүртгэлтэй юу?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Нэвтрэх
        </Link>
      </p>
    </form>
  );
}

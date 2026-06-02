"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import type { SupabaseClient } from "@supabase/supabase-js";

type RoleCheck = (
  supabase: SupabaseClient,
  userId: string
) => Promise<string | null>; // алдааны мессеж эсвэл null

export function EmailPasswordForm({
  redirectTo,
  roleCheck,
  submitLabel = "Нэвтрэх",
  emailPlaceholder = "ta@example.com",
  showSignup = false,
}: {
  redirectTo: string;
  roleCheck?: RoleCheck;
  submitLabel?: string;
  emailPlaceholder?: string;
  showSignup?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setError("И-мэйл эсвэл нууц үг буруу байна.");
      setLoading(false);
      return;
    }
    if (roleCheck) {
      const msg = await roleCheck(supabase, data.user.id);
      if (msg) {
        await supabase.auth.signOut();
        setError(msg);
        setLoading(false);
        return;
      }
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="И-мэйл" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={emailPlaceholder} />
      </Field>
      <Field label="Нууц үг" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Нэвтэрч байна..." : submitLabel}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href={`/forgot-password?next=${encodeURIComponent(redirectTo)}`} className="text-muted hover:underline">
          Нууц үг мартсан?
        </Link>
        {showSignup && (
          <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
            Бүртгүүлэх
          </Link>
        )}
      </div>
    </form>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/nav";
import { Card, CardBody } from "@/components/ui/card";
import { AgentLoginForm } from "@/components/auth/AgentLoginForm";

export const metadata = { title: "Агент нэвтрэх — Нэми" };

export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next, "/agent", "/agent");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role === "agent" || profile?.role === "admin") redirect(dest);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-500 text-white">
            <UserCheck className="size-6" />
          </div>
          <h1 className="mt-3 text-xl font-extrabold text-ink">Агентын нэвтрэлт</h1>
          <p className="text-sm text-muted">Агентын самбартаа нэвтэрнэ үү</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <AgentLoginForm next={dest} />
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-muted">
          Агентын бүртгэлийг оффис үүсгэдэг. Оффис нээхийг хүсвэл{" "}
          <Link href="/office-signup" className="font-semibold text-brand-600 hover:underline">энд дарна уу</Link>.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-2 p-3 text-center text-xs text-muted">
            <span className="font-semibold text-brand-600">DEV тэмдэглэл</span> (production-д харагдахгүй)
            <div className="mt-1 font-mono text-ink/70">agent@nemi.mn · agent123</div>
          </div>
        )}
      </div>
    </div>
  );
}

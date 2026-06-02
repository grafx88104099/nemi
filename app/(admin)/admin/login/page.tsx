import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/nav";
import { Card, CardBody } from "@/components/ui/card";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata = { title: "Backoffice нэвтрэх — Нэми" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next, "/admin", "/admin");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role === "admin") redirect(dest);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-500">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-3 text-xl font-extrabold">Нэми Backoffice</h1>
          <p className="text-sm text-white/50">Системийн удирдлагын хэсэг</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <AdminLoginForm next={dest} />
          </CardBody>
        </Card>

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-center text-xs text-white/60">
            <span className="font-semibold text-brand-logo">DEV тэмдэглэл</span> (production-д харагдахгүй)
            <div className="mt-1 font-mono text-white/80">admin@nemi.mn · nemiadmin123</div>
          </div>
        )}
      </div>
    </div>
  );
}

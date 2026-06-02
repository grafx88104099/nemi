import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/nav";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeLoginForm } from "@/components/office/OfficeLoginForm";

export const metadata = { title: "Оффис нэвтрэх — Нэми" };

export default async function OfficeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next, "/office", "/office");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role, office_id").eq("id", user.id).single();
    if ((profile?.role === "office_admin" || profile?.role === "admin") && profile?.office_id) redirect(dest);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-500 text-white">
            <Building2 className="size-6" />
          </div>
          <h1 className="mt-3 text-xl font-extrabold text-ink">Оффисын удирдлага</h1>
          <p className="text-sm text-muted">Өөрийн оффисоо удирдах хэсэг</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <OfficeLoginForm next={dest} />
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-muted">
          Оффисгүй юу?{" "}
          <Link href="/office-signup" className="font-semibold text-brand-600 hover:underline">
            Оффис нээх хүсэлт
          </Link>
        </p>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-2 p-3 text-center text-xs text-muted">
            <span className="font-semibold text-brand-600">DEV тэмдэглэл</span> (production-д харагдахгүй)
            <div className="mt-1 font-mono text-ink/70">office@nemi.mn · office123</div>
          </div>
        )}
      </div>
    </div>
  );
}

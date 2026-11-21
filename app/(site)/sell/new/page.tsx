import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound, Tag } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { DEAL_TYPE_LABEL, type DealType } from "@/lib/constants";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { Card, CardBody } from "@/components/ui/card";
import { ListingForm } from "@/components/dashboard/ListingForm";

export const metadata = { title: "Зар оруулах — Нэми" };

/** Эзэн өөрөө зар оруулах (хяналтын дараа нийтлэгдэнэ). */
export default async function OwnerNewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Зар оруулахын тулд нэвтэрнэ үү (бүртгэл үнэгүй)." next="/sell/new" />;

  const [{ data: profile }, { data: agent }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    supabase.from("agents").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (agent || profile?.role === "agent" || profile?.role === "office_admin") redirect("/agent/listings/new");

  const { deal } = await searchParams;
  const dealType: DealType | null = deal === "rent" ? "rent" : deal === "sale" ? "sale" : null;

  if (!dealType) {
    const opt = (d: DealType, Icon: typeof Tag, sub: string) => (
      <Link
        href={`/sell/new?deal=${d}`}
        className="group flex flex-col items-center rounded-2xl border border-line bg-surface p-8 text-center transition hover:border-brand-500 hover:shadow-md"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
          <Icon className="size-7" aria-hidden />
        </span>
        <span className="mt-4 text-lg font-bold text-ink">{DEAL_TYPE_LABEL[d]}</span>
        <span className="mt-1 text-sm text-muted">{sub}</span>
      </Link>
    );
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link href="/sell" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Буцах
        </Link>
        <h1 className="mt-2 text-center text-2xl font-extrabold text-ink">Ямар зар оруулах вэ?</h1>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {opt("sale", Tag, "Хөрөнгөө худалдах")}
          {opt("rent", KeyRound, "Сар бүр түрээслүүлэх")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/sell/new" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Төрөл өөрчлөх
      </Link>
      <h1 className="mt-1 text-2xl font-extrabold text-ink">
        {dealType === "rent" ? "Түрээслүүлэх зар" : "Худалдах зар"}
      </h1>
      <p className="mt-1 text-sm text-muted">Нийтэд гарахаас өмнө Нэми-ийн баг хянана.</p>
      <Card className="mt-5">
        <CardBody>
          <ListingForm
            initial={{ deal_type: dealType }}
            owner={{ uid: user.id, name: profile?.full_name ?? "", phone: profile?.phone ?? "" }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

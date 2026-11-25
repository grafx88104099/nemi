import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Tag, KeyRound, ArrowLeft } from "lucide-react";

import { getMyAgent } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { ListingForm } from "@/components/dashboard/ListingForm";
import { DEAL_TYPE_LABEL, type DealType } from "@/lib/constants";
import { watermarkFromOffice } from "@/lib/watermark";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { STAFF_NEW_HREF } from "@/components/dashboard/NewListingButtons";

/** CRM-ийн агентад: энэ маягт бол гэрээгүй ШУУД зар; анхдагч зам нь Staff. */
function StaffHint() {
  return (
    <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-ink">
      <p className="font-semibold">Энэ бол гэрээгүй шууд зар.</p>
      <p className="mt-1 text-muted">
        Хөрөнгийг Staff-д нэг удаа бүртгээд PMC тамгатай гэрээгээ PDF-ээр бүртгэмэгц «Зар» хэсгээс нийтэлнэ — зураг нь
        тамгатай, үнэ, төлөв нь Staff-аас автоматаар шинэчлэгдэнэ, дахин бичих шаардлагагүй.
      </p>
      <Link href={STAFF_NEW_HREF} className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline">
        Staff-д хөрөнгө бүртгэх →
      </Link>
    </div>
  );
}

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const agent = await getMyAgent();
  if (!agent) redirect("/agent");

  // Pending агент зар оруулж чадахгүй (оффис батлах хүртэл)
  if (agent.status !== "active") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">Баталгаажуулалт хүлээж байна</h1>
        <p className="mt-2 text-muted">
          «{(agent.office?.name as string) ?? "Таны оффис"}» таны бүртгэлийг баталгаажуулсны
          дараа зар оруулах боломжтой болно. Энэ хооронд профайлаа бэлдэж болно.
        </p>
        <Link href="/agent/profile" className="mt-5 inline-block font-semibold text-brand-600 hover:underline">
          Профайл засах →
        </Link>
      </div>
    );
  }

  const [{ deal }, crm] = await Promise.all([searchParams, getCrmStaffContext()]);
  const dealType: DealType | null = deal === "rent" ? "rent" : deal === "sale" ? "sale" : null;

  // Алхам 1 — Худалдах уу, түрээс үү?
  if (!dealType) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link href="/agent/listings" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Миний зар руу буцах
        </Link>
        <h1 className="mt-4 text-center text-2xl font-extrabold text-ink">Ямар зар оруулах вэ?</h1>
        <p className="mt-2 text-center text-muted">Эхлээд зарын төрлөө сонгоно уу.</p>
        {crm ? <StaffHint /> : null}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/agent/listings/new?deal=sale"
            className="group flex flex-col items-center rounded-2xl border border-line bg-surface p-8 text-center transition hover:border-brand-500 hover:shadow-md"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
              <Tag className="size-7" />
            </span>
            <span className="mt-4 text-lg font-bold text-ink">{DEAL_TYPE_LABEL.sale}</span>
            <span className="mt-1 text-sm text-muted">Үл хөдлөхийг худалдах зар</span>
          </Link>
          <Link
            href="/agent/listings/new?deal=rent"
            className="group flex flex-col items-center rounded-2xl border border-line bg-surface p-8 text-center transition hover:border-brand-500 hover:shadow-md"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
              <KeyRound className="size-7" />
            </span>
            <span className="mt-4 text-lg font-bold text-ink">{DEAL_TYPE_LABEL.rent}</span>
            <span className="mt-1 text-sm text-muted">Сар бүрийн түрээсийн зар</span>
          </Link>
        </div>
      </div>
    );
  }

  // Алхам 2 — сонгосон төрлийн дагуу форм
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/agent/listings/new" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Төрөл өөрчлөх
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-ink">
        {dealType === "rent" ? "Түрээсийн зар нийтлэх" : "Худалдах зар нийтлэх"}
      </h1>
      <Card className="mt-5">
        <CardBody>
          <ListingForm initial={{ deal_type: dealType }} watermark={watermarkFromOffice(agent.office)} />
        </CardBody>
      </Card>
    </div>
  );
}

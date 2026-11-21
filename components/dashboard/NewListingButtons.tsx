import Link from "next/link";
import { Plus } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { ButtonLink } from "@/components/ui/button";

/** Staff-д шинэ хөрөнгө бүртгэх зам (агентын панел). */
export const STAFF_NEW_HREF = "/agent/crm/staff/new";

/**
 * «Шинэ зар» товч. CRM-ийн агентад хөрөнгийг Staff-д НЭГ удаа бүртгэх нь
 * анхдагч — гэрээ батлагдмагц «Зар» хэсгээс нийтэлж, зураг тамгатай, үнэ,
 * төлөв нь автоматаар шинэчлэгддэг. Яаралтай үед гэрээгүй шууд зар оруулах
 * зам хэвээр (жижиг холбоос). CRM-гүй оффисын агентад хуучнаараа.
 */
export async function NewListingButtons({ crm }: { crm?: boolean }) {
  const isCrm = crm ?? !!(await getCrmStaffContext());
  if (!isCrm) {
    return (
      <ButtonLink href="/agent/listings/new" size="sm">
        <Plus className="size-4" /> Шинэ зар
      </ButtonLink>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ButtonLink href={STAFF_NEW_HREF} size="sm">
        <Plus className="size-4" /> Шинэ хөрөнгө
      </ButtonLink>
      <Link
        href="/agent/listings/new"
        className="inline-flex min-h-11 items-center text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Гэрээгүй шууд зар
      </Link>
    </div>
  );
}

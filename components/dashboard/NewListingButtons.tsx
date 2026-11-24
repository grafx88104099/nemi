import Link from "next/link";
import { Plus, Zap } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { quickAddEnabled } from "@/lib/crm2/feature-flags";
import { ButtonLink } from "@/components/ui/button";

/** Staff-д шинэ хөрөнгө бүртгэх зам (агентын панел). */
export const STAFF_NEW_HREF = "/agent/crm/staff/new";

/**
 * «Шинэ зар» товч. CRM-ийн агентад хөрөнгийг Staff-д НЭГ удаа бүртгэх нь
 * анхдагч — гэрээ батлагдмагц «Зар» хэсгээс нийтэлж, зураг тамгатай, үнэ,
 * төлөв нь автоматаар шинэчлэгддэг. Яаралтай үед гэрээгүй шууд зар оруулах
 * зам хэвээр (жижиг холбоос). CRM-гүй оффисын агентад хуучнаараа.
 *
 * Шуурхай бүртгэл (staff.quick_add) нээлттэй агентад «Шинэ зар» хэвээр, хажууд нь
 * «Staff-д бүртгэх үү?» санал (нэг дэлгэцийн шуурхай бүртгэл). Хэзээ ч автоматаар шилжүүлэхгүй.
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
  const [ctx2, settings] = await Promise.all([getCrm2Context(), getCrm2Settings()]);
  const quick = !!ctx2?.isMember && ctx2.canWork && quickAddEnabled(settings, ctx2.profileId);

  if (quick) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href="/agent/listings/new" size="touch" variant="outline">
          <Plus className="size-4" /> Шинэ зар
        </ButtonLink>
        <ButtonLink href={STAFF_NEW_HREF} size="touch">
          <Zap className="size-4" aria-hidden /> Staff-д бүртгэх үү?
        </ButtonLink>
      </div>
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

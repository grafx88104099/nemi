import Link from "next/link";
import { CalendarClock, ImageOff, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateNum } from "@/lib/format";
import { daysUntil } from "@/lib/crm2/datetime";
import { formatAmount } from "@/lib/crm2/money";
import type { PropertyListItem } from "@/lib/crm2/queries/properties";
import { AgentChip, CategoryBadge, CodeChip, Money, PropertyStatusBadge } from "@/components/crm2/ui";

/** Гэрээ дуусахаас өмнө анхааруулах хоног (жагсаалтын тэмдэг). */
const END_WARN_DAYS = 30;

/** Давхрын бичвэр: «5/12 давхар», «5 давхар», «12 давхар барилга». */
export function floorText(floor: number | null, buildingFloors: number | null): string | null {
  if (floor != null && buildingFloors != null) return `${floor}/${buildingFloors} давхар`;
  if (floor != null) return `${floor} давхар`;
  if (buildingFloors != null) return `${buildingFloors} давхар барилга`;
  return null;
}

/** Хэмжээс: «3 өрөө · 82.5 м² · 5/12 давхар». */
export function specsText(item: Pick<PropertyListItem, "rooms" | "area_m2" | "floor" | "building_floors">): string {
  return [
    item.rooms != null ? `${item.rooms} өрөө` : null,
    item.area_m2 != null ? `${formatAmount(item.area_m2)} м²` : null,
    floorText(item.floor, item.building_floors),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * S01 жагсаалтын нэг мөр/карт. Утсан дээр хэвтээ (зураг зүүн талд), том дэлгэцэнд
 * босоо карт. Бүхэлдээ хөрөнгийн карт руу холбоос.
 */
export function StaffPropertyCard({
  item,
  href,
  categoryLabels,
  typeLabels,
  names,
}: {
  item: PropertyListItem;
  href: string;
  categoryLabels: Partial<Record<string, string>>;
  typeLabels: Record<string, string>;
  /** profile_id → нэр (гэрээ хийсэн агентын нэрийг харуулах). */
  names: Record<string, string>;
}) {
  const typeLabel = item.property_type ? (typeLabels[item.property_type] ?? item.property_type) : null;
  const title = item.project?.name || typeLabel || "Нэргүй хөрөнгө";
  const subtitle = item.project?.name ? typeLabel : null;
  const place = [item.district, item.location_text].filter(Boolean).join(" · ");
  const specs = specsText(item);
  const contractAgent =
    item.contract_agent_id && item.contract_agent_id !== item.listing_agent_id ? (names[item.contract_agent_id] ?? null) : null;

  const live = item.status === "active" || item.status === "suspended";
  const left = (live ? daysUntil(item.brokerage_end_date) : null) ?? Infinity;
  const endWarn = left <= END_WARN_DAYS;

  return (
    <Link
      href={href}
      className="group flex min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:border-brand-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:flex-col"
    >
      <div className="relative min-h-28 w-28 shrink-0 bg-surface-2 sm:aspect-[4/3] sm:min-h-0 sm:w-full">
        {item.coverUrl ? (
          // Signed URL (хугацаатай) тул next/image-ээр кэшлэхгүй.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-subtle">
            <ImageOff className="size-6" aria-hidden />
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 hidden flex-wrap gap-1 sm:flex">
          <CategoryBadge category={item.category} labels={categoryLabels} className="shadow-sm" />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <CodeChip code={item.code} />
          <PropertyStatusBadge status={item.status} />
          <CategoryBadge category={item.category} labels={categoryLabels} className="sm:hidden" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink group-hover:text-brand-700">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>

        <Money
          amount={item.price}
          currency={item.currency}
          period={item.price_period}
          basis={item.price_basis}
          total={item.price_total}
          short
          className="text-sm"
          empty="Үнэ оруулаагүй"
        />

        {place ? (
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
        {specs ? <p className="truncate text-xs text-muted">{specs}</p> : null}

        <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
          <AgentChip name={item.listingAgentName} role={contractAgent ? `Листлэгч · гэрээ: ${contractAgent}` : "Листлэгч"} />
          {endWarn ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                left < 0 ? "text-rose-700" : "text-amber-700"
              )}
            >
              <CalendarClock className="size-3.5" aria-hidden />
              {left < 0 ? "Гэрээ дууссан" : left === 0 ? "Гэрээ өнөөдөр дуусна" : `Гэрээ ${left} хоногт дуусна`}
            </span>
          ) : (
            <span className="text-[11px] text-subtle">Бүртгэсэн {fmtDateNum(item.created_at)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

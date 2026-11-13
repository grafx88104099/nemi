import Link from "next/link";
import { MapPin } from "lucide-react";

import { CategoryBadge, PropertyStatusBadge } from "@/components/crm2/ui/badges";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { Money } from "@/components/crm2/ui/money";
import { PROPERTY_TAB_LABEL, PROPERTY_TABS, crm2Paths, type Crm2Panel, type PropertyTab } from "@/lib/crm2/paths";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { propertyTypeLabel, type Crm2Settings } from "@/lib/crm2/settings";
import { cn } from "@/lib/utils";

/** Картын гарчиг: код, төлөв, ангилал, үнэ, байршил (зураг дээрх «P001 Хан-Уул 3 өрөө»). */
export function CardHeader({ detail, settings }: { detail: PropertyDetail; settings: Crm2Settings }) {
  const p = detail.property;
  const cover = detail.media.find((m) => m.kind === "image" && m.is_cover && m.url) ?? detail.media.find((m) => m.kind === "image" && m.url);
  const type = propertyTypeLabel(settings, p.property_type);
  const title = [p.project?.name, p.rooms != null ? `${p.rooms} өрөө` : null, type || null].filter(Boolean).join(" · ") || p.code;
  const place = [p.district, p.location_text].filter(Boolean).join(" · ");

  return (
    <header className="flex min-w-0 gap-3 sm:gap-4">
      {cover?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- хугацаатай signed URL
        <img
          src={cover.url}
          alt=""
          className="hidden size-24 shrink-0 rounded-2xl border border-line object-cover sm:block"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <CodeChip code={p.code} className="px-2 py-1 text-sm" />
          <PropertyStatusBadge status={p.status} />
          <CategoryBadge category={p.category} labels={settings["property.category_labels"]} />
          {p.area_m2 != null ? <span className="text-xs text-muted tabular-nums">{p.area_m2} м²</span> : null}
        </div>
        <h1 className="mt-1.5 break-words text-xl font-extrabold text-ink sm:text-2xl">{title}</h1>
        {place ? (
          <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{place}</span>
          </p>
        ) : null}
        <p className="mt-1 text-base">
          <Money amount={p.price} currency={p.currency} period={p.price_period} basis={p.price_basis} total={p.price_total} />
        </p>
        {p.status !== "active" && p.status_reason ? (
          <p className="mt-1 text-xs text-muted">Төлөвийн шалтгаан: {p.status_reason}</p>
        ) : null}
      </div>
    </header>
  );
}

/** ?tab=... холбоосон табууд (зурагны нэрээр); утсанд хэвтээ гүйлгэнэ. */
export function CardTabsNav({
  panel,
  propertyId,
  active,
  counts,
}: {
  panel: Crm2Panel;
  propertyId: string;
  active: PropertyTab;
  counts?: Partial<Record<PropertyTab, number>>;
}) {
  const paths = crm2Paths(panel);
  return (
    <nav aria-label="Хөрөнгийн картын хэсгүүд" className="-mx-4 border-b border-line px-4 md:mx-0 md:px-0">
      <ul className="flex items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PROPERTY_TABS.map((t) => {
          const on = t === active;
          const count = counts?.[t];
          return (
            <li key={t} className="shrink-0">
              <Link
                href={paths.property(propertyId, t)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition",
                  on ? "border-brand-500 text-brand-700" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
                )}
              >
                {PROPERTY_TAB_LABEL[t]}
                {count ? <span className="rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-muted">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

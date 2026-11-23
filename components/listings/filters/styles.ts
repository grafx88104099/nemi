import {
  ArrowUpDown,
  Briefcase,
  Building2,
  Cctv,
  Fence,
  FerrisWheel,
  House,
  LandPlot,
  Package,
  PawPrint,
  Sofa,
  SquareParking,
  Store,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { FeatureKey } from "@/lib/listing-features";

/**
 * Шүүлтүүрийн нийтлэг класс. Брэндийн товчны хувилбараас үл хамаарах литерал:
 * улбар шар дэвсгэр дээр ink бичвэр (6.17:1), hover #fb923c (7.64:1), ink focus ring.
 * Цайвар дэвсгэр дээр улбар шар бичвэр ХЭЗЭЭ Ч үгүй — холбоос text-brand-700 (#c2410c).
 */
export const CTA =
  "bg-brand-500 text-ink font-semibold hover:bg-[#fb923c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/** Чипийн суурь (≥44px гар утсан дээр). */
export const CHIP =
  "inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap snap-start";

/** Тоо (facet count). */
export const COUNT = "tabular-nums text-muted";

/** Онцлогийн дүрс — маягт, шүүлтүүр, зарын дэлгэрэнгүй нэг толь. */
export const FEATURE_ICON: Record<FeatureKey, LucideIcon> = {
  furnished: Sofa,
  parking: SquareParking,
  elevator: ArrowUpDown,
  balcony: Fence,
  security: Cctv,
  storage: Package,
  kids_playground: FerrisWheel,
  pets_allowed: PawPrint,
};

/** Үл хөдлөхийн төрлийн дүрс (FilterPanelForm B хэсэг). */
export const TYPE_ICON: Record<string, LucideIcon> = {
  "Орон сууц": Building2,
  Хаус: House,
  Газар: LandPlot,
  Оффис: Briefcase,
  "Худалдааны талбай": Store,
  Обьект: Warehouse,
};

import type { PropertyTab } from "@/lib/crm2/paths";
import type { Crm2PropertyDealItem } from "@/lib/crm2/types";

/**
 * Хөрөнгийн картын табын тоо — утсанд дэлгэцээс гадуур (гүйлгэж хүрэх) «Дуудлага», «Үзүүлэлт»,
 * «Хэлцлүүд» табад агуулга байгааг сануулна. crm2_property_deals-ийн (харах эрхтэй хэлцэл) мөрөөс:
 * хэлцлийн тоо, хүчинтэй (хүчингүй болгоогүй) дуудлага, үзүүлэлтийн нийлбэр. Уншиж чадаагүй бол тоогүй
 * (буруу «0»-ийг харуулахгүй); 0 нь тэмдэггүй (CardTabsNav).
 */
export function propertyTabCounts(deals: {
  rows: Pick<Crm2PropertyDealItem, "calls" | "showings">[];
  error: boolean;
}): Partial<Record<PropertyTab, number>> {
  if (deals.error) return {};
  let calls = 0;
  let showings = 0;
  for (const d of deals.rows) {
    calls += d.calls ?? 0;
    showings += d.showings ?? 0;
  }
  return { calls, showings, deals: deals.rows.length };
}

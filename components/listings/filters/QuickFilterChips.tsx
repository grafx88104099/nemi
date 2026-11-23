import Link from "next/link";
import { Check } from "lucide-react";

import { facetCount, quickChipVisible, type ListingFacets } from "@/lib/listing-facets";
import {
  QUICK_CHIPS,
  filtersHref,
  newBuildFrom,
  quickChipActive,
  quickChipLabel,
  toggleQuickChip,
  type ListingFilters,
} from "@/lib/listing-filters";
import { cn } from "@/lib/utils";

import { CHIP } from "./styles";

/**
 * Түргэн шүүлтийн чипүүд (сервер компонент, JS-гүй ажиллана). Чип бүр бусад
 * шүүлтийг хадгалсан сэлгэх холбоос — rel=nofollow (noindex,follow хуудсан дээр
 * facet хослолын мөлхөлтийн урхинаас сэргийлнэ). Тоо = одоогийн шүүлт ∩ чип.
 */
export function QuickFilterChips({
  base,
  f,
  facets,
}: {
  base: "/listings" | "/map";
  f: ListingFilters;
  facets: ListingFacets | null;
}) {
  const newFrom = facets?.newFrom || newBuildFrom();
  const ids = QUICK_CHIPS.filter((id) => quickChipVisible(f, facets, id));
  if (!ids.length) return null;

  return (
    // py-1 (-my-1): overflow-x-auto нь y-г мөн тайрдаг → ring-offset-2 фокусын хүрээ дээд талдаа тайрагдахгүй.
    <ul aria-label="Түргэн шүүлт" className="relative -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 snap-x">
      {ids.map((id) => {
        const on = quickChipActive(f, id);
        const n = facets ? facetCount(facets, id) : null;
        return (
          <li key={id} className="shrink-0">
            <Link
              rel="nofollow"
              href={filtersHref(base, toggleQuickChip(f, id), { withSort: true })}
              className={cn(
                CHIP,
                "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
              )}
            >
              {on ? <Check className="size-4" aria-hidden /> : null}
              <span>{quickChipLabel(id, newFrom)}</span>
              {id === "loan8" ? (
                <span className={cn("text-xs font-medium", on ? "text-white/70" : "text-muted")}>· тооцоолол</span>
              ) : null}
              {n != null ? (
                <>
                  <span aria-hidden className={cn("tabular-nums", on ? "text-white/70" : "text-muted")}>
                    {n}
                  </span>
                  <span className="sr-only">, {n} зар</span>
                </>
              ) : null}
              {on ? <span className="sr-only"> (сонгосон)</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import { X } from "lucide-react";

import { SmartSearchInput } from "@/components/search/SmartSearchInput";
import { FilterPanel, SortSelect } from "@/components/listings/filters/FilterPanel";
import { QuickFilterChips } from "@/components/listings/filters/QuickFilterChips";
import { CTA } from "@/components/listings/filters/styles";
import type { ListingFacets } from "@/lib/listing-facets";
import {
  DEAL_TABS,
  activeFilterChips,
  filtersHref,
  filtersToParams,
  sanitizeDealFlags,
  type ListingFilters,
} from "@/lib/listing-filters";
import { cn } from "@/lib/utils";

/**
 * Нийтийн зарын шүүлтийн самбар — жагсаалт ба газрын зураг хоёулаа ашиглана.
 *
 *  1. Түрээс/Худалдах таб — бусад шүүлтийг хадгалсан, мөлхөгдөх (follow) холбоос + тоо.
 *  2. JS-гүй GET хайлтын маягт: q + бусад бүх шүүлт далд талбараар (өмнө нь шүүх
 *     дарахад deal алга болдог байв) + эрэмбэ. FilterPanel нь энэ маягтын ДОТОР БИШ,
 *     дараах ах дүү элемент — түүний submit/change хайлтын маягтад хүрэхгүй.
 *  3. Түргэн чип (rel=nofollow). 4. Арилгах чипүүд (rel=nofollow) + «Бүгдийг арилгах».
 *
 * Маягт нь каноник href-ээрээ key-тэй: чип, таб, ухаалаг хайлтын redirect зэрэг
 * клиент навигацийн дараа удирдлагагүй талбар бүр шинэ анхдагч утгаар дахин үүснэ.
 * FilterPanel-ийг URL-аар key-лэхгүй: sheet нээгдэх бүрт f-ээс шинээр эхэлдэг тул
 * хэрэггүй, key солигдвол «N зар харах»-ын дараа фокус <body> руу унадаг.
 */
export function SearchFilterBar({
  base,
  f,
  facets = null,
  showSort = false,
  aiSort = false,
}: {
  base: "/listings" | "/map";
  f: ListingFilters;
  facets?: ListingFacets | null;
  showSort?: boolean;
  /** «AI оноо» эрэмбийг санал болгох эсэх (үнэлгээтэй зар байгаа үед л). */
  aiSort?: boolean;
}) {
  const chips = activeFilterChips(base, f);
  const canonical = filtersHref(base, f, { withSort: true });
  const hidden = [...filtersToParams(f).entries()].filter(([k]) => k !== "q");
  const dealSum = facets ? Object.values(facets.deal).reduce((a, b) => a + b, 0) : null;

  return (
    <div className="space-y-3">
      {/* Түрээс / Худалдах */}
      <nav aria-label="Зарын төрөл" className="flex gap-1 rounded-xl bg-surface-2 p-1 sm:inline-flex">
        {DEAL_TABS.map(([v, label]) => {
          const on = (f.deal ?? "") === v;
          const n = facets ? (v ? (facets.deal[v] ?? 0) : dealSum) : null;
          return (
            <Link
              key={label}
              // Зөрчилтэй туг (Худалдаа + урьдчилгаа 1 сар г.м.) хасагдана — үргэлж хоосон хуудас руу биш.
              href={filtersHref(base, sanitizeDealFlags({ ...f, deal: v || undefined, page: undefined }), {
                withSort: true,
              })}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold whitespace-nowrap transition sm:flex-none sm:px-4",
                on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              {label}
              {n != null ? <span className="tabular-nums font-medium text-muted">({n})</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-start gap-2">
        <form
          key={canonical}
          action={base}
          role="search"
          className="flex min-w-0 flex-1 basis-[18rem] flex-wrap gap-2"
        >
          {hidden.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SmartSearchInput
            defaultValue={f.q ?? ""}
            placeholder="Зайсан 2 өрөө, 300 сая хүртэл…"
            ariaLabel="Хайх"
            className="min-w-0 flex-1 basis-48"
            inputClassName="h-11 rounded-xl border-line-control"
          />
          <button type="submit" className={cn(CTA, "h-11 rounded-xl px-5 text-sm")}>
            Хайх
          </button>
          {showSort ? (
            <SortSelect
              value={f.sort ?? "new"}
              aiSort={aiSort}
              className="h-11 rounded-xl border border-line-control bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
            />
          ) : null}
        </form>
        <FilterPanel base={base} f={f} facets={facets} showSort={showSort} aiSort={aiSort} />
      </div>

      <QuickFilterChips base={base} f={f} facets={facets} />

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Сонгосон шүүлт">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              rel="nofollow"
              aria-label={`${c.label} шүүлтийг арилгах`}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 text-sm font-medium text-brand-700 hover:bg-brand-100 sm:min-h-9"
            >
              {c.label} <X className="size-3.5" aria-hidden />
            </Link>
          ))}
          <Link
            href={filtersHref(base, { deal: f.deal, sort: f.sort }, { withSort: true })}
            rel="nofollow"
            className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-2 hover:text-ink hover:underline sm:min-h-9"
          >
            Бүгдийг арилгах
          </Link>
        </div>
      ) : null}
    </div>
  );
}

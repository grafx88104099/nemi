import Link from "next/link";
import { X } from "lucide-react";

import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";
import {
  DEAL_TABS,
  POSTED_OPTIONS,
  SORT_OPTIONS,
  activeFilterChips,
  filtersHref,
  type ListingFilters,
} from "@/lib/listing-filters";
import { cn } from "@/lib/utils";

const field =
  "h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none";

/**
 * Нийтийн зарын шүүлтийн самбар — жагсаалт ба газрын зураг хоёулаа ашиглана.
 * JS-гүй GET маягт: Түрээс/Худалдах таб нь холбоос, маягт нь `deal`-ийг
 * далд талбараар хадгална (өмнө нь шүүх дарахад алга болдог байв).
 */
export function SearchFilterBar({
  base,
  f,
  showSort = false,
  aiSort = false,
}: {
  base: "/listings" | "/map";
  f: ListingFilters;
  showSort?: boolean;
  /** «AI оноо» эрэмбийг санал болгох эсэх (үнэлгээтэй зар байгаа үед л). */
  aiSort?: boolean;
}) {
  const chips = activeFilterChips(base, f);
  const sorts = SORT_OPTIONS.filter(([v]) => v !== "ai" || aiSort || f.sort === "ai");

  return (
    <div className="space-y-3">
      {/* Түрээс / Худалдах */}
      <nav aria-label="Зарын төрөл" className="flex gap-1 rounded-xl bg-surface-2 p-1 sm:inline-flex">
        {DEAL_TABS.map(([v, label]) => {
          const on = (f.deal ?? "") === v;
          return (
            <Link
              key={label}
              href={filtersHref(base, { ...f, deal: v || undefined }, { withSort: true })}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-lg px-5 text-sm font-semibold transition sm:flex-none",
                on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <form
        action={base}
        className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-4 lg:grid-cols-6"
      >
        {f.deal ? <input type="hidden" name="deal" value={f.deal} /> : null}
        <input
          name="q"
          defaultValue={f.q ?? ""}
          placeholder="Гарчгаар хайх..."
          aria-label="Гарчгаар хайх"
          className={cn(field, "col-span-2")}
        />
        <select name="district" defaultValue={f.district ?? ""} aria-label="Дүүрэг" className={field}>
          <option value="">Бүх дүүрэг</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="type" defaultValue={f.type ?? ""} aria-label="Төрөл" className={field}>
          <option value="">Бүх төрөл</option>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="rooms" defaultValue={f.rooms ? String(f.rooms) : ""} aria-label="Өрөө" className={field}>
          <option value="">Өрөө</option>
          {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}+ өрөө</option>)}
        </select>
        <select name="posted" defaultValue={f.posted ? String(f.posted) : ""} aria-label="Нийтэлсэн хугацаа" className={field}>
          <option value="">Бүх хугацаа</option>
          {POSTED_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input name="minPrice" inputMode="numeric" defaultValue={f.minPrice ?? ""} placeholder="Үнэ доод (₮)" aria-label="Үнэ доод" className={field} />
        <input name="maxPrice" inputMode="numeric" defaultValue={f.maxPrice ?? ""} placeholder="Үнэ дээд (₮)" aria-label="Үнэ дээд" className={field} />
        <input name="minArea" inputMode="decimal" defaultValue={f.minArea ?? ""} placeholder="Талбай доод (м²)" aria-label="Талбай доод" className={field} />
        <input name="maxArea" inputMode="decimal" defaultValue={f.maxArea ?? ""} placeholder="Талбай дээд (м²)" aria-label="Талбай дээд" className={field} />
        {showSort ? (
          <select name="sort" defaultValue={f.sort ?? "new"} aria-label="Эрэмбэ" className={field}>
            {sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : null}
        <button
          type="submit"
          className={cn(
            "h-11 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600",
            showSort ? "" : "col-span-2 md:col-span-1"
          )}
        >
          Шүүх
        </button>
      </form>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Сонгосон шүүлт">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              aria-label={`${c.label} шүүлтийг арилгах`}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              {c.label} <X className="size-3.5" aria-hidden />
            </Link>
          ))}
          <Link
            href={filtersHref(base, { deal: f.deal, sort: f.sort }, { withSort: true })}
            className="inline-flex min-h-9 items-center px-2 text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Бүгдийг арилгах
          </Link>
        </div>
      ) : null}
    </div>
  );
}

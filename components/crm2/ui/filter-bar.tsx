"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * URL-д суурилсан шүүлтүүрийн хэсгүүд (S01 Staff, харилцагчид, миний ажил).
 * Хуудас нь `searchParams`-аа await хийгээд энгийн объектоор `params`-д өгнө (FilterBar
 * эсвэл бүх жагсаалтыг ороосон FilterProvider-т) —
 * useSearchParams ашиглахгүй тул Suspense шаардлагагүй. Утга өөрчлөгдөхөд
 * `page`-ийг хасаж router.replace хийнэ (түүхэнд мөр нэмэхгүй).
 *
 *   <FilterBar params={sp}>
 *     <FilterSearch placeholder="Төсөл, байршил, түлхүүр үг" />
 *     <FilterSelect name="category" label="Ангилал" options={…} />
 *     <FilterChips name="view" options={…} defaultValue="active" />
 *     <FilterClear keys={["q", "category"]} />
 *   </FilterBar>
 */

export type FilterParams = Record<string, string | string[] | undefined>;
export type FilterOption = { value: string; label: string };

type Ctx = {
  get: (name: string) => string;
  set: (patch: Record<string, string | null | undefined>) => void;
  pending: boolean;
};

const FilterCtx = React.createContext<Ctx | null>(null);

function toSearchParams(params: FilterParams | URLSearchParams | undefined): URLSearchParams {
  if (params instanceof URLSearchParams) return new URLSearchParams(params);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  return sp;
}

/** Шүүлтүүрийн утга унших/бичих (FilterBar дотор). */
export function useFilters(): Ctx {
  const ctx = React.useContext(FilterCtx);
  if (!ctx) throw new Error("useFilters нь <FilterBar> дотор ашиглагдана");
  return ctx;
}

/**
 * Шүүлтүүрийн контекст (URL параметр). Хуудаслагч зэрэг FilterBar-аас гадуурх
 * хэсэгт бүх жагсаалтыг үүгээр ороож, FilterBar-д params өгөхгүй байж болно.
 */
export function FilterProvider({ params, children }: { params: FilterParams | URLSearchParams | undefined; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();
  const current = React.useMemo(() => toSearchParams(params), [params]);

  const value = React.useMemo<Ctx>(
    () => ({
      pending,
      get: (name) => current.get(name) ?? "",
      set: (patch) => {
        const sp = new URLSearchParams(current);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined || v === "") sp.delete(k);
          else sp.set(k, v);
        }
        if (!("page" in patch)) sp.delete("page");
        const qs = sp.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      },
    }),
    [current, pathname, pending, router]
  );

  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

function BarLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFilters();
  return (
    <div
      role="search"
      aria-busy={pending}
      className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", pending && "opacity-80", className)}
    >
      {children}
    </div>
  );
}

/** Шүүлтүүрийн мөр. params өгвөл өөрөө FilterProvider болно; эс бөгөөс гаднах провайдерыг ашиглана. */
export function FilterBar({
  params,
  children,
  className,
}: {
  params?: FilterParams | URLSearchParams;
  children: React.ReactNode;
  className?: string;
}) {
  const outer = React.useContext(FilterCtx);
  const bar = <BarLayout className={className}>{children}</BarLayout>;
  if (params !== undefined || !outer) return <FilterProvider params={params}>{bar}</FilterProvider>;
  return bar;
}

/** Түлхүүр үгийн хайлт (debounce). */
export function FilterSearch({
  name = "q",
  placeholder = "Хайх",
  debounceMs = 350,
  className,
  label = "Хайх",
}: {
  name?: string;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  label?: string;
}) {
  const { get, set } = useFilters();
  const urlValue = get(name);
  const [value, setValue] = React.useState(urlValue);
  // URL гаднаас өөрчлөгдвөл (цэвэрлэх г.м.) оруулгыг тааруулна.
  const [prevUrl, setPrevUrl] = React.useState(urlValue);
  if (urlValue !== prevUrl) {
    setPrevUrl(urlValue);
    setValue(urlValue);
  }

  React.useEffect(() => {
    if (value.trim() === urlValue.trim()) return;
    const t = window.setTimeout(() => set({ [name]: value.trim() || null }), debounceMs);
    return () => window.clearTimeout(t);
  }, [value, urlValue, name, debounceMs, set]);

  return (
    <div className={cn("relative w-full sm:min-w-56 sm:flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            set({ [name]: value.trim() || null });
          }
        }}
        className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-11 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Хайлт цэвэрлэх"
          onClick={() => {
            setValue("");
            set({ [name]: null });
          }}
          className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Сонголттой шүүлтүүр (native select). allLabel — «бүгд» сонголт (утгагүй). */
export function FilterSelect({
  name,
  label,
  options,
  allLabel = "Бүгд",
  allValue = "",
  defaultValue = "",
  className,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  allLabel?: string | null;
  /** «Бүгд» сонголтын утга (анхдагч нь хоосон — параметрийг хасна). */
  allValue?: string;
  /** URL-д утгагүй үед харагдах сонголт (түүнийг сонгоход параметрийг хасна). */
  defaultValue?: string;
  className?: string;
}) {
  const { get, set } = useFilters();
  return (
    <Select
      aria-label={label}
      value={get(name) || defaultValue}
      onChange={(e) => {
        const v = e.target.value;
        set({ [name]: !v || v === defaultValue ? null : v });
      }}
      className={cn("w-full sm:w-auto sm:min-w-44", className)}
    >
      {allLabel !== null ? <option value={allValue}>{`${label}: ${allLabel}`}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * Товчлуурт сонголт (харагдац: Идэвхтэй / Архив / Ноорог …). defaultValue — URL-д
 * утгагүй үед идэвхтэй харагдах сонголт (түүнийг сонгоход параметрийг хасна).
 */
export function FilterChips({
  name,
  options,
  defaultValue = "",
  label,
  className,
}: {
  name: string;
  options: (FilterOption & { count?: number })[];
  defaultValue?: string;
  label?: string;
  className?: string;
}) {
  const { get, set } = useFilters();
  const active = get(name) || defaultValue;
  return (
    <div role="group" aria-label={label} className={cn("flex gap-1 overflow-x-auto pb-0.5", className)}>
      {options.map((o) => {
        const on = o.value === active;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => set({ [name]: o.value === defaultValue ? null : o.value })}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition sm:h-9",
              on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className="text-xs tabular-nums opacity-80">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Сонгосон шүүлтүүрийг цэвэрлэх (аль нэг нь идэвхтэй үед л харагдана). */
export function FilterClear({ keys, label = "Цэвэрлэх", className }: { keys: string[]; label?: string; className?: string }) {
  const { get, set } = useFilters();
  if (!keys.some((k) => get(k))) return null;
  return (
    <button
      type="button"
      onClick={() => set(Object.fromEntries(keys.map((k) => [k, null])))}
      className={cn(
        "inline-flex h-11 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink sm:h-9 sm:self-auto",
        className
      )}
    >
      <X className="size-4" aria-hidden />
      {label}
    </button>
  );
}

/** Хуудаслалт (өмнөх / дараах), ?page= параметрээр. */
export function FilterPager({ page, pageCount, className }: { page: number; pageCount: number; className?: string }) {
  const { set, pending } = useFilters();
  if (pageCount <= 1) return null;
  const go = (p: number) => set({ page: p <= 1 ? null : String(p) });
  return (
    <nav aria-label="Хуудаслалт" className={cn("flex items-center justify-between gap-2 pt-2", className)}>
      <button
        type="button"
        disabled={page <= 1 || pending}
        onClick={() => go(page - 1)}
        className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50 sm:h-9"
      >
        Өмнөх
      </button>
      <span className="text-sm tabular-nums text-muted">
        {page} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount || pending}
        onClick={() => go(page + 1)}
        className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50 sm:h-9"
      >
        Дараах
      </button>
    </nav>
  );
}

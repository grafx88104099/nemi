"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import { dialogOpener, focusDialogStart, trapTab } from "@/components/ui/dialog-focus";
import { createClient } from "@/lib/supabase/client";
import {
  compactRpcArgs,
  facetQueryKey,
  filterRpcArgs,
  formDataParams,
  parseFacets,
  type ListingFacets,
} from "@/lib/listing-facets";
import {
  SORT_OPTIONS,
  activeFilterCount,
  filtersHref,
  parseListingFilters,
  type ListingFilters,
} from "@/lib/listing-filters";
import { cn } from "@/lib/utils";

import { FilterPanelForm } from "./FilterPanelForm";

const DEBOUNCE_MS = 250;

const noopSubscribe = () => () => {};
/** Hydration-ийн дараа л true (SSR ба анхны клиент рендер = false → <details>). */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

const trigger =
  "min-h-11 inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/**
 * «Шүүлтүүр» — JS-гүй АЮУЛГҮЙ.
 *  - SSR ба hydration-оос өмнө: <details> дотор бүтэн GET маягт (хөтөч өөрөө нээж/илгээнэ).
 *  - Hydration-ийн дараа: type=button товч → portal sheet (md+ төвд modal, доор bottom sheet),
 *    ижил FilterPanelForm; Escape хаана, фокус хоригдож буцна, body гүйлгэгдэхгүй.
 * Амьд тоо: маягт өөрчлөгдөх бүрт 250 мс debounce → listing_facets RPC (хуучирсан хариуг хаяна).
 * Анхны тоо нь SSR facets (нээхэд хүсэлт явуулахгүй). Хүлээгдэж буй үед тоо бүдгэрч «Тоолж байна…»,
 * тэг-идэвхгүй түр зогсоно; RPC алдаа → тоо нуугдаж «Тоо шинэчлэгдсэнгүй», «Зар харах».
 */
export function FilterPanel({
  base,
  f,
  facets,
}: {
  base: "/listings" | "/map";
  f: ListingFilters;
  facets: ListingFacets | null;
  /** SearchFilterBar-тай ижил гарын үсэг (эрэмбэ нь хайлтын маягтад). */
  showSort?: boolean;
  aiSort?: boolean;
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(f);
  const label = (
    <>
      <SlidersHorizontal className="size-4" aria-hidden />
      Шүүлтүүр
      {count > 0 ? <span className="tabular-nums">({count})</span> : null}
    </>
  );

  if (!hydrated) {
    return (
      <details className="group w-full rounded-2xl sm:w-auto open:basis-full open:sm:w-full">
        <summary className={cn(trigger, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>{label}</summary>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <FilterPanelForm base={base} f={f} facets={facets} />
        </div>
      </details>
    );
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={trigger}>
        {label}
      </button>
      {open ? createPortal(<FilterSheet base={base} f={f} facets={facets} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function FilterSheet({
  base,
  f,
  facets: initialFacets,
  onClose,
}: {
  base: "/listings" | "/map";
  f: ListingFilters;
  facets: ListingFacets | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  // Маягтын анхдагч утга (URL-ийн f; «Арилгах» дарахад цэвэр) ба remount key.
  const [defaults, setDefaults] = useState<ListingFilters>(f);
  const [formKey, setFormKey] = useState(0);
  const [cur, setCur] = useState<ListingFilters>(f);
  const [facets, setFacets] = useState<ListingFacets | null>(initialFacets);
  // facets аль сонголтод тооцоологдсон бэ — cur-тэй таарахгүй бол тоо «хүлээгдэж буй».
  const [facetsFor, setFacetsFor] = useState(() => facetQueryKey(f));
  const [stale, setStale] = useState(false);
  const pending = facets != null && !stale && facetQueryKey(cur) !== facetsFor;
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Ref объектуудыг (утгыг биш) барина — хаахад хүлээгдэж буй debounce/хариуг хүчингүй болгоно.
    const pending = timer;
    const requests = reqId;
    const prevFocus = dialogOpener(panelRef.current);
    focusDialogStart(panelRef.current);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") trapTab(e, panelRef.current);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (pending.current) clearTimeout(pending.current);
      requests.current++;
      if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
    };
  }, []);

  const readForm = useCallback((): ListingFilters | null => {
    const form = formRef.current;
    return form ? parseListingFilters(formDataParams(new FormData(form))) : null;
  }, []);

  const refresh = useCallback(
    async (next: ListingFilters) => {
      const id = ++reqId.current;
      try {
        supabase.current ??= createClient();
        const { data, error } = await supabase.current.rpc(
          "listing_facets",
          compactRpcArgs({ ...filterRpcArgs(next), p_has_location: base === "/map" })
        );
        if (id !== reqId.current) return;
        const parsed = error ? null : parseFacets(data);
        if (!parsed) {
          setStale(true);
          return;
        }
        setFacets(parsed);
        setFacetsFor(facetQueryKey(next));
        setStale(false);
      } catch {
        if (id === reqId.current) setStale(true);
      }
    },
    [base]
  );

  function onChange(e: React.FormEvent<HTMLFormElement>) {
    // Portal-ын React synthetic үйл явдал эцэг модоор (хайлтын маягт руу) дээшлэхгүй.
    e.stopPropagation();
    const next = readForm();
    if (!next) return;
    setCur(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(next), DEBOUNCE_MS);
  }

  /**
   * «Арилгах» (sheet): URL-аас үл хамааран маягтыг цэвэрлэнэ (deal, эрэмбэ үлдэнэ —
   * JS-гүй холбоостой ижил), тоог шинэчилж, sheet нээлттэй үлдэнэ. Маягт key-ээр
   * дахин үүсэх тул фокусыг шинэ «Арилгах» товч руу буцаана (доорх effect).
   */
  function onReset() {
    const next = parseListingFilters({ deal: f.deal, sort: f.sort });
    setDefaults(next);
    setCur(next);
    setFormKey((k) => k + 1);
    if (timer.current) clearTimeout(timer.current);
    void refresh(next);
  }

  useEffect(() => {
    if (formKey === 0) return;
    panelRef.current?.querySelector<HTMLElement>("[data-filter-reset]")?.focus({ preventScroll: true });
  }, [formKey]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.stopPropagation();
    const next = readForm();
    if (!next) return; // JS-гүй мэт хөтөч өөрөө илгээнэ
    e.preventDefault();
    // Каноник URL (хоосон талбаргүй, дүүрэг таслалаар) — хуудас 1-ээс.
    router.push(filtersHref(base, { ...next, page: undefined }, { withSort: true }));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Хаах" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[24px] bg-surface px-4 pb-[env(safe-area-inset-bottom)] shadow-xl outline-none sm:px-6",
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[calc(100%-2rem)] md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet"
        )}
      >
        <div className="sticky top-0 z-10 -mx-4 flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:-mx-6 sm:px-6">
          <h2 id={titleId} className="text-base font-bold text-ink">
            Шүүлтүүр
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            data-dialog-close
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="pt-4">
          <FilterPanelForm
            key={formKey}
            base={base}
            f={defaults}
            cur={cur}
            facets={facets}
            countsStale={stale}
            countsPending={pending}
            sticky
            formRef={formRef}
            onChange={onChange}
            onSubmit={onSubmit}
            onReset={onReset}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Эрэмбийн сонголт (хайлтын маягт дотор). Хулгана/хүрэлтээр сонгомогц requestSubmit.
 * Гараар (сум) сольсон утгыг ШУУД илгээхгүй (WCAG 3.2.2 — Windows-д хаалттай select
 * дээр сум бүр change өгдөг) — Enter эсвэл «Хайх» товчоор хэрэгжинэ.
 * JS-гүй үед маягтын «Хайх» товч илгээнэ.
 */
export function SortSelect({
  value,
  aiSort,
  className,
}: {
  value: string;
  aiSort: boolean;
  className?: string;
}) {
  const sorts = SORT_OPTIONS.filter(([v]) => v !== "ai" || aiSort || value === "ai");
  const keyboard = useRef(false);
  const dirty = useRef(false);
  return (
    <select
      name="sort"
      defaultValue={value}
      aria-label="Эрэмбэ"
      onPointerDown={() => {
        keyboard.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (dirty.current) {
            e.preventDefault();
            dirty.current = false;
            e.currentTarget.form?.requestSubmit();
          }
          return;
        }
        keyboard.current = true;
      }}
      onChange={(e) => {
        if (keyboard.current) {
          dirty.current = true;
          return;
        }
        e.currentTarget.form?.requestSubmit();
      }}
      className={className}
    >
      {sorts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { searchListingsForLead } from "@/lib/actions/crm-lead-listing";
import { DEAL_TYPE_LABEL } from "@/lib/constants";
import {
  LEAD_LISTING_SEARCH_LIMIT,
  listingPriceLabel,
  listingSpecLabel,
  type LeadListingOption,
  type LeadListingSnapshot,
} from "@/lib/crm/lead-listing";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

export function ListingThumb({
  photo,
  className,
  sizes = "56px",
}: {
  photo: string | null;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-subtle", className)}>
      {photo ? <Image src={photo} alt="" fill sizes={sizes} className="object-cover" /> : <Building2 className="size-1/2" aria-hidden />}
    </div>
  );
}

export function ListingLines({
  listing,
  fullTitle = false,
}: {
  listing: Omit<LeadListingSnapshot, "captured_at"> & { office_name?: string | null };
  fullTitle?: boolean;
}) {
  const meta = [listingSpecLabel(listing), listing.office_name].filter(Boolean).join(" · ");
  return (
    <>
      <div className={cn("text-sm font-semibold text-ink", fullTitle ? "break-words" : "truncate")}>{listing.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold text-ink">{listingPriceLabel(listing)}</span>
        <Badge tone={listing.deal_type === "rent" ? "blue" : "brand"}>{DEAL_TYPE_LABEL[listing.deal_type]}</Badge>
      </div>
      {meta ? <div className={cn("mt-0.5 text-xs text-muted", !fullTitle && "truncate")}>{meta}</div> : null}
    </>
  );
}

/**
 * nemi.mn-ийн идэвхтэй зараас сонгох. Үр дүн нь модалын их биед багтаж
 * гүйлгэгдэхийн тулд хөвөгч биш, урсгал дотроо харагдана.
 */
export function ListingPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: LeadListingOption | null;
  onChange: (listing: LeadListingOption | null) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const moveFocus = useRef(false);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LeadListingOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);

  const options = results ?? [];
  const showList = open && !disabled;

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const timer = setTimeout(
      async () => {
        setSearching(true);
        try {
          const next = await searchListingsForLead(query);
          if (stale) return;
          setResults(next);
          setFailed(false);
          setActive(-1);
        } catch {
          if (!stale) setFailed(true);
        } finally {
          if (!stale) setSearching(false);
        }
      },
      query.trim() ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  // Blur нь mousedown дээр болдог: тэр үед хаавал доорх элементүүд дээш үсэрч click
  // алдагдана, тиймээс click-ийн дараа хаана. Modal click-ийг зогсоодог тул capture шатанд.
  useEffect(() => {
    if (!open) return;
    function onDocumentClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [open]);

  // Input/карт солигдоход фокус алдагдаж модалын Tab хавхнаас гарахаас сэргийлнэ.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (value ? changeRef : inputRef).current?.focus();
  }, [value]);

  function choose(listing: LeadListingOption) {
    moveFocus.current = true;
    setOpen(false);
    setQuery("");
    onChange(listing);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && showList) {
      // React-ийн root ба Modal-ын Escape сонсогч хоёулаа document дээр тул
      // stopPropagation хангалтгүй — эс бөгөөс маягт бүхэлдээ хаагдана.
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next =
        active === -1 ? (step === 1 ? 0 : options.length - 1) : (active + step + options.length) % options.length;
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" && showList && options[active]) {
      e.preventDefault();
      choose(options[active]);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-2">
        <ListingThumb photo={value.photo} className="size-14" />
        <div className="min-w-0 flex-1">
          <ListingLines listing={value} />
        </div>
        <button
          ref={changeRef}
          type="button"
          disabled={disabled}
          onClick={() => {
            moveFocus.current = true;
            onChange(null);
          }}
          className="h-11 shrink-0 rounded-lg px-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:pointer-events-none disabled:opacity-50"
        >
          Солих
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input
          ref={inputRef}
          role="combobox"
          aria-label="Зар хайх"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder="Гарчиг, дүүрэг, төрлөөр хайх…"
          className="pl-9 pr-9"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {searching && showList ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle" aria-hidden />
        ) : null}
      </div>

      {showList ? (
        // Жагсаалт дээр дарахад input фокусаа алдахгүй (гарын удирдлага үргэлжилнэ).
        <div className="mt-1.5 overflow-hidden rounded-xl border border-line bg-surface" onMouseDown={(e) => e.preventDefault()}>
          {failed ? (
            <p className="px-3 py-3 text-sm text-danger" role="alert">
              Зар хайхад алдаа гарлаа. Дахин оролдоно уу.
            </p>
          ) : results === null ? (
            <p className="px-3 py-3 text-sm text-muted">Хайж байна…</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">{searching ? "Хайж байна…" : "Тохирох идэвхтэй зар олдсонгүй."}</p>
          ) : (
            <>
              <ul ref={listRef} id={listId} role="listbox" aria-label="Зарын жагсаалт" className="max-h-64 divide-y divide-line overflow-y-auto overscroll-contain">
                {options.map((o, i) => (
                  <li
                    key={o.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex cursor-pointer items-center gap-3 p-2", i === active && "bg-surface-2")}
                  >
                    <ListingThumb photo={o.photo} className="size-14" />
                    <div className="min-w-0 flex-1">
                      <ListingLines listing={o} />
                    </div>
                  </li>
                ))}
              </ul>
              {options.length >= LEAD_LISTING_SEARCH_LIMIT ? (
                <p className="border-t border-line px-3 py-1.5 text-xs text-subtle">
                  Эхний {LEAD_LISTING_SEARCH_LIMIT} зар харагдаж байна — хайлтаа тодруулна уу.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

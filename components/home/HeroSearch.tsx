"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { SmartSearchInput } from "@/components/search/SmartSearchInput";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TabId = "sale" | "rent" | "post";

export const HERO_TABS: readonly { id: TabId; label: string }[] = [
  { id: "sale", label: "Зарах" },
  { id: "rent", label: "Түрээслэх" },
  { id: "post", label: "Зар өгөх" },
];

/** Эргэлддэг жишээ (SSR placeholder = эхнийх). */
export const HERO_EXAMPLES = [
  "Хан-Уул, 2 өрөө, 250 сая хүртэл",
  "Зайсан орчим түрээс, сард 3 сая хүртэл",
  "15-р хороолол, 8%-ийн зээлд тохирох",
] as const;

const ROTATE_MS = 3500;
const MAX_CYCLES = 3;

const tabId = (t: TabId) => `hero-tab-${t}`;
const panelId = (t: TabId) => (t === "post" ? "hero-panel-post" : "hero-panel-search");

/**
 * Нүүрний hero хайлт. SSR-ийн өгөгдмөл таб «Зарах» → JS-гүй ч GET /listings?deal=sale&q=…
 * маягт ажиллана. «Зарах»/«Түрээслэх» нэг маягт (зөвхөн hidden deal өөр) — бичсэн
 * текст таб солиход үлдэнэ. Табууд: roving tabindex + ←/→/Home/End (автомат идэвхжүүлэлт).
 * Идэвхтэй табын тэмдэг ink (16:1) — улбар шар (2.80:1) БИШ.
 *
 * Placeholder: SSR-д HERO_EXAMPLES[0]. Mount-ийн дараа placeholder attribute-ийг
 * хоосолж aria-hidden давхаргаар 3.5 с тутам солино — зөвхөн input хоосон, фокусгүй
 * үед. Анхны фокус, 3 бүтэн эргэлт, эсвэл prefers-reduced-motion үед бүрмөсөн зогсоож
 * attribute-ийг сэргээнэ (reduced-motion үед огт эргэлдэхгүй).
 */
export function HeroSearch() {
  const [tab, setTab] = useState<TabId>("sale");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ sale: null, rent: null, post: null });

  const wrapRef = useRef<HTMLDivElement>(null);
  const [rotating, setRotating] = useState(false);
  const [idx, setIdx] = useState(0);
  const [empty, setEmpty] = useState(true);
  const [focused, setFocused] = useState(false);

  // Mount: reduced-motion биш бол эргэлтийг эхлүүлнэ (hydration-оос өмнө бичсэн утгыг шалгана).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const input = wrapRef.current?.querySelector("input");
    if (input && document.activeElement === input) return; // аль хэдийн фокустай — эргэлт хэрэггүй
    setEmpty(!input?.value);
    setRotating(true);
  }, []);

  useEffect(() => {
    if (!rotating) return;
    let steps = 0;
    const t = window.setInterval(() => {
      steps++;
      setIdx((i) => (i + 1) % HERO_EXAMPLES.length);
      if (steps >= MAX_CYCLES * HERO_EXAMPLES.length) {
        window.clearInterval(t);
        setRotating(false);
      }
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [rotating]);

  function selectTab(t: TabId, focus = false) {
    setTab(t);
    if (focus) tabRefs.current[t]?.focus();
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = HERO_TABS.findIndex((x) => x.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % HERO_TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + HERO_TABS.length) % HERO_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = HERO_TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(HERO_TABS[next].id, true);
  }

  const showOverlay = rotating && empty && !focused;
  const example = HERO_EXAMPLES[idx];
  const deal = tab === "rent" ? "rent" : "sale";

  return (
    <div className="w-full max-w-2xl">
      <div role="tablist" aria-label="Юу хайж байна вэ?" className="flex gap-1">
        {HERO_TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(t.id)}
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(t.id)}
              onKeyDown={onTabKey}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-t-lg px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                selected ? "font-bold text-ink" : "font-semibold text-muted hover:text-ink"
              )}
            >
              {t.label}
              {selected ? (
                <span aria-hidden data-tab-indicator className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Хоёр tabpanel үргэлж DOM-д (идэвхгүй нь hidden) — tab бүрийн aria-controls бодит
          tabpanel руу заана; хайлтын <form role="search"> нь tabpanel-ийн дотор. */}
      <div className="rounded-card bg-surface p-2 shadow-md sm:p-3">
        <div
          id={panelId("post")}
          role="tabpanel"
          aria-labelledby={tabId("post")}
          hidden={tab !== "post"}
          className="space-y-2 p-1"
        >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/sell/new?deal=sale" className={buttonClasses("cta", "lg", "min-h-11 flex-1")}>
                Байраа зарах
              </Link>
              <Link
                href="/sell/new?deal=rent"
                className={cn(
                  "inline-flex h-12 min-h-11 flex-1 items-center justify-center rounded-xl bg-ink px-6 text-base font-semibold text-white transition hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                )}
              >
                Түрээслүүлэх
              </Link>
            </div>
            <Link
              href="/my-home"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Үнэлгээ үнэгүй
            </Link>
        </div>
        <div id={panelId("sale")} role="tabpanel" aria-labelledby={tabId(tab === "rent" ? "rent" : "sale")} hidden={tab === "post"}>
          <form
            role="search"
            aria-labelledby={tabId(tab === "rent" ? "rent" : "sale")}
            action="/listings"
            method="get"
            className="flex items-center gap-2 rounded-xl has-[input:focus]:ring-2 has-[input:focus]:ring-focus"
          >
            <input type="hidden" name="deal" value={deal} />
            <Search className="ml-2 size-5 shrink-0 text-muted" aria-hidden />
            <div
              ref={wrapRef}
              className="relative min-w-0 flex-1"
              onFocusCapture={() => {
                setFocused(true);
                setRotating(false); // анхны фокус → бүрмөсөн зогсоно, placeholder сэргэнэ
              }}
              onBlurCapture={() => setFocused(false)}
              onInputCapture={(e) => setEmpty(!(e.target as HTMLInputElement).value)}
            >
              <SmartSearchInput
                name="q"
                ariaLabel="Хайх"
                placeholder={rotating ? "" : example}
                className="min-w-0 flex-1"
                inputClassName="h-12 border-0 bg-transparent px-1 text-base focus:ring-0"
              />
              {showOverlay ? (
                <span
                  aria-hidden
                  key={idx}
                  className="pointer-events-none absolute inset-y-0 left-1 right-1 flex items-center truncate text-base text-muted"
                >
                  {example}
                </span>
              ) : null}
            </div>
            <button type="submit" className={buttonClasses("cta", "lg", "h-12 shrink-0 rounded-xl px-6")}>
              Хайх
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
